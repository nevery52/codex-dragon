// All geometry here is viewport-local DIP; native WinEvents own screen x/y.
(() => {
  const clamp = n => Math.max(0, Math.min(1, n));
  const finite = (v, fallback) => typeof v === 'number' && Number.isFinite(v) ? v : fallback;
  function normalize(value = {}) {
    return { anchor: { ax: clamp(finite(value?.anchor?.ax, 1)), ay: value?.bottomOnly === true ? 1 : clamp(finite(value?.anchor?.ay, 1)) },
      bottomOnly: value?.bottomOnly === true,
      snapDistance: Math.max(0, finite(value?.snapDistance, 24)),
      flipOnLeft: typeof value?.flipOnLeft === 'boolean' ? value.flipOnLeft : true,
      flipOnTop: typeof value?.flipOnTop === 'boolean' ? value.flipOnTop : false };
  }
  function position(anchor, W, H, w, h) {
    return { x: clamp(anchor.ax) * Math.max(0, W-w), y: (config.bottomOnly ? 1 : clamp(anchor.ay)) * Math.max(0, H-h) };
  }
  function drop(x, y, W, H, w, h, distance) {
    function axis(p, travel) {
      if (travel <= 0) return 0;
      p = Math.max(0, Math.min(travel, p));
      if (Math.min(p, travel-p) < distance) return p <= travel-p ? 0 : 1;
      return p/travel;
    }
    return { ax: axis(x, W-w), ay: config.bottomOnly ? 1 : axis(y, H-h) };
  }
  if (typeof document !== 'undefined') { const style = document.createElement('style'); style.textContent = '.desktop .dshwv-root{transition:none!important}'; document.head.appendChild(style); }
  const config = normalize(globalThis.whaleDesktop?.overlayConfig?.());
  function save(anchor) {
    anchor = { ...anchor, ay: config.bottomOnly ? 1 : anchor.ay };
    config.anchor = anchor;
    return globalThis.whaleDesktop?.saveAnchor?.(anchor).then(ok => {
      document.documentElement.dataset.anchorSaved = String(ok);
      if (!ok) console.error('Dragon anchor could not be saved to dragon.json');
      return ok;
    });
  }
  globalThis.DragonAnchor = { config, normalize, position, drop, save };
})();
(() => {
  'use strict';
  const sources = { idle: '/dsh-whale/image.png' };
  const ready = new Set(['idle']);
  for (const state of ['blink', 'working', 'success', 'failed']) {
    sources[state] = `/assets/codex-dragon-${state}.png`;
    const image = new Image(); image.src = sources[state];
    image.decode().then(() => ready.add(state)).catch(() => {});
  }
  let state = 'idle', base = 'idle', expressionUntil = 0, blinkUntil = 0, nextBlink = Date.now() + 3500;
  const reduced = matchMedia('(prefers-reduced-motion: reduce)');
  function paint(next) {
    const image = document.querySelector('.dshwv-img');
    if (!image || (localStorage.getItem('dshw-role') || 'default') !== 'default') return;
    if (!ready.has(next)) next = 'idle';
    if (image.getAttribute('src') !== sources[next]) {
      image.src = sources[next]; image.alt = `Codex 龙娘 · ${{ idle: '待机', blink: '眨眼', working: '专注', success: '完成', failed: '受挫' }[next]}`;
      window.WhaleRendering?.presentFor?.(250);
    }
    state = next; image.dataset.dragonState = next;
  }
  window.DragonAvatar = {
    update(data, completion) {
      base = data.status.connected && data.status.activeTurns ? 'working' : 'idle';
      if (completion) { expressionUntil = Date.now() + 4200; paint(completion === 'success' ? 'success' : completion === 'cancelled' ? 'idle' : 'failed'); }
      else if (Date.now() >= expressionUntil) paint(base);
    },
  };
  setInterval(() => {
    if (document.documentElement.dataset.wsl !== 'true') return;
    const now = Date.now();
    if (now < expressionUntil) return;
    if (blinkUntil) { if (now >= blinkUntil) { blinkUntil = 0; paint(base); } return; }
    if (now >= nextBlink) {
      nextBlink = now + 4000 + Math.random() * 3500;
      if (base === 'idle' && !reduced.matches) { blinkUntil = now + 180; paint('blink'); return; }
    }
    if (state !== base) paint(base);
  }, 90);
})();
