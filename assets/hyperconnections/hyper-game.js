/* Hyperconnections — board engine. Requires hyper-core.js. */
(function (global) {
  'use strict';

  var HC = global.HC;
  if (!HC) throw new Error('hyper-core.js must load before hyper-game.js');

  var RGB = [[214, 79, 110], [232, 163, 61], [58, 166, 160], [108, 99, 216]];

  var REDUCED = !!(global.matchMedia &&
    global.matchMedia('(prefers-reduced-motion: reduce)').matches);

  var CUBE_NOTE = 'Neighbouring cells differ by exactly one category. Edges wrap ' +
    'around, which is what makes this 4×4 grid a drawing of Q\u2084.';

  function el(tag, cls, txt) {
    var e = document.createElement(tag);
    if (cls) e.className = cls;
    if (txt != null) e.textContent = txt;
    return e;
  }

  function blend(mask) {
    var r = 0, g = 0, b = 0, n = 0;
    for (var i = 0; i < 4; i++) {
      if ((mask >> i) & 1) { r += RGB[i][0]; g += RGB[i][1]; b += RGB[i][2]; n++; }
    }
    if (!n) return 'transparent';
    return 'rgba(' + Math.round(r / n) + ',' + Math.round(g / n) + ',' + Math.round(b / n) + ',0.16)';
  }

  /* opts: { puzzle, mode: 'packed'|'plain', storeKey, demo: bool } */
  HC.mount = async function (root, opts) {
    var puzzle = opts.puzzle;
    var words = puzzle.words.map(HC.normWord);
    var truth = null;             // { categories, masks }
    var hash = puzzle.hash || null;
    var masks = new Array(16).fill(0);
    var locked = new Set();
    var order = words.map(function (_, i) { return i; });
    var solved = false, gaveUp = false, namesShown = false;

    if (opts.mode === 'plain') {
      truth = { categories: puzzle.categories, masks: puzzle.masks };
      hash = await HC.hashSolution(words, puzzle.masks);
    }

    var storeKey = 'hyperconnections/v1/' + (opts.storeKey || puzzle.id || 'demo');
    try {
      var saved = JSON.parse(localStorage.getItem(storeKey) || 'null');
      if (saved && Array.isArray(saved.masks) && saved.masks.length === 16) {
        masks = saved.masks;
      }
    } catch (e) { /* storage unavailable; play without saving */ }

    function save() {
      try {
        localStorage.setItem(storeKey, JSON.stringify({ masks: masks }));
      } catch (e) { /* ignore */ }
    }

    function forget() {
      try { localStorage.removeItem(storeKey); } catch (e) { /* ignore */ }
    }

    async function getTruth() {
      if (!truth) truth = await HC.unpack(puzzle);
      return truth;
    }

    /* ---- markup ---- */
    root.innerHTML = '';
    root.classList.add('hc');

    var head = el('div', 'hc-head');
    var legend = el('div', 'hc-legend');
    var chips = [];
    for (var b = 0; b < 4; b++) {
      var chip = el('span', 'hc-chip c' + b);
      chip.appendChild(el('span', 'hc-swatch'));
      var label = el('span', 'hc-chip-label', 'Group ' + (b + 1));
      var count = el('span', 'hc-count', '0/8');
      chip.appendChild(label);
      chip.appendChild(count);
      chip._label = label; chip._count = count;
      chips.push(chip);
      legend.appendChild(chip);
    }
    head.appendChild(legend);
    root.appendChild(head);

    var board = el('div', 'hc-board');
    root.appendChild(board);

    var note = el('p', 'hc-cube-note');
    root.appendChild(note);

    var status = el('p', 'hc-status');
    status.setAttribute('role', 'status');
    root.appendChild(status);

    var bar = el('div', 'hc-actions');
    var btnCheck = el('button', 'hc-btn hc-btn-primary', 'Check answer');
    var btnClear = el('button', 'hc-btn', 'Clear board');
    var btnShuffle = el('button', 'hc-btn', 'Shuffle words');
    var btnHint = el('button', 'hc-btn', 'See categories');
    var btnGiveUp = el('button', 'hc-btn hc-btn-quiet', 'Show solution');
    [btnCheck, btnClear, btnShuffle, btnHint, btnGiveUp].forEach(function (x) { bar.appendChild(x); });
    root.appendChild(bar);

    /* ---- board ---- */
    var tiles = [];
    function buildBoard() {
      board.innerHTML = '';
      tiles = [];
      order.forEach(function (i) {
        var tile = el('div', 'hc-tile');
        tile.tabIndex = 0;
        tile.appendChild(el('span', 'hc-word', words[i]));
        var bits = el('div', 'hc-bits');
        for (var b = 0; b < 4; b++) {
          (function (bit) {
            var btn = el('button', 'hc-bit c' + bit, String(bit + 1));
            btn.type = 'button';
            btn.setAttribute('aria-label', words[i] + ' in group ' + (bit + 1));
            btn.addEventListener('click', function () { toggle(i, bit); });
            bits.appendChild(btn);
          })(b);
        }
        tile.appendChild(bits);
        tile.addEventListener('keydown', function (ev) {
          if (ev.key >= '1' && ev.key <= '4') { toggle(i, +ev.key - 1); ev.preventDefault(); }
        });
        tile._index = i;
        board.appendChild(tile);
        tiles.push(tile);
      });
      paint();
    }

    function toggle(i, bit) {
      if (solved || gaveUp || locked.has(i)) return;
      masks[i] ^= (1 << bit);
      save();
      paint();
      status.textContent = '';
      status.className = 'hc-status';
    }

    function paint() {
      tiles.forEach(function (tile) {
        var i = tile._index, m = masks[i];
        tile.style.background = blend(m);
        tile.classList.toggle('is-locked', locked.has(i));
        var bits = tile.querySelectorAll('.hc-bit');
        for (var b = 0; b < 4; b++) bits[b].classList.toggle('on', !!((m >> b) & 1));
      });
      var dupes = new Set();
      var seen = {};
      masks.forEach(function (m) { if (seen[m]) dupes.add(m); seen[m] = true; });
      tiles.forEach(function (tile) {
        tile.classList.toggle('is-dupe', !solved && !gaveUp && dupes.has(masks[tile._index]));
      });
      for (var b2 = 0; b2 < 4; b2++) {
        var n = masks.filter(function (m) { return (m >> b2) & 1; }).length;
        chips[b2]._count.textContent = n + '/8';
        chips[b2].classList.toggle('is-full', n === 8);
      }
    }

    /* Draw attention to specific tiles for a moment. */
    function flash(indices) {
      var want = new Set(indices);
      tiles.forEach(function (tile) {
        if (!want.has(tile._index)) return;
        tile.classList.remove('is-flash');
        void tile.offsetWidth;              // restart the animation
        tile.classList.add('is-flash');
        tile.addEventListener('animationend', function h() {
          tile.classList.remove('is-flash');
          tile.removeEventListener('animationend', h);
        });
      });
    }

    /* ---- checking ---- */
    btnCheck.addEventListener('click', async function () {
      if (solved || gaveUp) return;
      if (!HC.isBijection(masks)) {
        var byPattern = {};
        masks.forEach(function (m, i) { (byPattern[m] = byPattern[m] || []).push(i); });
        var bad = [], clashes = 0;
        Object.keys(byPattern).forEach(function (k) {
          if (byPattern[k].length > 1) { bad = bad.concat(byPattern[k]); clashes++; }
        });
        flash(bad);
        say(bad.length + ' words are sharing ' + clashes +
          (clashes === 1 ? ' pattern' : ' patterns') +
          '. All 16 must be different.', 'warn');
        return;
      }
      var h = await HC.hashSolution(words, masks);
      if (h === hash) { solved = true; save(); await finish('solved'); }
      else say('Valid grouping, but not the intended one. Keep going.', 'warn');
    });

    btnClear.addEventListener('click', function () {
      if (solved || gaveUp) return;
      masks = new Array(16).fill(0);
      locked.clear();
      save(); paint(); say('');
    });

    btnShuffle.addEventListener('click', function () {
      if (solved || gaveUp) return;
      order = HC.shuffledIndices(16).map(function (k) { return order[k]; });
      buildBoard();
    });

    btnHint.addEventListener('click', async function () {
      if (solved || gaveUp) return;
      var t = await getTruth();
      if (!namesShown) {
        namesShown = true;
        say('Category names (in no particular order): ' + t.categories.join(' · ') +
          ' — you still have to work out which words carry which.', 'hint');
        return;
      }
      var candidates = [];
      for (var i = 0; i < 16; i++) if (!locked.has(i)) candidates.push(i);
      if (!candidates.length) { say('Every word is already pinned.', 'hint'); return; }
      var pick = candidates[Math.floor(Math.random() * candidates.length)];
      var before = masks.slice();
      masks = HC.realign(masks, t.masks);
      masks[pick] = t.masks[pick];
      locked.add(pick);
      save(); paint();
      var moved = before.some(function (m, i) { return m !== masks[i]; }) && locked.size === 1;
      say('Pinned "' + words[pick] + '" to its true pattern. ' + locked.size + ' of 16 pinned.' +
        (moved ? ' Your groups were renumbered to match the hints — the grouping itself is unchanged.' : ''),
        'hint');
    });

    btnGiveUp.addEventListener('click', async function () {
      if (solved || gaveUp) return;
      if (!confirm('Show the full solution for this puzzle?')) return;
      var t = await getTruth();
      gaveUp = true;
      masks = t.masks.slice();
      save(); paint();
      await finish('revealed');
    });

    function say(msg, kind) {
      status.textContent = msg || '';
      status.className = 'hc-status' + (kind ? ' is-' + kind : '');
    }

    /* ---- endgame ---- */
    async function finish(how) {
      forget();
      var t = await getTruth();
      var align = HC.align(masks, t.masks);
      for (var b = 0; b < 4; b++) {
        var a = align[b];
        if (a) {
          chips[b]._label.textContent = t.categories[a.cat] + (a.negated ? ' (flipped)' : '');
          chips[b].classList.add('is-named');
        }
      }
      board.classList.add('is-done');
      say(how === 'solved' ? 'Solved! Every word sits on its own vertex.'
        : 'Solution shown.', how === 'solved' ? 'good' : 'hint');
      btnCheck.disabled = btnClear.disabled = btnShuffle.disabled =
        btnHint.disabled = btnGiveUp.disabled = true;
      if (boardCols() === 4) await revealCube(t);
    }

    /* How many columns the board is laid out in right now. Below 560px it drops
     * to two, where cube reading order would mean nothing. */
    function boardCols() {
      var g = getComputedStyle(board).gridTemplateColumns;
      return g ? g.split(' ').filter(Boolean).length : 4;
    }

    /* Slide the tiles into hypercube order (FLIP) and grow axis labels around
     * them, so the board the player built becomes the drawing of Q4. */
    function revealCube(t) {
      return new Promise(function (resolve) {
        var slots = new Array(16);
        for (var i = 0; i < 16; i++) {
          var c = HC.cell(t.masks[i]);
          slots[c.row * 4 + c.col] = i;
        }

        var before = {};
        tiles.forEach(function (tile) { before[tile._index] = tile.getBoundingClientRect(); });

        var byIndex = {};
        tiles.forEach(function (tile) { byIndex[tile._index] = tile; });

        var axes = [], kids = [];
        function axis(cls, txt) {
          var a = el('div', 'hc-axis ' + cls, txt);
          axes.push(a); kids.push(a);
        }
        axis('hc-axis-corner', '');
        for (var col = 0; col < 4; col++) {
          axis('hc-axis-col', labelFor(HC.GRAY[col], [0, 1], t));
        }
        for (var row = 0; row < 4; row++) {
          axis('hc-axis-row', labelFor(HC.GRAY[row], [2, 3], t));
          for (var c2 = 0; c2 < 4; c2++) kids.push(byIndex[slots[row * 4 + c2]]);
        }

        order = slots;
        tiles = order.map(function (i) { return byIndex[i]; });
        kids.forEach(function (k) { board.appendChild(k); });
        board.classList.add('is-labelled');
        note.textContent = CUBE_NOTE;
        note.classList.add('is-shown');

        if (REDUCED) {
          axes.forEach(function (a) { a.classList.add('is-in'); });
          resolve();
          return;
        }

        tiles.forEach(function (tile) {
          var a = before[tile._index], b = tile.getBoundingClientRect();
          tile.style.transition = 'none';
          tile.style.transform = 'translate(' + (a.left - b.left) + 'px,' +
                                                (a.top - b.top) + 'px)';
        });
        requestAnimationFrame(function () {
          tiles.forEach(function (tile) {
            tile.style.transition = 'transform 520ms cubic-bezier(.2,.7,.2,1)';
            tile.style.transform = '';
          });
          axes.forEach(function (a) { a.classList.add('is-in'); });
          setTimeout(function () {
            tiles.forEach(function (tile) { tile.style.transition = ''; });
            resolve();
          }, 560);
        });
      });
    }

    function labelFor(pair, cats, t) {
      var names = [];
      for (var k = 0; k < 2; k++) if ((pair >> k) & 1) names.push(t.categories[cats[k]]);
      return names.length ? names.join(' + ') : 'neither';
    }

    buildBoard();
    return { reset: function () { btnClear.click(); } };
  };

  /* Loader for the puzzle-picker page. */
  HC.mountLibrary = async function (root, dataUrl) {
    var picker = document.getElementById('hc-picker');
    var meta = document.getElementById('hc-meta');
    var data;
    try {
      var res = await fetch(dataUrl, { cache: 'no-cache' });
      data = await res.json();
    } catch (e) {
      root.innerHTML = '<p class="hc-status is-warn">Could not load puzzles.json. ' +
        'If you are opening the page from your file system, run a local server ' +
        '(<code>python3 -m http.server</code>) instead — the browser blocks both ' +
        'fetch and SHA-256 on <code>file://</code>.</p>';
      return;
    }
    var puzzles = (data && data.puzzles) || [];
    if (!puzzles.length) {
      root.innerHTML = '<p class="hc-status is-warn">No puzzles yet. Build one with the ' +
        'packer tool and add it to <code>assets/hyperconnections/puzzles.json</code>.</p>';
      return;
    }
    puzzles.forEach(function (p, i) {
      var o = document.createElement('option');
      o.value = String(i);
      o.textContent = p.title || ('Puzzle ' + p.id);
      picker.appendChild(o);
    });

    function load(i) {
      var p = puzzles[i];
      if (meta) meta.textContent = p.note || '';
      var url = new URL(location.href);
      url.searchParams.set('p', p.id);
      history.replaceState(null, '', url);
      root.innerHTML = '';
      HC.mount(root, { puzzle: p, mode: 'packed' });
    }

    var want = new URLSearchParams(location.search).get('p');
    var start = 0;
    puzzles.forEach(function (p, i) { if (want != null && String(p.id) === want) start = i; });
    picker.value = String(start);
    picker.addEventListener('change', function () { load(+picker.value); });
    load(start);
  };

})(typeof window !== 'undefined' ? window : globalThis);