# ConsultIQ: completed work and owner handoff

Updated September 21, 2026. This document describes the implemented source, its limits, and the remaining work. It is not a claim of commercial readiness. Recent increments are in the private GitHub repository; they have not been deployed to the existing hosted workspace.

## 1. What has been built

| Area | Implemented behavior | Important boundary |
| --- | --- | --- |
| Product interface | Landing page and persistent review workspace using shared shadcn/Base UI components | No invented customers or performance claims; browser/accessibility regression work remains |
| Identity and storage | Sites identity and D1 records scoped to the authenticated workspace | A private workspace per user, not organizations or team roles |
| Consultation records | Role-play/synthetic transcript import, recorded outcomes, filtering and CSV export | No real patient/audio ingestion; exports reflect loaded records |
| Rubric governance | Explicit approval and immutable published rubric versions | You supply the actual criteria and anchors |
| Assessment | Manual review and optional Claude assessment with model/prompt/rubric provenance | Numeric scores need verified quotes from their cited transcript turns |
| Review history | Appended assessment revisions and stale-save rejection | A later human review cannot silently be overwritten by an older submission |
| Knowledge and RAG | Approved text ingestion, scoped keyword retrieval, generated coaching with checked citations | No embeddings or semantic reranker; a matching quote does not prove the advice is correct |
| Deletion | Consultation/derived-record removal; source deletion checks during coaching persistence | Metadata-only audit history remains; no guarantee of erasure from backups or providers |
| Provider reliability | Timeout, response-size bound, sanitized transport/output failures and daily request cap | No automatic paid retry or currency budget |
| Evaluation | Offline CLI with independent references, coverage/abstention reporting and aggregate reports | Infrastructure exists; no validated dental benchmark has been produced |
| Measurements | Persisted model and validation/save timings and reported uncached input/output tokens | Not end-to-end voice latency, cache-complete usage or a billing ledger |
| LangSmith | Nested model/validation traces with empty content payloads, fixed errors and bounded delivery | Live ingestion needs verification; failed delivery can lose traces |
| Recovery protection | AI result insertion requires the matching active job; terminal job state cannot be overwritten by late completion | Synchronous execution remains; no durable queue or recovery worker yet |
| Delivery | Private GitHub source and automated test/typecheck/lint/build workflow | CI validates source; it does not deploy the application |

Earlier work closed coaching races involving deleted cited and uncited sources, added provider failure tests, and introduced the offline evaluator. Later increments added saved run measurements and nested tracing. The interrupted-attempt guard prevents late results after recovery. The latest iteration additionally commits results, audit events and job completion atomically and makes successful-run telemetry best effort.

## 2. What this iteration changes

Both assessment and coaching insertions check job identity, workspace, consultation, operation and `running` status in the same SQL statement that saves the result. Human review does not require an AI job. Finalizing a job only updates a job still running, preserving an interrupted attempt's status, timestamp, error and measurements.

The regressions deliberately interrupt attempt A, admit replacement B, then return A's provider result. A must save no result or successful-save audit event; B remains active. Other regressions reject missing jobs and jobs belonging to another workspace, consultation or operation.

No schema migration is needed for this change. The earlier nullable telemetry migration is still required when deploying the current source to a host that has not applied it.

### Remaining recovery limitations

Stale jobs are marked interrupted opportunistically when a new run is admitted. Three minutes is the stale-record threshold, not a scheduler or guaranteed cancellation time. No provider request is retried automatically.

Result persistence, successful-save audit and completed job status now commit in one database transaction. An audit or completion write failure rolls back the result as well. Optional telemetry is written afterward and can be missing without changing the completed status. Assessment responses use the committed values instead of requiring a second database read.

A provider can still finish billable work before a process fails to save its response. There is no automatic retry, durable delivery or exactly-once provider execution. A lost HTTP response also leaves the caller uncertain; refresh the workspace to inspect saved results before requesting another analysis.

## 3. Your next actions, in priority order

### A. Choose the first real workflow

Provide a short written decision naming the proposed buyer, the reviewer, the person receiving coaching and the task they need to complete. The current hypothesis is a dental training lead reviewing coordinator role-plays. State whether one private reviewer is enough for the pilot or whether shared teams are mandatory. This determines the access work required before a customer can use it.

Done means we have a named workflow, one accountable domain reviewer and an agreed definition of a useful review session. You do not need to design the database or write the access-control code.

### B. Author and approve the rubric

Supply low, middle and high anchors for all eight dimensions in **Review rubric**, then publish the approved version. Define observable behavior and when the evidence is insufficient to assign a score. Record how disagreements should be resolved. The application and engineering fixtures are not substitutes for your professional standards.

Done means a domain-approved published rubric and explicit abstention rules. Keep the protected rubric documents and prompts owner-authored; engineering will not fabricate anchors.

### C. Supply permitted examples and training material

Collect role-play or synthetic transcripts you have the right to use. Each transcript needs the coordinator, session date and labeled `Coordinator:` / `Patient:` turns. Import through **Consultations → Import transcript**. Do not use real patient recordings in the current release.

Add approved text guidance to **Knowledge library** with meaningful titles. Keep a source register outside the app if needed: author/publisher, permission basis, version/date, approver and review date. Only approve documents whose accuracy and permitted use you have checked. Store application material through the app so workspace scoping applies; do not commit transcripts, exports or runtime records to GitHub.

Done means a small reviewed set of usable transcripts and guidance relevant to the chosen workflow. No minimum dataset size is being represented as statistically sufficient.

### D. Obtain independent quality labels

Have the domain reviewer assess examples independently of the model output. Separate material used to refine the rubric/prompts from the held-out evaluation set. Do not put held-out answers into the retrieval library or prompt examples.

Use [the evaluation contract](EVALUATION.md) to prepare reference scores, transcript evidence and version metadata. Decide acceptance thresholds for score disagreement, unsupported scoring, abstention, invalid evidence and useful coaching before interpreting results. Record reviewer disagreements rather than hiding them in an average.

Done means frozen examples, independent references, a version identifier and agreed decision criteria. Engineering already built the evaluator and can help prepare and run the comparison. You provide domain judgment; no accuracy claim exists until this work is performed.

### E. Configure the model account

Choose an Anthropic account and a model available to that account. Set a provider-side spending limit. Add `ANTHROPIC_API_KEY` and `AI_MODEL` as server-only settings; optionally set `MAX_AI_RUNS_PER_DAY`. Follow [Operations](OPERATIONS.md).

Local settings belong in ignored `.dev.vars`. Hosted runtime settings must be configured separately; local secrets are not published with source. Never paste keys into chat, a browser form intended for application data, or GitHub. The app's daily cap counts requests, not money.

Done means the server reports configuration present and an approved role-play completes a live assessment with inspected evidence. Configuration presence alone does not verify credentials, model quality or billing.

### F. Configure and verify LangSmith if wanted

Choose the project, US/EU region, access membership and retention settings. Configure `LANGSMITH_TRACING=true`, `LANGSMITH_API_KEY`, `LANGSMITH_PROJECT` and the corresponding endpoint on the server. Tracing is optional; manual review and application job history do not require it.

Follow [Tracing](TRACING.md): match application job IDs, inspect model and validation/save children, confirm empty content and fixed error codes, and exercise a controlled failure in staging. Engineering can execute and document these checks once the account configuration and approved input are available. Do not send keys to the engineering chat.

Done means actual trace ingestion and privacy have been inspected, including failure behavior. Nested trace code passing tests is not equivalent to live account verification.

### G. Decide pilot and data obligations before selling

Provide the business name, proposed domain, support contact, billing entity, pilot price and what support is included. Recruit a design partner and agree on workflow, feedback cadence and what the pilot does not promise. Do not advertise score-driven revenue or treatment acceptance predictions.

Decide permitted content, permission/consent evidence, retention, deletion expectations, third-party processing and access responsibilities. If shared teams are required, define who can import, review, manage sources, approve rubrics and administer membership. Real patient data needs a separate ingestion and operational review before enabling it.

Done means documented commercial and data decisions that engineering can implement and validate. Buying cloud infrastructure or adding billing code does not replace these decisions.

## 4. Engineering work still assigned to us

| Priority | Work | Evidence required before treating it as complete |
| --- | --- | --- |
| Next | Durable attempts and background processing | Atomic admission, attempt identity, cancellation rules, bounded retries, interruption recovery and visibility into uncertain provider completion |
| Next | Staging and release operations | Apply migrations, deploy the exact source, verify authenticated workflows, and exercise backup/restore and rollback procedures |
| Next | Live evaluation and observability | Owner-approved inputs, actual provider/trace checks, frozen comparisons and explicit failure review |
| Before shared pilot | Organizations, membership and roles | Cross-organization tests for every data and retrieval operation, invitations and offboarding |
| Before scale | Pagination, aggregate queries and retention | Correct exports/limits, load behavior and tested retention/deletion procedures |
| Before paid tiers | Usage accounting and billing | Cache-aware usage, reconciliation, entitlements, spending controls and agreed commercial model |
| Measured improvement | Retrieval and coaching quality | Judged question/source examples, citation-level review, source freshness, and measured improvement before adding vector infrastructure |
| Later | Recorded audio | Private object storage, upload validation, transcription, speaker review and immutable transcript versions |
| Later | Interactive voice practice | Measured turn detection, interruption handling, cancellation, first-audio latency and replay-based edge-case tests |

You are not being asked to write the backend, wire LangSmith, implement RAG, build queues, design migrations, or maintain test code. The owner-dependent items are access, permitted material, domain judgments and business decisions.

## 5. Local development and cloud sequence

Continue local engineering against local D1 and controlled service responses. Configure a separate staging environment before live provider validation and customer use. Deploy reviewed increments to staging, verify them, then promote the exact validated source; there is no need to wait until every future feature is built.

Do not upload all available data to cloud first. Start with permitted role-plays, establish access and retention, and migrate only the data needed for the workflow. Current hosted execution uses Sites/Cloudflare Workers and D1. Audio object storage and queue infrastructure are not provisioned by this iteration. Existing hosting and private GitHub source are separate systems.

For detailed data sourcing, provider options and market research, see [Data, cloud and market strategy](DATA_CLOUD_MARKET_AND_BUILD_STRATEGY.md). Its researched prices are dated information to recheck before purchasing, not a current quote. This iteration does not require a new paid service.

## 6. Where to look

- [README](../README.md): setup and implemented feature inventory.
- [Implementation](IMPLEMENTATION.md): data flow and invariants.
- [Validation](VALIDATION.md): engineering evidence and unverified work.
- [Iteration plan](ITERATION_PLAN.md): next implementation sequence.
- [Owner actions](OWNER_ACTIONS.md): short checklist for the decisions detailed here.
- [Operations](OPERATIONS.md): server settings and deployment boundaries.

Keep this handoff updated as work ships. Completed source, successful automated checks, live verification and commercial readiness are distinct milestones.

## Latest interface increment

Analysis activity now provides run search, status filters, measurements, manual refresh and recovery links using existing private workspace data. Motion and one attributed Magic UI accent extend the Tailwind v4/shadcn/Lucide interface. The owner chose to preserve Sites/Vinext this iteration. Client requests reject unreadable responses and explain ambiguous writes without automatic retries. See [UI components and recovery](UI_COMPONENTS.md) for behavior and validation limits. No new owner account is required for these features.
