import { copyImageFromDataUrl, copyText } from '../../../shared/webview/utils/clipboard';
import {
  extractImageFile,
  extractImagePath,
  filePathOf,
  normalizeBase64Input,
  sourceFromBlob,
  sourceFromDataUrl,
} from '../../../shared/webview/utils/source';
import type { Base64Host, Base64UiState } from './types';

function patch(host: Base64Host, partial: Partial<Base64UiState>): Base64UiState {
  const next = { ...host.getState(), ...partial };
  host.setState(next);
  return next;
}

export function bindBase64Events(host: Base64Host): void {
  bindDrop(host);
  const editor = document.getElementById('base64-editor') as HTMLTextAreaElement | null;
  if (editor && !editor.readOnly) {
    editor.addEventListener('input', () => {
      patch(host, { text: editor.value, error: undefined });
    });
  }
}

function bindDrop(host: Base64Host): void {
  const dropzone = document.getElementById('base64-dropzone');
  if (!dropzone) {
    return;
  }
  dropzone.addEventListener('dragover', (e) => {
    e.preventDefault();
    dropzone.classList.add('dragover');
  });
  dropzone.addEventListener('dragleave', () => dropzone.classList.remove('dragover'));
  dropzone.addEventListener('drop', (e) => {
    e.preventDefault();
    dropzone.classList.remove('dragover');
    void handleDrop(host, e.dataTransfer);
  });
  if (!host.getState().source && host.getState().mode === 'image-to-base64') {
    dropzone.addEventListener('click', (e) => {
      if ((e.target as HTMLElement | null)?.closest('button')) {
        return;
      }
      host.post({ type: 'convertPickImage' });
    });
  }
}

async function handleDrop(host: Base64Host, dt: DataTransfer | null): Promise<void> {
  if (!dt) {
    return;
  }
  const file = extractImageFile(dt);
  const localPath = extractImagePath(dt) ?? (file ? filePathOf(file) : undefined);
  if (localPath && (!file || file.size === 0)) {
    host.post({ type: 'convertLoadFromPath', path: localPath });
    return;
  }
  if (!file) {
    if (localPath) {
      host.post({ type: 'convertLoadFromPath', path: localPath });
      return;
    }
    patch(host, { error: '请拖入图片文件' });
    host.paint();
    return;
  }
  try {
    const source = await sourceFromBlob(file, file.name, localPath ?? filePathOf(file));
    patch(host, {
      source,
      error: undefined,
      text: '',
      previewUrl: undefined,
    });
    host.paint();
  } catch (err) {
    if (localPath) {
      host.post({ type: 'convertLoadFromPath', path: localPath });
      return;
    }
    host.showToast('error', err instanceof Error ? err.message : String(err));
  }
}

export async function applyBase64SourceFromHost(
  host: Base64Host,
  path: string,
  name: string,
  dataUrl: string
): Promise<void> {
  try {
    const source = await sourceFromDataUrl(dataUrl, name);
    source.path = path;
    patch(host, {
      source,
      error: undefined,
      text: '',
      previewUrl: undefined,
    });
    host.paint();
  } catch (err) {
    host.showToast('error', err instanceof Error ? err.message : String(err));
  }
}

export function handleBase64Action(
  host: Base64Host,
  action: string,
  el: HTMLElement
): boolean {
  switch (action) {
    case 'base64-pick-image':
      host.post({ type: 'convertPickImage' });
      return true;
    case 'base64-mode': {
      const mode = el.getAttribute('data-mode');
      if (mode !== 'image-to-base64' && mode !== 'base64-to-image') {
        return true;
      }
      const bp = host.getState();
      if (mode === bp.mode) {
        return true;
      }
      patch(host, {
        mode,
        error: undefined,
        previewUrl: undefined,
        text: mode === 'image-to-base64' ? '' : bp.text,
        busy: false,
      });
      host.paint();
      return true;
    }
    case 'base64-encode': {
      const bp = host.getState();
      if (!bp.source) {
        host.showToast('warn', '请先选择图片');
        return true;
      }
      patch(host, { busy: true, error: undefined });
      host.paint();
      window.setTimeout(() => {
        patch(host, { text: bp.source!.dataUrl, busy: false });
        host.paint();
        host.showToast('info', '已生成 Base64');
      }, 120);
      return true;
    }
    case 'base64-copy-text': {
      const editor = document.getElementById('base64-editor') as HTMLTextAreaElement | null;
      const text = editor?.value || host.getState().text;
      if (!text) {
        host.showToast('warn', '没有可复制的内容');
        return true;
      }
      void copyText(text).then(
        () => host.showToast('info', 'Base64 已复制到剪切板'),
        () => host.showToast('error', '复制失败')
      );
      return true;
    }
    case 'base64-copy-image': {
      const bp = host.getState();
      const url =
        bp.mode === 'base64-to-image' ? bp.previewUrl : bp.source?.dataUrl;
      if (!url) {
        host.showToast('warn', '没有可复制的图片');
        return true;
      }
      void copyImageFromDataUrl(url).then(
        (mode) =>
          host.showToast(
            'info',
            mode === 'image'
              ? '图片已复制到剪切板'
              : '当前环境不支持复制图片，已复制为 data URL'
          ),
        (err) =>
          host.showToast('error', err instanceof Error ? err.message : '复制失败')
      );
      return true;
    }
    case 'base64-paste':
      void navigator.clipboard.readText().then(
        (text) => {
          patch(host, { text, error: undefined });
          host.paint();
          host.showToast('info', '已粘贴');
        },
        () => host.showToast('error', '无法读取剪切板')
      );
      return true;
    case 'base64-decode': {
      const editor = document.getElementById('base64-editor') as HTMLTextAreaElement | null;
      const raw = editor?.value ?? host.getState().text;
      const dataUrl = normalizeBase64Input(raw);
      if (!dataUrl) {
        patch(host, {
          text: raw,
          error: '请粘贴 Base64 或 data URL',
          previewUrl: undefined,
        });
        host.paint();
        return true;
      }
      patch(host, { text: raw, busy: true, error: undefined });
      host.paint();
      void sourceFromDataUrl(dataUrl, 'from-base64.png')
        .then((src) => {
          patch(host, {
            previewUrl: src.dataUrl,
            busy: false,
            error: undefined,
          });
          host.paint();
        })
        .catch(() => {
          patch(host, {
            busy: false,
            error: 'Base64 无法解码为图片，请检查内容',
            previewUrl: undefined,
          });
          host.paint();
        });
      return true;
    }
    default:
      return false;
  }
}

export function handleBase64HostMessage(
  host: Base64Host,
  msg: { type: string; path?: string; name?: string; dataUrl?: string }
): boolean {
  if (msg.type === 'convertImagePicked') {
    if (msg.path && msg.name && msg.dataUrl) {
      void applyBase64SourceFromHost(host, msg.path, msg.name, msg.dataUrl);
    } else {
      host.showToast('error', '图片加载失败：数据不完整');
    }
    return true;
  }
  return false;
}
