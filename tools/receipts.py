#!/usr/bin/env python3
"""Build the inline code receipts under the Selected work entries.

Each claim in a facts ledger unfolds to the lines of the public repo that
show it. This script reads those lines straight from local clones, so the
excerpts can never drift from the code, and splices them into index.html
between markers:

    <!-- receipts:capstone-gpt:start --> ... <!-- receipts:capstone-gpt:end -->
    <!-- receipts:secure-rag-guardrails:start --> ... <!-- receipts:secure-rag-guardrails:end -->
    <!-- demo:secure-rag-guardrails:start --> ... <!-- demo:secure-rag-guardrails:end -->

Run it from the site folder:

    python3 tools/receipts.py
    python3 tools/receipts.py --capstone-gpt ../../capstone-gpt --secure-rag-guardrails ../../secure-rag-guardrails

Each clone defaults to a sibling of the site's parent folder. A clone that
is missing is skipped with a note and its block is left as it is. The line
links point at the clone's checked-out commit, not at main, so the lines on
the page and the lines behind the links stay the same after the repo moves
on. Append @<sha> to a path to name the commit for a copy without .git.

Run integrity.py afterwards if any pinned file changed (index.html itself
is not pinned). Standard library only.
"""
from __future__ import annotations

import argparse
import html
import re
import subprocess
import sys
from pathlib import Path

ROOT = Path(__file__).resolve().parent.parent
INDEX = ROOT / "index.html"
GH = "https://github.com/zariffidachowdhury"


# ---------------------------------------------------------------- helpers

def read_lines(clone: Path, rel: str, a: int, b: int) -> list[tuple[int, str]]:
    text = (clone / rel).read_text(encoding="utf-8").split("\n")
    return [(i, text[i - 1]) for i in range(a, b + 1)]


def code_block(repo: str, sha: str, rel: str, lines: list[tuple[int, str]], hl: set[int] = frozenset()) -> str:
    a, b = lines[0][0], lines[-1][0]
    spans = "".join(
        f'<span class="{"line hl" if n in hl else "line"}"><span class="ln">{n}</span>'
        f'<span class="t">{html.escape(t) or " "}</span></span>'
        for n, t in lines
    )
    return (f'<p class="src"><a href="{GH}/{repo}/blob/{sha}/{rel}#L{a}-L{b}">{html.escape(rel)}, lines {a} to {b} '
            f'at {sha[:7]} <span aria-hidden="true">↗</span></a></p>\n<pre><code>{spans}</code></pre>')


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


def facts_block(name: str, facts: list[tuple[str, list[tuple[str, str]], str]]) -> str:
    items = []
    for claim, receipts, excerpt in facts:
        links = "".join(f'<a href="{href}">{html.escape(label)}</a>' for label, href in receipts)
        body = "\n".join("              " + line for line in excerpt.split("\n"))
        items.append("            <li>\n"
                     f"              <span>{html.escape(claim)}</span>\n"
                     f'              <span class="receipt">{links}</span>\n'
                     f"{body}\n"
                     "            </li>")
    return (f'          <!-- receipts:{name}:start -->\n'
            '          <ul class="facts" aria-label="What was built, with the file that shows it">\n'
            + "\n".join(items) + "\n"
            '          </ul>\n'
            f'          <!-- receipts:{name}:end -->')


def head_sha(clone: Path, override: str | None) -> str:
    """The clone's checked-out commit, or the @sha given on the command line."""
    if override:
        return override
    out = subprocess.run(["git", "-C", str(clone), "rev-parse", "HEAD"], capture_output=True, text=True)
    sha = out.stdout.strip()
    if out.returncode != 0 or not re.fullmatch(r"[0-9a-f]{40}", sha):
        sys.exit(f"could not read the commit of {clone} (is it a git clone? or append @<sha> to the path)")
    dirty = subprocess.run(["git", "-C", str(clone), "status", "--porcelain"], capture_output=True, text=True).stdout.strip()
    if dirty:
        sys.exit(f"{clone} has uncommitted changes, so the links could point at different lines. Commit or stash first.")
    return sha


def splice(s: str, marker: str, block: str) -> str:
    pattern = rf"(?m)^[ \t]*<!-- {marker}:start -->.*?<!-- {marker}:end -->"
    if not re.search(pattern, s, flags=re.S):
        sys.exit(f"index.html has no {marker} markers")
    return re.sub(pattern, lambda m: block, s, flags=re.S)


# ---------------------------------------------------------------- capstone-gpt

def capstone(clone: Path, sha: str) -> str:
    repo = "capstone-gpt"
    L = lambda rel, a, b: read_lines(clone, rel, a, b)  # noqa: E731
    C = lambda rel, a, b, hl=frozenset(): code_block(repo, sha, rel, L(rel, a, b), hl)  # noqa: E731
    api_files = sorted(p.name for p in (clone / "api").glob("*.php"))
    endpoints = [f for f in api_files if f not in ("bootstrap.php", "config.php", "config.local.example.php")]
    tables = []
    for sql in sorted((clone / "sql").glob("*.sql")):
        for n, line in enumerate(sql.read_text(encoding="utf-8").split("\n"), 1):
            if line.startswith("CREATE TABLE"):
                tables.append(f"sql/{sql.name}:{n}:{line}")
    docs = sorted(p.name + ("/" if p.is_dir() else "") for p in (clone / "docs").iterdir() if not p.name.startswith("."))
    blob = f"{GH}/{repo}/blob/main"
    tree = f"{GH}/{repo}/tree"

    facts = [
        ("The LLM API key never reaches the browser. Every call goes through one PHP control point",
         [("api/chat_handler.php", f"{blob}/api/chat_handler.php")],
         details("the lines that show it", C("api/chat_handler.php", 61, 71, {65}))),
        ("Sessions are 64-character hex tokens from random_bytes(32). Passwords are stored with password_hash()",
         [("api/auth.php", f"{blob}/api/auth.php")],
         details("the lines that show it",
                 C("api/auth.php", 12, 16, {14}), C("api/auth.php", 74, 78, {76}), C("api/auth.php", 127, 129, {127}))),
        ("Ten REST routes across seven PHP endpoints, over a normalized five-table MySQL schema",
         [("api/", f"{tree}/main/api"), ("sql/", f"{tree}/main/sql")],
         details("the listing that shows it",
                 listing(f"api/ at {sha[:7]} on GitHub", f"{tree}/{sha}/api",
                         ["$ ls api/*.php"] + endpoints + ["(bootstrap.php and config.php are shared includes, not endpoints)"],
                         set(endpoints)),
                 listing(f"sql/ at {sha[:7]} on GitHub", f"{tree}/{sha}/sql",
                         ['$ grep -n "CREATE TABLE" sql/*.sql'] + tables, set(tables)))),
        ("Input is validated server-side before anything reaches the retrieval workflow",
         [("api/chat_handler.php", f"{blob}/api/chat_handler.php")],
         details("the lines that show it",
                 C("api/chat_handler.php", 19, 27, {25, 26, 27}), C("api/bootstrap.php", 81, 95, {91, 92, 93}))),
        ("Conversation logs, feedback capture, instructor analytics, CSV export",
         [("api/stats.php", f"{blob}/api/stats.php"), ("api/export.php", f"{blob}/api/export.php")],
         details("the lines that show it",
                 C("api/chat_handler.php", 102, 105, {103}), C("api/stats.php", 42, 49, {43}), C("api/export.php", 50, 59, {59}))),
        ("Architecture, testing strategy, and roadmap written down in the repo",
         [("docs/", f"{tree}/main/docs")],
         details("the listing that shows it",
                 listing(f"docs/ at {sha[:7]} on GitHub", f"{tree}/{sha}/docs", ["$ ls docs/"] + docs,
                         {"system-architecture.md", "testing-strategy.md", "future-roadmap.md"}))),
    ]
    return facts_block(repo, facts)


# ---------------------------------------------------------------- secure-rag-guardrails

def guardrails(clone: Path, sha: str) -> tuple[str, str]:
    repo = "secure-rag-guardrails"
    L = lambda rel, a, b: read_lines(clone, rel, a, b)  # noqa: E731
    C = lambda rel, a, b, hl=frozenset(): code_block(repo, sha, rel, L(rel, a, b), hl)  # noqa: E731
    blob = f"{GH}/{repo}/blob/main"
    tests = [f"{n}:{line.strip()}" for n, line in enumerate((clone / "test_guardrails.py").read_text(encoding="utf-8").split("\n"), 1)
             if line.strip().startswith("def test_")]

    facts = [
        ("The user's prompt is checked by seven explainable rules before anything is retrieved. One HIGH finding blocks",
         [("guardrails.py", f"{blob}/guardrails.py")],
         details("the lines that show it",
                 C("guardrails.py", 89, 104, {90, 92, 94, 96, 98, 100, 102}), C("guardrails.py", 64, 67, {67}))),
        ("Retrieved documents are data, not commands: chat-template tokens are stripped, embedded instructions are downgraded to MEDIUM, and the text is fenced as untrusted",
         [("guardrails.py", f"{blob}/guardrails.py")],
         details("the lines that show it",
                 C("guardrails.py", 127, 138, {127, 138}), C("guardrails.py", 140, 148, {143, 147}))),
        ("The answer is scanned for eight kinds of secrets and PII and redacted in place before it is shown or logged",
         [("guardrails.py", f"{blob}/guardrails.py")],
         details("the lines that show it",
                 C("guardrails.py", 157, 174, {158, 160, 162, 164, 166, 168, 170, 172}), C("guardrails.py", 176, 187, {182}))),
        (f"One file, nothing outside the standard library, {len(tests)} tests",
         [("guardrails.py", f"{blob}/guardrails.py"), ("test_guardrails.py", f"{blob}/test_guardrails.py")],
         details("the lines that show it",
                 C("guardrails.py", 23, 28, {25}),
                 listing(f"test_guardrails.py at {sha[:7]} on GitHub", f"{GH}/{repo}/blob/{sha}/test_guardrails.py",
                         ['$ grep -n "def test_" test_guardrails.py'] + tests, set(tests)))),
    ]

    demo = subprocess.run([sys.executable, "demo.py"], cwd=clone, capture_output=True, text=True, timeout=30)
    if demo.returncode != 0:
        sys.exit(f"demo.py failed in {clone}: {demo.stderr.strip()[:200]}")
    transcript = html.escape(demo.stdout.strip("\n"))
    plate = ('          <!-- demo:secure-rag-guardrails:start -->\n'
             '          <figure class="plate plate--text">\n'
             f'            <pre>{transcript}</pre>\n'
             f'            <figcaption>python3 demo.py at {sha[:7]}, verbatim. One request through all three layers.</figcaption>\n'
             '          </figure>\n'
             '          <!-- demo:secure-rag-guardrails:end -->')
    return facts_block(repo, facts), plate


# ---------------------------------------------------------------- main

def resolve(spec: str | None, default: Path) -> tuple[Path, str | None]:
    if not spec:
        return default.resolve(), None
    path, _, sha = spec.partition("@")
    return Path(path).resolve(), (sha or None)


def main() -> int:
    ap = argparse.ArgumentParser(description=__doc__, formatter_class=argparse.RawDescriptionHelpFormatter)
    ap.add_argument("--capstone-gpt", metavar="PATH[@SHA]")
    ap.add_argument("--secure-rag-guardrails", metavar="PATH[@SHA]")
    args = ap.parse_args()

    s = INDEX.read_text(encoding="utf-8")
    did = []

    clone, override = resolve(args.capstone_gpt, ROOT.parent.parent / "capstone-gpt")
    if (clone / "api" / "chat_handler.php").is_file():
        sha = head_sha(clone, override)
        s = splice(s, "receipts:capstone-gpt", capstone(clone, sha))
        did.append(f"capstone-gpt at {sha[:7]}")
    else:
        print(f"note: no capstone-gpt clone at {clone}, its receipts were left as they are")

    clone, override = resolve(args.secure_rag_guardrails, ROOT.parent.parent / "secure-rag-guardrails")
    if (clone / "guardrails.py").is_file():
        sha = head_sha(clone, override)
        facts, plate = guardrails(clone, sha)
        s = splice(s, "receipts:secure-rag-guardrails", facts)
        s = splice(s, "demo:secure-rag-guardrails", plate)
        did.append(f"secure-rag-guardrails at {sha[:7]}")
    else:
        print(f"note: no secure-rag-guardrails clone at {clone}, its receipts were left as they are")

    INDEX.write_text(s, encoding="utf-8")
    print("receipts rebuilt: " + (", ".join(did) if did else "nothing (no clones found)"))
    return 0


if __name__ == "__main__":
    sys.exit(main())
