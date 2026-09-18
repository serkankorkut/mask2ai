const http = require('http');
const path = require('path');
const fs = require('fs');

const port = +process.argv[2] || 8790;
const target = path.join(__dirname, 'customers.csv');

const sse = events => events.map(([type, data]) => `event: ${type}\ndata: ${JSON.stringify({ type, ...data })}\n\n`).join('');
const reply = (blocks, stop) => sse([
  ['message_start', { message: { id: 'msg_' + Date.now(), type: 'message', role: 'assistant', model: 'fake', content: [], stop_reason: null, usage: { input_tokens: 1, output_tokens: 1 } } }],
  ...blocks.flatMap((b, i) => b.type === 'text'
    ? [['content_block_start', { index: i, content_block: { type: 'text', text: '' } }], ...b.text.split(/(?<=\n)/).map(chunk => ['content_block_delta', { index: i, delta: { type: 'text_delta', text: chunk } }]), ['content_block_stop', { index: i }]]
    : [['content_block_start', { index: i, content_block: { type: 'tool_use', id: b.id, name: b.name, input: {} } }], ['content_block_delta', { index: i, delta: { type: 'input_json_delta', partial_json: JSON.stringify(b.input) } }], ['content_block_stop', { index: i }]]),
  ['message_delta', { delta: { stop_reason: stop, stop_sequence: null }, usage: { output_tokens: 1 } }],
  ['message_stop', {}]
]);

const blocksOf = c => typeof c === 'string' ? [{ type: 'text', text: c }] : c;
const userText = msgs => {
  const m = [...msgs].reverse().find(x => x.role === 'user' && blocksOf(x.content).some(b => b.type === 'text' && !b.text.startsWith('<system-reminder>')));
  return m ? blocksOf(m.content).filter(b => b.type === 'text' && !b.text.startsWith('<system-reminder>')).map(b => b.text).join('\n') : '';
};
const toolResultText = msgs => {
  const m = [...msgs].reverse().find(x => x.role === 'user');
  const blocks = m ? blocksOf(m.content).filter(b => b.type === 'tool_result') : [];
  return blocks.length ? JSON.stringify(blocks) : null;
};

http.createServer((req, res) => {
  let body = '';
  req.on('data', c => body += c);
  req.on('end', () => {
    if (!req.url.startsWith('/v1/messages') || req.url.includes('count_tokens')) return res.writeHead(200, { 'content-type': 'application/json' }).end('{"input_tokens":1}');
    const msg = JSON.parse(body);
    const text = userText(msg.messages);
    const tool = toolResultText(msg.messages);
    if (process.env.FAKE_API_LOG) fs.appendFileSync(process.env.FAKE_API_LOG, `${tool ? 'tool_result' : 'user'} ${(tool || text).replace(/\s+/g, ' ').slice(0, 160)}\n`);
    res.writeHead(200, { 'content-type': 'text/event-stream' });
    if (/write the title/i.test(text)) return res.end(reply([{ type: 'text', text: 'Overdue invoice reminder' }], 'end_turn'));
    if (tool) {
      const text = tool;
      const emails = [...new Set(text.match(/__PII_EMAIL_[0-9a-f]{6}__/g) || [])];
      const phones = [...new Set(text.match(/__PII_PHONE_[0-9a-f]{6}__/g) || [])];
      return res.end(reply([{ type: 'text', text: `Found her in the file. Email: ${emails[0] || 'unknown'}, phone: ${phones[0] || 'unknown'}.\n\nI only see placeholders for the personal data, which is what pii-mask sends me. Here is the reminder:\n\nSubject: Invoice 1042 is overdue\n\nHi, a quick reminder that invoice 1042 is now past its due date. Please arrange payment or reply if something is wrong. Thank you.` }], 'end_turn'));
    }
    if (/customers\.csv/i.test(text)) return res.end(reply([{ type: 'text', text: 'Let me look up her details in the file.' }, { type: 'tool_use', id: 'toolu_' + Date.now(), name: 'Read', input: { file_path: target } }], 'tool_use'));
    res.end(reply([{ type: 'text', text: 'Sure. Which file has her contact details?' }], 'end_turn'));
  });
}).listen(port, '127.0.0.1', () => console.log(`fake anthropic api on http://127.0.0.1:${port}`));