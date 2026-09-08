# Working on this site

This is the source of https://zariffidachowdhury.github.io/ (GitHub Pages, user site, `main` branch, root). Hand-written HTML, CSS and a little JavaScript, no framework, no build step, no external requests.

## Rules

- Never use an em dash or a semicolon in any prose: page copy, résumé, README, commit messages. Use a comma, a period or a plain hyphen instead. The only semicolons allowed are inside the CSP meta tag, CSS and JavaScript.
- Location is Oxford, Ohio. Degree line is "B.S. Computer Science, Miami University, expected September 2026" until told otherwise.
- The page pins a SHA-256 for every CSS, font, image, JS and résumé file (see the colophon). After changing any file in `css/`, `fonts/`, `img/`, `js/` (every `js/*.js` is pinned) or either résumé file, run `python3 tools/integrity.py` from this folder before committing. It rewrites the manifest and the ledger rows inside `index.html`, and stamps every stylesheet and script tag in the three pages with a Subresource Integrity attribute and a `?v=` cache key. Editing only the text of `index.html` does not need a re-pin.
- The page has a strict Content Security Policy: no inline `style=""`, no inline `<script>` blocks except the JSON manifest, no external scripts, fonts or images. Add a class in `css/site.css` instead of an inline style.
- `resume.pdf` is `resume.html` printed. Regenerate it after any résumé edit (Playwright Chromium or Chrome print to PDF, Letter, backgrounds on) and keep it to one page. The résumé is all black on white, no accent color.
- One accent color only (`--ox` in `css/site.css`). Two palettes, paper by day and slate by night, both defined in the `:root` blocks at the top of `css/site.css`. Radius 0, no gradients, no drop shadows.
- Before every commit run `python3 tools/check.py`. It fails with a list if the pins or SRI attributes are stale, if prose has an em dash or semicolon, if anything breaks the CSP, if the PDF is not one page, if a link is dead, or if the receipts drifted from the clones. GitHub Actions runs the same check on every push.
- Commit from this clone with `git`. Never use "Add files via upload" on github.com.

## Preview

`python3 -m http.server 8000` in this folder, then open http://localhost:8000. Fonts and the self-audit do not work from a `file://` URL.

## Layout

- `index.html` all page copy, sections are commented
- The CYB 334 coursework row folds open onto a hand-authored inline SVG (`.netmap`), styled in `css/site.css`. No JS, no image file. Edit the coordinates in place if the topology changes
- `css/site.css` tokens at the top in `:root`
- `resume.html` and `css/resume.css` the résumé
- `js/audit.js` re-hashes the pinned files in the visitor's browser
- `js/bench.js` the Feistel bench (demo round function, swap in the real ZFC one if wanted)
- `js/nav.js` day/night toggle, current-section marking, j/k keys, copy email
- `js/theme.js` applies a saved theme before first paint, loaded in the head
- `js/trace.js` the ray tracer plate (reads the palette from CSS variables, so it re-inks at night)
- `tools/integrity.py` writes the pinned hashes into `index.html`
- `tools/receipts.py` rebuilds the code excerpts under both Selected work entries from clones of capstone-gpt and secure-rag-guardrails next to the site's parent folder (`python3 tools/receipts.py`, or pass `--capstone-gpt PATH` and `--secure-rag-guardrails PATH`). The line links are pinned to each clone's commit, so rerun it after either repo changes. It also captures `demo.py` output for the guardrails plate. Never hand-edit the blocks between the receipts or demo markers in `index.html`
- `tools/check.py` the pre-commit check described above
