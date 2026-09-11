import { escapeHtml } from '../shared/webview/utils/html';
import { requestRender } from './runtime';
import { shellState, type ConfirmState } from './state';

function confirmRoot(): HTMLElement | null {
  return document.getElementById('shell-confirm-root');
}

export function renderConfirmInner(): string {
  const c = getConfirm();
  if (!c) {
    return '';
  }
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
      <div class="modal ${changes.length ? 'wide' : ''}" role="dialog" aria-modal="true">
        <div class="modal-head"><h3>${escapeHtml(c.title)}</h3></div>
        <div class="modal-body">
          <p style="white-space:pre-line">${escapeHtml(c.message)}</p>
          ${formatBlock}
        </div>
        <div class="modal-foot">
          ${
            c.hideCancel
              ? ''
              : `<button type="button" class="secondary" data-action="close-confirm">取消</button>`
          }
          <button type="button" data-action="do-confirm">${escapeHtml(c.confirmText)}</button>
        </div>
      </div>
    </div>
  `;
}

/** 布局用：始终保留挂载点，便于局部刷新 */
export function renderConfirmSlot(): string {
  return `<div id="shell-confirm-root">${renderConfirmInner()}</div>`;
}

export function syncConfirmDom(): void {
  const root = confirmRoot();
  if (!root) {
    requestRender();
    return;
  }
  root.innerHTML = renderConfirmInner();
}

export function showConfirm(opts: ConfirmState): void {
  shellState.confirm = opts;
  syncConfirmDom();
}

export function clearConfirm(): void {
  shellState.confirm = undefined;
  syncConfirmDom();
}

export function getConfirm(): ConfirmState | undefined {
  return shellState.confirm;
}
