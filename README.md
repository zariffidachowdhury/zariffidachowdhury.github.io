# zariffidachowdhury.github.io

Source for my personal site and résumé, served by GitHub Pages at <https://zariffidachowdhury.github.io/>.

## What it is

Hand-written HTML, CSS and a little JavaScript. No framework, no analytics, no cookies, and no requests to other hosts: the three typefaces are self-hosted from `fonts/`. A strict Content-Security-Policy (set in a `<meta>` tag, since GitHub Pages can't send headers) allows nothing but this origin: no inline script, no inline style.

The page has a bench: a 64-bit Feistel network (the structure ZFC-Cipher, my CYB 236 block cipher, is built on) that runs in the browser. Type a block and a key, flip any bit, and the round table shows the change spreading. The round function and key schedule in `js/bench.js` are simple demo ones, not the ZFC ones. Below it, a ray tracer draws three spheres on ruled paper into a canvas, scanline by scanline, with a light you can drag. Under Capstone GPT, every claim unfolds to the lines of the public repo that show it, pulled from a local clone by `tools/receipts.py` so they cannot drift from the code. There is also a day/night theme that follows the system setting until you pick one, a masthead that marks the section you are in, and j/k to move between sections.

The page also checks itself: `tools/integrity.py` pins a SHA-256 hash of every file the page loads into `index.html`, and `js/audit.js` re-hashes each file in the visitor's browser and reports the result in the colophon.

| Path | What it is |
|---|---|
| `index.html` | The site: selected work, the bench, experience, about, tools, contact |
| `resume.html` | The résumé as a web page, and the source of `resume.pdf` |
| `resume.pdf` | One US-Letter page, printed from `resume.html` (see below) |
| `404.html` | Not-found page in the same style |
| `css/site.css`, `css/resume.css` | All styling. The design tokens sit at the top of each file |
| `js/audit.js` | Re-hashes every loaded file with SubtleCrypto and compares against the pinned manifest |
| `js/bench.js` | The Feistel bench: bit strips, round table, avalanche count, round-trip check |
| `js/nav.js` | Day/night toggle, current-section marking, j/k keys, copy button on the email |
| `js/trace.js` | The ray tracer: three spheres on ruled paper, Phong, shadows, one bounce, spotlight cone, draggable light |
| `js/theme.js` | Six lines that apply a saved theme choice before first paint |
| `tools/integrity.py` | Writes the manifest and the integrity ledger into `index.html`. Run it after changing any file |
| `tools/receipts.py` | Rebuilds the code excerpts under the Capstone GPT facts from a local clone of capstone-gpt, with the line links pinned to that clone's commit |
| `fonts/` | Source Serif 4, IBM Plex Sans and IBM Plex Mono (latin subsets, WOFF2), `fonts.css`, and the licenses |
| `img/` | Headshot, Capstone GPT screenshots, Open Graph card, favicons |
| `robots.txt`, `sitemap.xml`, `.nojekyll` | Crawl hints. `.nojekyll` tells Pages to publish the files exactly as committed |

Deployment is GitHub Pages from the `main` branch, root directory. Pushing to `main` publishes.

## After changing any file

```bash
python3 tools/integrity.py   # re-pin the hashes, then commit index.html with the change
```

If you forget, the site still works. The colophon will just report which file differs from what was pinned.

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

© 2026 Zarif Fida Chowdhury. The writing, photographs, screenshots and résumé are mine and not licensed for reuse. The HTML and CSS are there to be read. Borrow techniques from them freely.
