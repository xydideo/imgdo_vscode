import * as vscode from 'vscode';
import { AppSettings, DEFAULT_SETTINGS } from '../panel/messages';

const SETTINGS_KEY = 'imageCompress.settings';

function normalizeSettings(settings: Partial<AppSettings>): AppSettings {
  return {
    backupOnReplace: Boolean(
      settings.backupOnReplace ?? DEFAULT_SETTINGS.backupOnReplace
    ),
    compressRate: clamp(
      Number(settings.compressRate) || DEFAULT_SETTINGS.compressRate,
      0.1,
      1
    ),
    minSizeBytes: Math.max(0, Math.floor(Number(settings.minSizeBytes) || 0)),
    largeImageMinBytes: Math.max(
      0,
      Math.floor(
        Number(settings.largeImageMinBytes) || DEFAULT_SETTINGS.largeImageMinBytes
      )
    ),
    minSavingRatio: clamp(
      Number(settings.minSavingRatio) || DEFAULT_SETTINGS.minSavingRatio,
      0.05,
      0.7
    ),
  };
}

export function loadSettings(context: vscode.ExtensionContext): AppSettings {
  const raw = context.globalState.get<Partial<AppSettings>>(SETTINGS_KEY);
  return normalizeSettings({ ...DEFAULT_SETTINGS, ...(raw ?? {}) });
}

export async function saveSettings(
  context: vscode.ExtensionContext,
  settings: AppSettings
): Promise<AppSettings> {
  const next = normalizeSettings(settings);
  await context.globalState.update(SETTINGS_KEY, next);
  return next;
}

function clamp(n: number, min: number, max: number): number {
  return Math.min(max, Math.max(min, n));
}
