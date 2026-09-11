import { escapeHtml } from '../shared/webview/utils/html';
import { requestRender } from './runtime';
import { shellState } from './state';

function toastRoot(): HTMLElement | null {
  return document.getElementById('shell-toast-root');
}

function bannerRoot(): HTMLElement | null {
  return document.getElementById('shell-banner-root');
}

export function renderToastSlot(): string {
  const t = shellState.toast;
  return `<div id="shell-toast-root">${
    t ? `<div class="toast ${t.level}">${escapeHtml(t.message)}</div>` : ''
  }</div>`;
}

export function renderBannerSlot(): string {
  const b = shellState.banner;
  return `<div id="shell-banner-root">${
    b ? `<div class="banner">${escapeHtml(b.message)}</div>` : ''
  }</div>`;
}

export function syncToastDom(): void {
  const root = toastRoot();
  if (!root) {
    requestRender();
    return;
  }
  const t = shellState.toast;
  root.innerHTML = t
    ? `<div class="toast ${t.level}">${escapeHtml(t.message)}</div>`
    : '';
}

export function syncBannerDom(): void {
  const root = bannerRoot();
  if (!root) {
    requestRender();
    return;
  }
  const b = shellState.banner;
  root.innerHTML = b
    ? `<div class="banner">${escapeHtml(b.message)}</div>`
    : '';
}

export function showToast(level: 'info' | 'warn' | 'error', message: string): void {
  shellState.toast = { level, message };
  syncToastDom();
  window.setTimeout(() => {
    if (shellState.toast?.message === message) {
      shellState.toast = undefined;
      syncToastDom();
    }
  }, 3200);
}

export function showBanner(message: string): void {
  shellState.banner = { message };
  syncBannerDom();
  window.setTimeout(() => {
    if (shellState.banner?.message === message) {
      shellState.banner = undefined;
      syncBannerDom();
    }
  }, 2800);
}
