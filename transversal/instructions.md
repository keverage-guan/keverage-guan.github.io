---
layout: page
title: How to play Transversal
permalink: /transversal/instructions/
description: The rules of the transversal achievement game, with worked examples of transversals, threats and double threats.
---

Two players alternate claiming cells of an *n* × *n* grid. **X** goes first,
**O** goes second. The first player to own a **transversal**—*n* cells of
which no two share a row or a column—wins immediately. If the board fills with neither player having one, the game is a draw.

## What counts as a transversal

Five cells is not enough on a 5 × 5 board; they have to occupy five different rows *and*
five different columns.

<div class="tv-figures">
  <figure id="tv-fig-yes"></figure>
  <figure id="tv-fig-no"></figure>
</div>

Only the cells that are in general position count. In the second board X holds five cells,
but two of them sit in row 4, so the largest set with no repeated line has size four — one
short.

## Playing the computer

Choose your side and a difficulty. The computer moves after a short pause.

- **Easy** plays a uniformly random free cell. It will complete a transversal if it happens
  to stumble into one, and will not notice yours.
- **Medium** takes a win when one is available and blocks your immediate threat when you have
  one. Otherwise it plays at random. It will not see a double threat coming.
- **Hard** plays the strategy of the paper below when it has X, and wins by ply 2*n*+3 on
  every board of size 4 × 4 or larger no matter how you defend. With O it takes a win,
  blocks immediate threats, denies cells that would give you a double threat, and
  otherwise plays inside the rows and columns you have not touched yet. On the
  1 × 1 to 3 × 3 boards it solves the game outright, so it takes every win available and
  never loses a drawn position.

Undo steps back to your own turn, so you can take a move back against the computer without
handing it a free tempo.

## Who wins

The second player never wins, on any board. Every board is therefore a first-player win or a draw. 1 × 1 is a trivial first-player win. 2 × 2 and 3 × 3 are draws. For every *n* ≥ 4 the first
player wins, and can force it by ply 2*n*+3—that is, with their (*n*+2)-nd stone. The
proof, an explicit strategy, and an exhaustive computer verification for *n* = 4, 5, 6 are
in [my paper](https://arxiv.org/abs/2608.13501).

[Play →](/transversal/)

<link rel="stylesheet" href="{{ '/assets/transversal/transversal.css' | relative_url }}">
<script src="{{ '/assets/transversal/transversal-core.js' | relative_url }}"></script>
<script src="{{ '/assets/transversal/transversal-game.js' | relative_url }}"></script>
{% raw %}
<script>
  var M = [[1, 1], [2, 2], [3, 3], [4, 4]];       // X's matching, missing row 5 and column 5
  var F = [[1, 3], [3, 5], [4, 2]];               // O's first three stones

  TV.showcase(document.getElementById('tv-fig-yes'), {
    n: 5,
    x: [[1, 3], [2, 5], [3, 1], [4, 4], [5, 2], [3, 5]],
    mark: [[1, 3], [2, 5], [3, 1], [4, 4], [5, 2], [3, 5]],
    caption: 'A transversal.'
  });

  TV.showcase(document.getElementById('tv-fig-no'), {
    n: 5,
    x: [[1, 3], [2, 5], [3, 1], [4, 4], [4, 2]],
    caption: 'Not a transversal.'
  });
</script>
{% endraw %}