import * as fs from 'fs';
import type * as vscode from 'vscode';
import type { ExtensionModule } from './core/module';
import { imageCompressModule } from './modules/image-compress';

/**
 * 已启用的功能模块列表。
 * 新增能力：实现 ExtensionModule 后追加到此数组即可。
 */
const modules: ExtensionModule[] = [imageCompressModule];

export function activate(context: vscode.ExtensionContext) {
  fs.mkdirSync(context.globalStorageUri.fsPath, { recursive: true });

  for (const mod of modules) {
    void mod.activate(context);
  }
}

export function deactivate() {
  for (const mod of modules) {
    void mod.deactivate?.();
  }
}
