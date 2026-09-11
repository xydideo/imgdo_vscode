import * as vscode from 'vscode';
import type { ExtensionModule } from '../../core/module';
import { ImgDoPanel } from '../../shell/panel/ImgDoPanel';

/** ICO 生成：打开共享面板并路由到 ico */
export const imageIcoModule: ExtensionModule = {
  id: 'image-ico',

  activate(context) {
    context.subscriptions.push(
      vscode.commands.registerCommand('imageIco.openPanel', () => {
        ImgDoPanel.createOrShow(context, undefined, 'ico');
      }),
      // 兼容旧命令
      vscode.commands.registerCommand('imageConvert.openPanel', () => {
        ImgDoPanel.createOrShow(context, undefined, 'ico');
      })
    );
  },
};
