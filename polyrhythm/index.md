---
layout: page
title: Polyrhythm
permalink: /polyrhythm/
description: A polyrhythm trainer — tap a against b with two keys and see how long you can keep it going.
---

Play one rhythm with your left hand and another with your right, both starting on the same downbeat.

<div id="pr-root">Loading…</div>

<link rel="stylesheet" href="{{ '/assets/polyrhythm/polyrhythm.css' | relative_url }}">
<script src="{{ '/assets/polyrhythm/polyrhythm.js' | relative_url }}"></script>
<script>
  PR.mount(document.getElementById('pr-root'), {
    leftKey: 'KeyD',
    rightKey: 'KeyK',
    left: 2,
    right: 3,
    tempo: 40,       // cycles per minute
    tolerance: 60    // ms either side of the beat
  });
</script>
