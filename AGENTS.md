# ConsultIQ

Read `README.md` for setup and `docs/IMPLEMENTATION.md` before changing API, persistence, assessment or retrieval behavior. `docs/PRODUCT_PLAN.md` is the current scope; original root planning documents are historical inputs, not claims of implemented Python or training pipelines.

Preserve owner-authored material. Do not write or change `docs/scoring_guide.md`, `docs/rubric_design.md`, `docs/what_the_rubric_cannot_see.md`, or `consultiq/scoring/prompts/` without an explicit owner request. Rubric anchors must come from the owner, never fabricated defaults.

Every data operation, including retrieval, must remain scoped to the authenticated workspace. Numeric scores require validated quotes from the cited transcript turn. Assessment edits append revisions; stale saves must not overwrite newer work. Generated coaching needs validated source citations and human review.

Use existing UI primitives in `components/ui/`. Keep sample content out of live workspace state. Label marketing illustrations. Do not invent customers, metrics, predictions or readiness claims.

For schema changes, update `db/schema.ts` and generate a new migration. Never rewrite applied migrations. For behavior changes, run meaningful tests plus `npm run check`. Document material limitations and credential-dependent checks accurately.

Never commit credentials or runtime data. Keep `.dev.vars`, `.env` and `.wrangler` ignored. Preserve private repository and Sites access unless the user explicitly requests another audience.
