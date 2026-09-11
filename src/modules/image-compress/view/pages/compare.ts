import { state } from '../state';
import { formatBytes, formatRatio } from '../../../../shared/webview/utils/format';
import { escapeHtml } from '../../../../shared/webview/utils/html';
import {
  canConvertToJpg,
  currentResultList,
  indexInResults,
  isWeakSaving,
  largeResults,
  largeThreshold,
  replaceableResults,
} from '../utils/results';

export function renderCompare(): string {
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
