const http = require('http');
const fs = require('fs');

const fetchText = url => new Promise((resolve, reject) => http.get(url, res => {
  let d = '';
  res.on('data', c => d += c);
  res.on('end', () => resolve(d));
}).on('error', reject));
const get = async url => JSON.parse(await fetchText(url));
const sleep = ms => new Promise(r => setTimeout(r, ms));

const attach = async page => {
  const ws = new WebSocket(page.webSocketDebuggerUrl);
  await new Promise(r => ws.onopen = r);
  let id = 0;
  const pending = new Map();
  const listeners = [];
  ws.onmessage = e => {
    const msg = JSON.parse(e.data);
    if (msg.id && pending.has(msg.id)) {
      pending.get(msg.id)(msg);
      pending.delete(msg.id);
    } else if (msg.method) listeners.forEach(fn => fn(msg));
  };
  const send = (method, params = {}) => new Promise((resolve, reject) => {
    const i = ++id;
    const timer = setTimeout(() => {
      pending.delete(i);
      reject(new Error(`${method}: timed out`));
    }, 15000);
    pending.set(i, m => {
      clearTimeout(timer);
      m.error ? reject(new Error(`${method}: ${m.error.message}`)) : resolve(m.result);
    });
    ws.send(JSON.stringify({ id: i, method, params }));
  });
  const on = fn => listeners.push(fn);
  const evaluate = async expr => (await send('Runtime.evaluate', { expression: expr, awaitPromise: true, returnByValue: true })).result;
  const screenshot = async file => fs.writeFileSync(file, Buffer.from((await send('Page.captureScreenshot', { format: 'png' })).data, 'base64'));
  const navigate = async u => {
    const loaded = new Promise(r => on(m => m.method === 'Page.loadEventFired' && r()));
    await send('Page.navigate', { url: u });
    await Promise.race([loaded, sleep(6000)]);
  };
  const alive = await Promise.race([evaluate('document.visibilityState'), sleep(3000)]);
  if (!alive || alive.value !== 'visible') {
    ws.close();
    return null;
  }
  await send('Page.enable');
  await send('Network.enable');
  await send('Runtime.enable');
  return { send, on, evaluate, screenshot, navigate, sleep, close: () => ws.close() };
};

const connect = async (port, match) => {
  const targets = await get(`http://127.0.0.1:${port}/json`);
  for (const page of targets.filter(t => t.type === 'page' && t.url.includes(match))) {
    await fetchText(`http://127.0.0.1:${port}/json/activate/${page.id}`);
    await sleep(500);
    const b = await attach(page);
    if (b) return b;
  }
  throw new Error(`no responsive visible page matching ${match}`);
};

module.exports = { connect, sleep };