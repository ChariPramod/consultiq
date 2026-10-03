# Storage and query optimization

This increment improves the existing libSQL access paths, prevents repeated approved-document storage, and exposes a workspace owner's logical text inventory. It adds no new storage service and changes no transcript, assessment, rubric, or citation IDs.

## Changes

- `getCall()` now selects only the latest assessment instead of fetching every revision to discard all but one. Consultation detail fetches revision history once and derives its latest assessment from that same history.
- Consultation bootstrap now uses `created_at DESC, id DESC`, matching the review queue's deterministic pagination order. Assessments retain `created_at DESC, rowid DESC`: same-timestamp append order remains authoritative.
- Migration `0006_gray_polaris.sql` replaces prefix indexes that needed sorting and adds indexes for practice pages, active-job checks, and follow-up selection. Applied migrations 0000–0005 are unchanged.
- Exact approved document bodies are deduplicated **within a workspace**. This prevents repeated bodies and their generated chunks from being stored again.
- Owner-only storage reporting returns record counts and logical UTF-8 text bytes for each application table, grouped in the interface by domain. No stored bodies, identities, hashes, or tokens are returned.

## Query plans and reproducible measurement

Run the benchmark from the repository root:

```sh
npm run benchmark:queries
```

It creates two disposable local SQLite databases, one with migrations through 0005 and one with the current migration history. It never loads `.env.local`, connects to a remote database, calls a model, or writes to an existing database. Temporary files are removed in `finally`.

Both databases contain identical synthetic data: 2 workspaces, 1,600 consultations, 6,400 assessment revisions, 1,600 practice assignments, 1,600 jobs, 100 library documents and 500 chunks. Shared timestamps exercise deterministic ordering. The script captures actual SQL from consultation, practice, follow-up, latest-assessment and retrieval functions. Dispatcher discovery and the active-call predicate are measured directly. Each query has five warmups and 25 measured executions.

One local Node 22.17.1 run produced the following medians. These are reproducible development observations, **not hosted latency, capacity, customer-data performance or billing measurements**. Timing varies with machine, cache, runtime, data distribution and concurrent work. No timing threshold gates CI.

| Query                | Before median, ms | After median, ms | Plan change                                                                             |
| -------------------- | ----------------: | ---------------: | --------------------------------------------------------------------------------------- |
| Consultation page    |             1.111 |            0.232 | Index includes workspace, creation time and ID; removes partial-order temporary sort    |
| Latest assessment    |             0.033 |            0.031 | Existing `assessments_call_created` already serves this lookup; no new index            |
| Practice page        |             0.873 |            0.299 | New workspace/creation/ID index removes temporary sort                                  |
| Retrieval candidates |             0.656 |            0.341 | Workspace/ID index preserves the existing 120-candidate order without sorting           |
| Dispatcher candidate |             0.081 |            0.013 | Status/creation/ID index removes partial-order temporary sort                           |
| Active-call guard    |             0.054 |            0.013 | Covering workspace/call/status lookup replaces a workspace-wide index scan              |
| Follow-up candidates |             0.206 |            0.128 | Workspace/coordinator/recording-date/ID index narrows lookup and removes temporary sort |

For example, the consultation page plan changed from `consultations_workspace_created` plus `USE TEMP B-TREE FOR RIGHT PART OF ORDER BY` to `consultations_workspace_created_id` with no temporary ordering tree. The correlated latest-assessment lookup still uses `assessments_call_created` in both plans. The script emits full `EXPLAIN QUERY PLAN` details, median and p95 observations.

The comparison isolates schema effects on current query implementations. It does not benchmark the old full-history `getCall()` implementation. A regression test separately verifies that latest-only reads use `LIMIT 1` and detail loads history once.

### Storage and write tradeoff

The recorded synthetic run occupied 7,016,448 bytes of local database pages before and 7,512,064 afterward: **495,616 bytes more, approximately 7.1%**. This includes the changed schema/index layout with legacy null document hashes. It is not a forecast for customer storage. The script reports `page_count`, `freelist_count` and page size through derived occupied/allocated bytes; it excludes WAL files and provider replication/backups.

Four prefix indexes are replaced rather than retained alongside their replacements. New indexes still consume space and must be maintained on applicable writes. More indexes are not automatically better: no redundant latest-assessment index, general JSON index, or speculative full-text/vector service was added. Document hashes add 64 text characters per newly approved document plus index storage; duplicate prevention saves the repeated body and chunks when an exact duplicate would otherwise be added.

## Document admission and compatibility

The server trims leading/trailing whitespace using the existing text validator, computes SHA-256 over the remaining UTF-8 body and stores `body_sha256`. The unique key is `(workspace_id, body_sha256)`. A different title with the same body is still duplicate content. Case, internal whitespace and punctuation remain significant; this is exact deduplication, not semantic similarity or document versioning.

Document admission, chunks and success audit commit in one transaction. The insert checks the fifty-document pilot limit and checks for a hash match or an exact legacy body match. Chunk/audit writes are gated on the new document's existence. Concurrent equal bodies admit one document; concurrent distinct additions at 49 documents admit only one. Rejection creates no chunks or success audit. A failure during any chunk write rolls back the document, hash, chunks and audit together.

An exact duplicate returns HTTP 409 with `duplicate_document`, instructing the owner to use the existing source. A full library retains HTTP 422 with `library_limit`. If a concurrent deletion changes the reason after admission fails, the server returns a refreshable `library_changed` conflict rather than claiming the library is full. The browser does not automatically retry mutations.

Existing documents receive a nullable hash column. Their stored text, titles and citations remain unchanged. Old duplicates are not merged or deleted. Null hashes permit the migration to apply even when historical duplicate bodies exist; the atomic exact-body check prevents adding another copy. The same body can be approved in another workspace. There is no automatic cleanup or retention policy.

## Logical storage inventory

`server/storage.ts` executes one `UNION ALL` aggregate statement with a workspace predicate in every branch. A single SQL statement gives a consistent snapshot. Each branch counts rows and sums `length(CAST(text_column AS BLOB))`, so multibyte Unicode is measured in UTF-8 bytes rather than characters. Null values contribute zero.

The report includes all 16 application tables, text identifiers, timestamps, JSON, duplicate document/chunk text and metadata. Integer fields, indexes, page allocation, WAL, backups, replicas and database-provider bills are excluded. Invitation hashes contribute only their byte lengths; their values are never returned. Totals therefore mean **logical persisted text**, not available capacity or a storage quota. Record totals include revisions, chunks and audits; they are not a count of consultations or customers.

The report scans the selected workspace's text when the owner requests it; it is not polled or loaded on every dashboard read. It may become expensive with very large histories. A future measured need could justify maintained counters, with transactional updates and reconciliation, rather than silently accepting stale figures. Schema-coverage tests require every application table and TEXT column to remain inventoried.

## Follow-up discovery and browser recovery

The practice workflow now searches the full workspace through `GET /api/practice/:id/candidates`. It returns only consultation/assessment identifiers, title, coordinator and timestamps; transcript text, assessment prose and practice instructions are excluded. Pages default to 25 rows with a maximum of 50 and use recording date plus consultation ID as the stable key. Cursors are bound to workspace, assignment and trimmed title query. No full count is needed.

Candidates use the assignment's pinned human baseline, its coordinator and rubric. A different role-play recorded on or after the baseline is eligible only when its latest assessment is human and was saved on or after assignment creation. Same-day role-plays are allowed. Changed coaching approval or a completed assignment returns a conflict. These live reads do not lock a candidate: the existing completion transaction checks eligibility again and rejects a stale selection.

The picker loads on demand. Superseded requests are cancelled; late responses cannot replace the current page. Selection survives page changes and failed reads. A completion conflict clears the outdated selection, reloads choices and preserves the written reflection. Search never submits the enclosing completion form. Both practice form actions now have explicit submit semantics for the Base UI button primitive.

Settings now includes the owner-only **Workspace storage** panel. Measurement is manual, grouped by product area, with an expandable table breakdown. A failed refresh leaves the last successful snapshot visible with an error message. The interface performs no automatic deletion or write retry.

## Verification and rollout

Focused tests cover concurrent new/legacy duplicates, cross-workspace isolation, immutable source identity, the fifty-document race, chunk-write rollback, complete scoped UTF-8 inventory, and latest-assessment/history query boundaries. Existing coaching deletion tests use two distinct sources and continue verifying both cited and uncited source removal during generation. Existing backup/restore tests also run against the new schema.

Local release verification on October 2, 2026: `npm run check` passed **194 tests**, TypeScript, lint and the production build. Added API tests verify owner-only storage, membership/foreign-assignment rejection, bounded candidate responses and exclusion of transcript/assessment content. Candidate tests cover 207 eligible records, cursor/filter isolation, approval changes and a newer review arriving before completion.

Chrome checks at 1280px and 390px exercised the actual components against synthetic, intercepted API responses: on-demand reads, storage refresh failure with retained metrics, selection across pages, empty and failed searches, Enter-key search without a write, explicit practice-form submission, and conflict recovery retaining reflection. No page errors or document-wide horizontal overflow were observed. This is local UI verification, not a hosted authenticated end-to-end test. The temporary fixture route was removed before the production build. Both Mermaid diagrams were rendered and visually checked; no diagram/browser dependency was added to the application.

Before deploying authenticated workflows:

1. Take the normal protected backup and test restoration according to [operational readiness](OPERATIONS_READINESS.md). Backups contain sensitive data and are not committed.
2. Apply migration 0006 with `npm run db:migrate`; do not edit an applied migration or run schema changes in request handling. The migration adds indexes and a nullable hash column; it does not remove records or consolidate existing documents.
3. Retain an application/schema-matched checkout for older backup restoration. The restore tool intentionally rejects schema fingerprints that differ; restore an older backup to matching empty staging, then migrate forward.
4. Verify owner-only storage access and duplicate rejection in the configured hosted workspace, and check consultation/practice/follow-up queries with representative permitted data.

Clerk, Turso, model credentials and live hosted checks remain separate requirements. This local benchmark does not prove those integrations work.

## Remaining query limitations

- Keyword retrieval still scans candidate text within the selected workspace using substring checks and applies the existing ranking to at most 120 candidates. The new index improves ordering; it does not provide a full-text index, embeddings or better retrieval quality.
- Title/coordinator substring searches, JSON score extraction and whole-workspace insights still require work proportional to matching/history size. Count and page reads are current reads, not one frozen export snapshot.
- Recent jobs still use a status-priority expression for the dashboard, and large audit/revision histories remain retained. No speculative retention/deletion was introduced.
- Measure realistic hosted network latency, concurrent writes, worker throughput and source retrieval against independently judged examples before setting performance or quality commitments.
