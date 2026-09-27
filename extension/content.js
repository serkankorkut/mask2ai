(() => {
  const { mask, unmask, hasPlaceholder } = window.pii;
  const { isChatRequest, rewrite } = window.piiRewrite;
  const { maskFile, maskFormData } = window.mask2aiFiles;
  const KEY = 'mask2ai-map';
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
    el.setAttribute('data-mask2ai', '');
    el.style.cssText = style + 'right:16px;bottom:16px;';
    el.textContent = '🛡 mask2ai: ' + text;
    (document.body || document.documentElement).appendChild(el);
    if (ms) setTimeout(() => el.remove(), ms);
  };
  document.addEventListener('DOMContentLoaded', () => show('on, personal data is masked before sending', 4000));

  const gunzip = bytes => new Response(new Blob([bytes]).stream().pipeThrough(new DecompressionStream('gzip'))).text();
  const gzip = async text => new Uint8Array(await new Response(new Blob([text]).stream().pipeThrough(new CompressionStream('gzip'))).arrayBuffer());

  const origFetch = window.fetch;
  window.fetch = async function (input, init) {
    try {
      const url = typeof input === 'string' ? input : input instanceof Request ? input.url : String(input);
      const warn = name => show(`${name} was uploaded uninspected, PDFs and images are not masked in the browser`, 6000);
      if (init && init.body instanceof FormData) {
        const found = {};
        init = Object.assign({}, init, { body: await maskFormData(init.body, mask, found, warn) });
        const n = Object.keys(found).length;
        if (n) {
          save(found);
          show(`masked ${n} value${n === 1 ? '' : 's'} in an uploaded file`, 5000);
        }
      } else if (init && init.body instanceof File) {
        const found = {};
        const masked = await maskFile(init.body, mask, found);
        if (masked !== init.body) init = Object.assign({}, init, { body: masked });
        const n = Object.keys(found).length;
        if (n) {
          save(found);
          show(`masked ${n} value${n === 1 ? '' : 's'} in ${init.body.name}`, 5000);
        } else if (window.mask2aiFiles.classify(init.body.name) === 'opaque') warn(init.body.name);
      } else if (isChatRequest(url)) {
        const found = {};
        if (init && typeof init.body === 'string') {
          const body = rewrite(init.body, mask, found);
          if (Object.keys(found).length) init = Object.assign({}, init, { body });
        } else if (init && (init.body instanceof ArrayBuffer || ArrayBuffer.isView(init.body))) {
          const bytes = init.body instanceof ArrayBuffer ? new Uint8Array(init.body) : new Uint8Array(init.body.buffer, init.body.byteOffset, init.body.byteLength);
          const gz = bytes[0] === 0x1f && bytes[1] === 0x8b;
          const body = rewrite(gz ? await gunzip(bytes) : new TextDecoder().decode(bytes), mask, found);
          if (Object.keys(found).length) init = Object.assign({}, init, { body: gz ? await gzip(body) : new TextEncoder().encode(body) });
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
    if (node.nodeType === 3 && hasPlaceholder(node.data) && !node.parentElement?.closest('[contenteditable], textarea, [data-mask2ai]')) node.data = unmask(node.data, map);
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