/**
 * 将 PNG 字节封装为 ICO（PNG-in-ICO，Vista+ 通用）。
 * 必须显式传入每张图的宽高，避免从 PNG buffer 误读尺寸。
 */
export function encodeIcoFromPngs(
  entries: Array<{ png: Uint8Array; width: number; height: number }>
): Uint8Array {
  if (entries.length === 0) {
    throw new Error('ICO 至少需要一张 PNG');
  }

  const count = entries.length;
  const headerSize = 6;
  const entrySize = 16;
  const offset0 = headerSize + entrySize * count;

  let total = offset0;
  for (const e of entries) {
    total += e.png.byteLength;
  }

  const out = new Uint8Array(total);
  const view = new DataView(out.buffer);

  view.setUint16(0, 0, true); // reserved
  view.setUint16(2, 1, true); // type: icon
  view.setUint16(4, count, true);

  let dataOffset = offset0;
  for (let i = 0; i < count; i++) {
    const { png, width, height } = entries[i]!;
    const entry = headerSize + i * entrySize;
    view.setUint8(entry, width >= 256 ? 0 : width);
    view.setUint8(entry + 1, height >= 256 ? 0 : height);
    view.setUint8(entry + 2, 0); // color count
    view.setUint8(entry + 3, 0); // reserved
    view.setUint16(entry + 4, 1, true); // planes
    view.setUint16(entry + 6, 32, true); // bit count
    view.setUint32(entry + 8, png.byteLength, true);
    view.setUint32(entry + 12, dataOffset, true);
    // 拷贝独立 buffer，避免多段共享 ArrayBuffer 时偏移错乱
    out.set(png.byteOffset === 0 && png.byteLength === png.buffer.byteLength
      ? png
      : new Uint8Array(png), dataOffset);
    dataOffset += png.byteLength;
  }

  return out;
}

/** 将 RGBA 位图编码为未压缩 32-bit BMP */
export function encodeBmpRgba(
  width: number,
  height: number,
  rgba: Uint8ClampedArray | Uint8Array
): Uint8Array {
  const rowSize = Math.ceil((width * 32) / 32) * 4;
  const pixelBytes = rowSize * height;
  const fileHeader = 14;
  const dibHeader = 40;
  const offset = fileHeader + dibHeader;
  const out = new Uint8Array(offset + pixelBytes);
  const view = new DataView(out.buffer);

  view.setUint8(0, 0x42);
  view.setUint8(1, 0x4d);
  view.setUint32(2, out.byteLength, true);
  view.setUint32(6, 0, true);
  view.setUint32(10, offset, true);

  view.setUint32(14, 40, true);
  view.setInt32(18, width, true);
  view.setInt32(22, -height, true);
  view.setUint16(26, 1, true);
  view.setUint16(28, 32, true);
  view.setUint32(30, 0, true);
  view.setUint32(34, pixelBytes, true);
  view.setInt32(38, 2835, true);
  view.setInt32(42, 2835, true);
  view.setUint32(46, 0, true);
  view.setUint32(50, 0, true);

  let di = offset;
  for (let y = 0; y < height; y++) {
    for (let x = 0; x < width; x++) {
      const si = (y * width + x) * 4;
      out[di++] = rgba[si + 2]!;
      out[di++] = rgba[si + 1]!;
      out[di++] = rgba[si]!;
      out[di++] = rgba[si + 3]!;
    }
  }

  return out;
}
