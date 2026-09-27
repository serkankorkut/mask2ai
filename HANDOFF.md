# Handoff

Context for continuing mask2ai on another machine or with another agent. Read this before touching anything.

## What mask2ai is

Personal-data masking for AI assistants. One detection core, `core/pii.js`, used by two integrations:

- **Claude Code plugin**: `hooks/hooks.json` registers `hooks/mask.js` for `SessionStart`, `UserPromptSubmit`, `PreToolUse`, `PostToolUse`, `MessageDisplay`, `SessionEnd`. Prompts with personal data are blocked and a masked copy is offered (Claude Code hooks cannot rewrite prompts). Tool output is masked via `updatedToolOutput`, tool input restored via `updatedInput`, replies restored on screen via `MessageDisplay`. Placeholder map is an append-only JSONL under `$CLAUDE_PLUGIN_DATA`, deleted at session end.
- **Chrome extension**: `manifest.json` at the repo root, scripts in `extension/`. Runs at `document_start` in the page's main world on claude.ai, chatgpt.com and chat.openai.com. Wraps `window.fetch`, rewrites chat request bodies (JSON, form-encoded, byte arrays, gzip-compressed byte arrays), restores placeholders in rendered text with a `MutationObserver`. Map in `sessionStorage`.

Placeholders are `__PII_<TYPE>_<6 hex of cyrb53(value)>__`, content-addressed so masking is deterministic and parallel-safe.

## Repositories

| Repo | Path | Purpose |
| --- | --- | --- |
| github.com/serkankorkut/mask2ai (private) | `~/repo/mask2ai` | plugin, extension, core, tests, demos, this file |
| github.com/serkankorkut/mask2ai.com (private) | `~/repo/mask2ai.com` | marketing site, Cloudflare Workers assets, `public/` |

Current version 0.4.0 in `manifest.json`, `.claude-plugin/plugin.json`, `package.json`. Keep the three in sync.

## Verify before claiming anything works

```
npm test                  # detection, restoration, request rewriting; runs in CI (.github/workflows/test.yml)
node demo/prove.js        # starts a fake Anthropic API, drives the real claude CLI, asserts only placeholders leave
node demo/verify-web.js   # headless Chrome loads the extension on claude.ai and chatgpt.com, asserts masked bodies and DOM restore
```

`demo/verify-web.js` and `demo/chrome-open.js` need Google Chrome 137+ and use `--remote-debugging-pipe` with `Extensions.loadUnpacked`, because `--load-extension` no longer works in branded Chrome. Cloudflare challenges headless Chrome on chatgpt.com; recordings use a visible window.

## Demos

- `demo/claude-code.gif`: the real Claude Code TUI driven by `expect` (`demo/claude-code.exp`) against `demo/fake-api.js` on port 8790, recorded with asciinema and rendered with agg. Use `ANTHROPIC_AUTH_TOKEN`, not `ANTHROPIC_API_KEY`, or Claude Code shows a confirmation dialog and remembers a rejected key. Submit with the CSI-u Enter sequence `\033[13;1u`; a plain carriage return is inserted as a newline. Keep draining output during pauses (`expect_background` plus `vwait`) or the recording collapses into a few frames.
- `demo/chatgpt-web.gif`: a real anonymous chatgpt.com chat in a visible Chrome with the extension, `node demo/chrome-open.js https://chatgpt.com/` then `node demo/record-live.js chatgpt.com "<message>" demo/chatgpt-web.gif`. Captions are injected by the recorder and must carry `data-mask2ai` so the extension does not restore placeholders inside them.
- Demo data is Jane Doe and John Doe with repetitive numbers (`demo/customers.csv`). `11111111110` and `22222222220` pass the TC checksum.

## Conventions the owner insists on

- Never list a feature or environment that is not verified. The site and README name exactly three: Claude Code CLI, claude.ai in Chrome, ChatGPT web in Chrome.
- No code comments unless unavoidable; no trailing whitespace; no newline at end of file.
- Commit only when asked. Deploy the site only after the owner writes `DEPLOY ET` in capitals.
- Commit messages: short, plain, `type: Capitalised summary`. No AI attribution lines.

## Site

`~/repo/mask2ai.com` mirrors the tokenmeter-site structure: `src/layout.html`, `src/pages/{index,install,docs,privacy,404}.html`, `src/static/` (style, script, logo SVGs, GIFs, OG image, llms.txt, robots, Search Console and IndexNow files), `src/logo.svg` and `src/mark.svg` with CSS-variable colours. `node build.mjs` generates `public/` (git-ignored) with JSON-LD, sitemap and robots; the version comes from `../mask2ai/package.json`, so keep both repos side by side or set `MASK2AI_VERSION`. `npm run dev`, `npm run deploy`, `npm run indexnow`. Custom domains mask2ai.com and www.mask2ai.com. Refresh the GIFs in `src/static/` when the recordings change. Section titles start with a capital letter; the owner asked for that explicitly.

## Chrome Web Store

Not yet submitted. `scripts/pack-extension.sh` builds `dist/mask2ai-extension-<version>.zip` with only the extension files; `store/listing.md` has the listing text, permissions justification, privacy answers and steps. The owner must create the developer account, upload the zip and a 1280×800 screenshot showing the toast, and submit. The privacy policy URL is https://mask2ai.com/privacy/.

## Brand

Logo from the owner's Claude Design export: document → mask → robot mark, plus the mask alone as the app icon. Ink `#171a21`, accent `#7c3aed` (light) and `#a78bfa` (dark), paper `#f6f5f1`. Sources in `brand/`; extension icons in `extension/icons/` are rendered from `brand/icon.svg` with headless Chrome screenshots at 16, 32, 48 and 128 px. The brief that produced it is `brand/logo-brief.md` in the site repo.

## Open work, in priority order

1. **Codex CLI support.** Not implemented. Facts gathered on 2026-09-28: Codex CLI 0.154 has hooks marked stable (`codex features list`), configured in `~/.codex/hooks.json`, `<repo>/.codex/hooks.json` or a `[hooks]` table in `config.toml`, with the same event names and stdin fields as Claude Code (`prompt`, `tool_name`, `tool_input`, `tool_response`). Documented outputs: `decision: "block"` for `UserPromptSubmit` and `PostToolUse`, `hookSpecificOutput.updatedInput` for `PreToolUse`, `additionalContext`, `systemMessage`. Tool output rewriting is not documented, so masking file reads through hooks may be impossible; test `updatedToolOutput` empirically first. A probe with logging hooks under `codex exec` hung without firing (likely waiting on the app-server or a trust prompt) and was killed. If hooks cannot rewrite tool output, the alternative is a local proxy set via `openai_base_url` or `chatgpt_base_url` in `config.toml` that rewrites Responses API `input` items and restores placeholders in streamed deltas. Do not ship or advertise Codex until `PostToolUse` masking is verified.
2. **claude.ai recorded demo.** The extension is verified on claude.ai by `verify-web.js`, but a recorded demo needs a logged-in account. The owner's Chrome had the unpacked extension loaded from the old `~/repo/pii-mask` path; it must be re-added from `~/repo/mask2ai`. Then `node demo/record-live.js claude.ai "<message>" demo/claude-ai.gif` against a Chrome started by `chrome-open.js`, or drive the owner's own Chrome. Late injection of the scripts into an already-loaded page does not work: claude.ai captures `fetch` at load.
3. **Publishing.** Both repos are private, so the GitHub links on the site 404 for visitors. The extension is not on the Chrome Web Store. The Claude Code plugin installs from the repo as its own marketplace and could be submitted to the official Anthropic marketplace once public.
4. **Detection limits** are stated in the README: pattern based, no bare names in prose, no semantic data, no images. The upgrade path is an NER model.

## Machine-specific notes (owner's Mac)

The `claude` CLI's OAuth token is expired, so `prove.js` and the TUI demo use fake APIs by design. Chrome 153 is installed. `asciinema`, `agg`, `ffmpeg`, `expect` are available. The ChatGPT app bundles Codex at `/Applications/ChatGPT.app/Contents/Resources/codex`; `codex` is not on `PATH`.