import type { IcoUiState } from '../types';
import { ICO_SIZE_OPTIONS, saveDirOf } from '../types';

function escapeHtml(s: string): string {
  return s
    .replace(/&/g, '&amp;')
    .replace(/</g, '&lt;')
    .replace(/>/g, '&gt;')
    .replace(/"/g, '&quot;');
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

const CLEAR_ICON = `<svg viewBox="0 0 24 24" width="14" height="14" fill="none" stroke="currentColor" stroke-width="2.2" stroke-linecap="round"><path d="M6 6l12 12M18 6L6 18"/></svg>`;

export function renderIcoPage(st: IcoUiState): string {
  return `
    <div class="ico-page" id="ico-page">
      <section class="ico-panel" id="ico-panel">
        ${renderIcoInner(st)}
      </section>
    </div>
  `;
}

export function renderIcoInner(st: IcoUiState): string {
  const dir = saveDirOf(st.source);
  const saveHint =
    st.source && dir
      ? `保存后将在：${dir}`
      : st.source
        ? '保存后将写入源图同目录（请从资源管理器拖入或选择本地图片）'
        : '';

  return `
    <div class="ico-stack ico-split">
      ${renderInput(st)}
      <div class="ico-out ${st.converting ? 'is-busy' : ''}" id="ico-output">
        ${
          st.source
            ? `<button type="button" class="corner-btn" data-action="ico-clear" title="清空" aria-label="清空" ${st.converting ? 'disabled' : ''}>${CLEAR_ICON}</button>`
            : ''
        }
        <span class="pane-badge">转化结果</span>
        <div class="ico-sizes" role="radiogroup" aria-label="ICO 尺寸">
          ${ICO_SIZE_OPTIONS.map((s) => {
            const on = st.size === s;
            return `<button type="button" class="size-chip ${on ? 'active' : ''}" data-action="ico-select-size" data-size="${s}" role="radio" aria-checked="${on}" ${st.converting ? 'disabled' : ''}>${s}×${s}</button>`;
          }).join('')}
        </div>
        ${renderOutputPreview(st)}
        <div class="actions ico-actions">
          <button type="button" data-action="ico-save" ${st.source && !st.converting ? '' : 'disabled'}>保存</button>
        </div>
        ${saveHint ? `<p class="path-full meta">${escapeHtml(saveHint)}</p>` : ''}
      </div>
    </div>
  `;
}

function renderInput(st: IcoUiState): string {
  if (st.source && st.crop) {
    return `
      <div class="ico-in" id="ico-dropzone">
        <span class="pane-badge">输入</span>
        <div class="ico-crop-viewport" id="ico-crop-viewport" title="拖动调整裁剪位置">
          <img id="ico-crop-img" src="${escapeHtml(st.source.dataUrl)}" alt="" draggable="false" />
          <div class="ico-crop-frame" aria-hidden="true"></div>
        </div>
        <p class="path-full meta" id="ico-source-path">${escapeHtml(st.source.path ?? st.source.name)}</p>
        <p class="meta ico-crop-hint">拖动图片调整正方形裁剪 · ${st.source.width}×${st.source.height} · ${formatBytes(st.source.size)}</p>
      </div>
    `;
  }
  return `
    <div class="ico-in ico-drop-empty" id="ico-dropzone" role="button" tabindex="0">
      <span class="pane-badge">输入</span>
      <div class="ico-drop-pulse" aria-hidden="true"></div>
      <h3 class="ico-drop-title">拖入一张图片</h3>
      <p class="meta" style="margin:0">再次拖入将替换 · 支持正方形裁剪</p>
      ${st.dropHint ? `<p class="meta" style="margin:0;color:var(--teal-600)">${escapeHtml(st.dropHint)}</p>` : ''}
      <button type="button" data-action="ico-pick">选择图片</button>
    </div>
  `;
}

function renderOutputPreview(st: IcoUiState): string {
  if (st.converting) {
    return `
      <div class="ico-preview is-loading">
        <div class="ico-spinner"></div>
        <p class="meta" style="margin:0">正在生成并保存 ICO…</p>
      </div>
    `;
  }
  if (st.previewUrl || st.output?.previewUrl) {
    const url = st.previewUrl ?? st.output!.previewUrl;
    return `
      <div class="ico-preview has-image convert-pop">
        <img src="${escapeHtml(url)}" alt="裁剪预览" />
        <div class="meta" style="margin:0">
          将输出：${st.size}×${st.size} · favicon.ico
        </div>
      </div>
    `;
  }
  return `
    <div class="ico-preview awaiting">
      <p class="meta" style="margin:0">选择尺寸后点击「保存」</p>
    </div>
  `;
}
