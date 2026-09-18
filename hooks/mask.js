#!/usr/bin/env node
const fs = require('fs');
const os = require('os');
const path = require('path');
const crypto = require('crypto');
const { spawnSync } = require('child_process');

const luhn = s => {
  const d = s.replace(/\D/g, '');
  let sum = 0;
  for (let i = 0; i < d.length; i++) {
    let n = +d[d.length - 1 - i];
    if (i % 2) n = n * 2 > 9 ? n * 2 - 9 : n * 2;
    sum += n;
  }
  return sum % 10 === 0;
};

const tckn = s => {
  const d = [...s].map(Number);
  const odd = d[0] + d[2] + d[4] + d[6] + d[8];
  const even = d[1] + d[3] + d[5] + d[7];
  return (((odd * 7 - even) % 10) + 10) % 10 === d[9] && d.slice(0, 10).reduce((a, b) => a + b) % 10 === d[10];
};

const iban = s => {
  const t = s.replace(/ /g, '');
  let rem = 0;
  for (const ch of t.slice(4) + t.slice(0, 4)) {
    rem = ch > '9' ? (rem * 100 + ch.charCodeAt(0) - 55) % 97 : (rem * 10 + +ch) % 97;
  }
  return rem === 1;
};

const personLike = s => /^(?:\p{Lu}\p{Ll}+|\p{Lu}{2,})(?:[ \t]+(?:\p{Lu}\p{Ll}+|\p{Lu}{2,})){0,3}$/u.test(s);
const addressLike = s => /\d/.test(s) && /\p{L}{3}/u.test(s) && !/^(?:0x|\d+\.\d+\.\d+\.\d+)/i.test(s);

// ponytail: regex + checksums + label heuristics, no NER; free-text names and addresses without a label, title or nearby email pass through
const PATTERNS = [
  ['EMAIL', /[A-Za-z0-9._%+-]+@[A-Za-z0-9-]+(?:\.[A-Za-z0-9-]+)*\.[A-Za-z]{2,}/g],
  ['IBAN', /\b[A-Z]{2}\d{2}(?: ?[A-Z0-9]{4}){2,7}(?: ?[A-Z0-9]{1,4})?\b/g, iban],
  ['CARD', /\b[2-6]\d{14,15}\b|\b[2-6]\d{3}(?:[ -]\d{4}){3}\b|\b[2-6]\d{3}[ -]\d{6}[ -]\d{5}\b/g, luhn],
  ['TCKN', /\b[1-9]\d{10}\b/g, tckn],
  ['SSN', /\b\d{3}-\d{2}-\d{4}\b/g],
  ['PHONE', /(?:\+|\b00)\d{1,3}[ .-]?\(?\d{1,4}\)?(?:[ .-]?\d{2,4}){2,4}\b|\b0\d{3}[ .-]?\d{3}[ .-]?\d{2}[ .-]?\d{2}\b|\(\d{3}\)[ .-]?\d{3}[ .-]?\d{4}\b|\b\d{3}[.-]\d{3}[.-]\d{4}\b|\b0\d{4} ?\d{6}\b/g],
  ['ADDRESS', /(?<![\p{L}_])(?:address|addr|street[ _-]?address|billing[ _-]?address|shipping[ _-]?address|home[ _-]?address|adres|ev[ _-]?adresi)\s*["']?\s*[:=]\s*["']?([^\n"']{8,120}?)\s*(?=[\n"']|$)/giu, addressLike],
  ['ADDRESS', /\b\d{1,5}[A-Za-z]?\s+(?:[A-Z][a-z]+\.?\s+){1,3}(?:Street|St|Avenue|Ave|Road|Rd|Boulevard|Blvd|Lane|Ln|Drive|Dr|Court|Ct|Way|Place|Pl|Highway|Hwy|Parkway|Pkwy)\b\.?(?:,?\s*(?:Apt|Suite|Ste|Unit|Floor|Fl|#)\.?\s*[\w-]+)?(?:,\s*[A-Z][a-z]+(?:\s[A-Z][a-z]+)*)?(?:,?\s*[A-Z]{2}\s+\d{5}(?:-\d{4})?|\s+[A-Z]{1,2}\d[A-Z\d]?\s*\d[A-Z]{2})?|\bP\.?O\.?\s*Box\s+\d+\b|\bPosta Kutusu\s*\d+\b/g],
  ['ADDRESS', /(?<!\p{L})\p{Lu}[\p{L}.]+(?:\s+\p{Lu}[\p{L}.]+)*\s+(?:Mah\.?|Mahallesi|Mh\.|Cad\.?|Caddesi|Cd\.|Sok\.?|Sokak|Sk\.|Bulvarı|Blv\.)[^\n]{0,80}?No:?\s*\d+[A-Za-z]?(?:[ /,-]*(?:Daire|Kat|D|K)\.?:?\s*\d+)*(?:[ ,]*\p{Lu}\p{L}+\s*\/\s*\p{Lu}\p{L}+)?/gu],
  ['NAME', /(?<!\p{L})(?:[Mm]y name is|I am|I'm|[Dd]ear|[Rr]egards|[Ss]incerely|[Bb]est regards|[Kk]ind regards|[Cc]heers|[Bb]enim adım|[Bb]en|[Mm]erhaba|[Ss]aygılar(?:ımla)?|[Ss]evgiler)\s*,?\s+(\p{Lu}\p{Ll}+(?:\s+\p{Lu}\p{Ll}+){1,2})/gu],
  ['NAME', /(?<!\p{L})(?:Mr|Mrs|Ms|Miss|Dr|Prof|Sayın|Sn|Bay|Bayan)\.?\s+(\p{Lu}\p{Ll}+(?:\s+\p{Lu}\p{Ll}+){0,2})/gu],
  ['NAME', /(?<![\p{L}_])(?:full[ _-]?name|first[ _-]?name|last[ _-]?name|given[ _-]?name|family[ _-]?name|surname|customer(?:[ _-]?name)?|contact(?:[ _-]?name)?|owner|patient|employee|name|ad[ _-]?soyad|adı[ _-]?soyadı|isim|müşteri|hasta)\s*["']?\s*[:=]\s*["']?([^\n,;"']{2,60}?)\s*(?=[\n,;"']|$)/giu, personLike]
];
const FOLD = { i: ['[Iİ]', '[iı]'], s: ['[SŞ]', '[sş]'], c: ['[CÇ]', '[cç]'], g: ['[GĞ]', '[gğ]'], o: ['[OÖ]', '[oö]'], u: ['[UÜ]', '[uü]'] };
const nameForms = t => {
  const l = [...t.toLowerCase()];
  const upper = l.map(ch => FOLD[ch] ? FOLD[ch][0] : ch.toUpperCase()).join('');
  const cap = l.map((ch, i) => FOLD[ch] ? FOLD[ch][i ? 1 : 0] : i ? ch : ch.toUpperCase()).join('');
  return `(?:${cap}|${upper})`;
};
const PLACEHOLDER = /__PII_[A-Z]+_[0-9a-f]{6}__/g;
const hasPlaceholder = s => /__PII_[A-Z]+_[0-9a-f]{6}__/.test(s);

const apply = (text, type, re, check, found) => text.replace(re, (...args) => {
  const m = args[0];
  const val = typeof args[1] === 'string' ? args[1] : m;
  if (check && !check(val)) return m;
  const p = `__PII_${type}_${crypto.createHash('sha1').update(val).digest('hex').slice(0, 6)}__`;
  found[p] = val;
  return m.replace(val, p);
});

const namesFromEmails = (found, text) => Object.entries(found)
  .filter(([p]) => p.startsWith('__PII_EMAIL_'))
  .map(([, v]) => v.split('@')[0].split(/[._-]/).map(t => t.replace(/\d+$/, '')).filter(t => /^[a-z]{3,}$/i.test(t)))
  .filter(parts => parts.length >= 2)
  .map(parts => parts.map(t => new RegExp('(?<!\\p{L})' + nameForms(t) + '(?!\\p{L})', 'gu')))
  .filter(res => res.every(re => re.test(text)))
  .flat();

const mask = (text, found) => {
  for (const [type, re, check] of PATTERNS) text = apply(text, type, re, check, found);
  for (const re of namesFromEmails(found, text)) text = apply(text, 'NAME', re, null, found);
  return text;
};
const unmask = (text, map) => text.replace(PLACEHOLDER, p => map[p] ?? p);
const deepMap = (v, fn) => typeof v === 'string' ? fn(v)
  : Array.isArray(v) ? v.map(x => deepMap(x, fn))
  : v && typeof v === 'object' ? Object.fromEntries(Object.entries(v).map(([k, x]) => [k, deepMap(x, fn)]))
  : v;

const dir = process.env.CLAUDE_PLUGIN_DATA || path.join(os.homedir(), '.claude', 'pii-mask');
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

const main = () => {
  const input = JSON.parse(fs.readFileSync(0, 'utf8'));
  const id = input.session_id;
  const out = o => process.stdout.write(JSON.stringify(o));
  switch (input.hook_event_name) {
    case 'SessionStart':
      process.stdout.write('Tokens shaped like __PII_EMAIL_a1b2c3__ are personal data masked by the pii-mask plugin. Treat them as opaque literals: copy them verbatim into tool inputs, never guess, expand or alter them.');
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
        reason: `pii-mask: personal data found in your prompt, nothing was sent. ${copied ? 'A masked copy is in your clipboard, paste it to resend' : 'Resend this masked version'}:\n\n${masked}`
      });
      break;
    }
    case 'PostToolUse': {
      const found = {};
      const updated = deepMap(input.tool_response, s => mask(s, found));
      if (!Object.keys(found).length) break;
      save(id, found);
      out({ hookSpecificOutput: { hookEventName: 'PostToolUse', updatedToolOutput: updated } });
      break;
    }
    case 'PreToolUse': {
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
  }
};

if (require.main === module) main();
module.exports = { mask, unmask, luhn, tckn, iban };