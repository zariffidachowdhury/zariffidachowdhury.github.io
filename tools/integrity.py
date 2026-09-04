#!/usr/bin/env python3
"""Pin SHA-256 hashes of every file the site loads into index.html.

Run from the repo root after changing any file:

    python3 tools/integrity.py

It rewrites two things in index.html:
  * the JSON manifest in <script type="application/json" id="integrity-manifest">
  * the rows between <!-- integrity:start --> and <!-- integrity:end -->

js/audit.js reads the manifest in the visitor's browser, re-hashes each file
with SubtleCrypto, and reports matches in the colophon. No build tools, no
dependencies — standard library only.
"""
from __future__ import annotations

import hashlib
import html
import json
import re
import sys
from pathlib import Path

ROOT = Path(__file__).resolve().parent.parent
INDEX = ROOT / "index.html"

# What the page loads, grouped for the ledger. Order here is display order.
GROUPS = [
    ("css",    "Stylesheets", ["css/site.css", "css/resume.css"]),
    ("fonts",  "Fonts",       sorted(p.relative_to(ROOT).as_posix() for p in (ROOT / "fonts").glob("*")
                               if p.suffix in {".woff2", ".css"})),
    ("img",    "Images",      sorted(p.relative_to(ROOT).as_posix() for p in (ROOT / "img").glob("*")
                               if p.suffix in {".jpg", ".png", ".svg", ".webp"})),
    ("js",     "Script",      ["js/audit.js"]),
    ("resume", "Résumé",      ["resume.pdf", "resume.html"]),
]


def sha256(path: Path) -> str:
    h = hashlib.sha256()
    with path.open("rb") as f:
        for chunk in iter(lambda: f.read(1 << 16), b""):
            h.update(chunk)
    return h.hexdigest()


def main() -> int:
    manifest: dict[str, str] = {}
    rows: list[str] = []
    for key, label, files in GROUPS:
        files = [f for f in files if (ROOT / f).is_file()]
        if not files:
            continue
        items = []
        for f in files:
            digest = sha256(ROOT / f)
            manifest[f] = digest
            items.append(
                f'            <li data-file="{html.escape(f)}"><span>{html.escape(f)}</span>'
                f'<span class="hash">{digest[:12]}…{digest[-6:]}</span></li>'
            )
        n = len(files)
        rows.append(
            f'  <li data-group="{key}">\n'
            f'    <details>\n'
            f'      <summary>{html.escape(label)} — {n} file{"s" if n != 1 else ""}</summary>\n'
            f'      <ul class="files">\n' + "\n".join(items) + "\n"
            f'      </ul>\n'
            f'    </details>\n'
            f'    <span class="audit-status">pinned</span>\n'
            f'  </li>'
        )

    ledger = (
        '<!-- integrity:start -->\n'
        '<ul class="audit" aria-label="Files this page loads, with their pinned SHA-256 hashes">\n'
        + "\n".join(rows) + "\n"
        '</ul>\n'
        '<!-- integrity:end -->'
    )

    src = INDEX.read_text(encoding="utf-8")
    src, n1 = re.subn(r"<!-- integrity:start -->.*?<!-- integrity:end -->", ledger, src, count=1, flags=re.S)
    src, n2 = re.subn(
        r'(<script type="application/json" id="integrity-manifest">).*?(</script>)',
        lambda m: m.group(1) + json.dumps(manifest, separators=(",", ":"), sort_keys=True) + m.group(2),
        src, count=1, flags=re.S,
    )
    if n1 != 1 or n2 != 1:
        print("index.html is missing the integrity markers or manifest block", file=sys.stderr)
        return 1
    INDEX.write_text(src, encoding="utf-8")
    print(f"pinned {len(manifest)} files into index.html")
    return 0


if __name__ == "__main__":
    raise SystemExit(main())
