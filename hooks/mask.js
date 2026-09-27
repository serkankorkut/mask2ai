#!/usr/bin/env node
const fs = require('fs');
const os = require('os');
const path = require('path');
const { spawnSync } = require('child_process');
const { mask, unmask, hasPlaceholder, deepMap } = require('../core/pii.js');

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
      const updated = deepMap(input.tool_response, s => mask(s, found));
      if (!Object.keys(found).length) break;
      save(id, found);
      const n = Object.keys(found).length;
      out({ systemMessage: `mask2ai: masked ${n} value${n === 1 ? '' : 's'} in ${input.tool_name} output`, hookSpecificOutput: { hookEventName: 'PostToolUse', updatedToolOutput: updated } });
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