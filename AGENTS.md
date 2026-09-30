# Working on mask2ai

Read `HANDOFF.md` first; it has the architecture, the verification commands and the open work.

## Words the owner uses

- `DEPLOY ET`: deploy the marketing site (`npm run deploy` in `~/repo/mask2ai.com`). Never deploy without it.
- `SYNC ET`: everything at once. Commit and push this repo and the site repo, bump the version if the code changed since the last tag, tag and publish the GitHub release with the extension zip attached (`scripts/pack-extension.sh`), rebuild and deploy the marketing site, then run `npm run indexnow` in the site repo.

## Rules

- GitHub rulesets (added 2026-09-30 on mask2ai and mask2ai.com): `main` blocks force pushes and deletion; `v*` tags cannot be deleted, moved or overwritten. Normal pushes and new tags work. A history rewrite or re-tag needs the owner to disable the ruleset first in Settings > Rules.
- `main` also requires a pull request approved by the code owner (`.github/CODEOWNERS` names @serkankorkut) for everyone except the owner, who can push directly. Collaborators cannot merge each other's pull requests without the owner's approval.
- Only the owner (admin role) can create `v*` tags, so only the owner can cut a release.

- Verify before claiming: `npm test`, `node demo/prove.js`, `node demo/verify-web.js`. Do not list an environment or a file type the checks do not cover.
- No code comments unless unavoidable. No trailing whitespace. No newline at end of file.
- Commit messages: `type: Capitalised summary`, no attribution lines.
- Demo data is Jane Doe and John Doe with repetitive numbers.
- Keep `manifest.json`, `.claude-plugin/plugin.json` and `package.json` at the same version; the site reads it.
- After the extension is on the Chrome Web Store, write its item ID to `store/id.txt`; the site reads it for the store badges.