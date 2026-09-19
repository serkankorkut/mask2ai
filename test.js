const assert = require('assert');
const fs = require('fs');
const os = require('os');
const path = require('path');
const { spawnSync } = require('child_process');
const { mask, unmask, luhn, tckn, iban } = require('./core/pii.js');
const { isChatRequest, rewrite } = require('./extension/rewrite.js');

assert(luhn('4111 1111 1111 1111'));
assert(!luhn('1234 5678 9012 3456'));
assert(tckn('10000000146'));
assert(!tckn('12345678901'));
assert(iban('GB82 WEST 1234 5698 7654 32'));
assert(iban('TR330006100519786457841326'));
assert(!iban('GB00 WEST 1234 5698 7654 32'));

const text = 'Mail ali@example.com or +90 532 123 45 67, card 4111 1111 1111 1111, id 10000000146, ssn 123-45-6789, iban GB82 WEST 1234 5698 7654 32, ts 1758200000000 v1.2.3 port 8080';
const found = {};
const masked = mask(text, found);
assert(!/example\.com|532|4111|10000000146|123-45|WEST/.test(masked), masked);
assert(/1758200000000 v1\.2\.3 port 8080$/.test(masked), masked);
assert.strictEqual(Object.keys(found).length, 6);
assert.strictEqual(unmask(masked, found), text);
assert.strictEqual(mask(text, {}), masked);

const pii = [
  "Dr. Ayşe Yılmaz will call.\nname: John Smith\n\"firstName\": \"Veli\"\naddress: 123 Main St, Springfield, IL 62704\nAtatürk Mah. Cumhuriyet Cad. No:12 D:3 Kadıköy/İstanbul\nmail ali.yilmaz@x.com, Ali Yılmaz signed, cc ALI YILMAZ.",
  "name: pii-mask\nversion: 1.2.3\nusername: serkan\naddress: 0x7fffdeadbeef\nhostname: Claude Code\nSee 42 Ways To Go\nBind address: 192.168.1.10"
];
const f2 = {};
const m2 = mask(pii[0], f2);
for (const s of ["Ayşe Yılmaz", "John Smith", "Veli", "123 Main St, Springfield, IL 62704", "Atatürk Mah. Cumhuriyet Cad. No:12 D:3 Kadıköy/İstanbul", "Ali Yılmaz", "ALI YILMAZ", "ali.yilmaz@x.com"]) assert(!m2.includes(s), s + " leaked: " + m2);
assert(m2.includes("will call.") && m2.includes("signed, cc"), m2);
assert.strictEqual(unmask(m2, f2), pii[0]);
assert.strictEqual(mask(pii[1], {}), pii[1]);

const csv = "id,first_name,last_name,email,address\n1,Ayşe,Yılmaz,ayse.yilmaz@mail.com,\"Bağdat Cad. No:5 D:2 Kadıköy/İstanbul\"\nMeet at 221B Baker Street, London NW1 6XE.";
const f3 = {};
const m3 = mask(csv, f3);
for (const s of ["Ayşe", "Yılmaz", "ayse.yilmaz", "Bağdat Cad. No:5 D:2 Kadıköy/İstanbul", "221B Baker Street, London NW1 6XE"]) assert(!m3.includes(s), s + " leaked: " + m3);
assert(m3.startsWith("id,first_name,last_name,email,address\n1,__PII_NAME_") && m3.includes("__,\"__PII_ADDRESS_") && m3.endsWith("__."), m3);
assert.strictEqual(unmask(m3, f3), csv);
assert.strictEqual(mask("Can you help Deniz? mail: deniz.can@x.com is fine", {}).split("__PII_").length, 4);
assert.strictEqual(mask("Can you help Deniz? No email here.", {}), "Can you help Deniz? No email here.");

const extra = "DOB: 12/03/1988, doğum tarihi: 12.03.1988, passport no: U12345678, kimlik no 12345678901, plaka 34 ABC 123, from 85.105.23.11, local 192.168.1.10 and 10.0.0.1 and 127.0.0.1, version 1.2.3.4 is not an ip";
const fx = {};
const mx = mask(extra, fx);
for (const s of ["12/03/1988", "12.03.1988", "U12345678", "12345678901", "34 ABC 123", "85.105.23.11"]) assert(!mx.includes(s), s + " leaked: " + mx);
for (const s of ["192.168.1.10", "10.0.0.1", "127.0.0.1"]) assert(mx.includes(s), s + " wrongly masked: " + mx);
assert(mx.includes("version 1.2.3.4"), mx);
assert.strictEqual(unmask(mx, fx), extra);

const en = "Hi, I am John Smith, call 555-123-4567 or 555.123.4567 or 07700 900123. I live at 42 Oak Avenue, Apt 3B, Boston, MA 02116. Dear Mr. Brown, my name is Alice Cooper. Regards, Bob Marley. Sent 2026-09-18 from build 1.2.3 with 123.456 items";
const f4 = {};
const m4 = mask(en, f4);
for (const s of ["John Smith", "555-123-4567", "555.123.4567", "07700 900123", "42 Oak Avenue, Apt 3B, Boston, MA 02116", "Brown", "Alice Cooper", "Bob Marley"]) assert(!m4.includes(s), s + " leaked: " + m4);
assert(m4.endsWith("Sent 2026-09-18 from build 1.2.3 with 123.456 items"), m4);
assert.strictEqual(unmask(m4, f4), en);
assert.strictEqual(mask("This is Claude Code. Dear team, I am done. Best regards", {}), "This is Claude Code. Dear team, I am done. Best regards");

assert(isChatRequest("https://claude.ai/api/organizations/o1/chat_conversations/c1/completion"));
assert(isChatRequest("https://chatgpt.com/backend-api/f/conversation"));
assert(isChatRequest("https://chatgpt.com/backend-anon/f/conversation?x=1"));
assert(isChatRequest("https://chatgpt.com/unauth-mweb/conversation/updates?lightweight_authenticated=0&operationId=1"));
assert(isChatRequest("https://chatgpt.com/backend-api/conversation/prepare"));
assert(!isChatRequest("https://chatgpt.com/backend-api/me"));
assert(!isChatRequest("https://chatgpt.com/unauth-mweb/sentinel/ping"));
const ff = {};
const form = new URLSearchParams(rewrite("conversationState=" + encodeURIComponent(JSON.stringify({ backendConversationId: "6aad6fb5", messages: [{ content: "old mail ali@example.com" }] })) + "&prompt=" + encodeURIComponent("Say ok. Ref probe.person@example.org") + "&chatRequirementsToken=gAAAAABqrW_omd7nK", mask, ff));
assert(/^Say ok\. Ref __PII_EMAIL_[0-9a-f]{6}__$/.test(form.get("prompt")), form.get("prompt"));
assert(JSON.parse(form.get("conversationState")).messages[0].content.startsWith("old mail __PII_EMAIL_"));
assert.strictEqual(form.get("chatRequirementsToken"), "gAAAAABqrW_omd7nK");
assert.deepStrictEqual(Object.values(ff).sort(), ["ali@example.com", "probe.person@example.org"]);
assert(!isChatRequest("https://claude.ai/api/organizations/o1/chat_conversations/c1/completion_history"));
const fc = {};
const claudeBody = JSON.parse(rewrite(JSON.stringify({ prompt: "mail ali@example.com", attachments: [{ extracted_content: "card 4111 1111 1111 1111" }], parent_message_uuid: "550e8400-e29b-41d4-a716-446655440000" }), mask, fc));
assert(!claudeBody.prompt.includes("ali@") && !claudeBody.attachments[0].extracted_content.includes("4111"));
assert.strictEqual(claudeBody.parent_message_uuid, "550e8400-e29b-41d4-a716-446655440000");
const fg = {};
const gptBody = JSON.parse(rewrite(JSON.stringify({ action: "next", messages: [{ content: { content_type: "text", parts: ["call +90 532 123 45 67"] } }], model: "auto" }), mask, fg));
assert(/^call __PII_PHONE_[0-9a-f]{6}__$/.test(gptBody.messages[0].content.parts[0]) && gptBody.model === "auto");

const data = fs.mkdtempSync(path.join(os.tmpdir(), 'pii-mask-'));
const run = input => {
  const r = spawnSync(process.execPath, [path.join(__dirname, 'hooks/mask.js')], {
    input: JSON.stringify({ session_id: 's1', ...input }),
    env: { CLAUDE_PLUGIN_DATA: data, PATH: '' },
    encoding: 'utf8'
  });
  assert.strictEqual(r.status, 0, r.stderr);
  return r.stdout ? JSON.parse(r.stdout) : null;
};

assert.strictEqual(run({ hook_event_name: 'UserPromptSubmit', prompt: 'refactor the login page' }), null);
const blocked = run({ hook_event_name: 'UserPromptSubmit', prompt: 'email ali@example.com about it' });
assert.strictEqual(blocked.decision, 'block');
assert(blocked.suppressOriginalPrompt);
assert(!blocked.reason.includes('ali@example.com'));
assert(/__PII_EMAIL_[0-9a-f]{6}__/.test(blocked.reason));

const post = run({ hook_event_name: 'PostToolUse', tool_name: 'Bash', tool_response: { stdout: 'owner: veli@example.com\n', stderr: '', interrupted: false, isImage: false } });
const ph = post.hookSpecificOutput.updatedToolOutput.stdout.trim().split(' ')[1];
assert(/^__PII_EMAIL_[0-9a-f]{6}__$/.test(ph), ph);
assert.deepStrictEqual(Object.keys(post.hookSpecificOutput.updatedToolOutput), ['stdout', 'stderr', 'interrupted', 'isImage']);
assert.strictEqual(post.systemMessage, 'pii-mask: masked 1 value in Bash output');
assert(run({ hook_event_name: 'SessionStart', source: 'startup' }).systemMessage.startsWith('pii-mask active'));
assert.strictEqual(run({ hook_event_name: 'PostToolUse', tool_name: 'Bash', tool_response: { stdout: 'clean\n', stderr: '' } }), null);

assert.strictEqual(run({ hook_event_name: 'PreToolUse', tool_name: 'Bash', tool_input: { command: 'ls' } }), null);
const pre = run({ hook_event_name: 'PreToolUse', tool_name: 'Edit', tool_input: { file_path: '/x', old_string: `owner: ${ph}`, new_string: 'owner: none' } });
assert.deepStrictEqual(pre.hookSpecificOutput.updatedInput, { file_path: '/x', old_string: 'owner: veli@example.com', new_string: 'owner: none' });

const display = run({ hook_event_name: 'MessageDisplay', delta: `Found ${ph} in the config.\n` });
assert.strictEqual(display.hookSpecificOutput.displayContent, 'Found veli@example.com in the config.\n');

assert(fs.existsSync(path.join(data, 's1.jsonl')));
run({ hook_event_name: 'SessionEnd', reason: 'other' });
assert(!fs.existsSync(path.join(data, 's1.jsonl')));
fs.rmSync(data, { recursive: true });
console.log('ok');