/* ==========================================================================
   xhxh.vip 首页 · v0 改造脚本
   --------------------------------------------------------------------------
   职责：读 json/pintree.json → 渲染侧栏 / 面包屑 / 页头 / 文件夹 / 站点，
        并处理搜索（实时过滤 + 键盘导航）、文件夹密码、视图切换、移动抽屉。
   数据格式、加密方式（btoa 比对）、主题（html.dark + localStorage）与旧版一致，
   因此可以直接替换旧 index.html 里的内联脚本，不影响 pintree.json。
   ========================================================================== */
(function () {
  'use strict';

  /* ==========================================================================
     拼音首字母表（汉字 → 首字母）
     --------------------------------------------------------------------------
     覆盖 GB2312 全部 6763 个汉字 + 站点数据里的 50 个生僻字，共 6813 字。
     由 pypinyin 生成：lazy_pinyin(字, style=FIRST_LETTER) 取第一个读音。
     新增站点如果用了表外的生僻字，那个字不会贡献首字母（其余字照常匹配），
     需要补表时重新跑一遍生成脚本即可，表只有 20KB。
     ========================================================================== */
  /* 拼音首字母表在 js/xh-py.js（约 20KB 的生成数据）。没加载成功就退化为不支持拼音搜索。 */
  /* 拼音数据在 js/xh-py.js（音节表 + 6813 字索引，约 37KB）。没加载成功就不支持拼音搜索。 */
  var PY = window.__XH_PY || null;

  var ICON = {
    folder: '<svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="1.7" stroke-linejoin="round"><path d="M3 7a2 2 0 0 1 2-2h4.2l1.8 2H19a2 2 0 0 1 2 2v8a2 2 0 0 1-2 2H5a2 2 0 0 1-2-2V7Z"/></svg>',
    folderFill: '<svg viewBox="0 0 24 24" fill="currentColor"><path d="M3 7a2 2 0 0 1 2-2h4.2l1.8 2H19a2 2 0 0 1 2 2v8a2 2 0 0 1-2 2H5a2 2 0 0 1-2-2V7Z"/></svg>',
    lock: '<svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2"><rect x="5" y="10.5" width="14" height="9.5" rx="2.5"/><path d="M8.5 10.5V7.8a3.5 3.5 0 0 1 7 0v2.7"/></svg>',
    chev: '<svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2.2" stroke-linecap="round" stroke-linejoin="round"><path d="m9 6 6 6-6 6"/></svg>',
    search: '<svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="1.9" stroke-linecap="round"><circle cx="11" cy="11" r="6.5"/><path d="m16 16 4 4"/></svg>',
    empty: '<svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="1.6" stroke-linecap="round"><circle cx="11" cy="11" r="6.5"/><path d="m16 16 4 4M8.5 11h5"/></svg>'
  };

  // ---------- 工具 ----------
  function $(sel, root) { return (root || document).querySelector(sel); }
  function el(tag, cls, text) {
    var n = document.createElement(tag);
    if (cls) n.className = cls;
    if (text != null) n.textContent = text;
    return n;
  }
  function fmt(n) { return Number(n).toLocaleString('zh-CN'); }
  function esc(s) {
    return String(s).replace(/[&<>"]/g, function (c) {
      return { '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;' }[c];
    });
  }
  // 高亮命中片段（先转义再插入 <mark>）
  function highlight(text, q) {
    var s = String(text == null ? '' : text);
    if (!q) return esc(s);
    var i = s.toLowerCase().indexOf(q);
    if (i < 0) return esc(s);
    return esc(s.slice(0, i)) + '<mark>' + esc(s.slice(i, i + q.length)) + '</mark>' + esc(s.slice(i + q.length));
  }
  // ---------- 拼音（首字母 + 全拼共用一份表） ----------
  var _pyChar = null;   // 汉字 → 音节
  function pyChar() {
    if (_pyChar) return _pyChar;
    _pyChar = Object.create(null);
    if (!PY || !PY.chars || !PY.idx || !PY.syl) return _pyChar;
    for (var i = 0, n = PY.chars.length; i < n; i++) {
      var syl = PY.syl[parseInt(PY.idx.substr(i * 2, 2), 36)];
      if (syl) _pyChar[PY.chars.charAt(i)] = syl;
    }
    return _pyChar;
  }

  /* 标题 → { init: 'bdwp', full: 'baiduwangpan' }
     只取汉字，西文/数字/符号一律跳过 —— 否则输入 bd 会被「…HubDaily」这类
     网址和英文词顶掉；英文站直接打名字走标题匹配就行。 */
  function pinyinOf(str) {
    if (!str) return { init: '', full: '' };
    var m = pyChar(), init = '', full = '';
    for (var i = 0, n = str.length; i < n; i++) {
      var syl = m[str.charAt(i)];
      if (syl) { init += syl.charAt(0); full += syl; }
    }
    return { init: init, full: full };
  }

  /* 查询串是否作为「完整单词」出现在标题里：
     ai 命中「AI提示词」算，命中「Baidugle」里的 baidu 不算（后面还连着字母）。
     靠它把「AI 提示词」排到「爱PPT」前面，同时不让 Baidugle 压过百度。 */
  function wordHit(title, q) {
    var i = title.indexOf(q);
    while (i > -1) {
      var before = i === 0 ? '' : title.charAt(i - 1);
      var after = title.charAt(i + q.length);
      if (!/[a-z0-9]/.test(before) && !/[a-z0-9]/.test(after)) return true;
      i = title.indexOf(q, i + 1);
    }
    return false;
  }

  /* 标题里命中位置的「词首程度」：0 = 开头，1 = 跟在标点/空格/汉字后，2 = 夹在英文单词里 */
  function wordRank(title, q) {
    var i = title.indexOf(q);
    if (i < 0) return 3;
    if (i === 0) return 0;
    return /[a-z0-9]/.test(title.charAt(i - 1)) ? 2 : 1;
  }

  // monogram 六档：由域名/标题做稳定哈希，同一个站永远同一个图标
  function toneOf(key) {
    var s = String(key || ''), h = 0;
    for (var i = 0; i < s.length; i++) h = (h * 31 + s.charCodeAt(i)) | 0;
    return Math.abs(h) % 6;
  }
  function monogram(name, url) {
    var host = String(url || '').replace(/^https?:\/\//, '').replace(/^www\./, '');
    var base = host.split('/')[0].split('.')[0] || name || '?';
    var first = String(name || '').trim().charAt(0);
    // 中文标题用首字，英文站点用域名首字母（Google → G，Bing → B）
    var ch = /[\u4e00-\u9fa5]/.test(first) ? first : (base.charAt(0) || '?').toUpperCase();
    return { ch: ch, tone: toneOf(host || name) };
  }
  function scrollToEl(node) {
    var top = node.getBoundingClientRect().top + window.pageYOffset - 140;
    window.scrollTo({ top: Math.max(0, top), behavior: 'smooth' });
  }

  // ---------- URL 同步 ----------
  /* 规则：搜索 ?q= ，分类 ?p=（多层用 / 分隔，逐层 encodeURIComponent）。
     打字用 replaceState（不会给每个字符留一条历史），点分类用 pushState，
     popstate 只还原不写回。 */
  function urlFor() {
    var parts = [];
    if (state.query) {
      parts.push('q=' + encodeURIComponent(state.query));
    } else if (state.path.length > 2) {
      parts.push('p=' + state.path.slice(2).map(function (x) {
        return encodeURIComponent(x.title);
      }).join('/'));
    }
    /* 已加载条数也写进地址：刷新后按这个数补足批次，
       不然长列表刷新一下就回到前 96 条，等于前面白翻。只在超过一批时才写，保持地址干净 */
    if (state.shown > CHUNK) parts.push('n=' + state.shown);
    return location.pathname + (parts.length ? '?' + parts.join('&') : '') + location.hash;
  }

  function syncUrl(mode) {
    if (mode === 'none') return;
    try {
      var url = urlFor();
      if (url === location.pathname + location.search + location.hash) return;
      if (mode === 'push') history.pushState({ xh: 1 }, '', url);
      else history.replaceState({ xh: 1 }, '', url);
    } catch (e) {}
  }

  function readUrl() {
    var out = { q: '', p: [], n: 0 };
    try {
      var mq = location.search.match(/[?&]q=([^&]*)/);
      if (mq) out.q = decodeURIComponent(mq[1].replace(/\+/g, ' '));
      var mp = location.search.match(/[?&]p=([^&]*)/);
      if (mp) {
        out.p = mp[1].split('/').map(function (seg) {
          try { return decodeURIComponent(seg); } catch (e) { return seg; }
        }).filter(Boolean);
      }
      var mn = location.search.match(/[?&]n=(\d+)/);
      if (mn) out.n = Math.min(parseInt(mn[1], 10) || 0, 5000);
    } catch (e) {}
    return out;
  }

  // ---------- 状态 ----------
  var state = {
    root: null,
    path: [],          // [{title, children}]
    query: '',
    results: null,     // {links:[], folders:[], total}
    cursor: -1,
    engine: 'local',
    engineEl: null,
    view: 'grid',
    shown: 0,          // 当前已渲染的站点卡数量（写进 URL 的 n）
    flatLinks: [],     // 全站扁平站点索引，用于搜索
    flatFolders: []    // 全站扁平分类索引，用于搜索
  };

  // ---------- 数据 ----------
  var _promise = null;
  function loadBookmarks() {
    if (!_promise) {
      var pending = window.__xhData || (window.__xhLoadData
        ? window.__xhLoadData()
        : fetch('json/pintree.json', { cache: 'no-cache' }).then(function (r) { return r.json(); }));
      _promise = pending.catch(function (err) { _promise = null; window.__xhData = null; throw err; });
    }
    return _promise;
  }

  function indexAll(node, pathTitles, out, folders) {
    var kids = node.children || [];
    for (var i = 0; i < kids.length; i++) {
      var it = kids[i];
      if (it.type === 'folder') {
        folders.push({ title: it.title, node: it, path: pathTitles.join(' / ') });
        indexAll(it, pathTitles.concat(it.title), out, folders);
      } else if (it.url) {
        var py = pinyinOf(it.title || '');
        out.push({
          title: it.title || '',
          url: it.url,
          path: pathTitles.join(' / '),
          init: py.init,
          full: py.full,
          hay: (it.title || '').toLowerCase() + ' ' + it.url.toLowerCase()
        });
      }
    }
    return out;
  }

  function countLinks(node) {
    var kids = node.children || [], n = 0;
    for (var i = 0; i < kids.length; i++) {
      n += kids[i].type === 'folder' ? countLinks(kids[i]) : 1;
    }
    return n;
  }
  function countItems(node) { return (node.children || []).length; }

  // ---------- 侧栏 ----------
  function navItem(opts) {
    var b = el('button', 'nav-item');
    b.type = 'button';
    b.innerHTML = ICON.folder;
    b.appendChild(el('span', 'n', opts.title));
    b.appendChild(el('span', 'c', fmt(opts.count)));
    b.setAttribute('data-id', String(opts.id));
    b.setAttribute('data-path', opts.path || '');
    b.title = opts.title;
    b.addEventListener('click', opts.onClick);
    return b;
  }

  /* 展开状态：按一级分类标题记，存 localStorage。只做两层，
     （原站递归整棵树，321 个分类全铺开会把侧栏拉成一条长龙） */
  var navOpen = null;
  function loadNavOpen() {
    if (navOpen) return navOpen;
    navOpen = {};
    try {
      var raw = localStorage.getItem('xh-nav');
      if (raw) JSON.parse(raw).forEach(function (t) { navOpen[t] = true; });
    } catch (e) {}
    return navOpen;
  }
  function saveNavOpen() {
    if (!navOpen) return;
    try {
      var keys = [];
      for (var k in navOpen) if (navOpen[k]) keys.push(k);
      localStorage.setItem('xh-nav', JSON.stringify(keys));
    } catch (e) {}
  }

  function renderNav(container) {
    if (!container) return;
    container.innerHTML = '';
    var root = state.root;
    var open = loadNavOpen();
    var homePath = [{ title: '书签', children: root.children }, root];

    container.appendChild(navItem({
      id: 'home',
      path: '',
      title: root.title || '书签栏',
      count: countLinks(root),
      onClick: function () { go(homePath, true); closeDrawer(); }
    }));

    container.appendChild(el('div', 'nav-label', '分类'));
    var kids = (root.children || []).filter(function (c) { return c.type === 'folder'; });

    kids.forEach(function (f, i) {
      var subs = (f.children || []).filter(function (c) { return c.type === 'folder'; });
      var item = navItem({
        id: 'f' + i,
        path: f.title,
        title: f.title,
        count: countLinks(f),
        onClick: function () { openFolder(homePath, f); closeDrawer(); }
      });

      if (!subs.length) { container.appendChild(item); return; }

      var row = el('div', 'nav-row');
      row.appendChild(item);

      var tog = el('button', 'nav-tog');
      tog.type = 'button';
      tog.innerHTML = ICON.chev;
      tog.setAttribute('aria-expanded', open[f.title] ? 'true' : 'false');
      tog.setAttribute('aria-label', (open[f.title] ? '收起' : '展开') + f.title + '的子分类');
      row.appendChild(tog);
      container.appendChild(row);

      var box = el('div', 'nav-sub');
      box.hidden = !open[f.title];
      container.appendChild(box);

      function buildSub() {
        if (box.childNodes.length) return;
        var deep = homePath.concat({ title: f.title, children: f.children });
        subs.forEach(function (sf, j) {
          box.appendChild(navItem({
            id: 'f' + i + '-' + j,
            path: f.title + '/' + sf.title,
            title: sf.title,
            count: countLinks(sf),
            onClick: function () { openFolder(deep, sf); closeDrawer(); }
          }));
        });
      }
      if (open[f.title]) buildSub();

      tog.addEventListener('click', function () {
        var on = !open[f.title];
        open[f.title] = on;
        if (on) buildSub();
        box.hidden = !on;
        tog.setAttribute('aria-expanded', on ? 'true' : 'false');
        tog.setAttribute('aria-label', (on ? '收起' : '展开') + f.title + '的子分类');
        saveNavOpen();
      });
    });
  }

  /* 当前路径在二级里时，自动把所属一级展开 */
  function expandForPath() {
    if (!state.path.length || state.path.length < 3) return;
    var open = loadNavOpen();
    var top = state.path[2].title;
    if (open[top]) return;
    open[top] = true;
    saveNavOpen();
    renderNav($('#navigation'));
    if (drawerNav && !drawer.hidden) renderNav(drawerNav);
  }

  function syncNavActive() {
    if (!state.path.length) return;
    var cur = state.path.length === 2
      ? ''
      : state.path.slice(2).map(function (x) { return x.title; }).join('/');
    var nodes = document.querySelectorAll('.nav-item');
    for (var i = 0; i < nodes.length; i++) {
      var n = nodes[i];
      n.classList.toggle('is-active', n.getAttribute('data-path') === cur);
    }
  }

  // ---------- 密码 ----------
  function askFolderPassword(title, lockHash) {
    return new Promise(function (resolve) {
      var back = el('div', 'xh-pw-back');
      back.innerHTML =
        '<div class="xh-pw" role="dialog" aria-modal="true" aria-label="解锁文件夹">' +
        '<h2 class="xh-pw-title">该文件夹已加密</h2>' +
        '<p class="xh-pw-desc"></p>' +
        '<form class="xh-pw-form" novalidate>' +
        '<input class="xh-pw-input" type="password" placeholder="输入密码" autocomplete="off" aria-label="文件夹密码">' +
        '<p class="xh-pw-error" role="alert" hidden>密码不正确，请重试</p>' +
        '<div class="xh-pw-actions">' +
        '<button type="button" class="xh-pw-cancel">取消</button>' +
        '<button type="submit" class="xh-pw-ok">解锁</button>' +
        '</div></form></div>';
      var input = $('.xh-pw-input', back);
      var err = $('.xh-pw-error', back);
      $('.xh-pw-desc', back).textContent = '输入密码以打开「' + title + '」';

      function done(ok) {
        document.removeEventListener('keydown', onKey);
        back.remove();
        resolve(ok);
      }
      function onKey(e) { if (e.key === 'Escape') done(false); }
      document.addEventListener('keydown', onKey);
      back.addEventListener('click', function (e) { if (e.target === back) done(false); });
      $('.xh-pw-cancel', back).addEventListener('click', function () { done(false); });
      $('form', back).addEventListener('submit', function (e) {
        e.preventDefault();
        var encoded = '';
        try { encoded = btoa(input.value); } catch (e2) { encoded = ''; }
        if (encoded === lockHash) { done(true); }
        else { err.hidden = false; input.focus(); input.select(); }
      });
      document.body.appendChild(back);
      input.focus();
    });
  }

  // ---------- 渲染 ----------
  var bookmarksBox, h1Box, subBox, crumbsBox;

  function buildFolderCard(folder, pathForChild) {
    var btn = el('button', 'folder');
    btn.type = 'button';
    var ico = el('span', 'folder-ico');
    ico.innerHTML = ICON.folderFill;
    var meta = el('span', 'folder-meta');
    meta.appendChild(el('span', 'folder-name', folder.title));
    meta.appendChild(el('span', 'folder-count', fmt(countLinks(folder)) + ' 个站点'));
    btn.appendChild(ico);
    btn.appendChild(meta);
    if (folder.lock) {
      var lk = el('span', 'folder-lock');
      lk.innerHTML = ICON.lock;
      lk.setAttribute('aria-label', '已加密');
      btn.appendChild(lk);
    }
    btn.setAttribute('aria-label', folder.title + '，' + countLinks(folder) + ' 个站点');
    btn.addEventListener('click', function () { openFolder(pathForChild, folder); });
    return btn;
  }

  function buildLinkCard(link, q) {
    var a = el('a', 'link');
    a.href = link.url;
    a.target = '_blank';
    a.rel = 'noopener noreferrer';
    a.title = link.title + '\n' + link.url + (link.path ? '\n' + link.path : '');

    var mg = monogram(link.title, link.url);
    var tile = el('span', 'mono');
    tile.setAttribute('data-t', String(mg.tone));
    tile.textContent = mg.ch;
    tile.setAttribute('aria-hidden', 'true');

    var meta = el('span', 'link-meta');
    var name = el('span', 'link-name');
    name.innerHTML = highlight(link.title, q);
    var url = el('span', 'link-url');
    var clean = String(link.url).replace(/^https?:\/\//, '').replace(/\/$/, '');
    url.innerHTML = highlight(clean, q);
    meta.appendChild(name);
    meta.appendChild(url);

    a.appendChild(tile);
    a.appendChild(meta);
    return a;
  }

  function sectionHead(title, count) {
    var head = el('div', 'sect-head');
    head.appendChild(el('span', 'sect-title', title));
    head.appendChild(el('span', 'sect-count', fmt(count)));
    head.appendChild(el('span', 'sect-rule'));
    return head;
  }

  /* ---------- 分批渲染 ----------
     「软件开发」有 445 条，一次全塞进 DOM 会让首屏解析、滚动、Ctrl+F 都发涩。
     做法：先渲染 CHUNK 条，滚到距底部 600px 内自动接上下一批；
     同时留一个手动按钮兜底（键盘用户 / IntersectionObserver 不可用 / 想直接到底）。
     与虚拟滚动相比，已渲染的卡片始终在 DOM 里，浏览器原生查找和页面内锚点都还能用。 */
  var CHUNK = 96;
  var more = null;   // { grid, items, shown, foot, obs, q }

  function mountLinks(parent, items, q) {
    var grid = el('div', 'links');
    parent.appendChild(grid);

    var st = { grid: grid, items: items, shown: 0, foot: null, obs: null, q: q || '' };
    more = st;

    st.shown = Math.min(CHUNK, items.length);
    state.shown = st.shown;
    appendBatch(st, 0, st.shown);

    if (items.length > st.shown) {
      st.foot = el('div', 'loadmore');
      var btn = el('button', 'loadmore-btn');
      btn.type = 'button';
      btn.addEventListener('click', loadMore);
      st.foot.appendChild(btn);
      st.foot.appendChild(el('span', 'loadmore-hint'));
      parent.appendChild(st.foot);
      updateFoot(st);

      if (window.IntersectionObserver) {
        st.obs = new IntersectionObserver(function (entries) {
          for (var i = 0; i < entries.length; i++) {
            if (entries[i].isIntersecting) { loadMore(); return; }
          }
        }, { rootMargin: '600px 0px' });
        st.obs.observe(st.foot);
      }
    }
    return st;
  }

  function appendBatch(st, from, to) {
    var frag = document.createDocumentFragment();
    for (var i = from; i < to; i++) frag.appendChild(buildLinkCard(st.items[i], st.q));
    st.grid.appendChild(frag);
  }

  function loadMore() {
    var st = more;
    if (!st || st.shown >= st.items.length) return;
    var from = st.shown;
    var to = Math.min(st.items.length, from + CHUNK);
    appendBatch(st, from, to);
    st.shown = to;
    state.shown = to;
    if (st.shown >= st.items.length) finishMore(st); else updateFoot(st);
    if (!state.preloading) syncUrlSoon();
  }

  function updateFoot(st) {
    if (!st.foot) return;
    var btn = st.foot.querySelector('.loadmore-btn');
    var hint = st.foot.querySelector('.loadmore-hint');
    if (btn) btn.textContent = '加载更多（还有 ' + fmt(st.items.length - st.shown) + ' 个）';
    if (hint) hint.textContent = '已显示 ' + fmt(st.shown) + ' / ' + fmt(st.items.length) + ' 个站点';
  }

  function finishMore(st) {
    if (st.obs) { st.obs.disconnect(); st.obs = null; }
    if (st.foot) {
      st.foot.innerHTML = '';
      st.foot.appendChild(el('span', 'loadmore-end', '— 全部 ' + fmt(st.items.length) + ' 个站点已显示 —'));
    }
  }

  function resetMore() {
    if (more && more.obs) more.obs.disconnect();
    more = null;
    state.shown = 0;
  }

  /* ---------- 滚动位置 ----------
     浏览器自己的滚动恢复对「加载后才长高的页面」基本无效，
     所以位置自己记：key 只用分类/搜索词（不含 n），这样翻多少批都指向同一条记录。 */
  function scrollKey() {
    var k = state.query
      ? 'q:' + state.query
      : 'p:' + state.path.slice(2).map(function (x) { return x.title; }).join('/');
    return 'xh-y:' + k;
  }

  /* 按地址里的 n 补足批次（补完把 n 写回去），再把滚动位置放回去 */
  function preloadAndRestore(n) {
    if (n > (more ? more.shown : 0)) {
      state.preloading = true;
      var guard = 0;
      while (more && more.shown < n && guard++ < 200) loadMore();
      state.preloading = false;
      syncUrl('replace');
    }
    restoreScroll();
  }

  function restoreScroll() {
    var y = 0;
    try { y = parseInt(sessionStorage.getItem(scrollKey()), 10) || 0; } catch (e) {}
    if (!y) return;
    requestAnimationFrame(function () { window.scrollTo(0, y); });
  }

  var _urlTimer = null;
  function syncUrlSoon() {
    clearTimeout(_urlTimer);
    _urlTimer = setTimeout(function () { syncUrl('replace'); }, 250);
  }

  function renderCrumbs() {
    crumbsBox.innerHTML = '';
    if (state.query) return;
    if (state.path.length <= 2) return;
    state.path.forEach(function (item, i) {
      if (i > 0) crumbsBox.appendChild(el('span', 'sep', '/'));
      var isLast = i === state.path.length - 1;
      if (isLast) {
        crumbsBox.appendChild(el('span', '', item.title));
      } else {
        var a = el('a', '', item.title);
        a.href = '#';
        a.addEventListener('click', function (e) {
          e.preventDefault();
          go(state.path.slice(0, i + 1), true);
        });
        crumbsBox.appendChild(a);
      }
    });
  }

  function render() {
    resetMore();                 // 上一屏的观察器要摘掉，否则会往已移除的网格里继续追加
    bookmarksBox.innerHTML = '';

    if (state.query && state.results) {
      renderSearchView();
      syncNavActive();
      return;
    }

    var node = state.path[state.path.length - 1];
    var kids = node.children || [];
    var folders = kids.filter(function (x) { return x.type === 'folder'; });
    var links = kids.filter(function (x) { return x.type === 'link' && x.url; });

    h1Box.textContent = node.title || '书签栏';
    subBox.innerHTML = '';
    if (folders.length) subBox.insertAdjacentHTML('beforeend', '<b>' + folders.length + '</b> 个分类');
    if (folders.length && links.length) subBox.insertAdjacentHTML('beforeend', ' · ');
    if (links.length) subBox.insertAdjacentHTML('beforeend', '<b>' + links.length + '</b> 个站点');
    if (!folders.length && !links.length) subBox.textContent = '这个文件夹还是空的';
    document.title = (node.title ? node.title + ' · ' : '') + '小胡小胡的书签收藏 | 小胡的工具站';

    renderCrumbs();

    if (folders.length) {
      var fs = el('section', 'sect');
      fs.appendChild(sectionHead('分类', folders.length));
      var fgrid = el('div', 'folders');
      folders.forEach(function (f) { fgrid.appendChild(buildFolderCard(f, state.path)); });
      fs.appendChild(fgrid);
      bookmarksBox.appendChild(fs);
    }

    if (links.length) {
      var ls = el('section', 'sect');
      ls.appendChild(sectionHead('站点', links.length));
      mountLinks(ls, links, '');
      bookmarksBox.appendChild(ls);
    }

    if (!folders.length && !links.length) renderEmpty('这个文件夹还没有内容', '换一个分类看看，或者用上面的搜索框直接找站点。');
    syncNavActive();
    expandForPath();
  }

  function renderSearchView() {
    var r = state.results;
    h1Box.textContent = '搜索结果';
    subBox.innerHTML = '找到 <b>' + fmt(r.total) + '</b> 个匹配 · 关键词「' + esc(state.query) + '」';
    document.title = state.query + ' · 搜索结果';

    if (!r.total) {
      renderEmpty('没有找到匹配的书签', '换个关键词试试——中文、网址、拼音首字母（bd）或全拼（baidu）都能搜。', true);
      return;
    }

    if (r.folders.length) {
      var fs = el('section', 'sect');
      fs.appendChild(sectionHead('匹配的分类', r.folders.length));
      var fg = el('div', 'folders');
      var searchBase = [{ title: '书签', children: state.root.children }, state.root];
      var shownFolders = r.folders.slice(0, 24);
      shownFolders.forEach(function (f) {
        fg.appendChild(buildFolderCard(f.node, searchBase));
      });
      fs.appendChild(fg);
      /* 分类卡不做分批，但被截掉的要说清楚，否则「找到 N 个匹配」和实际卡片数量对不上 */
      var restFolders = r.folders.length - shownFolders.length;
      if (restFolders > 0) {
        fs.appendChild(el('p', 'sect-note', '还有 ' + restFolders + ' 个匹配的分类未显示，继续输入可以缩小范围。'));
      }
      bookmarksBox.appendChild(fs);
    }

    var ls = el('section', 'sect');
    ls.appendChild(sectionHead('匹配的站点', r.links.length));
    mountLinks(ls, r.links, state.query.toLowerCase());
    bookmarksBox.appendChild(ls);

    state.cursor = -1;
  }

  function renderEmpty(title, desc, withClear) {
    var box = el('div', 'state');
    box.innerHTML = ICON.empty;
    box.appendChild(el('h2', '', title));
    box.appendChild(el('p', '', desc));
    if (withClear) {
      var b = el('button', 'state-btn', '清空搜索');
      b.type = 'button';
      b.addEventListener('click', clearSearch);
      box.appendChild(b);
    }
    bookmarksBox.appendChild(box);
  }

  function renderError(err, heading) {
    bookmarksBox.innerHTML = '';
    var box = el('div', 'state');
    box.setAttribute('role', 'alert');
    box.appendChild(el('h2', '', heading || '书签数据加载失败'));
    box.appendChild(el('p', '', '没能读取书签数据，请检查网络后重试。'));
    if (err && err.message) box.appendChild(el('small', 'detail', '原因：' + err.message));
    var b = el('button', 'state-btn', '重新加载');
    b.type = 'button';
    b.addEventListener('click', function () { _promise = null; window.__xhData = null; location.reload(); });
    box.appendChild(b);
    bookmarksBox.appendChild(box);
  }

  // ---------- 导航 ----------
  function openFolder(basePath, folder) {
    var run = function () {
      go(basePath.concat({ title: folder.title, children: folder.children }), true);
    };
    if (folder.lock) {
      askFolderPassword(folder.title, folder.lock).then(function (ok) { if (ok) run(); });
    } else {
      run();
    }
  }

  function go(path, resetScroll, mode) {
    state.path = path;
    state.query = '';
    state.results = null;
    var input = $('#searchInput');
    if (input) input.value = '';
    render();
    syncUrl(mode || 'push');
    if (resetScroll) window.scrollTo({ top: 0, behavior: 'auto' });
  }

  /* 把 ?p= 的层级还原成 path；某一层找不到就停在上一层 */
  function resolvePath(segs) {
    var node = state.root;
    var path = [{ title: '书签', children: state.root.children }, state.root];
    for (var i = 0; i < segs.length; i++) {
      var kids = node.children || [], found = null;
      for (var j = 0; j < kids.length; j++) {
        if (kids[j].type === 'folder' && kids[j].title === segs[i]) { found = kids[j]; break; }
      }
      if (!found) break;
      /* 加密文件夹不能靠 URL 绕过密码：停在它的上一层，URL 会自愈成上一层 */
      if (found.lock) break;
      path = path.concat({ title: found.title, children: found.children });
      node = found;
    }
    return path;
  }

  // ---------- 搜索 ----------
  function runSearch(q, mode) {
    q = String(q || '').trim();
    state.query = q;
    if (!q) { state.results = null; render(); syncUrl('replace'); return; }

    var lower = q.toLowerCase();
    var letters = /^[a-z]{2,}$/.test(lower);   // 纯字母、至少两位才走拼音，避免单个字母命中一大片
    var links = [];
    var folders = [];

    var all = state.flatLinks;
    for (var i = 0; i < all.length; i++) {
      var it = all[i];
      var title = it.title.toLowerCase();
      var init = it.init || '';
      var full = it.full || '';
      var score = 99;   /* 99 = 没命中；不能再用 -1 当哨兵，标题完全相等的得分就是 -1 */

      /* 排序意图（越小越前）：
         标题完全相等 > 首字母完全相等 > 首字母开头 > 标题整词命中
         > 全拼完全相等 > 标题含关键词 > 全拼开头 > 首字母含 > 全拼含 > 网址含。
         ai 时「AI 提示词」整词命中排最前，爱PPT（拼音 ai）在后；
         baidu 时「百度」全拼相等排最前，Baidugle 只是子串，靠后。 */
      if (title === lower) score = -1;
      else if (letters && init === lower) score = 0;
      else if (letters && init.indexOf(lower) === 0) score = 1;
      else if (wordHit(title, lower)) score = 2;
      else if (letters && full === lower) score = 3;
      else if (title.indexOf(lower) > -1) score = 4;
      else if (letters && full.indexOf(lower) === 0) score = 5;
      else if (letters && init.indexOf(lower) > -1) score = 6;
      else if (letters && full.indexOf(lower) > -1) score = 7;
      else if (it.hay.indexOf(lower) > -1) score = 8;
      if (score < 99) {
        it.score = score;
        it.rank = (score === 2 || score === 4) ? wordRank(title, lower) : 0;
        links.push(it);
      }
    }
    // 先按命中层级，再按「词首优先」，同级保持原顺序
    links.sort(function (a, b) { return (a.score - b.score) || (a.rank - b.rank); });

    // 分类名命中（全量索引）
    for (var j = 0; j < state.flatFolders.length; j++) {
      var f = state.flatFolders[j];
      var fpy = letters ? pinyinOf(f.title) : null;
      if (f.title.toLowerCase().indexOf(lower) > -1
        || (letters && (fpy.init.indexOf(lower) > -1 || fpy.full.indexOf(lower) > -1))) {
        folders.push(f);
      }
    }
    state.results = { links: links, folders: folders, total: links.length + folders.length };
    state.cursor = -1;
    render();
    syncUrl(mode || 'replace');
  }

  function clearSearch() {
    var input = $('#searchInput');
    if (input) { input.value = ''; input.focus(); }
    state.query = '';
    state.results = null;
    render();
    syncUrl('replace');
  }

  function moveCursor(delta) {
    var cards = bookmarksBox.querySelectorAll('.link, .folder');
    if (!cards.length) return;
    var next = state.cursor + delta;
    if (next < 0) next = 0;
    if (next > cards.length - 1) next = cards.length - 1;
    if (state.cursor > -1 && cards[state.cursor]) cards[state.cursor].classList.remove('is-cursor');
    state.cursor = next;
    cards[next].classList.add('is-cursor');
    scrollToEl(cards[next]);
  }

  function openCursor() {
    var cards = bookmarksBox.querySelectorAll('.link, .folder');
    if (!cards.length) return false;
    var node = cards[state.cursor > -1 ? state.cursor : 0];
    if (!node) return false;
    if (node.tagName === 'A') { window.open(node.href, '_blank', 'noopener'); return true; }
    node.click();
    return true;
  }

  // ---------- 引擎 ----------
  function bindEngines() {
    var wrap = $('#engines');
    if (!wrap) return;
    var opts = wrap.querySelectorAll('.engine');
    function sync() {
      for (var i = 0; i < opts.length; i++) {
        var on = opts[i].getAttribute('data-value') === state.engine;
        opts[i].classList.toggle('is-on', on);
        opts[i].setAttribute('aria-pressed', on ? 'true' : 'false');
      }
    }
    for (var i = 0; i < opts.length; i++) {
      opts[i].addEventListener('click', function () {
        state.engine = this.getAttribute('data-value');
        state.engineEl = this;
        sync();
        if (state.engine !== 'local' && state.query) clearSearch();
      });
    }
    sync();
  }

  function submitSearch() {
    var input = $('#searchInput');
    var q = input ? input.value.trim() : '';
    if (!q) return;

    if (state.engine !== 'local') {
      var opt = state.engineEl;
      if (opt && opt.getAttribute('data-copy-query') === '1' && navigator.clipboard && navigator.clipboard.writeText) {
        navigator.clipboard.writeText(q).then(function () {
          var old = input.placeholder;
          input.placeholder = '关键词已复制，到 ' + opt.textContent.trim() + ' 粘贴即可';
          setTimeout(function () { input.placeholder = old; }, 3000);
        }).catch(function () {});
      }
      window.open(state.engine + encodeURIComponent(q), '_blank', 'noopener');
      return;
    }

    if (state.query) { if (!openCursor()) runSearch(q); }
    else runSearch(q);
  }

  // ---------- 抽屉 ----------
  var drawer;
  function openDrawer() {
    if (!drawer) return;
    drawer.hidden = false;
    requestAnimationFrame(function () { drawer.classList.add('is-open'); });
    document.body.style.overflow = 'hidden';
    if (drawerNav) { renderNav(drawerNav); syncNavActive(); }
  }
  function closeDrawer() {
    if (!drawer || drawer.hidden) return;
    drawer.classList.remove('is-open');
    document.body.style.overflow = '';
    setTimeout(function () { drawer.hidden = true; }, 260);
  }

  // ---------- 启动 ----------
  var drawerNav = null;

  function boot(data) {
    var root = Array.isArray(data) ? data[0] : data;
    if (!root) throw new Error('数据为空');
    state.root = root;
    state.flatFolders = [];
    state.flatLinks = indexAll(root, [], [], state.flatFolders);

    bookmarksBox = $('#bookmarks');
    h1Box = $('#pageTitle');
    subBox = $('#pageSub');
    crumbsBox = $('#crumbs');

    renderNav($('#navigation'));
    drawerNav = $('#navigation-drawer');

    // 首屏：先看 URL 有没有 ?q= / ?p=，没有就落到书签栏
    var initial = readUrl();
    var input = $('#searchInput');
    var basePath = resolvePath(initial.p);
    state.path = basePath;              // 先落好路径：搜索态也要有「清空后回到哪一层」
    if (initial.q) {
      if (input) input.value = initial.q;
      runSearch(initial.q, 'replace');
    } else {
      go(basePath, false, 'replace');
    }

    /* 刷新后按 ?n= 补足批次，再把滚动位置放回去 */
    preloadAndRestore(initial.n);
    syncNavActive();
  }

  document.addEventListener('DOMContentLoaded', function () {
    // 滚动位置自己记，浏览器原生恢复对「加载后才长高」的页面无效
    try { if ('scrollRestoration' in history) history.scrollRestoration = 'manual'; } catch (e) {}
    var scrollTimer = null;
    window.addEventListener('scroll', function () {
      clearTimeout(scrollTimer);
      scrollTimer = setTimeout(function () {
        try { sessionStorage.setItem(scrollKey(), String(Math.round(window.scrollY))); } catch (e) {}
      }, 200);
    }, { passive: true });

    // 视图偏好
    try { state.view = localStorage.getItem('xh-view') === 'list' ? 'list' : 'grid'; } catch (e) {}
    document.body.setAttribute('data-view', state.view);
    var vs = document.querySelectorAll('.view-switch button');
    for (var i = 0; i < vs.length; i++) {
      vs[i].setAttribute('aria-pressed', vs[i].getAttribute('data-view') === state.view ? 'true' : 'false');
      vs[i].addEventListener('click', function () {
        state.view = this.getAttribute('data-view');
        document.body.setAttribute('data-view', state.view);
        try { localStorage.setItem('xh-view', state.view); } catch (e) {}
        for (var j = 0; j < vs.length; j++) {
          vs[j].setAttribute('aria-pressed', vs[j].getAttribute('data-view') === state.view ? 'true' : 'false');
        }
      });
    }

    // 抽屉
    drawer = $('#drawer');
    var openBtn = $('#open-drawer');
    if (openBtn) openBtn.addEventListener('click', openDrawer);
    if (drawer) {
      var cb = $('#close-drawer'), bk = $('.drawer-back', drawer);
      if (cb) cb.addEventListener('click', closeDrawer);
      if (bk) bk.addEventListener('click', closeDrawer);
      document.addEventListener('keydown', function (e) { if (e.key === 'Escape') closeDrawer(); });
    }

    // 搜索
    var input = $('#searchInput');
    var timer = null;
    if (input) {
      input.addEventListener('input', function () {
        var v = input.value;
        clearTimeout(timer);
        timer = setTimeout(function () {
          if (state.engine !== 'local') return;   // 选了外部引擎时不打扰当前视图
          runSearch(v);
        }, 110);
      });
      input.addEventListener('keydown', function (e) {
        if (e.key === 'ArrowDown') { e.preventDefault(); moveCursor(1); }
        else if (e.key === 'ArrowUp') { e.preventDefault(); moveCursor(-1); }
        else if (e.key === 'Escape') { if (input.value) { e.preventDefault(); clearSearch(); } }
      });
    }
    var form = $('#searchForm');
    if (form) form.addEventListener('submit', function (e) { e.preventDefault(); submitSearch(); });
    // 快捷键：/ 或 ⌘K 聚焦搜索
    document.addEventListener('keydown', function (e) {
      var tag = (document.activeElement && document.activeElement.tagName) || '';
      var typing = tag === 'INPUT' || tag === 'TEXTAREA';
      if ((e.key === 'k' || e.key === 'K') && (e.metaKey || e.ctrlKey)) {
        e.preventDefault();
        if (input) { input.focus(); input.select(); }
      } else if (e.key === '/' && !typing) {
        e.preventDefault();
        if (input) input.focus();
      }
    });

    bindEngines();

    // 前进/后退：只还原，不再写历史
    window.addEventListener('popstate', function () {
      var s = readUrl();
      var input2 = $('#searchInput');
      if (s.q) {
        if (input2) input2.value = s.q;
        runSearch(s.q, 'none');
      } else {
        if (input2) input2.value = '';
        go(resolvePath(s.p), false, 'none');
      }
      preloadAndRestore(s.n);
    });

    // 顶栏滚动分隔线
    var topbar = $('#topbar');
    var onScroll = function () {
      if (!topbar) return;
      topbar.classList.toggle('is-stuck', (window.scrollY || 0) > 6);
    };
    window.addEventListener('scroll', onScroll, { passive: true });
    onScroll();

    var year = $('#currentYear');
    if (year) year.textContent = new Date().getFullYear();

    // 数据
    loadBookmarks()
      .then(function (data) {
        boot(data);
        var sk = $('#loading');
        if (sk) sk.remove();
      })
      .catch(function (err) {
        var sk = $('#loading');
        if (sk) sk.remove();
        renderError(err, '书签数据加载失败');
      });
  });
})();
