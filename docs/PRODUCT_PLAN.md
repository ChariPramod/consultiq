# Product direction

ConsultIQ should help a training lead review consultation conversations consistently and give coaching that can be checked against evidence. The proposed initial buyer is a dental training team using coordinator role-plays. This is a product hypothesis to validate with the owner and design partners.

The product promise is reviewable coaching. It is not a claim that conversation scores predict treatment acceptance, revenue, or clinical quality.

## Current release

| Capability | Current state |
| --- | --- |
| Product landing page | Implemented, with clearly labeled illustrative content and working workspace links |
| Private workspace and persistence | Implemented with Clerk identity, explicit access allowlist and libSQL; cloud credentials pending |
| Transcript import and human review | Implemented for role-play and synthetic transcripts |
| Rubric governance | Owner-authored anchors, explicit approval, immutable published versions |
| Automated assessment | Implemented; provider credentials and approved rubric required |
| Evidence validation | Implemented; invalid quote support cannot retain a numeric score |
| Revision comparison and draft safety | Side-by-side review comparison; drafts pinned during polling; retained evidence and confirmed-save recovery |
| RAG coaching | Implemented with approved-document keyword retrieval and checked citations |
| LangSmith | Nested model and validation/save tracing implemented, optional, content excluded |
| Coaching review and practice | Implemented in the private workspace with pinned human-reviewed comparisons |
| Follow-up discovery | Search and keyset pagination across all eligible workspace consultations; eligibility rechecked on save |
| Storage visibility and document deduplication | Owner-only logical text inventory; exact approved-document duplicates rejected atomically |
| Team access | Owner/reviewer/viewer membership, invitations and revocation implemented; pilot allowlist retained |
| Background analysis | Persistent queue, separate worker, cancellation and lease fences implemented; worker deployment pending |
| Analysis history | Full-workspace filtered pagination with validated measurements and role-aware cancellation |
| Owner audit history | Paginated recorded-action metadata with exact action filters and explicit missing-actor handling |
| Customer self-service and billing | Pending |
| Audio, transcription, real patient data | Pending and outside current ingestion scope |
| Offline evaluation infrastructure | Implemented; supplied references required, no validated domain benchmark |
| Predictive outcome models and model-quality benchmarks | Pending; no performance claims |

## Why build on this code

The interface has become the front end of a persistent application. Shared UI components provide consistent dialogs, tables, tabs, forms, and navigation. Domain validation and storage sit behind the API, so changing the UI cannot bypass evidence or workspace checks.

The original plan proposed a separate Python service and Postgres. The application originally used a TypeScript Worker and D1 on Sites. The current migration targets official Next.js on Vercel with Clerk and hosted libSQL. This is a deliberate implementation change, not a claim that the proposed Python pipeline exists. A separate analysis service remains possible behind the model-call boundary when evaluation, audio processing, or training workloads justify it.

## Next release: a dependable pilot

1. Validate the rubric with independently reviewed role-plays. Record disagreements and decide acceptable error levels before advertising AI quality.
2. Complete live provider and tracing verification using owner credentials. Add evaluated fixtures, structured feedback, and release comparisons tied to prompt, rubric, and model versions.
3. Verify implemented team membership, invitations, role enforcement and offboarding in the hosted environment. Extend pilot admission to customer self-service only after policy is agreed.
4. Deploy and monitor the implemented persistent queue worker. Verify cancellation, duplicate dispatch and lease interruption with the live provider. Automatic paid retries remain deliberately disabled; add external alerts and measured throughput capacity.
5. Consultation pagination, workspace insights, coordinator aggregates and full-workspace follow-up selection are implemented. Measure hosted query latency and storage growth on representative consented data before larger pilots. Queue CSV exports reflect the displayed page.
6. Establish backup and restore procedures, retention automation, incident response, accessibility and browser regression checks, and load testing.

## Commercial release

Add checkout, subscriptions, usage accounting, support and customer onboarding after pricing and entitlements are agreed. Configure a public marketing domain separately from authenticated customer access. Review the hosting/runtime choice for the expected support commitments; live authentication, storage, backup and operational checks remain required.

Real consultation recordings require a separate ingestion design covering permission, transcription quality, speaker attribution, access, retention, and provider processing. A source label alone cannot detect sensitive content. Do not describe this release as ready for real patient data.

## RAG development

The present system retrieves approved passages by keyword, passes them to the model, and verifies returned source IDs and quoted spans. This is retrieval-augmented generation. It does not yet use embeddings, a vector database, semantic reranking, or document connectors.

Measure retrieval failures before adding infrastructure. A sensible next increment is a judged question/source set, followed by hybrid lexical and vector retrieval if it improves source coverage. Then add document versioning, ingestion status, source freshness, citation-level review, and evaluation of whether the answer actually follows from the cited source. A matching quote proves the passage exists; it does not prove the advice is correct.

## Release decision

Do not call the product commercially ready because the build passes. A release needs evidence that target users can complete the workflow, that evaluations meet the agreed bar, and that access, operations, support, and data obligations match the customer contract. This repository provides the implemented foundation and a concrete path to that decision.

The active implementation sequence and completion evidence are tracked in [Iteration plan](ITERATION_PLAN.md).

The team/queue/evaluation/operations increment is detailed in [Product reliability](PRODUCT_RELIABILITY.md); implementation is not a claim of completed live acceptance.

[The pilot workflow sprint](PILOT_WORKFLOW_SPRINT.md) adds bulk CSV import, full-workspace consultation search, portable evidence exports and calendar-file downloads. Native customer-app integrations require a buyer use case and credentials.

[The team workflow iteration](TEAM_WORKFLOW_ITERATION.md) adds reviewer ownership, UTC deadlines, versioned handoffs, the practice inbox, all-time aggregate insights and transcript search/copy. Apply migration 0005; live hosted verification remains credential-dependent.

[Storage and query optimization](STORAGE_QUERY_OPTIMIZATION.md) adds migration 0006, duplicate-content prevention, an owner storage inventory and paginated follow-up discovery. The [architecture diagrams](ARCHITECTURE.md) describe the current implementation. Local synthetic query measurements do not establish hosted capacity or production latency.

[Review and operational recovery](REVIEW_OPERATIONS_ITERATION.md) adds assessment comparisons, full analysis history, preservation of open drafts and extra evidence, confirmed-write recovery and malformed-measurement fallback. Persistent drafts across browser reloads and automated browser regressions remain follow-up engineering work.

[Architecture, query and audit updates](ARCHITECTURE_QUERY_ITERATION.md) refresh both diagrams and add migration 0007 for bounded operational reads and owner audit inspection. Local query-plan evidence does not establish hosted performance or commercial readiness.
