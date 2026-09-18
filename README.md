# pii-mask

Claude Code plugin that keeps personal data on your machine. It masks emails, phone numbers, card numbers, IBANs, Turkish national IDs and US SSNs before they reach the model, and restores them where they are needed.

## How it works

| Hook | What happens |
| --- | --- |
| `UserPromptSubmit` | Prompt contains personal data → it is blocked before sending, and a masked copy is shown (and put in your clipboard on macOS). Paste and resend. |
| `PostToolUse` | Tool output (file reads, shell output, grep, MCP results) is masked before the model sees it. |
| `PreToolUse` | Placeholders in tool inputs (edits, writes, commands) are restored, so edits match real file content and commands run with real values. |
| `MessageDisplay` | Placeholders in Claude's replies are restored on screen. The transcript keeps the placeholders. |
| `SessionEnd` | The placeholder map for the session is deleted. |

Names and addresses are found heuristically: labels (`name:`, `"firstName":`, `address:`, `adres:`), titles (`Dr.`, `Mr.`, `Sayın`), US street shapes (`123 Main St, Springfield, IL 62704`), Turkish shapes (`Atatürk Mah. Cumhuriyet Cad. No:12 D:3 Kadıköy/İstanbul`), and names derived from masked emails (`ali.yilmaz@` also masks `Ali Yılmaz`).

Placeholders look like `__PII_EMAIL_3f9a1c__`. The suffix is a hash of the value, so the same value always maps to the same placeholder and the map self-heals after a resume: re-reading a file recreates it.

Card numbers are Luhn-checked, IBANs mod-97-checked and TCKNs checksum-checked to keep false positives low. The map lives in the plugin's data directory as a `0600` file, one per session.

## Install

```
/plugin marketplace add serkankorkut/pii-mask
/plugin install pii-mask@pii-mask
```

Requires Node.js 18+ on `PATH`. To try it from a checkout:

```
claude --plugin-dir /path/to/pii-mask
```

## Test

```
node test.js
```

## Limits

- Name and address detection is heuristic. A bare name in free text with no label, title or matching email nearby passes through, and labels like `name:` can catch non-person values. An NER model is the upgrade path.
- Images and pasted files are not inspected.
- Prompts cannot be rewritten by hooks, so a prompt with personal data has to be resent in masked form.
- Bash hooks see tool output, not the raw API request. If you need a hard guarantee, run a masking proxy and point `ANTHROPIC_BASE_URL` at it.