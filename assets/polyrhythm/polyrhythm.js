/* Polyrhythm trainer — tap a:b with two keys and keep the streak alive.
 *
 * PR.mount(root, opts)
 *   opts: { leftKey, rightKey   (KeyboardEvent.code, default 'KeyD' / 'KeyK'),
 *           left, right         (beats per cycle for each hand, default 2 / 3),
 *           tempo               (cycles per minute, default 40),
 *           tolerance           (ms either side of the beat, default 60),
 *           mode                ('metro' | 'free'),
 *           click               ('all' | 'down' | 'off') }
 *
 * One cycle is the span in which the left hand plays `left` evenly spaced beats
 * and the right hand plays `right`; both hands share the downbeat. Every tap is
 * matched to the nearest beat of its own hand. A tap more than `tolerance` ms
 * from that beat, a second tap on the same beat, or a beat that passes with no
 * tap at all ends the streak.
 *
 *   metro  a metronome fixes the grid; one cycle of count-in, then play.
 *   free   no click; your first tap is the downbeat and the grid follows your
 *          tempo (a least-squares fit over your recent taps), so slow drift is
 *          fine but uneven spacing is not.
 */
(function (global) {
  'use strict';

  var PR = global.PR = global.PR || {};

  var COUNTS = [1, 2, 3, 4, 5, 6, 7, 8, 9];
  var HAND = ['Left', 'Right'];
  var LOOKAHEAD_MS = 150;        // how far ahead the metronome is scheduled
  var TICK_MS = 25;              // scheduler period
  var LEAD_MS = 300;             // gap between pressing Start and the count-in
  var FREE_LOCKOUT_MS = 700;     // after an error in free mode, ignore taps this long
  var FIT_POINTS = 16;           // taps used to fit the tempo in free mode
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
      mode: opts.mode || 'metro',
      click: opts.click || 'all',
    };
    cfg.labels = [keyLabel(cfg.keys[0]), keyLabel(cfg.keys[1])];

    var st = {
      running: false,
      waiting: false,     // free mode: waiting for a downbeat
      fresh: true,        // waiting with no grid yet (draw the static pattern)
      lockUntil: 0,
      frozenAt: 0,
      countin: false,
      t0: 0,
      T: 60000 / cfg.tempo,
      armed: true,
      next: [0, 0],
      slots: [{}, {}],    // beat index -> 'hit' | 'miss' | 'bad'
      taps: [],
      fit: [],
      sched: [0, 0],
      streak: 0,
      best: 0,
      bestLabel: '',
    };

    var listening = null;   // hand whose key is being rebound
    var timer = null;
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

    var modeSel = el('select', 'pr-select');
    addOption(modeSel, 'metro', 'Metronome');
    addOption(modeSel, 'free', 'Follow me');
    modeSel.value = cfg.mode;
    modeSel.addEventListener('change', function () {
      cfg.mode = modeSel.value;
      settingsChanged();
    });

    var clickSel = el('select', 'pr-select');
    addOption(clickSel, 'all', 'Every beat');
    addOption(clickSel, 'down', 'Downbeat only');
    addOption(clickSel, 'off', 'Off');
    clickSel.value = cfg.click;
    clickSel.addEventListener('change', function () {
      cfg.click = clickSel.value;
      settingsChanged();
    });

    var row1 = el('div', 'pr-row');
    row1.appendChild(field('Left key', keyBtns[0]));
    row1.appendChild(field('Left beats', countSels[0]));
    row1.appendChild(field('Right beats', countSels[1]));
    row1.appendChild(field('Right key', keyBtns[1]));

    var clickField = field('Click', clickSel);
    var row2 = el('div', 'pr-row');
    row2.appendChild(field('Tempo', tempoIn, 'cycles/min'));
    row2.appendChild(field('Tolerance ±', tolIn, 'ms'));
    row2.appendChild(field('Timing', modeSel));
    row2.appendChild(clickField);

    controls.appendChild(row1);
    controls.appendChild(row2);

    var meta = el('div', 'pr-meta');

    /* ---- stage ------------------------------------------------------------- */
    var stage = el('div', 'pr-stage');

    var scores = el('div', 'pr-scores');
    var streakBox = el('div', 'pr-score pr-score-main');
    var streakNum = el('div', 'pr-score-num', '0');
    streakBox.appendChild(streakNum);
    streakBox.appendChild(el('div', 'pr-score-label', 'streak'));
    var bestBox = el('div', 'pr-score');
    var bestNum = el('div', 'pr-score-num', '0');
    var bestLbl = el('div', 'pr-score-label', 'best this session');
    bestBox.appendChild(bestNum);
    bestBox.appendChild(bestLbl);
    scores.appendChild(streakBox);
    scores.appendChild(bestBox);

    var status = el('div', 'pr-status');
    status.setAttribute('role', 'status');
    status.setAttribute('aria-live', 'polite');
    var offset = el('div', 'pr-offset', ' ');

    var canvas = el('canvas', 'pr-canvas');
    canvas.setAttribute('aria-hidden', 'true');

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

    var actions = el('div', 'pr-actions');
    var startBtn = el('button', 'pr-btn pr-btn-primary', 'Start');
    startBtn.type = 'button';
    startBtn.addEventListener('click', function () {
      startBtn.blur();
      if (st.running) stop(); else start();
    });
    actions.appendChild(startBtn);
    actions.appendChild(el('span', 'pr-hint', 'Space to start or stop · Esc to stop'));

    stage.appendChild(scores);
    stage.appendChild(status);
    stage.appendChild(offset);
    stage.appendChild(canvas);
    stage.appendChild(pads);

    root.appendChild(controls);
    root.appendChild(meta);
    root.appendChild(stage);
    root.appendChild(actions);

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

    function schedule() {
      if (!st.running || cfg.mode !== 'metro' || !actx) return;
      var horizon = performance.now() + LOOKAHEAD_MS + latencyMs();
      for (var h = 0; h < 2; h++) {
        var n = cfg.n[h];
        while (slotTime(h, st.sched[h]) < horizon) {
          var j = st.sched[h]++;
          var t = slotTime(h, j);
          // The count-in is always audible, even with the click turned off.
          var click = j < 0 ? (cfg.click === 'down' ? 'down' : 'all') : cfg.click;
          if (click === 'off') continue;
          if (mod(j, n) === 0) {
            if (h === 0) blip(t, 1568, 0.45, 0.07);           // shared downbeat, once
          } else if (click === 'all') {
            blip(t, h === 0 ? 784 : 1175, 0.28, 0.045);       // left low, right high
          }
        }
      }
    }

    /* ---- game flow --------------------------------------------------------- */
    function resetRun() {
      st.armed = true;
      st.next = [0, 0];
      st.slots = [{}, {}];
      st.taps = [];
      st.fit = [];
      st.streak = 0;
      renderScore();
    }

    function start() {
      stop();
      audio();
      st.running = true;
      st.T = 60000 / cfg.tempo;
      resetRun();
      if (cfg.mode === 'metro') {
        st.waiting = false;
        st.t0 = performance.now() + LEAD_MS + latencyMs() + st.T;   // one cycle of count-in
        st.sched = [-cfg.n[0], -cfg.n[1]];
        st.countin = true;
        say('Count-in… come in on the downbeat.', '');
        timer = setInterval(schedule, TICK_MS);
        schedule();
      } else {
        st.waiting = true;
        st.fresh = true;
        st.lockUntil = 0;
        say('Tap the downbeat — both hands together — to begin.', '');
      }
      offset.textContent = ' ';
      startBtn.textContent = 'Stop';
      kick();
    }

    function stop() {
      if (timer) { clearInterval(timer); timer = null; }
      if (raf) { cancelAnimationFrame(raf); raf = null; }
      var was = st.running;
      st.running = false;
      st.waiting = false;
      st.countin = false;
      st.streak = 0;
      st.taps = [];
      st.slots = [{}, {}];
      renderScore();
      startBtn.textContent = 'Start';
      if (was) {
        say('Stopped.', '');
        offset.textContent = ' ';
      }
      draw();
    }

    function fail(t, msg) {
      var lost = st.streak;
      st.streak = 0;
      st.armed = false;
      renderScore();
      var tail = lost ? ' Streak of ' + lost + ' lost.' : '';
      if (cfg.mode === 'free') {
        st.waiting = true;
        st.fresh = false;
        st.frozenAt = t;
        st.lockUntil = t + FREE_LOCKOUT_MS;
        tail += ' Tap a downbeat to go again.';
      }
      say(msg + tail, 'error');
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

    // Free mode: fit t = t0 + T·p to the recent taps, p being the beat's
    // position in cycles. With too narrow a spread of p, only shift the phase.
    function refit() {
      var pts = st.fit, k = pts.length;
      if (!k) return;
      var mp = 0, mt = 0, lo = Infinity, hi = -Infinity, i;
      for (i = 0; i < k; i++) {
        mp += pts[i].p; mt += pts[i].t;
        lo = Math.min(lo, pts[i].p); hi = Math.max(hi, pts[i].p);
      }
      mp /= k; mt /= k;
      var T = st.T;
      if (k >= 3 && hi - lo >= 0.5) {
        var sxx = 0, sxy = 0;
        for (i = 0; i < k; i++) {
          var dp = pts[i].p - mp;
          sxx += dp * dp;
          sxy += dp * (pts[i].t - mt);
        }
        if (sxx > 0) {
          T = sxy / sxx;
          T = Math.min(st.T * 1.15, Math.max(st.T / 1.15, T));   // no lurches
          T = Math.min(10000, Math.max(200, T));
        }
      }
      st.T = T;
      st.t0 = mt - T * mp;
    }

    function onTap(h, t) {
      flashPad(h);
      audio();

      if (!st.running) {
        if (cfg.mode === 'free') start();
        else { say('Press Start (or Space) to begin.', ''); return; }
      }

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
      if (j < 0) return;      // still in the count-in

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

      if (!st.armed) {
        // Back in after an error: require beats from here on, not the ones
        // that went by while you were finding your place.
        st.armed = true;
        var o = 1 - h;
        st.next[h] = j + 1;
        st.next[o] = Math.floor((t - st.t0) / st.T * cfg.n[o]) + 1;
        say(status.textContent, '');     // keep the message, drop the red
      } else {
        st.next[h] = Math.max(st.next[h], j + 1);
      }

      st.streak++;
      if (st.streak > st.best) {
        st.best = st.streak;
        st.bestLabel = cfg.n[0] + ' : ' + cfg.n[1];
      }

      var info = HAND[h] + '  ' + (err >= 0 ? '+' : '−') + Math.abs(Math.round(err)) + ' ms';
      if (cfg.mode === 'free') {
        st.fit.push({ p: j / n, t: t });
        if (st.fit.length > FIT_POINTS) st.fit.shift();
        refit();
        info += '  ·  tempo ≈ ' + Math.round(60000 / st.T) + '/min';
      }
      offset.textContent = info;
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
      bestLbl.textContent = st.best ? 'best this session (' + st.bestLabel + ')' : 'best this session';
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
      clickField.classList.toggle('is-hidden', cfg.mode !== 'metro');
    }

    function settingsChanged() {
      stop();
      st.T = 60000 / cfg.tempo;
      updateMeta();
      say(cfg.mode === 'metro'
        ? 'Press Start (or Space). You get one cycle of count-in.'
        : 'Press Start or just tap the downbeat to begin.', '');
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

    var CANVAS_H = 150;
    function draw(now) {
      var dpr = global.devicePixelRatio || 1;
      var w = canvas.clientWidth || 600;
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

      var padL = 64, padR = 14;
      var plotW = Math.max(50, w - padL - padR);
      var W = 1.5 * T;                       // visible span: half a cycle back, a cycle ahead
      var tStart = view - W / 3;
      var X = function (t) { return padL + (t - tStart) / W * plotW; };
      var lanes = [hgt * 0.3, hgt * 0.72];

      // lanes and labels
      g.lineWidth = 1;
      g.strokeStyle = colors.line;
      g.font = '600 13px system-ui, -apple-system, sans-serif';
      g.textBaseline = 'middle';
      for (var h = 0; h < 2; h++) {
        g.beginPath();
        g.moveTo(padL - 6, lanes[h]);
        g.lineTo(w - padR + 6, lanes[h]);
        g.stroke();
        g.fillStyle = colors.hand[h];
        g.fillText(HAND[h][0] + ' · ' + cfg.labels[h], 8, lanes[h]);
      }

      g.save();
      g.beginPath();
      g.rect(padL - 12, 0, plotW + 24, hgt);
      g.clip();

      // a faint bar line at each downbeat
      var c0 = Math.floor((tStart - t0) / T) - 1;
      var c1 = Math.ceil((tStart + W - t0) / T) + 1;
      g.strokeStyle = colors.line;
      g.setLineDash([3, 4]);
      for (var c = c0; c <= c1; c++) {
        var bx = X(t0 + c * T);
        g.beginPath();
        g.moveTo(bx, 10);
        g.lineTo(bx, hgt - 10);
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
          var x = X(t), y = lanes[h];
          var r = mod(j, n) === 0 ? 8.5 : 6.5;
          var state = live ? st.slots[h][j] : null;
          var countin = live && cfg.mode === 'metro' && j < 0;
          var stale = live && !state && t < view && !countin;
          g.globalAlpha = countin ? 0.3 : (stale ? 0.35 : 1);
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
          var tx = X(tp.t);
          if (tx < padL - 12 || tx > w) return;
          g.strokeStyle = tp.ok ? colors.hand[tp.h] : colors.bad;
          g.beginPath();
          g.moveTo(tx, lanes[tp.h] - 17);
          g.lineTo(tx, lanes[tp.h] + 17);
          g.stroke();
        });
      }

      // playhead
      var px = X(view);
      g.strokeStyle = colors.text;
      g.globalAlpha = 0.65;
      g.lineWidth = 1.5;
      g.beginPath();
      g.moveTo(px, 4);
      g.lineTo(px, hgt - 4);
      g.stroke();
      g.globalAlpha = 1;
      g.restore();
    }

    function frame() {
      raf = null;
      if (!st.running) { draw(); return; }
      var now = performance.now();
      if (st.countin && now >= st.t0 - tolMs()) {
        st.countin = false;
        if (status.textContent.indexOf('Count-in') === 0) say(' ', '');
      }
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
    say(cfg.mode === 'metro'
      ? 'Press Start (or Space). You get one cycle of count-in.'
      : 'Press Start or just tap the downbeat to begin.', '');
    draw();

    return { start: start, stop: stop, _state: st, _cfg: cfg };
  };
})(window);
