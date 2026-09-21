# Owner actions

Engineering setup should not become homework for you. The remaining owner work is domain judgment, access to your accounts, approved source material, and commercial decisions. The application already supports importing material and recording reviews.

See [the detailed project handoff](PROJECT_HANDOFF.md) for the full completed-work inventory, concrete owner deliverables and remaining engineering.

## Required for a useful first review

- [ ] Choose the first buyer and workflow. Proposed starting point: a dental training lead reviewing coordinator role-plays. Confirm who reviews, who receives coaching, and what a successful session changes.
- [ ] Define and approve the rubric. Open **Review rubric**, enter the low, middle, and high anchors for every dimension, then publish. Use observable conversation behavior. Decide when a dimension should remain unsupported. The application does not invent these standards for you.
- [ ] Supply role-play or synthetic transcripts that you have the right to use. Open **Consultations → Import transcript**. Label each turn `Coordinator:` or `Patient:`. Include the coordinator and session date. Do not upload real patient data in this release.
- [ ] Have a domain reviewer assess the same transcripts independently. Capture disagreements and reasons. Human review works before any model account is connected.

## Required to turn on AI and RAG

- [ ] Create or select an Anthropic account with API access. Choose an available model and a spending limit. Add `ANTHROPIC_API_KEY` and `AI_MODEL` as server-side runtime settings following [operations](OPERATIONS.md). Do not send secret values in chat or add them to GitHub.
- [ ] Approve the training documents the product may use. Add them in **Knowledge library**, with clear titles. Only check approval after confirming their accuracy and your rights to use them. Start with current coaching guidance relevant to the pilot workflow.
- [ ] If you want tracing, create a LangSmith project, choose its region, and provide the server-side settings listed in [operations](OPERATIONS.md). Tracing is optional. It is already wired into the application; no additional application integration is needed to enable basic run traces.
- [ ] Run an agreed role-play through automated assessment and coaching. Confirm the saved rubric/model provenance, inspect every quoted passage, and check the corresponding trace. Live provider and LangSmith delivery still need this credential-dependent validation.

## Required before selling a pilot

- [ ] Recruit a design-partner training team and agree on the review workflow, scope, feedback cadence, support contact, and price. No pricing or customer endorsement has been invented on the landing page.
- [ ] Approve a held-out evaluation set and acceptance criteria with your domain reviewer. Decide what errors would make the product unsuitable. Keep evaluation examples separate from prompt/rubric iteration material.
- [ ] Supply the business name, domain, support email, billing entity, and approved product language for public launch.
- [ ] Decide whether the pilot needs shared teams. The current workspace belongs to one authenticated Sites user; customer organizations, invitations, and roles need additional engineering.
- [ ] Approve the data policy: allowed content, retention, deletion expectations, third-party processing, and access rules. Real patient data requires a separate readiness review and appropriate agreements before ingestion is enabled.

## Engineering work we can continue without delegating it to you

Run the implemented evaluation tooling once independent labels and criteria exist; add team membership and authorization once the customer access model is agreed; build retryable background processing; add monitoring, backups and restore verification; improve retrieval against measured failures; implement billing after the commercial model is decided. These are tracked in [the product plan](PRODUCT_PLAN.md).

You do not need to write the backend, wire the RAG pipeline, build the landing page, install LangSmith in the codebase, or create the source repository. Those are engineering deliverables in this change.
