# Architecture, operational queries and audit history

This release updates the implemented architecture, makes routine dashboard and history reads more efficient, and adds an owner audit-history view. It preserves all stored transcripts, revisions, documents, citations, jobs and events. No new hosting service or model call is introduced.

## Updated diagrams

Both the editable sources and rendered diagrams have changed:

- [Overall architecture SVG](diagrams/overall-architecture.svg) · [Mermaid source](diagrams/overall-architecture.mmd)
- [Query and response SVG](diagrams/query-response.svg) · [Mermaid source](diagrams/query-response.mmd)

[Architecture](ARCHITECTURE.md) embeds matching Mermaid blocks and explains the boundaries. The diagrams now distinguish bounded read services, guarded writes, owner audit/storage access, durable analysis admission, independent worker dispatch, evidence validation, optional tracing and client recovery. They include revision comparison, pinned drafts, unavailable-measurement fallback and confirmed-write recovery. Hosted credentials and worker activation remain separate from implementation.

## Query changes

The previous dashboard job query prioritized active work with a `CASE` expression and sorted the workspace's run history before returning 200 rows. The new statement:

1. Selects at most 200 active job IDs through a partial index containing only queued/running jobs.
2. Fills the remaining slots with recent terminal job IDs through the chronology index. When active work fills the limit, the terminal branch returns no rows.
3. Loads explicit metadata for those selected IDs, with at most 200 primary-key lookups and a final sort of at most 200 rows.

Active jobs still appear before completed, failed or cancelled jobs. Equal creation timestamps now use descending job ID, matching analysis-history pagination. Assessment and rubric ties continue to use append order; scoring and stale-save semantics are unchanged. Telemetry validation still isolates malformed values. Execution payloads, request keys and requester IDs remain out of the bootstrap response.

Analysis-history continuation now uses `(created_at,id)<(?,?)`. Matching composite indexes let SQLite seek from the cursor instead of scanning the newer range and sorting timestamp ties. Audit pagination uses the same tuple ordering. Every query retains the authenticated workspace predicate; cursors do not authorize access.

Migration `0007_sharp_menace.sql` replaces `jobs_workspace_created` and `audit_workspace_created` with their workspace/creation/ID equivalents, and adds the partial active-job index. The old indexes are dropped rather than retained redundantly. This is index-only DDL: no content cleanup, payload rewriting or retention policy is applied.

## Reproducible local measurements

Run:

```sh
npm run benchmark:history
```

The command creates two identically seeded, disposable local libSQL databases: one through migration 0006 and one through 0007. It does not load environment files, contact hosted storage, call a provider, or modify an existing database. Temporary files are removed afterward. The fixture has two workspaces, 20,000 jobs, 20,000 audit events, 100 active jobs and timestamp ties. Each query receives five warmups and 25 measured runs. Production bootstrap, job and audit SQL is captured; the prior bootstrap and cursor expression are retained for the comparison. Audit uses the same captured explicit-field tuple query in both phases to isolate the index effect.

One local Node 22.17.1 run produced:

| Query | Before median, ms | After median, ms | Before p95, ms | After p95, ms |
| --- | ---: | ---: | ---: | ---: |
| Bootstrap job summary | 6.756 | 0.665 | 7.525 | 0.718 |
| Analysis first page | 0.144 | 0.113 | 0.213 | 0.143 |
| Analysis deeper page | 0.359 | 0.116 | 0.364 | 0.121 |
| Audit deeper page | 0.103 | 0.069 | 0.106 | 0.073 |

These are synthetic local observations, not hosted latency, capacity or service commitments. Timings vary with machine, cache, data distribution and concurrent work. No timing threshold gates CI. The stronger structural evidence is the query plan: history reads no longer require temporary ordering trees, tuple cursors use indexed ranges, and dashboard sorting is bounded by the result cap.

### Storage tradeoff

Occupied local database pages increased from 36,384,768 to 37,089,280 bytes: **704,512 additional bytes, about 1.94%**, for this fixture. The sparse active index occupied 12,288 bytes. Wider chronology indexes and index maintenance cost space and write work; this release does not claim a reduction in physical storage. It reduces unnecessary query sorting and metadata loading while avoiding redundant old indexes.

Logical workspace storage reporting remains a separate owner-requested text-byte inventory; it excludes physical pages, indexes, replicas and backups. Existing exact-body document deduplication still prevents storing repeated approved bodies/chunks. This release neither deletes historical duplicates nor clears execution payloads needed for request reconciliation.

The earlier `benchmark:queries` comparison is now explicitly pinned to migrations 0005 versus 0006, so adding later migrations does not silently change that historical measurement.

## New feature: owner audit history

Open **Workspace settings → Workspace audit history**. Owners can filter the recorded action, inspect event/actor/entity IDs and UTC timestamps, page through history, refresh the current page or return to the newest events. No transcript, rubric text, invitation token, model payload or generated prose is included.

`GET /api/audit-events` accepts `action` (`all` or an exact supported action), `limit` (default 25, maximum 50) and a workspace/action-bound `cursor`. It requests one extra row to determine whether another page exists, without a full count. Ownership is rechecked for every request, including later pages. Reviewers and viewers cannot access the endpoint or its settings panel.

Legacy missing actor IDs are shown as **Not recorded**. Unknown event actions remain visible in the unfiltered list with their raw code. Events can refer to deleted records; no deleted content is reconstructed. Labels describe the recorded operation, not inferred before/after state. The view is not a tamper-evident external log and does not record every read, sign-in or failure.

A failed refresh keeps the previous page only for the same workspace/filter/cursor and shows that it may be stale. Authorization failures clear cached events. Changed filters never display a previous filter's result as current, superseded responses are ignored, and repeated pagination clicks do not skip a page. The UI makes no mutation requests.

## Verification and rollout

`npm run check` passed with **226 tests**, TypeScript, lint and the production build. Temporary UI fixture routes were removed before that build. Protected owner-authored scoring material and applied migrations 0000–0006 remain unchanged.

Regression coverage checks owner authorization on every page, foreign workspace/cursor rejection, explicit metadata projection, timestamp ties, legacy/missing actors, deleted-record history, invalid filters, actual query plans, and exact preservation of stored jobs/events through migration. Bootstrap cases include zero, two, 200 and 230 active jobs, older active jobs ahead of recent terminal jobs, and private payload exclusion.

Local Chrome fault injection exercised the actual settings UI with synthetic intercepted responses: pagination, same-tick repeated clicks, current-page refresh failure, changed-filter failure, held older responses, revoked owner access, reviewer visibility, empty results and missing/unknown metadata. Desktop and 390-pixel mobile layouts were inspected; no browser page errors or horizontal page overflow were observed. These checks do not substitute for authenticated hosted acceptance.

Both diagrams were rendered and visually checked; embedded Mermaid and source files match. No diagram/browser dependency was added to the application.

Before authenticated deployment:

1. Complete the Clerk/Turso setup in [Owner actions](OWNER_ACTIONS.md), using ignored local environment files or Vercel settings for secrets.
2. Take a protected backup, retain a schema-matched restore checkout, and apply all migrations through **0007** with `npm run db:migrate`. Migrations do not run during builds or ordinary requests.
3. Verify hosted owner-only audit access, bootstrap ordering, history pagination and save/reload with authorized accounts. Test restoration in empty staging before using customer data.
4. Keep worker dispatch paused until provider credentials, approved source material and the hosted worker checks are complete.

The index-only migration changes the backup schema fingerprint. Restore older backups to matching empty staging first, then migrate forward; do not weaken fingerprint checks. The public deployment can be checked without these credentials, but it cannot demonstrate live authenticated storage or model functionality.

## Remaining work

Filtered status/action queries and substring title searches can still scan scoped rows. Full revision history, logical byte inventory and some aggregates still scale with workspace size. Cursors page current data rather than a frozen export; use the newest page to reconcile new events. Measure hosted network latency and representative concurrent workloads before adding more indexes, counters or infrastructure.

Persistent drafts, browser regression CI, live backup/restore verification, worker monitoring, independent domain evaluations, billing and buyer-specific integrations remain separate work. Owner-authored anchors and an approved pilot workflow are still required; none were invented during this iteration.
