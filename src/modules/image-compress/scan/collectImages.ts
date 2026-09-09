import * as fs from 'fs';
import * as path from 'path';
import sizeOf from 'image-size';
import ignore, { type Ignore } from 'ignore';
import { AppSettings, ImageExt, ImageItem } from '../panel/messages';
import { computeDefaultTargetSize } from './targetSize';

const IMAGE_EXTS = new Set(['.jpg', '.jpeg', '.png', '.webp']);
const DEFAULT_EXCLUDE_DIRS = new Set([
  'node_modules',
  '.git',
  'ImgDo',
  'dist',
  'build',
  'out',
  '.next',
  'coverage',
  '.backup',
  '.image-compress-cache',
]);

export interface CollectOptions {
  rootPath: string;
  settings: AppSettings;
  onProgress?: (current: number, message: string) => void;
}

export interface CollectResult {
  items: ImageItem[];
  scanned: number;
  skippedSmall: number;
}

interface IgnoreLayer {
  baseDir: string;
  ig: Ignore;
}

function readGitignore(dir: string): Ignore | null {
  const filePath = path.join(dir, '.gitignore');
  try {
    if (!fs.existsSync(filePath) || !fs.statSync(filePath).isFile()) {
      return null;
    }
    const content = fs.readFileSync(filePath, 'utf8');
    if (!content.trim()) {
      return null;
    }
    return ignore().add(content);
  } catch {
    return null;
  }
}

/** 从扫描根向上查找仓库根，把祖先 .gitignore 也叠进来（子目录扫描时仍尊重仓库规则） */
function buildInitialIgnoreLayers(rootPath: string): IgnoreLayer[] {
  const layers: IgnoreLayer[] = [];
  const absRoot = path.resolve(rootPath);
  const chain: string[] = [];
  let cur = absRoot;
  for (;;) {
    chain.push(cur);
    const parent = path.dirname(cur);
    if (parent === cur) {
      break;
    }
    const gitDir = path.join(cur, '.git');
    if (fs.existsSync(gitDir)) {
      break;
    }
    cur = parent;
  }
  // 从最外层（仓库根或最上祖先）到扫描根依次加入
  for (const dir of chain.reverse()) {
    const ig = readGitignore(dir);
    if (ig) {
      layers.push({ baseDir: dir, ig });
    }
  }
  return layers;
}

function isIgnoredByGit(layers: IgnoreLayer[], fullPath: string, isDirectory: boolean): boolean {
  if (!layers.length) {
    return false;
  }
  for (const layer of layers) {
    let rel = path.relative(layer.baseDir, fullPath);
    if (!rel || rel.startsWith('..')) {
      continue;
    }
    rel = rel.split(path.sep).join('/');
    if (isDirectory && !rel.endsWith('/')) {
      rel += '/';
    }
    if (layer.ig.ignores(rel)) {
      return true;
    }
  }
  return false;
}

export async function collectImages(options: CollectOptions): Promise<CollectResult> {
  const { rootPath, settings, onProgress } = options;
  const items: ImageItem[] = [];
  let scanned = 0;
  let skippedSmall = 0;
  const absRoot = path.resolve(rootPath);
  const initialLayers = buildInitialIgnoreLayers(absRoot);

  const walk = (dir: string, layers: IgnoreLayer[]) => {
    let entries: fs.Dirent[];
    try {
      entries = fs.readdirSync(dir, { withFileTypes: true });
    } catch {
      return;
    }

    // 当前目录自己的 .gitignore（若尚未在初始层中）
    const localIg = readGitignore(dir);
    const already =
      localIg && layers.some((l) => path.resolve(l.baseDir) === path.resolve(dir));
    const nextLayers =
      localIg && !already ? [...layers, { baseDir: dir, ig: localIg }] : layers;

    for (const entry of entries) {
      const full = path.join(dir, entry.name);
      if (entry.isDirectory()) {
        if (DEFAULT_EXCLUDE_DIRS.has(entry.name) || entry.name.startsWith('.')) {
          continue;
        }
        if (isIgnoredByGit(nextLayers, full, true)) {
          continue;
        }
        walk(full, nextLayers);
        continue;
      }

      if (!entry.isFile()) {
        continue;
      }

      const ext = path.extname(entry.name).toLowerCase();
      if (!IMAGE_EXTS.has(ext)) {
        continue;
      }

      if (isIgnoredByGit(nextLayers, full, false)) {
        continue;
      }

      scanned += 1;
      onProgress?.(scanned, full);

      let stat: fs.Stats;
      try {
        stat = fs.statSync(full);
      } catch {
        continue;
      }

      if (stat.size < settings.minSizeBytes) {
        skippedSmall += 1;
        continue;
      }

      let width = 0;
      let height = 0;
      try {
        const dim = sizeOf(full);
        width = dim.width ?? 0;
        height = dim.height ?? 0;
      } catch {
        // 尺寸读取失败仍可进入列表
      }

      const { targetWidth, targetHeight } = computeDefaultTargetSize(width, height);
      const normalizedExt = normalizeExt(ext);
      const relativePath = path.relative(absRoot, full);
      items.push({
        id: full,
        path: full,
        name: entry.name,
        relativePath: relativePath.split(path.sep).join('/'),
        ext: normalizedExt,
        width,
        height,
        targetWidth,
        targetHeight,
        size: stat.size,
      });
    }
  };

  walk(absRoot, initialLayers);

  items.sort((a, b) => a.relativePath.localeCompare(b.relativePath, 'zh'));
  return { items, scanned, skippedSmall };
}

function normalizeExt(ext: string): ImageExt {
  const e = ext.replace('.', '').toLowerCase();
  if (e === 'jpeg') {
    return 'jpeg';
  }
  if (e === 'jpg') {
    return 'jpg';
  }
  if (e === 'webp') {
    return 'webp';
  }
  return 'png';
}
