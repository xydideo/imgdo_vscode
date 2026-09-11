import * as vscode from 'vscode';
import type { ExtensionModule } from '../../core/module';
import { ImgDoPanel } from '../../shell/panel/ImgDoPanel';

/** Base64 转化：打开共享面板并路由到 base64 */
export const imageBase64Module: ExtensionModule = {
  id: 'image-base64',

  activate(context) {
    context.subscriptions.push(
      vscode.commands.registerCommand('imageBase64.openPanel', () => {
        ImgDoPanel.createOrShow(context, undefined, 'base64');
      })
    );
  },
};
