# App Technical Notes

Tactical findings and patterns discovered during development — the fast-moving companion to `agents/contexts/`. When a note here accumulates into a durable mental model, promote it into a context doc instead.

## Entities & TypeORM

- **Table naming**: entities use explicit `@Entity('snake_case_name')`. `User` maps to `app_user`, not `user` — `user` is a reserved word in Postgres and would need quoting everywhere otherwise. Follow the same explicit-name pattern for new entities.
- **Primary keys**: `@PrimaryColumn('uuid')`, generated as UUIDv7 by a global subscriber (`src/database/subscribers/uuid-v7.subscriber.ts`) on `beforeInsert`. Postgres 16 (this project's version) has no native `uuidv7()` — that lands in Postgres 18 — so generation happens in the app layer via the `uuidv7` package. Do **not** revert entities to `@PrimaryGeneratedColumn('uuid')`; that hardcodes DB-level v4 generation and bypasses the subscriber entirely.
- **Column mapping**: `@Column({ name: 'snake_case' })` with camelCase TS properties. Keep that convention for new columns.
- No migrations exist yet (`src/migrations/` is empty) — dev relies on `synchronize`. Generate real migrations before disabling `synchronize` anywhere shared.

## Enums — duplicate definitions, different casing

`Role` and `LeaveStatus` exist in two places with the same string values but different key casing:
- `src/entities/enums.ts` — `Role.ADMIN = 'admin'` (backend: entities, guards, services)
- `src/shared/index.ts` — `Role.Admin = 'admin'` (intended to mirror recharge-web's copy)

Check which one is imported before assuming interchangeability. Don't introduce a third variant.

## Auth

JWT access + refresh via `@nestjs/passport`. `JwtAuthGuard` + `RolesGuard` are global (`APP_GUARD` in `app.module.ts`) — routes are protected by default; use `@Public()` to opt out. Almost every service query should filter by `companyId` from `@CurrentUser()`, not just by record `id` — this is a multi-tenant app.

## Maintenance

Add an entry here whenever a non-obvious, durable-but-tactical fact is discovered (a gotcha, a convention, a "why is it built this way"). When entries accumulate into a broader mental model worth its own doc, move them into `agents/contexts/` and trim this file.
