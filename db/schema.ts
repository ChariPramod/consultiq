import {
  sqliteTable,
  text,
  integer,
  index,
  uniqueIndex,
} from 'drizzle-orm/sqlite-core';
export const workspaces = sqliteTable('workspaces', {
  id: text('id').primaryKey(),
  ownerId: text('owner_id').notNull().unique(),
  name: text('name').notNull(),
  createdAt: text('created_at').notNull(),
});
export const calls = sqliteTable(
  'consultations',
  {
    id: text('id').primaryKey(),
    workspaceId: text('workspace_id')
      .notNull()
      .references(() => workspaces.id, { onDelete: 'cascade' }),
    title: text('title').notNull(),
    coordinator: text('coordinator').notNull(),
    source: text('source').notNull(),
    outcome: text('outcome').notNull().default('unknown'),
    turns: text('turns').notNull(),
    recordedAt: text('recorded_at').notNull(),
    createdAt: text('created_at').notNull(),
  },
  (t) => [
    index('consultations_workspace_created').on(t.workspaceId, t.createdAt),
  ],
);
export const rubrics = sqliteTable(
  'rubrics',
  {
    id: text('id').primaryKey(),
    workspaceId: text('workspace_id')
      .notNull()
      .references(() => workspaces.id, { onDelete: 'cascade' }),
    title: text('title').notNull(),
    definitions: text('definitions').notNull(),
    createdAt: text('created_at').notNull(),
  },
  (t) => [index('rubrics_workspace_created').on(t.workspaceId, t.createdAt)],
);
export const assessments = sqliteTable(
  'assessments',
  {
    id: text('id').primaryKey(),
    workspaceId: text('workspace_id')
      .notNull()
      .references(() => workspaces.id, { onDelete: 'cascade' }),
    callId: text('call_id')
      .notNull()
      .references(() => calls.id, { onDelete: 'cascade' }),
    rubricId: text('rubric_id')
      .notNull()
      .references(() => rubrics.id),
    kind: text('kind').notNull(),
    content: text('content').notNull(),
    promptVersion: text('prompt_version').notNull(),
    model: text('model').notNull(),
    createdAt: text('created_at').notNull(),
  },
  (t) => [index('assessments_call_created').on(t.callId, t.createdAt)],
);
export const documents = sqliteTable(
  'knowledge_documents',
  {
    id: text('id').primaryKey(),
    workspaceId: text('workspace_id')
      .notNull()
      .references(() => workspaces.id, { onDelete: 'cascade' }),
    title: text('title').notNull(),
    body: text('body').notNull(),
    createdAt: text('created_at').notNull(),
  },
  (t) => [index('knowledge_workspace').on(t.workspaceId)],
);
export const chunks = sqliteTable(
  'knowledge_chunks',
  {
    id: text('id').primaryKey(),
    workspaceId: text('workspace_id')
      .notNull()
      .references(() => workspaces.id, { onDelete: 'cascade' }),
    documentId: text('document_id')
      .notNull()
      .references(() => documents.id, { onDelete: 'cascade' }),
    position: integer('position').notNull(),
    body: text('body').notNull(),
  },
  (t) => [
    index('chunks_workspace').on(t.workspaceId),
    uniqueIndex('chunks_document_position').on(t.documentId, t.position),
  ],
);
export const coaching = sqliteTable(
  'coaching_runs',
  {
    id: text('id').primaryKey(),
    workspaceId: text('workspace_id')
      .notNull()
      .references(() => workspaces.id, { onDelete: 'cascade' }),
    callId: text('call_id')
      .notNull()
      .references(() => calls.id, { onDelete: 'cascade' }),
    question: text('question').notNull(),
    answer: text('answer').notNull(),
    citations: text('citations').notNull(),
    model: text('model').notNull(),
    promptVersion: text('prompt_version').notNull(),
    createdAt: text('created_at').notNull(),
  },
  (t) => [index('coaching_call_created').on(t.callId, t.createdAt)],
);
export const jobs = sqliteTable(
  'analysis_jobs',
  {
    id: text('id').primaryKey(),
    workspaceId: text('workspace_id')
      .notNull()
      .references(() => workspaces.id, { onDelete: 'cascade' }),
    callId: text('call_id')
      .notNull()
      .references(() => calls.id, { onDelete: 'cascade' }),
    kind: text('kind').notNull(),
    status: text('status').notNull(),
    errorCode: text('error_code'),
    telemetry: text('telemetry_json'),
    createdAt: text('created_at').notNull(),
    finishedAt: text('finished_at'),
  },
  (t) => [index('jobs_workspace_created').on(t.workspaceId, t.createdAt)],
);
export const events = sqliteTable(
  'audit_events',
  {
    id: text('id').primaryKey(),
    workspaceId: text('workspace_id')
      .notNull()
      .references(() => workspaces.id, { onDelete: 'cascade' }),
    action: text('action').notNull(),
    entityId: text('entity_id').notNull(),
    createdAt: text('created_at').notNull(),
  },
  (t) => [index('audit_workspace_created').on(t.workspaceId, t.createdAt)],
);
export const coachingReviews = sqliteTable(
  'coaching_reviews',
  {
    id: text('id').primaryKey(),
    workspaceId: text('workspace_id')
      .notNull()
      .references(() => workspaces.id, { onDelete: 'cascade' }),
    coachingId: text('coaching_id')
      .notNull()
      .references(() => coaching.id, { onDelete: 'cascade' }),
    decision: text('decision').notNull(),
    guidance: text('guidance').notNull(),
    notes: text('notes').notNull(),
    baseId: text('base_id').notNull(),
    createdAt: text('created_at').notNull(),
  },
  (t) => [
    index('coaching_reviews_parent').on(
      t.workspaceId,
      t.coachingId,
      t.createdAt,
    ),
  ],
);
export const practiceAssignments = sqliteTable(
  'practice_assignments',
  {
    id: text('id').primaryKey(),
    workspaceId: text('workspace_id')
      .notNull()
      .references(() => workspaces.id, { onDelete: 'cascade' }),
    callId: text('call_id')
      .notNull()
      .references(() => calls.id, { onDelete: 'cascade' }),
    baselineId: text('baseline_id')
      .notNull()
      .references(() => assessments.id, { onDelete: 'cascade' }),
    reviewId: text('review_id').references(() => coachingReviews.id, {
      onDelete: 'cascade',
    }),
    dimension: integer('dimension').notNull(),
    instruction: text('instruction').notNull(),
    createdAt: text('created_at').notNull(),
  },
  (t) => [index('practice_workspace_call').on(t.workspaceId, t.callId)],
);
export const practiceCompletions = sqliteTable('practice_completions', {
  id: text('id').primaryKey(),
  workspaceId: text('workspace_id')
    .notNull()
    .references(() => workspaces.id, { onDelete: 'cascade' }),
  assignmentId: text('assignment_id')
    .notNull()
    .unique()
    .references(() => practiceAssignments.id, { onDelete: 'cascade' }),
  assessmentId: text('assessment_id')
    .notNull()
    .references(() => assessments.id, { onDelete: 'cascade' }),
  reflection: text('reflection').notNull(),
  createdAt: text('created_at').notNull(),
});
