import type {
  AppSettings,
  CompressResultItem,
  ImageItem,
  ScanSummary,
} from '../panel/messages';
import { DEFAULT_SETTINGS } from '../panel/messages';

export type Page = 'entry' | 'list' | 'compare' | 'scanning' | 'compressing';
export type ResultTab = 'replace' | 'large';

/** 压缩功能私有状态（不含 route / toast / banner / confirm） */
export interface CompressState {
  page: Page;
  canScanWorkspace: boolean;
  workspaceLabel?: string;
  settings: AppSettings;
  items: ImageItem[];
  summary?: ScanSummary;
  listTab: 'all' | 'tree';
  results: CompressResultItem[];
  resultTab: ResultTab;
  compareIndex: number;
  settingsOpen: boolean;
  previewItem?: ImageItem | CompressResultItem;
  previewWhich: 'original' | 'compressed';
  previewActualSize: boolean;
  progress?: { done: number; total: number; message?: string };
  compressElapsedSec: number;
  compressSlowHint?: string;
  dropHint?: string;
  replaceReport?: {
    message: string;
    backupPath?: string;
    items: Array<{
      name: string;
      relativePath: string;
      originalSize: number;
      compressedSize: number;
    }>;
  };
}

export const state: CompressState = {
  page: 'entry',
  canScanWorkspace: false,
  settings: { ...DEFAULT_SETTINGS },
  items: [],
  listTab: 'all',
  results: [],
  resultTab: 'replace',
  compareIndex: 0,
  settingsOpen: false,
  previewWhich: 'compressed',
  previewActualSize: false,
  compressElapsedSec: 0,
  compressSlowHint: undefined,
};
