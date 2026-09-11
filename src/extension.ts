import * as fs from 'fs';
import * as vscode from 'vscode';
import type { ExtensionModule } from './core/module';
import { imageCompressModule } from './modules/image-compress';
import { imageIcoModule } from './modules/image-ico';
import { imageBase64Module } from './modules/image-base64';
import { ImgDoSidebarProvider } from './shell/sidebar';

/**
 * 已启用的功能模块列表。
 * 新增能力：实现 ExtensionModule 后追加到此数组即可。
 */
const modules: ExtensionModule[] = [
  imageCompressModule,
  imageIcoModule,
  imageBase64Module,
];

export function activate(context: vscode.ExtensionContext) {
  fs.mkdirSync(context.globalStorageUri.fsPath, { recursive: true });

  context.subscriptions.push(
    vscode.window.registerWebviewViewProvider(
      ImgDoSidebarProvider.viewId,
      new ImgDoSidebarProvider(context)
    )
  );

  for (const mod of modules) {
    void mod.activate(context);
  }
}

export function deactivate() {
  for (const mod of modules) {
    void mod.deactivate?.();
  }
}
