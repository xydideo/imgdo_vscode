/** 通用图片源（ICO / Base64 等共用） */
export interface ImageSource {
  name: string;
  path?: string;
  dataUrl: string;
  width: number;
  height: number;
  size: number;
}

/** 从 File / Blob 读取为 ImageSource */
export async function sourceFromBlob(
  blob: Blob,
  name: string,
  path?: string
): Promise<ImageSource> {
  const dataUrl = await readAsDataUrl(blob);
  const { width, height } = await probeImageSize(dataUrl);
  return {
    name,
    path,
    dataUrl,
    width,
    height,
    size: blob.size,
  };
}

export async function sourceFromDataUrl(
  dataUrl: string,
  name = 'image.png'
): Promise<ImageSource> {
  const { width, height } = await probeImageSize(dataUrl);
  const size = approxDataUrlBytes(dataUrl);
  return { name, dataUrl, width, height, size };
}

function approxDataUrlBytes(dataUrl: string): number {
  const i = dataUrl.indexOf(',');
  const b64 = i >= 0 ? dataUrl.slice(i + 1) : dataUrl;
  return Math.floor((b64.length * 3) / 4);
}

function readAsDataUrl(blob: Blob): Promise<string> {
  return new Promise((resolve, reject) => {
    const reader = new FileReader();
    reader.onload = () => resolve(String(reader.result));
    reader.onerror = () => reject(reader.error ?? new Error('读取失败'));
    reader.readAsDataURL(blob);
  });
}

function probeImageSize(src: string): Promise<{ width: number; height: number }> {
  return new Promise((resolve, reject) => {
    const img = new Image();
    img.onload = () => resolve({ width: img.naturalWidth, height: img.naturalHeight });
    img.onerror = () => reject(new Error('无法解析图片'));
    img.src = src;
  });
}

export function normalizeBase64Input(raw: string): string {
  const trimmed = raw.trim();
  if (!trimmed) {
    return '';
  }
  if (trimmed.startsWith('data:')) {
    return trimmed;
  }
  const compact = trimmed.replace(/\s+/g, '');
  return `data:image/png;base64,${compact}`;
}

export function isImageFile(file: File): boolean {
  if (file.type && file.type.startsWith('image/')) {
    return true;
  }
  return /\.(png|jpe?g|webp|gif|bmp|ico|svg)$/i.test(file.name);
}

export function isImagePath(filePath: string): boolean {
  return /\.(png|jpe?g|webp|gif|bmp|ico|svg)$/i.test(filePath);
}

export function extractImageFile(dt: DataTransfer): File | null {
  if (dt.files?.length) {
    for (let i = 0; i < dt.files.length; i++) {
      const f = dt.files[i];
      if (isImageFile(f)) {
        return f;
      }
    }
    const first = dt.files[0];
    if (first && first.size > 0) {
      return first;
    }
  }
  return null;
}

function fileUrlToPath(url: string): string | null {
  try {
    if (url.startsWith('file://')) {
      const u = new URL(url);
      let p = decodeURIComponent(u.pathname);
      if (/^\/[A-Za-z]:\//.test(p)) {
        p = p.slice(1);
      }
      return p;
    }
  } catch {
    // ignore
  }
  return null;
}

export function extractImagePath(dt: DataTransfer): string | null {
  const mimeCandidates = [
    'application/vnd.code.uri-list',
    'text/uri-list',
    'text/plain',
  ];
  for (const mime of mimeCandidates) {
    const raw = dt.getData(mime);
    if (!raw) {
      continue;
    }
    const lines = raw
      .split(/\r?\n/)
      .map((s) => s.trim())
      .filter((s) => s && !s.startsWith('#'));
    for (const line of lines) {
      const fromUrl = fileUrlToPath(line);
      const candidate =
        fromUrl ?? (line.startsWith('/') || /^[A-Za-z]:[\\/]/.test(line) ? line : null);
      if (candidate && isImagePath(candidate)) {
        return candidate;
      }
    }
  }

  if (dt.files?.length) {
    for (let i = 0; i < dt.files.length; i++) {
      const file = dt.files[i] as File & { path?: string };
      if (file.path && isImagePath(file.path)) {
        return file.path;
      }
    }
  }

  if (dt.items?.length) {
    for (let i = 0; i < dt.items.length; i++) {
      const item = dt.items[i];
      if (item.kind !== 'file') {
        continue;
      }
      const f = item.getAsFile() as (File & { path?: string }) | null;
      if (f?.path && isImagePath(f.path)) {
        return f.path;
      }
    }
  }

  return null;
}

export function filePathOf(file: File): string | undefined {
  const p = (file as File & { path?: string }).path;
  return p || undefined;
}
