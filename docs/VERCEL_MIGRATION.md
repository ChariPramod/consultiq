> Product update: [PRODUCT_RELIABILITY.md](PRODUCT_RELIABILITY.md) supersedes earlier synchronous-analysis and single-user-only descriptions. Migrations 0003/0004, team roles and the separately hosted worker are now required for this release.

# Vercel migration

## What changed

The application now uses official Next.js App Router and Node functions on Vercel. Tailwind v4, shared shadcn/Base UI components, Lucide and Motion remain. Vinext, Vite, Cloudflare Workers bindings and Sites sign-in have been removed from the active runtime. The old Sites project reference is preserved in `docs/legacy/sites-hosting.json`.

Clerk verifies sessions. Only exact Clerk user IDs in `CONSULTIQ_ALLOWED_USER_IDS` may open a workspace or call the application API. Empty configuration denies access. The server no longer trusts `oai-authenticated-user-id`. Each permitted user retains an independent workspace; this is not team membership. Sign-in alone does not grant access.

The libSQL adapter preserves the existing SQLite domain schema, scoped queries, atomic batches, append-only reviews and stale-write guards. Foreign-key enforcement is checked. Local file storage is allowed for development; it is rejected on Vercel. Storage configuration failures return a sanitized unavailable response. There is no fabricated or in-memory fallback workspace.

Migrations verify the ordered Drizzle journal and checksums of applied SQL. Pending schema statements and migration history commit together in a write transaction. Existing migrations were not rewritten. Migration execution is explicit, separate from builds and requests.

## Owner setup

1. Create or select a Clerk application. Configure its sign-in methods and approved application URLs. For a private pilot, restrict sign-up/invitations in Clerk as well. Add `NEXT_PUBLIC_CLERK_PUBLISHABLE_KEY` and `CLERK_SECRET_KEY` to local/Vercel environment settings. Add `NEXT_PUBLIC_CLERK_SIGN_IN_URL=/sign-in`.
2. Sign in to Clerk, find your verified `user_...` ID in the Clerk dashboard, and set `CONSULTIQ_ALLOWED_USER_IDS`. This is a comma-separated list of IDs, not emails. Do not add untrusted accounts. Removing an ID revokes application access but does not delete its data.
3. Create a Turso database in a region near the Vercel function region. Configure `DATABASE_URL=libsql://...` and `DATABASE_AUTH_TOKEN` through environment settings. Use a separate database and appropriately scoped credentials for previews. Never point unreviewed preview code at production records.
4. Locally copy `.env.example` to `.env.local`. For local file storage create `.local-data` and set `DATABASE_URL=file:.local-data/consultiq.db`; authentication still requires Clerk. Run `npm run db:migrate`. To initialize cloud storage, run the same command with the intended remote database environment. Do this once as a controlled release step, not on every function invocation.
5. Configure optional Anthropic/model and LangSmith keys only after access and storage work. Manual review and approved-source search do not require model keys. Never paste secrets into chat or commit environment files.
6. Redeploy after changing environment variables; the Clerk publishable key is part of the client build. Complete the acceptance checklist below before using records beyond synthetic role-plays.

The agent can deploy code to the connected Vercel account. Clerk and Turso account creation, credentials and any plan/billing acceptance remain owner-dependent. No paid subscription was purchased by this migration.

## Privacy and deployment

The owner explicitly requested a public repository and deployed page on September 22, 2026. The public production landing page is https://consultiq-ecru.vercel.app and source is https://github.com/ChariPramod/consultiq. This supersedes earlier private-publication instructions. Workspace data remains protected by verified Clerk sessions and the allowlist.

Vercel created the first deployment as production. Its generated deployment URL requires Vercel authentication; the production alias is public. Unauthenticated HTTP checks verified the landing page loads, workspace displays pending setup, and the API returns a sanitized 503 until credentials exist. The site is not yet a fully configured live workspace.

```sh
npm ci
npm run check
npx vercel link
npx vercel deploy --prod
```

The Vercel project is `pramod-0491/consultiq`. The owner completed the GitHub login connection for ChariPramod, and `vercel git connect https://github.com/ChariPramod/consultiq --yes` returned Connected. The project is linked to the public repository. Pushes to the production branch can now trigger deployments; other branches use preview deployments. Direct CLI deployment remains available.

No production credentials or runtime database files were tracked. A history scan found no matches for common private-key, GitHub-token, Anthropic-key, Stripe-key or AWS-key patterns; this is a bounded check, not a guarantee that any arbitrary sensitive string can be detected.

Validation: 73 tests passed, TypeScript and lint passed, official Next.js production build passed locally and on Vercel. Real libSQL tests cover rollback, changes-gated audits, foreign keys, persistent reopen, migration drift and transactional migration failure. Live Clerk session and remote Turso behavior remain unverified until owner setup. Production dependency audit reported zero known vulnerabilities; development-tool audit still reports four moderate advisories.

## Existing Sites records

No old data has been exported or transferred: the connected Sites account cannot access the original project. Do not delete that project or its database. Obtain an authorized D1 export and record the old owner IDs when the owning account is recovered. Back up the export securely; it contains private runtime data and must not enter Git.

A separate controlled migration must restore into a staging database, preserve all foreign-key relationships and immutable IDs, deliberately map old Sites identities to verified Clerk users, reconcile schema/migration history, and compare row counts and representative review histories. Run workspace-isolation and deletion tests before cutover. Do not import a D1 dump blindly into the initialized database or infer identity ownership by email alone. Roll back application deployment to a known-good Vercel build if necessary; reverting code does not undo data migrations.

## Acceptance checks still requiring cloud credentials

- Approved user signs in, imports a synthetic role-play, reloads and sees persistent records.
- Unauthenticated requests, spoofed Sites headers and signed-in unlisted users cannot access records.
- Two permitted test users cannot retrieve, mutate or search each other’s records.
- Publish an owner-approved rubric, save a review, verify stale-review conflicts and append-only history.
- Add approved source text, search it, delete it and verify dependent content deletion.
- Verify optional live scoring/coaching and metadata-only LangSmith traces with approved synthetic input.
- Check sign-out/session expiry, unavailable database, and provider timeout recovery in the hosted browser.
- Verify backups and restore, preview database separation, region/latency, deployment protection and function duration on the selected Vercel plan.

Analysis remains synchronous. The API requests a 120-second function budget; availability depends on the hosting plan. This is not a durable queue or guarantee against function termination. Existing interrupted-job recovery remains; automatic paid retries are not added.

## References

- [Next.js deployment](https://nextjs.org/docs/app/getting-started/deploying)
- [Clerk Next.js setup](https://clerk.com/docs/nextjs/getting-started/quickstart)
- [libSQL TypeScript SDK](https://docs.turso.tech/sdk/ts/reference)
- [Vercel Deployment Protection](https://vercel.com/docs/deployment-protection)
