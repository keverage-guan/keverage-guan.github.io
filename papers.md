---
layout: page
title: Papers
permalink: /papers/
---

{%- comment -%}
Everything on this page is generated from _data/papers.yml.
Add entries there, not here.
{%- endcomment -%}

{%- assign me = site.author.name -%}
{%- assign published = site.data.papers | where: "status", "published" -%}
{%- assign preprints = site.data.papers | where_exp: "p", "p.status != 'published'" -%}

{%- if published.size > 0 %}
## Publications

<ol class="pub-list">
{%- for pub in published %}
  {%- include pub-item.html pub=pub me=me %}
{%- endfor %}
</ol>
{%- endif %}

{%- if preprints.size > 0 %}
## Preprints

<ol class="pub-list">
{%- for pub in preprints %}
  {%- include pub-item.html pub=pub me=me %}
{%- endfor %}
</ol>
{%- endif %}

<p class="pub-footnote">
  Also on
  <a href="https://scholar.google.com/citations?user=evwugkIAAAAJ&hl">Google Scholar</a>.
</p>