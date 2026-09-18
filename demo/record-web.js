const fs = require('fs');
const os = require('os');
const path = require('path');
const { spawnSync } = require('child_process');
const { launch } = require('./web.js');

const [url, prompt, out, composer = '#prompt-textarea, div[contenteditable="true"], textarea'] = process.argv.slice(2);
const frames = fs.mkdtempSync(path.join(os.tmpdir(), 'pii-mask-frames-'));
const sleep = ms => new Promise(r => setTimeout(r, ms));

(async () => {
  const b = await launch(url);
  let n = 0;
  let recording = true;
  const record = (async () => {
    while (recording) {
      await b.screenshot(path.join(frames, `f${String(n++).padStart(4, '0')}.png`)).catch(() => 0);
      await sleep(400);
    }
  })();
  await sleep(3000);
  await b.evaluate(`document.querySelector('${composer}')?.focus()`);
  for (const ch of prompt) {
    await b.send('Input.insertText', { text: ch });
    await sleep(35);
  }
  await sleep(1200);
  for (const type of ['keyDown', 'keyUp']) await b.send('Input.dispatchKeyEvent', { type, key: 'Enter', code: 'Enter', windowsVirtualKeyCode: 13 });
  await sleep(+process.env.REPLY_WAIT || 18000);
  recording = false;
  await record;
  await b.close();
  const r = spawnSync('ffmpeg', ['-loglevel', 'error', '-y', '-framerate', '2.5', '-i', path.join(frames, 'f%04d.png'), '-vf', 'scale=1000:-1:flags=lanczos,split[a][b];[a]palettegen=max_colors=128[p];[b][p]paletteuse=dither=bayer:bayer_scale=3', out]);
  if (r.status !== 0) throw new Error(r.stderr.toString());
  fs.rmSync(frames, { recursive: true, force: true });
  console.log(`${out}: ${n} frames, ${(fs.statSync(out).size / 1024).toFixed(0)} KB`);
})();