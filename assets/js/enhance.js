/*
 * Post enhancements, re-run after every pjax load from afterPjax():
 * TOC (side column + inline), code block toolbar, image zoom, lazy Disqus.
 */
(function() {
  var scroller = document.getElementById('post');
  var CODE_COLLAPSE_LINES = 30;

  // ---------- Table of contents ----------
  var tocHeadings = [];

  function buildToc() {
    var article = document.getElementById('post__content');
    var sideList = document.getElementById('post__toc-ul');
    var side = document.getElementById('post__toc');
    sideList.innerHTML = '';
    side.classList.remove('has-items');
    tocHeadings = [];
    if (!article || !document.getElementById('post__meta')) return;

    var headings = Array.prototype.filter.call(
      article.querySelectorAll(':scope > h1, :scope > h2, :scope > h3'),
      function(h) { return h.id !== 'post__title'; }
    );
    if (headings.length < 2) return;

    var top = Math.min.apply(null, headings.map(function(h) { return +h.tagName[1]; }));
    var html = '';
    headings.forEach(function(h, i) {
      // Keep kramdown's stable ids so section links survive reloads
      if (!h.id) h.id = 'section-' + (i + 1);
      var level = +h.tagName[1] - top + 1;
      html += '<li class="post__toc-li post__toc-l' + level + '"><a href="#' + h.id + '" class="js-anchor-link">' +
        h.textContent.replace(/</g, '&lt;') + '</a></li>';
    });
    tocHeadings = headings;

    sideList.innerHTML = html;
    side.classList.add('has-items');

    // Collapsible copy at the top of the post for narrow screens
    var inline = document.createElement('details');
    inline.className = 'toc-inline';
    inline.innerHTML = '<summary>Mục lục</summary><ul>' + html + '</ul>';
    var anchor = article.querySelector('.post__series') || document.getElementById('post__meta');
    anchor.parentNode.insertBefore(inline, anchor.nextSibling);
  }

  function scrollToHeading(id) {
    var target = document.getElementById(id);
    if (!target) return;
    var offset = target.getBoundingClientRect().top - scroller.getBoundingClientRect().top + scroller.scrollTop - 70;
    $(scroller).animate({ scrollTop: offset }, 400, function() {
      target.classList.add('flash');
      setTimeout(function() { target.classList.remove('flash'); }, 700);
    });
    history.replaceState(null, '', '#' + id);
  }

  $(document).on('click', '.js-anchor-link', function(e) {
    e.preventDefault();
    scrollToHeading(decodeURIComponent(this.hash.slice(1)));
  });

  var spyQueued = false;
  function updateActiveHeading() {
    spyQueued = false;
    if (!tocHeadings.length) return;
    var limit = scroller.getBoundingClientRect().top + 120;
    var current = tocHeadings[0];
    tocHeadings.forEach(function(h) {
      if (h.getBoundingClientRect().top <= limit) current = h;
    });
    $('.post__toc-li').removeClass('is-active');
    $('.post__toc-li a[href="#' + current.id + '"]').parent().addClass('is-active');
  }
  scroller.addEventListener('scroll', function() {
    if (!spyQueued) {
      spyQueued = true;
      requestAnimationFrame(updateActiveHeading);
    }
  });

  // ---------- Code blocks ----------
  function copyText(text) {
    if (navigator.clipboard && window.isSecureContext) {
      return navigator.clipboard.writeText(text);
    }
    var ta = document.createElement('textarea');
    ta.value = text;
    ta.style.position = 'fixed';
    ta.style.opacity = '0';
    document.body.appendChild(ta);
    ta.select();
    document.execCommand('copy');
    document.body.removeChild(ta);
    return Promise.resolve();
  }

  function enhanceCodeBlocks() {
    document.querySelectorAll('#post__content pre').forEach(function(pre) {
      if (pre.closest('.code-box')) return;
      var box = pre.closest('.highlighter-rouge');
      if (!box) {
        box = document.createElement('div');
        pre.parentNode.insertBefore(box, pre);
        box.appendChild(pre);
      }
      box.classList.add('code-box');

      var lang = (box.className.match(/language-(\S+)/) || [])[1];
      var bar = document.createElement('div');
      bar.className = 'code-box__bar';
      if (lang && lang !== 'plaintext' && lang !== 'text') {
        bar.innerHTML = '<span class="code-box__lang">' + lang + '</span>';
      }
      var copy = document.createElement('button');
      copy.type = 'button';
      copy.className = 'code-box__copy';
      copy.textContent = 'Sao chép';
      copy.addEventListener('click', function() {
        var code = pre.querySelector('code') || pre;
        copyText(code.innerText.replace(/\n$/, '')).then(function() {
          copy.textContent = 'Đã chép ✓';
          setTimeout(function() { copy.textContent = 'Sao chép'; }, 1500);
        });
      });
      bar.appendChild(copy);
      box.insertBefore(bar, box.firstChild);

      var lines = (pre.innerText.match(/\n/g) || []).length;
      if (lines > CODE_COLLAPSE_LINES) {
        box.classList.add('is-collapsed');
        var toggle = document.createElement('button');
        toggle.type = 'button';
        toggle.className = 'code-box__toggle';
        toggle.textContent = 'Xem toàn bộ (' + lines + ' dòng)';
        toggle.addEventListener('click', function() {
          var collapsed = box.classList.toggle('is-collapsed');
          toggle.textContent = collapsed ? 'Xem toàn bộ (' + lines + ' dòng)' : 'Thu gọn';
        });
        box.appendChild(toggle);
      }
    });
  }

  // ---------- Image zoom ----------
  var zoom = document.createElement('div');
  zoom.id = 'img-zoom';
  zoom.setAttribute('role', 'dialog');
  zoom.setAttribute('aria-label', 'Ảnh phóng to');
  zoom.innerHTML = '<img alt="">';
  document.body.appendChild(zoom);
  zoom.addEventListener('click', function() { zoom.classList.remove('is-open'); });
  document.addEventListener('keydown', function(e) {
    if (e.key === 'Escape') zoom.classList.remove('is-open');
  });

  $(document).on('click', '#post__content img', function() {
    if ($(this).closest('a').length) return;
    zoom.querySelector('img').src = this.currentSrc || this.src;
    zoom.querySelector('img').alt = this.alt;
    zoom.classList.add('is-open');
  });

  // ---------- Lazy Disqus ----------
  function loadDisqus(el) {
    var url = el.dataset.url, id = el.dataset.identifier;
    window.disqus_config = function() {
      this.page.url = url;
      this.page.identifier = id;
    };
    if (window.DISQUS) {
      window.DISQUS.reset({ reload: true, config: window.disqus_config });
      return;
    }
    var s = document.createElement('script');
    s.src = 'https://' + el.dataset.shortname + '.disqus.com/embed.js';
    s.setAttribute('data-timestamp', +new Date());
    document.body.appendChild(s);
  }

  var disqusObserver = null;
  function watchDisqus() {
    var el = document.getElementById('disqus_thread');
    if (disqusObserver) disqusObserver.disconnect();
    if (!el) return;
    if (!('IntersectionObserver' in window)) return loadDisqus(el);
    disqusObserver = new IntersectionObserver(function(entries) {
      if (entries[0].isIntersecting) {
        disqusObserver.disconnect();
        loadDisqus(el);
      }
    }, { rootMargin: '400px' });
    disqusObserver.observe(el);
  }

  window.blogEnhance = function() {
    buildToc();
    enhanceCodeBlocks();
    watchDisqus();
    updateActiveHeading();
    if (location.hash) {
      var target = document.getElementById(decodeURIComponent(location.hash.slice(1)));
      if (target) target.scrollIntoView();
    }
  };
})();
