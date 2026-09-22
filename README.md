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
- Private per-user workspaces, saved transcripts, recorded outcomes, filtering, and CSV export.
- Owner-approved rubric versions and append-only assessment revisions.
- Quote validation against the cited transcript turn; unsupported scores remain unscored.
- Optional server-side Claude analysis, tracked analysis jobs, and daily request limits.
- Saved analysis timings and reported input/output tokens, including available usage on failures.
- Approved document ingestion, keyword retrieval, and citation-validated RAG coaching.
- Append-only coaching decisions, manual practice assignments and pinned human-reviewed follow-up comparisons.
- Optional LangSmith tracing with separate model and validation/save stages; content and raw errors excluded.
- Offline assessment evaluation against independently supplied references, with coverage and abstention reporting.

There are no seeded customer records, fabricated performance metrics, or acceptance predictions. AI controls remain unavailable until configured. Real patient recordings, team invitations, billing, semantic vector retrieval, and validated model-quality benchmarks are not implemented.

Evaluate a prepared dataset without provider calls:

```sh
npm run evaluate -- /absolute/path/to/dataset.json /absolute/path/to/new-report.json
```

See [the evaluation contract](docs/EVALUATION.md) for the input format, reference requirements and interpretation. The command computes an offline report; it does not generate predictions or certify model quality.

## Hosting migration

The runtime now targets official Next.js on Vercel, with Clerk authentication and a libSQL/Turso database. The previous Sites configuration is archived in `docs/legacy/sites-hosting.json`. Existing Sites data has **not** been transferred. See [Vercel migration and owner setup](docs/VERCEL_MIGRATION.md) for credentials, deployment, data transfer and verification steps.

## Presenting the project

Use the public `/tour` walkthrough to explain the workflow and exercise the actual quote validator against clearly labeled synthetic content. It makes no AI calls and saves no records. See [the presentation guide](docs/PRESENTATION_GUIDE.md) for a five-minute script, technical talking points and the remaining live-workflow checks.

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
- [Implementation and architecture](docs/IMPLEMENTATION.md)
- [Setup, operation, and deployment](docs/OPERATIONS.md)
- [Validation and known limits](docs/VALIDATION.md)

The original planning documents remain at the repository root as historical design inputs. They describe Python, training, and predictive-model work that is not present in this implementation. The current implementation and outstanding work are documented above.
