import * as fs from 'fs';

const META_KEY = 'ImageCompress';

interface CompressMeta {
  fromSize: number;
  toSize: number;
  time: string;
  count: number;
}

function formatMeta(meta: CompressMeta): string {
  return `由 ${meta.fromSize} 压缩到 ${meta.toSize}；时间 ${meta.time}；次数 ${meta.count}`;
}

function parseMetaText(text: string | undefined): CompressMeta | null {
  if (!text) {
    return null;
  }
  const m = text.match(/由\s+(\d+)\s+压缩到\s+(\d+).*次数\s+(\d+)/);
  if (!m) {
    return null;
  }
  const timeMatch = text.match(/时间\s+([^\s；;]+)/);
  return {
    fromSize: Number(m[1]),
    toSize: Number(m[2]),
    time: timeMatch?.[1] ?? '',
    count: Number(m[3]),
  };
}

export function writeCompressMetadata(
  filePath: string,
  ext: string,
  fromSize: number,
  toSize: number
): void {
  try {
    const buf = fs.readFileSync(filePath);
    const prev = readCompressCount(buf, ext);
    const meta: CompressMeta = {
      fromSize,
      toSize,
      time: new Date().toISOString(),
      count: prev + 1,
    };
    const text = formatMeta(meta);
    const e = ext.toLowerCase().replace('.', '');
    let next: Buffer;
    if (e === 'png') {
      next = writePngText(buf, META_KEY, text);
    } else if (e === 'jpg' || e === 'jpeg') {
      next = writeJpegComment(buf, text);
    } else if (e === 'webp') {
      // WebP 元数据写入较复杂，失败则跳过
      next = buf;
    } else {
      next = buf;
    }
    if (next !== buf) {
      fs.writeFileSync(filePath, next);
    }
  } catch {
    // 元数据失败不阻断
  }
}

function readCompressCount(buf: Buffer, ext: string): number {
  const e = ext.toLowerCase().replace('.', '');
  try {
    if (e === 'png') {
      const text = readPngText(buf, META_KEY);
      return parseMetaText(text)?.count ?? 0;
    }
    if (e === 'jpg' || e === 'jpeg') {
      const text = readJpegComment(buf);
      return parseMetaText(text)?.count ?? 0;
    }
  } catch {
    // ignore
  }
  return 0;
}

function writePngText(buf: Buffer, key: string, value: string): Buffer {
  const signature = Buffer.from([137, 80, 78, 71, 13, 10, 26, 10]);
  if (buf.length < 8 || !buf.subarray(0, 8).equals(signature)) {
    return buf;
  }

  // 去掉旧的同名 tEXt
  const without = stripPngText(buf, key);
  const keyword = Buffer.from(key, 'latin1');
  const val = Buffer.from(value, 'latin1');
  const data = Buffer.concat([keyword, Buffer.from([0]), val]);
  const type = Buffer.from('tEXt');
  const len = Buffer.alloc(4);
  len.writeUInt32BE(data.length, 0);
  const crc = crc32(Buffer.concat([type, data]));
  const crcBuf = Buffer.alloc(4);
  crcBuf.writeUInt32BE(crc >>> 0, 0);
  const chunk = Buffer.concat([len, type, data, crcBuf]);

  // 插在 IHDR 之后
  const ihdrLen = without.readUInt32BE(8);
  const insertAt = 8 + 12 + ihdrLen;
  return Buffer.concat([without.subarray(0, insertAt), chunk, without.subarray(insertAt)]);
}

function stripPngText(buf: Buffer, key: string): Buffer {
  const signature = buf.subarray(0, 8);
  const parts: Buffer[] = [signature];
  let offset = 8;
  while (offset + 12 <= buf.length) {
    const len = buf.readUInt32BE(offset);
    const type = buf.toString('ascii', offset + 4, offset + 8);
    const dataStart = offset + 8;
    const dataEnd = dataStart + len;
    const next = dataEnd + 4;
    if (next > buf.length) {
      break;
    }
    if (type === 'tEXt' || type === 'iTXt') {
      const nullIdx = buf.indexOf(0, dataStart);
      const k = nullIdx > dataStart ? buf.toString('latin1', dataStart, nullIdx) : '';
      if (k === key) {
        offset = next;
        continue;
      }
    }
    parts.push(buf.subarray(offset, next));
    offset = next;
    if (type === 'IEND') {
      break;
    }
  }
  return Buffer.concat(parts);
}

function readPngText(buf: Buffer, key: string): string | undefined {
  let offset = 8;
  while (offset + 12 <= buf.length) {
    const len = buf.readUInt32BE(offset);
    const type = buf.toString('ascii', offset + 4, offset + 8);
    const dataStart = offset + 8;
    const dataEnd = dataStart + len;
    const next = dataEnd + 4;
    if (next > buf.length) {
      break;
    }
    if (type === 'tEXt') {
      const nullIdx = buf.indexOf(0, dataStart);
      if (nullIdx > dataStart) {
        const k = buf.toString('latin1', dataStart, nullIdx);
        if (k === key) {
          return buf.toString('latin1', nullIdx + 1, dataEnd);
        }
      }
    }
    offset = next;
    if (type === 'IEND') {
      break;
    }
  }
  return undefined;
}

function writeJpegComment(buf: Buffer, text: string): Buffer {
  if (buf[0] !== 0xff || buf[1] !== 0xd8) {
    return buf;
  }
  const comment = Buffer.from(text, 'utf8');
  const com = Buffer.alloc(4 + comment.length);
  com[0] = 0xff;
  com[1] = 0xfe;
  com.writeUInt16BE(comment.length + 2, 2);
  comment.copy(com, 4);
  // 插在 SOI 之后
  return Buffer.concat([buf.subarray(0, 2), com, buf.subarray(2)]);
}

function readJpegComment(buf: Buffer): string | undefined {
  let i = 2;
  while (i + 4 <= buf.length) {
    if (buf[i] !== 0xff) {
      break;
    }
    const marker = buf[i + 1];
    if (marker === 0xd9 || marker === 0xda) {
      break;
    }
    const len = buf.readUInt16BE(i + 2);
    if (marker === 0xfe) {
      return buf.toString('utf8', i + 4, i + 2 + len);
    }
    i += 2 + len;
  }
  return undefined;
}

function crc32(buf: Buffer): number {
  let c = 0xffffffff;
  for (let i = 0; i < buf.length; i++) {
    c ^= buf[i];
    for (let k = 0; k < 8; k++) {
      c = c & 1 ? 0xedb88320 ^ (c >>> 1) : c >>> 1;
    }
  }
  return (c ^ 0xffffffff) >>> 0;
}
