import { post } from '../../../shell/api';
import { showToast } from '../../../shell/feedback';
import { requestRender } from '../../../shell/runtime';
import type { FeatureView } from '../../../shell/types';
import {
  bindBase64Events,
  handleBase64Action,
  handleBase64HostMessage,
} from './events';
import { renderBase64Inner, renderBase64Page } from './pages/base64';
import { resetBase64State, setBase64State, state } from './state';
import type { Base64Host } from './types';

function paintBase64(): void {
  const panel = document.getElementById('base64-panel');
  if (!panel) {
    requestRender();
    return;
  }
  const editor = document.getElementById('base64-editor') as HTMLTextAreaElement | null;
  const keep = editor
    ? {
        start: editor.selectionStart,
        end: editor.selectionEnd,
        scroll: editor.scrollTop,
        focused: document.activeElement === editor,
        value: editor.value,
      }
    : null;
  if (keep && editor && !editor.readOnly) {
    setBase64State({ ...state, text: keep.value });
  }
  panel.innerHTML = renderBase64Inner(state);
  bindBase64Events(base64Host);
  if (keep?.focused) {
    const next = document.getElementById('base64-editor') as HTMLTextAreaElement | null;
    if (next) {
      next.focus();
      try {
        next.setSelectionRange(keep.start, keep.end);
        next.scrollTop = keep.scroll;
      } catch {
        // ignore
      }
    }
  }
}

const base64Host: Base64Host = {
  getState: () => state,
  setState: (next) => setBase64State(next),
  post: (msg) => post(msg),
  paint: () => paintBase64(),
  showToast: (level, message) => showToast(level, message),
};

export const base64View: FeatureView = {
  id: 'base64',

  render() {
    return renderBase64Page(state);
  },

  bind() {
    bindBase64Events(base64Host);
  },

  handleAction(action, _id, el) {
    return handleBase64Action(base64Host, action, el);
  },

  handleMessage(msg) {
    return handleBase64HostMessage(base64Host, msg);
  },
};

export { resetBase64State };
