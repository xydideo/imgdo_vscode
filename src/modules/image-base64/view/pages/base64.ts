import type { Base64UiState } from '../types';

function escapeHtml(s: string): string {
  return s
    .replace(/&/g, '&amp;')
    .replace(/</g, '&lt;')
    .replace(/>/g, '&gt;')
    .replace(/"/g, '&quot;');
}

export function renderBase64Page(st: Base64UiState): string {
  return `
    <div class="b64-page" id="base64-page">
      <section class="b64-panel" id="base64-panel">
        ${renderBase64Inner(st)}
      </section>
    </div>
  `;
}

export function renderBase64Inner(st: Base64UiState): string {
  return `
    <div class="b64-head">
      <h2 class="b64-heading">Base64 转化</h2>
      <div class="tabs">
        <button type="button" class="tab ${st.mode === 'image-to-base64' ? 'active' : ''}"
          data-action="base64-mode" data-mode="image-to-base64">图 → Base64</button>
        <button type="button" class="tab ${st.mode === 'base64-to-image' ? 'active' : ''}"
          data-action="base64-mode" data-mode="base64-to-image">Base64 → 图</button>
      </div>
    </div>
    <div class="b64-body convert-fade" id="base64-body">
      ${st.mode === 'image-to-base64' ? renderImageToText(st) : renderTextToImage(st)}
    </div>
  `;
}

function cardHead(title: string, actions = ''): string {
  return `
    <div class="b64-card-head">
      <span class="b64-card-title">${escapeHtml(title)}</span>
      <div class="b64-card-actions">${actions}</div>
    </div>
  `;
}

function renderImageToText(st: Base64UiState): string {
  const hasSource = Boolean(st.source?.dataUrl);
  return `
    <div class="b64-stack b64-split">
      <div class="b64-block">
        ${cardHead('图片')}
        <div class="b64-card-body">
          ${
            hasSource
              ? `<div class="b64-drop has-image" id="base64-dropzone">
                   <img src="${escapeHtml(st.source!.dataUrl)}" alt="" />
                   <div class="meta" style="margin:0">${st.source!.width}×${st.source!.height} · ${escapeHtml(st.source!.name)}</div>
                   <div class="actions" style="margin:0">
                     <button type="button" data-action="base64-encode" ${st.busy ? 'disabled' : ''}>生成 Base64</button>
                     <button type="button" class="secondary" data-action="base64-copy-image">复制图片</button>
                   </div>
                 </div>`
              : `<div class="b64-drop" id="base64-dropzone" role="button" tabindex="0">
                   <div class="b64-drop-pulse" aria-hidden="true"></div>
                   <p class="meta" style="margin:0">拖入或选择图片 · 再次拖入将替换</p>
                   <button type="button" data-action="base64-pick-image">选择图片</button>
                 </div>`
          }
        </div>
      </div>
      <div class="b64-block">
        ${cardHead(
          'Base64',
          `<button type="button" class="secondary" data-action="base64-copy-text" ${st.text ? '' : 'disabled'}>复制</button>`
        )}
        <div class="b64-card-body">
          ${
            st.busy
              ? `<div class="b64-drop is-loading"><div class="b64-spinner"></div><p class="meta" style="margin:0">生成中…</p></div>`
              : `<textarea class="b64-editor input-mono" id="base64-editor" readonly placeholder="点击「生成 Base64」后显示…">${escapeHtml(st.text)}</textarea>`
          }
          ${st.error ? `<p class="meta" style="color:var(--danger)">${escapeHtml(st.error)}</p>` : ''}
        </div>
      </div>
    </div>
  `;
}

function renderTextToImage(st: Base64UiState): string {
  return `
    <div class="b64-stack b64-split">
      <div class="b64-block">
        ${cardHead('Base64')}
        <div class="b64-card-body">
          <textarea class="b64-editor input-mono" id="base64-editor" placeholder="粘贴 data:image/...;base64,... 或纯 Base64">${escapeHtml(st.text)}</textarea>
          <div class="actions" style="justify-content:flex-start;margin:8px 0 0">
            <button type="button" data-action="base64-decode" ${st.busy ? 'disabled' : ''}>转为图片</button>
            <button type="button" class="secondary" data-action="base64-copy-text" ${st.text ? '' : 'disabled'}>复制 Base64</button>
          </div>
          ${st.error ? `<p class="meta" style="color:var(--danger)">${escapeHtml(st.error)}</p>` : ''}
        </div>
      </div>
      <div class="b64-block">
        ${cardHead(
          '预览',
          `<button type="button" class="secondary" data-action="base64-copy-image" ${st.previewUrl ? '' : 'disabled'}>复制图片</button>`
        )}
        <div class="b64-card-body">
          ${
            st.busy
              ? `<div class="b64-drop is-loading"><div class="b64-spinner"></div><p class="meta" style="margin:0">解码中…</p></div>`
              : st.previewUrl
                ? `<div class="b64-thumb convert-pop"><img src="${escapeHtml(st.previewUrl)}" alt="解码预览" /></div>`
                : `<div class="b64-drop awaiting"><p class="meta" style="margin:0">解码后在此预览</p></div>`
          }
        </div>
      </div>
    </div>
  `;
}
