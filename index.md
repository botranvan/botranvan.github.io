---
layout: page
title: Technology changes the world
---

<p class="home__intro">{{ site.description }} · <a class="js-pjax" href="/about.html">About me →</a></p>

<div class="post-cards">
{% for post in site.posts %}
  <a class="post-card js-pjax" href="{{ post.url }}">
    <h2 class="post-card__title">{{ post.title }}</h2>
    <div class="post-card__meta">
      {{ post.date | date: "%d/%m/%Y" }} · {% include reading-time.html content=post.content %}
      {% for tag in post.tags limit:3 %}<span class="post__tag">#{{ tag }}</span>{% endfor %}
    </div>
    {% if post.description %}<p class="post-card__desc">{{ post.description }}</p>{% endif %}
  </a>
{% endfor %}
</div>
