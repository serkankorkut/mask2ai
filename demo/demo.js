const fs = require('fs');
const os = require('os');
const path = require('path');
const { spawnSync } = require('child_process');

const [mode, arg] = process.argv.slice(2);
const hook = input => {
  const r = spawnSync(process.execPath, [path.join(__dirname, '..', 'hooks', 'mask.js')], {
    input: JSON.stringify({ session_id: 'demo', ...input }),
    env: { ...process.env, CLAUDE_PLUGIN_DATA: path.join(os.tmpdir(), 'pii-mask-demo'), PATH: '' },
    encoding: 'utf8'
  });
  return r.stdout ? JSON.parse(r.stdout) : null;
};
const yellow = s => s.replace(/__PII_\w+__/g, '\x1b[1;33m$&\x1b[0m');
const dim = s => console.log(`\x1b[2m${s}\x1b[0m`);
const shield = s => console.log(`\x1b[1;35m🛡 ${s}\x1b[0m`);

if (mode === 'start') {
  shield(hook({ hook_event_name: 'SessionStart', source: 'startup' }).systemMessage);
} else if (mode === 'prompt') {
  const out = hook({ hook_event_name: 'UserPromptSubmit', prompt: arg });
  if (!out) return console.log('\x1b[32m✓ sent. The model receives only the placeholder.\x1b[0m');
  shield('pii-mask: personal data found in your prompt. Nothing was sent.');
  dim('Masked copy is in your clipboard, paste it to resend:');
  console.log(yellow(out.reason.split('\n\n')[1]));
} else if (mode === 'read') {
  const out = hook({ hook_event_name: 'PostToolUse', tool_name: 'Read', tool_response: { file: { filePath: arg, content: fs.readFileSync(arg, 'utf8') } } });
  dim('What the model receives:');
  console.log(yellow(out.hookSpecificOutput.updatedToolOutput.file.content));
  shield(out.systemMessage);
} else if (mode === 'run') {
  const out = hook({ hook_event_name: 'PreToolUse', tool_name: 'Bash', tool_input: { command: arg } });
  dim('What actually runs on your machine:');
  console.log(`\x1b[1;32m${out.hookSpecificOutput.updatedInput.command}\x1b[0m`);
}