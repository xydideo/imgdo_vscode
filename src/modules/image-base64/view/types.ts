import type { ImageSource } from '../../../shared/webview/utils/source';

export type Base64Mode = 'image-to-base64' | 'base64-to-image';

export interface Base64UiState {
  mode: Base64Mode;
  source?: ImageSource;
  text: string;
  previewUrl?: string;
  error?: string;
  busy: boolean;
}

export function createBase64State(): Base64UiState {
  return {
    mode: 'image-to-base64',
    text: '',
    busy: false,
  };
}

export interface Base64Host {
  getState: () => Base64UiState;
  setState: (next: Base64UiState) => void;
  post: (msg: {
    type: 'convertPickImage';
  } | {
    type: 'convertLoadFromPath';
    path: string;
  }) => void;
  paint: () => void;
  showToast: (level: 'info' | 'warn' | 'error', message: string) => void;
}
