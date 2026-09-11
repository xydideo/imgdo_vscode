import type { HostToWebview } from '../panel/messages';
import {
  formatTargetWidth,
  isTargetSizeModified,
  parseTargetWidthInput,
} from '../scan/targetSize';
import { post } from '../../../shell/api';
import { clearConfirm, getConfirm, showConfirm } from '../../../shell/confirm';
import { showBanner, showToast } from '../../../shell/feedback';
import { requestRender } from '../../../shell/runtime';
import { state } from './state';
import { extractDropFolderPath } from './utils/drop';
import {
  buildFormatChangeCopyText,
  formatChangePairs,
  indexInResults,
  largeResults,
  largeThreshold,
  replaceableResults,
} from './utils/results';
import { clearCompressItemTimer, ensureCompressItemTimer } from './utils/timer';

export function applyTargetSizeEdit(id: string, raw: string, inputEl: HTMLInputElement): void {
  const item = state.items.find((i) => i.id === id);
  if (!item) {
    return;
  }
  const parsed = parseTargetWidthInput(raw, item.width, item.height);
  if (!parsed) {
    inputEl.value = formatTargetWidth(item.targetWidth);
    showToast('warn', '请输入有效的目标宽度（正整数）');
    return;
  }
  const changed =
    parsed.targetWidth !== item.targetWidth || parsed.targetHeight !== item.targetHeight;
  if (!changed) {
    inputEl.value = formatTargetWidth(item.targetWidth);
    inputEl.classList.toggle('is-modified', isTargetSizeModified(item));
    return;
  }
  state.items = state.items.map((i) =>
    i.id === id
      ? { ...i, targetWidth: parsed.targetWidth, targetHeight: parsed.targetHeight }
      : i
  );
  post({
    type: 'updateTargetSize',
    id,
    targetWidth: parsed.targetWidth,
    targetHeight: parsed.targetHeight,
  });
  requestRender();
}

type ActionHandler = (
  action: string,
  id: string | undefined,
  el: HTMLElement,
  e: Event
) => void;

/** 绑定压缩页特有 DOM：目标宽度输入、dropzone；通用 data-action 由 app 注入 onAction */
export function bindCompressDomEvents(onAction: ActionHandler): void {
  const app = document.getElementById('app');
  if (!app) {
    return;
  }

  app.querySelectorAll<HTMLInputElement>('[data-target-size]').forEach((input) => {
    input.addEventListener('click', (e) => e.stopPropagation());
    input.addEventListener('keydown', (e) => {
      if (e.key === 'Enter') {
        e.preventDefault();
        input.blur();
      }
    });
    input.addEventListener('change', () => {
      const id = input.getAttribute('data-id');
      if (!id) {
        return;
      }
      applyTargetSizeEdit(id, input.value, input);
    });
  });

  const dropzone = document.getElementById('dropzone');
  if (dropzone) {
    // 点击空白区域才选文件夹；按钮各自处理，避免「工作区一键查找」再弹出选目录
    dropzone.addEventListener('click', (e) => {
      const t = e.target as HTMLElement | null;
      if (t?.closest('button, .actions, input, a, label')) {
        return;
      }
      onAction('pick-folder', undefined, dropzone, e);
    });
    dropzone.addEventListener('keydown', (e) => {
      if (e.key !== 'Enter' && e.key !== ' ') {
        return;
      }
      const t = e.target as HTMLElement | null;
      if (t?.closest('button, .actions, input, a, label')) {
        return;
      }
      e.preventDefault();
      onAction('pick-folder', undefined, dropzone, e);
    });
    dropzone.addEventListener('dragenter', (e) => {
      e.preventDefault();
      e.stopPropagation();
      dropzone.classList.add('dragover');
      state.dropHint = '按住 Shift 再松开，即可放入文件夹；或直接点击选择';
      const hint = dropzone.querySelector('.meta');
      void hint;
    });
    dropzone.addEventListener('dragover', (e) => {
      e.preventDefault();
      e.stopPropagation();
      if (e.dataTransfer) {
        e.dataTransfer.dropEffect = 'copy';
      }
      dropzone.classList.add('dragover');
    });
    dropzone.addEventListener('dragleave', (e) => {
      e.preventDefault();
      dropzone.classList.remove('dragover');
    });
    dropzone.addEventListener('drop', (e) => {
      e.preventDefault();
      e.stopPropagation();
      dropzone.classList.remove('dragover');
      state.dropHint = undefined;

      const dt = e.dataTransfer;
      if (!dt) {
        post({ type: 'pickFolder' });
        return;
      }

      const folderPath = extractDropFolderPath(dt);
      if (folderPath) {
        post({ type: 'scanFolder', folderPath });
        return;
      }

      // Webview 拿不到系统路径时，直接打开系统选目录（免再点一次）
      showToast('info', '当前环境无法直接读取拖入路径，已打开文件夹选择器');
      post({ type: 'pickFolder' });
    });
  }
}

export function handleCompressAction(
  action: string,
  id: string | undefined,
  el: HTMLElement,
  _e: Event
): boolean {
  switch (action) {
    case 'open-settings':
      state.settingsOpen = true;
      requestRender();
      return true;
    case 'close-settings':
      state.settingsOpen = false;
      requestRender();
      return true;
    case 'save-settings': {
      const backupOnReplace = (document.getElementById('set-backup') as HTMLInputElement).checked;
      const compressRate = Number((document.getElementById('set-rate') as HTMLInputElement).value);
      const minSavingPct = Number(
        (document.getElementById('set-min-saving') as HTMLInputElement).value
      );
      const minKb = Number((document.getElementById('set-min') as HTMLInputElement).value);
      const largeKb = Number((document.getElementById('set-large') as HTMLInputElement).value);
      post({
        type: 'saveSettings',
        settings: {
          backupOnReplace,
          compressRate,
          minSavingRatio: Math.max(0.05, Math.min(0.7, minSavingPct / 100)),
          minSizeBytes: Math.round(minKb * 1024),
          largeImageMinBytes: Math.round(largeKb * 1024),
        },
      });
      state.settingsOpen = false;
      requestRender();
      return true;
    }
    case 'pick-folder':
      post({ type: 'pickFolder' });
      return true;
    case 'scan-workspace':
      post({ type: 'scanWorkspace' });
      return true;
    case 'tab-all':
      state.listTab = 'all';
      requestRender();
      return true;
    case 'tab-tree':
      state.listTab = 'tree';
      requestRender();
      return true;
    case 'result-tab-replace':
      state.resultTab = 'replace';
      {
        const list = replaceableResults();
        if (list.length) {
          state.compareIndex = indexInResults(list[0]);
        }
      }
      requestRender();
      return true;
    case 'result-tab-large':
      state.resultTab = 'large';
      {
        const list = largeResults();
        if (list.length) {
          state.compareIndex = indexInResults(list[0]);
        }
      }
      requestRender();
      return true;
    case 'back-entry':
      state.page = 'entry';
      state.items = [];
      state.results = [];
      post({ type: 'resetToEntry' });
      requestRender();
      return true;
    case 'start-compress':
      state.page = 'compressing';
      state.progress = { done: 0, total: state.items.length };
      requestRender();
      post({ type: 'startCompress', ids: state.items.map((i) => i.id) });
      return true;
    case 'cancel-compress':
      post({ type: 'cancelCompress' });
      state.progress = {
        done: state.progress?.done ?? 0,
        total: state.progress?.total ?? 0,
        message: '正在取消…',
      };
      requestRender();
      return true;
    case 'exclude-queue':
      if (id) {
        post({ type: 'excludeFromQueue', id });
      }
      return true;
    case 'preview':
      if (id) {
        state.previewItem = state.items.find((i) => i.id === id);
        state.previewActualSize = false;
        requestRender();
      }
      return true;
    case 'preview-result':
      if (id) {
        const item = state.results.find((i) => i.id === id);
        if (item) {
          state.previewWhich =
            (el.getAttribute('data-which') as 'original' | 'compressed') || 'compressed';
          state.previewItem = item;
          state.previewActualSize = false;
          requestRender();
        }
      }
      return true;
    case 'preview-toggle-100':
      state.previewActualSize = !state.previewActualSize;
      requestRender();
      return true;
    case 'close-preview':
      state.previewItem = undefined;
      state.previewActualSize = false;
      requestRender();
      return true;
    case 'convert-jpg':
      if (id) {
        state.page = 'compressing';
        state.progress = { done: 0, total: 1, message: '压成 JPG…' };
        requestRender();
        post({ type: 'convertToJpg', id });
      }
      return true;
    case 'select-result':
      if (id) {
        const idx = state.results.findIndex((r) => r.id === id);
        if (idx >= 0) {
          state.compareIndex = idx;
          requestRender();
        }
      }
      return true;
    case 'recompress-one':
      if (id) {
        state.page = 'compressing';
        state.progress = { done: 0, total: 1, message: '继续加压…' };
        requestRender();
        post({ type: 'recompress', ids: [id] });
      }
      return true;
    case 'ease-one':
      if (id) {
        state.page = 'compressing';
        state.progress = { done: 0, total: 1, message: '稍微减压…' };
        requestRender();
        post({ type: 'easeCompress', id });
      }
      return true;
    case 'recompress-large': {
      const ids = largeResults().map((r) => r.id);
      if (!ids.length) {
        return true;
      }
      state.page = 'compressing';
      state.progress = { done: 0, total: ids.length, message: '大图再压…' };
      requestRender();
      post({ type: 'recompress', ids });
      return true;
    }
    case 'exclude-replace':
      if (!id) {
        return true;
      }
      showConfirm({
        title: '取消压缩',
        message: '确定将该图片从待替换列表中排除吗？排除后不会写回项目。',
        confirmText: '确认排除',
        onConfirm: () => {
          post({ type: 'excludeFromReplace', id });
          clearConfirm();
        },
      });
      requestRender();
      return true;
    case 'confirm-replace':
      showConfirm({
        title: '一键替换提示',
        message:
          '请先核查清晰度。确认后将：① 备份本次待替换原图 → ② 删除这些原图 → ③ 写入压缩结果。若 PNG 已转 JPG，会删除原 PNG 并放入同名 JPG。',
        confirmText: '确认替换',
        formatChanges: formatChangePairs(),
        onConfirm: () => {
          post({ type: 'confirmReplace' });
          clearConfirm();
          requestRender();
        },
      });
      requestRender();
      return true;
    case 'copy-format-changes': {
      const changes = getConfirm()?.formatChanges ?? formatChangePairs();
      if (!changes.length) {
        showToast('warn', '没有换格式项可复制');
        return true;
      }
      const text = buildFormatChangeCopyText(changes);
      void navigator.clipboard.writeText(text).then(
        () => showToast('info', '已复制给 AI 的换格式清单'),
        () => showToast('error', '复制失败，请手动选择复制')
      );
      return true;
    }
    case 'close-confirm':
      clearConfirm();
      requestRender();
      return true;
    case 'do-confirm':
      getConfirm()?.onConfirm();
      requestRender();
      return true;
    case 'close-replace-report':
      state.replaceReport = undefined;
      state.page = 'entry';
      state.items = [];
      state.results = [];
      state.summary = undefined;
      state.compareIndex = 0;
      state.resultTab = 'replace';
      post({ type: 'resetToEntry' });
      requestRender();
      return true;
    default:
      return false;
  }
}

export function handleCompressHostMessage(msg: HostToWebview): boolean {
  switch (msg.type) {
    case 'init':
      state.canScanWorkspace = msg.canScanWorkspace;
      state.workspaceLabel = msg.workspaceLabel;
      return true;
    case 'settings':
      state.settings = msg.settings;
      requestRender();
      return true;
    case 'scanStarted':
      state.page = 'scanning';
      requestRender();
      return true;
    case 'scanProgress':
      state.progress = { done: msg.current, total: 0, message: msg.message };
      requestRender();
      return true;
    case 'scanResult':
      state.items = msg.items;
      state.summary = msg.summary;
      state.page = 'list';
      state.listTab = 'all';
      requestRender();
      return true;
    case 'queueUpdated':
      // 取消压缩后只更新列表，不切换 Tab
      state.items = msg.items;
      state.summary = msg.summary;
      state.page = 'list';
      requestRender();
      return true;
    case 'scanError':
      state.page = 'entry';
      showToast('error', msg.message);
      return true;
    case 'compressStarted':
    case 'recompressStarted':
      clearCompressItemTimer();
      state.page = 'compressing';
      state.progress = { done: 0, total: msg.total };
      requestRender();
      return true;
    case 'compressProgress':
      // 取消中忽略进度，避免「正在取消…」被文件名冲掉
      if (state.progress?.message === '正在取消…') {
        return true;
      }
      state.progress = { done: msg.done, total: msg.total, message: msg.current };
      ensureCompressItemTimer(msg.current);
      requestRender();
      return true;
    case 'compressResult': {
      clearCompressItemTimer();
      const prevId = state.results[state.compareIndex]?.id;
      state.results = msg.items;
      const keepTab = state.page === 'compare' || state.page === 'compressing';
      state.page = 'compare';
      if (!keepTab || (state.resultTab === 'large' && !largeResults().length)) {
        state.resultTab = 'replace';
      }
      if (largeResults().length && replaceableResults().every((r) => r.compressedSize >= largeThreshold())) {
        // 若几乎都是大图，仍默认待替换；不强制切大图
      }
      const prefer = prevId ? msg.items.findIndex((i) => i.id === prevId) : -1;
      state.compareIndex =
        prefer >= 0
          ? prefer
          : Math.max(
              0,
              msg.items.findIndex((i) => !i.skipped && !i.excluded)
            );
      if (state.compareIndex < 0) {
        state.compareIndex = 0;
      }
      requestRender();
      return true;
    }
    case 'compressError':
      clearCompressItemTimer();
      state.page = state.results.length ? 'compare' : 'list';
      if (msg.message.includes('取消')) {
        showToast('info', msg.message);
      } else {
        showToast('error', msg.message);
      }
      return true;
    case 'replaceResult':
      if (msg.ok) {
        showBanner('替换成功');
        state.replaceReport = {
          message: msg.message,
          backupPath: msg.backupPath,
          items: msg.items ?? [],
        };
        requestRender();
      } else {
        showToast('error', msg.message);
      }
      return true;
    case 'toast':
      showToast(msg.level, msg.message);
      return true;
    default:
      return false;
  }
}
