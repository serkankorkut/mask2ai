const { spawn } = require('child_process');
const fs = require('fs');
const path = require('path');
const os = require('os');

const CHROME = process.env.CHROME || '/Applications/Google Chrome.app/Contents/MacOS/Google Chrome';
const root = path.join(__dirname, '..');
const url = process.argv[2] || 'https://chatgpt.com/';
const port = process.argv[3] || 9333;
const profile = process.env.PROFILE || fs.mkdtempSync(path.join(os.tmpdir(), 'mask2ai-chrome-'));
const proc = spawn(CHROME, ['--remote-debugging-pipe', '--enable-unsafe-extension-debugging', `--remote-debugging-port=${port}`, `--user-data-dir=${profile}`, '--no-first-run', '--no-default-browser-check', '--window-size=1280,860', '--lang=en-US', url], { stdio: ['ignore', 'ignore', 'ignore', 'pipe', 'pipe'] });
const [, , , input, output] = proc.stdio;
output.on('data', d => process.stdout.write(d.toString().replace(/\0/g, '\n')));
input.write(JSON.stringify({ id: 1, method: 'Extensions.loadUnpacked', params: { path: root } }) + '\0');
console.log(`chrome pid ${proc.pid}, profile ${profile}, devtools on port ${port}`);
proc.on('exit', code => process.exit(code));