# AGENTS.md

Backend API for **Super Vacanta** — leave & absence management for Romanian SMEs. NestJS 11 + TypeORM + PostgreSQL 16. Not yet deployed to production.

Frontend repo: [recharge-web](https://github.com/nefa/recharge-web) (Next.js, consumes this API).

## Setup & commands

```bash
bun install                 # package manager is Bun
docker compose up -d        # Postgres 16 + pgAdmin
cp .env.example .env
bun run seed                # wipes and reseeds demo data (see src/database/seed.ts)
bun run dev                 # NestJS on :3001, watch mode
```

- `bun run lint` — currently not wired up (no `eslint` dependency/config checked in yet); add eslint + config before relying on this command.
- `bun run typeorm:generate` / `typeorm:run` / `typeorm:revert` — migrations, via `typeorm.config.ts`. `src/migrations/` is currently empty — no migrations have been generated yet.
- **There is no test suite in this repo yet** (no `*.spec.ts` / `*.test.ts` files). Don't claim "tests pass" — there's nothing to run. If you add tests, check for a runner/config first since none is wired up.

## Project structure

Flat `src/` layout (not a monorepo — `project-structure.md` describes an aspirational `apps/api` + `packages/shared` split that doesn't match the current tree; trust the actual layout below over that doc):

```
src/
├── entities/          TypeORM entities (source of truth for the schema)
├── auth/               JWT + Passport (guards/, decorators/, strategies/, dto/)
├── users/ departments/ leave-types/ leave-requests/ leave-balances/
├── holidays/           Romanian public holidays
├── calendar/           Wallchart endpoint
├── dashboard/          Aggregated dashboard data
├── invites/             Team invitation flow
├── notifications/      Email via Resend
├── common/              Global exception filter, working-days helper
├── shared/              Enums/DTOs intended to mirror recharge-web's copy
├── database/            seed.ts
└── main.ts
```

Each feature module follows the same NestJS shape: `*.module.ts`, `*.controller.ts`, `*.service.ts`, `dto/*.dto.ts`. Business logic lives in services; controllers stay thin (auth/role checks + delegate to service, occasional response shaping).

## Entities & database conventions

- Primary keys are `uuid` (`@PrimaryColumn('uuid')`), generated as **UUIDv7** by a global TypeORM subscriber (`src/database/subscribers/uuid-v7.subscriber.ts`, registered wherever a `DataSource`/`TypeOrmModule` is configured — `app.module.ts`, `typeorm.config.ts`, `database/seed.ts`). Don't switch entities back to `@PrimaryGeneratedColumn('uuid')` — that forces DB-level v4 generation and bypasses the subscriber.
- Table names are `snake_case` and explicit via `@Entity('table_name')`; `User` maps to `app_user` specifically because `user` is a reserved word in Postgres. Follow the same explicit-name pattern for new entities rather than relying on TypeORM's default class-name-derived table name.
- Columns use `@Column({ name: 'snake_case_name' })` with camelCase TS property names — keep that mapping consistent for new columns.
- No migrations exist yet; dev relies on `synchronize: true/config-driven` (see `app.module.ts` and `database/seed.ts`). Once this app is closer to deployment, migrations should be generated before turning `synchronize` off in any shared environment.

## Auth & authorization

- JWT access + refresh tokens via `@nestjs/passport`. Guards (`JwtAuthGuard`, `RolesGuard`) are registered globally in `app.module.ts` via `APP_GUARD` — routes are protected by default.
- Use `@Public()` (`src/auth/decorators/public.decorator.ts`) to opt a route out of auth.
- Use `@Roles(Role.ADMIN, ...)` (`src/auth/decorators/roles.decorator.ts`) to restrict by role, and `@CurrentUser()` to pull the JWT payload (`userId`, `companyId`, etc.) into a handler.
- Roles: `ADMIN`, `MANAGER`, `EMPLOYEE` — company-scoped (multi-tenant: almost every query should filter by `companyId` from the current user, not just by `id`).

## Enums — known duplication

`Role` and `LeaveStatus` are defined **twice** with different casing:
- `src/entities/enums.ts` — `Role.ADMIN = 'admin'` (used by entities, guards, backend services).
- `src/shared/index.ts` — `Role.Admin = 'admin'` (intended to mirror recharge-web's copy of the same enum).

Same string values, different key casing. When touching auth/roles code, check which one is imported before assuming they're interchangeable — don't introduce a third variant.

## Validation & error handling

- Global `ValidationPipe({ whitelist: true, transform: true })` in `main.ts` — DTOs must use `class-validator` decorators; unlisted fields are stripped, not just ignored.
- Global `GlobalExceptionFilter` (`src/common/http-exception.filter.ts`) normalizes all errors to `{ statusCode, message, error }`. Throw standard Nest `HttpException` subclasses (`NotFoundException`, `BadRequestException`, `ForbiddenException`, etc.) from services rather than building response shapes by hand.

## Domain context

Product brief and per-feature specs live in `product-owner.md` and `features/*.md` — read the relevant one before changing business logic (e.g. leave balance/approval rules in `features/leave-requests.md`). Core domain: companies → departments → users (admin/manager/employee) → leave types → leave requests → leave balances, plus Romanian public holidays factored into working-day calculations (`src/common/working-days.ts`).

## Environment variables

See `.env.example` — `DATABASE_URL`, `JWT_SECRET`, `JWT_REFRESH_SECRET`, `WEB_URL`, `API_URL`, `RESEND_API_KEY` (optional; logs to console if unset).

## Agent workflow — `agents/` directory

Read [`agents/WORKFLOW.md`](agents/WORKFLOW.md) before starting any non-trivial task — it defines the working process (planning, branching, committing, security) for this repo. It in turn points to:

- [`agents/contexts/`](agents/contexts/) — durable institutional-memory docs (schema, conventions, etc.), read before touching the relevant area. Gitignored (local-only); start at `contexts/README.md`.
- [`agents/APP-NOTES.md`](agents/APP-NOTES.md) — tactical lessons-learned, tracked in git.
- `agents/plans/` — saved implementation plans for non-trivial tasks. Gitignored, cleaned up once a task is done.
- `agents/docs/` — supporting reference artifacts. Gitignored.

Keep these updated as part of the same task/commit that changes the thing they describe — see the "Maintenance" sections within each file.
