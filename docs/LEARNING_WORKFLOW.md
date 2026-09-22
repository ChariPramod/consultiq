# Reviewed coaching and practice workflow

## What is implemented

Open a consultation's **Practice** tab. This workflow adds explicit human approval or rejection of generated coaching, exercises linked to an immutable human assessment, and a reviewed follow-up comparison. It uses the existing private per-user workspace. No invitations, notifications, shared team permissions or automatic assignment delivery are implied.

### 1. Review coaching

Read the original generated answer and its cited passages. Correct the guidance if necessary, provide a reason, then approve or reject it. Each decision appends a revision. Original generated content is preserved separately; edited guidance is labeled human-authored and is not represented as automatically citation-validated.

The current decision is visible alongside its complete decision history. A stale base revision cannot overwrite a newer decision. Refresh preserves the draft; an explicit rebase action lets you adopt the latest revision as the base after reading it. Changing decisions requires a distinct request identity. An identical retry after a lost response returns the saved decision.

### 2. Assign focused practice

Record a human assessment first. Choose a rubric dimension, write the exercise and success criteria, and optionally link the latest approved coaching decision. A manual assessment-only assignment works without model credentials or generated coaching.

The server pins the current human assessment as the baseline. It refuses an automated or superseded baseline. The assignment references its exact rubric and evidence through that immutable assessment. Later assessment revisions do not silently change existing assignments. At most 50 assignments can be created per consultation in this release; pagination and archive management remain future work.

### 3. Review a follow-up

Import a different role-play for the same coordinator label and record a human assessment using the same rubric. The recording date cannot precede the baseline consultation's recording date; the human review must be created at or after assignment creation. Select it and write a reflection to complete the assignment.

The latest assessment on that follow-up must still be human-authored when the completion is saved. Completion is immutable and can be recorded once. An identical repeated request is safe; a conflicting completion is rejected. Comparisons show the pinned before and after scores for the focus dimension. Unsupported scores remain unscored and produce no numeric difference. A difference is descriptive, not proof of causal learning, clinical quality or business outcomes.

Coordinator matching is exact matching of existing free-text labels, not verified person identity. The follow-up selector uses loaded consultations, so older records outside the current loaded limit may require future pagination. Publishing a new rubric does not rewrite existing baselines; reassessment against the same rubric is mandatory for this comparison. The human-assessment dialog lists up to 100 published versions and also accepts an exact workspace-owned rubric ID. Starting a draft with a different rubric explicitly clears the draft; if loading fails, the current draft remains. Assignment cards show the baseline rubric ID so older assignments can still be completed after a new rubric is published.

## Recovery and manual fallbacks

- Source-only library search is available even when AI is configured. It calls retrieval without generation.
- Human assessments and manual practice assignments need no provider account.
- Failed saves retain text while the form stays mounted. Closing the tab, navigating away or reloading the browser discards unsaved text; no transcript or draft is stored in browser local storage.
- Coaching decision and assignment baselines are captured when the draft starts. A newer revision requires explicit rebasing; refresh does not silently overwrite draft text.
- Each mutation has a UUID request ID. Same identity and same payload return the saved record; changed payload conflicts. Concurrent duplicate requests create one record and one audit event.
- Record creation and its successful audit commit in one database batch transaction. A failed audit write rolls back the creation; the same request can then be retried.
- The database is authoritative. No offline write queue or automatic paid provider retry was introduced.

## Approval and deletion rules

A revised coaching decision invalidates the older approval for new assignments and pending completion. Existing completed comparisons remain historical records, not endorsements of a later decision. Create a new assignment using current approved guidance or an independent human assessment.

Deleting a library document retains the existing broad policy of clearing all saved coaching in that workspace. Associated coaching decisions and coaching-linked practice assignments/completions cascade away, including copied reviewer guidance and instructions. Independent manual assignments remain. Deleting a baseline consultation removes its assignments; deleting a follow-up consultation removes its linked completion, leaving the baseline assignment open again. Metadata-only audit events remain.

## Persistence and API

New generated migration `0002_oval_corsair.sql` adds `coaching_reviews`, `practice_assignments` and `practice_completions`. Apply migrations before running this version. Earlier migrations are unchanged. Existing records are not seeded or backfilled with invented decisions.

| Method | Endpoint | Operation |
| --- | --- | --- |
| GET | `/api/rubrics` or `/api/rubrics/:id` | List published version summaries or read an owned rubric version |
| GET | `/api/consultations/:id/learning` | Scoped review history, assignments and pinned comparisons |
| POST | `/api/coaching/:id/reviews` | Append approved/rejected decision with `request_id`, `base_id`, `guidance`, `notes` |
| POST | `/api/consultations/:id/practice` | Create assignment with `request_id`, `baseline_id`, optional `review_id`, `dimension`, `instruction` |
| POST | `/api/practice/:id/complete` | Link follow-up with `request_id`, `assessment_id`, `reflection` |

Every read and mutation uses the authenticated workspace. Eligibility checks are in the INSERT statement, including current baseline/approval, follow-up identity and completion status. Joined reads retrieve assignment comparisons without per-assignment queries. Request IDs are deduplication keys, never authorization tokens.

## Remaining work and validation boundaries

This is the implemented text learning loop, not the whole commercial roadmap. Durable background attempts, team accounts/roles, recorded audio/transcription, interactive voice, retention operations and staging deployment remain separate work. Owner-provided rubric anchors, permitted examples and quality judgments remain necessary.

Automated tests cover domain comparison, manual workflow, replay/mismatch/races, stale/revoked decisions, foreign workspaces, rubric/coordinator/chronology checks, AI baseline/follow-up rejection, source and consultation deletion, pinned baselines and audit rollback. They verify engineering rules, not coaching quality. Hosted migrations, browser interactions, assistive technology and live-provider workflows remain unverified.
