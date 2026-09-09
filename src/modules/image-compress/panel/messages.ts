export interface AppSettings {
  backupOnReplace: boolean;
  /** 0~1，起始质量，默认 0.5（JPEG/WebP quality；PNG 色板规模） */
  compressRate: number;
  /** 最小开压字节数，默认 100KB */
  minSizeBytes: number;
  /** 压缩后仍超过该大小归入「大图」Tab，默认 800KB */
  largeImageMinBytes: number;
  /**
   * 相对原图至少缩小的比例，默认 0.2（20%）。
   * 未达标则自动降档重试，避免出现「压缩比 2%」这类几乎没压的结果。
   */
  minSavingRatio: number;
}

export const DEFAULT_SETTINGS: AppSettings = {
  backupOnReplace: true,
  compressRate: 0.5,
  minSizeBytes: 100 * 1024,
  largeImageMinBytes: 800 * 1024,
  minSavingRatio: 0.2,
};

/** 降档 / 再压时质量步长（内部固定，不再暴露设置） */
export const QUALITY_STEP = 0.1;

export type ImageExt = 'jpg' | 'jpeg' | 'png' | 'webp';

export interface ImageItem {
  id: string;
  path: string;
  name: string;
  relativePath: string;
  ext: ImageExt;
  width: number;
  height: number;
  /** 压缩目标宽（可改）；高度按原图比例自动计算。默认与原宽一致，宽>1920 时压到 1920 */
  targetWidth: number;
  targetHeight: number;
  size: number;
  previewUri?: string;
}

export interface CompressResultItem {
  id: string;
  path: string;
  name: string;
  relativePath: string;
  /** 原图格式 */
  ext: ImageExt;
  /** 压缩产物格式，默认与 ext 相同；png 转 jpg 时为 jpg */
  outputExt?: ImageExt;
  /** 是否已将 PNG 转为 JPG */
  convertedToJpg?: boolean;
  width: number;
  height: number;
  /** 压缩时使用的目标尺寸 */
  targetWidth?: number;
  targetHeight?: number;
  originalSize: number;
  compressedSize: number;
  ratio: number;
  originalPreviewUri: string;
  compressedPreviewUri: string;
  cachePath: string;
  excluded: boolean;
  skipped: boolean;
  error?: string;
  /** 最近一次编码质量（JPEG/WebP 0–100） */
  lastQuality?: number;
  /** 最近一次压缩率（0–1），用于再压递减 */
  lastRate?: number;
}

export interface ScanSummary {
  scanned: number;
  skippedSmall: number;
  rootPath: string;
}

/** Webview -> Host */
export type WebviewToHost =
  | { type: 'ready' }
  | { type: 'saveSettings'; settings: AppSettings }
  | { type: 'pickFolder' }
  | { type: 'scanWorkspace' }
  | { type: 'scanFolder'; folderPath: string }
  | { type: 'startCompress'; ids: string[] }
  | {
      type: 'updateTargetSize';
      id: string;
      targetWidth: number;
      targetHeight: number;
    }
  | { type: 'recompress'; ids: string[] }
  | { type: 'easeCompress'; id: string }
  | { type: 'convertToJpg'; id: string }
  | { type: 'cancelCompress' }
  | { type: 'excludeFromQueue'; id: string }
  | { type: 'excludeFromReplace'; id: string }
  | { type: 'confirmReplace' }
  | { type: 'resetToEntry' };

/** Host -> Webview */
export type HostToWebview =
  | { type: 'init'; canScanWorkspace: boolean; workspaceLabel?: string }
  | { type: 'settings'; settings: AppSettings }
  | { type: 'scanStarted' }
  | { type: 'scanProgress'; current: number; message: string }
  | { type: 'scanResult'; items: ImageItem[]; summary: ScanSummary }
  | { type: 'queueUpdated'; items: ImageItem[]; summary: ScanSummary }
  | { type: 'scanError'; message: string }
  | { type: 'compressStarted'; total: number }
  | { type: 'compressProgress'; done: number; total: number; current?: string }
  | { type: 'compressResult'; items: CompressResultItem[] }
  | { type: 'recompressStarted'; total: number }
  | { type: 'compressError'; message: string }
  | {
      type: 'replaceResult';
      ok: boolean;
      replaced: number;
      backupPath?: string;
      message: string;
      items?: Array<{
        name: string;
        relativePath: string;
        originalSize: number;
        compressedSize: number;
      }>;
    }
  | { type: 'toast'; level: 'info' | 'warn' | 'error'; message: string };
