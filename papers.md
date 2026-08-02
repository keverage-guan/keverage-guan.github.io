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

<ol class="pub-list">
{%- for pub in site.data.papers %}
  <li class="pub">
    <div class="pub-title">{{ pub.title }}</div>
    <div class="pub-authors">
      {%- for a in pub.authors -%}
        {%- if a == me -%}<strong>{{ a }}</strong>{%- else -%}{{ a }}{%- endif -%}
        {%- unless forloop.last -%}, {% endunless -%}
      {%- endfor -%}
    </div>
    {%- if pub.venue or pub.year %}
    <div class="pub-venue">
      {{ pub.venue }}{% if pub.venue and pub.year %}, {% endif %}{{ pub.year }}
    </div>
    {%- endif %}
    {%- if pub.note %}
    <div class="pub-note">{{ pub.note }}</div>
    {%- endif %}
    <div class="pub-links">
      {%- if pub.pdf %}<a href="{% if pub.pdf contains '://' %}{{ pub.pdf }}{% else %}{{ pub.pdf | relative_url }}{% endif %}">PDF</a>{% endif -%}
      {%- if pub.arxiv %}<a href="{{ pub.arxiv }}">arXiv</a>{% endif -%}
      {%- if pub.code %}<a href="{{ pub.code }}">Code</a>{% endif -%}
      {%- if pub.doi %}<a href="{{ pub.doi }}">Publisher</a>{% endif -%}
      {%- if pub.slides %}<a href="{% if pub.slides contains '://' %}{{ pub.slides }}{% else %}{{ pub.slides | relative_url }}{% endif %}">Slides</a>{% endif -%}
      {%- if pub.poster %}<a href="{% if pub.poster contains '://' %}{{ pub.poster }}{% else %}{{ pub.poster | relative_url }}{% endif %}">Poster</a>{% endif -%}
      {%- if pub.bibtex %}<a href="{% if pub.bibtex contains '://' %}{{ pub.bibtex }}{% else %}{{ pub.bibtex | relative_url }}{% endif %}">BibTeX</a>{% endif -%}
    </div>
  </li>
{%- endfor %}
</ol>

<p class="pub-footnote">
  Also on
  <a href="https://scholar.google.com/citations?user=evwugkIAAAAJ&hl">Google Scholar</a>.
</p>