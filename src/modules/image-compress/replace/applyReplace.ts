import * as fs from 'fs';
import * as path from 'path';
import { backupOriginalsToZip } from './backupZip';
import { CompressResultItem, ImageExt } from '../panel/messages';

export interface ReplaceOptions {
  projectRoot: string;
  items: CompressResultItem[];
  backup: boolean;
}

export interface ReplaceOutcome {
  replaced: number;
  backupPath?: string;
  message: string;
  items: Array<{
    name: string;
    relativePath: string;
    originalSize: number;
    compressedSize: number;
  }>;
}

function normalizeOutExt(ext: ImageExt | undefined, fallback: ImageExt): string {
  const e = (ext || fallback).toLowerCase();
  return e === 'jpeg' ? 'jpg' : e;
}

/** 替换目标路径：同格式覆盖原路径；png→jpg 则同目录换扩展名 */
function resolveReplaceDestPath(item: CompressResultItem): string {
  const outExt = normalizeOutExt(item.outputExt, item.ext);
  const srcExt = normalizeOutExt(item.ext, item.ext);
  if (outExt === srcExt) {
    return item.path;
  }
  const parsed = path.parse(item.path);
  return path.join(parsed.dir, `${parsed.name}.${outExt}`);
}

function resolveReplaceRelativePath(item: CompressResultItem): string {
  const outExt = normalizeOutExt(item.outputExt, item.ext);
  const srcExt = normalizeOutExt(item.ext, item.ext);
  if (outExt === srcExt) {
    return item.relativePath;
  }
  const parsed = path.parse(item.relativePath);
  const dir = parsed.dir;
  const base = `${parsed.name}.${outExt}`;
  return dir ? path.join(dir, base) : base;
}

export async function applyReplace(options: ReplaceOptions): Promise<ReplaceOutcome> {
  const pending = options.items.filter((i) => !i.excluded && !i.skipped && !i.error && i.cachePath);
  if (!pending.length) {
    return { replaced: 0, message: '没有可替换的图片', items: [] };
  }

  // 1) 先备份本次待替换的原图
  let backupPath: string | undefined;
  if (options.backup) {
    backupPath = await backupOriginalsToZip(
      options.projectRoot,
      pending.map((i) => ({
        absolutePath: i.path,
        relativePath: i.relativePath,
      }))
    );
  }

  const items: ReplaceOutcome['items'] = [];
  for (const item of pending) {
    if (!fs.existsSync(item.cachePath)) {
      continue;
    }
    const destPath = resolveReplaceDestPath(item);
    const destRelative = resolveReplaceRelativePath(item);

    // 2) 删除本次原图（格式转换时删 png；同格式也先删再写，避免残留）
    if (fs.existsSync(item.path)) {
      fs.unlinkSync(item.path);
    }
    // 若目标路径与原路径不同且已存在同名目标，也先清掉
    if (destPath !== item.path && fs.existsSync(destPath)) {
      fs.unlinkSync(destPath);
    }

    // 3) 写入本次压缩结果
    fs.mkdirSync(path.dirname(destPath), { recursive: true });
    fs.copyFileSync(item.cachePath, destPath);

    items.push({
      name: path.basename(destPath),
      relativePath: destRelative.split(path.sep).join('/'),
      originalSize: item.originalSize,
      compressedSize: item.compressedSize,
    });
  }

  const backupTip = backupPath ? `；备份：${backupPath}` : '';
  return {
    replaced: items.length,
    backupPath,
    items,
    message: `已替换 ${items.length} 张图片${backupTip}`,
  };
}
