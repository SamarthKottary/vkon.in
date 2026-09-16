/**
 * An empty marker that has to be the **first element of a page**, so that
 * navigating to that page starts at the top of it.
 *
 * **What it is for.** On every navigation Next picks one element and scrolls it
 * into view — normally the page's first element, which is the top. It skips
 * `sticky` and `fixed` ones first, on the reasoning that a pinned box "will
 * likely pass the in-viewport check" and would make it wrongly conclude the
 * page is already in view (`shouldSkipElement` in
 * `next/dist/client/components/layout-router.js`).
 *
 * That reasoning is sound in general and wrong here, because on this site the
 * curtain *is* the top of the page: `/` opens with a `sticky` hero, `/about`
 * and `/contact` with a `sticky` masthead, `/products` with a `sticky` header
 * band. Next skips past all of them and lands on the first ordinary element it
 * finds — which is somewhere down the page. Measured on 2026-09-16, clicking
 * Home from the foot of `/contact` scrolled to the "What we make" curtain and
 * stopped there, and `/about` scrolled 3243px to its *last* section, every
 * section above it being sticky.
 *
 * This is that ordinary element, at the top where it belongs. Zero height, so
 * it changes no layout, but full width — `shouldSkipElement` only skips a box
 * whose every edge reads 0, so it must not be inline or `display: none`.
 *
 * Next also calls `focus()` on whatever it picked. A plain `div` with no
 * `tabindex` is not focusable, so that call does nothing here, which is the
 * intent: it used to focus a section in the middle of the page.
 *
 * **Keep it first.** Anything rendered above it — even a component that
 * returns `null`, since that contributes no DOM — is fine, but a real element
 * above it takes over the job and probably gets it wrong.
 */
export function PageTop() {
  return <div aria-hidden className="h-0" />;
}
