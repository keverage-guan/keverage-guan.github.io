---
layout: page
title: Transversal
permalink: /transversal/
description: The transversal achievement game — claim n cells with no two sharing a row or a column before your opponent does.
---

Two players take turns claiming cells of an *n* × *n* grid. The first to own a
**transversal** — *n* cells with no two sharing a row or a column — wins. If the board
fills up and neither player has one, the game is a draw.
[How to play →](/transversal/instructions/)

<div id="tv-root">Loading…</div>

<link rel="stylesheet" href="{{ '/assets/transversal/transversal.css' | relative_url }}">
<script src="{{ '/assets/transversal/transversal-core.js' | relative_url }}"></script>
<script src="{{ '/assets/transversal/transversal-game.js' | relative_url }}"></script>
{% raw %}
<script>
  TV.mount(document.getElementById('tv-root'), {
    size: 5,

    // Commentary shown under the board. Keys are board sizes; 'default' covers
    // the rest. Values are HTML.
    notes: {
      'default':
        'The board is the complete bipartite graph <em>K</em><sub>n,n</sub>: the rows and ' +
        'the columns are the two vertex classes, and the cell (<em>r</em>,&nbsp;<em>c</em>) ' +
        'is the edge joining row <em>r</em> to column <em>c</em>. A set of cells with no two ' +
        'in a line is then exactly a matching, and a transversal is a perfect matching — so ' +
        'the game is a race to assemble a perfect matching of <em>K</em><sub>n,n</sub> out of ' +
        'edges you claim one at a time. An <em>n</em> × <em>n</em> board has <em>n</em>! of ' +
        'them, all heavily overlapping, which is why the usual tools for positional games ' +
        '(pairing strategies, the Erdős–Selfridge criterion) say nothing useful here.',

      // Per-size commentary, if you want it. Delete or add freely.
      3:
        'The smallest genuinely interesting board: 3 × 3 is a draw, and only just. The ' +
        'counting in the proof for larger boards fails here by exactly one stone.',

      4:
        'The smallest board the first player wins. X can force it by ply 11, with their ' +
        'sixth stone.'
    }
  });
</script>
{% endraw %}

---

**Who wins?** The second player never wins on any board — a strategy-stealing argument
rules it out — so every board is either a first-player win or a draw. 1 × 1 is a trivial
win, 2 × 2 and 3 × 3 are draws, and for every *n* ≥ 4 the first player wins, and can force
it by ply 2*n*+3, with their (*n*+2)-nd stone. For why, see
[my paper](https://arxiv.org/abs/2608.13501); the hard computer opponent plays exactly that
strategy when it has X, so on a 4 × 4 board or larger you cannot beat it from the O side.

[Back to Hyperconnections →](/hyperconnections/)