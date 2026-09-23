# Operational readiness and recovery

This increment adds an operator-only workspace snapshot/restore drill and a hosted smoke command. These controls are implemented and tested locally; they do not establish a production recovery SLA or certify a live authenticated workflow.

## Workspace backup

Run from the repository root using the exact deployed checkout and its applied migration history:

```sh
node --env-file-if-exists=.env.local --experimental-strip-types scripts/backup-workspace.mjs WORKSPACE_ID .local-data/backups/workspace.json
```

The operator must be authorized for the selected workspace. This CLI holds database credentials, so it is an administrative tool, not an end-user access boundary. All record queries use the explicit workspace ID. A read transaction pins the schema, migration ledger, and rows to one consistent snapshot. No other workspace records are exported. The snapshot contains a SHA-256 checksum and a schema/migration fingerprint. This detects accidental corruption and checkout mismatch; it is not a signature and does not establish trust in an externally supplied file.

The output is created exclusively with owner-only file permissions under ignored `.local-data`. Existing files are never overwritten. Backups contain transcripts, evidence, training material, member identifiers and other private workspace data. The JSON file is **not encrypted**. Transfer it only to organization-approved encrypted storage, set retention and deletion policies, and keep it out of GitHub, support tickets and chat. No transcript or credential values are printed by these commands.

Queued/running analysis prevents snapshot creation: cancel or wait for active work, then repeat. This prevents a staging restore from replaying provider requests. Invitation rows are deliberately omitted and rejected during restore; issue fresh invitations after a reviewed recovery. Member identities and roles remain unchanged. Identity migration between Clerk applications requires a separate reviewed mapping; this tool does not transfer access to a different identity.

## Restore rehearsal

1. Provision a **separate staging database** and apply the same checkout's migrations using `npm run db:migrate` with that database's configuration. Do not point migration commands at production by mistake.
2. Set `RESTORE_DATABASE_URL` and, for remote storage, `RESTORE_DATABASE_AUTH_TOKEN` in an ignored environment file. Keep the normal `DATABASE_URL` pointing at the source; the restore CLI rejects an identical URL.
3. Restore:

```sh
node --env-file-if-exists=.env.local --experimental-strip-types scripts/restore-workspace.mjs .local-data/backups/workspace.json --empty-staging-only
```

4. Connect a protected staging application to the restored database, with the worker scheduler disabled. Verify the workspace's transcript, rubric, assessment history, library, coaching, practice and membership records with authorized test identities. Verify another workspace cannot access them. Confirm pending invitations were not restored.
5. Record elapsed backup/restore time and the latest recovered record timestamp in your private operations log. Agree recovery point and recovery time objectives with the owner before launch. No production promotion is performed by this script.

Restore holds one write transaction; **every application table must be empty**, not only the target workspace. Schema and migration fingerprints must match exactly. Inserts are validated with foreign keys before commit. A failure rolls back the entire data restore. Files above 100 MiB are refused by the CLI. This is a bounded pilot tool that holds the snapshot in memory; larger datasets need a streaming/provider snapshot strategy. Database tokens are privileged and belong only in operator environments. URL inequality is an extra guard, not proof that two database URLs identify different physical storage; operators must verify the staging resource.

## Hosted verification

```sh
node --env-file-if-exists=.env.local scripts/verify-hosted.mjs
```

`HOSTED_BASE_URL` defaults to `https://consultiq-ecru.vercel.app` and must be an HTTPS origin. The check requires the public HTML page to return 200 and the API to return 401 for both an unsigned request and a spoofed legacy identity header. It does not follow redirects, including with authorization headers. Each request has a 15-second deadline, response bodies are discarded, and exceptions are sanitized.

Optionally set a short-lived, real Clerk session token in `HOSTED_SESSION_TOKEN` in the ignored environment file. The command then checks authenticated `/api/workspace` access. It does not generate tokens, bypass authentication, print returned records, or mutate consultations. The existing first-use workspace admission may initialize the signed-in user's workspace. Do not paste the token into chat or commit it. Missing credentials produce **NOT-VERIFIED** and a nonzero exit, not a false passing release check.

This smoke check alone does not prove save/reload, cross-user isolation, browser cookies, team offboarding, background dispatch, provider access, or assessment quality. Before stakeholder review, perform a protected hosted rehearsal with two approved synthetic identities: owner creates records and invites reviewer; reviewer can read/review but cannot administer; outsider cannot read identifiers from the first workspace; reload preserves writes; revocation removes access; a queued analysis completes after dispatch; failure and cancellation leave no partial results. Record the deployed commit, environment, test date and sanitized outcomes. Provider-dependent checks require configured accounts and approved synthetic input.

## Remaining operational responsibilities

- Configure Clerk/Turso and production allowlists, then run authenticated hosted checks. Local tests are not evidence of a working live session.
- Schedule encrypted backups and recurring staging restore drills. No scheduled backup service or provider PITR integration is added here.
- Configure worker dispatch and alerting for queue age, failed jobs, authentication errors and storage failures. Set service objectives before deciding thresholds.
- Review data retention, model-provider permissions and incident-response ownership before accepting real consultation records.
- Set resource budgets and validate load/latency with representative, consented workloads. No availability, recovery or throughput claim has been measured yet.

## Observed hosted check

On 2026-09-22, the public deployment returned HTML successfully. Both unsigned API checks returned HTTP 503 instead of the configured-authentication contract's HTTP 401; the hosted workspace remains unavailable. Authentication is fail-closed, but this is not a passing functionality check. No live session token was supplied, so authenticated access remains unverified. Re-run after Clerk/Turso configuration and deployment; this dated result must not be treated as current evidence after configuration changes.

## Authenticated synthetic persistence and isolation rehearsal

A separate opt-in tool exercises hosted writes and readback without any provider calls or invented rubric anchors:

```sh
node --env-file-if-exists=.env.local scripts/verify-hosted-workflow.mjs --write
```

Configure these values in ignored `.env.local`, never in command arguments or chat:

- `HOSTED_BASE_URL`: HTTPS deployment origin.
- `HOSTED_SESSION_TOKEN`: short-lived real Clerk session token for an admitted **owner**.
- `HOSTED_WORKSPACE_ID`: the owner's explicitly selected workspace ID.
- `HOSTED_OTHER_SESSION_TOKEN`: optional second admitted, unrelated user's real session token. That user must have no membership in the selected workspace. A globally blocked token cannot establish workspace isolation and is rejected as a test prerequisite.

Without `--write`, owner token or workspace ID, the command sends no requests and exits **2 (not verified)**. It verifies owner access before writing, creates one uniquely titled synthetic transcript, checks its exact text on reload, updates the recorded outcome to `follow_up`, reloads again, and checks that the admitted unrelated identity receives 403 for the same workspace and record. `/api/workspaces` may initialize a user's personal workspace on first use. Use prepared synthetic test accounts.

A `finally` block deletes only the exact ID captured from this invocation's validated create response and verifies a subsequent 404. It never scans for records to delete, deletes preexisting records, retries mutations, creates rubric anchors or calls an AI provider. Synthetic create/update/delete audit events remain after cleanup as intended. If creation succeeds but its response is lost, its ID is unknown: the tool reports uncertain cleanup and **does not guess or search for deletion targets**. The same warning appears for an uncertain delete outcome. An owner must inspect uniquely labeled synthetic operations-check records manually in that case.

Requests use manual redirect handling, 15-second deadlines covering response reads, a 512,000-byte response bound, and sanitized result-only output. No session tokens, transcript contents or returned record bodies are printed.

Exit codes:

- **1:** failed workflow assertion, transport failure or uncertain cleanup. Investigate before treating the deployment as working.
- **2:** checks that could run passed, but mandatory configuration or a coverage area remains explicitly not verified. Missing second identity leaves isolation unverified. Assessment/provider verification is always unverified by this tool, so a successful persistence/isolation rehearsal currently exits 2.
- **0:** reserved for a complete verified scope; this tool deliberately cannot claim full readiness while assessment/provider checks remain outside its scope.

The tool's mocked transport tests cover successful create/read/update/delete, owner preflight, isolation failure, readback mismatch, oversized responses, creation/deletion response loss, missing credentials and unsafe origins. **No live writes were run in this increment**, because hosted authentication credentials were unavailable. Owner-approved rubric evaluation, real provider invocation, team invite/offboarding and queue scheduling still require their separate live checks.
