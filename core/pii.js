(function (root, factory) {
  if (typeof module === 'object' && module.exports) module.exports = factory();
  else root.pii = factory();
})(typeof globalThis !== 'undefined' ? globalThis : this, function () {
  const hash = s => {
    let h1 = 0xdeadbeef;
    let h2 = 0x41c6ce57;
    for (let i = 0; i < s.length; i++) {
      const ch = s.charCodeAt(i);
      h1 = Math.imul(h1 ^ ch, 2654435761);
      h2 = Math.imul(h2 ^ ch, 1597334677);
    }
    h1 = Math.imul(h1 ^ (h1 >>> 16), 2246822507) ^ Math.imul(h2 ^ (h2 >>> 13), 3266489909);
    h2 = Math.imul(h2 ^ (h2 >>> 16), 2246822507) ^ Math.imul(h1 ^ (h1 >>> 13), 3266489909);
    return ((h2 >>> 0).toString(16).padStart(8, '0') + (h1 >>> 0).toString(16).padStart(8, '0')).slice(0, 6);
  };

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
    ['DOB', /(?<![\p{L}_])(?:dob|date of birth|birth ?date|born(?: on)?|doğum tarihi|d\.?t\.?)\s*["']?\s*[:=]?\s*["']?(\d{1,2}[./-]\d{1,2}[./-]\d{4}|\d{4}-\d{2}-\d{2})/giu],
    ['ID', /(?<![\p{L}_])(?:passport(?: no| number)?|pasaport(?: no)?|kimlik(?: no)?|id(?: number| no)|national id|driver'?s licen[cs]e|ehliyet(?: no)?|sürücü belgesi)\s*["']?\s*[:=]?\s*["']?([A-Z]{0,2}\d{6,11}[A-Z]?)(?![\d\p{L}])/giu],
    ['PLATE', /\b(?:0[1-9]|[1-7]\d|8[01]) [A-Z]{1,3} \d{2,4}\b/g],
    ['IP', /(?<!version\s)(?<!\bv)\b(?!(?:10|127|0)\.)(?!192\.168\.)(?!172\.(?:1[6-9]|2\d|3[01])\.)(?!169\.254\.)(?:25[0-5]|2[0-4]\d|1?\d?\d)(?:\.(?:25[0-5]|2[0-4]\d|1?\d?\d)){3}\b/g],
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
  const TYPES = [...new Set(PATTERNS.map(p => p[0]))];
  const config = { disable: new Set(), extra: [], allow: new Set() };
  const configure = cfg => {
    config.disable = new Set((cfg && cfg.disable || []).map(t => String(t).toUpperCase()));
    config.allow = new Set(cfg && cfg.allow || []);
    config.extra = (cfg && cfg.extra || []).map(e => [String(e.type || 'CUSTOM').toUpperCase().replace(/[^A-Z]/g, '') || 'CUSTOM', new RegExp(e.pattern, 'g' + (e.flags || '').replace(/g/g, ''))]);
    return config;
  };
  const PLACEHOLDER = /__PII_[A-Z]+_[0-9a-f]{6}__/g;
  const hasPlaceholder = s => /__PII_[A-Z]+_[0-9a-f]{6}__/.test(s);

  const apply = (text, type, re, check, found) => text.replace(re, (...args) => {
    const m = args[0];
    const val = typeof args[1] === 'string' ? args[1] : m;
    if (check && !check(val)) return m;
    if (config.allow.has(val)) return m;
    const p = `__PII_${type}_${hash(val)}__`;
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
    for (const [type, re, check] of [...PATTERNS, ...config.extra]) if (!config.disable.has(type)) text = apply(text, type, re, check, found);
    if (!config.disable.has('NAME')) for (const re of namesFromEmails(found, text)) text = apply(text, 'NAME', re, null, found);
    return text;
  };
  const unmask = (text, map) => text.replace(PLACEHOLDER, p => map[p] ?? p);
  const deepMap = (v, fn) => typeof v === 'string' ? fn(v)
    : Array.isArray(v) ? v.map(x => deepMap(x, fn))
    : v && typeof v === 'object' ? Object.fromEntries(Object.entries(v).map(([k, x]) => [k, deepMap(x, fn)]))
    : v;

  return { mask, unmask, luhn, tckn, iban, hasPlaceholder, deepMap, PLACEHOLDER, TYPES, configure };
});