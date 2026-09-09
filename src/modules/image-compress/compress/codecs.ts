export type CodecKind = 'jpeg' | 'png' | 'webp';

export function extToCodec(ext: string): CodecKind {
  const e = ext.toLowerCase().replace('.', '');
  if (e === 'png') {
    return 'png';
  }
  if (e === 'webp') {
    return 'webp';
  }
  return 'jpeg';
}

export interface WorkerCompressRequest {
  id: string;
  inputPath: string;
  outputPath: string;
  /** 输入格式 */
  ext: string;
  /** 输出格式，默认与输入相同；如 png→jpg */
  outputExt?: string;
  quality: number;
  /** PNG oxipng effort 0–6 */
  pngLevel?: number;
  /** 目标宽高；与原图像素不同时先缩放再编码 */
  targetWidth?: number;
  targetHeight?: number;
  wasmRoot: string;
}

export interface WorkerCompressResponse {
  id: string;
  ok: boolean;
  outputPath?: string;
  originalSize?: number;
  compressedSize?: number;
  width?: number;
  height?: number;
  error?: string;
}
