import type * as vscode from 'vscode';

/**
 * 扩展功能模块约定。
 * 后续新能力（如资源清理、格式转换等）实现此接口后挂到 extension.ts 即可。
 */
export interface ExtensionModule {
  /** 稳定模块 ID，用于日志与排查 */
  readonly id: string;
  activate(context: vscode.ExtensionContext): void | Promise<void>;
  deactivate?(): void | Promise<void>;
}
