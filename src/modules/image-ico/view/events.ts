import { bytesToBase64Payload } from '../../../shared/webview/utils/clipboard';
import {
  extractImageFile,
  extractImagePath,
  filePathOf,
  sourceFromBlob,
  sourceFromDataUrl,
} from '../../../shared/webview/utils/source';
import { encodeIcoFromSource, previewCroppedSquare } from './utils/encodeIco';
import {
  defaultCrop,
  saveDirOf,
  type IcoHost,
  type IcoSize,
  type IcoUiState,
  type SquareCrop,
} from './types';

function patch(host: IcoHost, partial: Partial<IcoUiState>): IcoUiState {
  const next = { ...host.getState(), ...partial };
  host.setState(next);
  return next;
}

export function bindIcoEvents(host: IcoHost): void {
  bindDrop(host);
  bindCropDrag(host);
  layoutCropImage(host.getState());
}

function bindDrop(host: IcoHost): void {
  const dropzone = document.getElementById('ico-dropzone');
  if (!dropzone) {
    return;
  }
  const onDrag = (e: DragEvent) => {
    e.preventDefault();
    e.stopPropagation();
    dropzone.classList.add('dragover');
  };
  dropzone.addEventListener('dragenter', onDrag);
  dropzone.addEventListener('dragover', (e) => {
    onDrag(e);
    if (e.dataTransfer) {
      e.dataTransfer.dropEffect = 'copy';
    }
  });
  dropzone.addEventListener('dragleave', (e) => {
    e.preventDefault();
    dropzone.classList.remove('dragover');
  });
  dropzone.addEventListener('drop', (e) => {
    e.preventDefault();
    e.stopPropagation();
    dropzone.classList.remove('dragover');
    void handleDrop(host, e.dataTransfer);
  });

  if (!host.getState().source) {
    dropzone.addEventListener('click', (e) => {
      if ((e.target as HTMLElement | null)?.closest('button')) {
        return;
      }
      host.post({ type: 'convertPickImage' });
    });
    dropzone.addEventListener('keydown', (e) => {
      if (e.key === 'Enter' || e.key === ' ') {
        e.preventDefault();
        host.post({ type: 'convertPickImage' });
      }
    });
  }
}

async function handleDrop(host: IcoHost, dt: DataTransfer | null): Promise<void> {
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
    patch(host, { dropHint: '请拖入图片文件' });
    host.paint();
    return;
  }

  try {
    const source = await sourceFromBlob(file, file.name, localPath ?? filePathOf(file));
    await applySource(host, source);
  } catch (err) {
    if (localPath) {
      host.post({ type: 'convertLoadFromPath', path: localPath });
      return;
    }
    host.showToast('error', err instanceof Error ? err.message : String(err));
  }
}

async function applySource(
  host: IcoHost,
  source: { name: string; path?: string; dataUrl: string; width: number; height: number; size: number }
): Promise<void> {
  const crop = defaultCrop(source.width, source.height);
  patch(host, {
    source,
    crop,
    dropHint: undefined,
    output: undefined,
    previewUrl: undefined,
  });
  host.paint();
  await refreshPreview(host);
}

async function refreshPreview(host: IcoHost): Promise<void> {
  const st = host.getState();
  if (!st.source || !st.crop) {
    return;
  }
  try {
    const previewUrl = await previewCroppedSquare(st.source, st.crop, st.size);
    patch(host, { previewUrl });
    host.paint();
  } catch {
    // ignore preview errors
  }
}

/** 正方形裁剪：拖动平移 */
function bindCropDrag(host: IcoHost): void {
  const viewport = document.getElementById('ico-crop-viewport');
  const img = document.getElementById('ico-crop-img') as HTMLImageElement | null;
  if (!viewport || !img || !host.getState().crop || !host.getState().source) {
    return;
  }

  let dragging = false;
  let lastX = 0;
  let lastY = 0;
  let dirty = false;

  const onMove = (clientX: number, clientY: number) => {
    const st = host.getState();
    const crop = st.crop;
    const source = st.source;
    if (!crop || !source || !dragging) {
      return;
    }
    const rect = viewport.getBoundingClientRect();
    const scale = crop.side / rect.width;
    const dx = (clientX - lastX) * scale;
    const dy = (clientY - lastY) * scale;
    lastX = clientX;
    lastY = clientY;
    const next: SquareCrop = {
      ...crop,
      x: clamp(crop.x - dx, 0, source.width - crop.side),
      y: clamp(crop.y - dy, 0, source.height - crop.side),
    };
    dirty = true;
    patch(host, { crop: next, output: undefined });
    layoutCropImage(host.getState());
  };

  viewport.addEventListener('pointerdown', (e) => {
    if ((e.target as HTMLElement).closest('button')) {
      return;
    }
    dragging = true;
    dirty = false;
    lastX = e.clientX;
    lastY = e.clientY;
    viewport.setPointerCapture(e.pointerId);
    viewport.classList.add('dragging');
  });
  viewport.addEventListener('pointermove', (e) => {
    if (!dragging) {
      return;
    }
    onMove(e.clientX, e.clientY);
  });
  const end = () => {
    if (!dragging) {
      return;
    }
    dragging = false;
    viewport.classList.remove('dragging');
    if (dirty) {
      void refreshPreview(host);
    }
  };
  viewport.addEventListener('pointerup', end);
  viewport.addEventListener('pointercancel', end);
}

export function layoutCropImage(st: IcoUiState): void {
  const img = document.getElementById('ico-crop-img') as HTMLImageElement | null;
  const viewport = document.getElementById('ico-crop-viewport');
  const crop = st.crop;
  const source = st.source;
  if (!img || !viewport || !crop || !source) {
    return;
  }
  const apply = () => {
    const rect = viewport.getBoundingClientRect();
    if (rect.width < 4) {
      return;
    }
    const scale = rect.width / crop.side;
    img.style.width = `${source.width * scale}px`;
    img.style.height = `${source.height * scale}px`;
    img.style.left = `${-crop.x * scale}px`;
    img.style.top = `${-crop.y * scale}px`;
  };
  if (img.complete) {
    apply();
  } else {
    img.onload = () => apply();
  }
}

function clamp(n: number, min: number, max: number): number {
  return Math.max(min, Math.min(max, n));
}

function clearAll(host: IcoHost): void {
  patch(host, {
    source: undefined,
    crop: undefined,
    output: undefined,
    previewUrl: undefined,
    dropHint: undefined,
    converting: false,
  });
  host.paint();
}

/** 生成 ICO 并保存到源图同目录 */
async function runSave(host: IcoHost): Promise<void> {
  const st = host.getState();
  if (!st.source || !st.crop) {
    return;
  }
  const dir = saveDirOf(st.source);
  if (!dir || !st.source.path) {
    host.showToast('warn', '请从资源管理器拖入或选择本地图片，以便保存到同目录');
    return;
  }

  const size = st.size;
  patch(host, { converting: true });
  host.paint();
  try {
    const output = await encodeIcoFromSource(st.source, st.crop, size);
    patch(host, { output, previewUrl: output.previewUrl });
    host.post({
      type: 'convertSave',
      base64: bytesToBase64Payload(output.bytes),
      suggestedName: output.suggestedName,
      mime: 'image/x-icon',
      besidePath: st.source.path,
    });
  } catch (err) {
    patch(host, { converting: false });
    host.paint();
    host.showToast('error', err instanceof Error ? err.message : String(err));
  }
}

export async function applyIcoSourceFromHost(
  host: IcoHost,
  path: string,
  name: string,
  dataUrl: string
): Promise<void> {
  try {
    const source = await sourceFromDataUrl(dataUrl, name);
    source.path = path;
    await applySource(host, source);
  } catch (err) {
    host.showToast('error', err instanceof Error ? err.message : String(err));
  }
}

export function handleIcoAction(host: IcoHost, action: string, el: HTMLElement): boolean {
  switch (action) {
    case 'ico-pick':
      host.post({ type: 'convertPickImage' });
      return true;
    case 'ico-select-size': {
      const size = Number(el.getAttribute('data-size')) as IcoSize;
      if (!ICO_SIZE_OPTIONS_SET.has(size) || host.getState().converting) {
        return true;
      }
      if (host.getState().size === size) {
        return true;
      }
      patch(host, { size, output: undefined });
      host.paint();
      void refreshPreview(host);
      return true;
    }
    case 'ico-save':
      void runSave(host);
      return true;
    case 'ico-clear':
      clearAll(host);
      return true;
    default:
      return false;
  }
}

const ICO_SIZE_OPTIONS_SET = new Set([24, 32, 40, 64, 128]);

export function handleIcoHostMessage(
  host: IcoHost,
  msg: { type: string; path?: string; name?: string; dataUrl?: string; message?: string }
): boolean {
  switch (msg.type) {
    case 'convertImagePicked':
      if (msg.path && msg.name && msg.dataUrl) {
        void applyIcoSourceFromHost(host, msg.path, msg.name, msg.dataUrl);
      } else {
        host.showToast('error', '图片加载失败：数据不完整');
      }
      return true;
    case 'convertSaved':
      if (msg.path) {
        patch(host, { converting: false });
        host.showSaveSuccess(msg.path, () => clearAll(host));
      }
      return true;
    case 'convertSaveError':
      patch(host, { converting: false });
      host.paint();
      host.showToast('error', msg.message ?? '保存失败');
      return true;
    default:
      return false;
  }
}
