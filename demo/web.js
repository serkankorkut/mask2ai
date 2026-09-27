const { spawn } = require('child_process');
const fs = require('fs');
const path = require('path');
const os = require('os');

const CHROME = process.env.CHROME || '/Applications/Google Chrome.app/Contents/MacOS/Google Chrome';
const root = path.join(__dirname, '..');
const sleep = ms => new Promise(r => setTimeout(r, ms));

const launch = async (url, { headless = true } = {}) => {
  const profile = fs.mkdtempSync(path.join(os.tmpdir(), 'mask2ai-chrome-'));
  const args = ['--remote-debugging-pipe', '--enable-unsafe-extension-debugging', `--user-data-dir=${profile}`, '--no-first-run', '--no-default-browser-check', '--window-size=1280,800', '--lang=en-US', '--disable-blink-features=AutomationControlled'];
  if (headless) args.push('--headless=new');
  const proc = spawn(CHROME, [...args, 'about:blank'], { stdio: ['ignore', 'ignore', 'ignore', 'pipe', 'pipe'] });
  const [, , , input, output] = proc.stdio;
  let id = 0;
  const pending = new Map();
  const listeners = [];
  let buf = '';
  output.on('data', chunk => {
    buf += chunk;
    let i;
    while ((i = buf.indexOf('\0')) >= 0) {
      const msg = JSON.parse(buf.slice(0, i));
      buf = buf.slice(i + 1);
      if (msg.id && pending.has(msg.id)) {
        pending.get(msg.id)(msg);
        pending.delete(msg.id);
      } else if (msg.method) listeners.forEach(fn => fn(msg));
    }
  });
  const raw = (method, params = {}, sessionId) => new Promise((resolve, reject) => {
    const i = ++id;
    pending.set(i, m => m.error ? reject(new Error(`${method}: ${m.error.message}`)) : resolve(m.result));
    input.write(JSON.stringify({ id: i, method, params, sessionId }) + '\0');
  });
  await raw('Extensions.loadUnpacked', { path: root });
  const { targetInfos } = await raw('Target.getTargets');
  const page = targetInfos.find(t => t.type === 'page');
  const { sessionId } = await raw('Target.attachToTarget', { targetId: page.targetId, flatten: true });
  const send = (method, params) => raw(method, params, sessionId);
  const on = fn => listeners.push(m => m.sessionId === sessionId && fn(m));
  const evaluate = async expr => (await send('Runtime.evaluate', { expression: expr, awaitPromise: true, returnByValue: true })).result;
  const screenshot = async file => fs.writeFileSync(file, Buffer.from((await send('Page.captureScreenshot', { format: 'png' })).data, 'base64'));
  const navigate = async u => {
    const loaded = new Promise(r => on(m => m.method === 'Page.loadEventFired' && r()));
    await send('Page.navigate', { url: u });
    await loaded;
  };
  const close = async () => {
    const exited = new Promise(r => proc.on('exit', r));
    proc.kill();
    await exited;
    fs.rmSync(profile, { recursive: true, force: true, maxRetries: 5 });
  };
  await send('Page.enable');
  await send('Network.enable');
  await send('Runtime.enable');
  await navigate(url);
  return { send, on, evaluate, screenshot, navigate, close, sleep };
};

module.exports = { launch };