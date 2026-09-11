import * as vscode from 'vscode';
import type { ExtensionModule } from '../../core/module';
import { ImgDoPanel } from '../../shell/panel/ImgDoPanel';

/**
 * 图片压缩功能模块。
 * 仅注册压缩相关命令；打开面板时路由到 compress。
 */
export const imageCompressModule: ExtensionModule = {
  id: 'image-compress',

  activate(context) {
    context.subscriptions.push(
      vscode.commands.registerCommand('imageCompress.openPanel', () => {
        ImgDoPanel.createOrShow(context, undefined, 'compress');
      })
    );

    context.subscriptions.push(
      vscode.commands.registerCommand(
        'imageCompress.openFolder',
        (uri?: vscode.Uri) => {
          ImgDoPanel.createOrShow(context, uri?.fsPath, 'compress');
        }
      )
    );
  },
};
