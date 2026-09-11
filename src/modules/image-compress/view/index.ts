import type { FeatureView } from '../../../shell/types';
import { requestRender } from '../../../shell/runtime';
import {
  bindCompressDomEvents,
  handleCompressAction,
  handleCompressHostMessage,
} from './events';
import { renderCompare } from './pages/compare';
import { renderCompressing } from './pages/compressing';
import { renderEntry } from './pages/entry';
import { renderList } from './pages/list';
import {
  renderPreviewModal,
  renderReplaceReportModal,
  renderSettingsModal,
} from './pages/settings';
import { state } from './state';
import { escapeHtml } from '../../../shared/webview/utils/html';
import {
  currentResultList,
  indexInResults,
  isComparePreviewItem,
} from './utils/results';

function renderCompressPage(): string {
  switch (state.page) {
    case 'entry':
      return renderEntry();
    case 'scanning':
      return `<div class="empty">正在扫描图片…${
        state.progress
          ? `<div class="meta">${escapeHtml(state.progress.message ?? '')}</div>`
          : ''
      }</div>`;
    case 'list':
      return renderList();
    case 'compressing':
      return renderCompressing();
    case 'compare':
      return renderCompare();
    default:
      return '';
  }
}

function onAction(
  action: string,
  id: string | undefined,
  el: HTMLElement,
  e: Event
): void {
  handleCompressAction(action, id, el, e);
}

export const compressView: FeatureView = {
  id: 'compress',

  render() {
    return renderCompressPage();
  },

  renderOverlays() {
    return `
      ${state.settingsOpen ? renderSettingsModal() : ''}
      ${state.previewItem ? renderPreviewModal() : ''}
      ${state.replaceReport ? renderReplaceReportModal() : ''}
    `;
  },

  bind() {
    bindCompressDomEvents(onAction);
  },

  handleAction(action, id, el, e) {
    return handleCompressAction(action, id, el, e);
  },

  handleMessage(msg) {
    return handleCompressHostMessage(msg as Parameters<typeof handleCompressHostMessage>[0]);
  },

  onLeave() {
    state.settingsOpen = false;
    state.previewItem = undefined;
  },

  onKeydown(e) {
    if (e.key === 'Escape') {
      if (state.replaceReport) {
        e.preventDefault();
        handleCompressAction('close-replace-report', undefined, document.body, e);
        return true;
      }
      if (state.previewItem) {
        e.preventDefault();
        state.previewItem = undefined;
        state.previewActualSize = false;
        requestRender();
        return true;
      }
      if (state.settingsOpen) {
        e.preventDefault();
        state.settingsOpen = false;
        requestRender();
        return true;
      }
    }

    if (state.previewItem && isComparePreviewItem(state.previewItem)) {
      if (e.key === 'ArrowLeft' || e.key === 'ArrowRight') {
        e.preventDefault();
        state.previewWhich = e.key === 'ArrowLeft' ? 'original' : 'compressed';
        requestRender();
        return true;
      }
      if (e.key === 'ArrowUp' || e.key === 'ArrowDown') {
        e.preventDefault();
        const list = currentResultList();
        if (!list.length) {
          return true;
        }
        const curId = state.previewItem.id;
        let pos = list.findIndex((i) => i.id === curId);
        if (pos < 0) {
          pos = list.findIndex((i) => i.id === state.results[state.compareIndex]?.id);
        }
        if (pos < 0) {
          pos = 0;
        }
        pos =
          e.key === 'ArrowUp'
            ? (pos - 1 + list.length) % list.length
            : (pos + 1) % list.length;
        const next = list[pos];
        state.compareIndex = indexInResults(next);
        state.previewItem = next;
        requestRender();
        return true;
      }
    }

    if (state.page !== 'compare' || !state.results.length || state.previewItem) {
      return false;
    }
    const list = currentResultList();
    if (!list.length) {
      return false;
    }
    const curId = state.results[state.compareIndex]?.id;
    let pos = list.findIndex((i) => i.id === curId);
    if (pos < 0) {
      pos = 0;
    }
    if (e.key === 'ArrowUp' || e.key === 'ArrowLeft') {
      e.preventDefault();
      pos = (pos - 1 + list.length) % list.length;
      state.compareIndex = indexInResults(list[pos]);
      requestRender();
      return true;
    }
    if (e.key === 'ArrowDown' || e.key === 'ArrowRight') {
      e.preventDefault();
      pos = (pos + 1) % list.length;
      state.compareIndex = indexInResults(list[pos]);
      requestRender();
      return true;
    }
    return false;
  },
};
