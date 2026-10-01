# Third-party skills

Vendored into this repo for use with Claude Code. Each is unmodified from source except where noted. Update by re-copying from the source repo and bumping the commit hash below.

| Skill | Source | Commit | License |
|---|---|---|---|
| `ui-ux-pro-max` | [nextlevelbuilder/ui-ux-pro-max-skill](https://github.com/nextlevelbuilder/ui-ux-pro-max-skill) | `0d2b646` | MIT |
| `nextjs-shadcn` | [laguagu/claude-code-nextjs-skills](https://github.com/laguagu/claude-code-nextjs-skills) | `7c5cb7e` | MIT |
| `next-best-practices` | [laguagu/claude-code-nextjs-skills](https://github.com/laguagu/claude-code-nextjs-skills) | `7c5cb7e` | MIT |
| `frontend-design` | [laguagu/claude-code-nextjs-skills](https://github.com/laguagu/claude-code-nextjs-skills) | `7c5cb7e` | MIT |
| `emil-design-eng` | [emilkowalski/skills](https://github.com/emilkowalski/skills) (`skills/emil-design-eng`) | `d16ebe6` | MIT |
| `impeccable` | [pbakaus/impeccable](https://github.com/pbakaus/impeccable) (`.claude/skills/impeccable`, v4.4.0) | `9d715cc` | Apache-2.0 (see `impeccable/NOTICE.md`) |
| `taste-skill` (skill name `design-taste-frontend`) | [Leonxlnx/taste-skill](https://github.com/Leonxlnx/taste-skill) (`skills/taste-skill`) | `ce26fc2` | MIT |

Notes:
- `frontend-design` was pulled in because `nextjs-shadcn/SKILL.md` requires loading it before the first component of a new view.
- `ui-ux-pro-max/scripts/tests/` was intentionally omitted — those are the upstream project's own dev-time tests for its search tool, not needed to use the skill.
- Only `nextjs-shadcn` and `next-best-practices` were pulled from `claude-code-nextjs-skills`; the rest of that repo's skills (ai-sdk, shadcn, chrome-devtools, supabase-postgres-best-practices, etc.) were left out as out of scope.
- `ui-ux-pro-max/scripts/search.py` requires Python 3 on PATH to run; check availability before relying on it (`python3 --version` / `py -3 --version`).
- `impeccable/scripts/` was intentionally omitted. Its launcher (`scripts/impeccable`) downloads a prebuilt engine binary from the project's GitHub releases into `~/.impeccable` on first run and executes it, and the skill's Setup step runs it every session (its `hooks` command also runs it after every UI edit). We keep that opt-in rather than letting it happen silently: without `scripts/`, the skill takes its documented "Launcher unavailable" path and reads PRODUCT.md/DESIGN.md directly. All the design guidance (`craft-floor`, `operate`, `polish`, `audit`, `critique`, `typeset`, `layout`, …) works as-is; the engine-only commands (`live`, `generate`, `hooks`, `doctor`, `detect`) don't. To opt in, copy `.claude/skills/impeccable/scripts/` from the same commit.
- `impeccable/NOTICE.md` is copied from the repo root, as Apache-2.0 §4(d) requires.
- From `emilkowalski/skills`, only the web design-engineering skill was taken; its iOS/Expo/Swift skills (`animate-expo`, `mobile-native`, `write-swift`, `apple-design`) are out of scope for this web app.
- From `Leonxlnx/taste-skill`, only the main `taste-skill` was taken, not its style variants (`brutalist`, `soft`, `minimalist`, image-gen, …). Its own §13 scopes it to landing/marketing surfaces, **not dashboards, admin panels, or data tables**, so in this app it applies to the login page, not the HR workspace.
- **Precedence in this repo (decided 2026-09-27):** these three are the current design authority and take precedence over the older `frontend-design` / `ui-ux-pro-max` guidance and over the project's earlier "glassmorphism + soft gradients" brief. In practice: one brand blue for primary actions, selection and state (no blue→violet brand gradient, no brand-colored glow shadows); neutral offset shadows for depth; glass only where it does a job (sticky top bars, elements over the login photo). `impeccable`'s "Operate" mode and `emil-design-eng` guide the authenticated app UI; `taste-skill` applies to the login page only (see its §13). Keep these at their upstream HEAD when updating.

## Project-owned skills (written for EychAr)

`new-api-route`, `new-module`, `ui-standards` and `security-checklist` are this project's own skills, written from its conventions and the October 2026 security review (ADR-037). `frontend-a11y` and `e2e-testing` are **adapted** (rewritten for this app, not vendored) from [affaan-m/ECC](https://github.com/affaan-m/ECC) (`skills/frontend-a11y`, `skills/e2e-testing`) at commit `c70874f`, MIT. The rest of ECC (its other skills, agents, commands and hooks) was deliberately not taken.
