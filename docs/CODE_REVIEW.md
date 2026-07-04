# Code Review Findings — 2026-07-01

Whole-codebase review focused on code reusability, correct abstractions, error handling/thresholds, and NestJS/API best practices. Findings below were surfaced by parallel review passes covering multi-tenancy/security, error handling, code reuse, layering, NestJS conventions, TypeORM usage, and business-logic thresholds, then independently re-verified against the actual source. All 10 are confirmed by direct code inspection.

Ranked most severe first.

## 1. `GET /leave-requests/:id` — cross-tenant IDOR

**File:** [`src/leave-requests/leave-requests.service.ts:344`](src/leave-requests/leave-requests.service.ts) (`findOneWithRelations`), reached via [`src/leave-requests/leave-requests.controller.ts:73-79`](src/leave-requests/leave-requests.controller.ts)

Any authenticated user (any role) can read any other company's leave request by ID. The lookup queries by bare `id` with no `companyId`/`userId` filter, and the controller never checks the caller's `companyId`. Every sibling read method in the same file (`findByUser`, `findByCompany`, `findPendingByManager`, `findByDateRange`) correctly scopes by `companyId` — this is the one outlier.

**Impact:** cross-tenant leak of leave request details, including notes/reasons.

## 2. `PATCH /leave-balances/:id/adjust` — cross-tenant write

**File:** [`src/leave-balances/leave-balances.service.ts:62`](src/leave-balances/leave-balances.service.ts) (`adjustAllowance`), reached via [`src/leave-balances/leave-balances.controller.ts:43-50`](src/leave-balances/leave-balances.controller.ts)

`balanceRepo.update(balanceId, ...)` and the follow-up `findOne` filter only by `id`, with no `companyId` scoping. Any `ADMIN` JWT (from any company) can PATCH any balance UUID and it succeeds regardless of tenant.

**Impact:** any admin can corrupt another company's leave balance data.

## 3. `GET /leave-balances/user/:userId` — cross-tenant read

**File:** [`src/leave-balances/leave-balances.service.ts:44`](src/leave-balances/leave-balances.service.ts) (`getByUser`), reached via [`src/leave-balances/leave-balances.controller.ts:33-41`](src/leave-balances/leave-balances.controller.ts)

Query is `where: { userId, year }` with no `companyId` filter — `LeaveBalance` has no `companyId` column at all, and `RolesGuard` only checks role, never tenant ownership.

**Impact:** any admin can read another company's employee balance data via a guessed/enumerated `userId`.

## 4. TOCTOU race in `create()` — balance and overlap checks

**File:** [`src/leave-requests/leave-requests.service.ts:71`](src/leave-requests/leave-requests.service.ts)

The balance-sufficiency check and the overlap check both run before the request is inserted, with no transaction or row lock, and no DB-level exclusion constraint backs the overlap check either.

**Impact:** two concurrent requests (double-submit, two tabs) can both pass the checks before either commits — over-drawing a balance or creating two overlapping leave requests.

## 5. Year-boundary balance bug

**File:** [`src/leave-requests/leave-requests.service.ts:154`](src/leave-requests/leave-requests.service.ts)

The balance-year lookup is derived only from `startDate.getFullYear()`. A request spanning a year boundary (e.g. Dec 30 → Jan 3) debits the entire working-day count from one year's balance only. If no balance row exists for that year, the `if (balance)` guard skips the decrement entirely while the request is still marked `APPROVED` — free, untracked leave.

## 6. `approve()` never re-validates the allowance ceiling

**File:** [`src/leave-requests/leave-requests.service.ts:159`](src/leave-requests/leave-requests.service.ts)

`create()`'s sufficiency check is skipped whenever a balance is missing or `allowanceDays` is 0. `approve()` then unconditionally adds `workingDays` to `usedDays` with no ceiling check — an approval can push usage over the allowance with no error (e.g. if an admin lowers `allowanceDays` between request creation and approval).

## 7. No rate limiting on `/api/auth/login`

**File:** [`src/auth/auth.controller.ts:33`](src/auth/auth.controller.ts)

No dependency, global guard, or per-route decorator throttles login/register/refresh anywhere in the codebase (checked `package.json`, `app.module.ts`, `auth.module.ts`, `main.ts`).

**Impact:** brute-forceable login with no backoff or lockout.

## 8. Unbounded leave-request date range — DoS

**File:** [`src/common/working-days.ts:14`](src/common/working-days.ts)

Only `endDate < startDate` is rejected; there's no upper bound on the span. `calculateWorkingDays` loops day-by-day with no iteration cap, so an absurd range (e.g. `1900-01-01` → `2900-01-01`) triggers ~365,000 synchronous loop iterations, blocking the Node event loop for the duration of that single request.

## 9. `approve()`/`cancel()` write balance and status non-atomically

**File:** [`src/leave-requests/leave-requests.service.ts:159`](src/leave-requests/leave-requests.service.ts) (and `:266` for `cancel()`)

Balance and request-status are two separate, non-transactional `.save()` calls. A crash between them leaves the balance debited/credited but the status stale (e.g. balance already consumed while the request stays `PENDING` forever). `decline()` is unaffected since it never touches `LeaveBalance`.

## 10. Invite token leaked via API responses

**File:** [`src/invites/invites.service.ts:68`](src/invites/invites.service.ts) (`create`), and `listByCompany`

`POST /invites` and `GET /invites` both return the raw `Invite` entity including the secret `token` field — the same secret meant to travel only via the invite email. No `@Exclude()`, field-picking, or serializer strips it. Increases exposure surface (XSS, network/error-monitoring logging) for a secret that grants company enrollment.

---

## Lower-severity findings (not in the top 10, still real)

- **Missing `ParseUUIDPipe`** on all `:id`/`:userId` route params — an invalid UUID string reaches TypeORM raw, throws `QueryFailedError`, and `GlobalExceptionFilter`'s catch-all returns a generic 500 instead of a clean 400.
- **`GlobalExceptionFilter`** (`src/common/http-exception.filter.ts:36`) hardcodes `error: HttpException.name` — always the literal string `"HttpException"` regardless of the actual exception subclass, making client-side error-type branching impossible.
- **`adjustAllowance`** returns HTTP 200 with a `null` body instead of a 404 for a nonexistent balance ID (TypeORM's `update()` silently no-ops on zero affected rows).
- **`startDate` in the past is never rejected** in `create()` — flagged as confirmed but possibly intentional (backdated/admin-logged leave may be a supported workflow); worth confirming with product intent rather than treating as an unambiguous defect.
- **Code duplication**: repeated "find-or-throw" pattern across 4+ services; department response shape hand-built in both service and controller; date-to-string normalization repeated 8+ times across 3 files; admin/manager role branching duplicated in 3 places including a raw `'admin'` string literal in `dashboard.service.ts:74` that bypasses the `Role` enum.
- **Layering**: `DashboardService` and `CalendarService` inject `User`/`LeaveRequest`/`Department` repositories directly instead of going through `UsersService`/`DepartmentsService`/`LeaveRequestsService`, duplicating query logic that already exists in those services.
- **No `@Max`** on `AdjustBalanceDto.allowanceDays` (only `@Min(0)`) — an admin can set an unbounded value.
