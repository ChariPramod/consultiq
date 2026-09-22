# Deployment reliability and unfinished work

## Completed in this iteration

- Added `npm run doctor`, an operator-only setup diagnostic that loads `.env.local`, checks required authentication/access configuration, connects to the configured database, checks foreign-key enforcement and compares migration history with the checkout's SQL checksums.
- The diagnostic does not fetch consultations, create workspaces, run migrations, invoke AI or print environment values/provider exceptions. It refuses to open a missing local database, so a typo does not silently create a new file. The CLI exits after 20 seconds if the storage driver stalls.
- Extracted the verified API runtime boundary into `server/runtime.ts` so authorization order, outage handling and resource cleanup can be exercised directly. The Next.js route uses this same boundary.
- Fixed a failure mode where connection cleanup could replace a successful save with a 503 response. Cleanup cannot change the committed operation's response. No automatic write or paid model retry was added.
- Added a workspace error boundary with a retry action and a reminder to inspect saved history before resubmitting a mutation. Raw server exceptions are not rendered.
- Added real-libSQL tests for the complete runtime-to-repository path, persistence across connections, workspace isolation, rejected identities before storage access, sanitized failures and migration diagnostics.

Validation: `npm run check` passed with 79 tests, TypeScript, lint and an official Next.js production build. Cloud credential-dependent checks remain pending.

## Run the diagnostic

```sh
npm run doctor
```

Exit code 0 means the required configuration and migration checks passed. Exit code 1 means a required check failed or the diagnostic timed out. `WARN` checks do not fail the command. Use the intended environment: the default loads your local `.env.local`, which may differ from Vercel production. To check cloud storage, supply the intended remote database variables securely in that environment. Never commit them or paste them into issue reports.

This is a read-only operator tool, not a public endpoint. Authentication checks verify presence, and allowlist checks verify ID shape; they do not validate a Clerk session or prove that the keys belong to the correct application. Migration checksum checks do not prove that nobody manually altered the deployed schema. A passing report is not a security audit or a commercial-readiness claim. The 20-second limit applies to the CLI; library callers of `diagnose` must supply their own lifecycle control.

The local diagnostic currently fails authentication, access and storage setup, as expected: the owner credentials have not been configured. No live Clerk, Turso or model verification is claimed.

## What remains, in priority order

1. **Owner: activate the deployed workspace.** Configure Clerk publishable/secret keys, your exact Clerk user ID in the allowlist, and a Turso URL/token. Initialize the intended empty database with `npm run db:migrate`, run `npm run doctor`, then redeploy. Follow [the migration guide](VERCEL_MIGRATION.md). Retain separate preview and production databases.
2. **Owner + engineering: prove the live workflow.** Sign in, save an approved synthetic transcript, reload it, append a review, exercise a stale-save conflict, and test isolation with two permitted accounts. Enable optional model/LangSmith keys and verify supported output plus failure handling. Existing Sites records still need an authorized export and explicit identity mapping.
3. **Owner: supply evaluation references.** Provide the approved rubric, independently reviewed role-plays, approved coaching documents and judged question/source pairs. Establish acceptable disagreement and abstention rates before making quality claims. The code cannot author your rubric anchors or invent benchmark results.
4. **Engineering + owner access decisions: organizations and roles.** Current accounts have independent private workspaces. Shared customer workspaces need invitations, membership, reviewer/admin permissions and offboarding, with cross-organization tests for every endpoint and retrieval path.
5. **Engineering: durable analysis processing.** Add a queue, cancellation, idempotent job execution, bounded retries and alerts. Current analysis runs in an HTTP request; job records and interruption guards do not guarantee execution after function termination.
6. **Engineering + operations: restore and scale.** Implement and exercise backup/restore, retention, pagination, accessibility/browser regression coverage and load testing. An export button or a successful SQLite test is not a disaster-recovery plan.
7. **Product validation before commercialization.** Validate buyer workflows and pricing; add billing and entitlements afterward. Audio, transcription, turn detection and real patient data remain separate, unimplemented workstreams.
