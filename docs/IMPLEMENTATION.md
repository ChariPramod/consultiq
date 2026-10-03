# Implementation

## Request and data flow

See [the overall architecture and query/response diagrams](ARCHITECTURE.md) for deployment boundaries, asynchronous analysis, storage/query design and failure recovery. The editable diagram sources are in [`docs/diagrams/`](diagrams/).

The React application calls same-origin Next.js Node API routes. Clerk supplies verified session identity; the deployment allowlist and selected workspace's owner/reviewer/viewer membership govern access. The handler passes that verified actor into workspace-scoped repositories. Hosted libSQL stores records and durable job intent; browser storage is not a record store.

Ordinary queries return lightweight summaries or explicitly requested detail. Human mutations use guarded transactions and append review revisions. Analysis requests persist a queued job and return 202; a separately dispatched worker rechecks access and inputs, calls the provider, validates evidence, and atomically commits result, audit and completed job status. The browser refreshes stored state. Missing credentials fail closed, and deployment of the public page does not verify the authenticated workflow.

## Code boundaries

| Location | Responsibility |
| --- | --- |
| `app/page.tsx`, `app/tour/`, `app/marketing.css` | Public product pages and labeled synthetic walkthrough |
| `app/workspace/`, `components/ui/` | Review, team, learning and operations interfaces using shared UI primitives |
| `lib/api.ts` | Same-origin requests, selected-workspace header, deliberate analysis request keys and uncertain-save messaging |
| `proxy.ts`, `server/session.ts`, `server/access.ts` | Clerk integration and explicit pilot admission; separate worker-secret boundary |
| `app/api/[...path]/route.ts`, `server/runtime.ts` | Public API runtime, verified identity, database lifecycle and sanitized infrastructure failures |
| `server/handler.ts` | Workspace/role routing, mutation-origin checks, request limits and endpoint dispatch |
| `server/team.ts` | Workspace resolution, actor-bound invitations and membership revocation |
| `server/repository.ts`, `server/database.ts` | Scoped persistence, evidence guards, transactional batches and foreign-key enforcement |
| `server/consultation-query.ts`, `server/practice-inbox.ts`, `server/followup-candidates.ts` | Bounded workspace queries and scope-bound keyset pagination |
| `server/review-tasks.ts`, `server/learning.ts` | Versioned reviewer assignments, coaching decisions and pinned practice completion |
| `server/insights.ts`, `server/operations.ts`, `server/storage.ts` | Workspace aggregates, owner operations and logical storage inspection |
| `server/queue.ts`, `server/worker-auth.ts` | Durable analysis admission, atomic claims, lease recovery and cancellation |
| `app/api/internal/worker/route.ts`, `scripts/worker.mjs`, `.github/workflows/worker.yml` | Secret-authenticated dispatch and alternative supervised worker |
| `server/ai.ts`, `server/model.ts` | Scoring/RAG orchestration and bounded, sanitized provider requests |
| `lib/product.ts`, `lib/evidence.ts`, `lib/assessment.ts` | Domain validation, exact quote checks and supported-score rules |
| `lib/retrieval.ts` | Shared deterministic keyword ranking for production and retrieval evaluation |
| `server/observability.ts`, `server/telemetry.ts` | Content-free nested traces and versioned analysis measurements |
| `server/exports.ts`, `lib/bulk-import.ts`, `lib/calendar.ts` | Explicit evidence exports, browser CSV validation and calendar-file handoff |
| `lib/evaluation*.ts`, `lib/retrieval-evaluation.ts`, `scripts/evaluate*.mjs` | Offline assessment/retrieval metrics and explicit release comparisons |
| `scripts/backup-workspace.mjs`, `scripts/restore-workspace.mjs`, `scripts/verify-hosted*.mjs` | Scoped backups, empty-staging restore and hosted acceptance checks |
| `db/schema.ts`, `drizzle/`, `tests/` | Schema, append-only generated migration history and behavioral tests against migrated SQLite |

## Assessment invariants

Imported transcript turns are immutable. An evidence span must occur in the referenced turn after limited typography and whitespace normalization. Semantic similarity is not used to pass a quote. A dimension without valid supporting evidence is stored with a null score. Coverage remains visible, and the overview only averages complete assessments.

Every assessment stores its rubric version, author kind, prompt version and model where relevant. Human corrections append a revision. An atomic latest-assessment check rejects stale saves, including a model result that finishes after a newer review. Publishing a rubric creates a new version and does not rewrite earlier assessments.

## Retrieval and coaching

Adding an approved text document creates scoped chunks. Search uses normalized keywords and ranks matching passages. Coaching supplies the selected transcript and retrieved passages to the configured model. Every returned citation must identify a retrieved chunk and contain a quote found in that chunk. Unsupported answers are rejected instead of stored. At persistence time, one atomic statement checks that the consultation and every retrieved source still exist in the workspace. Deletion during generation returns a conflict and does not recreate removed source content or emit a successful-save audit event.

This validates citation identity and text, not the semantic correctness of every sentence. Generated coaching remains marked for human review. Deleting a library document removes its chunks and clears saved coaching answers in that workspace to avoid retaining copied passages from removed material. Deleting a consultation cascades to its assessments, coaching and jobs. Metadata-only audit events remain.

## API

Application endpoints require verified session admission and workspace authorization. Mutation requests reject cross-origin browser writes. Responses are not cached. Owner-only restrictions are enforced server-side; disabling a UI control is not an access boundary.

| Method | Path | Operation |
| --- | --- | --- |
| GET | `/api/workspaces` | List personal/member workspaces for the verified user |
| GET / PATCH | `/api/workspace` | Read lightweight bootstrap / owner rename |
| GET / POST | `/api/consultations` | Query the paginated review queue / import transcript |
| GET / PATCH / DELETE | `/api/consultations/:id` | Read detail / update recorded outcome / owner delete |
| GET | `/api/consultations/:id/export?format=` | Export scoped evidence as explicit CSV/JSON fields |
| POST | `/api/consultations/:id/reviews` | Append human assessment with a latest-revision guard |
| POST | `/api/consultations/:id/score` | Admit model assessment to the queue; return 202 |
| POST | `/api/consultations/:id/coaching` | Admit source-grounded coaching to the queue; return 202 |
| GET / PATCH | `/api/consultations/:id/review-task` | Read / update a versioned reviewer assignment |
| GET | `/api/review-tasks` | Query the reviewer worklist |
| GET | `/api/consultations/:id/learning` | Read coaching decisions and pinned practice history |
| POST | `/api/coaching/:id/reviews` | Append a coaching review decision |
| POST | `/api/consultations/:id/practice` | Assign practice from a human-reviewed baseline |
| GET | `/api/practice` | Query the workspace practice inbox |
| GET | `/api/practice/:id/candidates` | Search eligible follow-up assessments across the workspace |
| POST | `/api/practice/:id/complete` | Pin a valid follow-up assessment and reflection |
| GET / POST | `/api/rubrics` | List published versions / owner publish approved version |
| GET | `/api/rubrics/:id` | Read a scoped immutable rubric version |
| POST | `/api/library` | Owner add approved document; reject exact duplicate bodies |
| GET | `/api/library/search?q=` | Retrieve approved scoped passages |
| GET / DELETE | `/api/library/:id` | Load source text / owner remove document and dependent coaching content |
| GET | `/api/team` | Read the workspace roster; only the owner receives pending invitations |
| POST | `/api/team/invitations` | Owner create or rotate an actor-bound invitation |
| POST | `/api/team/accept` | Accept a token as its verified invitee; selected-workspace header is not used |
| DELETE | `/api/team/members/:userId` | Owner revoke membership and cancel that member's active jobs |
| DELETE | `/api/team/invitations/:id` | Owner revoke an invitation |
| POST | `/api/jobs/:id/cancel` | Owner or requesting reviewer cancel active analysis |
| GET | `/api/insights` | Read all-time workspace counts and rubric-separated aggregates |
| GET | `/api/operations` | Owner inspect queue/failure/lease aggregates |
| GET | `/api/storage` | Owner inspect scoped row counts and logical text bytes |

`GET` or `POST /api/internal/worker` is a separate service endpoint: it requires the exact server-side `CRON_SECRET` bearer value and bypasses Clerk middleware. It accepts no caller-selected workspace, processes at most one claim per dispatch, and is never called by the browser. A 200 dispatch response is not proof of successful analysis; read the job outcome. The [architecture failure contract](ARCHITECTURE.md#failure-contract) distinguishes admission responses, persisted worker failures and uncertain saves.

## Identity and operation limits

`server/session.ts` verifies the Clerk session; `server/access.ts` applies CONSULTIQ_ALLOWED_USER_IDS. Missing configuration denies access. The API passes the verified ID directly to the handler; caller-supplied Sites identity headers are ignored. `server/database.ts` provides atomic libSQL batches and checks foreign keys. Vercel refuses local file storage. Migrations run explicitly, never on a request or build.

Personal workspaces support owner-managed reviewer/viewer memberships, actor-bound invitations and revocation. Selected workspace IDs are resolved against verified identity on every request. The pilot allowlist remains an additional admission boundary. Vercel preview Deployment Protection supplies an additional host boundary; production domain privacy must be verified separately before promotion.

Hosted analysis requests now persist a queued intent and return 202. A separate privileged worker claims jobs, checks pinned inputs and requester permissions, and runs generation under a nonrenewable lease. Daily limits and duplicate-running checks constrain provider use. There is no automatic paid retry or token-cost ledger. Library and bootstrap-summary limits are intentional pilot constraints. Paginated consultation, reviewer, practice and eligible follow-up queries cover the full authorized workspace; this is not a hosted scale benchmark.

## Observability

Optional LangSmith instrumentation records assessment and coaching runs with nested `model_response` and `validation_save` stages. Traces carry job ID, configured model, timings and allowlisted failure codes. Inputs and outputs are empty; raw exception messages and stacks are never passed to the trace client. Completed spans are delivered after the analysis callback, with a bounded wait. Delivery failure does not replace the saved result or the original analysis error, and never retries the analysis. Invalid trace endpoint configuration still fails before model invocation.

Retrieval remains outside the admitted analysis interval and is not traced by this increment. Token counts remain in application job history; this integration does not provide LangSmith token/cost accounting, evaluation datasets or automatic feedback synchronization. Application job history remains available without LangSmith.

The instrumentation uses LangSmith's [custom tracing](https://docs.langchain.com/langsmith/annotate-code) and [input/output masking](https://docs.langchain.com/langsmith/mask-inputs-outputs). Masking trace payloads does not stop the model provider receiving transcript and source content needed for generation.

## Offline assessment evaluation

The evaluator calls the same assessment preparation and quote validation used by the application. It compares validated scores with supplied reference scores, reports numeric agreement only on mutually scored dimensions, and reports support/abstention disagreements separately. Missing numeric denominators produce null metrics. CLI reports include version metadata and an input hash but omit per-case identifiers, transcript text, quotes and coaching content. See [Evaluation](EVALUATION.md). This is evaluation infrastructure, not a completed domain benchmark.

## Provider response handling

The provider adapter reads response chunks under a byte limit instead of buffering an arbitrary response before checking its length. Failed HTTP response bodies are cancelled without exposing their content. Network failures, incomplete body streams and malformed or truncated model envelopes produce sanitized errors. Requests retain the configured timeout; no automatic paid retry was added.

## Persisted analysis measurements

Analysis jobs now have nullable, versioned measurement data: total analysis duration, model-adapter duration, validation/save duration and provider-reported uncached input/output token counts. The workspace settings display these values for recent runs. Missing values remain null, including old jobs and failures before usage is reported. Timings exclude preflight/source retrieval, trace flushing and the optional telemetry update. These are not full-request latency or a billing ledger. See [Run measurements](RUN_MEASUREMENTS.md) for boundaries and migration requirements.

## Interrupted attempt protection

AI result insertion checks the matching job ID, workspace, consultation, operation and running status atomically with the insert. Human reviews require no job. Final job updates only affect running rows, so a late completion cannot overwrite interrupted state. Queued-worker lease recovery happens on dispatch. The legacy direct orchestration test path also supports stale recovery during admission. Result persistence, successful-save audit and job completion now share a transaction; the queue stores durable execution intent but cannot guarantee exactly-once execution at the provider. See [the handoff](PROJECT_HANDOFF.md).

Successful AI persistence now commits the result, audit event and completed job status in one transaction. The validation/save timing includes this transaction. Optional telemetry is saved afterward; storage failure can leave measurements unavailable without failing the saved result.

## Reviewed coaching and practice

`server/learning.ts` implements workspace-scoped append-only coaching decisions, practice assignments and immutable follow-up completions. Mutations deduplicate request IDs, reject stale inputs atomically and commit success audits in the same transaction. Joined reads return pinned baseline/follow-up assessments. See [Learning workflow](LEARNING_WORKFLOW.md) for schema, API, deletion rules and limits.

## Runtime recovery and setup checks

`server/runtime.ts` owns verified session admission, connection lifecycle and sanitized infrastructure failures. The runtime opens storage only after authorization, and a close failure cannot mask a committed response. `app/workspace/error.tsx` provides retry navigation for rendering failures without exposing raw errors. `npm run doctor` checks required setup and migration checksums without querying workspace records; it is an operator tool, not an HTTP endpoint. See [Deployment reliability](DEPLOYMENT_RELIABILITY.md) for boundaries and unfinished work.

## Team, queue and operations boundaries

`server/team.ts` resolves membership and enforces roles. `server/queue.ts` handles idempotent admission, atomic claims, cancellation and lease recovery. `server/worker-auth.ts` protects remote dispatch; the worker never accepts a caller-selected workspace. `server/operations.ts` returns owner-only workspace aggregates. Retrieval uses shared `lib/retrieval.ts` ranking. New persistence is migrations 0003 and 0004. Read [PRODUCT_RELIABILITY.md](PRODUCT_RELIABILITY.md) for deployment requirements and limits.

## Pilot workflow endpoints

`server/consultation-query.ts` provides workspace-scoped keyset pagination with latest-assessment filters; `server/exports.ts` generates bounded, explicit-field CSV/JSON handoffs. Browser batch CSV import uses existing authenticated create requests with no automatic retry. `lib/calendar.ts` produces content-minimal calendar files without sending messages or connecting calendar accounts. See [pilot workflow scope and limits](PILOT_WORKFLOW_SPRINT.md).

## Team workflow and lightweight workspace bootstrap

`server/review-tasks.ts` owns versioned reviewer assignments and immutable change history. `server/practice-inbox.ts` reads pinned practice summaries; `server/insights.ts` computes all-time, workspace-scoped aggregates without mixed-rubric means. Bootstrap now returns consultation and document summaries; `/api/library/:id` loads full scoped source text on demand. New schema is migration 0005. See [team workflow and limitations](TEAM_WORKFLOW_ITERATION.md).

## Storage and query improvements

`server/storage.ts` returns owner-only counts and logical UTF-8 text bytes in one scoped aggregate statement. It excludes physical allocation, index overhead, replicas, backups and provider billing. `knowledge_documents.body_sha256` plus the workspace/hash unique index rejects exact trimmed-body duplicate imports; an atomic exact-body guard also covers older null-hash rows. This does not delete or rewrite existing sources.

`server/followup-candidates.ts` searches eligible latest human assessments using workspace/assignment/query-bound keyset cursors. The UI no longer depends on the newest 200 bootstrap summaries to complete practice. Eligibility and approval are rechecked by the completion mutation. Query-specific indexes support these paths and existing review/queue reads; generated migrations remain the authoritative DDL. See [storage and query design](ARCHITECTURE.md#storage-and-query-design) for remaining scan/history costs and measurement boundaries.
