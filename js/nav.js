/* nav.js: the small comforts. A day/night toggle, the masthead marking the
   section you are in, j and k to move between sections, and a copy button
   on the email address. Nothing here talks to the network. */
(function () {
  "use strict";

  var doc = document.documentElement;
  var nav = document.querySelector(".nav");

  /* ---------- day / night ---------- */

  var media = window.matchMedia ? window.matchMedia("(prefers-color-scheme: dark)") : null;

  function currentTheme() {
    var t = doc.getAttribute("data-theme");
    if (t === "dark" || t === "light") return t;
    return media && media.matches ? "dark" : "light";
  }

  var toggle = null;

  function paintToggle() {
    var dark = currentTheme() === "dark";
    if (toggle) {
      toggle.setAttribute("aria-pressed", dark ? "true" : "false");
      toggle.setAttribute("title", dark ? "Night theme on. Switch to day." : "Switch to the night theme.");
    }
    var meta = document.querySelector('meta[name="theme-color"]');
    if (meta) meta.setAttribute("content", dark ? "#15171b" : "#f1f2f0");
  }

  function setTheme(t) {
    doc.setAttribute("data-theme", t);
    try { localStorage.setItem("theme", t); } catch (e) {}
    paintToggle();
  }

  if (nav) {
    toggle = document.createElement("button");
    toggle.type = "button";
    toggle.className = "theme-toggle";
    toggle.textContent = "Night";
    toggle.addEventListener("click", function () {
      setTheme(currentTheme() === "dark" ? "light" : "dark");
    });
    nav.appendChild(toggle);
    if (media && media.addEventListener) media.addEventListener("change", paintToggle);
    paintToggle();
  }

  /* ---------- which section you are in ---------- */

  var sections = Array.prototype.slice.call(document.querySelectorAll("main > section[id]"));
  var links = nav ? Array.prototype.slice.call(nav.querySelectorAll('a[href^="#"]')) : [];

  function topOf(el) { return el.getBoundingClientRect().top + window.pageYOffset; }

  function currentIndex() {
    var y = window.pageYOffset + 96;
    var idx = 0;
    for (var i = 0; i < sections.length; i++) if (topOf(sections[i]) <= y) idx = i;
    return idx;
  }

  var ticking = false;
  function markCurrent() {
    ticking = false;
    if (!links.length || !sections.length) return;
    var id = sections[currentIndex()].id;
    var atEnd = window.innerHeight + window.pageYOffset >= document.body.offsetHeight - 2;
    if (atEnd) id = sections[sections.length - 1].id;
    links.forEach(function (a) {
      var on = a.getAttribute("href") === "#" + id;
      if (on) a.setAttribute("aria-current", "true"); else a.removeAttribute("aria-current");
    });
  }
  function onScroll() {
    if (ticking) return;
    ticking = true;
    window.requestAnimationFrame(markCurrent);
  }
  window.addEventListener("scroll", onScroll, { passive: true });
  window.addEventListener("resize", onScroll);
  markCurrent();

  /* ---------- j and k ---------- */

  function typing(t) {
    if (!t) return false;
    var tag = t.tagName;
    return tag === "INPUT" || tag === "TEXTAREA" || tag === "SELECT" || t.isContentEditable;
  }

  document.addEventListener("keydown", function (e) {
    if (e.defaultPrevented || e.altKey || e.ctrlKey || e.metaKey || e.shiftKey) return;
    if (e.key !== "j" && e.key !== "k") return;
    if (typing(e.target) || !sections.length) return;
    var idx = currentIndex();
    var y = window.pageYOffset + 96;
    var next;
    if (e.key === "j") {
      next = Math.min(idx + 1, sections.length - 1);
    } else {
      /* if we are well inside a section, k goes to its top first */
      next = (topOf(sections[idx]) < y - 160) ? idx : Math.max(idx - 1, 0);
    }
    e.preventDefault();
    sections[next].scrollIntoView({ behavior: "auto", block: "start" });
  });

  var foot = document.querySelector(".colophon .col-foot");
  if (foot && sections.length) {
    var hint = document.createElement("p");
    hint.className = "col-foot";
    hint.textContent = "Keyboard: j and k move between sections.";
    foot.parentNode.insertBefore(hint, foot);
  }

  /* ---------- copy the email address ---------- */

  var email = document.querySelector('.reach a[href^="mailto:"]');
  if (email && navigator.clipboard && navigator.clipboard.writeText) {
    var btn = document.createElement("button");
    btn.type = "button";
    btn.className = "copy";
    btn.textContent = "copy";
    btn.setAttribute("aria-label", "Copy the email address");
    btn.addEventListener("click", function () {
      navigator.clipboard.writeText(email.textContent.trim()).then(function () {
        btn.textContent = "copied";
        window.setTimeout(function () { btn.textContent = "copy"; }, 1600);
      }, function () {
        btn.textContent = "select it instead";
      });
    });
    email.parentNode.insertBefore(btn, email.nextSibling);
  }
})();
