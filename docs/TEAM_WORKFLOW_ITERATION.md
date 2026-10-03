# Team workflow and workspace insights

This increment turns individual conversation review into a shared training workflow. It remains a role-play/synthetic training product. It does not add real patient ingestion, outbound notifications, native CRM sync, billing, or a commercial-readiness certification.

## Reviewer ownership and deadlines

A workspace owner can open a consultation and assign an existing owner/reviewer. Invitations alone do not make a user eligible. Viewers may inspect assignments but cannot create or change them. A current assignee or the owner can progress the task from assigned to in progress and complete it. Owners control reassignment, deadlines and reopening.

Completion must reference the latest saved human assessment for that consultation. The SQL write checks the assessment identity/kind, workspace, active assignee permissions and expected task version together. An AI assessment or a human assessment superseded during submission cannot complete a task. Completed tasks retain their linked assessment until the owner explicitly reopens the task; later assessment revisions do not silently rewrite that snapshot.

Unchanged saves are rejected without creating another version or audit. Each actual assignment change appends a versioned event and actor-attributed audit in the same transaction. Stale changes return a conflict rather than overwriting another person's work. Uncertain saves require a refresh; they are not automatically retried. Assignment drafts survive fetch/write errors. History displays the latest 30 events; stored history remains until the consultation is deleted and cascades with it.

Due dates are date-only UTC values. A task becomes overdue when its due date is before the current UTC date; this is not a configured local-time deadline. Removing a reviewer retains the assignment for accountability and marks it as needing reassignment. Revoked accounts cannot mutate tasks. No email, calendar invitation or other notification is sent.

The Assigned reviews screen starts with your own tasks and can show the workspace's assignments. It filters by status and pages 25 records at a time (API maximum 50). Ordering uses last update plus ID; updates can move entries between pages. Refresh restarts the listing. This is a current worklist, not a frozen export or a delivery/notification guarantee.

## Practice across the workspace

Practice inbox surfaces existing assignments across consultations, with open/completed filters, search, exact-coordinator filtering and pagination. It shows bounded instruction previews, pinned baseline/follow-up assessment identities and target-dimension scores. Comparisons require both supported numeric scores and matching rubric versions; missing or incompatible evidence remains unavailable. No gain is inferred from a missing score.

Cards open the consultation's Practice tab directly. Calendar downloads remain manual, content-minimal .ics handoffs. Practice assignments still have no persisted due date or verified trainee account ownership: coordinator names are transcript labels. Linking a follow-up is still performed inside the consultation, using the existing guarded human-review completion flow.

## Whole-workspace insights

The former recent-record overview/coordinator/pattern screens are replaced by an all-time workspace view. A single scoped aggregate SQL statement produces one consistent snapshot without returning transcripts or assessment prose. It counts all saved consultations, latest human/AI assessments, unsupported/partial/full evidence, recorded outcomes, current job states and pending/completed practice.

Dimension means use only latest human assessments made under the current rubric. Each dimension shows its scored denominator; an empty denominator produces no mean. AI assessments and older rubric versions are not blended into that mean. Rubric-version counts remain separate. Coordinator groups use exact names from transcripts, not verified team identities. The top 20 coordinator groups and top 50 rubric groups have explicit truncation indicators.

These statistics describe saved review records. They do not measure business impact, clinical accuracy, trainee causation or provider quality. Job totals are not a worker heartbeat. Refresh explicitly to see a newer snapshot.

## Review-screen details

Literal, case-insensitive transcript search highlights original source spans without normalizing or rewriting them. Search can target either speaker, and next/previous controls move through matching turns while leaving every original turn visible. Enter moves to the next match; navigation respects reduced-motion settings. Copying a turn preserves its speaker label and turn number; a blocked clipboard shows a manual-copy fallback. Search matches do not validate assessment evidence or introduce scores.

Navigation now follows the training workflow: insights, assigned reviews, practice, consultations, library and administration. Practice links open the appropriate tab. Active navigation indicators and narrow-screen layout were checked in a browser. A coordinator named literally `all` is treated as a real exact-match filter, not an unfiltered sentinel.

## Smaller initial workspace responses

Workspace bootstrap returns bounded consultation metadata and latest-assessment identity, not full transcripts and review bodies. Only consultation detail opens full source content. Library bootstrap returns short previews and character counts; opening a document loads its full body through a separate workspace-scoped request, with per-selection error/retry handling. This also reduces repeated data transfer while job polling is active.

The follow-up picker still considers the most recent 200 consultation summaries. This is explicitly a remaining limit, not whole-workspace candidate search. The new insights, review queue, assignments and practice inbox are not limited to those 200 records.

## API and migration

- `GET /api/insights`: all-time workspace aggregate snapshot.
- `GET /api/practice`: filtered, paginated practice summaries.
- `GET /api/review-tasks`: filtered, paginated reviewer assignments; `mine=true` uses the authenticated actor.
- `GET /api/consultations/:id/review-task`: task, eligible reviewers, latest human assessment identity and bounded history.
- `PATCH /api/consultations/:id/review-task`: expected-version change with role, membership and human-completion guards.
- `GET /api/library/:id`: full authorized reference document.

Apply generated migration `0005_thankful_miss_america.sql` through `npm run db:migrate` before using this release with a configured database. It adds review task/event tables and indexes. Earlier migrations are unchanged. Backups are schema-bound; the existing backup/restore tools cover the new workspace-scoped tables after migration. A pre-migration backup cannot be restored into a different schema without a separate controlled migration plan.

## Remaining owner and launch work

Finish Clerk development-instance keys, your application user ID and Turso login using the local setup wizard. Engineering can then create/configure the cloud database, apply migrations, redeploy, verify real sessions and enable approved AI processing. The public Vercel landing page alone does not verify these private workflows.

Provide an owner-approved rubric, permitted training transcripts and a prospective team's acceptance criteria. Run one complete hosted session including role isolation, reviewer handoff, human assessment, practice completion, export and recovery checks. Provider/tracing verification requires its own credentials and approved input. Native integrations, billing, domain-quality benchmarks, external alerts and an encrypted off-site recovery drill remain outstanding.

## Validation of this release

`npm run check` passed with 180 tests, TypeScript checking, lint and the optimized production build. Coverage includes concurrent assignment updates, revoked assignees, latest-human completion checks, no-op history protection, audit rollback, stale writes, cross-workspace authorization, full-scope aggregates beyond 200 calls, lightweight bootstrap, pinned practice comparisons, Unicode/literal transcript matching, and backup/restore of the new task/event tables.

An isolated local browser harness exercised the desktop insights/worklist/review screens, transcript search navigation, a 390px mobile layout and a library load failure followed by retry. It reported no page errors or horizontal mobile overflow. All data and network responses in that harness were explicit synthetic fixtures; the temporary route was removed before commit. This is UI verification, not proof of live Clerk/Turso/provider behavior. Actual hosted authenticated acceptance remains pending those credentials.
