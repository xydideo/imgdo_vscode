import * as path from 'path';

/** 构建产物根目录名 */
const OUT_DIR = 'ImgDo';

/** 构建产物中本模块的相对根路径（相对扩展根目录） */
export const IMAGE_COMPRESS_OUT_DIR = path.join(
  OUT_DIR,
  'modules',
  'image-compress'
);

export function resolveImageCompressWorker(extensionPath: string): string {
  return path.join(extensionPath, IMAGE_COMPRESS_OUT_DIR, 'worker.js');
}

export function resolveImageCompressWasmRoot(extensionPath: string): string {
  return path.join(extensionPath, IMAGE_COMPRESS_OUT_DIR, 'wasm');
}

export function resolveImageCompressWebviewDir(extensionPath: string): string {
  return path.join(extensionPath, IMAGE_COMPRESS_OUT_DIR, 'webview');
}
