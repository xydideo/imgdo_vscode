import * as vscode from 'vscode';
import type { ExtensionModule } from '../../core/module';
import { ImageCompressPanel } from './panel/ImageCompressPanel';

/**
 * 图片压缩功能模块。
 * 命令、面板、Worker、Webview 均收敛在本目录，不污染主入口。
 */
export const imageCompressModule: ExtensionModule = {
  id: 'image-compress',

  activate(context) {
    context.subscriptions.push(
      vscode.commands.registerCommand('imageCompress.openPanel', () => {
        ImageCompressPanel.createOrShow(context);
      })
    );

    context.subscriptions.push(
      vscode.commands.registerCommand(
        'imageCompress.openFolder',
        (uri?: vscode.Uri) => {
          ImageCompressPanel.createOrShow(context, uri?.fsPath);
        }
      )
    );
  },
};
