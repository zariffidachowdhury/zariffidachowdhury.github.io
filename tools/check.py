#!/usr/bin/env python3
"""One command that says whether the site is fit to commit.

    python3 tools/check.py

It fails, with a list, when any of these is off:

  1. The pinned hashes or the SRI attributes are stale (integrity.py would change a file).
  2. Prose in the pages, the README or CLAUDE.md contains an em dash or a semicolon.
     Code, <pre>, <script>, <style>, the CSP meta tag and Markdown code blocks are exempt.
  3. Anything the Content Security Policy forbids: inline style attributes, inline
     scripts other than the JSON manifest and the JSON-LD block, on* handlers,
     javascript: URLs.
  4. resume.pdf is not exactly one page.
  5. A link to #something has no element with that id, or a local file link is missing.
  6. The retired /portfolio/ URL appears anywhere.
  7. The receipts are stale, checked only when the clones are present next to the
     site's parent folder (../../capstone-gpt, ../../secure-rag-guardrails).

Standard library only, so it runs the same on a laptop and in GitHub Actions.
"""
from __future__ import annotations

import filecmp
import html
import re
import shutil
import subprocess
import sys
import tempfile
from pathlib import Path

ROOT = Path(__file__).resolve().parent.parent
PAGES = ["index.html", "resume.html", "404.html"]
PROSE_MD = ["README.md", "CLAUDE.md"]
problems: list[str] = []


def fail(msg: str) -> None:
    problems.append(msg)


# ----------------------------------------------------------------- 1. hashes and SRI

def check_pins() -> None:
    with tempfile.TemporaryDirectory() as tmp:
        work = Path(tmp) / "site"
        shutil.copytree(ROOT, work, ignore=shutil.ignore_patterns(".git", "__pycache__"))
        r = subprocess.run([sys.executable, str(work / "tools" / "integrity.py")], capture_output=True, text=True, cwd=work)
        if r.returncode != 0:
            fail("integrity.py failed: " + (r.stderr or r.stdout).strip())
            return
        for name in PAGES:
            if (ROOT / name).is_file() and not filecmp.cmp(ROOT / name, work / name, shallow=False):
                fail(f"{name} is stale: run python3 tools/integrity.py and commit the result")


# ----------------------------------------------------------------- 2. punctuation

STRIP_HTML = re.compile(r"<script\b.*?</script>|<style\b.*?</style>|<pre\b.*?</pre>|<code\b.*?</code>|<!--.*?-->|<meta[^>]*Content-Security-Policy[^>]*>", re.S | re.I)
TAGS = re.compile(r"<[^>]+>")


def prose_of_html(text: str) -> str:
    text = STRIP_HTML.sub(" ", text)
    return html.unescape(TAGS.sub(" ", text))   # entities like &amp; carry a semicolon that is not prose


def prose_of_md(text: str) -> str:
    text = re.sub(r"```.*?```", " ", text, flags=re.S)
    text = re.sub(r"`[^`\n]*`", " ", text)
    return text


def check_punctuation() -> None:
    for name in PAGES + PROSE_MD:
        path = ROOT / name
        if not path.is_file():
            continue
        raw = path.read_text(encoding="utf-8")
        prose = prose_of_md(raw) if name.endswith(".md") else prose_of_html(raw)
        for lineno, line in enumerate(prose.split("\n"), 1):
            if "—" in line:
                fail(f"{name}: em dash in prose near line {lineno}: {line.strip()[:80]}")
            if ";" in line:
                fail(f"{name}: semicolon in prose near line {lineno}: {line.strip()[:80]}")


# ----------------------------------------------------------------- 3. CSP hygiene

def check_csp() -> None:
    for name in PAGES:
        path = ROOT / name
        if not path.is_file():
            continue
        raw = path.read_text(encoding="utf-8")
        body = re.sub(r"<!--.*?-->", "", raw, flags=re.S)
        if re.search(r"<[^>]+\sstyle=", body):
            fail(f"{name}: inline style attribute (the CSP forbids it, use a class)")
        for m in re.finditer(r"<script\b([^>]*)>", body):
            attrs = m.group(1)
            if "src=" in attrs:
                continue
            if re.search(r'type="application/(ld\+)?json"', attrs):
                continue
            fail(f"{name}: inline script block (the CSP forbids it): <script{attrs[:60]}>")
        if re.search(r"<[^>]+\son[a-z]+=", body, flags=re.I):
            fail(f"{name}: inline event handler (on*=), the CSP forbids it")
        if re.search(r'href="javascript:', body, flags=re.I):
            fail(f"{name}: javascript: URL")


# ----------------------------------------------------------------- 4. the PDF

def check_pdf() -> None:
    pdf = ROOT / "resume.pdf"
    if not pdf.is_file():
        fail("resume.pdf is missing")
        return
    data = pdf.read_bytes()
    counts = re.findall(rb"/Type\s*/Pages\b[^>]*?/Count\s+(\d+)", data)
    if not counts:
        fail("resume.pdf: could not read the page count (object streams?), check it by hand")
        return
    pages = max(int(c) for c in counts)
    if pages != 1:
        fail(f"resume.pdf has {pages} pages, it must be one. Tighten css/resume.css or trim resume.html")


# ----------------------------------------------------------------- 5. links

def check_links() -> None:
    for name in PAGES:
        path = ROOT / name
        if not path.is_file():
            continue
        raw = path.read_text(encoding="utf-8")
        ids = set(re.findall(r'\sid="([^"]+)"', raw))
        for target in re.findall(r'href="#([^"]+)"', raw):
            if target not in ids:
                fail(f"{name}: link to #{target} but no element has that id")
        for href in re.findall(r'(?:href|src)="([^"#?:]+)(?:\?[^"]*)?"', raw):
            if href.startswith(("mailto", "tel", "http")) or href in ("./", "/"):
                continue
            local = ROOT / href.lstrip("/")
            if not local.exists():
                fail(f"{name}: links to {href} but the file is missing")


# ----------------------------------------------------------------- 6. the retired URL

def check_old_url() -> None:
    for name in PAGES + PROSE_MD:
        path = ROOT / name
        if path.is_file() and "zariffidachowdhury.github.io/portfolio/" in path.read_text(encoding="utf-8"):
            fail(f"{name}: still mentions the retired /portfolio/ URL")


# ----------------------------------------------------------------- 7. receipts

def check_receipts() -> None:
    clones = {n: ROOT.parent.parent / n for n in ("capstone-gpt", "secure-rag-guardrails")}
    present = {n: p for n, p in clones.items() if p.is_dir()}
    if not present:
        print("note: no clones next to the site's parent folder, receipts not checked")
        return
    with tempfile.TemporaryDirectory() as tmp:
        work = Path(tmp) / "site"
        shutil.copytree(ROOT, work, ignore=shutil.ignore_patterns(".git", "__pycache__"))
        args = [sys.executable, str(work / "tools" / "receipts.py")]
        for n, p in present.items():
            args += [f"--{n}", str(p)]
        r = subprocess.run(args, capture_output=True, text=True, cwd=work)
        if r.returncode != 0:
            fail("receipts.py failed: " + (r.stderr or r.stdout).strip()[:300])
            return
        if not filecmp.cmp(ROOT / "index.html", work / "index.html", shallow=False):
            fail("the receipts are stale against the clones: run python3 tools/receipts.py, then integrity.py")


def main() -> int:
    check_pins()
    check_punctuation()
    check_csp()
    check_pdf()
    check_links()
    check_old_url()
    check_receipts()
    if problems:
        print(f"{len(problems)} problem{'s' if len(problems) != 1 else ''}:")
        for p in problems:
            print("  - " + p)
        return 1
    print("all clear: pins and SRI current, prose clean, CSP hygiene, PDF one page, links resolve")
    return 0


if __name__ == "__main__":
    sys.exit(main())
