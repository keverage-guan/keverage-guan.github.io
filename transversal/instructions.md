---
layout: page
title: How to play Transversal
permalink: /transversal/instructions/
description: The rules of the transversal achievement game, with worked examples of transversals, threats and double threats.
---

Two players alternate claiming cells of an *n* × *n* grid. **X** goes first and is blue,
**O** goes second and is red. The first player to own a **transversal** — *n* cells of
which no two share a row or a column — wins immediately, and their *n* cells are outlined.
If the board fills with neither player having one, the game is a draw.

Nothing is ever removed, and a cell is claimed for good. The whole game is a race to
assemble *n* cells in general position.

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

## The board is *K*<sub>n,n</sub>

Read the rows and the columns as the two vertex classes of the complete bipartite graph
*K*<sub>n,n</sub>, and the cell (*r*, *c*) as the edge joining row *r* to column *c*. Then a
set of cells with no two in a line is exactly a **matching**, and a transversal is a
**perfect matching**. Writing ν(*S*) for the size of the largest matching inside a set *S*
of cells, a player wins precisely when ν(*S*) = *n*.

This is the useful way to look at the game, because it tells you what to watch. A cell *f*
**completes** your set if ν(*S* ∪ {*f*}) = *n*, and you **threaten** *f* if on top of that
*f* is still free. You can only ever threaten once ν(*S*) has reached *n* − 1, so before
you hold *n* − 1 cells in general position you are not threatening anything at all, however
many cells you have.

Turn on *Mark threatened cells* under the board to see them as you play.

## Threats, and why double threats end the game

A single threat is survivable: your opponent just takes the cell. A **double threat** — two
free cells, either of which completes your set — is not, because one move covers only one
of them. Every win at this game is ultimately a double threat.

The three boards below are one forcing sequence on a 5 × 5 board. X holds the matching
(1,1), (2,2), (3,3), (4,4), which misses row 5 and column 5.

<div class="tv-figures">
  <figure id="tv-fig-t1"></figure>
  <figure id="tv-fig-t2"></figure>
  <figure id="tv-fig-t3"></figure>
</div>

At the third board O is lost: (1,2) and (5,2) both complete X's set, and O can only take
one of them. Notice that X was never answering O — O spent every move from the first board
onwards blocking, and still ran out of replies.

## Playing the computer

Choose your side and a difficulty. The computer moves after a short pause.

- **Easy** plays a uniformly random free cell. It will complete a transversal if it happens
  to stumble into one, and will not notice yours.
- **Medium** takes a win when one is on offer and blocks your immediate threat when you have
  one. Otherwise it plays at random. It will not see a double threat coming.
- **Hard** plays the strategy of the paper below when it has X, and wins by ply 2*n*+3 on
  every board of size 4 × 4 or larger no matter how you defend. With O it takes a win,
  blocks immediate threats, denies the cells that would give you a double threat, and
  otherwise sits inside the block of rows and columns you have not touched yet. On the
  1 × 1 to 3 × 3 boards it solves the game outright, so it takes every win available and
  never loses a drawn position.

Undo steps back to your own turn, so you can take a move back against the computer without
handing it a free tempo.

## Who wins

The second player never wins, on any board. If they had a winning strategy the first player
could steal it — play an arbitrary first move, then follow the second player's strategy,
treating the extra cell as unplayed — and both players cannot win, so no such strategy
exists. Every board is therefore a first-player win or a draw.

1 × 1 is a trivial first-player win. 2 × 2 and 3 × 3 are draws. For every *n* ≥ 4 the first
player wins, and can force it by ply 2*n*+3 — that is, with their (*n*+2)-nd stone. The
proof, an explicit strategy, and an exhaustive computer verification for *n* = 4, 5, 6 are
in [my paper](https://arxiv.org/abs/2608.13501). The bound is tight for the strategy given
there: on a 4 × 4 board a well-chosen defence survives to ply 11, and no further.

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
    x: [[1, 3], [2, 5], [3, 1], [4, 4], [5, 2]],
    mark: [[1, 3], [2, 5], [3, 1], [4, 4], [5, 2]],
    caption: 'A transversal. One cell in every row, one in every column — X has won.'
  });

  TV.showcase(document.getElementById('tv-fig-no'), {
    n: 5,
    x: [[1, 3], [2, 5], [3, 1], [4, 4], [4, 2]],
    caption: 'Not a transversal. Rows 4 and 4 collide, so ν = 4: X is still a cell short, ' +
             'and row 5 and column 4 are empty.'
  });

  TV.showcase(document.getElementById('tv-fig-t1'), {
    n: 5,
    x: M,
    o: F,
    threat: [[5, 5]],
    caption: 'X threatens (5,5), the one cell completing the matching. O has to take it.'
  });

  TV.showcase(document.getElementById('tv-fig-t2'), {
    n: 5,
    x: M.concat([[5, 1]]),
    o: F.concat([[5, 5]]),
    threat: [[1, 5]],
    caption: 'X adds (5,1), in the missing row. Now (1,5) completes the set instead, so O ' +
             'is forced again.'
  });

  TV.showcase(document.getElementById('tv-fig-t3'), {
    n: 5,
    x: M.concat([[5, 1], [2, 5]]),
    o: F.concat([[5, 5], [1, 5]]),
    threat: [[1, 2], [5, 2]],
    caption: 'X adds (2,5), in the missing column. Two cells now complete the set and O can ' +
             'block only one.'
  });
</script>
{% endraw %}