const fs = require('fs');
const os = require('os');
const path = require('path');
const { spawnSync } = require('child_process');
const { connect, sleep } = require('./cdp.js');

const [match, prompt, out, port = '9333'] = process.argv.slice(2);
const frames = fs.mkdtempSync(path.join(os.tmpdir(), 'mask2ai-frames-'));

(async () => {
  const b = await connect(+port, match);
  await b.send('Emulation.setDeviceMetricsOverride', { width: 1280, height: 800, deviceScaleFactor: 1, mobile: false });
  const wire = [];
  b.on(m => { if (m.method === 'Network.requestWillBeSent' && m.params.request.method === 'POST' && /\/(conversation|completion)(\/[a-z_]+)?(\?|$)/.test(m.params.request.url)) wire.push(m.params.request.postData || ''); });
  const caption = text => b.evaluate(`(() => { let el = document.getElementById('pii-demo-caption'); if (!el) { el = document.createElement('div'); el.id = 'pii-demo-caption'; el.setAttribute('data-mask2ai', ''); el.style.cssText = 'position:fixed;top:0;left:0;right:0;z-index:2147483646;background:#6b21a8;color:#fff;font:600 17px/1.45 system-ui,sans-serif;padding:14px 22px;white-space:pre-wrap;box-shadow:0 2px 12px rgba(0,0,0,.4)'; document.body.appendChild(el); } el.textContent = ${JSON.stringify(text)}; })()`);
  const sentPrompt = () => {
    for (const w of wire) {
      try { const p = new URLSearchParams(w).get('prompt'); if (p) return p; } catch {}
      try { const j = JSON.parse(w); if (j.prompt) return j.prompt; const part = j.messages?.[0]?.content?.parts?.[0]; if (part) return part; } catch {}
    }
    return null;
  };
  let n = 0;
  let recording = true;
  const record = (async () => {
    while (recording) {
      await b.screenshot(path.join(frames, `f${String(n++).padStart(4, '0')}.png`)).catch(() => 0);
      await sleep(120);
    }
  })();
  await sleep(800);
  await caption('1 / 3   You type a message that contains an email address and a phone number.');
  await sleep(1200);
  await b.evaluate(`(document.querySelector('#prompt-textarea') || document.querySelector('[contenteditable="true"]') || document.querySelector('textarea')).focus()`);
  for (const ch of prompt) {
    await b.send('Input.insertText', { text: ch });
    await sleep(25);
  }
  await sleep(700);
  for (const type of ['keyDown', 'keyUp']) await b.send('Input.dispatchKeyEvent', { type, key: 'Enter', code: 'Enter', windowsVirtualKeyCode: 13 });
  await sleep(1500);
  await caption('2 / 3   mask2ai replaced them before the message left your browser. This is what ChatGPT actually received:\n\n' + (sentPrompt() || '(request not captured)'));
  await sleep(+process.env.REPLY_WAIT || 9000);
  await caption('3 / 3   ChatGPT answered without ever seeing the real email or number. On your screen everything looks normal.');
  await sleep(3500);
  await b.evaluate(`document.getElementById('pii-demo-caption')?.remove()`);
  recording = false;
  await record;
  await b.send('Emulation.clearDeviceMetricsOverride');
  b.close();
  const r = spawnSync('ffmpeg', ['-loglevel', 'error', '-y', '-framerate', '8', '-i', path.join(frames, 'f%04d.png'), '-vf', 'scale=1000:-1:flags=lanczos,split[a][b];[a]palettegen=max_colors=128[p];[b][p]paletteuse=dither=bayer:bayer_scale=3', out]);
  if (r.status !== 0) throw new Error(r.stderr.toString());
  fs.rmSync(frames, { recursive: true, force: true });
  console.log(`${out}: ${n} frames, ${(fs.statSync(out).size / 1024).toFixed(0)} KB`);
  console.log(`requests: ${wire.length}`);
  for (const w of wire) console.log('  ' + w.slice(0, 300));
})();