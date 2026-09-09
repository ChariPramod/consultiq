# ConsultIQ

ConsultIQ is a consultation review and coaching workspace for dental training teams. Reviewers can import a role-play transcript, assess it against an approved rubric, inspect supporting quotes, and record a revised human assessment. Coaching can retrieve approved training material and generate an answer with source citations.

The repository contains a premium product landing page and a persistent application. The original static interface has been replaced with database-backed workflows. This release is a private pilot foundation, with commercial release work explicitly tracked in [the product plan](docs/PRODUCT_PLAN.md).

## Start locally

Use Node matching `.nvmrc` and npm.

```sh
npm ci
npm run db:migrate
npm run dev
```

Open the local URL printed by the server. The landing page is at `/`; the application is at `/workspace`. Use the local Sites sign-in flow to enter a private workspace. Model credentials are optional for manual review and library search.

For AI configuration, copy `.dev.vars.example` to `.dev.vars`, fill in server-side credentials, and restart the server. Never commit that file. See [operations](docs/OPERATIONS.md) before enabling external services.

```sh
npm run check
```

This runs automated tests, TypeScript, lint, and the production build. Generate new database migrations with `npm run db:generate`, then apply them locally with `npm run db:migrate`.

## What is included

- A responsive landing page and application using shadcn/Base UI components.
- Private per-user workspaces, saved transcripts, recorded outcomes, filtering, and CSV export.
- Owner-approved rubric versions and append-only assessment revisions.
- Quote validation against the cited transcript turn; unsupported scores remain unscored.
- Optional server-side Claude analysis, tracked analysis jobs, and daily request limits.
- Approved document ingestion, keyword retrieval, and citation-validated RAG coaching.
- Optional LangSmith run tracing with inputs and outputs excluded.

There are no seeded customer records, fabricated performance metrics, or acceptance predictions. AI controls remain unavailable until configured. Real patient recordings, team invitations, billing, semantic vector retrieval, and model-quality evaluations are not implemented.

## Project documentation

- [Data, cloud, market research and next build](docs/DATA_CLOUD_MARKET_AND_BUILD_STRATEGY.md)
- [Your actions and decisions](docs/OWNER_ACTIONS.md)
- [Product direction and release gates](docs/PRODUCT_PLAN.md)
- [Implementation and architecture](docs/IMPLEMENTATION.md)
- [Setup, operation, and deployment](docs/OPERATIONS.md)
- [Validation and known limits](docs/VALIDATION.md)

The original planning documents remain at the repository root as historical design inputs. They describe Python, training, and predictive-model work that is not present in this implementation. The current implementation and outstanding work are documented above.
