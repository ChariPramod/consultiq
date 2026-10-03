# ConsultIQ

[Live application](https://consultiq-ecru.vercel.app) · [Product tour](https://consultiq-ecru.vercel.app/tour) · [Source repository](https://github.com/ChariPramod/consultiq)

The landing page is deployed on Vercel. Workspace authentication and persistent cloud storage still require the Clerk/Turso owner setup in [the migration guide](docs/VERCEL_MIGRATION.md).

ConsultIQ is a consultation review and coaching workspace for dental training teams. Reviewers can import a role-play transcript, assess it against an approved rubric, inspect supporting quotes, and record a revised human assessment. Coaching can retrieve approved training material and generate an answer with source citations.

The repository contains a premium product landing page and a persistent application. The original static interface has been replaced with database-backed workflows. This release is a private pilot foundation, with commercial release work explicitly tracked in [the product plan](docs/PRODUCT_PLAN.md).

## Start locally

Use Node matching `.nvmrc` and npm.

```sh
npm ci
cp .env.example .env.local
# Configure Clerk keys, allowed user IDs and DATABASE_URL in .env.local.
mkdir -p .local-data
npm run db:migrate
npm run dev
```

Open the local URL printed by the server. The landing page is at `/`; the application is at `/workspace`. Use Clerk sign-in with an account listed in CONSULTIQ_ALLOWED_USER_IDS to enter a private workspace. Model credentials are optional for manual review and library search.

For AI configuration, copy `.env.example` to `.env.local`, fill in server-side credentials, and restart the server. Never commit that file. See [operations](docs/OPERATIONS.md) before enabling external services.

```sh
npm run check
npm run doctor
```

`npm run check` runs automated tests, TypeScript, lint, and the production build. `npm run doctor` checks local environment configuration and database migration history without reading consultation records; it does not verify live Clerk sessions. Generate new database migrations with `npm run db:generate`, then apply them locally with `npm run db:migrate`.

## What is included

- A responsive landing page and application using shadcn/Base UI components.
- Personal and shared workspaces with owner/reviewer/viewer access, scoped transcripts, recorded outcomes, filtering, and CSV export.
- Owner-approved rubric versions and append-only assessment revisions.
- Side-by-side revision comparisons, preserved editing sessions and retained evidence citations.
- Quote validation against the cited transcript turn; unsupported scores remain unscored.
- Optional Claude analysis through a persistent queue, separate worker, cancellation, lease recovery and daily request limits.
- Saved analysis timings and reported input/output tokens, including available usage on failures.
- Full-workspace analysis history with filters, pagination and permission-aware cancellation.
- Approved document ingestion with duplicate-content prevention, keyword retrieval, and citation-validated RAG coaching.
- Append-only coaching decisions, manual practice assignments and pinned human-reviewed follow-up comparisons.
- Paginated follow-up search across the workspace and owner-only storage usage by area and table.
- Optional LangSmith tracing with separate model and validation/save stages; content and raw errors excluded.
- Offline assessment evaluation against independently supplied references, with coverage and abstention reporting.

There are no seeded customer records, fabricated performance metrics, or acceptance predictions. AI controls remain unavailable until configured. Real patient recordings, billing, semantic vector retrieval, and validated model-quality benchmarks are not implemented. Team invitations retain a deployment-level pilot allowlist. Worker hosting and live acceptance checks require configuration.

Evaluate a prepared dataset without provider calls:

```sh
npm run evaluate -- /absolute/path/to/dataset.json /absolute/path/to/new-report.json
```

See [the evaluation contract](docs/EVALUATION.md) for the input format, reference requirements and interpretation. The command computes an offline report; it does not generate predictions or certify model quality.

## Hosting migration

The runtime now targets official Next.js on Vercel, with Clerk authentication and a libSQL/Turso database. The previous Sites configuration is archived in `docs/legacy/sites-hosting.json`. Existing Sites data has **not** been transferred. See [Vercel migration and owner setup](docs/VERCEL_MIGRATION.md) for credentials, deployment, data transfer and verification steps.

## Presenting the project

Use the public `/tour` walkthrough to explain the workflow and exercise the actual quote validator against clearly labeled synthetic content. It makes no AI calls and saves no records. See [the presentation guide](docs/PRESENTATION_GUIDE.md) for a five-minute script, technical talking points and the remaining live-workflow checks.

## Team workflow

[Reviewer assignments, practice inbox, whole-workspace insights and transcript tools](docs/TEAM_WORKFLOW_ITERATION.md) are implemented. Apply migration 0005 before authenticated use of this release.

## Architecture and query improvements

The [overall architecture and query/response diagrams](docs/ARCHITECTURE.md) describe the current Next.js, Clerk, Turso and background-worker paths, including failure handling. Editable Mermaid sources and rendered SVGs are included.

[Storage and query optimization](docs/STORAGE_QUERY_OPTIMIZATION.md) documents the new indexes, atomic library deduplication, storage inventory, follow-up search and reproducible local query-plan measurements. Apply all pending migrations through **0006** before authenticated use. Existing documents, citation IDs and review history are preserved.

[Review comparison and operational recovery](docs/REVIEW_OPERATIONS_ITERATION.md) adds comparison tools, paginated analysis history, citation-preserving drafts and recovery for confirmed writes followed by failed refreshes. Malformed measurement records no longer block the dashboard. No additional migration is required.

## Pilot workflow additions

[Batch CSV import, the paginated review queue, evidence exports and calendar handoff](docs/PILOT_WORKFLOW_SPRINT.md) are implemented. These support a training-team pilot; native CRM/calendar synchronization and commercial readiness remain unverified.

## Product reliability

See [the team, background processing, evaluation and operations implementation](docs/PRODUCT_RELIABILITY.md). Apply migrations 0003 and 0004 before authenticated use of this release. The queue requires a supervised `npm run worker` process or secured scheduler; queuing a job alone does not execute it.

## Project documentation

- [Deployment reliability and prioritized unfinished work](docs/DEPLOYMENT_RELIABILITY.md)

- [Reviewed coaching and practice workflow](docs/LEARNING_WORKFLOW.md)
- [Workspace activity, UI components and recovery](docs/UI_COMPONENTS.md)
- [Detailed completed-work and owner handoff](docs/PROJECT_HANDOFF.md)

- [Current iteration plan](docs/ITERATION_PLAN.md)
- [Offline evaluation](docs/EVALUATION.md)
- [Analysis run measurements](docs/RUN_MEASUREMENTS.md)
- [Nested tracing and live verification](docs/TRACING.md)
- [Data, cloud, market research and next build](docs/DATA_CLOUD_MARKET_AND_BUILD_STRATEGY.md)
- [Your actions and decisions](docs/OWNER_ACTIONS.md)
- [Product direction and release gates](docs/PRODUCT_PLAN.md)
- [Architecture diagrams and request flows](docs/ARCHITECTURE.md)
- [Implementation and API contracts](docs/IMPLEMENTATION.md)
- [Storage, query measurements and rollout](docs/STORAGE_QUERY_OPTIMIZATION.md)
- [Setup, operation, and deployment](docs/OPERATIONS.md)
- [Validation and known limits](docs/VALIDATION.md)

The original planning documents remain at the repository root as historical design inputs. They describe Python, training, and predictive-model work that is not present in this implementation. The current implementation and outstanding work are documented above.
