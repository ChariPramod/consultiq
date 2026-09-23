# Product reliability increment

## What is implemented

### Team workspaces

Each account still owns a personal workspace. An owner may invite a specific verified Clerk user ID as `reviewer` or `viewer`; these accounts can switch between their accessible workspaces. Invitations expire after seven days, are tied to the intended user, rotate on reissue, are consumed once and store only a token hash. The UI displays the token once for owner-managed sharing; the application does not send invitation messages.

Successful mutation audits record the authenticated actor, including the requester behind worker-generated results. Legacy audit rows remain unattributed rather than guessing an owner.

Owners manage workspace settings, rubric publication, approved-library changes, invitations, members and destructive actions. Reviewers may import conversations, record outcomes, append assessments, request analysis, review coaching and manage practice. Viewers may read and search but cannot mutate. The API checks roles independently of UI controls. Discovery is scoped to the verified user; a caller-selected `X-Workspace-Id` grants no access by itself. Workspace switching navigates afresh to clear drafts from the previous workspace.

The deployment's explicit Clerk user-ID allowlist remains an additional pilot admission gate: both owner and invitee must be configured there. This is team sharing within an admitted pilot, not public customer self-service. There is no organization billing, custom role editor, ownership transfer or email invitation service. Remove/reinvite to change a non-owner role. Permission checks occur at request admission; an ordinary already-admitted human mutation may finish during revocation. AI jobs requested by a removed member are cancelled transactionally and their late saves are fenced.

### Durable analysis intents and execution

Hosted scoring/coaching requests now save an idempotent `queued` job and return HTTP 202. An `Idempotency-Key` identifies the intended operation. Repeating the same actor/call/kind/question/key returns its existing job; reusing a key for a different operation conflicts. Atomic admission enforces one active analysis per conversation and the workspace's daily limit. This count includes failed, cancelled and queued requests; it is a conservative admission limit, not a billing ledger.

The database is the queue. A supervised `npm run worker` process, or the authenticated `/api/internal/worker` dispatcher, claims one queued row atomically using `UPDATE … RETURNING`. Overlapping dispatches cannot claim the same job. The worker rechecks requester access, loads only that workspace's records, checks pinned inputs and invokes the existing quote/citation validation and atomic result save. Scoring keeps the queued rubric and assessment baseline fixed; newer human revisions cannot be overwritten.

A claim has a three-minute lease, never reused. Expired running jobs become `failed/interrupted` on the next dispatch. Result insertion checks running status and lease validity, so cancelled, revoked or expired jobs cannot publish late output. Success commits result, audit and job completion together. Telemetry/connection cleanup failures do not replace that committed result.

Cancellation prevents saving a result; it cannot guarantee an already-started provider request stops or avoids charges. There is deliberately no automatic retry after unknown paid execution. A user must check history and submit a new request. This favors bounded paid side effects over automatic recovery. It is not exactly-once execution at the model provider. With no worker/scheduler, queued work stays durable but does not progress, and expired leases are not reaped until the next dispatch.

The client shows accepted queue state, supports cancellation and polls only in a visible tab, bounded to 24 refreshes. Manual refresh remains available. Activity prioritizes active jobs and loads up to 200 entries. Owner Operations metrics query the full workspace job table: queue/running counts, expired leases, failures in the last day, oldest queue timestamp and latest start timestamp. These are backlog signals, not a heartbeat or uptime guarantee.

### Evaluations

Production retrieval and offline evaluation share tokenization/ranking with a deterministic candidate order. The retrieval evaluator reports recall, precision, MRR, nDCG and no-answer false positives against a complete judged corpus. Assessment release gates recompute validated predictions, require explicit acceptance policy, verify frozen cases/references and reject missing denominators. A release requires declared independent held-out references; code cannot attest that a human label was independently produced. No real domain benchmark, thresholds or performance result has been invented. See [EVALUATION.md](EVALUATION.md).

### Operations and hosted acceptance

Workspace backups use one consistent transaction and checksummed schema-bound files. Restore is atomic and restricted to an empty, migrated staging database. Invitations are excluded; member IDs are preserved. Active jobs block backup/restore so uncertain work is not replayed. Backups contain private records; the operator must encrypt and retain them appropriately. This implements restore tooling and local restore tests, not scheduled off-site backup or a completed production recovery drill.

Hosted smoke scripts distinguish an accessible public page, blocked unauthenticated/spoofed access, and an actually verified Clerk session. The optional write workflow creates only synthetic test records and attempts cleanup of only those captured IDs. It needs real authorized sessions and does not bypass authentication. Read [OPERATIONS_READINESS.md](OPERATIONS_READINESS.md).

## Deploying this change

1. Apply new migrations `0003_happy_imperial_guard.sql` and `0004_cynical_spitfire.sql` using `npm run db:migrate` against the intended database before enabling authenticated use of this release. Existing migrations are unchanged. New columns support the queue; new tables store members and invitations. Audit rows now include the initiating actor ID; legacy rows retain null attribution.
2. Configure Clerk, the pilot allowlist, database URL/token and approved AI configuration. Run `npm run doctor` in the intended environment. Do not copy private credentials to Git or chat.
3. The repository includes `.github/workflows/worker.yml`, an optional five-minute pilot dispatcher with serialized runs and no automatic HTTP retry. Its `CONSULTIQ_WORKER_SECRET` matches the Vercel `CRON_SECRET`; both are configured without committing values. The repository variable `CONSULTIQ_WORKER_ENABLED` is currently **false** because Clerk/Turso/provider setup is unfinished. Once migrations and credentials are verified, run the workflow manually, inspect Operations, then set that variable to `true`. [GitHub schedules can be delayed or dropped and public-repository schedules disable after inactivity](https://docs.github.com/en/actions/reference/workflows-and-actions/events-that-trigger-workflows#schedule). This is not a latency SLA; use a supervised worker for responsive processing.
4. Start a supervised worker with the same database/provider/allowlist environment: `npm run worker`. For a single dispatch use `npm run worker -- --once`. Deploy that process to an always-running service; a local terminal is not production supervision.
5. Alternatively configure a scheduler to call `GET` or `POST /api/internal/worker` with `Authorization: Bearer <CRON_SECRET>`. Use a random server-only secret of at least 32 characters. Missing/short/incorrect credentials are rejected before database access. Each invocation processes at most one job; choose cadence and concurrency for measured queue volume. The endpoint requests a 120-second Vercel duration; confirm your plan supports it.
6. A Vercel schedule is not enabled automatically. [Vercel's scheduling limits](https://vercel.com/docs/cron-jobs/usage-and-pricing) make Hobby daily cron unsuitable for interactive analysis. On a suitable plan, configure the production schedule following [the secured cron documentation](https://vercel.com/docs/cron-jobs/manage-cron-jobs); otherwise use an approved external scheduler/supervised worker. No paid plan was purchased.
7. Run the hosted smoke/workflow commands with real sessions, then a staging backup/restore drill and role/isolation checks. Complete live provider and optional tracing checks using approved synthetic data. Restore and deployment rollback are separate operations; do not roll schema backward by rewriting migrations.

## Still required before commercial readiness

- Owner credentials and actual live multiuser/provider/scheduler verification; current hosted setup is incomplete.
- Owner-approved rubric, independently judged assessment and retrieval datasets, and explicit release thresholds.
- Worker hosting, secret rotation, external alerts, encrypted backup scheduling, retention and recovery objectives.
- Server-side pagination/aggregated workspace screens beyond the pilot limits, load testing and complete browser/accessibility coverage.
- Customer self-service admission, ownership transfer, billing/entitlements and broader organization administration.
- Audio, live call processing and real patient data handling remain out of scope and unimplemented.

## Verification of this increment

`npm run check` passed with 119 tests, TypeScript checking, lint and an optimized Next.js production build. Tests exercise concurrent claims/admission, cancellation and revocation during generation, stale assessment baselines, lease expiry, invitation expiry/replay, actor attribution, role isolation, evaluation rejection cases, atomic restores and hosted-workflow cleanup failures. These are automated local checks, not a production load test or a completed live provider acceptance run.
