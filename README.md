# zariffidachowdhury.github.io

Source for my personal site and résumé, served by GitHub Pages at <https://zariffidachowdhury.github.io/>.

## What it is

Hand-written HTML and CSS. No framework, no analytics, no cookies, and no requests to other hosts: the three typefaces are self-hosted from `fonts/`. A strict Content-Security-Policy (set in a `<meta>` tag, since GitHub Pages can't send headers) allows nothing but this origin — no inline script, no inline style.

The page also checks itself: `tools/integrity.py` pins a SHA-256 hash of every file the page loads into `index.html`, and `js/audit.js` re-hashes each file in the visitor's browser and reports the result in the colophon.

| Path | What it is |
|---|---|
| `index.html` | The site: selected work, experience, about, tools, contact |
| `resume.html` | The résumé as a web page; also the source of `resume.pdf` |
| `resume.pdf` | One US-Letter page, printed from `resume.html` (see below) |
| `404.html` | Not-found page in the same style |
| `css/site.css`, `css/resume.css` | All styling; the design tokens sit at the top of each file |
| `js/audit.js` | Re-hashes every loaded file with SubtleCrypto and compares against the pinned manifest |
| `tools/integrity.py` | Writes the manifest and the integrity ledger into `index.html` — run it after changing any file |
| `fonts/` | Source Serif 4, IBM Plex Sans and IBM Plex Mono (latin subsets, WOFF2), `fonts.css`, and the licenses |
| `img/` | Headshot, Capstone GPT screenshots, Open Graph card, favicons |
| `robots.txt`, `sitemap.xml`, `.nojekyll` | Crawl hints; `.nojekyll` tells Pages to publish the files exactly as committed |

Deployment is GitHub Pages from the `main` branch, root directory. Pushing to `main` publishes.

## After changing any file

```bash
python3 tools/integrity.py   # re-pin the hashes, then commit index.html with the change
```

If you forget, the site still works — the colophon will just report which file differs from what was pinned.

## Run it locally

```bash
python3 -m http.server 8000
```

Then open <http://localhost:8000/>. Serve it over HTTP rather than opening the file directly: Chromium will not load the self-hosted fonts from `file://`.

## Regenerating the résumé PDF

`resume.pdf` is Chromium's print-to-PDF of `resume.html`. The page size and margins come from the `@page` rule in `css/resume.css` (US Letter), backgrounds are printed, and the small navigation bar at the top of the page is hidden in print. With the local server running:

```bash
chromium --headless --no-pdf-header-footer --print-to-pdf=resume.pdf http://localhost:8000/resume.html
```

or, with Playwright (`npm i playwright && npx playwright install chromium`):

```js
// build-resume.mjs
import { chromium } from "playwright";

const browser = await chromium.launch();
const page = await browser.newPage();
await page.goto("http://localhost:8000/resume.html", { waitUntil: "networkidle" });
await page.evaluate(() => document.fonts.ready);
await page.pdf({ path: "resume.pdf", format: "Letter", printBackground: true, preferCSSPageSize: true });
await browser.close();
```

Check that it is still one page before committing (`pdfinfo resume.pdf | grep Pages`). If the content spills, tighten spacing in `css/resume.css` rather than cutting text.

## Fonts and licenses

Source Serif 4 (Adobe), IBM Plex Sans and IBM Plex Mono (IBM) are all under the SIL Open Font License 1.1. The license texts are in `fonts/LICENSE-SourceSerif4.txt` and `fonts/LICENSE-IBMPlex.txt`; `fonts/fonts.css` declares the faces.

## Copyright

© 2026 Zarif Fida Chowdhury. The writing, photographs, screenshots and résumé are mine and not licensed for reuse. The HTML and CSS are there to be read; borrow techniques from them freely.
