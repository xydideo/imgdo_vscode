import { getRoute } from './router';

export function renderHeader(): string {
  const route = getRoute();
  const title =
    route === 'ico'
      ? 'ImgDo · ICO 生成'
      : route === 'base64'
        ? 'ImgDo · Base64 转化'
        : 'ImgDo · 图片压缩 · 一键替换';
  return `
    <header class="header">
      <div class="header-brand">
        <span class="brand-dot"></span>
        <h1>${title}</h1>
      </div>
      <div class="tabs feature-tabs">
        <button type="button" class="tab ${route === 'compress' ? 'active' : ''}"
          data-action="navigate-compress">图片压缩</button>
        <button type="button" class="tab ${route === 'ico' ? 'active' : ''}"
          data-action="navigate-ico">ICO 生成</button>
        <button type="button" class="tab ${route === 'base64' ? 'active' : ''}"
          data-action="navigate-base64">Base64 转化</button>
      </div>
      <div class="header-actions">
        ${
          route === 'compress'
            ? `<button class="icon-btn settings-btn" type="button" data-action="open-settings" title="全局设置" aria-label="全局设置">
          <svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="1.8" stroke-linecap="round" stroke-linejoin="round" aria-hidden="true">
            <circle cx="12" cy="12" r="3"></circle>
            <path d="M12 1v2.5M12 20.5V23M4.2 4.2l1.8 1.8M18 18l1.8 1.8M1 12h2.5M20.5 12H23M4.2 19.8l1.8-1.8M18 6l1.8-1.8"></path>
          </svg>
        </button>`
            : ''
        }
      </div>
    </header>
  `;
}
