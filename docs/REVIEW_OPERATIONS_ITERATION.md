# Review comparison and operational recovery

This iteration extends the existing application with assessment comparison and full-workspace analysis history, then addresses recovery failures found while reviewing the surrounding workflows. It adds no model calls, billing integration, source connector or database migration.

## Compare saved assessments

Open a consultation's **History** tab to compare two saved revisions. The default pair is the preceding revision and the latest revision. Reviewers can select another pair, reverse the comparison, show only changed dimensions, and open the cited transcript turn.

The comparison exposes score, support state, rationale, coaching notes and quote changes. It uses the existing authorized consultation detail response. Different rubric versions have different anchors: their numeric differences are suppressed. Unscored or unsupported dimensions have no numeric delta. Differences describe the saved reviews, not causal improvement, model accuracy or a calibrated domain benchmark. Reviewer identity is not inferred from the human/AI author kind.

Explicit revision selections remain pinned when refreshed history arrives. Full assessment history still loads with consultation detail; very large revision histories remain a future pagination task.

## Preserve the human editing session

Previously, an assessment editor was keyed to the latest saved revision. A background analysis finishing while a reviewer typed could remount the editor and discard the draft. The editor now captures its consultation, rubric and base revision when opened. Background refreshes leave that editing session intact and display a newer-revision warning. The original base ID remains in the save request, so the existing atomic server guard rejects stale saves instead of silently overwriting or rebasing them.

Inputs lock while a mutation is pending. A synchronous submission guard prevents multiple requests before React has rendered the busy state. Once a save is confirmed, refresh failure is reported separately with a **Refresh saved assessment** action; the application does not repeat the write to recover a read.

Existing additional citations are preserved when changing a score or rationale. The editor displays retained quotes and source turns, supports explicit removal, and deduplicates equivalent quotes from the same turn using the existing quote normalizer. A rubric reset explicitly clears the draft. Every submitted quote is still validated by the server; no client-supplied validation flag is trusted. This does not add a new interface for creating additional quotes.

A browser regression also exposed duplicate review ownership panels: the assignment and export components shared a sibling React key. Distinct component keys preserve one panel through editor, polling and tab updates.

Drafts remain in memory. Refreshing the browser or leaving the editing session can discard unsaved work; this is not persistent draft storage or automatic cross-device recovery.

## Search all analysis history

`GET /api/jobs` requires normal verified identity, pilot admission and selected-workspace membership. Parameters:

| Parameter | Contract |
| --- | --- |
| `status` | `all`, `queued`, `running`, `completed`, `failed`, `cancelled` |
| `kind` | `all`, `scoring`, `coaching` |
| `q` | Literal consultation-title substring, trimmed, at most 200 characters |
| `limit` | Default 25, maximum 50 |
| `cursor` | Opaque continuation bound to workspace and filters |

Pages use creation time and job ID for deterministic order. The query selects at most one extra row to determine whether another page exists; no full count is required. Responses include consultation titles and explicit run metadata, validated timing/token measurements and a server-derived `can_cancel` flag. They exclude transcripts, coaching questions, generated outputs, request payloads, idempotency keys and requester IDs. Titles remain user content and are visible only inside the authorized workspace.

Owners may cancel active workspace runs; reviewers may cancel only their own active runs; viewers cannot cancel. These controls reflect current permissions, and the cancellation mutation remains authoritative if access or job state changes afterward. If a worker finishes before cancellation, the interface reports the returned completed or failed state instead of claiming cancellation. Unverifiable responses pause repeat actions until the run can be read again.

Activity now searches and pages the workspace rather than filtering the bootstrap's newest 200 runs. Header counts explicitly describe the displayed page. Old consultations retain their titles without needing to appear in the bootstrap's loaded consultation list. Search, page and refresh requests reject stale responses and cancel superseded reads. A failed refresh preserves the last successful page for the same filters, with a stale-data warning. Changing filters never shows a previous filter's result as current.

Existing workspace polling triggers a history reload when loaded job metadata changes. Manual refresh remains available, including for older pages. This is not a streaming feed or a worker heartbeat. Status-filter membership can change between pages; return to **Newest** to reconcile new work. There are no automatic paid retries.

SQLite query-plan inspection uses the existing `jobs_workspace_created` index and the consultation primary key. The ID tie-break can still require a temporary partial sort; status/type/title filters can scan scoped rows. No additional index was justified by this iteration, and no hosted throughput or latency claim is made.

## Recover imports and rubric publication

A successful transcript POST followed by a failed workspace refresh used to leave the import form looking unsaved. Repeating it created another consultation. The dialog now captures the confirmed record ID before attempting navigation. **Open saved consultation** retries only refresh/navigation. Closing and reopening the dialog preserves its saved recovery state; **Import another consultation** explicitly starts another draft.

When a POST response is lost, malformed or fails ambiguously, the import may already exist. The interface pauses repeat submission, opens a refreshed consultation list for inspection and requires an explicit acknowledgement before a deliberate retry. This is a recovery safeguard, not server-side import idempotency. Validation failures preserve an editable draft. Inputs and file loading are guarded while submission is pending.

Rubric publication applies the same confirmed-write separation: a confirmed version remains published even if the following refresh fails. Recovery loads existing state instead of creating another version. Starting another version is explicit and requires fresh approval; owner-authored anchors are not generated or changed automatically.

## Malformed measurement fallback

The bootstrap previously parsed stored telemetry JSON without a recovery boundary. A malformed legacy record could fail the entire workspace response. `lib/run-telemetry.ts` now provides shared schema validation for bootstrap and history. Unsupported versions, malformed JSON, invalid numbers and oversized values become unavailable measurements. Unexpected fields are discarded. Other workspace records remain usable; missing values are never interpreted as zero or proof that no provider charge occurred.

## Verification and remaining work

`npm run check` passed with **217 tests**, TypeScript checking, lint and the production build. Temporary browser fixture routes were removed before that final build. No production data or credentials were used by these checks.

Regression coverage includes pagination beyond 200 runs, cross-workspace joins, cursor/filter validation, deletion cascades, cancellation permissions, malformed telemetry, mixed-rubric comparisons, unscored dimensions, pinned selections, retained citations and the real quote validator. Browser fault injection exercises editing during background refresh, busy controls, confirmed-save recovery and uncertain import/publication responses using synthetic local fixtures. Held earlier detail responses cannot replace newer results, and successful background polling does not erase a confirmed-save recovery warning. Desktop and 390-pixel mobile checks cover comparison and analysis history, including a local production-build run; no page errors or horizontal page overflow were observed. These are local, scripted browser checks, not a checked-in browser CI suite. The duplicate-panel check failed before the key fix and passed afterward.

No migration is added. A new deployment still requires all existing migrations through 0006. Hosted authenticated acceptance remains blocked by the Clerk/Turso setup described in [Owner actions](OWNER_ACTIONS.md); local fixtures do not establish cloud functionality. The owner still supplies domain anchors, approved material, independent evaluation references and pilot acceptance criteria.

Next engineering priorities are authenticated hosted acceptance once credentials exist, repeatable browser regression automation, measured worker dispatch/alerting, revision-history pagination, and persistent draft recovery with an agreed retention policy. Commercial billing and buyer-specific integrations remain separate scope decisions.
