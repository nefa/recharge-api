# Development Workflow

## Contexts (read first)

Before starting any non-trivial task — schema change, business-logic change, deploy prep — load the relevant context docs from `agents/contexts/`. They are the project's compressed institutional memory.

- [`agents/contexts/README.md`](contexts/README.md) — index of available contexts and how to use them
- [`agents/contexts/database.md`](contexts/database.md) — entity graph, multi-tenancy scoping, schema conventions

`agents/APP-NOTES.md` (this folder) holds tactical lessons learned during development and complements the contexts above.

**Maintenance is mandatory.** When something is learned, changed, or invalidated — update the relevant context in the same task / commit. Stale context produces confidently-wrong work; that is worse than missing context. Concretely:

- A schema/entity/relation change lands → update `contexts/database.md`
- A new durable convention or gotcha is discovered → add it to `APP-NOTES.md`, or promote it into a context doc if it's broad enough
- Workflow itself changes → update this file

## Task Sourcing

No external task tracker is wired up for this repo. Work is scoped directly in conversation, or via a saved plan in `agents/plans/` for anything non-trivial.

## Branch Workflow

- Default base branch: `main` (this repo has no `dev` branch)
- Feature branches: `feature/<short-description>`, branched off `main`
- Pull `main` before branching to avoid stale bases
- PRs merge back into `main`

## Planning & Execution

- **Always work using plans for non-trivial tasks** — save to `agents/plans/` (local-only, git-ignored)
- If requirements aren't clear, **ask questions first**
- Once the task is clear, **create a plan** and present it
- After user gives the go-ahead, **execute all tasks in the plan without further questions**

## Security

- **Never commit** private keys, API keys, secrets, or credentials
- **Never commit** absolute paths containing usernames — use `~` or relative paths
- **Verify `.gitignore`** covers `.env`, `.env.*`, and credential files before adding new ones
- **Scan staged files** for secrets and personal paths before committing (`git diff --cached`)
- **Use environment variables** for deployment-sensitive values (`DATABASE_URL`, `JWT_SECRET`, `JWT_REFRESH_SECRET`, `RESEND_API_KEY`, etc. — see `.env.example`)
- Seed/demo credentials (`src/database/seed.ts`) are for local dev only — never reuse that password pattern for a real account

## Committing & CI

- **NEVER commit or push without explicit user approval** — always ask first
- **Show changes before committing** — present a diff summary and wait for user approval before running `git commit`
- **Commit per scope**, not per sub-task — group related changes into logical commits
- **Commit message style**: short, plain, imperative (e.g. `add invite expiry check`, `fix leave balance rounding`) — this repo doesn't use Conventional Commits or semantic-release, match the existing history's style
- **No CI is configured yet** for this repo (no `.github/workflows`). Run what does exist before committing — `bun run build` (and `bun run lint` once eslint + config are added) — and once a test suite or CI exists, run/wait for those too
- Do NOT add `Co-Authored-By: Claude` lines to commit messages

## Completion

- A task is done once the PR is merged (or the user confirms local work is sufficient, if no PR is involved)
- **Never merge PRs** unless specifically asked to do so
- Ask for feedback after each task to improve workflow iteratively

## Communication Style

- When offering choices, **recommend the best option** with reasoning — don't just list options
- Keep status updates concise (summary tables, bullet points)

## Housekeeping

- Keep the local `agents/` folder updated with plans, contexts, and relevant artifacts
- **Update contexts** in `agents/contexts/` as soon as new knowledge or status changes appear (see "Contexts" section above)
- **Clean up plans** from `agents/plans/` once the task is done (PR merged, work confirmed complete)
