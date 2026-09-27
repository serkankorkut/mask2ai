#!/usr/bin/env node
const fs = require('fs');
const os = require('os');
const path = require('path');
const { spawnSync } = require('child_process');
const { mask, unmask, hasPlaceholder, deepMap } = require('../core/pii.js');
const { execFileSync } = require('child_process');
const crypto = require('crypto');

const dir = process.env.CLAUDE_PLUGIN_DATA || path.join(os.homedir(), '.claude', 'mask2ai');
const file = id => path.join(dir, `${id}.jsonl`);
const save = (id, found) => {
  const lines = Object.entries(found).map(([p, v]) => JSON.stringify({ p, v }) + '\n').join('');
  if (!lines) return;
  fs.mkdirSync(dir, { recursive: true });
  fs.appendFileSync(file(id), lines, { mode: 0o600 });
};
const load = id => {
  const map = {};
  try {
    for (const line of fs.readFileSync(file(id), 'utf8').split('\n')) {
      if (!line) continue;
      const { p, v } = JSON.parse(line);
      map[p] = v;
    }
  } catch {}
  return map;
};

const visionBinary = () => {
  if (process.platform !== 'darwin') return null;
  const src = path.join(__dirname, 'vision.swift');
  const bin = path.join(dir, 'vision');
  try {
    if (!fs.existsSync(bin) || fs.statSync(bin).mtimeMs < fs.statSync(src).mtimeMs) {
      fs.mkdirSync(dir, { recursive: true });
      execFileSync('swiftc', ['-O', '-o', bin, src], { stdio: 'ignore' });
    }
    return bin;
  } catch {
    return null;
  }
};
const vision = (...args) => execFileSync(visionBinary(), args, { encoding: 'utf8', maxBuffer: 64 * 1024 * 1024 });

const IMAGE = /\.(png|jpe?g|gif|webp|bmp|tiff?|heic)$/i;
const readsDir = id => path.join(dir, 'reads', id);
const stem = file => `${path.basename(file)}-${crypto.createHash('sha1').update(file).digest('hex').slice(0, 8)}`;

const redirectPdf = (id, input, found) => {
  const file = input.tool_input.file_path;
  if (!visionBinary()) return { systemMessage: `mask2ai: ${path.basename(file)} read uninspected, converting PDFs needs macOS with the Swift toolchain` };
  const text = vision('pdf-text', file).replace(/\s+$/, '');
  const content = text.trim() ? mask(text, found) : 'mask2ai: this PDF has no extractable text, so it was not sent. Ask for it as an image instead.';
  const out = path.join(readsDir(id), `${stem(file)}.txt`);
  fs.mkdirSync(readsDir(id), { recursive: true });
  fs.writeFileSync(out, content, { mode: 0o600 });
  const n = Object.keys(found).length;
  return {
    systemMessage: text.trim() ? `mask2ai: converted ${path.basename(file)} to text and masked ${n} value${n === 1 ? '' : 's'}` : `mask2ai: ${path.basename(file)} has no extractable text, nothing was sent`,
    hookSpecificOutput: { hookEventName: 'PreToolUse', updatedInput: { ...input.tool_input, file_path: out } }
  };
};

const redirectImage = (id, input, found) => {
  const file = input.tool_input.file_path;
  if (!visionBinary()) return { systemMessage: `mask2ai: ${path.basename(file)} read uninspected, redacting images needs macOS with the Swift toolchain` };
  const boxes = [];
  for (const line of JSON.parse(vision('ocr', file))) {
    const hits = {};
    mask(line.text, hits);
    for (const value of Object.values(hits)) {
      let at = line.text.indexOf(value);
      while (at >= 0) {
        const end = at + value.length;
        const words = line.words.filter(w => w.start < end && w.start + w.length > at);
        boxes.push(...(words.length ? words.map(w => w.box) : [line.box]));
        at = line.text.indexOf(value, end);
      }
    }
    Object.assign(found, hits);
  }
  if (!boxes.length) return null;
  const out = path.join(readsDir(id), `${stem(file)}${/\.jpe?g$/i.test(file) ? '.jpg' : '.png'}`);
  fs.mkdirSync(readsDir(id), { recursive: true });
  vision('redact', file, out, JSON.stringify(boxes));
  fs.chmodSync(out, 0o600);
  const n = Object.keys(found).length;
  return {
    systemMessage: `mask2ai: redacted ${n} value${n === 1 ? '' : 's'} in ${path.basename(file)}`,
    hookSpecificOutput: { hookEventName: 'PreToolUse', updatedInput: { ...input.tool_input, file_path: out } }
  };
};

const main = () => {
  const input = JSON.parse(fs.readFileSync(0, 'utf8'));
  const id = input.session_id;
  const out = o => process.stdout.write(JSON.stringify(o));
  switch (input.hook_event_name) {
    case 'SessionStart':
      out({ systemMessage: 'mask2ai active: personal data in prompts and tool output is masked before it reaches the model', hookSpecificOutput: { hookEventName: 'SessionStart', additionalContext: 'Tokens shaped like __PII_EMAIL_a1b2c3__ are personal data masked by the mask2ai plugin. Treat them as opaque literals: copy them verbatim into tool inputs, never guess, expand or alter them.' } });
      break;
    case 'UserPromptSubmit': {
      const found = {};
      const masked = mask(input.prompt, found);
      if (masked === input.prompt) break;
      save(id, found);
      const copied = process.platform === 'darwin' && spawnSync('pbcopy', { input: masked }).status === 0;
      out({
        decision: 'block',
        suppressOriginalPrompt: true,
        reason: `mask2ai: personal data found in your prompt, nothing was sent. ${copied ? 'A masked copy is in your clipboard, paste it to resend' : 'Resend this masked version'}:\n\n${masked}`
      });
      break;
    }
    case 'PostToolUse': {
      const found = {};
      const kind = input.tool_name === 'Read' && input.tool_response && input.tool_response.type;
      if (kind === 'pdf' || kind === 'image') break;
      const updated = deepMap(input.tool_response, s => mask(s, found));
      if (!Object.keys(found).length) break;
      save(id, found);
      const n = Object.keys(found).length;
      out({ systemMessage: `mask2ai: masked ${n} value${n === 1 ? '' : 's'} in ${input.tool_name} output`, hookSpecificOutput: { hookEventName: 'PostToolUse', updatedToolOutput: updated } });
      break;
    }
    case 'PreToolUse': {
      const file = input.tool_name === 'Read' && input.tool_input && input.tool_input.file_path;
      if (file && (/\.pdf$/i.test(file) || IMAGE.test(file)) && !file.startsWith(readsDir(id))) {
        const found = {};
        const result = /\.pdf$/i.test(file) ? redirectPdf(id, input, found) : redirectImage(id, input, found);
        save(id, found);
        if (result) out(result);
        break;
      }
      if (!hasPlaceholder(JSON.stringify(input.tool_input))) break;
      const map = load(id);
      out({ hookSpecificOutput: { hookEventName: 'PreToolUse', updatedInput: deepMap(input.tool_input, s => unmask(s, map)) } });
      break;
    }
    case 'MessageDisplay':
      if (!hasPlaceholder(input.delta)) break;
      out({ hookSpecificOutput: { hookEventName: 'MessageDisplay', displayContent: unmask(input.delta, load(id)) } });
      break;
    case 'SessionEnd':
      fs.rmSync(file(id), { force: true });
      fs.rmSync(readsDir(id), { recursive: true, force: true });
  }
};

if (require.main === module) main();