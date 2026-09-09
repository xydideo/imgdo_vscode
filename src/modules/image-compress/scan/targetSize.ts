/** 超过该宽度时，目标宽度默认压到此值并等比缩放高度 */
const DEFAULT_MAX_TARGET_WIDTH = 1920;

export function computeDefaultTargetSize(
  width: number,
  height: number,
  maxWidth = DEFAULT_MAX_TARGET_WIDTH
): { targetWidth: number; targetHeight: number } {
  const w = Math.max(0, Math.round(width) || 0);
  const h = Math.max(0, Math.round(height) || 0);
  if (w <= 0 || h <= 0) {
    return { targetWidth: w, targetHeight: h };
  }
  if (w <= maxWidth) {
    return { targetWidth: w, targetHeight: h };
  }
  const targetWidth = maxWidth;
  return {
    targetWidth,
    targetHeight: heightForWidth(w, h, targetWidth),
  };
}

/** 按原图比例，由目标宽度推算高度 */
function heightForWidth(
  sourceWidth: number,
  sourceHeight: number,
  targetWidth: number
): number {
  const tw = Math.max(1, Math.round(targetWidth));
  if (sourceWidth <= 0 || sourceHeight <= 0) {
    return tw;
  }
  return Math.max(1, Math.round((sourceHeight * tw) / sourceWidth));
}

/** 目标宽度与原图宽度不同时视为已调整（列表用绿字标出） */
export function isTargetSizeModified(item: {
  width: number;
  targetWidth: number;
}): boolean {
  return item.targetWidth !== item.width;
}

/** 解析目标宽度（只填宽度；若粘贴「宽×高」则取宽度） */
export function parseTargetWidthInput(
  text: string,
  sourceWidth: number,
  sourceHeight: number
): { targetWidth: number; targetHeight: number } | null {
  const raw = text.trim();
  const pair = raw.match(/^(\d+)\s*[×xX*]\s*(\d+)$/);
  if (pair) {
    const targetWidth = Math.max(1, Math.round(Number(pair[1])));
    return {
      targetWidth,
      targetHeight: heightForWidth(sourceWidth, sourceHeight, targetWidth),
    };
  }
  const widthOnly = raw.match(/^(\d+)\s*$/);
  if (widthOnly) {
    const targetWidth = Math.max(1, Math.round(Number(widthOnly[1])));
    return {
      targetWidth,
      targetHeight: heightForWidth(sourceWidth, sourceHeight, targetWidth),
    };
  }
  return null;
}

export function formatTargetWidth(width: number): string {
  return String(width);
}
