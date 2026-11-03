/* 右下角悬浮按钮组：手机扫码打开 / 打赏 / 反馈更新 / 返回顶部
   用法：在任意页面 </head> 前加 <link rel="stylesheet" href="css/fab.css">，
        </body> 前加 <script src="js/fab.js"></script>（子目录页面用 ../ 前缀即可，
        资源路径会根据本脚本的 src 自动推算）。
*/
(function () {
  'use strict';

  if (window.__xhFabLoaded) return;
  window.__xhFabLoaded = true;

  /* ---------- 资源前缀：从当前脚本地址反推 ---------- */
  var BASE = (function () {
    var s = document.currentScript;
    if (!s) {
      var all = document.getElementsByTagName('script');
      for (var i = all.length - 1; i >= 0; i--) {
        if (/js\/fab\.js/.test(all[i].getAttribute('src') || all[i].src)) { s = all[i]; break; }
      }
    }
    if (!s) return './';
    var src = s.getAttribute('src') || '';
    if (src && /js\/fab\.js/.test(src)) return src.replace(/js\/fab\.js.*$/, '');
    if (s.src) return s.src.replace(/js\/fab\.js.*$/, '');
    return './';
  })();

  var ICO = {
    scan: '<svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round" aria-hidden="true"><rect x="3" y="3" width="7" height="7" rx="1.5"/><rect x="14" y="3" width="7" height="7" rx="1.5"/><rect x="3" y="14" width="7" height="7" rx="1.5"/><path d="M14 14h3v3h-3zM20 14v.01M14 20v.01M20 20v.01"/></svg>',
    reward: '<svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round" aria-hidden="true"><path d="M4 9h13v6a4 4 0 0 1-4 4H8a4 4 0 0 1-4-4Z"/><path d="M17 10h1.5a2.5 2.5 0 0 1 0 5H17"/><path d="M7 3v2M11 3v2M15 3v2"/></svg>',
    feedback: '<svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round" aria-hidden="true"><path d="M21 11.5a8.4 8.4 0 0 1-.9 3.8 8.5 8.5 0 0 1-7.6 4.7 8.4 8.4 0 0 1-3.8-.9L3 21l1.9-5.7a8.4 8.4 0 0 1-.9-3.8 8.5 8.5 0 0 1 4.7-7.6 8.4 8.4 0 0 1 3.8-.9h.5a8.5 8.5 0 0 1 8 8Z"/></svg>',
    top: '<svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round" aria-hidden="true"><path d="m18 15-6-6-6 6"/><path d="m18 20-6-6-6 6" opacity=".55"/></svg>'
  };

  function esc(s) {
    return String(s).replace(/[&<>"]/g, function (c) {
      return { '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;' }[c];
    });
  }

  function btn(cls, label, icon) {
    var b = document.createElement('button');
    b.type = 'button';
    b.className = 'xh-fab-btn ' + cls;
    b.title = label;
    b.setAttribute('aria-label', label);
    b.innerHTML = icon;
    return b;
  }

  /* ---------- 弹层 ---------- */

  var lastFocus = null;

  function closeModal() {
    var back = document.querySelector('.xh-modal-back');
    if (back) back.remove();
    if (lastFocus && lastFocus.focus) { try { lastFocus.focus(); } catch (e) {} }
    lastFocus = null;
  }

  function openShell(title, bodyHTML) {
    closeModal();
    lastFocus = document.activeElement;
    var back = document.createElement('div');
    back.className = 'xh-modal-back';
    back.innerHTML =
      '<div class="xh-modal" role="dialog" aria-modal="true" aria-label="' + esc(title) + '">' +
      '<button type="button" class="xh-close" aria-label="关闭">&times;</button>' +
      '<h3>' + esc(title) + '</h3>' + bodyHTML +
      '</div>';
    back.addEventListener('click', function (e) { if (e.target === back) closeModal(); });
    back.querySelector('.xh-close').addEventListener('click', closeModal);
    document.body.appendChild(back);
    return back;
  }

  function loadQrLib() {
    if (window.qrcode) return Promise.resolve();
    return new Promise(function (resolve, reject) {
      var s = document.createElement('script');
      s.src = BASE + 'js/qrcode.min.js';
      s.onload = function () { window.qrcode ? resolve() : reject(new Error('no qrcode')); };
      s.onerror = function () { reject(new Error('load failed')); };
      document.head.appendChild(s);
    });
  }

  function openQr() {
    var url = location.href;
    var back = openShell('用手机打开本页',
      '<div class="xh-qr-box">生成中…</div>' +
      '<p>用手机扫码，随时随地打开这个页面</p>' +
      '<code></code>');
    back.querySelector('code').textContent = url;
    loadQrLib().then(function () {
      var q = window.qrcode(0, 'M');
      q.addData(url);
      q.make();
      var box = back.querySelector('.xh-qr-box');
      if (box) box.innerHTML = q.createSvgTag({ cellSize: 4, margin: 0, scalable: true });
    }).catch(function () {
      var box = back.querySelector('.xh-qr-box');
      if (box) box.textContent = '二维码生成失败';
    });
  }

  var IMG_SIZE = { 'reward-qr.jpg': [432, 480], 'feedback-qr.jpg': [480, 444] };

  function openImage(title, src, captionHTML) {
    var key = src.split('/').pop();
    var dim = IMG_SIZE[key] || [480, 480];
    openShell(title,
      '<div class="xh-qr-img"><img src="' + src + '" alt="' + esc(title) + '"' +
      ' width="' + dim[0] + '" height="' + dim[1] + '" decoding="async"></div>' +
      '<p>' + captionHTML + '</p>');
  }

  /* 空闲时把两张二维码预加载进缓存，点开就是秒出，不再等网络 */
  function preloadImages() {
    ['assets/fab/reward-qr.jpg', 'assets/fab/feedback-qr.jpg'].forEach(function (p) {
      var img = new Image();
      img.src = BASE + p;
    });
  }

  /* ---------- 按钮组 ---------- */

  function build() {
    var fab = document.createElement('div');
    fab.id = 'xh-fab';

    var scan = btn('xh-fab-scan', '手机扫码打开', ICO.scan);
    scan.addEventListener('click', openQr);
    fab.appendChild(scan);

    var reward = btn('xh-fab-reward', '打赏一杯咖啡', ICO.reward);
    reward.addEventListener('click', function () {
      openImage('打赏一杯咖啡 ☕', BASE + 'assets/fab/reward-qr.jpg',
        '更新不易，赞助打赏支持一下！<br>谢谢你的支持！！');
    });
    fab.appendChild(reward);

    var feed = btn('xh-fab-feedback', '反馈与更新', ICO.feedback);
    feed.addEventListener('click', function () {
      openImage('反馈与更新', BASE + 'assets/fab/feedback-qr.jpg', '扫码关注更新或者发送反馈');
    });
    fab.appendChild(feed);

    var top = btn('xh-fab-top', '返回顶部', ICO.top);
    top.addEventListener('click', function () {
      window.scrollTo({ top: 0, behavior: 'smooth' });
    });
    fab.appendChild(top);

    function syncTop() {
      top.classList.toggle('show', (window.scrollY || document.documentElement.scrollTop || 0) > window.innerHeight);
    }
    window.addEventListener('scroll', syncTop, { passive: true });
    syncTop();

    document.body.appendChild(fab);
  }

  document.addEventListener('keydown', function (e) {
    if (e.key === 'Escape') closeModal();
  });

  /* 立即构建（脚本放在 body 末尾）；个别页面有阻塞式外链脚本，
     不能等 DOMContentLoaded，否则悬浮按钮会迟迟不出现 */
  function init() {
    build();
    if ('requestIdleCallback' in window) {
      requestIdleCallback(preloadImages, { timeout: 2500 });
    } else {
      setTimeout(preloadImages, 1800);
    }
  }

  if (document.body) {
    init();
  } else {
    document.addEventListener('DOMContentLoaded', init);
  }
})();
