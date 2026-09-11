import { state } from '../state';
import { formatBytes, formatSavedSpace } from '../../../../shared/webview/utils/format';
import { escapeHtml } from '../../../../shared/webview/utils/html';
import { isComparePreviewItem } from '../utils/results';

export function renderSettingsModal(): string {
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

export function renderPreviewModal(): string {
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

export function renderReplaceReportModal(): string {
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
