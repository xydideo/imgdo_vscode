import type { WebviewToHost } from '../modules/image-compress/panel/messages';

declare function acquireVsCodeApi(): {
  postMessage(msg: WebviewToHost): void;
};

const vscode = acquireVsCodeApi();

export function post(msg: WebviewToHost): void {
  vscode.postMessage(msg);
}
