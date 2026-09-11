import type { ImageSource } from '../../../shared/webview/utils/source';

export const ICO_SIZE_OPTIONS = [24, 32, 40, 64, 128] as const;
export type IcoSize = (typeof ICO_SIZE_OPTIONS)[number];

/** 正方形裁剪：相对源图像素的左上角与边长 */
export interface SquareCrop {
  x: number;
  y: number;
  side: number;
}

export interface IcoOutput {
  previewUrl: string;
  bytes: Uint8Array;
  size: number;
  icoSize: number;
  suggestedName: string;
}

export interface IcoUiState {
  source?: ImageSource;
  crop?: SquareCrop;
  /** 输出尺寸（单选） */
  size: IcoSize;
  converting: boolean;
  /** 裁剪预览（未落盘） */
  previewUrl?: string;
  output?: IcoOutput;
  dropHint?: string;
}

export function defaultCrop(width: number, height: number): SquareCrop {
  const side = Math.min(width, height);
  return {
    x: Math.floor((width - side) / 2),
    y: Math.floor((height - side) / 2),
    side,
  };
}

export function createIcoState(): IcoUiState {
  return {
    size: 32,
    converting: false,
  };
}

export function saveDirOf(source?: ImageSource): string | undefined {
  const p = source?.path;
  if (!p) {
    return undefined;
  }
  const i = Math.max(p.lastIndexOf('/'), p.lastIndexOf('\\'));
  return i >= 0 ? p.slice(0, i) : undefined;
}

export interface IcoHost {
  getState: () => IcoUiState;
  setState: (next: IcoUiState) => void;
  post: (msg: {
    type: 'convertPickImage';
  } | {
    type: 'convertLoadFromPath';
    path: string;
  } | {
    type: 'convertSave';
    base64: string;
    suggestedName: string;
    mime: string;
    besidePath?: string;
  }) => void;
  paint: () => void;
  showToast: (level: 'info' | 'warn' | 'error', message: string) => void;
  showSaveSuccess: (path: string, onDone?: () => void) => void;
}
