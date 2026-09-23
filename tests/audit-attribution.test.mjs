import test from 'node:test';
import assert from 'node:assert/strict';
import { mkdtemp, rm } from 'node:fs/promises';
import { tmpdir } from 'node:os';
import { join } from 'node:path';
import { pathToFileURL } from 'node:url';
import { createDatabase } from '../server/database.ts';
import { migrate } from '../scripts/migrate-local.mjs';
import { Repository } from '../server/repository.ts';
import { Team, acceptInvitation, workspaceAccess } from '../server/team.ts';
import { Learning } from '../server/learning.ts';
import { enqueue, processNextJob, cancelJob } from '../server/queue.ts';

test('shared workspace audits preserve the acting member through review, practice and background execution', async (t) => {
  const dir = await mkdtemp(join(tmpdir(), 'consultiq-audit-'));
  const db = await createDatabase({
    DATABASE_URL: pathToFileURL(join(dir, 'app.db')).href,
  });
  t.after(async () => {
    db.close();
    await rm(dir, { recursive: true, force: true });
  });
  await migrate(db.client);
  const owner = await Repository.forUser(db, 'user_owner');
  const team = new Team(owner, 'user_owner', 'owner');
  const invitation = await team.invite({
    invitee_id: 'user_reviewer',
    role: 'reviewer',
  });
  await acceptInvitation(db, 'user_reviewer', { token: invitation.token });
  const { repo: reviewer } = await workspaceAccess(
    db,
    'user_reviewer',
    owner.workspaceId,
  );
  const call = await reviewer.createCall({
    title: 'Audit test',
    coordinator: 'Fixture',
    source: 'synthetic',
    recorded_at: '2026-09-22',
    transcript:
      'Coordinator: Can we discuss the next step?\nPatient: Yes, please explain the next step.',
  });
  // Mechanical fixture anchors only, not owner-approved assessment material.
  const rubric = await owner.publishRubric({
    title: 'Mechanical fixture',
    approved: true,
    definitions: Array.from({ length: 8 }, (_, dimension) => ({
      dimension,
      one: 'Test anchor one',
      three: 'Test anchor three',
      five: 'Test anchor five',
    })),
  });
  const dimensions = Array.from({ length: 8 }, (_, dimension) => ({
    dimension,
    score: null,
    rationale: 'Test abstention.',
    coaching_note: 'Test fixture.',
    evidence: [],
  }));
  const review = await reviewer.saveAssessment(call.id, {
    rubric_id: rubric.id,
    base_assessment_id: '',
    dimensions,
  });
  const practice = {
    request_id: crypto.randomUUID(),
    baseline_id: review.id,
    dimension: 0,
    instruction: 'Mechanical practice fixture.',
  };
  const learning = new Learning(reviewer);
  await learning.assign(call.id, practice);
  await learning.assign(call.id, practice); // Replay must not create another audit row.
  const env = {
    ANTHROPIC_API_KEY: 'test-only',
    AI_MODEL: 'test-only',
    CONSULTIQ_ALLOWED_USER_IDS: 'user_owner,user_reviewer',
  };
  await enqueue(
    reviewer,
    'user_reviewer',
    call.id,
    'scoring',
    crypto.randomUUID(),
    null,
    env,
  );
  await processNextJob(db, env, async () => ({ dimensions }));
  const cancelled = await enqueue(
    reviewer,
    'user_reviewer',
    call.id,
    'scoring',
    crypto.randomUUID(),
    null,
    env,
  );
  await cancelJob(owner, 'user_owner', 'owner', cancelled.id);
  await cancelJob(owner, 'user_owner', 'owner', cancelled.id);
  await team.remove('user_reviewer');
  const rows = (
    await db
      .prepare(
        'SELECT action,actor_id,entity_id FROM audit_events WHERE workspace_id=? ORDER BY rowid',
      )
      .bind(owner.workspaceId)
      .all()
  ).results;
  assert.ok(rows.length > 8);
  assert.ok(rows.every((row) => row.actor_id !== null));
  assert.equal(
    rows.find((row) => row.action === 'invitation_created').actor_id,
    'user_owner',
  );
  assert.equal(
    rows.find((row) => row.action === 'member_joined').actor_id,
    'user_reviewer',
  );
  assert.equal(
    rows.find((row) => row.entity_id === call.id).actor_id,
    'user_reviewer',
  );
  assert.deepEqual(
    rows
      .filter((row) => row.action === 'assessment_saved')
      .map((row) => row.actor_id),
    ['user_reviewer', 'user_reviewer'],
  );
  assert.equal(
    rows.filter((row) => row.entity_id === practice.request_id).length,
    1,
  );
  assert.equal(
    rows.find((row) => row.entity_id === practice.request_id).actor_id,
    'user_reviewer',
  );
  assert.ok(
    rows
      .filter((row) => row.action === 'analysis_queued')
      .every((row) => row.actor_id === 'user_reviewer'),
  );
  assert.deepEqual(
    rows
      .filter((row) => row.action === 'analysis_cancelled')
      .map((row) => row.actor_id),
    ['user_owner'],
  );
  assert.equal(
    rows.find((row) => row.action === 'member_removed').actor_id,
    'user_owner',
  );
});
