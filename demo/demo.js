const fs = require('fs');
const os = require('os');
const path = require('path');
const { spawnSync } = require('child_process');

const [mode, arg] = process.argv.slice(2);
const hook = input => {
  const r = spawnSync(process.execPath, [path.join(__dirname, '..', 'hooks', 'mask.js')], {
    input: JSON.stringify({ session_id: 'demo', ...input }),
    env: { ...process.env, CLAUDE_PLUGIN_DATA: path.join(os.tmpdir(), 'pii-mask-demo') },
    encoding: 'utf8'
  });
  return r.stdout ? JSON.parse(r.stdout) : null;
};
const paint = s => s.replace(/__PII_\w+__/g, '\x1b[1;33m$&\x1b[0m');
const label = s => console.log(`\x1b[2m${s}\x1b[0m`);

if (mode === 'tool') {
  const out = hook({ hook_event_name: 'PostToolUse', tool_name: 'Bash', tool_response: { stdout: fs.readFileSync(arg, 'utf8'), stderr: '', interrupted: false, isImage: false } });
  label('PostToolUse → updatedToolOutput.stdout');
  console.log(paint(out.hookSpecificOutput.updatedToolOutput.stdout));
} else if (mode === 'prompt') {
  const out = hook({ hook_event_name: 'UserPromptSubmit', prompt: arg });
  label('UserPromptSubmit → decision: block');
  console.log(paint(out.reason));
} else if (mode === 'edit') {
  const out = hook({ hook_event_name: 'PreToolUse', tool_name: 'Bash', tool_input: { command: arg } });
  label('PreToolUse → updatedInput.command (restored locally, never sent to the model)');
  console.log(`\x1b[1;32m${out.hookSpecificOutput.updatedInput.command}\x1b[0m`);
}