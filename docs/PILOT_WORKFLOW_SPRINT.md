# Pilot workflow sprint

This increment helps a dental training lead run a review session with role-play or synthetic transcripts. It does not add ingestion of real patient records, native CRM synchronization, payment collection, or a validated prediction of sales outcomes. The intended buyer and willingness to pay still need validation.

## Implemented workflows

### Batch onboarding

Consultations → Import CSV accepts a maximum of 50 records and 2 MB. Download the header-only template, prepare `title`, `coordinator`, `source`, `recorded_at`, and `transcript` columns, then preview the whole batch before confirming. Supported sources are `roleplay` and `synthetic`; transcript cells contain Coordinator:/Patient: turns and may span lines inside quoted CSV cells. Dates are YYYY-MM-DD.

The parser handles quoted commas, escaped quotes, CRLF and multiline fields. Invalid dates, unsupported sources, malformed CSV and duplicates within the file block submission. Existing workspace records are not globally deduplicated. Imports run sequentially through the existing authenticated API. On any uncertain save the batch stops, preserves confirmed successes, and does not retry. Refresh the workspace and reconcile the uncertain row before creating a new file containing only unsaved records. Closing or navigating away does not undo accepted requests. No background bulk import service or cross-session resume is claimed.

### Review queue

Consultations now searches the entire authenticated workspace using server-side filters for title/coordinator text, exact coordinator, outcome and latest review type. The UI loads 25 rows at a time; the API allows at most 50. Rows contain summary fields and turn counts, not complete transcripts or assessment evidence. Unreviewed means no assessment exists. AI means the latest assessment is AI-authored, not that a reviewer has approved it.

A stable creation-time/ID cursor avoids offset shifts from newer inserts. Cursors are bound to workspace and filters and confer no authorization. Count and page reads are separate; concurrent changes to reviews/outcomes can change totals and membership. UI errors offer a first-page reload. Exports from this table contain only the displayed page. The later [team workflow iteration](TEAM_WORKFLOW_ITERATION.md) replaces the recent-record analytics with whole-workspace insights. Follow-up candidate selection still uses the most recent 200 summaries.

### Portable review handoff

Each consultation has CSV and JSON download controls. Exports contain immutable transcript turns, saved assessment revisions, evidence, and rubric provenance. JSON uses a versioned schema; CSV uses typed rows and guards spreadsheet formula prefixes. The server scopes every read to the selected authorized workspace, and the client attaches the same workspace header as other API calls.

Exports are limited to 100 revisions and a 3 MiB serialized response envelope; oversize requests fail explicitly instead of silently truncating. Files contain private conversation content and must be shared only with authorized recipients. These are scoped reads, not a transactionally consistent backup. They do not include coaching/practice histories or implement restoration. Use the existing backup tool for recovery.

### Calendar interoperability

Open an unfinished practice assignment, select a date, and download an all-day `.ics` event. This format supports manual import into calendar applications. The event contains a generic title and authenticated workspace URL, without transcript or coaching notes. Date selection does not persist a due date to ConsultIQ. No attendees, email, automatic synchronization, notification delivery or calendar account connection is created. Re-import behavior and default reminders depend on the calendar application.

The generator follows [RFC 5545](https://www.rfc-editor.org/rfc/rfc5545) for CRLF, text escaping, UTF-8 line folding and exclusive all-day end dates. Actual import in Google Calendar, Outlook and Apple Calendar remains a manual acceptance check.

## API additions

- `GET /api/consultations?q=&coordinator=&outcome=&review=&limit=&cursor=`: paginated scoped records and matching total. Invalid filters/cursors return 422.
- `GET /api/consultations/:id/export?format=json|csv`: authenticated JSON envelope `{filename,mime,content}` for a browser-created download. Missing records return 404; unsupported formats return 422; oversize exports return 413.

Owner/reviewer/viewer roles may read authorized records and export them. Only owner/reviewer may import. Existing cross-origin mutation checks and server authorization remain in force. This increment needs no schema migration beyond the already required 0000–0004 migrations.

## Two-day customer validation sequence

1. **Owner:** finish Clerk development-key capture and Turso login using `work/setup-accounts.sh`. The existing Vercel URL is for testing; commercial production Clerk setup needs an owned domain. Keep secrets out of chat and Git.
2. **Engineering:** configure cloud storage, apply migrations, redeploy, verify sign-in/save/reload with synthetic records and a second account, and exercise the new workflows in the hosted browser. AI additionally needs provider credentials, an approved rubric and an enabled worker.
3. **Owner:** invite one prospective training lead to a real working session. Obtain permitted role-play transcripts and the lead's existing rubric; do not fabricate assessment anchors. Identify their current source application before committing to a native integration.
4. **Together:** import their training batch, review one conversation, assign practice, and export the evidence. Record whether it reduces their actual review work and what they would pay for a bounded pilot. Do not advertise measured time savings until measured.
5. **Before collecting payment:** agree pilot scope, price, user limit, support contact, data retention/deletion, and whether AI is included. Complete operational backup/restore and access checks. Billing automation and native app synchronization are separate unfinished work.

A passing build establishes implementation checks, not customer value or commercial readiness. Keep the scheduled AI dispatcher paused until credentials, migrations, and a live worker run are verified. Manual review and exports can operate without a model-provider key once authentication/storage are configured.

## Verification in this increment

`npm run check` passed: 145 automated tests, TypeScript, lint, and the optimized Next.js build. New tests cover quoted/multiline CSV, invalid input and duplicates, partial/ambiguous imports, workspace-switch interruption, scoped pagination and latest-review filters, viewer exports and cross-workspace denial, spreadsheet formula injection, serialized response-size limits, and calendar date/escaping/folding rules. Authenticated browser workflows and actual calendar imports still require live acceptance checks; no customer-quality benchmark or measured business impact is claimed.
