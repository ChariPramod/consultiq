> Hosting update: the Vercel migration supersedes Sites/D1 and `.dev.vars` instructions below. Follow [VERCEL_MIGRATION.md](VERCEL_MIGRATION.md) and `.env.example` for current setup. Earlier completion evidence remains historical.

# Operations

## Local setup

Use the Node version in `.nvmrc`. Run `npm ci`, `npm run db:migrate`, and `npm run dev`. Local D1 state lives under `.wrangler/` and is ignored by Git. The local sign-in helper is provided by Sites development tooling.

Copy `.dev.vars.example` to `.dev.vars` for local server configuration. Restart development after editing it. Never use a `NEXT_PUBLIC_` variable for these values.

| Setting | Purpose |
| --- | --- |
| `ANTHROPIC_API_KEY` | Server-side provider credential |
| `AI_MODEL` | Model identifier available to that account; no model is silently selected |
| `MAX_AI_RUNS_PER_DAY` | Per-workspace analysis request limit; validated defaults are in `server/config.ts` |
| `LANGSMITH_TRACING` | Set `true` only when tracing is intended |
| `LANGSMITH_API_KEY` | Server-side LangSmith credential |
| `LANGSMITH_PROJECT` | Project receiving ConsultIQ run traces |
| `LANGSMITH_ENDPOINT` | Supported US or EU endpoint matching the account |

For hosted operation, configure these through Sites runtime environment settings, with credential fields treated as secrets. Local `.dev.vars` is not uploaded with the build. The `DB` binding is managed through `.openai/hosting.json`; do not supply database credentials to the browser.

## Provider activation

Choose an available Claude model in the owner account and verify its current API access and spending controls. Set the key and model on the server, publish the runtime configuration as required by the host, and inspect **Workspace settings** for configuration readiness. Readiness indicates configuration presence, not a successful provider authentication check.

Publish an approved rubric. Import a role-play, select **Run AI assessment**, then inspect quotes, coverage, provenance and job history. Invalid or incomplete provider output must not produce a fabricated report. Manual review remains available when the provider is disabled or unavailable.

## LangSmith activation

Create a project, select the account region, and configure the settings above. Supported endpoints are `https://api.smith.langchain.com` and `https://eu.api.smith.langchain.com`. Enable tracing and run an assessment or coaching request.

Locate the `assess_consultation` or `grounded_coaching` run and match its `job_id` to the application job. Expand its `model_response` and, when reached, `validation_save` children. Confirm their ordering and inspect a controlled failure. A model failure should have no validation stage; a validation failure should leave a failed validation child and parent.

Confirm transcript, prompt, question, source and result content are absent from inputs, outputs and errors. Error fields contain fixed application codes, never raw exception messages or stacks. There is no UI switch to upload content. Token counts are available in application job history; LangSmith cost reporting and retrieval spans remain unimplemented.

Trace delivery is best effort with a five-second wait budget and no automatic delivery retries. A delivery failure logs only `tracing_delivery_failed` and the job ID, and does not change the analysis result. This is not a durable telemetry outbox: a process interruption or delivery outage can lose traces. Invalid endpoint configuration is rejected before model invocation. See [trace validation](TRACING.md) for the engineering checks and remaining live verification.

See the official [instrumentation guide](https://docs.langchain.com/langsmith/annotate-code) and [sensitive-data controls](https://docs.langchain.com/langsmith/mask-inputs-outputs). Live delivery must be verified with owner credentials before treating tracing as operational.

## Source and deployment

The GitHub repository is private. `main` contains application code, migrations, documentation and CI. GitHub Actions runs the same test, typecheck, lint and build sequence as `npm run check`; it does not deploy or require provider secrets.

The Sites project identifier is recorded in `.openai/hosting.json`. Build with `npm run build`, package validated `dist/` using the Sites packaging helper, push the exact committed source to the Sites source repository, save a version tied to that full commit SHA, and deploy the saved version with owner-only access. Do not make the site public just to expose the marketing page; customer access needs a separate release decision.

The production migrations are generated from `db/schema.ts` into `drizzle/` and copied into the deployment artifact. Never edit an applied migration. Generate a new migration for schema changes and check compatibility with existing records before deploying. A Worker rollback does not automatically undo schema or data changes.

## Operational limits and next work

- Establish and test backup/restore and retention procedures before storing customer material. Application deletion is not a guarantee of immediate erasure from host backups or third-party systems.
- Current deletion retains metadata-only audit events. There is no workspace self-service export/delete flow or retention scheduler.
- Model requests are synchronous and bounded by a timeout. Job records do not guarantee recovery after a process interruption. Add a durable queue for production workloads.
- The daily request cap is not a currency budget. Configure provider-side spending controls and implement usage accounting before paid tiers.
- Run `npm audit` and distinguish deployed dependencies from build tooling. Review advisory context and compatible updates; do not use forced dependency downgrades to hide warnings.
- Keep the development server bound locally. Do not use it as the production server.
- Keep role-play and synthetic content only until the real-data readiness work in the product plan is complete.
