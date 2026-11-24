---
layout: page
title: 카테고리
icon: fas fa-stream
order: 1
---

{% assign cats = "개발|CTF/Wargame|Bug Bounty|블로그/기술문서|논문/컨퍼런스|공모전/자격증" | split: "|" %}
{% assign descs = "직접 만든 도구, 프로젝트, 블로그 구축기|대회 참가 후기와 문제 풀이|취약점 제보 경험과 분석|공부한 기술 정리와 회고|보안 논문 리뷰, 컨퍼런스 참관기|공모전 참가와 자격증 준비 기록" | split: "|" %}

<div class="tag-wall">
{% for c in cats %}
  {% assign posts = site.categories[c] %}
  <section class="tag-sticker sticker-{{ forloop.index }}">
    <h2 class="sticker-title">{{ c }} <span class="sticker-count">{{ posts | size }}</span></h2>
    <p class="sticker-desc">{{ descs[forloop.index0] }}</p>
    {% if posts and posts.size > 0 %}
    <ul class="sticker-posts">
      {% for p in posts %}
      <li><a href="{{ p.url | relative_url }}">{{ p.title }}</a><span class="leader"></span><small>{{ p.date | date: "%Y.%m.%d" }}</small></li>
      {% endfor %}
    </ul>
    {% else %}
    <p class="sticker-empty">아직 글이 없어요. 곧 채워집니다!</p>
    {% endif %}
  </section>
{% endfor %}
</div>
