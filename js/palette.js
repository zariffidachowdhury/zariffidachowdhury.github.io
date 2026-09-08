/* palette.js: a jump list. Cmd+K or Ctrl+K (or the "Jump" button in the
   masthead) opens a small dialog: type to filter, arrows to move, Enter to
   go. Sections of this page, the résumé, the email address, the theme, the
   links. Nothing here talks to the network. */
(function () {
  "use strict";

  if (!("HTMLDialogElement" in window) || !document.createElement("dialog").showModal) return;

  var nav = document.querySelector(".nav");

  function toggleTheme() {
    var t = document.querySelector(".theme-toggle");
    if (t) t.click();
  }

  function copyEmail(done) {
    var a = document.querySelector('.reach a[href^="mailto:"]');
    var text = a ? a.textContent.trim() : "zariffidachowdhury@gmail.com";
    if (navigator.clipboard && navigator.clipboard.writeText) {
      navigator.clipboard.writeText(text).then(function () { done("copied " + text); }, function () { done("could not copy, it is " + text); });
    } else {
      done("it is " + text);
    }
  }

  var entries = [
    { label: "Top", hint: "title block", go: "#top" },
    { label: "Capstone GPT", hint: "Selected work", go: "#capstone", keys: "rag php mysql" },
    { label: "secure-rag-guardrails", hint: "Selected work", go: "#guardrails", keys: "llm owasp python" },
    { label: "Hands-on coursework", hint: "Also", go: "#also-eyebrow", keys: "cse cyb courses" },
    { label: "Feistel bench", hint: "Bench", go: "#bench", keys: "cipher zfc bits avalanche" },
    { label: "Ray tracer", hint: "Bench, continued", go: "#trace-title", keys: "graphics light spheres" },
    { label: "Experience", hint: "section", go: "#experience", keys: "smart intern ambassador" },
    { label: "About", hint: "section", go: "#about", keys: "dhaka oxford" },
    { label: "Tools", hint: "section", go: "#skills", keys: "skills languages" },
    { label: "Contact", hint: "section", go: "#contact", keys: "email linkedin github" },
    { label: "Integrity ledger", hint: "colophon", go: "#integrity-eyebrow", keys: "hashes audit sha256 csp" },
    { label: "Copy email address", hint: "action", run: copyEmail, keys: "mail" },
    { label: "Résumé, PDF", hint: "opens", href: "resume.pdf", keys: "resume cv" },
    { label: "Résumé, web page", hint: "opens", href: "resume.html", keys: "resume cv" },
    { label: "Switch day and night", hint: "action", run: function (done) { toggleTheme(); done(""); }, keys: "theme dark light" },
    { label: "GitHub profile", hint: "opens", href: "https://github.com/zariffidachowdhury", keys: "code repos" },
    { label: "LinkedIn", hint: "opens", href: "https://www.linkedin.com/in/zarif-fida-chowdhury/" },
    { label: "Source of this page", hint: "opens", href: "https://github.com/zariffidachowdhury/zariffidachowdhury.github.io", keys: "repo html" }
  ].filter(function (e) { return !e.go || document.querySelector(e.go); });

  /* ---------- build the dialog ---------- */

  var dlg = document.createElement("dialog");
  dlg.className = "palette";
  dlg.setAttribute("aria-label", "Jump to");

  var form = document.createElement("form");
  form.method = "dialog";
  form.className = "palette-form";

  var input = document.createElement("input");
  input.type = "text";
  input.className = "palette-input";
  input.setAttribute("aria-label", "Type to filter, arrows to move, Enter to go");
  input.setAttribute("placeholder", "Jump to");
  input.setAttribute("autocomplete", "off");
  input.setAttribute("spellcheck", "false");
  input.setAttribute("role", "combobox");
  input.setAttribute("aria-expanded", "true");
  input.setAttribute("aria-controls", "palette-list");
  input.setAttribute("aria-autocomplete", "list");

  var list = document.createElement("ul");
  list.className = "palette-list";
  list.id = "palette-list";
  list.setAttribute("role", "listbox");

  var status = document.createElement("p");
  status.className = "palette-status";
  status.setAttribute("aria-live", "polite");
  status.textContent = "Esc or a tap outside closes";

  form.appendChild(input);
  form.appendChild(list);
  form.appendChild(status);
  dlg.appendChild(form);
  document.body.appendChild(dlg);

  var shown = [], active = 0;

  function matches(e, q) {
    if (!q) return true;
    var hay = (e.label + " " + (e.hint || "") + " " + (e.keys || "")).toLowerCase();
    return q.split(/\s+/).every(function (w) { return w && hay.indexOf(w) >= 0; });
  }

  function render() {
    var q = input.value.trim().toLowerCase();
    shown = entries.filter(function (e) { return matches(e, q); });
    if (active >= shown.length) active = 0;
    while (list.firstChild) list.removeChild(list.firstChild);
    shown.forEach(function (e, i) {
      var li = document.createElement("li");
      li.setAttribute("role", "option");
      li.id = "palette-opt-" + i;
      li.setAttribute("aria-selected", i === active ? "true" : "false");
      if (i === active) li.classList.add("is-active");
      var lab = document.createElement("span");
      lab.className = "palette-label";
      lab.textContent = e.label;
      var hint = document.createElement("span");
      hint.className = "palette-hint";
      hint.textContent = e.hint || "";
      li.appendChild(lab);
      li.appendChild(hint);
      li.addEventListener("mousemove", function () { if (active !== i) { active = i; render(); } });
      li.addEventListener("click", function () { active = i; run(); });
      list.appendChild(li);
    });
    input.setAttribute("aria-activedescendant", shown.length ? "palette-opt-" + active : "");
    if (!shown.length) {
      var none = document.createElement("li");
      none.className = "palette-none";
      none.textContent = "nothing matches";
      list.appendChild(none);
    }
  }

  function close() { if (dlg.open) dlg.close(); }

  function run() {
    var e = shown[active];
    if (!e) return;
    if (e.go) {
      close();
      var el = document.querySelector(e.go);
      if (el) {
        el.scrollIntoView({ behavior: "auto", block: "start" });
        if (el.tabIndex < 0) el.setAttribute("tabindex", "-1");
        el.focus({ preventScroll: true });
      }
    } else if (e.href) {
      close();
      window.location.href = e.href;
    } else if (e.run) {
      e.run(function (msg) {
        if (msg) { status.textContent = msg; window.setTimeout(close, 900); } else { close(); }
      });
    }
  }

  function open() {
    input.value = "";
    active = 0;
    status.textContent = "Esc or a tap outside closes";
    render();
    dlg.showModal();
    input.focus();
  }

  input.addEventListener("input", function () { active = 0; render(); });
  input.addEventListener("keydown", function (e) {
    if (e.key === "ArrowDown") { e.preventDefault(); if (shown.length) { active = (active + 1) % shown.length; render(); } }
    else if (e.key === "ArrowUp") { e.preventDefault(); if (shown.length) { active = (active - 1 + shown.length) % shown.length; render(); } }
    else if (e.key === "Enter") { e.preventDefault(); run(); }
  });
  dlg.addEventListener("click", function (e) { if (e.target === dlg) close(); });

  document.addEventListener("keydown", function (e) {
    if ((e.metaKey || e.ctrlKey) && !e.shiftKey && !e.altKey && (e.key === "k" || e.key === "K")) {
      e.preventDefault();
      if (dlg.open) close(); else open();
    }
  });

  /* a visible way in, for people without a keyboard */
  if (nav) {
    var btn = document.createElement("button");
    btn.type = "button";
    btn.className = "palette-open";
    btn.textContent = "Jump";
    btn.setAttribute("title", "Cmd+K or Ctrl+K");
    btn.setAttribute("aria-haspopup", "dialog");
    btn.addEventListener("click", open);
    var toggle = nav.querySelector(".theme-toggle");
    if (toggle) nav.insertBefore(btn, toggle); else nav.appendChild(btn);
  }
})();
