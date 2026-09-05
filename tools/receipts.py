#!/usr/bin/env python3
"""Build the inline code receipts under the Capstone GPT facts.

Each claim in the facts ledger unfolds to the lines of the public repo that
show it. This script reads those lines straight from a local clone of
capstone-gpt, so the excerpts can never drift from the code, and splices
them into index.html between <!-- receipts:start --> and <!-- receipts:end -->.

    python3 tools/receipts.py ../../capstone-gpt   # path to the clone

The line links point at the clone's current commit, not at main, so the
lines on the page and the lines behind the links stay the same even after
the repo moves on. Run integrity.py afterwards if any pinned file changed
(index.html itself is not pinned). Standard library only.
"""
from __future__ import annotations

import html
import re
import subprocess
import sys
from pathlib import Path

ROOT = Path(__file__).resolve().parent.parent
INDEX = ROOT / "index.html"
GH = "https://github.com/zariffidachowdhury/capstone-gpt"
SHA = "main"  # replaced by the clone's commit in main()


def read_lines(clone: Path, rel: str, a: int, b: int) -> list[tuple[int, str]]:
    text = (clone / rel).read_text(encoding="utf-8").split("\n")
    return [(i, text[i - 1]) for i in range(a, b + 1)]


def code_block(rel: str, lines: list[tuple[int, str]], hl: set[int] = frozenset()) -> str:
    a, b = lines[0][0], lines[-1][0]
    spans = "".join(
        f'<span class="{"line hl" if n in hl else "line"}"><span class="ln">{n}</span>'
        f'<span class="t">{html.escape(t) or " "}</span></span>'
        for n, t in lines
    )
    return (f'<p class="src"><a href="{GH}/blob/{SHA}/{rel}#L{a}-L{b}">{html.escape(rel)}, lines {a} to {b} '
            f'at {SHA[:7]} <span aria-hidden="true">↗</span></a></p>\n<pre><code>{spans}</code></pre>')


def listing(title: str, href: str, rows: list[str], hl: set[str] = frozenset()) -> str:
    spans = "".join(
        f'<span class="{"line plain hl" if r in hl else "line plain"}"><span class="t">{html.escape(r)}</span></span>'
        for r in rows
    )
    return (f'<p class="src"><a href="{href}">{html.escape(title)} <span aria-hidden="true">↗</span></a></p>\n'
            f'<pre><code>{spans}</code></pre>')


def details(summary: str, *blocks: str) -> str:
    inner = "\n".join(blocks)
    return (f'<details class="excerpt">\n  <summary>{html.escape(summary)}</summary>\n'
            f'  <div class="code">\n{inner}\n  </div>\n</details>')


def build(clone: Path) -> str:
    api_files = sorted(p.name for p in (clone / "api").glob("*.php"))
    endpoints = [f for f in api_files if f not in ("bootstrap.php", "config.php", "config.local.example.php")]
    tables = []
    for sql in sorted((clone / "sql").glob("*.sql")):
        for n, line in enumerate(sql.read_text(encoding="utf-8").split("\n"), 1):
            if line.startswith("CREATE TABLE"):
                tables.append(f"sql/{sql.name}:{n}:{line}")
    docs = sorted(p.name + ("/" if p.is_dir() else "") for p in (clone / "docs").iterdir() if not p.name.startswith("."))

    L = lambda rel, a, b: read_lines(clone, rel, a, b)  # noqa: E731

    facts = [
        ("The LLM API key never reaches the browser. Every call goes through one PHP control point",
         [("api/chat_handler.php", f"{GH}/blob/main/api/chat_handler.php")],
         details("the lines that show it",
                 code_block("api/chat_handler.php", L("api/chat_handler.php", 61, 71), {65}))),
        ("Sessions are 64-character hex tokens from random_bytes(32). Passwords are stored with password_hash()",
         [("api/auth.php", f"{GH}/blob/main/api/auth.php")],
         details("the lines that show it",
                 code_block("api/auth.php", L("api/auth.php", 12, 16), {14}),
                 code_block("api/auth.php", L("api/auth.php", 74, 78), {76}),
                 code_block("api/auth.php", L("api/auth.php", 127, 129), {127}))),
        ("Ten REST routes across seven PHP endpoints, over a normalized five-table MySQL schema",
         [("api/", f"{GH}/tree/main/api"), ("sql/", f"{GH}/tree/main/sql")],
         details("the listing that shows it",
                 listing("api/ at " + SHA[:7] + " on GitHub", f"{GH}/tree/{SHA}/api",
                         ["$ ls api/*.php"] + endpoints + ["(bootstrap.php and config.php are shared includes, not endpoints)"],
                         set(endpoints)),
                 listing("sql/ at " + SHA[:7] + " on GitHub", f"{GH}/tree/{SHA}/sql",
                         ['$ grep -n "CREATE TABLE" sql/*.sql'] + tables, set(tables)))),
        ("Input is validated server-side before anything reaches the retrieval workflow",
         [("api/chat_handler.php", f"{GH}/blob/main/api/chat_handler.php")],
         details("the lines that show it",
                 code_block("api/chat_handler.php", L("api/chat_handler.php", 19, 27), {25, 26, 27}),
                 code_block("api/bootstrap.php", L("api/bootstrap.php", 81, 95), {91, 92, 93}))),
        ("Conversation logs, feedback capture, instructor analytics, CSV export",
         [("api/stats.php", f"{GH}/blob/main/api/stats.php"), ("api/export.php", f"{GH}/blob/main/api/export.php")],
         details("the lines that show it",
                 code_block("api/chat_handler.php", L("api/chat_handler.php", 102, 105), {103}),
                 code_block("api/stats.php", L("api/stats.php", 42, 49), {43}),
                 code_block("api/export.php", L("api/export.php", 50, 59), {59}))),
        ("Architecture, testing strategy, and roadmap written down in the repo",
         [("docs/", f"{GH}/tree/main/docs")],
         details("the listing that shows it",
                 listing("docs/ at " + SHA[:7] + " on GitHub", f"{GH}/tree/{SHA}/docs", ["$ ls docs/"] + docs,
                         {"system-architecture.md", "testing-strategy.md", "future-roadmap.md"}))),
    ]

    items = []
    for claim, receipts, excerpt in facts:
        links = "".join(f'<a href="{href}">{html.escape(label)}</a>' for label, href in receipts)
        body = "\n".join("              " + line for line in excerpt.split("\n"))
        items.append("            <li>\n"
                     f"              <span>{html.escape(claim)}</span>\n"
                     f'              <span class="receipt">{links}</span>\n'
                     f"{body}\n"
                     "            </li>")
    return ('          <!-- receipts:start -->\n'
            '          <ul class="facts" aria-label="What was built, with the file that shows it">\n'
            + "\n".join(items) + "\n"
            '          </ul>\n'
            '          <!-- receipts:end -->')


def head_sha(clone: Path) -> str:
    """The clone's checked-out commit. A second argument overrides it (for a copy without .git)."""
    if len(sys.argv) > 2:
        return sys.argv[2]
    out = subprocess.run(["git", "-C", str(clone), "rev-parse", "HEAD"], capture_output=True, text=True)
    sha = out.stdout.strip()
    if out.returncode != 0 or not re.fullmatch(r"[0-9a-f]{40}", sha):
        print(f"could not read the commit of {clone} (is it a git clone?)", file=sys.stderr)
        sys.exit(1)
    dirty = subprocess.run(["git", "-C", str(clone), "status", "--porcelain"], capture_output=True, text=True).stdout.strip()
    if dirty:
        print("the clone has uncommitted changes, so the links could point at different lines. Commit or stash first.", file=sys.stderr)
        sys.exit(1)
    return sha


def main() -> int:
    global SHA
    clone = Path(sys.argv[1] if len(sys.argv) > 1 else ROOT.parent.parent / "capstone-gpt").resolve()
    if not (clone / "api" / "chat_handler.php").is_file():
        print(f"no capstone-gpt clone at {clone}", file=sys.stderr)
        return 1
    SHA = head_sha(clone)
    block = build(clone)
    s = INDEX.read_text(encoding="utf-8")
    if "<!-- receipts:start -->" not in s:
        print("index.html has no receipts markers", file=sys.stderr)
        return 1
    s = re.sub(r"          <!-- receipts:start -->.*?<!-- receipts:end -->", lambda m: block, s, flags=re.S)
    INDEX.write_text(s, encoding="utf-8")
    n_excerpts = block.count('class="excerpt"')
    n_lines = block.count('class="line')
    print(f"receipts rebuilt from {clone} at {SHA[:7]}: {n_excerpts} excerpts, {n_lines} lines")
    return 0


if __name__ == "__main__":
    sys.exit(main())
