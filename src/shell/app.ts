import { post } from './api';
import { clearConfirm } from './confirm';
import { showToast } from './feedback';
import { handleShellAction, renderShellLayout } from './layout';
import {
  getRoute,
  isRoute,
  setRouteChangeHandler,
  setRouteFromHost,
  type Route,
} from './router';
import { setRenderer, requestRender } from './runtime';
import { shellState } from './state';
import type { FeatureView } from './types';
import { compressView } from '../modules/image-compress/view';
import { icoView } from '../modules/image-ico/view';
import { base64View } from '../modules/image-base64/view';

const app = document.getElementById('app')!;

const views: Record<Route, FeatureView> = {
  compress: compressView,
  ico: icoView,
  base64: base64View,
};

function activeView(): FeatureView {
  return views[getRoute()];
}

function render(): void {
  shellState.route = getRoute();
  const view = activeView();
  app.innerHTML = renderShellLayout(view);
  bindEvents();
  view.bind();
}

let eventsBound = false;

/** 事件委托：局部 paint 后按钮无需重新绑定 */
function bindEvents(): void {
  if (eventsBound) {
    return;
  }
  eventsBound = true;
  app.addEventListener('click', (e) => {
    const raw = e.target as HTMLElement | null;
    if (!raw) {
      return;
    }
    const target = raw.closest('[data-action]') as HTMLElement | null;
    if (!target || !app.contains(target)) {
      return;
    }
    if (target.classList.contains('modal-backdrop') && e.target !== target) {
      return;
    }
    e.stopPropagation();
    const action = target.getAttribute('data-action');
    const id = target.getAttribute('data-id') ?? undefined;
    handleAction(action, id, target, e);
  });
}

function handleAction(
  action: string | null,
  id: string | undefined,
  el: HTMLElement,
  e: Event
): void {
  if (!action) {
    return;
  }
  if (
    (action === 'close-settings' ||
      action === 'close-preview' ||
      action === 'close-confirm') &&
    el.classList.contains('modal-backdrop') &&
    e.target !== el
  ) {
    return;
  }

  if (handleShellAction(action, () => activeView().onLeave?.())) {
    return;
  }

  const view = activeView();
  if (view.handleAction(action, id, el, e)) {
    return;
  }
}

function onHostMessage(event: MessageEvent<{ type: string; [k: string]: unknown }>): void {
  const msg = event.data;
  if (msg.type === 'toast') {
    showToast(
      (msg.level as 'info' | 'warn' | 'error') ?? 'info',
      String(msg.message ?? '')
    );
    return;
  }
  if (msg.type === 'init') {
    const feature = msg.feature;
    if (isRoute(feature)) {
      setRouteFromHost(feature);
      shellState.route = feature;
    }
    // 各功能可从 init 读取公共字段（如 defaultSaveDir）
    compressView.handleMessage(msg);
    icoView.handleMessage(msg);
    base64View.handleMessage(msg);
    render();
    return;
  }

  // 图片选取 / 保存结果只交给当前路由，避免串台
  const exclusive = new Set([
    'convertImagePicked',
    'convertSaved',
    'convertSaveError',
  ]);
  const view = activeView();
  if (view.handleMessage(msg)) {
    return;
  }
  if (exclusive.has(msg.type)) {
    return;
  }
  for (const v of Object.values(views)) {
    if (v.id !== view.id && v.handleMessage(msg)) {
      return;
    }
  }
}

function onKeydown(e: KeyboardEvent): void {
  if (e.key === 'Escape' && shellState.confirm) {
    e.preventDefault();
    clearConfirm();
    return;
  }
  activeView().onKeydown?.(e);
}

export function boot(): void {
  setRenderer(render);
  setRouteChangeHandler((route) => {
    shellState.route = route;
    requestRender();
  });
  window.addEventListener('message', onHostMessage);
  window.addEventListener('keydown', onKeydown);
  post({ type: 'ready' });
  render();
}
