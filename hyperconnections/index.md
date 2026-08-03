---
layout: page
title: Hyperconnections
permalink: /hyperconnections/
description: A connections variant where the four categories cut across each other instead of partitioning the words.
---

Sixteen words, four hidden categories. Every word belongs to a different combination of the categories, so the answer is a labelling of the vertices of a
four-dimensional cube. [How to play →](/hyperconnections/instructions/)

Mark each word with the groups it belongs to using the four buttons on its tile.
When all sixteen patterns are different, check your answer.

<div class="hc-picker-row">
  <label for="hc-picker"><strong>Puzzle</strong></label>
  <select id="hc-picker"></select>
</div>
<p id="hc-meta" class="hc-status"></p>

<div id="hc-root">Loading…</div>

<link rel="stylesheet" href="{{ '/assets/hyperconnections/hyper.css' | relative_url }}">
<script src="{{ '/assets/hyperconnections/hyper-core.js' | relative_url }}"></script>
<script src="{{ '/assets/hyperconnections/hyper-game.js' | relative_url }}"></script>
<script>
  HC.mountLibrary(
    document.getElementById('hc-root'),
    "{{ '/assets/hyperconnections/puzzles.json' | relative_url }}"
  );
</script>

---

Your progress is kept in this browser only. I learned about this type of puzzle from [Jonah Stockwell's](https://jonahstockwell.com/).