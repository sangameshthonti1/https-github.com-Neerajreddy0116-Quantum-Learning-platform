import { useSyncExternalStore, type AnchorHTMLAttributes } from 'react';

const subscribe = (notify: () => void) => {
  window.addEventListener('popstate', notify);
  return () => window.removeEventListener('popstate', notify);
};
export function navigate(href: string, replace = false) {
  const url = new URL(href, window.location.href);
  if (url.origin !== window.location.origin) { window.location.assign(href); return; }
  if (url.href === window.location.href) return;
  window.history[replace ? 'replaceState' : 'pushState'](null, '', url);
  window.dispatchEvent(new PopStateEvent('popstate'));
}
export function useLocation() {
  return useSyncExternalStore(subscribe, () => window.location.pathname + window.location.search);
}
/** Native links retain copy/open-in-new-tab behavior and same-page anchors. */
export function Link({ href = '/', onClick, ...props }: AnchorHTMLAttributes<HTMLAnchorElement>) {
  return <a {...props} href={href} onClick={(event) => {
    onClick?.(event);
    if (event.defaultPrevented || event.button !== 0 || event.metaKey || event.ctrlKey || event.shiftKey || event.altKey
      || props.target || props.download || href.startsWith('#') || new URL(href, location.href).origin !== location.origin) return;
    event.preventDefault(); navigate(href);
  }} />;
}
