/* Hyperconnections — shared core
 * Used by both the game (hyper-game.js) and the author tool (/tools/hyper-packer.html).
 * Keep these two in sync: the packer and the game must agree on canonical form.
 *
 * A puzzle is 16 words and 4 categories. Each word gets a 4-bit mask: bit b is set
 * iff the word belongs to category b. A valid puzzle has all 16 masks distinct,
 * i.e. a bijection onto the powerset of the 4 categories (the vertices of Q4).
 */
(function (global) {
  'use strict';

  var HC = global.HC || (global.HC = {});

  // Positions 0..3 of a row/column, in Gray order, so neighbours differ in one bit.
  HC.GRAY = [0, 1, 3, 2];

  HC.normWord = function (w) {
    return String(w).trim().toLowerCase().replace(/\s+/g, ' ');
  };

  HC.sha256Hex = async function (str) {
    var bytes = new TextEncoder().encode(str);
    var digest = await crypto.subtle.digest('SHA-256', bytes);
    return Array.from(new Uint8Array(digest))
      .map(function (b) { return b.toString(16).padStart(2, '0'); })
      .join('');
  };

  /* Canonical form of a solution.
   * Deliberately invariant under:
   *   - reordering the 4 categories (they are unlabelled while you play)
   *   - complementing any category ("has an A" and "has no A" cut the same way)
   * so a structurally correct answer always hashes to the stored value.
   */
  HC.canonical = function (words, masks) {
    var w = words.map(HC.normWord);
    var parts = [];
    for (var b = 0; b < 4; b++) {
      var inSet = [], outSet = [];
      for (var i = 0; i < w.length; i++) {
        ((masks[i] >> b) & 1 ? inSet : outSet).push(w[i]);
      }
      inSet.sort(); outSet.sort();
      var a = inSet.join(','), c = outSet.join(',');
      parts.push(a < c ? a : c);
    }
    parts.sort();
    return parts.join('|');
  };

  HC.hashSolution = async function (words, masks) {
    return HC.sha256Hex(HC.canonical(words, masks));
  };

  HC.isBijection = function (masks) {
    if (masks.length !== 16) return false;
    var seen = new Set();
    for (var i = 0; i < 16; i++) {
      if (masks[i] < 0 || masks[i] > 15) return false;
      seen.add(masks[i]);
    }
    return seen.size === 16;
  };

  /* ---- Payload obfuscation -------------------------------------------------
   * This is scrambling, not security: the key is derived from the puzzle id and
   * ships with the page. It only stops the solution from being readable in the
   * repo or in View Source. The SHA-256 hash above is what actually grades you.
   */
  HC.passphrase = function (id) { return 'hyperconnections/v1/' + id; };

  async function keystream(pass, len) {
    var base = new TextEncoder().encode(pass);
    var out = new Uint8Array(len);
    var off = 0, ctr = 0;
    while (off < len) {
      var buf = new Uint8Array(base.length + 4);
      buf.set(base, 0);
      new DataView(buf.buffer).setUint32(base.length, ctr, false);
      var d = new Uint8Array(await crypto.subtle.digest('SHA-256', buf));
      var n = Math.min(32, len - off);
      out.set(d.subarray(0, n), off);
      off += n; ctr++;
    }
    return out;
  }

  HC.scramble = async function (plainText, pass) {
    var bytes = new TextEncoder().encode(plainText);
    var ks = await keystream(pass, bytes.length);
    var s = '';
    for (var i = 0; i < bytes.length; i++) s += String.fromCharCode(bytes[i] ^ ks[i]);
    return btoa(s);
  };

  HC.unscramble = async function (b64, pass) {
    var s = atob(b64);
    var bytes = new Uint8Array(s.length);
    for (var i = 0; i < s.length; i++) bytes[i] = s.charCodeAt(i);
    var ks = await keystream(pass, bytes.length);
    for (var j = 0; j < bytes.length; j++) bytes[j] ^= ks[j];
    return new TextDecoder().decode(bytes);
  };

  /* Pack a plaintext puzzle into the form stored in puzzles.json. */
  HC.pack = async function (p) {
    var words = p.words.map(HC.normWord);
    if (!HC.isBijection(p.masks)) throw new Error('The 16 masks are not all distinct.');
    var order = shuffledIndices(words.length);
    var shuffledWords = order.map(function (i) { return words[i]; });
    var shuffledMasks = order.map(function (i) { return p.masks[i]; });
    var payload = JSON.stringify({ categories: p.categories, masks: shuffledMasks });
    return {
      id: p.id,
      title: p.title || ('Puzzle ' + p.id),
      note: p.note || undefined,
      words: shuffledWords,
      hash: await HC.hashSolution(shuffledWords, shuffledMasks),
      payload: await HC.scramble(payload, HC.passphrase(p.id))
    };
  };

  HC.unpack = async function (packed) {
    var json = await HC.unscramble(packed.payload, HC.passphrase(packed.id));
    return JSON.parse(json);
  };

  function shuffledIndices(n) {
    var a = [];
    for (var i = 0; i < n; i++) a.push(i);
    for (var j = n - 1; j > 0; j--) {
      var k = Math.floor(Math.random() * (j + 1));
      var t = a[j]; a[j] = a[k]; a[k] = t;
    }
    return a;
  }
  HC.shuffledIndices = shuffledIndices;

  /* Match the player's unlabelled groups to the real categories.
   * Returns, per player group, { cat: <index>, negated: <bool> } or null.
   */
  HC.align = function (playerMasks, trueMasks) {
    var out = [];
    var used = {};
    for (var b = 0; b < 4; b++) {
      var found = null;
      for (var c = 0; c < 4; c++) {
        if (used[c]) continue;
        var same = true, opp = true;
        for (var i = 0; i < playerMasks.length; i++) {
          var pv = (playerMasks[i] >> b) & 1;
          var tv = (trueMasks[i] >> c) & 1;
          if (pv !== tv) same = false;
          if (pv === tv) opp = false;
        }
        if (same || opp) { found = { cat: c, negated: !same }; used[c] = true; break; }
      }
      out.push(found);
    }
    return out;
  };

  /* Re-express the player's board in the setter's frame (group order and polarity),
   * choosing the relabelling that agrees most with what they have already built.
   * Without this, a word hint given in the setter's polarity could contradict a
   * board the player built in the opposite polarity, with no way back. */
  HC.realign = function (playerMasks, trueMasks) {
    var n = playerMasks.length;
    var pairs = [];
    for (var b = 0; b < 4; b++) {
      for (var c = 0; c < 4; c++) {
        for (var s = 0; s < 2; s++) {
          var score = 0;
          for (var i = 0; i < n; i++) {
            if (((playerMasks[i] >> b) & 1) === (((trueMasks[i] >> c) & 1) ^ s)) score++;
          }
          pairs.push({ b: b, c: c, s: s, score: score });
        }
      }
    }
    pairs.sort(function (x, y) { return y.score - x.score; });
    var usedB = {}, usedC = {}, map = [];
    pairs.forEach(function (p) {
      if (usedB[p.b] || usedC[p.c]) return;
      usedB[p.b] = usedC[p.c] = true;
      map.push(p);
    });
    return playerMasks.map(function (m) {
      var out = 0;
      map.forEach(function (p) { out |= (((m >> p.b) & 1) ^ p.s) << p.c; });
      return out;
    });
  };

  /* Where a mask sits in the 4x4 torus drawing of Q4.
   * Columns encode categories 1 and 2, rows encode categories 3 and 4. */
  HC.cell = function (mask) {
    return { col: HC.GRAY.indexOf(mask & 3), row: HC.GRAY.indexOf((mask >> 2) & 3) };
  };

})(typeof window !== 'undefined' ? window : globalThis);