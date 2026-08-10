<!-- BEGIN:nextjs-agent-rules -->
# This is NOT the Next.js you know

This version has breaking changes — APIs, conventions, and file structure may all differ from your training data. Read the relevant guide in `node_modules/next/dist/docs/` before writing any code. Heed deprecation notices.
<!-- END:nextjs-agent-rules -->

# Project

Read [docs/ARCHITECTURE.md](docs/ARCHITECTURE.md) before making structural changes.
It records the layering, the design tokens and contrast rules, and a set of
load-bearing constraints in §7 that each encode a real bug — breaking one
reintroduces it.

**Keep it current.** Any change that touches structure, adds or removes a
dependency, adds a client component, or alters a §7 constraint must update
ARCHITECTURE.md in the same change, and add a dated entry to its change log.
Content-only edits (`src/content/`, copy, product data) do not need an entry.

Runtime dependencies are deliberately limited to `next`, `react`, `react-dom` —
this site targets low-end Android phones on rural connections. Adding one is a
decision to record, not a default.
