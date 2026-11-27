---
layout: page
title: Archives
icon: fas fa-archive
order: 3
---

<style>
.arch-year { font-size: 2rem; color: var(--yellow, #ffd23f); margin: 0.5rem 0 0.25rem; line-height: 1.2; }
.arch-month { margin: 0 0 1.6rem 0.3rem; padding-left: 1rem; border-left: 2px dashed rgba(255, 210, 63, 0.45); }
.arch-month-title { font-size: 1.35rem; color: var(--sky, #2de2e6); margin-bottom: 0.4rem; }
.arch-month-title small { font-size: 0.9rem; color: #9a9a9a; margin-left: 0.4rem; }
.arch-day { display: flex; gap: 0.9rem; align-items: baseline; padding: 0.35rem 0; border-bottom: 1px dotted rgba(255, 255, 255, 0.12); }
.arch-day:last-child { border-bottom: none; }
.arch-date { flex: 0 0 3.2rem; text-align: right; color: var(--yellow, #ffd23f); font-size: 1.1rem; }
.arch-posts { list-style: none; margin: 0; padding: 0; flex: 1; }
.arch-posts li { padding: 0.1rem 0; }
.arch-posts a { color: #fff !important; text-decoration: none !important; border-bottom: none !important; background: none !important; }
.arch-posts a:hover { color: var(--sky, #2de2e6) !important; }
</style>

<div class="arch">
{%- assign by_year = site.posts | group_by_exp: "p", "p.date | date: '%Y'" -%}
{%- for year in by_year -%}
<div class="arch-year">{{ year.name }}</div>
{%- assign by_month = year.items | group_by_exp: "p", "p.date | date: '%m'" -%}
{%- for month in by_month -%}
<div class="arch-month">
<div class="arch-month-title">{{ month.name | plus: 0 }}월<small>{{ month.size }}개</small></div>
{%- assign by_day = month.items | group_by_exp: "p", "p.date | date: '%d'" -%}
{%- for day in by_day -%}
<div class="arch-day"><span class="arch-date">{{ day.name | plus: 0 }}일</span><ul class="arch-posts">
{%- for post in day.items -%}
<li><a href="{{ post.url | relative_url }}">{{ post.title }}</a></li>
{%- endfor -%}
</ul></div>
{%- endfor -%}
</div>
{%- endfor -%}
{%- endfor -%}
</div>
