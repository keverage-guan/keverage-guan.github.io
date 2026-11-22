/* Polyrhythm trainer — tap a:b with two keys and keep the streak alive.
 *
 * PR.mount(root, opts)
 *   opts: { leftKey, rightKey   (KeyboardEvent.code, default 'KeyD' / 'KeyK'),
 *           left, right         (beats per cycle for each hand, default 2 / 3),
 *           tempo               (cycles per minute, default 40),
 *           tolerance           (ms either side of the beat, default 60) }
 *
 * One cycle is the span in which the left hand plays `left` evenly spaced beats
 * and the right hand plays `right`; both hands share the downbeat. Every tap is
 * matched to the nearest beat of its own hand. A tap more than `tolerance` ms
 * from that beat, a second tap on the same beat, or a beat that passes with no
 * tap at all ends the streak.
 *
 * There is no count-in: your first tap is the downbeat, and from there the grid
 * runs at the set tempo. After a mistake, the next downbeat you tap restarts it.
 */
(function (global) {
  'use strict';

  var PR = global.PR = global.PR || {};

  var COUNTS = [1, 2, 3, 4, 5, 6, 7, 8, 9];
  var HAND = ['Left', 'Right'];
  var LOCKOUT_MS = 700;          // after a mistake, ignore taps this long
  var MAX_TAPS_DRAWN = 64;

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

  function field(label, control, suffix) {
    var wrap = el('label', 'pr-field');
    wrap.appendChild(el('span', 'pr-field-label', label));
    wrap.appendChild(control);
    if (suffix) wrap.appendChild(el('span', 'pr-field-label', suffix));
    return wrap;
  }

  function keyLabel(code, key) {
    if (key && key.length === 1 && key !== ' ') return key.toUpperCase();
    if (code === 'Space') return 'Space';
    if (/^Key[A-Z]$/.test(code)) return code.slice(3);
    if (/^Digit\d$/.test(code)) return code.slice(5);
    return key || code;
  }

  function isEditable(t) {
    if (!t || !t.tagName) return false;
    var tag = t.tagName;
    return tag === 'INPUT' || tag === 'SELECT' || tag === 'TEXTAREA' || t.isContentEditable;
  }

  function eventTime(e) {
    var now = performance.now();
    var ts = e && e.timeStamp;
    // Modern browsers stamp events on the performance.now() clock; fall back if not.
    if (typeof ts === 'number' && ts > 0 && Math.abs(now - ts) < 1000) return ts;
    return now;
  }

  function mod(a, n) { return ((a % n) + n) % n; }

  function clampInt(v, lo, hi, dflt) {
    v = Math.round(Number(v));
    if (!isFinite(v)) return dflt;
    return Math.min(hi, Math.max(lo, v));
  }

  PR.mount = function (root, opts) {
    opts = opts || {};

    var cfg = {
      keys: [opts.leftKey || 'KeyD', opts.rightKey || 'KeyK'],
      labels: [],
      n: [opts.left || 2, opts.right || 3],
      tempo: opts.tempo || 40,
      tolerance: opts.tolerance || 60,
    };
    cfg.labels = [keyLabel(cfg.keys[0]), keyLabel(cfg.keys[1])];

    var st = {
      running: false,
      waiting: false,     // waiting for a downbeat
      fresh: true,        // waiting with no grid yet (draw the static pattern)
      lockUntil: 0,
      frozenAt: 0,
      t0: 0,
      T: 60000 / cfg.tempo,
      armed: true,
      next: [0, 0],
      slots: [{}, {}],    // beat index -> 'hit' | 'miss' | 'bad'
      taps: [],
      streak: 0,
      best: 0,
      bestLabel: '',
    };

    var listening = null;   // hand whose key is being rebound
    var raf = null;
    var actx = null;

    root.innerHTML = '';
    root.classList.add('pr');

    /* ---- controls ---------------------------------------------------------- */
    var controls = el('div', 'pr-controls');

    var keyBtns = [0, 1].map(function (h) {
      var b = el('button', 'pr-btn pr-key');
      b.type = 'button';
      b.addEventListener('click', function () {
        stop();
        listening = h;
        refreshKeys();
      });
      return b;
    });

    var countSels = [0, 1].map(function (h) {
      var s = el('select', 'pr-select');
      COUNTS.forEach(function (c) { addOption(s, c, String(c)); });
      s.value = String(cfg.n[h]);
      s.addEventListener('change', function () {
        cfg.n[h] = Number(s.value);
        settingsChanged();
      });
      return s;
    });

    var tempoIn = el('input', 'pr-input');
    tempoIn.type = 'number'; tempoIn.min = '6'; tempoIn.max = '200'; tempoIn.step = '1';
    tempoIn.value = String(cfg.tempo);
    tempoIn.addEventListener('change', function () {
      cfg.tempo = clampInt(tempoIn.value, 6, 200, 40);
      tempoIn.value = String(cfg.tempo);
      settingsChanged();
    });

    var tolIn = el('input', 'pr-input');
    tolIn.type = 'number'; tolIn.min = '5'; tolIn.max = '250'; tolIn.step = '5';
    tolIn.value = String(cfg.tolerance);
    tolIn.addEventListener('change', function () {
      cfg.tolerance = clampInt(tolIn.value, 5, 250, 60);
      tolIn.value = String(cfg.tolerance);
      settingsChanged();
    });

    // The ratio and Start live in the toolbar; everything else is in Settings.
    var toolbar = el('div', 'pr-toolbar');
    var ratio = el('div', 'pr-ratio');
    ratio.appendChild(countSels[0]);
    ratio.appendChild(el('span', 'pr-ratio-sep', 'against'));
    ratio.appendChild(countSels[1]);
    countSels[0].setAttribute('aria-label', 'Left-hand beats per cycle');
    countSels[1].setAttribute('aria-label', 'Right-hand beats per cycle');

    var startBtn = el('button', 'pr-btn pr-btn-primary', 'Start');
    startBtn.type = 'button';
    startBtn.addEventListener('click', function () {
      startBtn.blur();
      if (st.running) stop(); else start();
    });

    var gearBtn = el('button', 'pr-btn pr-btn-quiet', 'Settings');
    gearBtn.type = 'button';
    gearBtn.setAttribute('aria-expanded', 'false');

    var toolEnd = el('div', 'pr-toolbar-end');
    toolEnd.appendChild(startBtn);
    toolEnd.appendChild(gearBtn);
    toolbar.appendChild(ratio);
    toolbar.appendChild(toolEnd);

    var panel = el('div', 'pr-settings');
    panel.hidden = true;
    gearBtn.addEventListener('click', function () {
      gearBtn.blur();
      panel.hidden = !panel.hidden;
      gearBtn.setAttribute('aria-expanded', String(!panel.hidden));
      gearBtn.classList.toggle('is-on', !panel.hidden);
    });

    var grid = el('div', 'pr-settings-grid');
    grid.appendChild(field('Left key', keyBtns[0]));
    grid.appendChild(field('Right key', keyBtns[1]));
    grid.appendChild(field('Tempo', tempoIn, 'cycles/min'));
    grid.appendChild(field('Tolerance \u00b1', tolIn, 'ms'));
    panel.appendChild(grid);
    var meta = el('div', 'pr-meta');
    panel.appendChild(meta);
    panel.appendChild(el('div', 'pr-meta', 'Space starts and stops \u00b7 Esc stops'));

    controls.appendChild(toolbar);
    controls.appendChild(panel);

    /* ---- stage ------------------------------------------------------------- */
    var stage = el('div', 'pr-stage');

    var scores = el('div', 'pr-scores');
    function score(label) {
      var box = el('div', 'pr-score');
      var num = el('div', 'pr-score-num', '0');
      var lbl = el('div', 'pr-score-label', label);
      box.appendChild(num);
      box.appendChild(lbl);
      scores.appendChild(box);
      return { num: num, lbl: lbl };
    }
    var streakS = score('streak');
    var bestS = score('best');
    var streakNum = streakS.num, bestNum = bestS.num, bestLbl = bestS.lbl;
    streakS.num.parentNode.classList.add('pr-score-streak');

    var status = el('div', 'pr-status');
    status.setAttribute('role', 'status');
    status.setAttribute('aria-live', 'polite');

    var canvas = el('canvas', 'pr-canvas');
    canvas.setAttribute('aria-hidden', 'true');

    // Tap pads, shown only on touch screens (see the CSS).
    var pads = el('div', 'pr-pads');
    var padEls = [0, 1].map(function (h) {
      var p = el('button', 'pr-pad pr-pad-' + (h ? 'right' : 'left'));
      p.type = 'button';
      p.tabIndex = -1;
      p.addEventListener('pointerdown', function (e) {
        e.preventDefault();
        onTap(h, eventTime(e));
      });
      pads.appendChild(p);
      return p;
    });

    var track = el('div', 'pr-track');
    track.appendChild(canvas);
    track.appendChild(pads);
    var side = el('div', 'pr-side');
    side.appendChild(scores);
    side.appendChild(status);
    stage.appendChild(track);
    stage.appendChild(side);

    root.appendChild(controls);
    root.appendChild(stage);

    /* ---- timing helpers ---------------------------------------------------- */
    function maxN() { return Math.max(cfg.n[0], cfg.n[1]); }

    // A tolerance wider than half the gap between one hand's beats would make
    // "which beat was that?" ambiguous, so cap it there.
    function tolCap(T) { return Math.floor(T / (2 * maxN())) - 1; }
    function tolMs() { return Math.max(5, Math.min(cfg.tolerance, tolCap(st.T))); }

    function slotTime(h, j) { return st.t0 + st.T * j / cfg.n[h]; }

    /* ---- sound ------------------------------------------------------------- */
    function audio() {
      if (!actx) {
        var AC = global.AudioContext || global.webkitAudioContext;
        if (!AC) return null;
        try { actx = new AC(); } catch (e) { return null; }
      }
      if (actx.state === 'suspended' && actx.resume) actx.resume();
      return actx;
    }

    function latencyMs() {
      if (!actx) return 0;
      return 1000 * (actx.outputLatency || actx.baseLatency || 0);
    }

    // Play a short tone so that it reaches the speakers at performance time t.
    function blip(t, freq, gain, dur, type) {
      if (!actx) return;
      var at = actx.currentTime + (t - performance.now() - latencyMs()) / 1000;
      at = Math.max(actx.currentTime, at);
      var o = actx.createOscillator();
      var g = actx.createGain();
      o.type = type || 'triangle';
      o.frequency.value = freq;
      g.gain.setValueAtTime(0.0001, at);
      g.gain.exponentialRampToValueAtTime(gain, at + 0.002);
      g.gain.exponentialRampToValueAtTime(0.0001, at + dur);
      o.connect(g);
      g.connect(actx.destination);
      o.start(at);
      o.stop(at + dur + 0.02);
    }

    function buzz() {
      if (!actx) return;
      blip(performance.now() + latencyMs(), 140, 0.18, 0.22, 'sawtooth');
    }

    /* ---- game flow --------------------------------------------------------- */
    function resetRun() {
      st.armed = true;
      st.next = [0, 0];
      st.slots = [{}, {}];
      st.taps = [];
      st.streak = 0;
      renderScore();
    }

    function start() {
      stop();
      audio();
      st.running = true;
      st.T = 60000 / cfg.tempo;
      resetRun();
      st.waiting = true;
      st.fresh = true;
      st.lockUntil = 0;
      say('Tap the downbeat \u2014 both hands together \u2014 to begin.', '');
      startBtn.textContent = 'Stop';
      kick();
    }

    function stop() {
      if (raf) { cancelAnimationFrame(raf); raf = null; }
      var was = st.running;
      st.running = false;
      st.waiting = false;
      st.streak = 0;
      st.taps = [];
      st.slots = [{}, {}];
      renderScore();
      startBtn.textContent = 'Start';
      if (was) {
        say('Stopped.', '');
      }
      draw();
    }

    function fail(t, msg) {
      st.streak = 0;
      st.armed = false;
      st.waiting = true;
      st.fresh = false;
      st.frozenAt = t;
      st.lockUntil = t + LOCKOUT_MS;
      renderScore();
      say(msg + ' Tap a downbeat to restart.', 'error');
      flashError();
      buzz();
    }

    function checkMisses(now) {
      if (!st.running || st.waiting || !st.armed) return;
      var tol = tolMs();
      for (var h = 0; h < 2; h++) {
        for (;;) {
          var j = st.next[h];
          if (slotTime(h, j) + tol >= now) break;
          st.next[h]++;
          if (st.slots[h][j] === 'hit') continue;
          st.slots[h][j] = 'miss';
          fail(now, 'Missed a ' + HAND[h].toLowerCase() + '-hand beat.');
          return;
        }
      }
    }

    function onTap(h, t) {
      flashPad(h);
      audio();

      if (!st.running) start();

      if (st.waiting) {
        if (t < st.lockUntil) return;
        st.waiting = false;
        st.fresh = false;
        st.t0 = t;            // this tap is the downbeat
        resetRun();
        say(' ', '');
      }

      checkMisses(t);
      if (!st.running || st.waiting) return;

      var n = cfg.n[h];
      var tol = tolMs();
      var j = Math.round((t - st.t0) / st.T * n);
      if (j < 0) return;

      var err = t - slotTime(h, j);
      var tap = { h: h, t: t, ok: false };
      st.taps.push(tap);
      if (st.taps.length > MAX_TAPS_DRAWN) st.taps.shift();

      if (Math.abs(err) > tol) {
        if (!st.slots[h][j]) st.slots[h][j] = 'bad';
        fail(t, HAND[h] + ' hand ' + Math.round(Math.abs(err)) + ' ms ' +
          (err < 0 ? 'early' : 'late') + '.');
        return;
      }
      if (st.slots[h][j] === 'hit') {
        fail(t, 'Extra ' + HAND[h].toLowerCase() + '-hand tap.');
        return;
      }

      st.slots[h][j] = 'hit';
      tap.ok = true;

      st.next[h] = Math.max(st.next[h], j + 1);

      st.streak++;
      if (st.streak > st.best) {
        st.best = st.streak;
        st.bestLabel = cfg.n[0] + ':' + cfg.n[1];
      }

      renderScore();
    }

    /* ---- feedback ---------------------------------------------------------- */
    function say(msg, kind) {
      status.textContent = msg || ' ';
      status.classList.toggle('is-error', kind === 'error');
    }

    function renderScore() {
      streakNum.textContent = String(st.streak);
      bestNum.textContent = String(st.best);
      bestLbl.textContent = st.best ? 'best (' + st.bestLabel + ')' : 'best';
    }

    function flashError() {
      stage.classList.remove('is-error');
      void stage.offsetWidth;          // restart the animation
      stage.classList.add('is-error');
    }
    stage.addEventListener('animationend', function (e) {
      if (e.target === stage) stage.classList.remove('is-error');
    });

    function flashPad(h) {
      var p = padEls[h];
      p.classList.add('is-down');
      clearTimeout(p._t);
      p._t = setTimeout(function () { p.classList.remove('is-down'); }, 90);
    }

    function refreshKeys() {
      [0, 1].forEach(function (h) {
        var b = keyBtns[h];
        var on = listening === h;
        b.textContent = on ? 'press a key…' : cfg.labels[h];
        b.classList.toggle('is-listening', on);
        padEls[h].innerHTML = '';
        padEls[h].appendChild(el('span', 'pr-pad-hand', HAND[h]));
        padEls[h].appendChild(el('kbd', 'pr-pad-key', cfg.labels[h]));
      });
      draw();
    }

    function updateMeta() {
      var T = 60000 / cfg.tempo;
      var cap = tolCap(T);
      var txt = cfg.n[0] + ' against ' + cfg.n[1] +
        ' · one cycle = ' + (T / 1000).toFixed(2) + ' s' +
        ' · left ' + Math.round(cfg.tempo * cfg.n[0]) + ' bpm, right ' +
        Math.round(cfg.tempo * cfg.n[1]) + ' bpm';
      if (cfg.tolerance > cap) {
        txt += ' · tolerance capped at ±' + Math.max(5, cap) + ' ms at this tempo';
      }
      meta.textContent = txt;
    }

    function settingsChanged() {
      stop();
      st.T = 60000 / cfg.tempo;
      updateMeta();
      say('Tap the downbeat \u2014 both hands together \u2014 to begin.', '');
      draw();
    }

    /* ---- drawing ----------------------------------------------------------- */
    var colors = null;
    function readColors() {
      var cs = getComputedStyle(root);
      function v(name, d) { return (cs.getPropertyValue(name) || '').trim() || d; }
      colors = {
        hand: [v('--pr-left', '#2f6fd0'), v('--pr-right', '#2f7d5b')],
        bad: v('--pr-bad', '#c8384a'),
        line: v('--pr-line', 'rgba(128,128,140,0.35)'),
        text: cs.color || '#111',
      };
    }
    if (global.matchMedia) {
      var mq = global.matchMedia('(prefers-color-scheme: dark)');
      var onScheme = function () { colors = null; draw(); };
      if (mq.addEventListener) mq.addEventListener('change', onScheme);
      else if (mq.addListener) mq.addListener(onScheme);
    }

    // Time runs down the page: beats fall from the top toward the hit line,
    // with the left hand in the left column and the right hand in the right.
    var CANVAS_H = 340;
    function draw(now) {
      var dpr = global.devicePixelRatio || 1;
      var w = canvas.clientWidth || 300;
      var hgt = CANVAS_H;
      if (canvas.width !== Math.round(w * dpr) || canvas.height !== Math.round(hgt * dpr)) {
        canvas.width = Math.round(w * dpr);
        canvas.height = Math.round(hgt * dpr);
      }
      if (!colors) readColors();
      var g = canvas.getContext('2d');
      g.setTransform(dpr, 0, 0, dpr, 0, 0);
      g.clearRect(0, 0, w, hgt);

      var t0, T, view, live;
      if (!st.running || (st.waiting && st.fresh)) {
        T = st.running ? st.T : 60000 / cfg.tempo;
        t0 = 0; view = 0; live = false;
      } else if (st.waiting) {
        t0 = st.t0; T = st.T; view = st.frozenAt; live = true;
      } else {
        t0 = st.t0; T = st.T; view = now != null ? now : performance.now(); live = true;
      }

      var top = 6, labelH = 26, bottom = hgt - labelH;
      var plotH = bottom - top;
      var W = 1.5 * T;                      // a cycle ahead (above), half a cycle behind (below)
      var tStart = view - W / 3;
      var Y = function (t) { return bottom - (t - tStart) / W * plotH; };
      var lanes = [w * 0.27, w * 0.73];
      var half = Math.min(60, w * 0.16);    // half-width of a lane's tick

      // lanes and key labels
      g.lineWidth = 1;
      g.strokeStyle = colors.line;
      g.font = '600 13px system-ui, -apple-system, sans-serif';
      g.textAlign = 'center';
      g.textBaseline = 'middle';
      for (var h = 0; h < 2; h++) {
        g.beginPath();
        g.moveTo(lanes[h], top);
        g.lineTo(lanes[h], bottom);
        g.stroke();
        g.fillStyle = colors.hand[h];
        g.fillText(HAND[h] + ' · ' + cfg.labels[h], lanes[h], hgt - labelH / 2);
      }

      g.save();
      g.beginPath();
      g.rect(0, top - 2, w, plotH + 4);
      g.clip();

      // a faint line at each downbeat
      var c0 = Math.floor((tStart - t0) / T) - 1;
      var c1 = Math.ceil((tStart + W - t0) / T) + 1;
      g.strokeStyle = colors.line;
      g.setLineDash([3, 4]);
      for (var c = c0; c <= c1; c++) {
        var by = Y(t0 + c * T);
        g.beginPath();
        g.moveTo(10, by);
        g.lineTo(w - 10, by);
        g.stroke();
      }
      g.setLineDash([]);

      // beats
      for (h = 0; h < 2; h++) {
        var n = cfg.n[h];
        var j0 = Math.floor((tStart - t0) / T * n) - 1;
        var j1 = Math.ceil((tStart + W - t0) / T * n) + 1;
        for (var j = j0; j <= j1; j++) {
          var t = t0 + T * j / n;
          var x = lanes[h], y = Y(t);
          var r = mod(j, n) === 0 ? 10 : 7.5;
          var state = live ? st.slots[h][j] : null;
          var stale = live && !state && t < view;
          g.globalAlpha = stale ? 0.35 : 1;
          g.beginPath();
          g.arc(x, y, r, 0, 2 * Math.PI);
          if (state === 'hit') {
            g.fillStyle = colors.hand[h];
            g.fill();
          } else if (state === 'miss' || state === 'bad') {
            g.lineWidth = 2.5;
            g.strokeStyle = colors.bad;
            g.stroke();
            g.beginPath();
            g.moveTo(x - r * 0.55, y - r * 0.55); g.lineTo(x + r * 0.55, y + r * 0.55);
            g.moveTo(x + r * 0.55, y - r * 0.55); g.lineTo(x - r * 0.55, y + r * 0.55);
            g.stroke();
          } else {
            g.lineWidth = 2;
            g.strokeStyle = colors.hand[h];
            g.stroke();
          }
        }
      }
      g.globalAlpha = 1;

      // where you actually tapped
      if (live) {
        g.lineWidth = 2.5;
        st.taps.forEach(function (tp) {
          var ty = Y(tp.t);
          if (ty < top - 2 || ty > bottom + 2) return;
          g.strokeStyle = tp.ok ? colors.hand[tp.h] : colors.bad;
          g.beginPath();
          g.moveTo(lanes[tp.h] - half, ty);
          g.lineTo(lanes[tp.h] + half, ty);
          g.stroke();
        });
      }

      // the hit line
      var py = Y(view);
      g.strokeStyle = colors.text;
      g.globalAlpha = 0.65;
      g.lineWidth = 1.5;
      g.beginPath();
      g.moveTo(4, py);
      g.lineTo(w - 4, py);
      g.stroke();
      g.globalAlpha = 1;
      g.restore();
    }

    function frame() {
      raf = null;
      if (!st.running) { draw(); return; }
      var now = performance.now();
      checkMisses(now);
      draw(now);
      raf = requestAnimationFrame(frame);
    }

    function kick() { if (!raf) raf = requestAnimationFrame(frame); }

    /* ---- keyboard ---------------------------------------------------------- */
    document.addEventListener('keydown', function (e) {
      if (!root.isConnected) return;

      if (listening !== null) {
        e.preventDefault();
        var h = listening;
        listening = null;
        if (e.code !== 'Escape') {
          var lbl = keyLabel(e.code, e.key);
          if (e.code === cfg.keys[1 - h]) {          // taking the other hand's key: swap
            cfg.keys[1 - h] = cfg.keys[h];
            cfg.labels[1 - h] = cfg.labels[h];
          }
          cfg.keys[h] = e.code;
          cfg.labels[h] = lbl;
        }
        refreshKeys();
        return;
      }

      if (isEditable(e.target)) return;
      if (e.ctrlKey || e.metaKey || e.altKey) return;

      var hand = cfg.keys.indexOf(e.code);
      if (hand >= 0) {
        e.preventDefault();
        if (!e.repeat) onTap(hand, eventTime(e));
        return;
      }
      if (e.code === 'Escape') {
        if (st.running) stop();
        return;
      }
      if (e.code === 'Space') {
        var tag = e.target && e.target.tagName;
        if (tag === 'BUTTON' || tag === 'A') return;   // let the focused control have it
        e.preventDefault();
        if (!e.repeat) { if (st.running) stop(); else start(); }
      }
    });

    // Timers are throttled in background tabs, so don't pretend to keep time there.
    document.addEventListener('visibilitychange', function () {
      if (document.hidden && st.running) stop();
    });

    global.addEventListener('resize', function () { if (!st.running) draw(); });

    /* ---- go ---------------------------------------------------------------- */
    refreshKeys();
    updateMeta();
    renderScore();
    say('Tap the downbeat \u2014 both hands together \u2014 to begin.', '');
    draw();

    return { start: start, stop: stop, _state: st, _cfg: cfg };
  };
})(window);
