import { state } from '../state';
import { escapeHtml } from '../../../../shared/webview/utils/html';

export function renderEntry(): string {
  return `
    <div class="dropzone" id="dropzone" role="button" tabindex="0">
      <h2>拖入或选择项目文件夹</h2>
      <p class="meta" style="margin:0">从左侧资源管理器拖入文件夹（如拖入src）</p>
      ${state.dropHint ? `<p class="meta" style="margin:0;color:var(--teal-600)">${escapeHtml(state.dropHint)}</p>` : ''}
      <div class="actions">
        <button type="button" data-action="pick-folder">选择文件夹</button>
        ${
          state.canScanWorkspace
            ? `<button type="button" class="btn-orange" data-action="scan-workspace">工作区一键查找${state.workspaceLabel ? `（${escapeHtml(state.workspaceLabel)}）` : ''}</button>`
            : `<button type="button" class="btn-orange" disabled title="多根工作区请选择具体文件夹">工作区一键查找不可用</button>`
        }
      </div>
    </div>
  `;
}
