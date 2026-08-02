---
layout: page
title: Courses
permalink: /courses/
---

Coursework I've completed, grouped by area. Graduate courses are marked
<span class="tag">grad</span>.
{: .page-intro }

{% for group in site.data.courses %}
## {{ group.category }}

<table class="course-table">
  <tbody>
  {%- for course in group.courses %}
    <tr>
      <td class="course-code">{{ course.code }}</td>
      <td class="course-title">
        {%- if course.url -%}
          <a href="{{ course.url }}">{{ course.title }}</a>
        {%- else -%}
          {{ course.title }}
        {%- endif -%}
        {%- if course.level == "graduate" %} <span class="tag">grad</span>{% endif -%}
        {%- if course.note %}<div class="course-note">{{ course.note }}</div>{% endif -%}
      </td>
      <td class="course-term">{{ course.term }}</td>
    </tr>
  {%- endfor %}
  </tbody>
</table>
{% endfor %}