import { renderConfirmSlot, clearConfirm, getConfirm } from './confirm';
import { renderBannerSlot, renderToastSlot } from './feedback';
import { renderHeader } from './header';
import { getRoute, navigate } from './router';
import type { FeatureView } from './types';

export function renderShellLayout(active: FeatureView): string {
  const route = getRoute();
  const mainClass =
    route === 'ico' || route === 'base64' ? 'main main-tool' : 'main';
  return `
    ${renderHeader()}
    <div class="${mainClass}">
      ${active.render()}
    </div>
    ${active.renderOverlays?.() ?? ''}
    ${renderConfirmSlot()}
    ${renderBannerSlot()}
    ${renderToastSlot()}
  `;
}

export function handleShellAction(
  action: string,
  leaveActive?: () => void
): boolean {
  if (action === 'close-confirm') {
    clearConfirm();
    return true;
  }
  if (action === 'do-confirm') {
    const c = getConfirm();
    c?.onConfirm();
    return true;
  }
  if (action === 'navigate-compress') {
    leaveActive?.();
    navigate('compress');
    return true;
  }
  if (action === 'navigate-ico') {
    leaveActive?.();
    navigate('ico');
    return true;
  }
  if (action === 'navigate-base64') {
    leaveActive?.();
    navigate('base64');
    return true;
  }
  // 兼容旧 action
  if (action === 'navigate-convert') {
    leaveActive?.();
    navigate('ico');
    return true;
  }
  return false;
}
