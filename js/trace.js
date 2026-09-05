/* trace.js: a small ray tracer that draws itself into the plate on the page.
   The same ideas as my CSE 386 ray tracer, in JavaScript: one ray per
   pixel, Phong lighting, shadow rays, one bounce for the reflective
   surfaces, an optional spotlight cone. No WebGL, no library. Drag on the
   plate to move the light. Nothing here leaves the page. */
(function () {
  "use strict";

  var canvas = document.getElementById("trace");
  if (!canvas || !canvas.getContext) return;
  var ctx = canvas.getContext("2d", { alpha: false });
  if (!ctx) return;

  var W = canvas.width, H = canvas.height;
  var img = ctx.createImageData(W, H), px = img.data;

  var stats = document.getElementById("trace-stats");
  var optShadows = document.getElementById("trace-shadows");
  var optReflect = document.getElementById("trace-reflect");
  var optSpot = document.getElementById("trace-spot");
  var redraw = document.getElementById("trace-redraw");

  /* ---------- palette, read from the stylesheet so night mode re-inks the scene ---------- */

  function hex(v, fallback) {
    v = (v || "").trim() || fallback;
    if (v[0] === "#") v = v.slice(1);
    if (v.length === 3) v = v[0] + v[0] + v[1] + v[1] + v[2] + v[2];
    var n = parseInt(v, 16);
    return [((n >> 16) & 255) / 255, ((n >> 8) & 255) / 255, (n & 255) / 255];
  }
  var pal = {};
  function readPalette() {
    var cs = getComputedStyle(document.documentElement);
    pal.paper = hex(cs.getPropertyValue("--paper"), "#f1f2f0");
    pal.paper2 = hex(cs.getPropertyValue("--paper-2"), "#f8f9f7");
    pal.ink = hex(cs.getPropertyValue("--ink"), "#191b1f");
    pal.rule = hex(cs.getPropertyValue("--rule"), "#d3d6d1");
    pal.ox = hex(cs.getPropertyValue("--ox"), "#7a1f2b");
  }

  /* ---------- the scene ---------- */

  var spheres = [
    { c: [-1.05, 0.75, 0.55], r: 0.75, col: "ink",    ks: 0.45, sh: 40,  kr: 0.10 },
    { c: [0.95, 0.60, -0.25],  r: 0.60, col: "ox",     ks: 0.70, sh: 90,  kr: 0.28 },
    { c: [-0.15, 0.30, -1.15], r: 0.30, col: "paper2", ks: 0.90, sh: 160, kr: 0.55 }
  ];
  var light = { x: -1.9, y: 3.4, z: -2.4 };
  var spotTarget = [0, 0.45, 0];
  var COS_INNER = Math.cos(16 * Math.PI / 180), COS_OUTER = Math.cos(24 * Math.PI / 180);
  var AMBIENT = 0.22, AMBIENT_PLANE = 0.34, EPS = 1e-4;

  /* camera */
  var eye = [0, 1.25, -4.8], target = [0, 0.5, 0.1];
  var fwd = norm(sub(target, eye));
  var right = norm(cross(fwd, [0, 1, 0]));
  var up = cross(right, fwd);
  var tanF = Math.tan(38 / 2 * Math.PI / 180);
  var aspect = W / H;
  var pixelAngle = 2 * tanF / H;

  function sub(a, b) { return [a[0] - b[0], a[1] - b[1], a[2] - b[2]]; }
  function cross(a, b) { return [a[1] * b[2] - a[2] * b[1], a[2] * b[0] - a[0] * b[2], a[0] * b[1] - a[1] * b[0]]; }
  function norm(a) { var l = Math.sqrt(a[0] * a[0] + a[1] * a[1] + a[2] * a[2]) || 1; return [a[0] / l, a[1] / l, a[2] / l]; }
  function clamp01(v) { return v < 0 ? 0 : v > 1 ? 1 : v; }
  function smooth(e0, e1, x) { var t = clamp01((x - e0) / (e1 - e0)); return t * t * (3 - 2 * t); }

  var counters = { primary: 0, shadow: 0, bounce: 0 };
  var useShadows = true, useReflect = true, useSpot = false;

  /* nearest sphere along a ray, or -1. Also used for shadow rays with a max distance. */
  function hitSphere(ox, oy, oz, dx, dy, dz, maxT) {
    var best = -1, bestT = maxT;
    for (var i = 0; i < spheres.length; i++) {
      var s = spheres[i];
      var lx = s.c[0] - ox, ly = s.c[1] - oy, lz = s.c[2] - oz;
      var b = lx * dx + ly * dy + lz * dz;
      var c = lx * lx + ly * ly + lz * lz - s.r * s.r;
      var disc = b * b - c;
      if (disc < 0) continue;
      var sq = Math.sqrt(disc);
      var t = b - sq;
      if (t < EPS) t = b + sq;
      if (t < EPS || t >= bestT) continue;
      bestT = t; best = i;
    }
    return best < 0 ? null : { i: best, t: bestT };
  }

  /* light arriving at a point: 0 in shadow, scaled by the spotlight cone if that is on */
  function lightAt(px_, py_, pz_) {
    var lx = light.x - px_, ly = light.y - py_, lz = light.z - pz_;
    var dist = Math.sqrt(lx * lx + ly * ly + lz * lz) || 1;
    lx /= dist; ly /= dist; lz /= dist;
    var I = 1.0;
    if (useSpot) {
      var sx = spotTarget[0] - light.x, sy = spotTarget[1] - light.y, sz = spotTarget[2] - light.z;
      var sl = Math.sqrt(sx * sx + sy * sy + sz * sz) || 1;
      var cosA = -(lx * sx + ly * sy + lz * sz) / sl;
      I = smooth(COS_OUTER, COS_INNER, cosA);
      if (I <= 0) return { I: 0, lx: lx, ly: ly, lz: lz };
    }
    if (useShadows) {
      counters.shadow++;
      if (hitSphere(px_, py_, pz_, lx, ly, lz, dist)) return { I: 0, lx: lx, ly: ly, lz: lz };
    }
    return { I: I, lx: lx, ly: ly, lz: lz };
  }

  function sky(dy) {
    var t = smooth(-0.05, 0.35, dy);
    var a = pal.paper2, b = pal.paper;
    return [a[0] + (b[0] - a[0]) * t, a[1] + (b[1] - a[1]) * t, a[2] + (b[2] - a[2]) * t];
  }

  function trace(ox, oy, oz, dx, dy, dz, depth) {
    var hit = hitSphere(ox, oy, oz, dx, dy, dz, Infinity);
    var tPlane = dy < -1e-6 ? -oy / dy : Infinity;

    if (!hit && tPlane === Infinity) return sky(dy);

    var px_, py_, pz_, nx, ny, nz, albedo, ks, sh, kr, t;

    if (hit && hit.t < tPlane) {
      var s = spheres[hit.i];
      t = hit.t;
      px_ = ox + dx * t; py_ = oy + dy * t; pz_ = oz + dz * t;
      nx = (px_ - s.c[0]) / s.r; ny = (py_ - s.c[1]) / s.r; nz = (pz_ - s.c[2]) / s.r;
      albedo = pal[s.col]; ks = s.ks; sh = s.sh; kr = s.kr;
    } else {
      t = tPlane;
      px_ = ox + dx * t; py_ = 0; pz_ = oz + dz * t;
      nx = 0; ny = 1; nz = 0;
      /* ruled paper: a line at every whole unit, its width tied to the pixel footprint so far lines do not shimmer */
      var foot = t * pixelAngle;
      var w = Math.max(0.02, 1.4 * foot);
      var fx = Math.abs(px_ - Math.round(px_)), fz = Math.abs(pz_ - Math.round(pz_));
      var d = Math.min(fx, fz);
      var line = (1 - smooth(w * 0.5, w, d)) * 0.9;
      var base = pal.paper2, ln = pal.rule;
      albedo = [base[0] + (ln[0] - base[0]) * line, base[1] + (ln[1] - base[1]) * line, base[2] + (ln[2] - base[2]) * line];
      ks = 0.06; sh = 24; kr = 0;
    }

    var L = lightAt(px_ + nx * EPS * 10, py_ + ny * EPS * 10, pz_ + nz * EPS * 10);
    var ndl = nx * L.lx + ny * L.ly + nz * L.lz;
    var diffuse = ndl > 0 ? ndl * L.I : 0;

    /* Phong: reflect the light direction about the normal, compare with the eye direction */
    var spec = 0;
    if (diffuse > 0 && ks > 0) {
      var rx = 2 * ndl * nx - L.lx, ry = 2 * ndl * ny - L.ly, rz = 2 * ndl * nz - L.lz;
      var rdv = -(rx * dx + ry * dy + rz * dz);
      if (rdv > 0) spec = Math.pow(rdv, sh) * ks * L.I;
    }

    var onPlane = !(hit && hit.t < tPlane);
    var shade = (onPlane ? AMBIENT_PLANE : AMBIENT) + diffuse * 0.95;
    var r = albedo[0] * shade + spec, g = albedo[1] * shade + spec, b = albedo[2] * shade + spec;

    if (useReflect && kr > 0 && depth < 2) {
      counters.bounce++;
      var ddn = dx * nx + dy * ny + dz * nz;
      var rfx = dx - 2 * ddn * nx, rfy = dy - 2 * ddn * ny, rfz = dz - 2 * ddn * nz;
      var rc = trace(px_ + nx * EPS * 10, py_ + ny * EPS * 10, pz_ + nz * EPS * 10, rfx, rfy, rfz, depth + 1);
      r += (rc[0] - r) * kr; g += (rc[1] - g) * kr; b += (rc[2] - b) * kr;
    }

    /* the ruled plane fades into the sky with distance */
    if (onPlane) {
      var fog = 1 - Math.exp(-t * 0.045);
      var sk = sky(0.0);
      r += (sk[0] - r) * fog; g += (sk[1] - g) * fog; b += (sk[2] - b) * fog;
    }
    return [r, g, b];
  }

  function shade(x, y, step) {
    var sx = (2 * (x + step / 2) / W - 1) * aspect * tanF;
    var sy = (1 - 2 * (y + step / 2) / H) * tanF;
    var dx = fwd[0] + sx * right[0] + sy * up[0];
    var dy = fwd[1] + sx * right[1] + sy * up[1];
    var dz = fwd[2] + sx * right[2] + sy * up[2];
    var l = Math.sqrt(dx * dx + dy * dy + dz * dz);
    counters.primary++;
    var c = trace(eye[0], eye[1], eye[2], dx / l, dy / l, dz / l, 0);
    var R = clamp01(c[0]) * 255, G = clamp01(c[1]) * 255, B = clamp01(c[2]) * 255;
    var yEnd = Math.min(H, y + step), xEnd = Math.min(W, x + step);
    for (var yy = y; yy < yEnd; yy++) {
      var o = (yy * W + x) * 4;
      for (var xx = x; xx < xEnd; xx++) {
        px[o] = R; px[o + 1] = G; px[o + 2] = B; px[o + 3] = 255;
        o += 4;
      }
    }
  }

  /* ---------- drawing: a coarse pass while dragging, scanlines otherwise ---------- */

  var raf = 0, row = 0, t0 = 0, tAcc = 0;

  function resetCounters() { counters.primary = 0; counters.shadow = 0; counters.bounce = 0; }

  function blank() {
    var p = pal.paper;
    for (var i = 0; i < px.length; i += 4) { px[i] = p[0] * 255; px[i + 1] = p[1] * 255; px[i + 2] = p[2] * 255; px[i + 3] = 255; }
    ctx.putImageData(img, 0, 0);
  }

  function coarse(step) {
    cancelAnimationFrame(raf); raf = 0;
    resetCounters();
    var start = performance.now();
    for (var y = 0; y < H; y += step) for (var x = 0; x < W; x += step) shade(x, y, step);
    ctx.putImageData(img, 0, 0);
    report(performance.now() - start, step);
  }

  function full() {
    cancelAnimationFrame(raf);
    resetCounters();
    row = 0; tAcc = 0;
    raf = requestAnimationFrame(tick);
  }

  var reduced = window.matchMedia && window.matchMedia("(prefers-reduced-motion: reduce)").matches;
  var ROWS_PER_FRAME = reduced ? H : 8;

  function tick() {
    var start = performance.now(), from = row, budget = from + ROWS_PER_FRAME;
    while (row < H && row < budget && performance.now() - start < 11) {
      for (var x = 0; x < W; x++) shade(x, row, 1);
      row++;
    }
    tAcc += performance.now() - start;
    ctx.putImageData(img, 0, 0, 0, from, W, row - from);
    if (row < H) {
      raf = requestAnimationFrame(tick);
    } else {
      raf = 0;
      report(tAcc, 1);
    }
  }

  function fmt(n) { return n.toLocaleString("en-US"); }
  function report(ms, step) {
    if (!stats) return;
    var res = step === 1 ? W + " × " + H : "preview at " + Math.round(W / step) + " × " + Math.round(H / step);
    stats.textContent = res + ". " + fmt(counters.primary) + " primary rays, " + fmt(counters.shadow) + " shadow rays, " + fmt(counters.bounce) + " bounces, " + Math.round(ms) + " ms. Light at (" + light.x.toFixed(1) + ", " + light.y.toFixed(1) + ", " + light.z.toFixed(1) + "). Drag the plate to move it.";
  }

  /* ---------- controls ---------- */

  function clamp(v, lo, hi) { return v < lo ? lo : v > hi ? hi : v; }

  var dragging = false, lastX = 0, lastY = 0, moved = false;
  canvas.addEventListener("pointerdown", function (e) {
    dragging = true; moved = false; lastX = e.clientX; lastY = e.clientY;
    canvas.classList.add("is-dragging");
    if (canvas.setPointerCapture) canvas.setPointerCapture(e.pointerId);
    e.preventDefault();
  });
  canvas.addEventListener("pointermove", function (e) {
    if (!dragging) return;
    var dx = e.clientX - lastX, dy = e.clientY - lastY;
    lastX = e.clientX; lastY = e.clientY;
    if (!dx && !dy) return;
    moved = true;
    var scale = 5 / (canvas.clientWidth || W);
    light.x = clamp(light.x + dx * scale, -4.5, 4.5);
    light.z = clamp(light.z - dy * scale, -4.5, 4.0);
    coarse(4);
  });
  function endDrag() {
    if (!dragging) return;
    dragging = false;
    canvas.classList.remove("is-dragging");
    full();
  }
  canvas.addEventListener("pointerup", endDrag);
  canvas.addEventListener("pointercancel", endDrag);

  canvas.addEventListener("keydown", function (e) {
    var step = e.shiftKey ? 1 : 0.25, k = e.key;
    if (k === "ArrowLeft") light.x = clamp(light.x - step, -4.5, 4.5);
    else if (k === "ArrowRight") light.x = clamp(light.x + step, -4.5, 4.5);
    else if (k === "ArrowUp") light.z = clamp(light.z + step, -4.5, 4.0);
    else if (k === "ArrowDown") light.z = clamp(light.z - step, -4.5, 4.0);
    else return;
    e.preventDefault();
    full();
  });

  function readOptions() {
    useShadows = !optShadows || optShadows.checked;
    useReflect = !optReflect || optReflect.checked;
    useSpot = !!(optSpot && optSpot.checked);
  }
  [optShadows, optReflect, optSpot].forEach(function (el) {
    if (el) el.addEventListener("change", function () { readOptions(); full(); });
  });
  if (redraw) redraw.addEventListener("click", function () { blank(); full(); });

  /* night mode re-inks the scene */
  function themed() { readPalette(); full(); }
  if (window.MutationObserver) {
    new MutationObserver(themed).observe(document.documentElement, { attributes: true, attributeFilter: ["data-theme"] });
  }
  if (window.matchMedia) {
    var mq = window.matchMedia("(prefers-color-scheme: dark)");
    if (mq.addEventListener) mq.addEventListener("change", themed);
  }

  /* ---------- go: blank paper, then it draws itself when it scrolls into view ---------- */

  readPalette();
  readOptions();
  blank();
  if (stats) stats.textContent = "Blank paper until the plate is in view. Then it draws itself, top to bottom.";

  var started = false;
  function start() { if (started) return; started = true; full(); }
  if (window.IntersectionObserver) {
    var io = new IntersectionObserver(function (entries) {
      entries.forEach(function (en) { if (en.isIntersecting) { start(); io.disconnect(); } });
    }, { threshold: 0.25 });
    io.observe(canvas);
  } else {
    start();
  }

  window.trace = { light: light, redraw: full, counters: counters };
})();
