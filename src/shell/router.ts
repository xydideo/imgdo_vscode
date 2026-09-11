export type Route = 'compress' | 'ico' | 'base64';

let route: Route = 'compress';
let onRouteChange: ((r: Route) => void) | undefined;

export function getRoute(): Route {
  return route;
}

export function navigate(next: Route): void {
  if (route === next) {
    return;
  }
  route = next;
  onRouteChange?.(route);
}

/** Host init / reveal 时同步路由，不触发二次 navigate 副作用 */
export function setRouteFromHost(next: Route): void {
  route = next;
}

export function setRouteChangeHandler(fn: (r: Route) => void): void {
  onRouteChange = fn;
}

export function isRoute(v: unknown): v is Route {
  return v === 'compress' || v === 'ico' || v === 'base64';
}
