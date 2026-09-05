/* bench.js: a 64-bit Feistel network, live in the page.
   ZFC-Cipher (CYB 236) is built on this structure. The round function and
   key schedule here are simple demo ones, not the ZFC ones. Everything runs
   in your browser. Nothing is sent anywhere. */
(function () {
  "use strict";

  var root = document.getElementById("bench-form");
  if (!root) return;

  /* ---------- 32-bit helpers ---------- */

  function rotl(x, n) { n &= 31; return n ? ((x << n) | (x >>> (32 - n))) >>> 0 : x >>> 0; }
  function hex8(x) { return ("00000000" + (x >>> 0).toString(16)).slice(-8); }
  function popcount(x) { x = x >>> 0; var c = 0; while (x) { x &= x - 1; c++; } return c; }

  /* Demo round function: add the round key, then mix with rotations and an
     odd multiply. It does not have to be invertible. That is the point of a
     Feistel network: the swap makes the whole thing invertible anyway. */
  function F(r, k) {
    var x = (r + k) >>> 0;
    x = (x ^ rotl(x, 7)) >>> 0;
    x = Math.imul(x, 0x9e3779b1) >>> 0;
    x = (x ^ (x >>> 15)) >>> 0;
    x = (x ^ rotl(x, 11)) >>> 0;
    return x;
  }

  /* Demo key schedule: n round keys from the 64-bit key. */
  function schedule(kHi, kLo, n) {
    var keys = [], a = kHi >>> 0, b = kLo >>> 0;
    for (var i = 0; i < n; i++) {
      var x = (a ^ rotl(b, i + 1) ^ Math.imul(0x9e3779b9, i + 1)) >>> 0;
      x = (x ^ (x << 13)) >>> 0;
      x = (x ^ (x >>> 17)) >>> 0;
      x = (x ^ (x << 5)) >>> 0;
      keys.push(x);
      a = b; b = x;
    }
    return keys;
  }

  /* One walk through the rounds. Returns the state after each round and the
     output block (the last swap undone, so decrypting is the same walk with
     the keys in reverse order). */
  function walk(l, r, keys) {
    var states = [];
    for (var i = 0; i < keys.length; i++) {
      var t = r;
      r = (l ^ F(r, keys[i])) >>> 0;
      l = t;
      states.push({ l: l, r: r, k: keys[i] });
    }
    return { states: states, l: r, r: l };
  }

  function encrypt(block, key, n) { return walk(block[0], block[1], schedule(key[0], key[1], n)); }
  function decrypt(block, key, n) { return walk(block[0], block[1], schedule(key[0], key[1], n).reverse()); }

  /* ---------- text <-> 64-bit block ---------- */

  function toBlock(text) {
    var hi = 0, lo = 0;
    for (var i = 0; i < 8; i++) {
      var c = i < text.length ? text.charCodeAt(i) & 0xff : 0x20;
      if (i < 4) hi = ((hi << 8) | c) >>> 0; else lo = ((lo << 8) | c) >>> 0;
    }
    return [hi, lo];
  }
  function toText(block) {
    var out = "";
    for (var i = 0; i < 8; i++) {
      var c = i < 4 ? (block[0] >>> (24 - 8 * i)) & 0xff : (block[1] >>> (24 - 8 * (i - 4))) & 0xff;
      out += (c >= 0x20 && c < 0x7f) ? String.fromCharCode(c) : "·";
    }
    return out;
  }
  function bit(block, i) { return i < 32 ? (block[0] >>> (31 - i)) & 1 : (block[1] >>> (63 - i)) & 1; }
  function xor(a, b) { return [(a[0] ^ b[0]) >>> 0, (a[1] ^ b[1]) >>> 0]; }
  function diff(a, b) { return popcount(a[0] ^ b[0]) + popcount(a[1] ^ b[1]); }
  function maskBit(i) { return i < 32 ? [(1 << (31 - i)) >>> 0, 0] : [0, (1 << (63 - i)) >>> 0]; }

  /* ---------- state ---------- */

  var state = {
    text: "hello wo",
    key: "one key.",
    rounds: 16,
    flipBlock: [0, 0],   /* which typed block bits have been flipped */
    flipKey: [0, 0]      /* which typed key bits have been flipped */
  };

  var el = {
    text: root.querySelector("#bench-text"),
    key: root.querySelector("#bench-key"),
    rounds: root.querySelector("#bench-rounds"),
    roundsOut: root.querySelector("#bench-rounds-out"),
    blockStrip: root.querySelector('[data-strip="block"]'),
    keyStrip: root.querySelector('[data-strip="key"]'),
    outStrip: root.querySelector('[data-strip="out"]'),
    blockHex: root.querySelector("#bench-block-hex"),
    keyHex: root.querySelector("#bench-key-hex"),
    outHex: root.querySelector("#bench-out-hex"),
    summary: root.querySelector("#bench-summary"),
    table: root.querySelector("#bench-rounds-body"),
    trip: root.querySelector("#bench-trip"),
    note: root.querySelector("#bench-note")
  };

  /* ---------- strips: two rows of 32 cells, L over R ---------- */

  function buildStrip(strip, name, clickable) {
    var cells = [];
    ["L", "R"].forEach(function (half, h) {
      var row = document.createElement("div");
      row.className = "half";
      var tag = document.createElement("span");
      tag.className = "tag";
      tag.textContent = half;
      tag.setAttribute("aria-hidden", "true");
      row.appendChild(tag);
      var box = document.createElement("div");
      box.className = "cells";
      for (var j = 0; j < 32; j++) {
        var i = h * 32 + j;
        var c = document.createElement(clickable ? "button" : "span");
        c.className = "bit";
        if (clickable) {
          c.type = "button";
          c.setAttribute("data-bit", String(i));
        }
        box.appendChild(c);
        cells.push(c);
      }
      row.appendChild(box);
      strip.appendChild(row);
    });
    strip.setAttribute("data-name", name);
    return cells;
  }

  var blockCells = buildStrip(el.blockStrip, "block", true);
  var keyCells = buildStrip(el.keyStrip, "key", true);
  var outCells = buildStrip(el.outStrip, "ciphertext", false);

  function paintStrip(cells, block, flips, changedFrom, name) {
    for (var i = 0; i < 64; i++) {
      var c = cells[i];
      var v = bit(block, i);
      c.classList.toggle("on", v === 1);
      var flipped = flips ? bit(flips, i) === 1 : false;
      c.classList.toggle("flipped", flipped);
      var changed = changedFrom ? bit(changedFrom, i) !== v : false;
      c.classList.toggle("changed", changed);
      if (c.tagName === "BUTTON") {
        c.setAttribute("aria-pressed", flipped ? "true" : "false");
        c.setAttribute("aria-label", name + " bit " + i + ", " + v + (flipped ? ", flipped" : "") + ". Flip it.");
      }
    }
  }

  /* ---------- render ---------- */

  function bar(n) {
    var wrap = document.createElement("span");
    wrap.className = "bar";
    var fill = document.createElement("i");
    fill.style.width = (n / 64 * 100).toFixed(1) + "%";
    wrap.appendChild(fill);
    return wrap;
  }

  function td(text, cls) {
    var c = document.createElement("td");
    if (cls) c.className = cls;
    c.textContent = text;
    return c;
  }

  function render() {
    var typedBlock = toBlock(state.text);
    var typedKey = toBlock(state.key);
    var block = xor(typedBlock, state.flipBlock);
    var key = xor(typedKey, state.flipKey);
    var n = state.rounds;

    var ref = encrypt(typedBlock, typedKey, n);   /* the run for what was typed */
    var cur = encrypt(block, key, n);             /* the run with the flips applied */
    var refOut = [ref.l, ref.r], curOut = [cur.l, cur.r];

    var flippedBits = popcount(state.flipBlock[0]) + popcount(state.flipBlock[1]) + popcount(state.flipKey[0]) + popcount(state.flipKey[1]);
    var changedOut = diff(refOut, curOut);

    paintStrip(blockCells, block, state.flipBlock, null, "Block");
    paintStrip(keyCells, key, state.flipKey, null, "Key");
    paintStrip(outCells, curOut, null, flippedBits ? refOut : null, "Ciphertext");

    el.blockHex.textContent = "0x" + hex8(block[0]) + " " + hex8(block[1]);
    el.keyHex.textContent = "0x" + hex8(key[0]) + " " + hex8(key[1]);
    el.outHex.textContent = "0x" + hex8(curOut[0]) + " " + hex8(curOut[1]);
    el.roundsOut.textContent = String(n);

    if (flippedBits === 0) {
      el.summary.textContent = "Click any block or key bit to flip it, then watch the change spread through the rounds.";
    } else {
      var nb = popcount(state.flipBlock[0]) + popcount(state.flipBlock[1]);
      var nk = flippedBits - nb;
      var what = [];
      if (nb) what.push(nb + " block bit" + (nb === 1 ? "" : "s"));
      if (nk) what.push(nk + " key bit" + (nk === 1 ? "" : "s"));
      el.summary.textContent = what.join(" and ") + " flipped. " + changedOut + " of 64 ciphertext bits changed after " + n + " round" + (n === 1 ? "" : "s") + ".";
    }

    /* the round table */
    var body = el.table;
    while (body.firstChild) body.removeChild(body.firstChild);

    var tr0 = document.createElement("tr");
    tr0.appendChild(td("in", "num"));
    tr0.appendChild(td(hex8(block[0]), "hex"));
    tr0.appendChild(td(hex8(block[1]), "hex"));
    tr0.appendChild(td("", "hex"));
    var d0 = diff(typedBlock, block);
    var c0 = document.createElement("td");
    c0.className = "delta";
    c0.appendChild(bar(d0));
    c0.appendChild(document.createTextNode(String(d0)));
    tr0.appendChild(c0);
    body.appendChild(tr0);

    for (var i = 0; i < n; i++) {
      var s = cur.states[i], t = ref.states[i];
      var d = popcount(s.l ^ t.l) + popcount(s.r ^ t.r);
      var tr = document.createElement("tr");
      tr.appendChild(td(String(i + 1), "num"));
      tr.appendChild(td(hex8(s.l), "hex"));
      tr.appendChild(td(hex8(s.r), "hex"));
      tr.appendChild(td(hex8(s.k), "hex key"));
      var c = document.createElement("td");
      c.className = "delta";
      c.appendChild(bar(d));
      c.appendChild(document.createTextNode(String(d)));
      tr.appendChild(c);
      body.appendChild(tr);
    }

    var trN = document.createElement("tr");
    trN.className = "out";
    trN.appendChild(td("out", "num"));
    trN.appendChild(td(hex8(curOut[0]), "hex"));
    trN.appendChild(td(hex8(curOut[1]), "hex"));
    trN.appendChild(td("halves swapped", "hex quiet"));
    var cN = document.createElement("td");
    cN.className = "delta";
    cN.appendChild(bar(changedOut));
    cN.appendChild(document.createTextNode(String(changedOut)));
    trN.appendChild(cN);
    body.appendChild(trN);

    /* round trip: the same rounds, keys reversed */
    var back = decrypt(curOut, key, n);
    var backBlock = [back.l, back.r];
    var ok = backBlock[0] === block[0] && backBlock[1] === block[1];
    el.trip.textContent = "Run the same " + n + " round" + (n === 1 ? "" : "s") + " backwards with the keys in reverse order and the block comes back: “" + toText(backBlock) + "”" + (ok ? " ✓" : " ✗ (this should never happen)");
  }

  /* ---------- events ---------- */

  function onText() {
    state.text = el.text.value.slice(0, 8);
    state.flipBlock = [0, 0];
    render();
  }
  function onKey() {
    state.key = el.key.value.slice(0, 8);
    state.flipKey = [0, 0];
    render();
  }
  el.text.addEventListener("input", onText);
  el.key.addEventListener("input", onKey);
  el.rounds.addEventListener("input", function () {
    state.rounds = Math.max(1, Math.min(16, parseInt(el.rounds.value, 10) || 16));
    render();
  });

  function flip(which, i) {
    var m = maskBit(i);
    if (which === "block") state.flipBlock = xor(state.flipBlock, m);
    else state.flipKey = xor(state.flipKey, m);
    render();
  }
  el.blockStrip.addEventListener("click", function (e) {
    var b = e.target.closest("[data-bit]");
    if (b) flip("block", parseInt(b.getAttribute("data-bit"), 10));
  });
  el.keyStrip.addEventListener("click", function (e) {
    var b = e.target.closest("[data-bit]");
    if (b) flip("key", parseInt(b.getAttribute("data-bit"), 10));
  });

  root.addEventListener("click", function (e) {
    var b = e.target.closest("[data-action]");
    if (!b) return;
    var a = b.getAttribute("data-action");
    if (a === "flip-block") flip("block", Math.floor(Math.random() * 64));
    else if (a === "flip-key") flip("key", Math.floor(Math.random() * 64));
    else if (a === "reset") { state.flipBlock = [0, 0]; state.flipKey = [0, 0]; render(); }
  });
  root.addEventListener("submit", function (e) { e.preventDefault(); });

  /* ---------- go ---------- */

  el.text.value = state.text;
  el.key.value = state.key;
  el.rounds.value = String(state.rounds);
  root.classList.add("is-live");
  if (el.note) el.note.textContent = "Runs entirely in this page. Demo round function and key schedule, not the ZFC ones.";
  render();

  /* exposed for the page's own tests, harmless otherwise */
  window.bench = { encrypt: encrypt, decrypt: decrypt, toBlock: toBlock, toText: toText, diff: diff };
})();
