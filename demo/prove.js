const http = require('http');
const path = require('path');
const { spawn } = require('child_process');

const root = path.join(__dirname, '..');
const target = path.join(root, 'demo', 'customers.csv');
const secrets = ['Jane', 'John', 'jane.doe@example.com', 'john.doe@example.com', '555 555 5555', '555 555 55 55', '111-11-1111', '222-22-2222', '11111111110', '22222222220', '123 Main St', 'Bağdat Cad.', 'ali@example.com'];
const requests = [];

const sse = events => events.map(([type, data]) => `event: ${type}\ndata: ${JSON.stringify({ type, ...data })}\n\n`).join('');
const reply = (id, blocks, stop) => sse([
  ['message_start', { message: { id, type: 'message', role: 'assistant', model: 'proof', content: [], stop_reason: null, usage: { input_tokens: 1, output_tokens: 1 } } }],
  ...blocks.flatMap((b, i) => b.type === 'text'
    ? [['content_block_start', { index: i, content_block: { type: 'text', text: '' } }], ['content_block_delta', { index: i, delta: { type: 'text_delta', text: b.text } }], ['content_block_stop', { index: i }]]
    : [['content_block_start', { index: i, content_block: { type: 'tool_use', id: b.id, name: b.name, input: {} } }], ['content_block_delta', { index: i, delta: { type: 'input_json_delta', partial_json: JSON.stringify(b.input) } }], ['content_block_stop', { index: i }]]),
  ['message_delta', { delta: { stop_reason: stop, stop_sequence: null }, usage: { output_tokens: 1 } }],
  ['message_stop', {}]
]);

const server = http.createServer((req, res) => {
  let body = '';
  req.on('data', c => body += c);
  req.on('end', () => {
    if (!req.url.startsWith('/v1/messages') || req.url.includes('count_tokens')) return res.writeHead(200, { 'content-type': 'application/json' }).end('{"input_tokens":1}');
    const msg = JSON.parse(body);
    requests.push(msg);
    const last = msg.messages[msg.messages.length - 1];
    const sawTool = Array.isArray(last.content) && last.content.some(c => c.type === 'tool_result');
    res.writeHead(200, { 'content-type': 'text/event-stream' });
    res.end(sawTool
      ? reply('msg_2', [{ type: 'text', text: 'Done.' }], 'end_turn')
      : reply('msg_1', [{ type: 'tool_use', id: 'toolu_1', name: 'Read', input: { file_path: target } }], 'tool_use'));
  });
});

const claude = (env, prompt) => new Promise(resolve => {
  const p = spawn('claude', ['--plugin-dir', root, '-p', prompt, '--allowedTools', 'Read', '--output-format', 'json'], { cwd: root, env, stdio: ['ignore', 'pipe', 'pipe'] });
  let out = '';
  p.stdout.on('data', c => out += c);
  p.stderr.on('data', c => out += c);
  const timer = setTimeout(() => p.kill(), 120000);
  p.on('close', code => {
    clearTimeout(timer);
    resolve({ code, out });
  });
});

const fail = msg => {
  console.error(msg);
  process.exit(1);
};

const userText = m => {
  const last = [...m.messages].reverse().find(x => x.role === 'user');
  return typeof last.content === 'string' ? last.content : last.content.filter(c => !(c.text || '').startsWith('<system-reminder>')).map(c => c.type === 'tool_result' ? JSON.stringify(c.content) : c.text || c.type).join(' | ');
};

server.listen(0, '127.0.0.1', async () => {
  const env = { ...process.env, ANTHROPIC_BASE_URL: `http://127.0.0.1:${server.address().port}`, ANTHROPIC_API_KEY: 'proof-only-never-valid', CLAUDE_CODE_DISABLE_NONESSENTIAL_TRAFFIC: '1' };
  delete env.CLAUDECODE;

  console.log('1. prompt containing personal data');
  const a = await claude(env, 'Email ali@example.com about the invoice');
  if (a.code !== 0) fail(`claude exited ${a.code}\n${a.out}`);
  if (!a.out.includes('blocked by hook')) fail(`prompt was not blocked:\n${a.out}`);
  if (requests.length) fail(`${requests.length} request(s) were sent for a blocked prompt`);
  console.log('   blocked by the hook, API requests made: 0\n');

  console.log('2. tool output containing personal data');
  const b = await claude(env, 'Read demo/customers.csv');
  server.close();
  if (b.code !== 0) fail(`claude exited ${b.code} after ${requests.length} request(s)\n${b.out}`);
  console.log(`   API requests made: ${requests.length}, all captured by the fake server`);
  for (const [i, m] of requests.entries()) console.log(`\n   request ${i + 1}, last user message:\n   ${userText(m).slice(0, 500)}`);
  const wire = JSON.stringify(requests);
  const escape = s => s.replace(/[.*+?^${}()|[\]\\]/g, m => '\\' + m);
  const leaked = secrets.filter(s => new RegExp('(?<![A-Za-z])' + escape(s) + '(?![A-Za-z])', 'u').test(wire));
  const placeholders = new Set(wire.match(/__PII_[A-Z]+_[0-9a-f]{6}__/g) || []);
  console.log(`\n   placeholders on the wire: ${placeholders.size}`);
  console.log(`   personal data on the wire: ${leaked.length ? 'LEAKED ' + leaked.join(', ') : 'none'}`);
  for (const s of leaked) for (const m of wire.matchAll(new RegExp('(?<![A-Za-z])' + escape(s) + '(?![A-Za-z])', 'gu'))) console.log(`   context: …${wire.slice(Math.max(0, m.index - 80), m.index + s.length + 40).replace(/\s+/g, ' ')}…`);
  if (leaked.length || !placeholders.size) process.exit(1);
  console.log('\nPROOF OK: nothing personal reached the API, only placeholders.');
});