---
layout: page
title: Transversal
permalink: /transversal/
description: The transversal achievement game — claim n cells with no two sharing a row or a column before your opponent does.
---

Players take turns claiming cells of an *n* × *n* grid. The first to own a
**transversal**—*n* cells with no two sharing a row or a column—wins. If the board
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
        'is the edge joining row <em>r</em> to column <em>c</em>. A transversal is then a perfect matching — so ' +
        'the game is a race to assemble a perfect matching of <em>K</em><sub>n,n</sub> out of ' +
        'edges you claim one at a time.',

      // Per-size commentary, if you want it. Delete or add freely.
      1: 'Golly, I wonder who's going to win this one.',
      2: 'Theoretically, X could win.',
      3:
        'The smallest somewhat interesting board, a draw with optimal play.',

      4:
        'The smallest board in which the first player is guaranteed to win.',
    }
  });
</script>
{% endraw %}

---

**Who wins?** With optimal play, the second player never wins on any board. 1 × 1 is a trivial
win for X, 2 × 2 and 3 × 3 are draws, and for every *n* ≥ 4 the first player wins, and can force
it by ply 2*n*+3, with their (*n*+2)-nd stone. To understand why, see
[my paper](https://arxiv.org/abs/2608.13501). The hard computer opponent plays exactly that optimal strategy when it has X, so on a 4 × 4 board or larger, you cannot beat it from the O side.