import * as vscode from 'vscode';
import * as fs from 'fs';
import * as path from 'path';
import * as os from 'os';
import {
  AppSettings,
  CompressResultItem,
  HostToWebview,
  ImageItem,
  QUALITY_STEP,
  WebviewToHost,
} from './messages';
import { loadSettings, saveSettings } from '../config/settings';
import { collectImages } from '../scan/collectImages';
import { WorkerPool } from '../compress/workerPool';
import { writeCompressMetadata } from '../compress/metadata';
import { applyReplace } from '../replace/applyReplace';
import {
  resolveImageCompressWasmRoot,
  resolveImageCompressWebviewDir,
  resolveImageCompressWorker,
  IMAGE_COMPRESS_OUT_DIR,
} from '../paths';

export class ImageCompressPanel {
  public static current: ImageCompressPanel | undefined;

  private readonly panel: vscode.WebviewPanel;
  private readonly context: vscode.ExtensionContext;
  private disposables: vscode.Disposable[] = [];
  private settings: AppSettings;
  private items: ImageItem[] = [];
  private results: CompressResultItem[] = [];
  private rootPath = '';
  private cacheDir = '';
  private cancelling = false;
  private pool: WorkerPool | undefined;

  private constructor(panel: vscode.WebviewPanel, context: vscode.ExtensionContext) {
    this.panel = panel;
    this.context = context;
    this.settings = loadSettings(context);

    this.panel.webview.html = this.getHtml();
    this.panel.onDidDispose(() => this.dispose(), null, this.disposables);
    this.panel.webview.onDidReceiveMessage(
      (msg: WebviewToHost) => void this.onMessage(msg),
      null,
      this.disposables
    );
  }

  public static createOrShow(context: vscode.ExtensionContext, folderPath?: string) {
    const column = vscode.window.activeTextEditor?.viewColumn ?? vscode.ViewColumn.One;

    if (ImageCompressPanel.current) {
      ImageCompressPanel.current.panel.reveal(column);
      if (folderPath) {
        void ImageCompressPanel.current.scanFolder(folderPath);
      }
      return ImageCompressPanel.current;
    }

    const panel = vscode.window.createWebviewPanel(
      'imageCompress',
      'ImgDo · 图片压缩',
      column,
      {
        enableScripts: true,
        retainContextWhenHidden: true,
        localResourceRoots: [
          vscode.Uri.file(path.join(context.extensionPath, IMAGE_COMPRESS_OUT_DIR)),
          vscode.Uri.file(path.join(context.extensionPath, 'ImgDo')),
          context.globalStorageUri,
          vscode.Uri.file(os.tmpdir()),
          vscode.Uri.file(path.join(os.homedir())),
          ...(vscode.workspace.workspaceFolders?.map((f) => f.uri) ?? []),
        ],
      }
    );

    ImageCompressPanel.current = new ImageCompressPanel(panel, context);
    if (folderPath) {
      void ImageCompressPanel.current.scanFolder(folderPath);
    }
    return ImageCompressPanel.current;
  }

  private post(msg: HostToWebview) {
    void this.panel.webview.postMessage(msg);
  }

  private asWebviewUri(filePath: string): string {
    return this.panel.webview.asWebviewUri(vscode.Uri.file(filePath)).toString();
  }

  private workspaceInfo(): { canScanWorkspace: boolean; workspaceLabel?: string } {
    const folders = vscode.workspace.workspaceFolders;
    if (!folders || folders.length === 0) {
      return { canScanWorkspace: false };
    }
    if (folders.length === 1) {
      return {
        canScanWorkspace: true,
        workspaceLabel: folders[0].name,
      };
    }
    return { canScanWorkspace: false };
  }

  private async onMessage(msg: WebviewToHost) {
    switch (msg.type) {
      case 'ready': {
        const info = this.workspaceInfo();
        this.post({ type: 'init', ...info });
        this.post({ type: 'settings', settings: this.settings });
        break;
      }
      case 'saveSettings':
        this.settings = await saveSettings(this.context, msg.settings);
        this.post({ type: 'settings', settings: this.settings });
        this.post({ type: 'toast', level: 'info', message: '设置已保存' });
        break;
      case 'pickFolder': {
        const picked = await vscode.window.showOpenDialog({
          canSelectFiles: false,
          canSelectFolders: true,
          canSelectMany: false,
          openLabel: '选择要压缩的目录',
        });
        if (picked?.[0]) {
          await this.scanFolder(picked[0].fsPath);
        }
        break;
      }
      case 'scanWorkspace': {
        const folders = vscode.workspace.workspaceFolders;
        if (!folders || folders.length !== 1) {
          this.post({
            type: 'toast',
            level: 'warn',
            message: '多根工作区请拖入或选择具体文件夹',
          });
          return;
        }
        await this.scanFolder(folders[0].uri.fsPath);
        break;
      }
      case 'scanFolder':
        await this.scanFolder(msg.folderPath);
        break;
      case 'excludeFromQueue':
        this.items = this.items.filter((i) => i.id !== msg.id);
        this.post({
          type: 'queueUpdated',
          items: this.withPreview(this.items),
          summary: {
            scanned: this.items.length,
            skippedSmall: 0,
            rootPath: this.rootPath,
          },
        });
        break;
      case 'updateTargetSize':
        this.items = this.items.map((i) =>
          i.id === msg.id
            ? {
                ...i,
                targetWidth: Math.max(1, Math.round(msg.targetWidth)),
                targetHeight: Math.max(1, Math.round(msg.targetHeight)),
              }
            : i
        );
        break;
      case 'startCompress':
        await this.startCompress(msg.ids);
        break;
      case 'recompress':
        await this.recompress(msg.ids);
        break;
      case 'easeCompress':
        await this.easeCompress(msg.id);
        break;
      case 'convertToJpg':
        await this.convertToJpg(msg.id);
        break;
      case 'cancelCompress':
        this.cancelling = true;
        this.pool?.cancelAll();
        break;
      case 'excludeFromReplace': {
        this.results = this.results.map((r) =>
          r.id === msg.id ? { ...r, excluded: true } : r
        );
        this.post({ type: 'compressResult', items: this.results });
        break;
      }
      case 'confirmReplace':
        await this.doReplace();
        break;
      case 'resetToEntry':
        this.items = [];
        this.results = [];
        this.rootPath = '';
        break;
      default:
        break;
    }
  }

  private withPreview(items: ImageItem[]): ImageItem[] {
    return items.map((i) => ({
      ...i,
      previewUri: this.asWebviewUri(i.path),
    }));
  }

  public async scanFolder(folderPath: string) {
    if (!fs.existsSync(folderPath) || !fs.statSync(folderPath).isDirectory()) {
      this.post({ type: 'scanError', message: `目录不存在：${folderPath}` });
      return;
    }

    this.rootPath = folderPath;
    this.post({ type: 'scanStarted' });

    try {
      const result = await collectImages({
        rootPath: folderPath,
        settings: this.settings,
        onProgress: (current, message) => {
          if (current % 20 === 0) {
            this.post({ type: 'scanProgress', current, message });
          }
        },
      });

      this.items = result.items;

      this.post({
        type: 'scanResult',
        items: this.withPreview(result.items),
        summary: {
          scanned: result.scanned,
          skippedSmall: result.skippedSmall,
          rootPath: folderPath,
        },
      });

      if (!result.items.length) {
        this.post({
          type: 'toast',
          level: 'info',
          message: `未找到符合条件的图片（已跳过小于 ${Math.round(this.settings.minSizeBytes / 1024)}KB 的 ${result.skippedSmall} 个文件）`,
        });
      }
    } catch (err) {
      this.post({
        type: 'scanError',
        message: err instanceof Error ? err.message : String(err),
      });
    }
  }

  private ensurePool(): {
    wasmRoot: string;
    pool: WorkerPool;
  } {
    const wasmRoot = resolveImageCompressWasmRoot(this.context.extensionPath);
    const workerScript = resolveImageCompressWorker(this.context.extensionPath);
    if (!this.pool) {
      this.pool = new WorkerPool({ workerScript });
    }
    return { wasmRoot, pool: this.pool };
  }

  private ensureCacheDir() {
    if (!this.cacheDir) {
      this.cacheDir = path.join(
        this.context.globalStorageUri.fsPath,
        'cache',
        String(Date.now())
      );
      fs.mkdirSync(this.cacheDir, { recursive: true });
    }
    return this.cacheDir;
  }

  private async startCompress(ids: string[]) {
    const selected = this.items.filter((i) => ids.includes(i.id));
    if (!selected.length) {
      this.post({ type: 'toast', level: 'warn', message: '没有可压缩的图片' });
      return;
    }

    this.cancelling = false;
    this.cacheDir = path.join(
      this.context.globalStorageUri.fsPath,
      'cache',
      String(Date.now())
    );
    fs.mkdirSync(this.cacheDir, { recursive: true });

    this.post({ type: 'compressStarted', total: selected.length });

    const baseRate = this.settings.compressRate;
    const step = QUALITY_STEP;
    const minSaving = this.settings.minSavingRatio ?? 0.2;
    const wasmRoot = resolveImageCompressWasmRoot(this.context.extensionPath);
    const workerScript = resolveImageCompressWorker(this.context.extensionPath);

    await this.pool?.dispose();
    this.pool = new WorkerPool({ workerScript });

    const results: CompressResultItem[] = [];
    let completed = 0;
    const concurrency = Math.max(1, os.cpus().length - 1);
    let cursor = 0;

    const compressWithRetry = async (
      item: (typeof selected)[number],
      index: number
    ) => {
      const outName = item.relativePath.replace(/[\\/]/g, '__');
      let rate = baseRate;
      let lastError = '压缩后未变小，已跳过';
      let best:
        | {
            outputPath: string;
            originalSize: number;
            compressedSize: number;
            width: number;
            height: number;
            quality: number;
            rate: number;
          }
        | undefined;

      // 未达到最小缩小幅度时自动降档；最后一档接受「有变小」的最佳结果
      const maxAttempts = 8;
      for (let attempt = 0; attempt < maxAttempts; attempt++) {
        if (this.cancelling) {
          throw new Error('cancelled');
        }
        const quality = Math.max(10, Math.round(rate * 100));
        const pngLevel = Math.min(6, 3 + Math.floor(attempt / 2));
        const nextRate = Math.round((rate - step) * 100) / 100;
        const isLast = attempt === maxAttempts - 1 || nextRate < 0.1;
        const outputPath = path.join(
          this.cacheDir!,
          `${index}_a${attempt}_${outName}`
        );

        const response = await this.pool!.run({
          id: item.id,
          inputPath: item.path,
          outputPath,
          ext: item.ext,
          quality,
          pngLevel,
          targetWidth: item.targetWidth,
          targetHeight: item.targetHeight,
          wasmRoot,
        });

        if (!response.ok) {
          lastError = response.error || '压缩失败';
          break;
        }

        if (response.error !== 'skipped-larger' && response.outputPath) {
          const originalSize = response.originalSize ?? item.size;
          const compressedSize = response.compressedSize ?? originalSize;
          const saving = 1 - compressedSize / originalSize;
          const candidate = {
            outputPath: response.outputPath,
            originalSize,
            compressedSize,
            width: response.width || item.width,
            height: response.height || item.height,
            quality,
            rate,
          };
          if (!best || compressedSize < best.compressedSize) {
            best = candidate;
          }

          if (saving >= minSaving || isLast) {
            writeCompressMetadata(
              best.outputPath,
              item.ext,
              best.originalSize,
              best.compressedSize
            );
            return {
              id: item.id,
              path: item.path,
              name: item.name,
              relativePath: item.relativePath,
              ext: item.ext,
              width: best.width,
              height: best.height,
              targetWidth: item.targetWidth,
              targetHeight: item.targetHeight,
              originalSize: best.originalSize,
              compressedSize: best.compressedSize,
              ratio: best.compressedSize / best.originalSize,
              originalPreviewUri: this.asWebviewUri(item.path),
              compressedPreviewUri: this.asWebviewUri(best.outputPath),
              cachePath: best.outputPath,
              excluded: false,
              skipped: false,
              lastQuality: best.quality,
              lastRate: best.rate,
            } satisfies CompressResultItem;
          }

          lastError = `压缩幅度不足（需 ≥ ${Math.round(minSaving * 100)}%），继续降档`;
        } else {
          lastError = '压缩后未变小，已跳过';
        }

        if (isLast) {
          break;
        }
        rate = nextRate;
      }

      if (this.cancelling) {
        throw new Error('cancelled');
      }

      if (best) {
        writeCompressMetadata(
          best.outputPath,
          item.ext,
          best.originalSize,
          best.compressedSize
        );
        return {
          id: item.id,
          path: item.path,
          name: item.name,
          relativePath: item.relativePath,
          ext: item.ext,
          width: best.width,
          height: best.height,
          targetWidth: item.targetWidth,
          targetHeight: item.targetHeight,
          originalSize: best.originalSize,
          compressedSize: best.compressedSize,
          ratio: best.compressedSize / best.originalSize,
          originalPreviewUri: this.asWebviewUri(item.path),
          compressedPreviewUri: this.asWebviewUri(best.outputPath),
          cachePath: best.outputPath,
          excluded: false,
          skipped: false,
          lastQuality: best.quality,
          lastRate: best.rate,
        } satisfies CompressResultItem;
      }

      return {
        id: item.id,
        path: item.path,
        name: item.name,
        relativePath: item.relativePath,
        ext: item.ext,
        width: item.width,
        height: item.height,
        targetWidth: item.targetWidth,
        targetHeight: item.targetHeight,
        originalSize: item.size,
        compressedSize: item.size,
        ratio: 1,
        originalPreviewUri: this.asWebviewUri(item.path),
        compressedPreviewUri: this.asWebviewUri(item.path),
        cachePath: '',
        excluded: false,
        skipped: true,
        error: lastError,
      } satisfies CompressResultItem;
    };

    const runNext = async (): Promise<void> => {
      while (true) {
        if (this.cancelling) {
          return;
        }
        const index = cursor++;
        if (index >= selected.length) {
          return;
        }
        const item = selected[index];
        this.post({
          type: 'compressProgress',
          done: completed,
          total: selected.length,
          current: item.relativePath,
        });
        try {
          results[index] = await compressWithRetry(item, index);
          completed += 1;
          this.post({
            type: 'compressProgress',
            done: completed,
            total: selected.length,
            current: item.relativePath,
          });
        } catch (err) {
          if (this.cancelling || (err instanceof Error && err.message === 'cancelled')) {
            return;
          }
          throw err;
        }
      }
    };

    try {
      await Promise.all(
        Array.from({ length: Math.min(concurrency, selected.length) }, () => runNext())
      );

      const finished = results.filter(Boolean);
      if (this.cancelling) {
        this.results = finished;
        if (finished.length) {
          this.post({ type: 'compressResult', items: finished });
          this.post({
            type: 'toast',
            level: 'info',
            message: `已取消，保留 ${finished.length} 张已完成结果`,
          });
        } else {
          this.post({ type: 'compressError', message: '已取消压缩' });
        }
        return;
      }

      this.results = finished;
      this.post({
        type: 'compressProgress',
        done: selected.length,
        total: selected.length,
        current: '完成',
      });
      this.post({ type: 'compressResult', items: this.results });
    } catch (err) {
      if (this.cancelling || (err instanceof Error && err.message === 'cancelled')) {
        const finished = results.filter(Boolean);
        this.results = finished;
        if (finished.length) {
          this.post({ type: 'compressResult', items: finished });
          this.post({
            type: 'toast',
            level: 'info',
            message: `已取消，保留 ${finished.length} 张已完成结果`,
          });
        } else {
          this.post({ type: 'compressError', message: '已取消压缩' });
        }
        return;
      }
      this.post({
        type: 'compressError',
        message: err instanceof Error ? err.message : String(err),
      });
    }
  }

  /** 对已有压缩结果继续加压：以当前压缩图为输入，质量递降，覆盖缓存 */
  private async recompress(ids: string[]) {
    const targets = this.results.filter((r) => ids.includes(r.id) && !r.excluded);
    if (!targets.length) {
      this.post({ type: 'toast', level: 'warn', message: '没有可继续压缩的图片' });
      return;
    }

    this.ensureCacheDir();

    this.cancelling = false;
    this.post({ type: 'recompressStarted', total: targets.length });

    const { wasmRoot, pool } = this.ensurePool();

    let done = 0;
    for (const item of targets) {
      if (this.cancelling) {
        break;
      }

      const prevRate =
        item.lastRate ??
        (item.lastQuality != null ? item.lastQuality / 100 : this.settings.compressRate);
      const step = QUALITY_STEP;
      const nextRate = Math.max(0.1, Math.round((prevRate - step) * 100) / 100);
      const quality = Math.max(10, Math.round(nextRate * 100));
      const inputPath =
        item.cachePath && fs.existsSync(item.cachePath) ? item.cachePath : item.path;
      const outExt = item.outputExt || item.ext;
      const outName = item.relativePath.replace(/[\\/]/g, '__');
      const outputPath = path.join(
        this.cacheDir,
        `re_${Date.now()}_${outName}`
      );

      const response = await this.pool.run({
        id: item.id,
        inputPath,
        outputPath,
        ext: item.convertedToJpg ? 'jpg' : item.ext,
        outputExt: outExt,
        quality,
        pngLevel: 4,
        targetWidth: item.targetWidth,
        targetHeight: item.targetHeight,
        wasmRoot,
      });

      done += 1;
      this.post({
        type: 'compressProgress',
        done,
        total: targets.length,
        current: item.relativePath,
      });

      if (!response.ok || response.error === 'skipped-larger' || !response.outputPath) {
        this.post({
          type: 'toast',
          level: 'warn',
          message: `${item.name} 再压未变小或失败${response.error ? `：${response.error}` : ''}`,
        });
        // 体积未变小时不更新 lastRate，避免界面显示“率已降”但文件未变
        continue;
      }

      writeCompressMetadata(
        response.outputPath,
        item.ext,
        item.originalSize,
        response.compressedSize ?? 0
      );

      const compressedSize = response.compressedSize ?? item.compressedSize;
      this.results = this.results.map((r) => {
        if (r.id !== item.id) {
          return r;
        }
        return {
          ...r,
          width: response.width || r.width,
          height: response.height || r.height,
          compressedSize,
          ratio: compressedSize / r.originalSize,
          compressedPreviewUri: this.asWebviewUri(response.outputPath!),
          cachePath: response.outputPath!,
          skipped: false,
          excluded: false,
          error: undefined,
          lastQuality: quality,
          lastRate: nextRate,
        };
      });
    }

    this.post({ type: 'compressResult', items: this.results });
    this.post({
      type: 'toast',
      level: 'info',
      message: `再压完成（${done}/${targets.length}）`,
    });
  }

  /**
   * 稍微减压：目标体积取「原图与当前压缩图」的中间值，
   * 从原图按质量二分逼近该体积（质量介于当前档与更高档之间）。
   */
  private async easeCompress(id: string) {
    const item = this.results.find((r) => r.id === id && !r.excluded && !r.skipped);
    if (!item?.cachePath) {
      this.post({ type: 'toast', level: 'warn', message: '没有可减压的图片' });
      return;
    }
    if (item.compressedSize >= item.originalSize) {
      this.post({ type: 'toast', level: 'warn', message: '当前并未压小，无需减压' });
      return;
    }

    this.ensureCacheDir();

    this.cancelling = false;
    this.post({ type: 'recompressStarted', total: 1 });
    this.post({
      type: 'compressProgress',
      done: 0,
      total: 1,
      current: `${item.name} 稍微减压中…`,
    });

    const { wasmRoot } = this.ensurePool();
    const targetBytes = Math.round((item.originalSize + item.compressedSize) / 2);
    const outExt = item.outputExt || item.ext;
    // 从原图编码；质量下界略高于当前档，上界接近原图观感
    let lo = Math.min(95, Math.max(10, (item.lastQuality ?? 40) + 5));
    let hi = 95;
    if (lo > hi) {
      lo = Math.max(10, hi - 10);
    }

    const queueItem = this.items.find((i) => i.id === id);
    const targetWidth = item.targetWidth ?? queueItem?.targetWidth;
    const targetHeight = item.targetHeight ?? queueItem?.targetHeight;
    const baseName = item.relativePath.replace(/[\\/]/g, '__');

    let best:
      | {
          outputPath: string;
          compressedSize: number;
          width: number;
          height: number;
          quality: number;
        }
      | undefined;

    const maxIters = 8;
    for (let iter = 0; iter < maxIters && lo <= hi; iter++) {
      if (this.cancelling) {
        break;
      }
      const quality = Math.round((lo + hi) / 2);
      const outputPath = path.join(
        this.cacheDir,
        `ease_${Date.now()}_${iter}_${baseName}`
      );

      const response = await this.pool.run({
        id: item.id,
        inputPath: item.path,
        outputPath,
        ext: item.ext,
        outputExt: outExt,
        quality,
        pngLevel: 4,
        targetWidth,
        targetHeight,
        wasmRoot,
      });

      if (!response.ok || response.error === 'skipped-larger' || !response.outputPath) {
        // 体积 ≥ 原图，降低质量
        hi = quality - 1;
        continue;
      }

      const size = response.compressedSize ?? 0;
      const candidate = {
        outputPath: response.outputPath,
        compressedSize: size,
        width: response.width || item.width,
        height: response.height || item.height,
        quality,
      };
      if (
        !best ||
        Math.abs(size - targetBytes) < Math.abs(best.compressedSize - targetBytes)
      ) {
        best = candidate;
      }

      if (size < targetBytes) {
        lo = quality + 1;
      } else {
        hi = quality - 1;
      }
    }

    if (!best || best.compressedSize <= item.compressedSize) {
      this.post({
        type: 'toast',
        level: 'warn',
        message: `${item.name} 减压未找到更接近中间体积的结果`,
      });
      this.post({ type: 'compressResult', items: this.results });
      return;
    }

    writeCompressMetadata(
      best.outputPath,
      outExt,
      item.originalSize,
      best.compressedSize
    );

    this.results = this.results.map((r) => {
      if (r.id !== item.id) {
        return r;
      }
      return {
        ...r,
        width: best!.width,
        height: best!.height,
        compressedSize: best!.compressedSize,
        ratio: best!.compressedSize / r.originalSize,
        compressedPreviewUri: this.asWebviewUri(best!.outputPath),
        cachePath: best!.outputPath,
        skipped: false,
        excluded: false,
        error: undefined,
        lastQuality: best!.quality,
        lastRate: best!.quality / 100,
      };
    });

    const midKb = (targetBytes / 1024).toFixed(1);
    const nowKb = (best.compressedSize / 1024).toFixed(1);
    this.post({ type: 'compressResult', items: this.results });
    this.post({
      type: 'toast',
      level: 'info',
      message: `${item.name} 已稍微减压（中间目标约 ${midKb} KB，现 ${nowKb} KB）`,
    });
  }

  /** PNG 压缩不明显时：从原图转成 JPG 再压 */
  private async convertToJpg(id: string) {
    const item = this.results.find((r) => r.id === id);
    if (!item || item.ext !== 'png') {
      this.post({ type: 'toast', level: 'warn', message: '仅支持将 PNG 压成 JPG' });
      return;
    }
    if (item.convertedToJpg) {
      this.post({ type: 'toast', level: 'info', message: '该图已是 JPG 产物' });
      return;
    }

    this.ensureCacheDir();

    this.cancelling = false;
    this.post({ type: 'recompressStarted', total: 1 });

    const { wasmRoot } = this.ensurePool();

    const minSaving = this.settings.minSavingRatio ?? 0.2;
    const queueItem = this.items.find((i) => i.id === id);
    const targetWidth = item.targetWidth ?? queueItem?.targetWidth;
    const targetHeight = item.targetHeight ?? queueItem?.targetHeight;
    let rate = this.settings.compressRate;
    let best:
      | {
          outputPath: string;
          compressedSize: number;
          width: number;
          height: number;
          quality: number;
          rate: number;
        }
      | undefined;

    const baseName = item.relativePath.replace(/[\\/]/g, '__').replace(/\.png$/i, '');
    const maxAttempts = 8;

    for (let attempt = 0; attempt < maxAttempts; attempt++) {
      if (this.cancelling) {
        break;
      }
      const quality = Math.max(10, Math.round(rate * 100));
      const nextRate = Math.round((rate - QUALITY_STEP) * 100) / 100;
      const isLast = attempt === maxAttempts - 1 || nextRate < 0.1;
      const outputPath = path.join(
        this.cacheDir,
        `jpg_${Date.now()}_${attempt}_${baseName}.jpg`
      );

      const response = await this.pool.run({
        id: item.id,
        inputPath: item.path,
        outputPath,
        ext: 'png',
        outputExt: 'jpg',
        quality,
        targetWidth: item.targetWidth,
        targetHeight: item.targetHeight,
        wasmRoot,
      });

      this.post({
        type: 'compressProgress',
        done: attempt + 1,
        total: maxAttempts,
        current: item.relativePath,
      });

      if (!response.ok) {
        this.post({
          type: 'toast',
          level: 'error',
          message: response.error || '转 JPG 失败',
        });
        break;
      }

      if (response.error !== 'skipped-larger' && response.outputPath) {
        const compressedSize = response.compressedSize ?? item.originalSize;
        const saving = 1 - compressedSize / item.originalSize;
        const candidate = {
          outputPath: response.outputPath,
          compressedSize,
          width: response.width || item.width,
          height: response.height || item.height,
          quality,
          rate,
        };
        if (!best || compressedSize < best.compressedSize) {
          best = candidate;
        }
        if (saving >= minSaving || isLast) {
          break;
        }
      }

      if (isLast) {
        break;
      }
      rate = nextRate;
    }

    if (!best) {
      this.post({
        type: 'toast',
        level: 'warn',
        message: `${item.name} 转 JPG 后仍未变小`,
      });
      this.post({ type: 'compressResult', items: this.results });
      return;
    }

    writeCompressMetadata(best.outputPath, 'jpg', item.originalSize, best.compressedSize);

    const newName = item.name.replace(/\.png$/i, '.jpg');
    const newRelative = item.relativePath.replace(/\.png$/i, '.jpg');

    this.results = this.results.map((r) => {
      if (r.id !== item.id) {
        return r;
      }
      return {
        ...r,
        name: newName,
        relativePath: newRelative,
        outputExt: 'jpg',
        convertedToJpg: true,
        width: best!.width,
        height: best!.height,
        compressedSize: best!.compressedSize,
        ratio: best!.compressedSize / r.originalSize,
        compressedPreviewUri: this.asWebviewUri(best!.outputPath),
        cachePath: best!.outputPath,
        skipped: false,
        excluded: false,
        error: undefined,
        lastQuality: best!.quality,
        lastRate: best!.rate,
      };
    });

    this.post({ type: 'compressResult', items: this.results });
    this.post({
      type: 'toast',
      level: 'info',
      message: `${item.name} 已压成 JPG（${Math.round((1 - best.compressedSize / item.originalSize) * 1000) / 10}%）`,
    });
  }

  private async doReplace() {
    if (!this.rootPath) {
      this.post({ type: 'toast', level: 'error', message: '缺少项目根路径' });
      return;
    }
    try {
      const outcome = await applyReplace({
        projectRoot: this.rootPath,
        items: this.results,
        backup: this.settings.backupOnReplace,
      });
      this.post({
        type: 'replaceResult',
        ok: outcome.replaced > 0,
        replaced: outcome.replaced,
        backupPath: outcome.backupPath,
        message: outcome.message,
        items: outcome.items,
      });
    } catch (err) {
      this.post({
        type: 'replaceResult',
        ok: false,
        replaced: 0,
        message: err instanceof Error ? err.message : String(err),
        items: [],
      });
    }
  }

  private getHtml(): string {
    const webview = this.panel.webview;
    const webviewDir = resolveImageCompressWebviewDir(this.context.extensionPath);
    const scriptUri = webview.asWebviewUri(
      vscode.Uri.file(path.join(webviewDir, 'main.js'))
    );
    const styleUri = webview.asWebviewUri(
      vscode.Uri.file(path.join(webviewDir, 'styles.css'))
    );
    const nonce = getNonce();

    return `<!DOCTYPE html>
<html lang="zh-CN">
<head>
  <meta charset="UTF-8" />
  <meta http-equiv="Content-Security-Policy" content="default-src 'none'; img-src ${webview.cspSource} data: file: blob:; style-src ${webview.cspSource} 'unsafe-inline'; script-src 'nonce-${nonce}';" />
  <meta name="viewport" content="width=device-width, initial-scale=1.0" />
  <link href="${styleUri}" rel="stylesheet" />
  <title>ImgDo · 图片压缩</title>
</head>
<body>
  <div id="app"></div>
  <script nonce="${nonce}" src="${scriptUri}"></script>
</body>
</html>`;
  }

  public dispose() {
    ImageCompressPanel.current = undefined;
    void this.pool?.dispose();
    this.panel.dispose();
    while (this.disposables.length) {
      this.disposables.pop()?.dispose();
    }
  }
}

function getNonce() {
  let text = '';
  const possible = 'ABCDEFGHIJKLMNOPQRSTUVWXYZabcdefghijklmnopqrstuvwxyz0123456789';
  for (let i = 0; i < 32; i++) {
    text += possible.charAt(Math.floor(Math.random() * possible.length));
  }
  return text;
}
