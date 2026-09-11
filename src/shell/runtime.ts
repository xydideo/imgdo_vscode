/** 避免 feedback / feature 与 app 循环依赖：统一通过注册的 renderer 触发重绘 */

let renderFn: (() => void) | undefined;

export function setRenderer(fn: () => void): void {
  renderFn = fn;
}

export function requestRender(): void {
  renderFn?.();
}
