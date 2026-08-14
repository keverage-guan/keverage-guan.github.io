/* Transversal achievement game — rules, matchings, and bots.
 *
 * No DOM in here; transversal-game.js draws the board and this file decides
 * what is legal, who has won, and what the bot plays.
 *
 * The board is K_{n,n}: rows and columns are the two vertex classes and the
 * cell (r,c) is the edge joining row r to column c. A player's stones are a
 * set S of edges, nu(S) is the size of a largest matching inside S, and a
 * player wins exactly when nu(S) = n (S contains a perfect matching).
 *
 * The hard bot playing X follows the strategy of
 *   K. Guan, "The transversal achievement game on a square grid",
 *   https://arxiv.org/abs/2608.13501
 * and wins by ply 2n+3 for every n >= 4. Section references below are to that
 * paper.
 */
(function (global) {
  'use strict';

  var TV = global.TV || (global.TV = {});

  TV.X = 1;
  TV.O = 2;

  /* The medium bot blocks the opponent's immediate threats and is otherwise
   * random. It also takes its own win when one is on offer; set this to false
   * for a purely defensive medium bot. */
  TV.MEDIUM_TAKES_WIN = true;

  TV.other = function (p) { return p === TV.X ? TV.O : TV.X; };

  /* ---- positions --------------------------------------------------------
   * A *position* is any object with { n, cells }, where cells[r*n+c] is 0, 1
   * (X) or 2 (O). A *game* is a position that also carries history and state.
   */

  TV.newGame = function (n) {
    return {
      n: n,
      cells: new Array(n * n).fill(0),
      history: [],          // [{ cell, player }, ...] in ply order
      turn: TV.X,
      winner: 0,
      winCells: null,
      over: false
    };
  };

  function rowOf(pos, i) { return Math.floor(i / pos.n); }
  function colOf(pos, i) { return i % pos.n; }
  function at(pos, r, c) { return r * pos.n + c; }

  TV.rowOf = rowOf;
  TV.colOf = colOf;
  TV.at = at;

  TV.freeCells = function (pos) {
    var out = [];
    for (var i = 0; i < pos.cells.length; i++) if (!pos.cells[i]) out.push(i);
    return out;
  };

  /* A player's stones in the order they were placed. */
  TV.stonesOf = function (g, p) {
    var out = [];
    for (var i = 0; i < g.history.length; i++) {
      if (g.history[i].player === p) out.push(g.history[i].cell);
    }
    return out;
  };

  /* The position after the first `plies` moves of a game. */
  TV.boardAt = function (g, plies) {
    var cells = new Array(g.n * g.n).fill(0);
    for (var i = 0; i < plies && i < g.history.length; i++) {
      cells[g.history[i].cell] = g.history[i].player;
    }
    return { n: g.n, cells: cells };
  };

  /* ---- matchings --------------------------------------------------------- */

  function adjacency(pos, p) {
    var n = pos.n, adj = [];
    for (var r = 0; r < n; r++) {
      var a = [];
      for (var c = 0; c < n; c++) if (pos.cells[r * n + c] === p) a.push(c);
      adj.push(a);
    }
    return adj;
  }

  /* Kuhn's augmenting-path algorithm. n <= 10 here, so nothing fancier is
   * called for. */
  function maxMatching(adj, n) {
    var rowMatch = new Array(n).fill(-1);
    var colMatch = new Array(n).fill(-1);
    var seen, size = 0;

    function augment(r) {
      for (var i = 0; i < adj[r].length; i++) {
        var c = adj[r][i];
        if (seen[c]) continue;
        seen[c] = true;
        if (colMatch[c] < 0 || augment(colMatch[c])) {
          colMatch[c] = r;
          rowMatch[r] = c;
          return true;
        }
      }
      return false;
    }

    for (var r = 0; r < n; r++) {
      if (!adj[r].length) continue;
      seen = new Array(n).fill(false);
      if (augment(r)) size++;
    }
    return { size: size, rowMatch: rowMatch, colMatch: colMatch };
  }

  TV.nu = function (pos, p) {
    return maxMatching(adjacency(pos, p), pos.n).size;
  };

  /* One maximum matching, as a list of cells. Used to outline the winning
   * transversal. */
  TV.matchingCells = function (pos, p) {
    var m = maxMatching(adjacency(pos, p), pos.n), out = [];
    for (var r = 0; r < pos.n; r++) {
      if (m.rowMatch[r] >= 0) out.push(r * pos.n + m.rowMatch[r]);
    }
    return out;
  };

  /* Rows exposed by *some* maximum matching: the M-exposed rows, plus every
   * row reachable from one by an M-alternating path of even length. */
  function exposedRows(adj, m, n) {
    var inD = new Array(n).fill(false), queue = [];
    for (var r = 0; r < n; r++) if (m.rowMatch[r] < 0) { inD[r] = true; queue.push(r); }
    while (queue.length) {
      var v = queue.pop();
      for (var i = 0; i < adj[v].length; i++) {
        var c = adj[v][i];
        if (c === m.rowMatch[v]) continue;
        var r2 = m.colMatch[c];
        if (r2 >= 0 && !inD[r2]) { inD[r2] = true; queue.push(r2); }
      }
    }
    return where(inD);
  }

  function exposedCols(adj, m, n) {
    var cadj = [], r, c;
    for (c = 0; c < n; c++) cadj.push([]);
    for (r = 0; r < n; r++) for (var i = 0; i < adj[r].length; i++) cadj[adj[r][i]].push(r);
    var inD = new Array(n).fill(false), queue = [];
    for (c = 0; c < n; c++) if (m.colMatch[c] < 0) { inD[c] = true; queue.push(c); }
    while (queue.length) {
      var v = queue.pop();
      for (var j = 0; j < cadj[v].length; j++) {
        var rr = cadj[v][j];
        if (rr === m.colMatch[v]) continue;
        var c2 = m.rowMatch[rr];
        if (c2 >= 0 && !inD[c2]) { inD[c2] = true; queue.push(c2); }
      }
    }
    return where(inD);
  }

  function where(flags) {
    var out = [];
    for (var i = 0; i < flags.length; i++) if (flags[i]) out.push(i);
    return out;
  }

  /* Cells that complete p's set: nu(S + f) = n. By Lemma 1 of the paper this
   * is the rectangle D_R x D_C when nu(S) = n-1, and empty otherwise. The
   * cells are never p's own, but may be occupied by the opponent. */
  TV.completing = function (pos, p) {
    var n = pos.n, adj = adjacency(pos, p), m = maxMatching(adj, n);
    if (m.size !== n - 1) return [];
    var DR = exposedRows(adj, m, n), DC = exposedCols(adj, m, n), out = [];
    for (var i = 0; i < DR.length; i++) {
      for (var j = 0; j < DC.length; j++) out.push(DR[i] * n + DC[j]);
    }
    return out;
  };

  /* Completing cells that are still free: the cells p is actually threatening. */
  TV.threats = function (pos, p) {
    return TV.completing(pos, p).filter(function (i) { return !pos.cells[i]; });
  };

  /* ---- play -------------------------------------------------------------- */

  TV.play = function (g, cell) {
    if (g.over || cell == null || g.cells[cell]) return false;
    var p = g.turn;
    g.cells[cell] = p;
    g.history.push({ cell: cell, player: p });
    if (TV.nu(g, p) === g.n) {
      g.winner = p;
      g.winCells = TV.matchingCells(g, p);
      g.over = true;
    } else if (g.history.length === g.n * g.n) {
      g.over = true;                     // board full, nobody has a transversal
    } else {
      g.turn = TV.other(p);
    }
    return true;
  };

  TV.undo = function (g) {
    var last = g.history.pop();
    if (!last) return false;
    g.cells[last.cell] = 0;
    g.winner = 0;
    g.winCells = null;
    g.over = false;
    g.turn = last.player;
    return true;
  };

  /* ---- bots -------------------------------------------------------------- */

  function pick(arr) { return arr[Math.floor(Math.random() * arr.length)]; }

  TV.botMove = function (g, me, level) {
    var free = TV.freeCells(g);
    if (!free.length) return null;
    if (level === 'easy') return pick(free);
    if (level === 'medium') return mediumMove(g, me, free);
    if (g.n < 4) return perfectMove(g, me);
    var m = (me === TV.X) ? hardX(g, free) : hardO(g, free);
    return (m == null) ? strongMove(g, me, free) : m;
  };

  /* ---- perfect play on the small boards -----------------------------------
   * The paper's strategy starts at n = 4. Below that the whole game tree fits
   * in memory (9 cells at most), so the hard bot just solves it: 1x1 is a
   * first-player win, 2x2 and 3x3 are draws, and this holds the draw from
   * either side against any defence.
   */
  function perfectMove(g, me) {
    var n = g.n, N = n * n, memo = {};
    var pos = { n: n, cells: g.cells.slice() };
    var cells = pos.cells;

    // Scores are from X's point of view: +1 X wins, -1 O wins, 0 draw.
    function solve(turn) {
      var key = cells.join('') + turn;
      if (memo[key] !== undefined) return memo[key];
      var best = null;
      for (var i = 0; i < N; i++) {
        if (cells[i]) continue;
        cells[i] = turn;
        var v = (TV.nu(pos, turn) === n) ? (turn === TV.X ? 1 : -1) : solve(TV.other(turn));
        cells[i] = 0;
        if (best === null) best = v;
        else best = (turn === TV.X) ? Math.max(best, v) : Math.min(best, v);
        if (best === (turn === TV.X ? 1 : -1)) break;      // cannot do better
      }
      memo[key] = (best === null) ? 0 : best;              // null: board full
      return memo[key];
    }

    var bag = [], bestv = null, i;
    for (i = 0; i < N; i++) {
      if (cells[i]) continue;
      cells[i] = me;
      var v = (TV.nu(pos, me) === n) ? (me === TV.X ? 1 : -1) : solve(TV.other(me));
      cells[i] = 0;
      if (bestv === null || (me === TV.X ? v > bestv : v < bestv)) { bestv = v; bag = [i]; }
      else if (v === bestv) bag.push(i);
    }
    if (!bag.length) return null;

    // Among equally-valued moves, finish the game rather than dawdle.
    var now = TV.threats(g, me);
    for (i = 0; i < now.length; i++) if (bag.indexOf(now[i]) >= 0) return now[i];
    return pick(bag);
  }

  /* Easy is pure chance; medium adds a single reflex. */
  function mediumMove(g, me, free) {
    if (TV.MEDIUM_TAKES_WIN) {
      var mine = TV.threats(g, me);
      if (mine.length) return pick(mine);
    }
    var theirs = TV.threats(g, TV.other(me));
    if (theirs.length) return pick(theirs);
    return pick(free);
  }

  /* Cells the opponent would like to play: playing one leaves them with two or
   * more free completing cells, which no single reply can cover. */
  function doubleThreatCells(pos, opp) {
    var out = [];
    TV.freeCells(pos).forEach(function (f) {
      pos.cells[f] = opp;
      var t = TV.threats(pos, opp);
      pos.cells[f] = 0;
      if (t.length >= 2) out.push({ cell: f, count: t.length });
    });
    out.sort(function (a, b) { return b.count - a.count; });
    return out;
  }
  TV.doubleThreatCells = doubleThreatCells;

  /* Free cells that grow the player's own largest matching the most. */
  function bestGrowth(pos, me, candidates) {
    var best = -1, bag = [];
    candidates.forEach(function (f) {
      pos.cells[f] = me;
      var v = TV.nu(pos, me);
      pos.cells[f] = 0;
      if (v > best) { best = v; bag = [f]; }
      else if (v === best) bag.push(f);
    });
    return pick(bag);
  }

  /* The general-purpose hard player, and the fallback whenever the paper's
   * strategy does not apply (n < 4, or a position it never produces). */
  function strongMove(g, me, free) {
    var them = TV.other(me);
    var win = TV.threats(g, me);
    if (win.length) return pick(win);
    var block = TV.threats(g, them);
    if (block.length) return pick(block);
    var dbl = doubleThreatCells(g, them);
    if (dbl.length) {
      var top = dbl.filter(function (d) { return d.count === dbl[0].count; });
      return pick(top).cell;
    }
    return bestGrowth(g, me, free);
  }

  /* Rows and columns holding no stone of player p. */
  function emptyLines(pos, p) {
    var n = pos.n, rows = new Array(n).fill(true), cols = new Array(n).fill(true);
    for (var i = 0; i < pos.cells.length; i++) {
      if (pos.cells[i] === p) { rows[rowOf(pos, i)] = false; cols[colOf(pos, i)] = false; }
    }
    return { rows: where(rows), cols: where(cols) };
  }

  /* Free cells of the block rows x cols. */
  function blockFree(pos, rows, cols) {
    var out = [];
    rows.forEach(function (r) {
      cols.forEach(function (c) {
        var i = at(pos, r, c);
        if (!pos.cells[i]) out.push(i);
      });
    });
    return out;
  }

  /* ---- hard bot, playing O ------------------------------------------------
   * In priority order: take a win, block an immediate threat, deny a cell that
   * would give X a double threat, and otherwise sit inside the open block H
   * while X is still assembling their matching (Phase 1).
   */
  function hardO(g, free) {
    var me = TV.O, them = TV.X, n = g.n;

    var win = TV.threats(g, me);
    if (win.length) return pick(win);

    var block = TV.threats(g, them);
    if (block.length) return pick(block);

    var dbl = doubleThreatCells(g, them);
    if (dbl.length) {
      var top = dbl.filter(function (d) { return d.count === dbl[0].count; });
      return pick(top).cell;
    }

    // Phase 1: X holds fewer than n-1 stones, so H = U_R x U_C is still alive.
    if (TV.stonesOf(g, them).length < n - 1) {
      var u = emptyLines(g, them);
      var H = blockFree(g, u.rows, u.cols);
      if (H.length) return bestGrowth(g, me, H);   // inside H, build O's own matching
    }
    return null;                                   // -> strongMove
  }

  /* ---- hard bot, playing X ------------------------------------------------
   * The strategy of section 4 of the paper. Every choice it makes is either
   * deterministic or recoverable from the move history, so it survives undo.
   */
  function hardX(g, free) {
    var n = g.n;
    if (n < 4) return null;                        // n = 2, 3 are draws
    var xs = TV.stonesOf(g, TV.X);
    var k = xs.length + 1;                         // which of X's moves this is

    // X's first n-1 stones must be a matching for any of this to mean anything.
    if (!isMatching(g, xs.slice(0, Math.min(xs.length, n - 1)))) return null;

    if (k >= n) return phase2(g, xs);

    var u = emptyLines(g, TV.X);
    if (u.rows.length !== n - k + 1 || u.cols.length !== n - k + 1) return null;
    if (k === n - 1) return tieBreak(g, u.rows, u.cols);
    return phase1(g, u.rows, u.cols);
  }

  function isMatching(pos, cells) {
    var rows = {}, cols = {};
    for (var i = 0; i < cells.length; i++) {
      var r = rowOf(pos, cells[i]), c = colOf(pos, cells[i]);
      if (rows[r] || cols[c]) return false;
      rows[r] = cols[c] = true;
    }
    return true;
  }

  /* Moves 1 .. n-2. Move 1 is arbitrary. Later, if O's last stone landed in H,
   * answer in its row (which evicts it from H and restores Invariant 1);
   * otherwise play anywhere in H. */
  function phase1(g, UR, UC) {
    var H = blockFree(g, UR, UC);
    if (!H.length) return null;
    var os = TV.stonesOf(g, TV.O);
    var last = os.length ? os[os.length - 1] : null;
    if (last != null && UR.indexOf(rowOf(g, last)) >= 0 && UC.indexOf(colOf(g, last)) >= 0) {
      var sameRow = H.filter(function (f) { return rowOf(g, f) === rowOf(g, last); });
      if (sameRow.length) return pick(sameRow);
    }
    return pick(H);
  }

  /* Move n-1. H is a 2x2 block; playing one corner fixes (b,d) as the opposite
   * corner. A corner is admissible if it and its opposite are both free, which
   * is exactly what keeps (b,d) free. Prefer an outcome with 1 <= w <= n-3,
   * else any with w <= n-3 (Lemma 5 says one exists). */
  function tieBreak(g, UR, UC) {
    var n = g.n;
    if (UR.length !== 2 || UC.length !== 2) return null;
    var F = TV.stonesOf(g, TV.O);
    var cands = [];
    for (var a = 0; a < 2; a++) {
      for (var c = 0; c < 2; c++) {
        var cell = at(g, UR[a], UC[c]), opposite = at(g, UR[1 - a], UC[1 - c]);
        if (g.cells[cell] || g.cells[opposite]) continue;
        var b = UR[1 - a], d = UC[1 - c];
        var w = F.filter(function (f) {
          return rowOf(g, f) === b || colOf(g, f) === d;
        }).length;
        cands.push({ cell: cell, w: w });
      }
    }
    if (!cands.length) return null;
    var good = cands.filter(function (x) { return x.w >= 1 && x.w <= n - 3; });
    if (good.length) return good[0].cell;
    var ok = cands.filter(function (x) { return x.w <= n - 3; });
    if (ok.length) return ok[0].cell;
    return cands[0].cell;
  }

  /* Everything the two plans of section 4.4 need, read back off the history:
   * the missing line pair (b,d), the bijection sigma, which plan applies, and
   * the pair of live rows (r,s). */
  function phase2Context(g, xs) {
    var n = g.n;
    if (xs.length < n - 1) return null;
    var M = xs.slice(0, n - 1);
    if (!isMatching(g, M)) return null;

    var hasRow = new Array(n).fill(false), hasCol = new Array(n).fill(false);
    var sigma = new Array(n).fill(-1), i;
    for (i = 0; i < M.length; i++) {
      var r = rowOf(g, M[i]), c = colOf(g, M[i]);
      hasRow[r] = hasCol[c] = true;
      sigma[r] = c;
    }
    var b = where(hasRow.map(function (v) { return !v; }));
    var d = where(hasCol.map(function (v) { return !v; }));
    if (b.length !== 1 || d.length !== 1) return null;
    b = b[0]; d = d[0];

    // The position just after X's (n-1)-th stone, i.e. at ply 2n-3.
    var seen = 0, plies = -1;
    for (i = 0; i < g.history.length; i++) {
      if (g.history[i].player === TV.X && ++seen === n - 1) { plies = i + 1; break; }
    }
    if (plies < 0) return null;
    var snap = TV.boardAt(g, plies);
    function free(cell) { return !snap.cells[cell]; }

    var F = [];
    for (i = 0; i < plies; i++) if (g.history[i].player === TV.O) F.push(g.history[i].cell);

    var live = [];
    for (r = 0; r < n; r++) {
      if (r === b) continue;
      if (free(at(g, r, d)) && free(at(g, b, sigma[r]))) live.push(r);
    }

    var meetsCol = F.some(function (f) { return colOf(g, f) === d; });
    var meetsRow = F.some(function (f) { return rowOf(g, f) === b; });
    var plan = 'i', fixedS = null;
    if (meetsCol) plan = 'i';
    else if (meetsRow) plan = 'ii';
    else if (TV.nu({ n: n, cells: snap.cells }, TV.O) === n - 2) {
      plan = 'i';
      fixedS = rowOf(g, M[n - 2]);          // u_a, X's last Phase-1 row
    }

    function crossFree(rr, ss) {
      return plan === 'i' ? free(at(g, rr, sigma[ss])) : free(at(g, ss, sigma[rr]));
    }

    var pair = null, j;
    if (fixedS != null) {
      for (i = 0; i < live.length; i++) {
        if (live[i] !== fixedS && crossFree(live[i], fixedS)) {
          pair = { r: live[i], s: fixedS };
          break;
        }
      }
    }
    for (i = 0; !pair && i < live.length; i++) {
      for (j = 0; j < live.length; j++) {
        if (live[i] !== live[j] && crossFree(live[i], live[j])) {
          pair = { r: live[i], s: live[j] };
          break;
        }
      }
    }
    if (!pair) return null;
    return { b: b, d: d, sigma: sigma, plan: plan, r: pair.r, s: pair.s };
  }

  /* Moves n, n+1, n+2. A free completing cell always comes first: at move n+2
   * that is the win, and at moves n and n+1 it is there exactly when O has
   * declined to block (Rule 4.4). */
  function phase2(g, xs) {
    var n = g.n;
    var t = TV.threats(g, TV.X);
    if (t.length) return t[0];

    var ctx = phase2Context(g, xs);
    if (!ctx) return null;

    var k = xs.length + 1, target = null;
    if (k === n) {
      target = ctx.plan === 'i' ? at(g, ctx.b, ctx.sigma[ctx.r]) : at(g, ctx.r, ctx.d);
    } else if (k === n + 1) {
      target = ctx.plan === 'i' ? at(g, ctx.s, ctx.d) : at(g, ctx.b, ctx.sigma[ctx.s]);
    }
    if (target != null && !g.cells[target]) return target;
    return null;
  }

  TV.internals = {          // exposed for the test harness only
    hardX: hardX, hardO: hardO, phase2Context: phase2Context, maxMatching: maxMatching
  };

})(typeof window !== 'undefined' ? window : globalThis);