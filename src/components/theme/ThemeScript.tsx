/**
 * Stamps `data-theme` on <html> before first paint.
 *
 * This runs synchronously in <head>, ahead of any rendering, which is the only
 * way to avoid a flash of the wrong theme: React cannot help here because the
 * server does not know the visitor's preference and any client effect runs
 * after the first paint.
 *
 * Order of preference: an explicit choice in localStorage, else the operating
 * system setting. The value is always written to the attribute (never left
 * implicit) so the CSS needs a single selector rather than juggling a media
 * query and an attribute.
 */
const script = `(function(){try{
var s=localStorage.getItem('vkon-theme');
var t=(s==='dark'||s==='light')?s:(window.matchMedia('(prefers-color-scheme: dark)').matches?'dark':'light');
document.documentElement.setAttribute('data-theme',t);
}catch(e){document.documentElement.setAttribute('data-theme','light');}})();`;

export function ThemeScript() {
  return <script dangerouslySetInnerHTML={{ __html: script }} />;
}
