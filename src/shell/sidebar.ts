import * as vscode from 'vscode';

/**
 * 侧边栏快捷入口：点 Activity Bar 图标即打开图片压缩面板。
 */
export class ImgDoSidebarProvider implements vscode.WebviewViewProvider {
  public static readonly viewId = 'imgdo.sidebar';

  private view: vscode.WebviewView | undefined;

  constructor(private readonly context: vscode.ExtensionContext) {}

  resolveWebviewView(webviewView: vscode.WebviewView): void {
    this.view = webviewView;
    webviewView.webview.options = {
      enableScripts: true,
      localResourceRoots: [this.context.extensionUri],
    };
    webviewView.webview.html = this.getHtml();

    webviewView.webview.onDidReceiveMessage((msg: { type?: string }) => {
      if (msg?.type === 'open-compress') {
        this.openCompress();
      }
    });

    // 点侧边栏图标展开时直接打开图片压缩，无需二次选择
    if (webviewView.visible) {
      this.openCompress();
    }
    webviewView.onDidChangeVisibility(() => {
      if (webviewView.visible) {
        this.openCompress();
      }
    });
  }

  private openCompress(): void {
    void vscode.commands.executeCommand('imageCompress.openPanel');
  }

  private getHtml(): string {
    return `<!DOCTYPE html>
<html lang="zh-CN">
<head>
  <meta charset="UTF-8" />
  <meta name="viewport" content="width=device-width, initial-scale=1.0" />
  <style>
    body {
      margin: 0;
      padding: 12px;
      font-family: var(--vscode-font-family);
      font-size: var(--vscode-font-size);
      color: var(--vscode-foreground);
      background: transparent;
    }
    button {
      width: 100%;
      appearance: none;
      border: 1px solid var(--vscode-button-border, transparent);
      border-radius: 4px;
      padding: 8px 12px;
      cursor: pointer;
      font: inherit;
      color: var(--vscode-button-foreground);
      background: var(--vscode-button-background);
    }
    button:hover {
      background: var(--vscode-button-hoverBackground);
    }
  </style>
</head>
<body>
  <button type="button" id="open">打开图片压缩</button>
  <script>
    const vscode = acquireVsCodeApi();
    document.getElementById('open').addEventListener('click', () => {
      vscode.postMessage({ type: 'open-compress' });
    });
  </script>
</body>
</html>`;
  }
}
