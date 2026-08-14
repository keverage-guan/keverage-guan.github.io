/* Transversal achievement game — board, controls, and the glue to the bots.
 * Requires transversal-core.js.
 *
 * TV.mount(root, opts)     the playable board
 * TV.showcase(root, spec)  a static board, for figures on the how-to-play page
 */
(function (global) {
  'use strict';

  var TV = global.TV;
  if (!TV) throw new Error('transversal-core.js must load before transversal-game.js');

  var THINK_MS = 380;                 // pause before the computer replies
  var SIZES = [1, 2, 3, 4, 5, 6, 7, 8, 9, 10];

  var DEFAULT_NOTE =
    'The board is the complete bipartite graph <em>K</em><sub>n,n</sub>: the rows and ' +
    'the columns are the two vertex classes, and the cell (<em>r</em>,&nbsp;<em>c</em>) is ' +
    'the edge joining row <em>r</em> to column <em>c</em>. A set of cells with no two in a ' +
    'line is then exactly a matching, and a transversal is a perfect matching — so the game ' +
    'is a race to assemble a perfect matching of <em>K</em><sub>n,n</sub> out of edges you ' +
    'claim one at a time.';

  function el(tag, cls, txt) {
    var e = document.createElement(tag);
    if (cls) e.className = cls;
    if (txt != null) e.textContent = txt;
    return e;
  }

  function addOption(sel, value, label) {
    var o = document.createElement('option');
    o.value = String(value);
    o.textContent = label;
    sel.appendChild(o);
    return o;
  }

  function field(label, control) {
    var wrap = el('label', 'tv-field');
    wrap.appendChild(el('span', 'tv-field-label', label));
    wrap.appendChild(control);
    return wrap;
  }

  function glyph(v) { return v === TV.X ? 'X' : (v === TV.O ? 'O' : ''); }

  /* ---- the playable board -------------------------------------------------
   * opts: { size, mode: 'two'|'bot', level, sizes, notes }
   * notes maps a board size (or 'default') to an HTML string shown under the
   * board — the commentary slot.
   */
  TV.mount = function (root, opts) {
    opts = opts || {};
    var sizes = opts.sizes || SIZES;
    var notes = opts.notes || {};

    var settings = {
      n: opts.size || 5,
      mode: opts.mode || 'two',
      human: TV.X,
      level: opts.level || 'medium',
      showThreats: false
    };

    var game = TV.newGame(settings.n);
    var cellEls = [];
    var builtN = 0;
    var thinking = false;
    var timer = null;
    var gen = 0;

    root.innerHTML = '';
    root.classList.add('tv');

    /* controls */
    var controls = el('div', 'tv-controls');

    var sizeSel = el('select', 'tv-select');
    sizes.forEach(function (s) { addOption(sizeSel, s, s + ' \u00d7 ' + s); });
    sizeSel.value = String(settings.n);

    var modeSel = el('select', 'tv-select');
    addOption(modeSel, 'two', 'Two players');
    addOption(modeSel, 'bot', 'Play the computer');
    modeSel.value = settings.mode;

    var sideSel = el('select', 'tv-select');
    addOption(sideSel, 'X', 'X (first)');
    addOption(sideSel, 'O', 'O (second)');

    var levelSel = el('select', 'tv-select');
    addOption(levelSel, 'easy', 'Easy');
    addOption(levelSel, 'medium', 'Medium');
    addOption(levelSel, 'hard', 'Hard');
    levelSel.value = settings.level;

    var sideField = field('You play', sideSel);
    var levelField = field('Difficulty', levelSel);

    controls.appendChild(field('Board', sizeSel));
    controls.appendChild(field('Game', modeSel));
    controls.appendChild(sideField);
    controls.appendChild(levelField);
    root.appendChild(controls);

    /* board */
    var board = el('div', 'tv-board');
    board.setAttribute('role', 'grid');
    root.appendChild(board);

    /* status and actions */
    var status = el('p', 'tv-status');
    status.setAttribute('role', 'status');
    root.appendChild(status);

    var actions = el('div', 'tv-actions');
    var btnNew = el('button', 'tv-btn tv-btn-primary', 'New game');
    var btnUndo = el('button', 'tv-btn', 'Undo move');
    btnNew.type = btnUndo.type = 'button';
    actions.appendChild(btnNew);
    actions.appendChild(btnUndo);

    var threatBox = el('label', 'tv-toggle');
    var threatInput = document.createElement('input');
    threatInput.type = 'checkbox';
    threatBox.appendChild(threatInput);
    threatBox.appendChild(el('span', null, 'Mark threatened cells'));
    actions.appendChild(threatBox);
    root.appendChild(actions);

    var note = el('div', 'tv-note');
    root.appendChild(note);

    /* ---- rendering ---- */

    function buildBoard() {
      board.innerHTML = '';
      cellEls = [];
      board.style.setProperty('--tv-n', game.n);
      for (var i = 0; i < game.n * game.n; i++) {
        (function (idx) {
          var b = el('button', 'tv-cell');
          b.type = 'button';
          b.appendChild(el('span', 'tv-mark'));
          b.addEventListener('click', function () { clickCell(idx); });
          board.appendChild(b);
          cellEls.push(b);
        })(i);
      }
      builtN = game.n;
    }

    function statusText() {
      if (game.winner) {
        return glyph(game.winner) + ' wins with a transversal on ply ' + game.history.length + '.';
      }
      if (game.over) return 'Draw \u2014 the board is full and neither player has a transversal.';
      if (thinking) return 'Computer is thinking\u2026';
      var who = glyph(game.turn);
      if (settings.mode === 'bot') {
        who += game.turn === settings.human ? ' (you)' : ' (computer)';
      }
      return who + ' to move \u00b7 ply ' + (game.history.length + 1);
    }

    function paint() {
      if (builtN !== game.n) buildBoard();

      var isBot = settings.mode === 'bot';
      sideField.classList.toggle('is-hidden', !isBot);
      levelField.classList.toggle('is-hidden', !isBot);

      var winSet = {};
      (game.winCells || []).forEach(function (i) { winSet[i] = true; });

      var threatSet = {};
      if (settings.showThreats && !game.over) {
        TV.threats(game, game.turn).forEach(function (i) { threatSet[i] = true; });
      }

      var frozen = game.over || thinking || (isBot && game.turn !== settings.human);

      cellEls.forEach(function (b, i) {
        var v = game.cells[i];
        b.classList.toggle('is-x', v === TV.X);
        b.classList.toggle('is-o', v === TV.O);
        b.classList.toggle('is-win', !!winSet[i]);
        b.classList.toggle('is-threat', !!threatSet[i]);
        b.querySelector('.tv-mark').textContent = glyph(v);
        b.disabled = !!v || frozen;
        b.setAttribute('aria-label',
          'Row ' + (TV.rowOf(game, i) + 1) + ', column ' + (TV.colOf(game, i) + 1) +
          ': ' + (v ? glyph(v) : 'empty'));
      });

      status.textContent = statusText();
      status.className = 'tv-status' +
        (game.winner ? ' is-won' : '') +
        (!game.over ? (game.turn === TV.X ? ' is-x-turn' : ' is-o-turn') : '');

      btnUndo.disabled = !game.history.length || thinking;

      note.innerHTML = notes[game.n] || notes['default'] || DEFAULT_NOTE;
      note.classList.toggle('is-empty', !note.innerHTML);
    }

    /* ---- play ---- */

    function cancelPending() {
      gen++;
      if (timer) { clearTimeout(timer); timer = null; }
      thinking = false;
    }

    function scheduleBot() {
      if (settings.mode !== 'bot' || game.over) return;
      if (game.turn === settings.human) return;
      thinking = true;
      paint();
      var mine = ++gen;
      timer = setTimeout(function () {
        if (mine !== gen) return;
        var move = TV.botMove(game, game.turn, settings.level);
        thinking = false;
        timer = null;
        if (move != null) TV.play(game, move);
        paint();
      }, THINK_MS);
    }

    function clickCell(i) {
      if (game.over || thinking) return;
      if (settings.mode === 'bot' && game.turn !== settings.human) return;
      if (!TV.play(game, i)) return;
      paint();
      scheduleBot();
    }

    function newGame() {
      cancelPending();
      game = TV.newGame(settings.n);
      paint();
      scheduleBot();
    }

    /* ---- wiring ---- */

    sizeSel.addEventListener('change', function () {
      settings.n = +sizeSel.value;
      newGame();
    });

    modeSel.addEventListener('change', function () {
      settings.mode = modeSel.value;
      newGame();
    });

    sideSel.addEventListener('change', function () {
      settings.human = sideSel.value === 'O' ? TV.O : TV.X;
      newGame();
    });

    levelSel.addEventListener('change', function () {
      settings.level = levelSel.value;
      newGame();
    });

    threatInput.addEventListener('change', function () {
      settings.showThreats = threatInput.checked;
      paint();
    });

    btnNew.addEventListener('click', newGame);

    btnUndo.addEventListener('click', function () {
      cancelPending();
      if (!TV.undo(game)) { paint(); return; }
      // In a game against the computer, step back to the player's own turn.
      if (settings.mode === 'bot') {
        while (game.history.length && game.turn !== settings.human) TV.undo(game);
      }
      paint();
      scheduleBot();
    });

    buildBoard();
    paint();
    scheduleBot();

    return { newGame: newGame, state: function () { return game; } };
  };

  /* ---- static figures -----------------------------------------------------
   * spec: { n, x, o, mark, threat, caption }, every cell given as [row, col]
   * with rows and columns numbered from 1.
   */
  TV.showcase = function (root, spec) {
    var n = spec.n;
    root.innerHTML = '';
    root.classList.add('tv', 'tv-figure');

    var vals = new Array(n * n).fill(0);
    var mark = {}, threat = {};
    (spec.x || []).forEach(function (p) { vals[(p[0] - 1) * n + (p[1] - 1)] = TV.X; });
    (spec.o || []).forEach(function (p) { vals[(p[0] - 1) * n + (p[1] - 1)] = TV.O; });
    (spec.mark || []).forEach(function (p) { mark[(p[0] - 1) * n + (p[1] - 1)] = true; });
    (spec.threat || []).forEach(function (p) { threat[(p[0] - 1) * n + (p[1] - 1)] = true; });

    var board = el('div', 'tv-board is-static');
    board.style.setProperty('--tv-n', n);
    for (var i = 0; i < n * n; i++) {
      var c = el('div', 'tv-cell' +
        (vals[i] === TV.X ? ' is-x' : (vals[i] === TV.O ? ' is-o' : '')) +
        (mark[i] ? ' is-win' : '') +
        (threat[i] ? ' is-threat' : ''));
      c.appendChild(el('span', 'tv-mark', glyph(vals[i])));
      board.appendChild(c);
    }
    root.appendChild(board);

    if (spec.caption) {
      var cap = el('p', 'tv-caption');
      cap.innerHTML = spec.caption;
      root.appendChild(cap);
    }
  };

})(typeof window !== 'undefined' ? window : globalThis);