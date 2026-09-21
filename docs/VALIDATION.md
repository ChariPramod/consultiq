# Validation

The automated suite exercises the production domain modules and API handler. API tests apply the generated migrations to SQLite, issue authenticated requests, and check persisted state. The external model boundary is replaced with controlled responses; repository and validation code are not mocked.

Coverage includes workspace isolation, origin checks, rubric approval and versioning, append-only human reviews, stale-save rejection, quote validation, unsupported scores, missing-provider behavior, approved-source retrieval, citation rejection, deletion, transcript validation and CSV formula neutralization.

Run `npm run check` for tests, TypeScript, lint and the production build. CI runs this command from a clean dependency installation. Test results verify application rules; they do not measure model accuracy or prove production readiness.

Local HTTP checks cover landing and workspace responses, rejection of anonymous API access, and authenticated creation, retrieval and deletion through the Sites development sign-in flow. Temporary verification records were removed. Browser interaction, visual accessibility and cross-device regression testing have not been performed in this change.

No live model or LangSmith credentials were available during implementation. Automated scoring and RAG were exercised with controlled provider responses. Live provider authentication, model output quality, latency, billing, trace delivery and hosted authenticated workflow checks remain deployment-specific verification work.

There is no model benchmark, held-out evaluation result, acceptance prediction, clinical validation or claimed commercial performance. Owner-approved examples and success criteria are prerequisites for that evaluation work.

## Dependency review

The dependency audit at implementation completion reported no advisories in production dependencies (`npm audit --omit=dev`). Development tooling still reports advisories through Drizzle Kit's legacy esbuild loader and Miniflare's sharp dependency. The latest compatible Wrangler, Cloudflare plugin and Vite releases were installed; the audit's suggested forced downgrades were not applied. These tools are not packaged as application runtime dependencies. Avoid exposing development tooling to untrusted traffic, and revisit upstream fixes before the next release.

## Iteration A additions

Regressions now cover deletion of cited and uncited source passages during generation, deletion of the consultation during generation, and foreign source identities at coaching persistence. Provider-adapter tests inject HTTP responses for streaming limits, transport/body failures, non-success statuses and invalid envelopes. Offline evaluator tests check abstention-aware denominators, shared quote validation, malformed inputs, reproducibility and report-content exclusions. These tests use engineering inputs, not dental quality labels. No successful live inference or trace delivery was established by this iteration.

## Run measurement increment

Added regression coverage for successful and failed run measurements, missing or malformed usage, nullable legacy jobs, and workspace-scoped measurement access. Provider usage is supplied through controlled adapter responses; tests do not establish real API latency or model quality. A generated additive migration preserves existing records with null telemetry.

Local verification on 2026-09-20: all 38 tests, TypeScript, lint and production build passed through `npm run check`; the local migration runner confirmed no outstanding migrations. Independent code review found no blocking issues. This increment has not been deployed to the hosted workspace or verified with a live provider or browser.

## Nested tracing increment

Local verification on 2026-09-20: all 45 tests, TypeScript, lint and production build passed through `npm run check`. Seven tracing regressions cover hierarchy, empty content payloads, fixed failure codes, model-success/validation-failure attribution, disabled and invalid configuration, delivery/finalization failure isolation, and a hung delivery deadline. The HTTP adapter is tested with controlled responses and makes no automatic retry. Independent review found no blocking issues.

No schema migration was required. No live service request, hosted deployment or browser verification was performed for this backend increment. The credential-dependent checks and remaining operational limits are documented in [Tracing](TRACING.md).
