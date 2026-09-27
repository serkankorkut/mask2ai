const { launch } = require('./web.js');

const SITES = [
  ['https://chatgpt.com/', '/backend-api/f/conversation', { action: 'next', messages: [{ author: { role: 'user' }, content: { content_type: 'text', parts: ['Email jane.doe@example.com, card 4111 1111 1111 1111'] } }] }],
  ['https://claude.ai/login', '/api/organizations/o1/chat_conversations/c1/completion', { prompt: 'Email jane.doe@example.com, card 4111 1111 1111 1111', attachments: [] }, 'gzip']
];
const sendExpr = (endpoint, body, encoding) => encoding === 'gzip'
  ? `new Response(new Blob([${JSON.stringify(JSON.stringify(body))}]).stream().pipeThrough(new CompressionStream('gzip'))).arrayBuffer().then(buf => fetch(${JSON.stringify(endpoint)}, { method: 'POST', headers: { 'content-type': 'application/json', 'content-encoding': 'gzip' }, body: new Uint8Array(buf) })).catch(() => 0)`
  : `fetch(${JSON.stringify(endpoint)}, { method: 'POST', headers: { 'content-type': 'application/json' }, body: ${JSON.stringify(JSON.stringify(body))} }).catch(() => 0)`;

(async () => {
  let failed = false;
  for (const [site, endpoint, body, encoding] of SITES) {
    const b = await launch(site);
    await b.sleep(2500);
    const posts = [];
    b.on(m => { if (m.method === 'Network.requestWillBeSent' && m.params.request.method === 'POST' && m.params.request.url.includes(endpoint)) posts.push(m.params.request.postDataEntries?.map(e => e.bytes).join('') ?? ''); });
    const injected = (await b.evaluate('typeof window.pii === "object" && typeof window.piiRewrite === "object"')).value;
    await b.evaluate(sendExpr(endpoint, body, encoding));
    await b.sleep(1500);
    let upload = null;
    if (site.includes('claude.ai')) {
      const received = [];
      const cors = { 'Access-Control-Allow-Origin': '*', 'Access-Control-Allow-Private-Network': 'true', 'Access-Control-Allow-Methods': 'POST', 'Access-Control-Allow-Headers': '*' };
      const server = require('http').createServer((req, res) => { if (req.method === 'OPTIONS') return res.writeHead(204, cors).end(); const chunks = []; req.on('data', c => chunks.push(c)); req.on('end', () => { received.push(Buffer.concat(chunks)); res.writeHead(204, cors).end(); }); });
      await new Promise(r => server.listen(0, '127.0.0.1', r));
      const target = `http://127.0.0.1:${server.address().port}/upload`;
      await b.send('Page.setBypassCSP', { enabled: true });
      await b.navigate(site);
      await b.sleep(2000);
      await b.evaluate(`(async () => { const zip = window.mask2aiZip; const te = new TextEncoder(); const docx = await zip.write([{ name: 'word/document.xml', data: te.encode('<w:document><w:body><w:p><w:r><w:t>Contact jane.doe@example.com now</w:t></w:r></w:p></w:body></w:document>') }]); const fd = new FormData(); fd.append('file', new File([docx], 'contact.docx', { type: 'application/vnd.openxmlformats-officedocument.wordprocessingml.document' })); return await fetch(${JSON.stringify(target)}, { method: 'POST', body: fd }).then(r => 'status ' + r.status).catch(e => 'error ' + e.message); })()`).then(r => { if (process.env.DEBUG) console.log('upload fetch:', r.value); });
      await b.sleep(1500);
      server.close();
      const raw = received[0] || Buffer.alloc(0);
      const zipStart = raw.indexOf(Buffer.from('PK'));
      const zipEnd = raw.lastIndexOf(Buffer.from('\r\n--'));
      const entries = zipStart >= 0 ? await require('./../core/zip.js').read(new Uint8Array(raw.subarray(zipStart, zipEnd > zipStart ? zipEnd : raw.length))) : [];
      const doc = entries.length ? Buffer.from(entries.find(e => e.name === 'word/document.xml').data).toString() : '';
      upload = { sent: received.length, leaked: doc.includes('jane.doe'), masked: /__PII_EMAIL_[0-9a-f]{6}__/.test(doc) };
    }
    const shown = (await b.evaluate(`(() => { const d = document.createElement('div'); d.id = 'pii-probe'; d.textContent = 'reply: ' + Object.keys(JSON.parse(sessionStorage.getItem('mask2ai-map') || '{}'))[0]; document.body.appendChild(d); return new Promise(r => setTimeout(() => r(d.textContent), 300)); })()`)).value;
    await b.close();
    const raw = Buffer.from(posts[0] || '', 'base64');
    const wire = raw[0] === 0x1f && raw[1] === 0x8b ? require('zlib').gunzipSync(raw).toString() : raw.toString();
    const leaked = wire.includes('jane.doe') || wire.includes('4111');
    const ok = injected && posts.length === 1 && !leaked && /__PII_EMAIL_[0-9a-f]{6}__/.test(wire) && shown === 'reply: jane.doe@example.com' && (!upload || (upload.sent === 1 && !upload.leaked && upload.masked));
    failed = failed || !ok;
    console.log(`${ok ? 'OK  ' : 'FAIL'} ${new URL(site).host}${encoding ? ' (' + encoding + ' body)' : ''}\n     injected=${injected} requests=${posts.length} leaked=${leaked}\n     wire: ${wire.slice(0, 160)}\n     dom restore: ${JSON.stringify(shown)}${upload ? `\n     docx upload: ${JSON.stringify(upload)}` : ''}`);
  }
  process.exit(failed ? 1 : 0);
})();