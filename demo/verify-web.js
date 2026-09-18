const { launch } = require('./web.js');

const SITES = [
  ['https://chatgpt.com/', '/backend-api/f/conversation', { action: 'next', messages: [{ author: { role: 'user' }, content: { content_type: 'text', parts: ['Email ayse.yilmaz@example.com, card 4111 1111 1111 1111'] } }] }],
  ['https://claude.ai/login', '/api/organizations/o1/chat_conversations/c1/completion', { prompt: 'Email ayse.yilmaz@example.com, card 4111 1111 1111 1111', attachments: [] }]
];

(async () => {
  let failed = false;
  for (const [site, endpoint, body] of SITES) {
    const b = await launch(site);
    await b.sleep(2500);
    const posts = [];
    b.on(m => { if (m.method === 'Network.requestWillBeSent' && m.params.request.method === 'POST' && m.params.request.url.includes(endpoint)) posts.push(m.params.request.postData); });
    const injected = (await b.evaluate('typeof window.pii === "object" && typeof window.piiRewrite === "object"')).value;
    await b.evaluate(`fetch(${JSON.stringify(endpoint)}, { method: 'POST', headers: { 'content-type': 'application/json' }, body: ${JSON.stringify(JSON.stringify(body))} }).catch(() => 0)`);
    await b.sleep(1500);
    const shown = (await b.evaluate(`(() => { const d = document.createElement('div'); d.id = 'pii-probe'; d.textContent = 'reply: ' + Object.keys(JSON.parse(sessionStorage.getItem('pii-mask-map') || '{}'))[0]; document.body.appendChild(d); return new Promise(r => setTimeout(() => r(d.textContent), 300)); })()`)).value;
    await b.close();
    const wire = posts[0] || '';
    const leaked = wire.includes('ayse.yilmaz') || wire.includes('4111');
    const ok = injected && posts.length === 1 && !leaked && /__PII_EMAIL_[0-9a-f]{6}__/.test(wire) && shown === 'reply: ayse.yilmaz@example.com';
    failed = failed || !ok;
    console.log(`${ok ? 'OK  ' : 'FAIL'} ${new URL(site).host}\n     injected=${injected} requests=${posts.length} leaked=${leaked}\n     wire: ${wire.slice(0, 160)}\n     dom restore: ${JSON.stringify(shown)}`);
  }
  process.exit(failed ? 1 : 0);
})();