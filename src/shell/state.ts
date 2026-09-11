import type { Route } from './router';

export interface ConfirmState {
  title: string;
  message: string;
  confirmText: string;
  onConfirm: () => void;
  /** 换格式替换提示行：from → to（相对路径） */
  formatChanges?: Array<{ from: string; to: string }>;
  /** 仅确认、不显示取消（如保存成功） */
  hideCancel?: boolean;
}

/** Shell-only chrome：路由、toast、banner、confirm */
export interface ShellState {
  route: Route;
  toast?: { level: 'info' | 'warn' | 'error'; message: string };
  banner?: { message: string };
  confirm?: ConfirmState;
}

export const shellState: ShellState = {
  route: 'compress',
};
