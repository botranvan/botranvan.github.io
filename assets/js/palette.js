/*
 * Command palette (Ctrl/⌘ + K) and keyboard shortcuts.
 *   Ctrl/⌘ K, /   open the palette
 *   [  ]          previous (older) / next (newer) post
 *   ?             show shortcuts
 *   Esc           close
 */
(function() {
  var posts = JSON.parse(document.getElementById('posts-data').textContent);
  var GITHUB = $('#icon-github').attr('href');
  var RSS = $('#icon-feed').attr('href');

  // ---------- Helpers ----------
  function normalize(s) {
    return (s || '').toLowerCase().normalize('NFD').replace(/[̀-ͯ]/g, '').replace(/đ/g, 'd');
  }

  function escapeHtml(s) {
    return String(s).replace(/[&<>"]/g, function(c) {
      return { '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;' }[c];
    });
  }

  function isTyping(el) {
    return el && (el.isContentEditable || /^(INPUT|TEXTAREA|SELECT)$/.test(el.tagName));
  }

  function go(url) {
    if ($.support.pjax) {
      $.pjax({ url: url, container: '#pjax', fragment: '#pjax', timeout: 10000 });
    } else {
      location.href = url;
    }
  }

  var toastTimer;
  function toast(message) {
    var el = document.getElementById('palette-toast');
    el.textContent = message;
    el.classList.add('is-visible');
    clearTimeout(toastTimer);
    toastTimer = setTimeout(function() { el.classList.remove('is-visible'); }, 1800);
  }

  // posts are newest first: "next" = newer, "previous" = older (same as Jekyll page.next / page.previous)
  function currentIndex() {
    for (var i = 0; i < posts.length; i++) {
      if (posts[i].url === location.pathname) return i;
    }
    return -1;
  }
  function nextPost() {
    var i = currentIndex();
    return i === -1 ? posts[0] : posts[i - 1];
  }
  function previousPost() {
    var i = currentIndex();
    return i === -1 ? null : posts[i + 1];
  }

  function goNext() {
    var p = nextPost();
    if (p) go(p.url); else toast('This is the newest post');
  }
  function goPrevious() {
    var p = previousPost();
    if (p) go(p.url); else toast(currentIndex() === -1 ? 'Open a post first' : 'This is the oldest post');
  }

  var commands = [
    { title: 'Next post', keys: [']'], words: 'next sau moi hon', run: goNext,
      detail: function() { var p = nextPost(); return p ? p.title : ''; } },
    { title: 'Previous post', keys: ['['], words: 'previous prev cu hon', run: goPrevious,
      detail: function() { var p = previousPost(); return p ? p.title : ''; } },
    { title: 'Home', keys: [], words: 'home index', run: function() { go('/'); } },
    { title: 'About me', keys: [], words: 'about me lien he contact', run: function() { go('/about.html'); } },
    { title: 'Show/hide posts list', keys: [], words: 'sidebar menu toggle', run: function() { $('#js-fullscreen').trigger('click'); } },
    { title: 'Scroll to top', keys: [], words: 'top scroll', run: function() { $('#post').animate({ scrollTop: 0 }, 200); } },
    { title: 'Copy link to this page', keys: [], words: 'copy link url share',
      run: function() {
        var done = function() { toast('Link copied'); };
        if (navigator.clipboard && window.isSecureContext) navigator.clipboard.writeText(location.href).then(done);
        else window.prompt('Link:', location.href);
      } },
    { title: 'RSS', keys: [], words: 'feed subscribe', run: function() { window.open(RSS, '_blank', 'noopener'); } },
    { title: 'GitHub', keys: [], words: 'source code', run: function() { window.open(GITHUB, '_blank', 'noopener'); } },
    { title: 'Keyboard shortcuts', keys: ['?'], words: 'shortcuts help keyboard', run: function() { openPalette('help'); } }
  ];

  var shortcuts = [
    [['Ctrl', 'K'], 'Open command palette (⌘ K on macOS)'],
    [['/'], 'Search posts'],
    [[']'], 'Next post (newer)'],
    [['['], 'Previous post (older)'],
    [['?'], 'Show shortcuts'],
    [['↑', '↓', 'Enter'], 'Select in palette'],
    [['Esc'], 'Close']
  ];

  function kbd(keys) {
    return keys.map(function(k) { return '<kbd>' + escapeHtml(k) + '</kbd>'; }).join(' ');
  }

  // ---------- DOM ----------
  var root = document.createElement('div');
  root.id = 'palette';
  root.hidden = true;
  root.innerHTML =
    '<div class="palette__backdrop"></div>' +
    '<div class="palette__box" role="dialog" aria-modal="true" aria-label="Command palette">' +
      '<input class="palette__input" type="text" autocomplete="off" spellcheck="false" ' +
        'placeholder="Search posts or type a command..." aria-controls="palette-list">' +
      '<ul class="palette__list" id="palette-list" role="listbox"></ul>' +
      '<div class="palette__footer">' + kbd(['↑', '↓']) + ' move · ' + kbd(['Enter']) + ' open · ' +
        kbd(['Esc']) + ' close · ' + kbd(['?']) + ' shortcuts</div>' +
    '</div>';
  document.body.appendChild(root);

  var toastEl = document.createElement('div');
  toastEl.id = 'palette-toast';
  toastEl.setAttribute('role', 'status');
  document.body.appendChild(toastEl);

  var input = root.querySelector('.palette__input');
  var list = root.querySelector('.palette__list');
  var items = [];
  var selected = 0;
  var lastFocus = null;

  // ---------- Search ----------
  function search(query) {
    var tokens = normalize(query).split(/\s+/).filter(Boolean);
    function score(title, rest) {
      if (!tokens.length) return 1;
      var t = normalize(title), r = normalize(rest), s = 0;
      for (var i = 0; i < tokens.length; i++) {
        if (t.indexOf(tokens[i]) !== -1) s += t.indexOf(tokens[i]) === 0 ? 3 : 2;
        else if (r.indexOf(tokens[i]) !== -1) s += 1;
        else return 0;
      }
      return s;
    }

    var cmdResults = commands.map(function(c) {
      return { kind: 'cmd', cmd: c, score: score(c.title, c.words) };
    }).filter(function(r) {
      if (!r.score) return false;
      // Hide next/previous when there is nowhere to go
      if (r.cmd.run === goNext) return !!nextPost();
      if (r.cmd.run === goPrevious) return !!previousPost();
      return true;
    });

    var postResults = posts.map(function(p) {
      return { kind: 'post', post: p, score: score(p.title, p.description + ' ' + p.tags.join(' ') + ' ' + p.date) };
    }).filter(function(r) { return r.score; });

    if (tokens.length) {
      postResults.sort(function(a, b) { return b.score - a.score; });
      cmdResults.sort(function(a, b) { return b.score - a.score; });
      // When searching, posts come first; commands follow
      return postResults.concat(cmdResults);
    }
    return cmdResults.concat(postResults);
  }

  function render() {
    if (root.dataset.mode === 'help') {
      items = [];
      list.innerHTML = '<li class="palette__group">Keyboard shortcuts</li>' + shortcuts.map(function(s) {
        return '<li class="palette__help"><span>' + escapeHtml(s[1]) + '</span><span>' + kbd(s[0]) + '</span></li>';
      }).join('');
      return;
    }

    items = search(input.value);
    selected = Math.min(selected, Math.max(items.length - 1, 0));
    if (!items.length) {
      list.innerHTML = '<li class="palette__empty">No results found</li>';
      return;
    }

    var html = '', group = '';
    items.forEach(function(r, i) {
      var g = r.kind === 'cmd' ? 'Commands' : 'Posts';
      if (g !== group) {
        html += '<li class="palette__group" role="presentation">' + g + '</li>';
        group = g;
      }
      var title, sub, right;
      if (r.kind === 'cmd') {
        title = r.cmd.title;
        sub = r.cmd.detail ? r.cmd.detail() : '';
        right = kbd(r.cmd.keys);
      } else {
        title = r.post.title;
        sub = r.post.description;
        right = '<span class="palette__date">' + r.post.date + '</span>';
      }
      html += '<li class="palette__item' + (i === selected ? ' is-selected' : '') + '" role="option" data-index="' + i + '"' +
        (i === selected ? ' aria-selected="true"' : '') + '>' +
        '<span class="palette__text"><span class="palette__title">' + escapeHtml(title) + '</span>' +
        (sub ? '<span class="palette__sub">' + escapeHtml(sub) + '</span>' : '') + '</span>' +
        '<span class="palette__right">' + right + '</span></li>';
    });
    list.innerHTML = html;
    var current = list.querySelector('.is-selected');
    if (current) current.scrollIntoView({ block: 'nearest' });
  }

  function choose(i) {
    var r = items[i];
    if (!r) return;
    if (r.kind === 'cmd' && r.cmd.title === 'Keyboard shortcuts') {
      r.cmd.run();
      return;
    }
    closePalette();
    if (r.kind === 'cmd') r.cmd.run();
    else go(r.post.url);
  }

  // ---------- Open / close ----------
  function openPalette(mode) {
    root.dataset.mode = mode || '';
    if (root.hidden) {
      lastFocus = document.activeElement;
      root.hidden = false;
      input.value = '';
      selected = 0;
    }
    render();
    input.focus();
  }

  function closePalette() {
    if (root.hidden) return;
    root.hidden = true;
    if (lastFocus && lastFocus.focus) lastFocus.focus();
  }

  window.openPalette = openPalette;

  input.addEventListener('input', function() {
    root.dataset.mode = '';
    selected = 0;
    render();
  });

  input.addEventListener('keydown', function(e) {
    if (e.key === 'ArrowDown' || e.key === 'ArrowUp') {
      e.preventDefault();
      if (!items.length) return;
      selected = (selected + (e.key === 'ArrowDown' ? 1 : -1) + items.length) % items.length;
      render();
    } else if (e.key === 'Enter') {
      e.preventDefault();
      choose(selected);
    } else if (e.key === 'Escape') {
      e.preventDefault();
      if (root.dataset.mode === 'help') { root.dataset.mode = ''; render(); }
      else closePalette();
    }
  });

  list.addEventListener('mousemove', function(e) {
    var li = e.target.closest('.palette__item');
    if (li && +li.dataset.index !== selected) {
      selected = +li.dataset.index;
      render();
    }
  });
  list.addEventListener('click', function(e) {
    var li = e.target.closest('.palette__item');
    if (li) choose(+li.dataset.index);
  });
  root.querySelector('.palette__backdrop').addEventListener('click', closePalette);

  $(document).on('click', '.js-open-palette', function(e) {
    e.preventDefault();
    openPalette();
  });

  // ---------- Global shortcuts ----------
  document.addEventListener('keydown', function(e) {
    if ((e.ctrlKey || e.metaKey) && !e.altKey && (e.key === 'k' || e.key === 'K')) {
      e.preventDefault();
      if (root.hidden) openPalette(); else closePalette();
      return;
    }
    if (!root.hidden || isTyping(e.target) || e.ctrlKey || e.metaKey || e.altKey) return;

    if (e.key === '/') { e.preventDefault(); openPalette(); }
    else if (e.key === '?') { e.preventDefault(); openPalette('help'); }
    else if (e.key === ']') { e.preventDefault(); goNext(); }
    else if (e.key === '[') { e.preventDefault(); goPrevious(); }
  });
})();
