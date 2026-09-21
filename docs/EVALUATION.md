# Offline assessment evaluation

This increment provides a reproducible local evaluator for already-produced assessment predictions and independently supplied reference scores. It calls the same `prepareAssessment` function used before saving a review. It does not call a model, read a workspace, export customer data, train a model, or establish product accuracy.

## Run

Use the project's Node version. The second argument must be a new output file; existing files are never overwritten. Its parent directory must exist.

```sh
node --experimental-strip-types scripts/evaluate.mjs fixtures/evaluation/synthetic-engineering.json /tmp/consultiq-engineering-report.json
```

The committed fixture is explicitly synthetic engineering material. Its arbitrary scores exercise arithmetic, abstention and evidence validation. They are not owner rubric anchors or an independently rated domain benchmark. A passing fixture says nothing about dental coaching quality.

For a real evaluation, put an approved dataset and generated reports outside the repository in an access-controlled location. Do not commit transcripts, human references or production-derived reports. The CLI makes no network requests. It limits input file size, creates a new report with owner-only file permissions where supported, and does not print record contents on validation failures. These protections do not replace encrypted storage or the owner's data policy.

## Input contract

The full runnable JSON example is in `fixtures/evaluation/synthetic-engineering.json`. Required fields:

| Field | Meaning |
| --- | --- |
| `schema_version` | Contract version, currently `1` |
| `metadata.dataset_version` | Opaque frozen dataset release identifier |
| `metadata.rubric_version` | Owner-approved rubric version used by prediction and reference generation |
| `metadata.prompt_version` | Exact prediction prompt release identifier |
| `metadata.model_version` | Provider model identifier or explicit engineering stub identifier |
| `metadata.reference_version` | Human labeling/adjudication release identifier |
| `metadata.reference_source` | `independent_human` or `synthetic_engineering` |
| `metadata.split` | `development` or `held_out` |
| `cases` | Non-empty bounded list, with one unique opaque `id` per case |
| `cases[].turns` | Transcript order, each with `role` (`Coordinator` or `Patient`) and single-line `text`; both roles required |
| `cases[].prediction` | Every dimension exactly once, using the existing assessment input contract |
| `cases[].reference` | Every dimension exactly once, with `dimension` and `score` |

Each prediction dimension has `dimension`, `score`, `rationale`, `coaching_note` and `evidence`. Evidence entries contain `turn_index` and `span`. Dimension indices follow `DIMENSIONS` in `lib/product.ts`. Scores are integers from one to five or `null`. References do not contain predicted rationales or copied model judgments. They must be supplied independently; the evaluator cannot verify the claimed provenance.

Version and case identifiers accept only letters, digits, dots, underscores, hyphens and slashes, starting with a letter or digit. Use opaque identifiers without names, emails or customer details. Version metadata is included in the output, so it must be safe to retain. A dataset groups one model/prompt/rubric/reference release; compare separate reports for different releases.

Malformed predictions, duplicated dimensions, missing references, duplicate case IDs and invalid transcripts fail the entire run. Unsupported quotes are an expected assessment outcome: the shared validator rejects those spans and removes any numeric score with no valid evidence. Those cases remain in the denominator rather than disappearing from the report.

## Reading the report

Reports contain only version metadata, input SHA-256, aggregate counters and per-dimension aggregates. They omit case IDs, transcript turns, evidence text, rationales and coaching notes. The hash binds a report to exact input bytes; formatting changes alter the hash. Identical inputs and evaluator code produce identical reports. Record the repository commit alongside an evaluation release because the shared assessment validator can evolve.

- `prediction_coverage`: supported numeric predictions divided by all case-dimension opportunities.
- `reference_coverage`: numeric human references divided by all opportunities.
- `mutually_scored`: opportunities with both a validated numeric prediction and numeric reference.
- `mean_absolute_error`: sum of absolute score differences divided by `mutually_scored`.
- `exact_numeric_match_rate`: identical numeric scores divided by `mutually_scored`.
- `prediction_abstained_reference_scored`: missing supported prediction despite a numeric reference.
- `prediction_scored_reference_abstained`: supported prediction where the reference abstains.
- `both_abstained`: both sides have null scores, recorded separately from numeric agreement.
- `rejected_evidence_spans`: spans rejected by the shared quote validator.
- `numeric_predictions_suppressed`: proposed numeric scores changed to null because no quote validated.

Numeric metrics are `null` when their denominator is zero. Joint abstention is never counted as a correct numeric answer. Always inspect coverage and disagreement with numeric error; a model could lower reported numeric error simply by abstaining on difficult cases. Aggregate scoring weights each case-dimension equally and does not estimate uncertainty or account for correlated cases.

## Building an honest benchmark

1. The owner approves the rubric and defines what abstention means for each dimension.
2. Obtain permission for the evaluation material and retain only what is necessary. Start with approved role-plays.
3. Freeze a held-out split before prompt tuning. Split related calls, scripts, patients and coordinator scenarios together to avoid near-duplicate leakage across development and held-out sets.
4. Have reviewers rate without seeing model outputs. Preserve individual judgments separately, resolve disagreements using the approved rubric, and version the resulting reference set.
5. Produce model predictions separately with recorded model, prompt and rubric versions. Keep held-out references out of prompts, retrieval documents and few-shot examples.
6. Run the evaluator and review coverage, support disagreement and per-dimension errors together. Investigate failures using the restricted input dataset, since the report intentionally contains no per-case content.
7. Set release thresholds with the owner after establishing reference quality and a measured baseline. Do not tune repeatedly against the frozen test set; use development data and reserve a fresh test release when needed.

An independent-human label in metadata is a declaration, not a provenance guarantee. The harness does not check annotator agreement, rubric semantics, transcript transcription quality, bias slices, statistical significance, RAG relevance, latency or live voice turn handling. Verbatim evidence presence does not prove that a quote semantically supports a score. These require further evaluation work and human judgment.

## Validation

`tests/evaluation.test.mjs` exercises abstention denominators, numeric errors, quote rejection, malformed inputs, aggregate-only output, deterministic results and CLI overwrite/error behavior. Run `npm test` or the normal `npm run check` gate. No paid model or LangSmith credentials are required for these tests.
