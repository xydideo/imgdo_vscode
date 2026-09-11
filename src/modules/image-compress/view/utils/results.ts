import type { CompressResultItem, ImageItem } from '../../panel/messages';
import { DEFAULT_SETTINGS } from '../../panel/messages';
import { state } from '../state';

export function isWeakSaving(item: CompressResultItem): boolean {
  const min = state.settings.minSavingRatio ?? 0.2;
  return 1 - item.ratio < min;
}

export function canConvertToJpg(item: CompressResultItem): boolean {
  return item.ext === 'png' && !item.convertedToJpg && isWeakSaving(item);
}

export function isComparePreviewItem(
  item: ImageItem | CompressResultItem
): item is CompressResultItem {
  return 'originalPreviewUri' in item && 'compressedPreviewUri' in item;
}

export function largeThreshold(): number {
  return state.settings.largeImageMinBytes ?? DEFAULT_SETTINGS.largeImageMinBytes;
}

export function replaceableResults(): CompressResultItem[] {
  return state.results.filter((r) => {
    if (r.excluded) {
      return false;
    }
    if (!r.skipped && r.cachePath) {
      return true;
    }
    // 未压小的 PNG 仍可展示，便于「压成 jpg 试试」
    return Boolean(r.skipped && r.ext === 'png' && !r.convertedToJpg);
  });
}

export function largeResults(): CompressResultItem[] {
  const min = largeThreshold();
  return state.results.filter(
    (r) => !r.excluded && !r.skipped && r.cachePath && r.compressedSize >= min
  );
}

export function currentResultList(): CompressResultItem[] {
  return state.resultTab === 'large' ? largeResults() : replaceableResults();
}

export function indexInResults(item: CompressResultItem): number {
  return state.results.findIndex((r) => r.id === item.id);
}

export function normalizeDisplayExt(ext: string): string {
  const e = ext.toLowerCase().replace(/^\./, '');
  return e === 'jpeg' ? 'jpg' : e;
}

export function swapRelativeExt(rel: string, ext: string): string {
  const e = normalizeDisplayExt(ext);
  if (!rel.includes('.')) {
    return `${rel}.${e}`;
  }
  return rel.replace(/\.[^.]+$/i, `.${e}`);
}

/** 待替换里会发生换扩展名的项 */
export function formatChangePairs(): Array<{ from: string; to: string }> {
  return replaceableResults()
    .filter((r) => !r.skipped && r.cachePath)
    .map((item) => {
      const srcExt = normalizeDisplayExt(item.ext);
      const outExt = normalizeDisplayExt(
        item.convertedToJpg ? 'jpg' : item.outputExt || item.ext
      );
      if (srcExt === outExt) {
        return null;
      }
      // relativePath 可能已被改成新扩展名
      const rel = item.relativePath.split('\\').join('/');
      const lower = rel.toLowerCase();
      let from: string;
      let to: string;
      if (lower.endsWith(`.${outExt}`)) {
        to = rel;
        from = swapRelativeExt(rel, srcExt);
      } else if (lower.endsWith(`.${srcExt}`)) {
        from = rel;
        to = swapRelativeExt(rel, outExt);
      } else {
        from = swapRelativeExt(rel, srcExt);
        to = swapRelativeExt(rel, outExt);
      }
      return { from, to };
    })
    .filter((x): x is { from: string; to: string } => Boolean(x));
}

export function buildFormatChangeCopyText(changes: Array<{ from: string; to: string }>): string {
  return changes.map((c) => `- ${c.from} 换成 ${c.to};`).join('\n');
}
