# Product direction

ConsultIQ should help a training lead review consultation conversations consistently and give coaching that can be checked against evidence. The proposed initial buyer is a dental training team using coordinator role-plays. This is a product hypothesis to validate with the owner and design partners.

The product promise is reviewable coaching. It is not a claim that conversation scores predict treatment acceptance, revenue, or clinical quality.

## Current release

| Capability | Current state |
| --- | --- |
| Product landing page | Implemented, with clearly labeled illustrative content and working workspace links |
| Private workspace and persistence | Implemented with Sites identity and D1 |
| Transcript import and human review | Implemented for role-play and synthetic transcripts |
| Rubric governance | Owner-authored anchors, explicit approval, immutable published versions |
| Automated assessment | Implemented; provider credentials and approved rubric required |
| Evidence validation | Implemented; invalid quote support cannot retain a numeric score |
| RAG coaching | Implemented with approved-document keyword retrieval and checked citations |
| LangSmith | Nested model and validation/save tracing implemented, optional, content excluded |
| Coaching review and practice | Implemented in the private workspace with pinned human-reviewed comparisons |
| Customer organizations and billing | Pending |
| Audio, transcription, real patient data | Pending and outside current ingestion scope |
| Offline evaluation infrastructure | Implemented; supplied references required, no validated domain benchmark |
| Predictive outcome models and model-quality benchmarks | Pending; no performance claims |

## Why build on this code

The interface has become the front end of a persistent application. Shared UI components provide consistent dialogs, tables, tabs, forms, and navigation. Domain validation and storage sit behind the API, so changing the UI cannot bypass evidence or workspace checks.

The original plan proposed a separate Python service and Postgres. The current Sites deployment uses a TypeScript Worker and D1 so the application can run with durable storage on its existing host. This is a deliberate implementation change, not a claim that the proposed Python pipeline exists. A separate analysis service remains possible behind the model-call boundary when evaluation, audio processing, or training workloads justify it.

## Next release: a dependable pilot

1. Validate the rubric with independently reviewed role-plays. Record disagreements and decide acceptable error levels before advertising AI quality.
2. Complete live provider and tracing verification using owner credentials. Add evaluated fixtures, structured feedback, and release comparisons tied to prompt, rubric, and model versions.
3. Implement the agreed customer access model: organizations, membership, invitations, role-based access, and offboarding. Test every resource and retrieval operation across organizations.
4. Move long-running analysis to a durable queue with retry policy, cancellation, idempotency, and operational alerts. The current job table records synchronous requests; it is not a background queue.
5. Add pagination and aggregated queries before exceeding the current pilot limits. The UI reports when records are limited; exports reflect loaded records.
6. Establish backup and restore procedures, retention automation, incident response, accessibility and browser regression checks, and load testing.

## Commercial release

Add checkout, subscriptions, usage accounting, support and customer onboarding after pricing and entitlements are agreed. Configure a public marketing domain separately from authenticated customer access. Review the hosting/runtime choice for the expected support commitments; the current framework is a beta release.

Real consultation recordings require a separate ingestion design covering permission, transcription quality, speaker attribution, access, retention, and provider processing. A source label alone cannot detect sensitive content. Do not describe this release as ready for real patient data.

## RAG development

The present system retrieves approved passages by keyword, passes them to the model, and verifies returned source IDs and quoted spans. This is retrieval-augmented generation. It does not yet use embeddings, a vector database, semantic reranking, or document connectors.

Measure retrieval failures before adding infrastructure. A sensible next increment is a judged question/source set, followed by hybrid lexical and vector retrieval if it improves source coverage. Then add document versioning, ingestion status, source freshness, citation-level review, and evaluation of whether the answer actually follows from the cited source. A matching quote proves the passage exists; it does not prove the advice is correct.

## Release decision

Do not call the product commercially ready because the build passes. A release needs evidence that target users can complete the workflow, that evaluations meet the agreed bar, and that access, operations, support, and data obligations match the customer contract. This repository provides the implemented foundation and a concrete path to that decision.

The active implementation sequence and completion evidence are tracked in [Iteration plan](ITERATION_PLAN.md).
