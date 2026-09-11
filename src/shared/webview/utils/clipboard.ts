export function loadImage(src: string): Promise<HTMLImageElement> {
  return new Promise((resolve, reject) => {
    const img = new Image();
    img.onload = () => resolve(img);
    img.onerror = () => reject(new Error('图片加载失败'));
    img.src = src;
  });
}

export function canvasFromImage(
  img: HTMLImageElement,
  w?: number,
  h?: number
): HTMLCanvasElement {
  const canvas = document.createElement('canvas');
  canvas.width = w ?? img.naturalWidth;
  canvas.height = h ?? img.naturalHeight;
  const ctx = canvas.getContext('2d');
  if (!ctx) {
    throw new Error('Canvas 不可用');
  }
  if ((w != null && w !== img.naturalWidth) || (h != null && h !== img.naturalHeight)) {
    ctx.imageSmoothingEnabled = true;
    ctx.imageSmoothingQuality = 'high';
  }
  ctx.drawImage(img, 0, 0, canvas.width, canvas.height);
  return canvas;
}

export function canvasToBlob(
  canvas: HTMLCanvasElement,
  type: string,
  quality?: number
): Promise<Blob> {
  return new Promise((resolve, reject) => {
    canvas.toBlob(
      (blob) => {
        if (!blob) {
          reject(new Error(`无法导出 ${type}`));
          return;
        }
        resolve(blob);
      },
      type,
      quality
    );
  });
}

export async function copyText(text: string): Promise<void> {
  if (navigator.clipboard?.writeText) {
    await navigator.clipboard.writeText(text);
    return;
  }
  // 旧环境回退
  const ta = document.createElement('textarea');
  ta.value = text;
  ta.style.position = 'fixed';
  ta.style.left = '-9999px';
  document.body.appendChild(ta);
  ta.select();
  const ok = document.execCommand('copy');
  document.body.removeChild(ta);
  if (!ok) {
    throw new Error('复制失败');
  }
}

/** 复制图片；webview 常不支持 ClipboardItem，失败时回退为复制 data URL */
export async function copyImageFromDataUrl(
  dataUrl: string
): Promise<'image' | 'text'> {
  const img = await loadImage(dataUrl);
  const canvas = canvasFromImage(img);
  const pngBlob = await canvasToBlob(canvas, 'image/png');

  try {
    if (typeof ClipboardItem !== 'undefined' && navigator.clipboard?.write) {
      await navigator.clipboard.write([
        new ClipboardItem({ 'image/png': pngBlob }),
      ]);
      return 'image';
    }
  } catch {
    // fall through
  }

  await copyText(dataUrl);
  return 'text';
}

function uint8ToBase64(bytes: Uint8Array): string {
  let binary = '';
  const chunk = 0x8000;
  for (let i = 0; i < bytes.length; i += chunk) {
    binary += String.fromCharCode(...bytes.subarray(i, i + chunk));
  }
  return btoa(binary);
}

export function bytesToBase64Payload(bytes: Uint8Array): string {
  return uint8ToBase64(bytes);
}
