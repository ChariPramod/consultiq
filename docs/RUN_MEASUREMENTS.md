# Analysis run measurements

This increment records analysis timings and provider-reported token counts in private workspace job history. It helps distinguish time waiting for the model from time validating and saving a result. It does not establish a latency benchmark or calculate an invoice.

## Where to find them

Open **Workspace settings → Recent analysis runs** after an automated assessment or coaching request finishes. Each run includes its ID, status, failure code when applicable, and available measurements. Match the run ID to the existing LangSmith `job_id` metadata when tracing is enabled.

Older runs, interrupted processes and in-progress requests can lack measurements. The UI explicitly marks them unavailable. Missing usage means unknown, not zero. A provider-reported zero remains zero.

## Definitions

| Field | Meaning |
| --- | --- |
| `schema_version` | Version of the stored measurement shape |
| `total_ms` | Elapsed analysis interval after job admission through generation, validation and result persistence |
| `model_ms` | Time awaiting the model adapter, including response reading and output parsing, even if it fails |
| `validation_save_ms` | Post-model validation and result persistence interval, when reached |
| `input_tokens` | Provider-reported uncached input token count, or null |
| `output_tokens` | Provider-reported output token count, or null |

Timers use a monotonic clock. The total excludes initial record/rubric loading, coaching source retrieval, trace flushing and the final job update. It is not end-to-end HTTP latency, first-token latency, or a voice turn metric. Stage durations are not a claim of model speed across representative workloads.

Token fields are validated as nonnegative safe integers. The adapter observes usage before validating the generated answer, so an invalid or truncated answer can still retain reported usage. When the provider does not supply a usable envelope, counts remain unknown. No usage is estimated from text length.

Anthropic separates uncached input, cache creation and cache reads. This increment stores uncached input and output counts only; it is not a complete billing ledger, and must not be used to infer a bill when caching or other metered features apply. See the [Messages API usage reference](https://platform.claude.com/docs/en/api/http/messages).

## Persistence and privacy

An additive migration adds nullable `telemetry_json` to `analysis_jobs`. Existing records remain valid with null measurements. Reads and updates are scoped to the authenticated workspace. Deleting a consultation still removes its jobs; an in-flight result cannot recreate the deleted job.

Measurements contain numeric durations, numeric token counts and a schema version. They do not include prompts, transcript text, retrieved passages, generated answers, or raw provider errors. LangSmith content hiding remains unchanged. The existing recent-run limit applies; this is not an all-time usage dashboard.

A process crash or database failure may prevent a measurement from being saved. Recorded counts cover observed requests only, including failures where usage was available. Reconcile against provider billing before financial reporting. Analysis still runs synchronously; this change does not introduce a durable queue or retries.

## Local and hosted operation

Apply new migrations with `npm run db:migrate` before running this version locally. Deployments must include the new generated migration before the new Worker is used. Never rewrite the earlier migration. No provider keys are required to run the automated test suite.

To verify real operation with approved role-plays, configure the provider, publish the approved rubric, run an assessment and inspect the saved measurements. Compare the reported token counts with the corresponding provider response or account tooling. Then inspect a controlled failure. Live provider verification remains pending until configured credentials and approved inputs are available.

## Next work

Add separate retrieval and queue timings when those stages move inside the durable job lifecycle, model/prompt provenance on every attempt, cache-aware usage accounting, and retrieval trace spans. Use the offline evaluator alongside measurements when comparing models; a faster invalid answer is not a successful optimization.

Nested model and validation/save traces are now implemented separately; see [Tracing](TRACING.md). They do not change the persisted measurement definitions above.
