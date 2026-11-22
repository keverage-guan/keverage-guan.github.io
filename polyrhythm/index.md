---
layout: page
title: Polyrhythm
permalink: /polyrhythm/
description: A polyrhythm trainer — tap a against b with two keys and see how long you can keep it going.
---

Play one rhythm with your left hand and another with your right, both starting
on the same downbeat. Every tap that lands within the tolerance of its beat adds
to your streak. An early or late tap, an extra tap or a missed beat resets it.

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
    tolerance: 60,   // ms either side of the beat
    mode: 'metro',   // 'metro' or 'free'
    click: 'all'     // 'all', 'down' or 'off'
  });
</script>

---

**How it's judged.** A *cycle* is the stretch in which the left hand plays its
beats and the right hand plays its own, evenly spaced; the tempo is in cycles per
minute. Each tap is matched to the nearest beat of its own hand. The streak counts
taps, so a shared downbeat is worth two.

**Metronome** fixes the grid and gives you one cycle of count-in. The click can
sound every beat (low for the left hand, high for the right), only the downbeat,
or nothing at all once the count-in is over. After a mistake the metronome keeps
going, so just come back in.

**Follow me** has no click. Your first tap is the downbeat, and the grid follows
your own tempo, so you can drift slowly but your spacing still has to stay even.
After a mistake, tap a fresh downbeat to start again.

Wired headphones or speakers work best. Bluetooth audio can lag by a noticeable
fraction of a second, and not every browser reports that delay.
