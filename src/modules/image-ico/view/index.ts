import { post } from '../../../shell/api';
import { clearConfirm, showConfirm } from '../../../shell/confirm';
import { showToast } from '../../../shell/feedback';
import { requestRender } from '../../../shell/runtime';
import type { FeatureView } from '../../../shell/types';
import {
  bindIcoEvents,
  handleIcoAction,
  handleIcoHostMessage,
  layoutCropImage,
} from './events';
import { renderIcoInner, renderIcoPage } from './pages/ico';
import { resetIcoState, setIcoState, state } from './state';
import type { IcoHost } from './types';

function paintIco(): void {
  const panel = document.getElementById('ico-panel');
  if (!panel) {
    requestRender();
    return;
  }
  panel.innerHTML = renderIcoInner(state);
  bindIcoEvents(icoHost);
  requestAnimationFrame(() => layoutCropImage(state));
}

const icoHost: IcoHost = {
  getState: () => state,
  setState: (next) => setIcoState(next),
  post: (msg) => post(msg),
  paint: () => paintIco(),
  showToast: (level, message) => showToast(level, message),
  showSaveSuccess: (path, onDone) => {
    showConfirm({
      title: '保存成功',
      message: `ICO 已保存，请刷新工作目录查看。\n\n保存路径：${path}`,
      confirmText: '知道了',
      hideCancel: true,
      onConfirm: () => {
        clearConfirm();
        onDone?.();
      },
    });
  },
};

export const icoView: FeatureView = {
  id: 'ico',

  render() {
    return renderIcoPage(state);
  },

  bind() {
    bindIcoEvents(icoHost);
    requestAnimationFrame(() => layoutCropImage(state));
  },

  handleAction(action, _id, el) {
    return handleIcoAction(icoHost, action, el);
  },

  handleMessage(msg) {
    return handleIcoHostMessage(icoHost, msg);
  },
};

export { resetIcoState };
