export interface FeatureView {
  readonly id: 'compress' | 'ico' | 'base64';
  render(): string;
  /** 本功能私有浮层（设置/预览等） */
  renderOverlays?(): string;
  bind(): void;
  handleAction(
    action: string,
    id: string | undefined,
    el: HTMLElement,
    e: Event
  ): boolean;
  handleMessage(msg: { type: string; [k: string]: unknown }): boolean;
  onKeydown?(e: KeyboardEvent): boolean;
  /** 离开该路由时清理（如关闭本功能弹层） */
  onLeave?(): void;
}
