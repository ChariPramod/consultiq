# Iterative execution plan

Updated: September 21, 2026. This plan continues the implemented text-review product and the [research roadmap](DATA_CLOUD_MARKET_AND_BUILD_STRATEGY.md). It records planned work separately from completed work. It does not authorize fabricated rubric anchors, customer data or performance claims.

## Iteration A: measurable quality and safe failure

Status: implemented and locally verified.

Deliver a reproducible offline assessment evaluation command using independent references; preserve abstention and missing-denominator information. Add provider HTTP failure coverage and bounded response consumption. Close the race where a deleted knowledge source can be copied back into a coaching result after deletion while generation was in flight.

Why first: every later feature depends on knowing whether results are valid and whether failures preserve records correctly. These improvements need no new paid accounts or owner-authored anchors.

Work ownership: the primary agent owns provider handling, integration, documentation and release checks. An evaluation subagent owns the offline evaluator and its tests/documentation. A reliability subagent owns the coaching persistence race and API regressions. Review finished changes independently before committing.

Exit criteria: meaningful regressions pass; aggregate evaluation output omits source text; undefined metrics remain null; no stale coaching is persisted after source deletion; TypeScript, lint and production build pass. Live provider quality and LangSmith delivery remain credential-dependent.

Completed: the evaluator and its runnable engineering fixture are documented in [Evaluation](EVALUATION.md). The provider adapter now limits streamed response bytes and sanitizes body-read failures. Coaching persistence checks the call and all retrieved/cited sources atomically, including uncited model context. No schema migration was needed.

Verification: API race tests, provider-adapter tests and evaluator tests passed; the full `npm run check` gate passed. A separate read-only subagent reviewed the changes without finding a blocking issue. The CLI was exercised on its explicitly synthetic fixture and produced an aggregate, hash-bound report. These results verify engineering behavior, not model quality. No new hosted deployment was performed for this source increment.

## Iteration B: observed live analysis

Status: persistent run measurements and nested model/validation spans implemented; live verification pending.

The current increment adds private per-run timings and provider-reported uncached input/output counts, displayed in workspace settings. Failed requests preserve counts when available; old or unobserved values remain unknown. The additive migration and measurement boundaries are documented in [Run measurements](RUN_MEASUREMENTS.md).

Extend stage timings to retrieval, add cache-aware provider usage accounting and a bounded live smoke workflow on approved role-plays. Link run IDs to review provenance and export an evaluation comparison tied to model, prompt, rubric and dataset versions.

Dependency: owner API configuration and independently reviewed examples for actual quality results. Engineering can prepare telemetry contracts first. Do not invent reference scores or treat engineering fixtures as a dental benchmark.

Exit criteria: a measured run explains cost, latency, failures and evidence rejection without exposing transcript content in logs; reviewer labels support an honest quality comparison.

The tracing increment adds separate model and validation/save spans, empty content payloads, fixed failure codes, and delivery failure isolation. No schema change is needed. Live delivery and quality evaluation remain pending; see [Tracing](TRACING.md).

## Iteration C: recoverable processing

First prerequisite implemented: reject late AI results after job interruption and preserve terminal job state. This is an active-job persistence guard, not a durable queue. Full background processing remains pending.

Add durable queued attempts, deduplication, cancellation semantics, bounded retry policy and reconciliation for uncertain provider results. Establish separate staging and verify deployment/migration/restore procedures. Extend access tests before customer team support.

Exit criteria: deliberate processor interruption is recoverable, retries do not silently duplicate records, and ambiguous paid-provider completion is visible rather than promised exactly once.

## Iteration D: recorded role-play audio

Add private object storage, upload validation, one transcription adapter, speaker-role review and immutable transcript versions. Use a reviewed audio dataset to measure critical-word errors and speaker confusion.

Dependency: approved human role-play recordings and storage/retention decisions. Real patient ingestion remains outside current scope until its readiness gates are met.

## Iteration E: useful coaching and voice

Add reviewer adjudication, a focused practice assignment and held-out transfer evaluation. Then implement one browser voice framework, replay-based turn detection tests, generation cancellation and interruption metrics. Keep live assistant experiments separate from autonomous scheduling.

Exit criteria: reviewers complete the review-to-practice workflow; voice behavior has measured latency and interruption tradeoffs rather than unverified targets.

## Working agreement

Finish and verify each increment before broadening it. Preserve existing interfaces and UI primitives. Keep private source/access settings. New infrastructure, domain standards and measured results must be documented when they actually exist. Record credential or data dependencies without treating them as reasons to stop independent engineering work.

## Latest verification

Nested tracing: all 45 tests and the complete `npm run check` gate passed locally. Independent review found no blocking issues. No new schema migration or hosted deployment was performed. The next independent engineering priority is durable attempt processing; first specify admission, cancellation, uncertain provider completion and retry rules, then implement and exercise interruption recovery before deployment.
