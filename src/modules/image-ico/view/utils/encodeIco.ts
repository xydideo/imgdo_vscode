import { encodeIcoFromPngs } from '../../../../shared/encodeBinary';
import { canvasToBlob, loadImage } from '../../../../shared/webview/utils/clipboard';
import type { ImageSource } from '../../../../shared/webview/utils/source';
import type { IcoOutput, IcoSize, SquareCrop } from '../types';

async function blobToUint8(blob: Blob): Promise<Uint8Array> {
  const buf = await blob.arrayBuffer();
  // 独立拷贝，避免后续 DataView / set 共享 buffer 出问题
  return new Uint8Array(buf.slice(0));
}

function suggestedIcoName(_sourceName: string): string {
  return 'favicon.ico';
}

function bytesToDataUrl(bytes: Uint8Array, mime: string): string {
  let binary = '';
  const chunk = 0x8000;
  for (let i = 0; i < bytes.length; i += chunk) {
    binary += String.fromCharCode(...bytes.subarray(i, i + chunk));
  }
  return `data:${mime};base64,${btoa(binary)}`;
}

/** 从源图按正方形裁剪导出指定尺寸的 PNG */
async function cropToPng(
  img: HTMLImageElement,
  crop: SquareCrop,
  size: number
): Promise<Uint8Array> {
  const canvas = document.createElement('canvas');
  canvas.width = size;
  canvas.height = size;
  const ctx = canvas.getContext('2d');
  if (!ctx) {
    throw new Error('Canvas 不可用');
  }
  ctx.clearRect(0, 0, size, size);
  ctx.imageSmoothingEnabled = true;
  ctx.imageSmoothingQuality = 'high';
  ctx.drawImage(
    img,
    crop.x,
    crop.y,
    crop.side,
    crop.side,
    0,
    0,
    size,
    size
  );
  const blob = await canvasToBlob(canvas, 'image/png');
  return blobToUint8(blob);
}

/** 裁剪预览（不做 ICO 封装） */
export async function previewCroppedSquare(
  source: ImageSource,
  crop: SquareCrop,
  size: number
): Promise<string> {
  const img = await loadImage(source.dataUrl);
  const png = await cropToPng(img, crop, size);
  return bytesToDataUrl(png, 'image/png');
}

export async function encodeIcoFromSource(
  source: ImageSource,
  crop: SquareCrop,
  size: IcoSize
): Promise<IcoOutput> {
  const icoSize = Number(size) as IcoSize;
  if (!icoSize || icoSize <= 0) {
    throw new Error('请选择尺寸');
  }
  const img = await loadImage(source.dataUrl);
  const png = await cropToPng(img, crop, icoSize);
  const bytes = encodeIcoFromPngs([{ png, width: icoSize, height: icoSize }]);
  const previewUrl = bytesToDataUrl(png, 'image/png');

  return {
    previewUrl,
    bytes,
    size: bytes.byteLength,
    icoSize,
    suggestedName: suggestedIcoName(source.name),
  };
}
