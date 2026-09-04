/* audit.js — the page re-hashes every file it loads and compares against the
   SHA-256 values pinned in index.html (see tools/integrity.py). No network
   beyond this origin; nothing is sent anywhere. */
(function () {
  "use strict";

  var manifestEl = document.getElementById("integrity-manifest");
  var summary = document.getElementById("audit-summary");
  if (!manifestEl || !summary || !window.crypto || !window.crypto.subtle || !window.fetch) return;

  var manifest;
  try { manifest = JSON.parse(manifestEl.textContent); } catch (e) { return; }
  var paths = Object.keys(manifest);
  if (!paths.length) return;

  summary.textContent = "Re-hashing " + paths.length + " files in your browser…";

  function hex(buf) {
    var bytes = new Uint8Array(buf), out = "";
    for (var i = 0; i < bytes.length; i++) out += (bytes[i] < 16 ? "0" : "") + bytes[i].toString(16);
    return out;
  }

  function check(path) {
    return fetch(path, { cache: "force-cache" })
      .then(function (r) { if (!r.ok) throw new Error(r.status); return r.arrayBuffer(); })
      .then(function (buf) { return crypto.subtle.digest("SHA-256", buf); })
      .then(function (d) { return hex(d) === manifest[path]; })
      .catch(function () { return false; });
  }

  var t0 = performance.now();
  var groups = {};

  Promise.all(paths.map(function (path) {
    return check(path).then(function (ok) {
      var row = document.querySelector('[data-file="' + path + '"]');
      if (row) row.classList.add(ok ? "is-ok" : "is-bad");
      var groupEl = row ? row.closest("[data-group]") : null;
      var g = groupEl ? groupEl.getAttribute("data-group") : "other";
      groups[g] = groups[g] || { ok: 0, total: 0 };
      groups[g].total += 1;
      if (ok) groups[g].ok += 1;
      return { path: path, ok: ok };
    });
  })).then(function (results) {
    Object.keys(groups).forEach(function (g) {
      var st = document.querySelector('[data-group="' + g + '"] .audit-status');
      if (!st) return;
      var s = groups[g];
      st.textContent = s.ok + " of " + s.total + " match";
      st.classList.add(s.ok === s.total ? "is-ok" : "is-bad");
    });
    var bad = results.filter(function (r) { return !r.ok; }).map(function (r) { return r.path; });
    var ms = Math.round(performance.now() - t0);
    var when = new Date().toLocaleTimeString([], { hour: "2-digit", minute: "2-digit", second: "2-digit" });
    if (bad.length) {
      summary.textContent = (results.length - bad.length) + " of " + results.length + " files match. Differs from what is pinned: " + bad.join(", ") + ". Checked at " + when + ".";
    } else {
      summary.textContent = results.length + " of " + results.length + " files match what is pinned — re-hashed in your browser in " + ms + " ms at " + when + ".";
    }
  });
})();
