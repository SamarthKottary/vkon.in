/**
 * Stamps `data-theme` on <html> before first paint.
 *
 * This runs synchronously in <head>, ahead of any rendering, which is the only
 * way to avoid a flash of the wrong theme: React cannot help here because the
 * server does not know the visitor's preference and any client effect runs
 * after the first paint.
 *
 * Order of preference: an explicit choice in localStorage, else LIGHT.
 *
 * Deliberately not the OS setting. Most of this site's visitors are outdoors on
 * a phone in daylight, where the light theme is the readable one — and a farmer
 * whose phone happens to sit in dark mode should not be shown a dark industrial
 * page as their first impression of the brand. Dark stays one tap away.
 *
 * The value is always written to the attribute (never left implicit) so the CSS
 * needs a single selector rather than juggling a media query and an attribute.
 */
const script = `(function(){try{
var s=localStorage.getItem('vkon-theme');
document.documentElement.setAttribute('data-theme',(s==='dark')?'dark':'light');
}catch(e){document.documentElement.setAttribute('data-theme','light');}})();`;

export function ThemeScript() {
  return <script dangerouslySetInnerHTML={{ __html: script }} />;
}
