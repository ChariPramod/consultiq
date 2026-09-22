# Presenting ConsultIQ

## What is ready to present

ConsultIQ has a public landing page, a public product tour, an implemented authenticated review application, source code, automated tests and automatic Vercel deployments. It is an engineering portfolio and pilot foundation. It is not yet a validated commercial product.

- Website: https://consultiq-ecru.vercel.app
- Product tour: https://consultiq-ecru.vercel.app/tour
- Source: https://github.com/ChariPramod/consultiq

The tour contains a clearly labeled, authored synthetic conversation. Its evidence checker calls the same `validateEvidence` function as production assessment validation. The remaining panels explain the implemented workflow; they do not call AI, retrieve real documents, save reviews or create practice assignments. Tour content does not enter workspace storage. There are no invented customers, numeric rubric anchors, benchmark results or revenue claims.

## A thirty-second explanation

“ConsultIQ helps dental training teams review consultation conversations and give feedback they can check. A reviewer imports a written role-play, assesses it against their own rubric, and attaches the exact words behind each assessment. Optional AI can suggest coaching grounded in approved training material. People review that advice and connect it to practice and follow-up.”

## A five-minute walkthrough

1. **The problem — 30 seconds.** Explain the product hypothesis: training leads need consistent, traceable conversation reviews. Ask whether this matches the audience's experience; do not claim customer validation we have not done.
2. **The conversation — 45 seconds.** Open `/tour`. Read the short synthetic role-play. Explain why source words must stay available. No numeric score is assigned without the owner's rubric.
3. **Evidence and failure — 90 seconds.** Open Evidence and click Check quote. Show the supported quote. Select the patient turn and check again: a correct quote attached to the wrong turn is rejected. Click Try unsupported claim, then Check quote. Explain that unsupported scores remain unscored in the application. Reset the example. Text matching is necessary evidence, not proof of clinical correctness or semantic quality.
4. **Coaching and human review — 60 seconds.** Show Guidance and Human review. Explain the real application's approved-source retrieval, citation validation, review history and practice workflow. Say explicitly that these panels illustrate the workflow and are not live AI output.
5. **Engineering and limits — 45 seconds.** Show the source and test workflow. Explain private workspace boundaries, append-only revisions, stale-save rejection, atomic saves, interrupted-job guards and sanitized error handling. State what still needs real-world verification.
6. **Next step — 30 seconds.** Ask the audience to evaluate a concrete workflow or discuss one technical decision. For a buyer, seek feedback on review usefulness; for a startup hiring conversation, explain a failure case and the test that guards it.

## If asked about architecture

| Part | Plain-language explanation |
| --- | --- |
| Next.js + TypeScript on Vercel | The interface and server API live in one application with typed boundaries. |
| Clerk + explicit user allowlist | Verified sign-in determines who may enter; signing up alone does not grant access. |
| libSQL/Turso | Persistent SQLite-compatible storage, atomic writes and workspace-scoped queries. |
| Assessment validation | Quoted evidence must exist in the cited transcript turn; unsupported scores cannot survive validation. |
| RAG | Keyword retrieval over approved text supplies source passages; returned citations are checked. No embeddings or semantic reranking yet. |
| LangSmith | Optional metadata-only tracing for model and validation/save stages. No raw transcripts in these traces. The model still receives content necessary for analysis. |
| Reliability | No automatic paid retries; stale saves conflict, revisions append, cleanup cannot mask successful saves. Analysis is still synchronous. |

Good technical examples to discuss: `lib/evidence.ts`, `server/repository.ts`, `server/runtime.ts`, `tests/api.test.mjs`, `tests/runtime.test.mjs`. Automated tests verify specified behavior, not customer value, clinical quality or full production reliability.

## What must happen before presenting a live saved-data workflow

1. Owner configures Clerk, exact permitted user IDs and Turso credentials; runs migrations on the intended database. Run `npm run doctor`, then redeploy. A passing doctor report is not a live authentication check.
2. Owner provides an approved rubric and a permitted synthetic/role-play transcript. Do not fabricate rubric anchors to complete a presentation.
3. Rehearse sign-in, import, save/reload, a human assessment, a stale-save conflict, approved-source search and a practice follow-up. Test cross-user isolation with two permitted users.
4. To present AI: configure the model and optional LangSmith, use approved synthetic input, inspect quote/citation validation and show a human review. Keep manual review as the fallback if the provider fails. Do not imply the public tour is a live model response.
5. Keep credentials and private records out of screen sharing. If cloud setup is unavailable, use the explicitly labeled tour and explain the limitation. Do not bypass authentication for a presentation.

## What remains beyond presentation

Independently labeled evaluation data and judged retrieval cases; customer interviews; shared organizations/roles; durable background jobs; backup/restore exercises; pagination and load tests; accessibility/browser regression coverage; pricing and billing. Audio ingestion, transcription, live turn detection and real patient data are separate unimplemented workstreams.

A presentation can explain the product and demonstrate its evidence rules now. Calling the whole product finished requires the live acceptance checks and release gates in [PRODUCT_PLAN.md](PRODUCT_PLAN.md) and [DEPLOYMENT_RELIABILITY.md](DEPLOYMENT_RELIABILITY.md).

## Verification for this increment

`npm run check` passed: 79 automated tests, TypeScript, lint and production build. Existing evidence tests exercise supported, fabricated and wrong-turn quotes using the same validator imported by the tour. Production HTTP checks confirmed the tour and workspace fallback links render. Desktop browser inspection confirmed the layout and step content; a complete click-through and mobile/accessibility review remain pending because desktop automation was unreliable. A development hydration warning identified browser-extension-injected HTML attributes; no application suppression was added.
