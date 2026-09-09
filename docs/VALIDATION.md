# Validation

The automated suite exercises the production domain modules and API handler. API tests apply the generated migrations to SQLite, issue authenticated requests, and check persisted state. The external model boundary is replaced with controlled responses; repository and validation code are not mocked.

Coverage includes workspace isolation, origin checks, rubric approval and versioning, append-only human reviews, stale-save rejection, quote validation, unsupported scores, missing-provider behavior, approved-source retrieval, citation rejection, deletion, transcript validation and CSV formula neutralization.

Run `npm run check` for tests, TypeScript, lint and the production build. CI runs this command from a clean dependency installation. Test results verify application rules; they do not measure model accuracy or prove production readiness.

Local HTTP checks cover landing and workspace responses, rejection of anonymous API access, and authenticated creation, retrieval and deletion through the Sites development sign-in flow. Temporary verification records were removed. Browser interaction, visual accessibility and cross-device regression testing have not been performed in this change.

No live model or LangSmith credentials were available during implementation. Automated scoring and RAG were exercised with controlled provider responses. Live provider authentication, model output quality, latency, billing, trace delivery and hosted authenticated workflow checks remain deployment-specific verification work.

There is no model benchmark, held-out evaluation result, acceptance prediction, clinical validation or claimed commercial performance. Owner-approved examples and success criteria are prerequisites for that evaluation work.

## Dependency review

The dependency audit at implementation completion reported no advisories in production dependencies (`npm audit --omit=dev`). Development tooling still reports advisories through Drizzle Kit's legacy esbuild loader and Miniflare's sharp dependency. The latest compatible Wrangler, Cloudflare plugin and Vite releases were installed; the audit's suggested forced downgrades were not applied. These tools are not packaged as application runtime dependencies. Avoid exposing development tooling to untrusted traffic, and revisit upstream fixes before the next release.
