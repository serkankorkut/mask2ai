(function (root, factory) {
  if (typeof module === 'object' && module.exports) module.exports = factory();
  else root.piiRewrite = factory();
})(typeof globalThis !== 'undefined' ? globalThis : this, function () {
  const TEXT_KEYS = new Set(['prompt', 'parts', 'extracted_content', 'text', 'content']);
  const isChatRequest = url => /\/(completion|conversation|chat_conversations)(\/[a-z_]+)?(\?|$)/.test(url.split('#')[0]);
  const walk = (v, key, mask, found) => typeof v === 'string' ? (TEXT_KEYS.has(key) ? mask(v, found) : v)
    : Array.isArray(v) ? v.map(x => walk(x, key, mask, found))
    : v && typeof v === 'object' ? Object.fromEntries(Object.entries(v).map(([k, x]) => [k, walk(x, k, mask, found)]))
    : v;
  const rewriteJson = (text, mask, found) => JSON.stringify(walk(JSON.parse(text), '', mask, found));
  const rewriteForm = (text, mask, found) => {
    const params = new URLSearchParams(text);
    for (const [k, v] of [...params.entries()]) {
      if (TEXT_KEYS.has(k)) params.set(k, mask(v, found));
      else if (/^[[{]/.test(v)) {
        try { params.set(k, rewriteJson(v, mask, found)); } catch {}
      }
    }
    return params.toString();
  };
  const rewrite = (bodyText, mask, found) => /^\s*[[{]/.test(bodyText) ? rewriteJson(bodyText, mask, found) : rewriteForm(bodyText, mask, found);
  return { isChatRequest, rewrite };
});