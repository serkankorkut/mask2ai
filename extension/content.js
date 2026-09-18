(() => {
  const { mask, unmask, hasPlaceholder } = window.pii;
  const { isChatRequest, rewrite } = window.piiRewrite;
  const KEY = 'pii-mask-map';
  const map = (() => {
    try { return JSON.parse(sessionStorage.getItem(KEY)) || {}; } catch { return {}; }
  })();
  const save = found => {
    Object.assign(map, found);
    try { sessionStorage.setItem(KEY, JSON.stringify(map)); } catch {}
  };

  const style = 'position:fixed;z-index:2147483647;font:13px/1.4 system-ui,sans-serif;color:#fff;background:#6b21a8;border-radius:8px;padding:6px 10px;box-shadow:0 2px 8px rgba(0,0,0,.3);pointer-events:none;';
  const show = (text, ms) => {
    const el = document.createElement('div');
    el.setAttribute('data-pii-mask', '');
    el.style.cssText = style + 'right:16px;bottom:16px;';
    el.textContent = '🛡 pii-mask: ' + text;
    (document.body || document.documentElement).appendChild(el);
    if (ms) setTimeout(() => el.remove(), ms);
  };
  document.addEventListener('DOMContentLoaded', () => show('on, personal data is masked before sending', 4000));

  const origFetch = window.fetch;
  window.fetch = async function (input, init) {
    try {
      const url = typeof input === 'string' ? input : input instanceof Request ? input.url : String(input);
      if (isChatRequest(url)) {
        const found = {};
        if (init && typeof init.body === 'string') {
          const body = rewrite(init.body, mask, found);
          if (Object.keys(found).length) init = Object.assign({}, init, { body });
        } else if (init && init.body instanceof URLSearchParams) {
          const body = rewrite(init.body.toString(), mask, found);
          if (Object.keys(found).length) init = Object.assign({}, init, { body: new URLSearchParams(body) });
        } else if (input instanceof Request && !(init && init.body) && input.method === 'POST') {
          const body = rewrite(await input.clone().text(), mask, found);
          if (Object.keys(found).length) input = new Request(input, { body });
        }
        const n = Object.keys(found).length;
        if (n) {
          save(found);
          show(`masked ${n} value${n === 1 ? '' : 's'} before sending`, 4000);
        }
      }
    } catch {}
    return origFetch.call(this, input, init);
  };

  const fix = node => {
    if (node.nodeType === 3 && hasPlaceholder(node.data) && !node.parentElement?.closest('[contenteditable], textarea, [data-pii-mask]')) node.data = unmask(node.data, map);
  };
  const scan = root => {
    const walker = document.createTreeWalker(root, NodeFilter.SHOW_TEXT);
    let n;
    while ((n = walker.nextNode())) fix(n);
  };
  new MutationObserver(muts => {
    for (const m of muts) {
      if (m.type === 'characterData') fix(m.target);
      for (const n of m.addedNodes) n.nodeType === 3 ? fix(n) : n.nodeType === 1 && scan(n);
    }
  }).observe(document.documentElement, { childList: true, subtree: true, characterData: true });
})();