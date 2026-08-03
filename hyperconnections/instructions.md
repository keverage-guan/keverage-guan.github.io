---
layout: page
title: How to play Hyperconnections
permalink: /hyperconnections/instructions/
description: The rules of Hyperconnections, with a worked example you can solve.
---

In ordinary connections, the sixteen words split into disjoint groups of four. Every word belongs to exactly one group, and finding a group removes those words from play.

Hyperconnections keeps the sixteen words and the four categories, and throws out the
disjointness. Here, the categories bisect each other. Each category contains eight
of the sixteen words. Any two categories share exactly four words. Any three share
exactly two. All four share exactly one — and exactly one word belongs to none of them.

Equivalent ways to describe these puzzles:

- Each word belongs to a subset of the four categories, and every one of the
  sixteen possible subsets is used exactly once — a bijection between the words and
  the power set of the set of categories.
- Each word is assigned a four-bit code, one bit per category. The sixteen codes are the
  sixteen points of the **Boolean hypercube** {0,1}⁴.
- The words are the vertices of Q₄, the four-dimensional cube. Words joined by an
  edge differ in exactly one category.

Nothing is eliminated as you go. You must fill in the whole labelling at once, and it is either consistent or it isn't.

## What you actually do

Every word tile has four buttons, one per group. Turn on the buttons for the groups you
think that word belongs to. Two things to watch for:

- **No two words may share a pattern.** The board flags duplicates as you build. Sixteen distinct four-bit patterns automatically means eight words per group, four words in each pair of groups, and so on.
- **Which group is which doesn't matter, and neither does polarity.** Group 1 and Group 3
  can be swapped freely, and "has an A" and "doesn't have an A" cut the words in the
  same way. The checker treats all of these as the same answer, and tells you the real
  names once you're right.

## A worked example

The four categories below are the presence of the vowels **A**, **U**, **I** and **O**.
*audio* has all four, *nymph* has none, *tour* has U and O, and so on. Try it — the
categories are unlabelled until you solve it.

<div id="hc-demo">Loading…</div>

<link rel="stylesheet" href="{{ '/assets/hyperconnections/hyper.css' | relative_url }}">
<script src="{{ '/assets/hyperconnections/hyper-core.js' | relative_url }}"></script>
<script src="{{ '/assets/hyperconnections/hyper-game.js' | relative_url }}"></script>
{% raw %}
<script>
  HC.mount(document.getElementById('hc-demo'), {
    mode: 'plain',
    storeKey: 'demo-vowels',
    puzzle: {
      id: 'demo',
      categories: ['has an A', 'has a U', 'has an I', 'has an O'],
      words: ['audio', 'nymph', 'tour', 'brain', 'lost', 'crux', 'avoid', 'blast',
              'build', 'chaos', 'join', 'faun', 'about', 'blink', 'curious', 'audit'],
      masks: [15, 0, 10, 5, 8, 2, 13, 1, 6, 9, 12, 3, 11, 4, 14, 7]
    }
  });
</script>
{% endraw %}

Solved, the sixteen words lay out on a 4×4 grid where neighbouring cells differ in exactly
one vowel — and the left and right edges are neighbours too, as are the top and bottom.
That wrapped grid is the four-dimensional cube.

## Notes for setters

A hyperconnections puzzle is harder to build than an ordinary one. I find that it is best two start with two interesting categories, look for four overlapping words, and then find two simpler categories that complete the hypercube.

[Back to the puzzles →](/hyperconnections/)

Credit for the format goes to [Jonah Stockwell](https://jonahstockwell.com/).