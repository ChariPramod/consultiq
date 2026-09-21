# Analysis tracing

ConsultIQ records optional LangSmith traces for admitted assessment and coaching work. This increment makes model and validation/save stages separately inspectable and isolates trace delivery from business execution. It does not establish successful hosted delivery or a latency benchmark.

## Trace structure

```text
assess_consultation or grounded_coaching
  model_response
  validation_save (only if model processing succeeds)
```

The model span includes provider response reading and parsing. The validation/save span includes evidence or citation checks and persistence. Initial consultation/rubric loading, coaching retrieval, final job-state updates and trace delivery are outside these stage spans. A rejected provider answer can produce a failed model span; a rejected citation can produce a successful model span followed by a failed validation span. A failure does not imply that the provider did no billable work.

Match the parent `job_id` to **Workspace settings → Recent analysis runs**. The configured model is metadata, not proof of the provider's resolved model version. Token counts remain in the application's persisted measurements; these traces do not provide billing totals.

## Content boundary

The tracing module receives callbacks, not transcript or document arguments. It creates spans with empty inputs and outputs, fixed stage names and metadata. Callback return values are returned to the application without being attached to spans. Errors are mapped to an explicit allowlist of codes, with a generic fallback; raw messages and stacks are not sent to the tracing client. The HTTP writer sends only the constructed trace payload; automatic SDK environment capture is not used.

The design uses LangSmith's explicit trace hierarchy rather than automatic callback argument/result capture. See the official [custom instrumentation guide](https://docs.langchain.com/langsmith/annotate-code), [input/output privacy controls](https://docs.langchain.com/langsmith/mask-inputs-outputs), and [direct trace ingestion API](https://docs.langchain.com/langsmith/trace-with-api). Provider requests still contain the content needed for analysis; tracing privacy does not change provider processing.

## Failure behavior

Tracing is disabled unless both the explicit tracing flag and API key are configured. Only the documented US/EU endpoints are accepted. An invalid enabled endpoint is a configuration error before model execution.

Completed span delivery has a five-second wait budget and no automatic delivery retries. Trace failures produce a metadata-only warning. They do not replace a successful callback result, mask the original analysis exception or run the callback again. This is best-effort tracing: failed delivery and process interruption can lose traces. It is not a durable outbox or a background job system.

## Verification and owner actions

Automated tests use controlled trace clients and synthetic callbacks; no paid model calls or owner credentials are required. They exercise nesting, failures, content exclusion, disabled tracing, invalid configuration and delivery isolation. The complete project check remains `npm run check`.

For live verification, configure the server settings described in [Operations](OPERATIONS.md), using approved role-play inputs:

1. Run an assessment and coaching request; locate both traces by their application job IDs.
2. Inspect the children, timing order and empty inputs/outputs. Confirm errors contain only application codes.
3. Verify a controlled validation failure in staging, and confirm that no unsupported result was saved.
4. Temporarily use an invalid tracing key in staging. Confirm that analysis still saves once and that tracing failure is reported without raw error details. Restore the correct key afterward.

Live verification, a representative latency distribution, trace retention settings and operational alerts remain pending. No new owner data or credentials are needed for the implemented engineering tests. Durable analysis processing is the next infrastructure increment; it needs explicit attempt and retry semantics before deployment.
