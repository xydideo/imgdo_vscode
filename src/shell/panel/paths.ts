import * as path from 'path';
import {
  IMAGE_COMPRESS_OUT_DIR,
  resolveImageCompressWasmRoot,
  resolveImageCompressWorker,
} from '../../modules/image-compress/paths';

/** 构建产物根目录名 */
const OUT_DIR = 'ImgDo';

/** Webview 静态资源目录：ImgDo/webview */
export function resolveWebviewDir(extensionPath: string): string {
  return path.join(extensionPath, OUT_DIR, 'webview');
}

export {
  IMAGE_COMPRESS_OUT_DIR,
  resolveImageCompressWasmRoot,
  resolveImageCompressWorker,
};
