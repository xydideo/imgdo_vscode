import type {
  AppSettings,
  CompressResultItem,
  HostToWebview,
  ImageItem,
  ScanSummary,
  WebviewToHost,
} from '../panel/messages';
import { DEFAULT_SETTINGS } from '../panel/messages';
import {
  formatTargetWidth,
  isTargetSizeModified,
  parseTargetWidthInput,
} from '../scan/targetSize';

declare function acquireVsCodeApi(): {
  postMessage(msg: WebviewToHost): void;
};

const vscode = acquireVsCodeApi();

type Page = 'entry' | 'list' | 'compare' | 'scanning' | 'compressing';
type ResultTab = 'replace' | 'large';

interface State {
  page: Page;
  canScanWorkspace: boolean;
  workspaceLabel?: string;
  settings: AppSettings;
  items: ImageItem[];
  summary?: ScanSummary;
  listTab: 'all' | 'tree';
  results: CompressResultItem[];
  resultTab: ResultTab;
  compareIndex: number;
  settingsOpen: boolean;
  previewItem?: ImageItem | CompressResultItem;
  /** 对比结果预览时：原图 / 压缩图 */
  previewWhich: 'original' | 'compressed';
  /** 预览是否按 100% 实际像素展示 */
  previewActualSize: boolean;
  confirm?: {
    title: string;
    message: string;
    confirmText: string;
    onConfirm: () => void;
    /** 换格式替换提示行：from → to（相对路径） */
    formatChanges?: Array<{ from: string; to: string }>;
  };
  toast?: { level: 'info' | 'warn' | 'error'; message: string };
  /** 顶部居中提示 */
  banner?: { message: string };
  progress?: { done: number; total: number; message?: string };
  /** 当前这张图已用时（秒），每张从 0 计 */
  compressElapsedSec: number;
  /** 单张较慢时的提示文案（按耗时阶段切换） */
  compressSlowHint?: string;
  dropHint?: string;
  replaceReport?: {
    message: string;
    backupPath?: string;
    items: Array<{ name: string; relativePath: string; originalSize: number; compressedSize: number }>;
  };
}

const state: State = {
  page: 'entry',
  canScanWorkspace: false,
  settings: { ...DEFAULT_SETTINGS },
  items: [],
  listTab: 'all',
  results: [],
  resultTab: 'replace',
  compareIndex: 0,
  settingsOpen: false,
  previewWhich: 'compressed',
  previewActualSize: false,
  compressElapsedSec: 0,
  compressSlowHint: undefined,
};

const app = document.getElementById('app')!;

const SLOW_HINT_SEC = 10;
let itemTimerKey: string | undefined;
let itemTimerStartedAt = 0;
let itemTimerTick: number | undefined;

function slowHintForSeconds(sec: number): string | undefined {
  if (sec >= 40) {
    return '受不了了，下个版本我给你优化程序！';
  }
  if (sec >= 30) {
    return '要不你喝口水';
  }
  if (sec >= 25) {
    return '快好了～';
  }
  if (sec >= 20) {
    return '这张是真的慢';
  }
  if (sec >= 15) {
    return '程序真没崩';
  }
  if (sec >= SLOW_HINT_SEC) {
    return '程序没崩，这张比较慢，请等下';
  }
  return undefined;
}

function clearCompressItemTimer() {
  if (itemTimerTick != null) {
    window.clearInterval(itemTimerTick);
    itemTimerTick = undefined;
  }
  itemTimerKey = undefined;
  itemTimerStartedAt = 0;
  state.compressElapsedSec = 0;
  state.compressSlowHint = undefined;
}

/** 每张图从 0 重新计时；超时后按阶段切换慢图提示 */
function ensureCompressItemTimer(key: string | undefined) {
  if (!key || key === '完成' || key === '正在取消…') {
    if (key === '完成') {
      clearCompressItemTimer();
    } else if (key === '正在取消…' && itemTimerTick != null) {
      window.clearInterval(itemTimerTick);
      itemTimerTick = undefined;
    }
    return;
  }
  if (itemTimerKey === key) {
    return;
  }
  if (itemTimerTick != null) {
    window.clearInterval(itemTimerTick);
  }
  itemTimerKey = key;
  itemTimerStartedAt = Date.now();
  state.compressElapsedSec = 0;
  state.compressSlowHint = undefined;

  itemTimerTick = window.setInterval(() => {
    if (state.page !== 'compressing' || !itemTimerKey) {
      clearCompressItemTimer();
      return;
    }
    const sec = Math.floor((Date.now() - itemTimerStartedAt) / 1000);
    const hint = slowHintForSeconds(sec);
    const prev = state.compressSlowHint;
    state.compressElapsedSec = sec;
    state.compressSlowHint = hint;

    const hintEl = document.getElementById('compress-slow-hint');
    if (hintEl) {
      if (hint) {
        hintEl.hidden = false;
        hintEl.textContent = hint;
      } else {
        hintEl.hidden = true;
      }
    } else if (hint && hint !== prev) {
      render();
    }
  }, 250);
}

function post(msg: WebviewToHost) {
  vscode.postMessage(msg);
}

function formatBytes(n: number): string {
  if (n < 1024) {
    return `${n} B`;
  }
  if (n < 1024 * 1024) {
    return `${(n / 1024).toFixed(1)} KB`;
  }
  return `${(n / 1024 / 1024).toFixed(2)} MB`;
}

function formatRatio(ratio: number): string {
  const saved = Math.max(0, (1 - ratio) * 100);
  return `${saved.toFixed(1)}%`;
}

function isWeakSaving(item: CompressResultItem): boolean {
  const min = state.settings.minSavingRatio ?? 0.2;
  return 1 - item.ratio < min;
}

function canConvertToJpg(item: CompressResultItem): boolean {
  return item.ext === 'png' && !item.convertedToJpg && isWeakSaving(item);
}

function isComparePreviewItem(
  item: ImageItem | CompressResultItem
): item is CompressResultItem {
  return 'originalPreviewUri' in item && 'compressedPreviewUri' in item;
}

function escapeHtml(s: string): string {
  return s
    .replace(/&/g, '&amp;')
    .replace(/</g, '&lt;')
    .replace(/>/g, '&gt;')
    .replace(/"/g, '&quot;');
}

function largeThreshold(): number {
  return state.settings.largeImageMinBytes ?? DEFAULT_SETTINGS.largeImageMinBytes;
}

function replaceableResults(): CompressResultItem[] {
  return state.results.filter((r) => {
    if (r.excluded) {
      return false;
    }
    if (!r.skipped && r.cachePath) {
      return true;
    }
    // 未压小的 PNG 仍可展示，便于「压成 jpg 试试」
    return Boolean(r.skipped && r.ext === 'png' && !r.convertedToJpg);
  });
}

function largeResults(): CompressResultItem[] {
  const min = largeThreshold();
  return state.results.filter(
    (r) => !r.excluded && !r.skipped && r.cachePath && r.compressedSize >= min
  );
}

function currentResultList(): CompressResultItem[] {
  return state.resultTab === 'large' ? largeResults() : replaceableResults();
}

function indexInResults(item: CompressResultItem): number {
  return state.results.findIndex((r) => r.id === item.id);
}

function render() {
  app.innerHTML = `
    ${renderHeader()}
    <div class="main">
      ${renderPage()}
    </div>
    ${state.settingsOpen ? renderSettingsModal() : ''}
    ${state.previewItem ? renderPreviewModal() : ''}
    ${state.confirm ? renderConfirmModal() : ''}
    ${state.replaceReport ? renderReplaceReportModal() : ''}
    ${state.banner ? `<div class="banner">${escapeHtml(state.banner.message)}</div>` : ''}
    ${state.toast ? `<div class="toast ${state.toast.level}">${escapeHtml(state.toast.message)}</div>` : ''}
  `;
  bindEvents();
}

function renderHeader(): string {
  return `
    <header class="header">
      <div class="header-brand">
        <span class="brand-dot"></span>
        <h1>ImgDo · 图片压缩 · 一键替换</h1>
      </div>
      <button class="icon-btn settings-btn" type="button" data-action="open-settings" title="全局设置" aria-label="全局设置">
        <svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="1.8" stroke-linecap="round" stroke-linejoin="round" aria-hidden="true">
          <circle cx="12" cy="12" r="3"></circle>
          <path d="M12 1v2.5M12 20.5V23M4.2 4.2l1.8 1.8M18 18l1.8 1.8M1 12h2.5M20.5 12H23M4.2 19.8l1.8-1.8M18 6l1.8-1.8"></path>
        </svg>
      </button>
    </header>
  `;
}

function renderPage(): string {
  switch (state.page) {
    case 'entry':
      return renderEntry();
    case 'scanning':
      return `<div class="empty">正在扫描图片…${state.progress ? `<div class="meta">${escapeHtml(state.progress.message ?? '')}</div>` : ''}</div>`;
    case 'list':
      return renderList();
    case 'compressing':
      return renderCompressing();
    case 'compare':
      return renderCompare();
    default:
      return '';
  }
}

function renderEntry(): string {
  return `
    <div class="dropzone" id="dropzone" role="button" tabindex="0">
      <h2>拖入或选择项目文件夹</h2>
      <p class="meta" style="margin:0">从左侧资源管理器拖入文件夹（如拖入src）</p>
      ${state.dropHint ? `<p class="meta" style="margin:0;color:var(--teal-600)">${escapeHtml(state.dropHint)}</p>` : ''}
      <div class="actions">
        <button type="button" data-action="pick-folder">选择文件夹</button>
        ${
          state.canScanWorkspace
            ? `<button type="button" class="secondary" data-action="scan-workspace">工作区一键查找${state.workspaceLabel ? `（${escapeHtml(state.workspaceLabel)}）` : ''}</button>`
            : `<button type="button" class="secondary" disabled title="多根工作区请选择具体文件夹">工作区一键查找不可用</button>`
        }
      </div>
    </div>
  `;
}

function renderList(): string {
  const summary = state.summary;
  return `
    <div class="list-page">
      <div class="toolbar">
        <div class="tabs">
          <button type="button" class="tab ${state.listTab === 'all' ? 'active' : ''}" data-action="tab-all">所有图片<span class="count">${state.items.length}</span></button>
          <button type="button" class="tab ${state.listTab === 'tree' ? 'active' : ''}" data-action="tab-tree">目录结构</button>
        </div>
        <div class="actions">
          <button type="button" class="secondary" data-action="back-entry">重新选择</button>
          <button type="button" data-action="start-compress" ${state.items.length ? '' : 'disabled'}>开始压缩</button>
        </div>
      </div>
      <div class="meta list-meta">
        根目录：${escapeHtml(summary?.rootPath ?? '')} · 匹配: ${state.items.length} 张
        ${summary ? ` · 扫描: ${summary.scanned} · 小于阈值跳过: ${summary.skippedSmall}` : ''}
      </div>
      ${
        !state.items.length
          ? `<div class="empty">没有可压缩图片</div>`
          : state.listTab === 'all'
            ? `<div class="table-wrap list-table-shell">
                ${renderAllTableHead()}
                <div class="list-scroll">${renderAllTableBody()}</div>
              </div>`
            : `<div class="list-scroll">${renderTree()}</div>`
      }
    </div>
  `;
}

function renderTargetSizeInput(item: ImageItem): string {
  const modified = isTargetSizeModified(item);
  const value = formatTargetWidth(item.targetWidth);
  return `<input
    class="target-size-input ${modified ? 'is-modified' : ''}"
    type="number"
    min="1"
    step="1"
    data-target-size="1"
    data-id="${escapeHtml(item.id)}"
    value="${escapeHtml(value)}"
    title="只改宽度，高度按原图比例自动计算（当前约 ${item.targetHeight}px）"
    spellcheck="false"
  />`;
}

function renderAllTableColgroup(): string {
  return `<colgroup>
    <col class="col-preview" />
    <col class="col-name" />
    <col class="col-path" />
    <col class="col-size" />
    <col class="col-target" />
    <col class="col-ext" />
    <col class="col-bytes" />
    <col class="col-action" />
  </colgroup>`;
}

function renderAllTableHead(): string {
  return `
    <table class="table table-fixed-cols table-head-only">
      ${renderAllTableColgroup()}
      <thead>
        <tr>
          <th>预览</th><th>名称</th><th>路径</th><th>尺寸</th><th>目标宽度</th><th>扩展名</th><th>大小</th><th></th>
        </tr>
      </thead>
    </table>
  `;
}

function renderAllTableBody(): string {
  const rows = state.items
    .map(
      (item) => `
      <tr data-id="${escapeHtml(item.id)}">
        <td><img class="thumb" src="${escapeHtml(item.previewUri ?? '')}" alt="" data-action="preview" data-id="${escapeHtml(item.id)}" /></td>
        <td>${escapeHtml(item.name)}</td>
        <td><div class="path" title="${escapeHtml(item.relativePath)}">${escapeHtml(item.relativePath)}</div></td>
        <td>${item.width}×${item.height}</td>
        <td>${renderTargetSizeInput(item)}</td>
        <td><span class="badge">${escapeHtml(item.ext)}</span></td>
        <td>${formatBytes(item.size)}</td>
        <td><button type="button" class="danger" data-action="exclude-queue" data-id="${escapeHtml(item.id)}">取消压缩</button></td>
      </tr>`
    )
    .join('');

  return `
    <table class="table table-fixed-cols table-body-only">
      ${renderAllTableColgroup()}
      <tbody>${rows}</tbody>
    </table>
  `;
}

function renderTree(): string {
  type Node = { name: string; children: Map<string, Node>; files: ImageItem[] };
  const root: Node = { name: '', children: new Map(), files: [] };

  for (const item of state.items) {
    const parts = item.relativePath.split('/');
    let cur = root;
    for (let i = 0; i < parts.length - 1; i++) {
      const p = parts[i];
      if (!cur.children.has(p)) {
        cur.children.set(p, { name: p, children: new Map(), files: [] });
      }
      cur = cur.children.get(p)!;
    }
    cur.files.push(item);
  }

  const countImages = (node: Node): number => {
    let total = node.files.length;
    for (const child of node.children.values()) {
      total += countImages(child);
    }
    return total;
  };

  const renderNode = (node: Node, depth: number): string => {
    const childDirs = [...node.children.values()]
      .map((c) => {
        const count = countImages(c);
        return `
        <div class="tree-row">
          <details open>
            <summary>
              <span class="tree-twisty" aria-hidden="true">▾</span>
              <span>📁 ${escapeHtml(c.name)}（${count}）</span>
            </summary>
            <div class="tree-children">
              ${renderNode(c, depth + 1)}
            </div>
          </details>
        </div>`;
      })
      .join('');
    const files = node.files
      .map(
        (item) => `
        <div class="tree-item">
          <img class="thumb" src="${escapeHtml(item.previewUri ?? '')}" alt="" data-action="preview" data-id="${escapeHtml(item.id)}" />
          <div class="tree-item-meta">
            <div>${escapeHtml(item.name)}</div>
            <div class="path">${item.width}×${item.height} · ${formatBytes(item.size)}</div>
          </div>
          <div class="tree-item-target" onclick="event.stopPropagation()">
            <label>目标宽</label>
            ${renderTargetSizeInput(item)}
          </div>
          <div class="tree-item-actions">
            <button type="button" class="danger" data-action="exclude-queue" data-id="${escapeHtml(item.id)}">取消压缩</button>
          </div>
        </div>`
      )
      .join('');
    return `${childDirs}${files}`;
  };

  return `<div class="tree">${renderNode(root, 0)}</div>`;
}

function renderCompressing(): string {
  const p = state.progress;
  const pct = p && p.total ? Math.round((p.done / p.total) * 100) : 0;
  const cancelling = p?.message === '正在取消…';
  return `
    <div class="compressing-wrap">
      <svg class="compress-svg" viewBox="0 0 140 140" aria-hidden="true">
        <defs>
          <linearGradient id="gPhoto" x1="0" y1="0" x2="1" y2="1">
            <stop offset="0%" stop-color="#4fbfad"/>
            <stop offset="100%" stop-color="#0d8f7c"/>
          </linearGradient>
        </defs>
        <rect class="frame" x="28" y="28" width="84" height="84" rx="14"/>
        <g class="photo">
          <rect x="40" y="40" width="60" height="60" rx="10" fill="url(#gPhoto)" opacity="0.9"/>
          <circle cx="58" cy="58" r="7" fill="#e6f7f4" opacity="0.9"/>
          <path d="M44 88 L62 68 L74 80 L86 66 L96 88 Z" fill="#c5ebe4" opacity="0.95"/>
        </g>
        <g class="arrow-l" fill="#0a7365">
          <path d="M18 70 L30 62 L30 78 Z"/>
        </g>
        <g class="arrow-r" fill="#0a7365">
          <path d="M122 70 L110 62 L110 78 Z"/>
        </g>
        <g class="spark" fill="#2aa996">
          <circle cx="70" cy="22" r="3"/>
          <circle cx="82" cy="26" r="2"/>
          <circle cx="58" cy="26" r="2"/>
        </g>
      </svg>
      <div>正在压缩… ${p ? `${p.done}/${p.total}` : ''}</div>
      <div class="progress-bar"><span style="width:${pct}%"></span></div>
      <div class="meta" style="margin:0">${escapeHtml(p?.message ? (cancelling ? p.message : `当前：${p.message}`) : '')}</div>
      <div id="compress-slow-hint" class="compress-slow-hint" ${state.compressSlowHint ? '' : 'hidden'}>${escapeHtml(state.compressSlowHint ?? '')}</div>
      <button type="button" class="secondary" data-action="cancel-compress" ${cancelling ? 'disabled' : ''}>${cancelling ? '取消中…' : '取消'}</button>
    </div>
  `;
}

function renderCompare(): string {
  const replaceList = replaceableResults();
  const largeList = largeResults();
  const list = currentResultList();
  const skippedCount = state.results.filter((r) => r.skipped).length;
  const excludedCount = state.results.filter((r) => r.excluded && !r.skipped).length;

  if (!state.results.length) {
    return `<div class="empty">没有压缩结果<button data-action="back-entry">返回</button></div>`;
  }

  // 待替换 / 大图为空时，不要再用跳过项撑对比区
  if (!list.length) {
    return `
      <div class="compare-page">
        <div class="compare-top">
          <div class="tabs">
            <button type="button" class="tab ${state.resultTab === 'replace' ? 'active' : ''}" data-action="result-tab-replace">
              待替换<span class="count">${replaceList.length}</span>
            </button>
            <button type="button" class="tab ${state.resultTab === 'large' ? 'active' : ''}" data-action="result-tab-large">
              大图<span class="count">${largeList.length}</span>
            </button>
          </div>
          <div class="actions">
            <button type="button" class="secondary" data-action="back-entry">返回入口</button>
          </div>
        </div>
        <div class="meta">
          成功: ${replaceList.length} · 未变小跳过: ${skippedCount} · 手动排除: ${excludedCount}
          · 大图阈值: ${formatBytes(largeThreshold())}
        </div>
        <div class="empty">
          ${
            state.resultTab === 'large'
              ? '没有超过阈值的大图'
              : skippedCount > 0
                ? `没有可替换图片。有 ${skippedCount} 张在多次降档后仍未明显变小，已自动跳过。可在设置里调低「起始质量」或「最小压缩幅度」后再试。`
                : '没有待替换图片'
          }
          <div class="actions" style="margin-top:16px">
            <button type="button" class="secondary" data-action="back-entry">返回入口</button>
          </div>
        </div>
      </div>
    `;
  }

  let cur = state.results[Math.min(state.compareIndex, state.results.length - 1)];
  const inTab = list.find((i) => i.id === cur.id) ?? list[0];
  cur = inTab;
  state.compareIndex = indexInResults(cur);

  const ratioHtml = `压缩比 ${formatRatio(cur.ratio)} · 现 <span class="size-now">${formatBytes(cur.compressedSize)}</span>`;

  const rows = list
    .map((item) => {
      const active = item.id === cur.id ? 'active' : '';
      const weak = isWeakSaving(item);
      const jpgBtn = canConvertToJpg(item)
        ? `<button type="button" data-action="convert-jpg" data-id="${escapeHtml(item.id)}">压成jpg试试</button>`
        : '';
      return `
        <div class="result-row ${active}" data-action="select-result" data-id="${escapeHtml(item.id)}">
          <img src="${escapeHtml(item.compressedPreviewUri || item.originalPreviewUri)}" alt="" />
          <div class="info">
            <div class="name">${escapeHtml(item.name)}${item.convertedToJpg ? ' <span class="badge">JPG</span>' : ''}${weak && !item.convertedToJpg ? ' <span class="badge warn">压缩弱</span>' : ''}</div>
            <div class="sub">${escapeHtml(item.relativePath)} · ${formatBytes(item.compressedSize)}${item.compressedSize >= largeThreshold() ? ' · <span class="badge warn">大图</span>' : ''}${item.skipped ? ' · 未变小' : ''}</div>
          </div>
          <div class="actions" onclick="event.stopPropagation()">
            ${jpgBtn}
            ${
              state.resultTab === 'large'
                ? `<button type="button" data-action="recompress-one" data-id="${escapeHtml(item.id)}">再压</button>`
                : item.skipped
                  ? ''
                  : `<button type="button" class="danger" data-action="exclude-replace" data-id="${escapeHtml(item.id)}">取消</button>`
            }
          </div>
        </div>`;
    })
    .join('');

  const convertJpgAction = canConvertToJpg(cur)
    ? `<button type="button" data-action="convert-jpg" data-id="${escapeHtml(cur.id)}">压成jpg试试</button>`
    : '';

  const replaceReady = replaceableResults().filter((r) => !r.skipped && r.cachePath);

  return `
    <div class="compare-page">
      <div class="compare-top">
        <div class="tabs">
          <button type="button" class="tab ${state.resultTab === 'replace' ? 'active' : ''}" data-action="result-tab-replace">
            待替换<span class="count">${replaceReady.length}</span>
          </button>
          <button type="button" class="tab ${state.resultTab === 'large' ? 'active' : ''}" data-action="result-tab-large">
            大图<span class="count">${largeList.length}</span>
          </button>
        </div>
        <div class="actions">
          <button type="button" class="secondary" data-action="back-entry">返回入口</button>
          ${
            state.resultTab === 'large'
              ? `<button type="button" data-action="recompress-large" ${largeList.length ? '' : 'disabled'}>一键再压</button>`
              : `<button type="button" data-action="confirm-replace" ${replaceReady.length ? '' : 'disabled'}>一键替换</button>`
          }
        </div>
      </div>
      <div class="meta">
        成功: ${replaceReady.length} · 未变小跳过: ${skippedCount} · 手动排除: ${excludedCount}
        · 大图阈值: ${formatBytes(largeThreshold())}
      </div>
      <div class="compare-stage">
        <div class="compare-pane">
          <div class="compare-pane-head">
            <strong>原图</strong>
            <span>${formatBytes(cur.originalSize)}</span>
          </div>
          <div class="compare-pane-body"><img src="${escapeHtml(cur.originalPreviewUri)}" alt="原图" data-action="preview-result" data-id="${escapeHtml(cur.id)}" data-which="original" /></div>
        </div>
        <div class="compare-pane">
          <div class="compare-pane-head">
            <div class="compare-pane-head-main">${ratioHtml}${cur.convertedToJpg ? ' · <span class="badge">已转 JPG</span>' : ''}${isWeakSaving(cur) && !cur.convertedToJpg ? ' · <span class="badge warn">压缩不明显</span>' : ''}</div>
            <div class="compare-pane-actions">
              ${convertJpgAction}
              ${
                cur.skipped
                  ? ''
                  : `<button type="button" data-action="recompress-one" data-id="${escapeHtml(cur.id)}">继续加压</button>
              ${
                1 - cur.ratio > 0.5
                  ? `<button type="button" class="secondary" data-action="ease-one" data-id="${escapeHtml(cur.id)}">稍微减压</button>`
                  : ''
              }
              <button type="button" class="danger" data-action="exclude-replace" data-id="${escapeHtml(cur.id)}">取消压缩</button>`
              }
            </div>
          </div>
          <div class="compare-pane-body"><img src="${escapeHtml(cur.compressedPreviewUri || cur.originalPreviewUri)}" alt="压缩图" data-action="preview-result" data-id="${escapeHtml(cur.id)}" data-which="compressed" /></div>
        </div>
      </div>
      <div class="result-list">${rows}</div>
    </div>
  `;
}

function renderSettingsModal(): string {
  const s = state.settings;
  return `
    <div class="modal-backdrop" data-action="close-settings">
      <div class="modal" data-stop>
        <div class="modal-head">
          <h3>全局设置</h3>
          <button type="button" class="icon-btn" data-action="close-settings">✕</button>
        </div>
        <div class="modal-body">
          <div class="switch-row">
            <span>[一键替换]前备份到 .backup</span>
            <label class="switch">
              <input type="checkbox" id="set-backup" ${s.backupOnReplace ? 'checked' : ''} />
              <span class="switch-slider"></span>
            </label>
          </div>
          <div class="form-row">
            <label for="set-rate">起始质量（0.1–1.0，默认 0.5）</label>
            <input id="set-rate" type="number" min="0.1" max="1" step="0.05" value="${s.compressRate}" />
            <div class="hint">JPEG/WebP 质量 = 该值 × 100；PNG 映射为色板颜色数；不足幅度时自动降档</div>
          </div>
          <div class="form-row">
            <label for="set-min-saving">最小压缩幅度（%，默认 20）</label>
            <input id="set-min-saving" type="number" min="5" max="70" step="5" value="${Math.round((s.minSavingRatio ?? 0.2) * 100)}" />
            <div class="hint">相对原图至少缩小这么多才算成功，否则自动降档重试</div>
          </div>
          <div class="form-row">
            <label for="set-min">最小开压（KB）</label>
            <input id="set-min" type="number" min="0" step="1" value="${Math.round(s.minSizeBytes / 1024)}" />
            <div class="hint">小于该大小的图片不进入压缩列表</div>
          </div>
          <div class="form-row">
            <label for="set-large">大图阈值（KB）</label>
            <input id="set-large" type="number" min="0" step="1" value="${Math.round(s.largeImageMinBytes / 1024)}" />
            <div class="hint">压缩后仍 ≥ 该大小的图片会出现在「大图」Tab</div>
          </div>
        </div>
        <div class="modal-foot">
          <button type="button" class="secondary" data-action="close-settings">取消</button>
          <button type="button" data-action="save-settings">保存</button>
        </div>
      </div>
    </div>
  `;
}

function renderPreviewModal(): string {
  const item = state.previewItem!;
  const compare = isComparePreviewItem(item);
  let src = '';
  let whichLabel = '';
  if (compare) {
    const which = state.previewWhich;
    src =
      which === 'original'
        ? item.originalPreviewUri
        : item.compressedPreviewUri || item.originalPreviewUri;
    whichLabel = which === 'original' ? '原图' : item.convertedToJpg ? '压缩图 (JPG)' : '压缩图';
  } else if ('previewUri' in item && item.previewUri) {
    src = item.previewUri;
  }

  const sizeClass = state.previewActualSize ? 'actual' : 'fit';
  const toggleHint = compare
    ? ' · ←/→ 切换原图与压缩图 · ↑/↓ 切换列表前后图'
    : '';

  return `
    <div class="modal-backdrop" data-action="close-preview">
      <div class="modal wide preview-modal" data-stop>
        <div class="modal-head">
          <h3>${escapeHtml(item.name)}${whichLabel ? ` · ${whichLabel}` : ''} <span class="meta">Esc 关闭${toggleHint}</span></h3>
          <div class="modal-head-actions">
            <button type="button" class="secondary ${state.previewActualSize ? 'active-toggle' : ''}" data-action="preview-toggle-100">100%</button>
            <button type="button" class="icon-btn" data-action="close-preview">✕</button>
          </div>
        </div>
        <div class="modal-body preview-scroll">
          <img class="preview-img ${sizeClass}" src="${escapeHtml(src)}" alt="${escapeHtml(item.name)}" />
        </div>
      </div>
    </div>
  `;
}

function normalizeDisplayExt(ext: string): string {
  const e = ext.toLowerCase().replace(/^\./, '');
  return e === 'jpeg' ? 'jpg' : e;
}

function swapRelativeExt(rel: string, ext: string): string {
  const e = normalizeDisplayExt(ext);
  if (!rel.includes('.')) {
    return `${rel}.${e}`;
  }
  return rel.replace(/\.[^.]+$/i, `.${e}`);
}

/** 待替换里会发生换扩展名的项 */
function formatChangePairs(): Array<{ from: string; to: string }> {
  return replaceableResults()
    .filter((r) => !r.skipped && r.cachePath)
    .map((item) => {
      const srcExt = normalizeDisplayExt(item.ext);
      const outExt = normalizeDisplayExt(
        item.convertedToJpg ? 'jpg' : item.outputExt || item.ext
      );
      if (srcExt === outExt) {
        return null;
      }
      // relativePath 可能已被改成新扩展名
      const rel = item.relativePath.split('\\').join('/');
      const lower = rel.toLowerCase();
      let from: string;
      let to: string;
      if (lower.endsWith(`.${outExt}`)) {
        to = rel;
        from = swapRelativeExt(rel, srcExt);
      } else if (lower.endsWith(`.${srcExt}`)) {
        from = rel;
        to = swapRelativeExt(rel, outExt);
      } else {
        from = swapRelativeExt(rel, srcExt);
        to = swapRelativeExt(rel, outExt);
      }
      return { from, to };
    })
    .filter((x): x is { from: string; to: string } => Boolean(x));
}

function buildFormatChangeCopyText(changes: Array<{ from: string; to: string }>): string {
  return changes.map((c) => `- ${c.from} 换成 ${c.to};`).join('\n');
}

function renderConfirmModal(): string {
  const c = state.confirm!;
  const changes = c.formatChanges ?? [];
  const formatBlock =
    changes.length > 0
      ? `
        <div class="format-change-warn">
          <div class="format-change-head">
            <span>以下换格式压缩，删除代码可能报错</span>
            <button type="button" class="secondary" data-action="copy-format-changes">复制给AI</button>
          </div>
          <ul class="format-change-list">
            ${changes
              .map(
                (ch) =>
                  `<li>- ${escapeHtml(ch.from)} 换成 ${escapeHtml(ch.to)};</li>`
              )
              .join('')}
          </ul>
        </div>`
      : '';

  return `
    <div class="modal-backdrop" data-action="close-confirm">
      <div class="modal ${changes.length ? 'wide' : ''}" data-stop>
        <div class="modal-head"><h3>${escapeHtml(c.title)}</h3></div>
        <div class="modal-body">
          <p>${escapeHtml(c.message)}</p>
          ${formatBlock}
        </div>
        <div class="modal-foot">
          <button type="button" class="secondary" data-action="close-confirm">取消</button>
          <button type="button" data-action="do-confirm">${escapeHtml(c.confirmText)}</button>
        </div>
      </div>
    </div>
  `;
}

function formatSavedSpace(bytes: number): string {
  const mb = bytes / (1024 * 1024);
  if (mb >= 0.1) {
    return `${mb.toFixed(2)}M`;
  }
  if (bytes >= 1024) {
    return `${(bytes / 1024).toFixed(1)}KB`;
  }
  return `${bytes}B`;
}

function renderReplaceReportModal(): string {
  const report = state.replaceReport!;
  const savedBytes = report.items.reduce(
    (sum, item) => sum + Math.max(0, item.originalSize - item.compressedSize),
    0
  );
  const rows = report.items
    .map(
      (item) => `
      <div class="replace-list-item">
        <div>
          <div>${escapeHtml(item.name)}</div>
          <div class="sub">${escapeHtml(item.relativePath)}</div>
        </div>
        <div class="sub">${formatBytes(item.originalSize)} → ${formatBytes(item.compressedSize)}</div>
      </div>`
    )
    .join('');
  return `
    <div class="modal-backdrop modal-backdrop-static">
      <div class="modal wide" data-stop>
        <div class="modal-head">
          <h3>已替换明细</h3>
          <button type="button" class="icon-btn" data-action="close-replace-report">✕</button>
        </div>
        <div class="modal-body">
          <p class="replace-saved">本次更节省空间 ${formatSavedSpace(savedBytes)}</p>
          ${report.backupPath ? `<p class="meta">备份：${escapeHtml(report.backupPath)}</p>` : ''}
          <div class="replace-list">${rows || '<div class="empty">无明细</div>'}</div>
        </div>
        <div class="modal-foot">
          <button type="button" data-action="close-replace-report">完成</button>
        </div>
      </div>
    </div>
  `;
}

function fileUrlToPath(url: string): string | null {
  try {
    if (url.startsWith('file://')) {
      const u = new URL(url);
      let p = decodeURIComponent(u.pathname);
      // Windows: /C:/...
      if (/^\/[A-Za-z]:\//.test(p)) {
        p = p.slice(1);
      }
      return p;
    }
  } catch {
    // ignore
  }
  return null;
}

function extractDropFolderPath(dt: DataTransfer): string | null {
  const mimeCandidates = [
    'application/vnd.code.uri-list',
    'text/uri-list',
    'text/plain',
  ];
  for (const mime of mimeCandidates) {
    const raw = dt.getData(mime);
    if (!raw) {
      continue;
    }
    const first = raw
      .split(/\r?\n/)
      .map((s) => s.trim())
      .find((s) => s && !s.startsWith('#'));
    if (!first) {
      continue;
    }
    const fromUrl = fileUrlToPath(first);
    if (fromUrl) {
      return fromUrl;
    }
    if (first.startsWith('/') || /^[A-Za-z]:[\\/]/.test(first)) {
      return first;
    }
  }

  if (dt.files?.length) {
    const file = dt.files[0] as File & { path?: string };
    if (file.path) {
      return file.path;
    }
  }

  // Electron / Chromium items
  if (dt.items?.length) {
    for (let i = 0; i < dt.items.length; i++) {
      const item = dt.items[i];
      if (item.kind !== 'file') {
        continue;
      }
      const f = item.getAsFile() as (File & { path?: string }) | null;
      if (f?.path) {
        return f.path;
      }
    }
  }

  return null;
}

function applyTargetSizeEdit(id: string, raw: string, inputEl: HTMLInputElement) {
  const item = state.items.find((i) => i.id === id);
  if (!item) {
    return;
  }
  const parsed = parseTargetWidthInput(raw, item.width, item.height);
  if (!parsed) {
    inputEl.value = formatTargetWidth(item.targetWidth);
    showToast('warn', '请输入有效的目标宽度（正整数）');
    return;
  }
  const changed =
    parsed.targetWidth !== item.targetWidth || parsed.targetHeight !== item.targetHeight;
  if (!changed) {
    inputEl.value = formatTargetWidth(item.targetWidth);
    inputEl.classList.toggle('is-modified', isTargetSizeModified(item));
    return;
  }
  state.items = state.items.map((i) =>
    i.id === id
      ? { ...i, targetWidth: parsed.targetWidth, targetHeight: parsed.targetHeight }
      : i
  );
  post({
    type: 'updateTargetSize',
    id,
    targetWidth: parsed.targetWidth,
    targetHeight: parsed.targetHeight,
  });
  render();
}

function bindEvents() {
  app.querySelectorAll('[data-action]').forEach((el) => {
    el.addEventListener('click', (e) => {
      e.stopPropagation();
      const target = e.currentTarget as HTMLElement;
      const action = target.getAttribute('data-action');
      const id = target.getAttribute('data-id') ?? undefined;
      handleAction(action, id, target, e);
    });
  });

  app.querySelectorAll<HTMLInputElement>('[data-target-size]').forEach((input) => {
    input.addEventListener('click', (e) => e.stopPropagation());
    input.addEventListener('keydown', (e) => {
      if (e.key === 'Enter') {
        e.preventDefault();
        input.blur();
      }
    });
    input.addEventListener('change', () => {
      const id = input.getAttribute('data-id');
      if (!id) {
        return;
      }
      applyTargetSizeEdit(id, input.value, input);
    });
  });

  app.querySelectorAll('.modal-backdrop').forEach((bg) => {
    bg.addEventListener('click', (e) => {
      if (e.target !== bg) {
        return;
      }
      const action = (bg as HTMLElement).getAttribute('data-action');
      handleAction(action, undefined, bg as HTMLElement, e);
    });
  });

  const dropzone = document.getElementById('dropzone');
  if (dropzone) {
    // 点击空白区域才选文件夹；按钮各自处理，避免「工作区一键查找」再弹出选目录
    dropzone.addEventListener('click', (e) => {
      const t = e.target as HTMLElement | null;
      if (t?.closest('button, .actions, input, a, label')) {
        return;
      }
      handleAction('pick-folder', undefined, dropzone, e);
    });
    dropzone.addEventListener('keydown', (e) => {
      if (e.key !== 'Enter' && e.key !== ' ') {
        return;
      }
      const t = e.target as HTMLElement | null;
      if (t?.closest('button, .actions, input, a, label')) {
        return;
      }
      e.preventDefault();
      handleAction('pick-folder', undefined, dropzone, e);
    });
    dropzone.addEventListener('dragenter', (e) => {
      e.preventDefault();
      e.stopPropagation();
      dropzone.classList.add('dragover');
      state.dropHint = '按住 Shift 再松开，即可放入文件夹；或直接点击选择';
      const hint = dropzone.querySelector('.meta');
      void hint;
    });
    dropzone.addEventListener('dragover', (e) => {
      e.preventDefault();
      e.stopPropagation();
      if (e.dataTransfer) {
        e.dataTransfer.dropEffect = 'copy';
      }
      dropzone.classList.add('dragover');
    });
    dropzone.addEventListener('dragleave', (e) => {
      e.preventDefault();
      dropzone.classList.remove('dragover');
    });
    dropzone.addEventListener('drop', (e) => {
      e.preventDefault();
      e.stopPropagation();
      dropzone.classList.remove('dragover');
      state.dropHint = undefined;

      const dt = e.dataTransfer;
      if (!dt) {
        post({ type: 'pickFolder' });
        return;
      }

      const folderPath = extractDropFolderPath(dt);
      if (folderPath) {
        post({ type: 'scanFolder', folderPath });
        return;
      }

      // Webview 拿不到系统路径时，直接打开系统选目录（免再点一次）
      showToast('info', '当前环境无法直接读取拖入路径，已打开文件夹选择器');
      post({ type: 'pickFolder' });
    });
  }
}

function handleAction(
  action: string | null,
  id: string | undefined,
  el: HTMLElement,
  e: Event
) {
  if (!action) {
    return;
  }
  if (action === 'close-settings' || action === 'close-preview' || action === 'close-confirm') {
    if (el.classList.contains('modal-backdrop') && e.target !== el) {
      return;
    }
  }

  switch (action) {
    case 'open-settings':
      state.settingsOpen = true;
      render();
      break;
    case 'close-settings':
      state.settingsOpen = false;
      render();
      break;
    case 'save-settings': {
      const backupOnReplace = (document.getElementById('set-backup') as HTMLInputElement).checked;
      const compressRate = Number((document.getElementById('set-rate') as HTMLInputElement).value);
      const minSavingPct = Number(
        (document.getElementById('set-min-saving') as HTMLInputElement).value
      );
      const minKb = Number((document.getElementById('set-min') as HTMLInputElement).value);
      const largeKb = Number((document.getElementById('set-large') as HTMLInputElement).value);
      post({
        type: 'saveSettings',
        settings: {
          backupOnReplace,
          compressRate,
          minSavingRatio: Math.max(0.05, Math.min(0.7, minSavingPct / 100)),
          minSizeBytes: Math.round(minKb * 1024),
          largeImageMinBytes: Math.round(largeKb * 1024),
        },
      });
      state.settingsOpen = false;
      render();
      break;
    }
    case 'pick-folder':
      post({ type: 'pickFolder' });
      break;
    case 'scan-workspace':
      post({ type: 'scanWorkspace' });
      break;
    case 'tab-all':
      state.listTab = 'all';
      render();
      break;
    case 'tab-tree':
      state.listTab = 'tree';
      render();
      break;
    case 'result-tab-replace':
      state.resultTab = 'replace';
      {
        const list = replaceableResults();
        if (list.length) {
          state.compareIndex = indexInResults(list[0]);
        }
      }
      render();
      break;
    case 'result-tab-large':
      state.resultTab = 'large';
      {
        const list = largeResults();
        if (list.length) {
          state.compareIndex = indexInResults(list[0]);
        }
      }
      render();
      break;
    case 'back-entry':
      state.page = 'entry';
      state.items = [];
      state.results = [];
      post({ type: 'resetToEntry' });
      render();
      break;
    case 'start-compress':
      state.page = 'compressing';
      state.progress = { done: 0, total: state.items.length };
      render();
      post({ type: 'startCompress', ids: state.items.map((i) => i.id) });
      break;
    case 'cancel-compress':
      post({ type: 'cancelCompress' });
      state.progress = {
        done: state.progress?.done ?? 0,
        total: state.progress?.total ?? 0,
        message: '正在取消…',
      };
      render();
      break;
    case 'exclude-queue':
      if (id) {
        post({ type: 'excludeFromQueue', id });
      }
      break;
    case 'preview':
      if (id) {
        state.previewItem = state.items.find((i) => i.id === id);
        state.previewActualSize = false;
        render();
      }
      break;
    case 'preview-result':
      if (id) {
        const item = state.results.find((i) => i.id === id);
        if (item) {
          state.previewWhich =
            (el.getAttribute('data-which') as 'original' | 'compressed') || 'compressed';
          state.previewItem = item;
          state.previewActualSize = false;
          render();
        }
      }
      break;
    case 'preview-toggle-100':
      state.previewActualSize = !state.previewActualSize;
      render();
      break;
    case 'close-preview':
      state.previewItem = undefined;
      state.previewActualSize = false;
      render();
      break;
    case 'convert-jpg':
      if (id) {
        state.page = 'compressing';
        state.progress = { done: 0, total: 1, message: '压成 JPG…' };
        render();
        post({ type: 'convertToJpg', id });
      }
      break;
    case 'select-result':
      if (id) {
        const idx = state.results.findIndex((r) => r.id === id);
        if (idx >= 0) {
          state.compareIndex = idx;
          render();
        }
      }
      break;
    case 'recompress-one':
      if (id) {
        state.page = 'compressing';
        state.progress = { done: 0, total: 1, message: '继续加压…' };
        render();
        post({ type: 'recompress', ids: [id] });
      }
      break;
    case 'ease-one':
      if (id) {
        state.page = 'compressing';
        state.progress = { done: 0, total: 1, message: '稍微减压…' };
        render();
        post({ type: 'easeCompress', id });
      }
      break;
    case 'recompress-large': {
      const ids = largeResults().map((r) => r.id);
      if (!ids.length) {
        return;
      }
      state.page = 'compressing';
      state.progress = { done: 0, total: ids.length, message: '大图再压…' };
      render();
      post({ type: 'recompress', ids });
      break;
    }
    case 'exclude-replace':
      if (!id) {
        return;
      }
      state.confirm = {
        title: '取消压缩',
        message: '确定将该图片从待替换列表中排除吗？排除后不会写回项目。',
        confirmText: '确认排除',
        onConfirm: () => {
          post({ type: 'excludeFromReplace', id });
          state.confirm = undefined;
        },
      };
      render();
      break;
    case 'confirm-replace':
      state.confirm = {
        title: '一键替换提示',
        message:
          '请先核查清晰度。确认后将：① 备份本次待替换原图 → ② 删除这些原图 → ③ 写入压缩结果。若 PNG 已转 JPG，会删除原 PNG 并放入同名 JPG。',
        confirmText: '确认替换',
        formatChanges: formatChangePairs(),
        onConfirm: () => {
          post({ type: 'confirmReplace' });
          state.confirm = undefined;
          render();
        },
      };
      render();
      break;
    case 'copy-format-changes': {
      const changes = state.confirm?.formatChanges ?? formatChangePairs();
      if (!changes.length) {
        showToast('warn', '没有换格式项可复制');
        break;
      }
      const text = buildFormatChangeCopyText(changes);
      void navigator.clipboard.writeText(text).then(
        () => showToast('info', '已复制给 AI 的换格式清单'),
        () => showToast('error', '复制失败，请手动选择复制')
      );
      break;
    }
    case 'close-confirm':
      state.confirm = undefined;
      render();
      break;
    case 'do-confirm':
      state.confirm?.onConfirm();
      render();
      break;
    case 'close-replace-report':
      state.replaceReport = undefined;
      state.page = 'entry';
      state.items = [];
      state.results = [];
      state.summary = undefined;
      state.compareIndex = 0;
      state.resultTab = 'replace';
      post({ type: 'resetToEntry' });
      render();
      break;
    default:
      break;
  }
}

function showToast(level: 'info' | 'warn' | 'error', message: string) {
  state.toast = { level, message };
  render();
  window.setTimeout(() => {
    if (state.toast?.message === message) {
      state.toast = undefined;
      render();
    }
  }, 3200);
}

function showBanner(message: string) {
  state.banner = { message };
  window.setTimeout(() => {
    if (state.banner?.message === message) {
      state.banner = undefined;
      render();
    }
  }, 2800);
}

window.addEventListener('message', (event: MessageEvent<HostToWebview>) => {
  const msg = event.data;
  switch (msg.type) {
    case 'init':
      state.canScanWorkspace = msg.canScanWorkspace;
      state.workspaceLabel = msg.workspaceLabel;
      render();
      break;
    case 'settings':
      state.settings = msg.settings;
      render();
      break;
    case 'scanStarted':
      state.page = 'scanning';
      render();
      break;
    case 'scanProgress':
      state.progress = { done: msg.current, total: 0, message: msg.message };
      render();
      break;
    case 'scanResult':
      state.items = msg.items;
      state.summary = msg.summary;
      state.page = 'list';
      state.listTab = 'all';
      render();
      break;
    case 'queueUpdated':
      // 取消压缩后只更新列表，不切换 Tab
      state.items = msg.items;
      state.summary = msg.summary;
      state.page = 'list';
      render();
      break;
    case 'scanError':
      state.page = 'entry';
      showToast('error', msg.message);
      break;
    case 'compressStarted':
    case 'recompressStarted':
      clearCompressItemTimer();
      state.page = 'compressing';
      state.progress = { done: 0, total: msg.total };
      render();
      break;
    case 'compressProgress':
      state.progress = { done: msg.done, total: msg.total, message: msg.current };
      ensureCompressItemTimer(msg.current);
      render();
      break;
    case 'compressResult': {
      clearCompressItemTimer();
      const prevId = state.results[state.compareIndex]?.id;
      state.results = msg.items;
      const keepTab = state.page === 'compare' || state.page === 'compressing';
      state.page = 'compare';
      if (!keepTab || (state.resultTab === 'large' && !largeResults().length)) {
        state.resultTab = 'replace';
      }
      if (largeResults().length && replaceableResults().every((r) => r.compressedSize >= largeThreshold())) {
        // 若几乎都是大图，仍默认待替换；不强制切大图
      }
      const prefer = prevId ? msg.items.findIndex((i) => i.id === prevId) : -1;
      state.compareIndex =
        prefer >= 0
          ? prefer
          : Math.max(
              0,
              msg.items.findIndex((i) => !i.skipped && !i.excluded)
            );
      if (state.compareIndex < 0) {
        state.compareIndex = 0;
      }
      render();
      break;
    }
    case 'compressError':
      clearCompressItemTimer();
      state.page = state.results.length ? 'compare' : 'list';
      if (msg.message.includes('取消')) {
        showToast('info', msg.message);
      } else {
        showToast('error', msg.message);
      }
      break;
    case 'replaceResult':
      if (msg.ok) {
        showBanner('替换成功');
        state.replaceReport = {
          message: msg.message,
          backupPath: msg.backupPath,
          items: msg.items ?? [],
        };
        render();
      } else {
        showToast('error', msg.message);
      }
      break;
    case 'toast':
      showToast(msg.level, msg.message);
      break;
    default:
      break;
  }
});

window.addEventListener('keydown', (e) => {
  if (e.key === 'Escape') {
    if (state.replaceReport) {
      e.preventDefault();
      handleAction('close-replace-report', undefined, document.body, e);
      return;
    }
    if (state.previewItem) {
      e.preventDefault();
      state.previewItem = undefined;
      state.previewActualSize = false;
      render();
      return;
    }
    if (state.confirm) {
      e.preventDefault();
      state.confirm = undefined;
      render();
      return;
    }
    if (state.settingsOpen) {
      e.preventDefault();
      state.settingsOpen = false;
      render();
      return;
    }
  }

  // 预览弹窗：←/→ 原图与压缩图；↑/↓ 列表前后图
  if (state.previewItem && isComparePreviewItem(state.previewItem)) {
    if (e.key === 'ArrowLeft' || e.key === 'ArrowRight') {
      e.preventDefault();
      state.previewWhich = e.key === 'ArrowLeft' ? 'original' : 'compressed';
      render();
      return;
    }
    if (e.key === 'ArrowUp' || e.key === 'ArrowDown') {
      e.preventDefault();
      const list = currentResultList();
      if (!list.length) {
        return;
      }
      const curId = state.previewItem.id;
      let pos = list.findIndex((i) => i.id === curId);
      if (pos < 0) {
        pos = list.findIndex((i) => i.id === state.results[state.compareIndex]?.id);
      }
      if (pos < 0) {
        pos = 0;
      }
      pos =
        e.key === 'ArrowUp'
          ? (pos - 1 + list.length) % list.length
          : (pos + 1) % list.length;
      const next = list[pos];
      state.compareIndex = indexInResults(next);
      state.previewItem = next;
      render();
      return;
    }
  }

  if (state.page !== 'compare' || !state.results.length || state.previewItem) {
    return;
  }
  const list = currentResultList();
  if (!list.length) {
    return;
  }
  const curId = state.results[state.compareIndex]?.id;
  let pos = list.findIndex((i) => i.id === curId);
  if (pos < 0) {
    pos = 0;
  }
  if (e.key === 'ArrowUp' || e.key === 'ArrowLeft') {
    e.preventDefault();
    pos = (pos - 1 + list.length) % list.length;
    state.compareIndex = indexInResults(list[pos]);
    render();
  } else if (e.key === 'ArrowDown' || e.key === 'ArrowRight') {
    e.preventDefault();
    pos = (pos + 1) % list.length;
    state.compareIndex = indexInResults(list[pos]);
    render();
  }
});

post({ type: 'ready' });
render();
