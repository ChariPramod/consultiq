import { test } from 'node:test';
import assert from 'node:assert/strict';
import { DatabaseSync } from 'node:sqlite';
import { readFileSync, readdirSync } from 'node:fs';
import { handleApi } from '../server/handler.ts';
import { Repository } from '../server/repository.ts';
function setup() {
  let failPattern;
  let batchTail = Promise.resolve();
  const sql = new DatabaseSync(':memory:');
  sql.exec('PRAGMA foreign_keys=ON');
  for (const file of readdirSync('drizzle')
    .filter((f) => f.endsWith('.sql'))
    .sort())
    sql.exec(readFileSync(`drizzle/${file}`, 'utf8'));
  const db = {
    prepare(query) {
      const prepared = sql.prepare(query);
      let parameters = [];
      return {
        bind(...values) {
          parameters = values;
          return this;
        },
        async first() {
          return prepared.get(...parameters) ?? null;
        },
        async all() {
          return { results: prepared.all(...parameters) };
        },
        async run() {
          if (failPattern?.test(query)) {
            failPattern = undefined;
            throw new Error('injected storage failure');
          }
          const result = prepared.run(...parameters);
          return { meta: { changes: Number(result.changes) } };
        },
      };
    },
    async batch(statements) {
      const result = batchTail.then(async () => {
        sql.exec('BEGIN');
        try {
          const results = [];
          for (const statement of statements)
            results.push(await statement.run());
          sql.exec('COMMIT');
          return results;
        } catch (error) {
          sql.exec('ROLLBACK');
          throw error;
        }
      });
      batchTail = result.catch(() => {});
      return result;
    },
  };
  return {
    db,
    failNext: (pattern) => {
      failPattern = pattern;
    },
    close: () => sql.close(),
  };
}
const input = {
  title: 'Follow-up role-play',
  coordinator: 'Test coordinator',
  source: 'roleplay',
  recorded_at: '2026-09-09',
  transcript:
    'Coordinator: Would Thursday at ten work for a follow-up?\nPatient: Thursday works for me.',
};
const definitions = Array.from({ length: 8 }, (_, dimension) => ({
  dimension,
  one: 'The behavior is absent in the conversation.',
  three: 'The behavior is partially present in the conversation.',
  five: 'The behavior is clearly present and confirmed.',
}));
const dimensions = Array.from({ length: 8 }, (_, dimension) => ({
  dimension,
  score: 4,
  rationale: 'The next step is specific.',
  coaching_note: 'Confirm the follow-up owner.',
  evidence: [{ turn_index: 0, span: 'Thursday at ten' }],
}));
function request(
  path,
  method = 'GET',
  data,
  user = 'owner-a',
  origin = 'http://localhost',
) {
  return new Request(`http://localhost/api/${path}`, {
    method,
    headers: {
      ...(user ? { 'oai-authenticated-user-id': user } : {}),
      'Content-Type': 'application/json',
      Origin: origin,
    },
    ...(data === undefined ? {} : { body: JSON.stringify(data) }),
  });
}
async function call(
  db,
  path,
  method = 'GET',
  data,
  user = 'owner-a',
  invoke,
  config = {},
) {
  const response = await handleApi(
    request(path, method, data, user),
    { DB: db, ...config },
    invoke,
    user,
  );
  return { status: response.status, data: await response.json() };
}
test('authentication and cross-origin writes are rejected', async () => {
  const { db, close } = setup();
  try {
    assert.equal(
      (await call(db, 'workspace', 'GET', undefined, '')).status,
      401,
    );
    assert.equal(
      (
        await handleApi(
          request(
            'consultations',
            'POST',
            input,
            'owner-a',
            'https://untrusted.example',
          ),
          { DB: db },
          undefined,
          'owner-a',
        )
      ).status,
      403,
    );
  } finally {
    close();
  }
});
test('a saved consultation survives a new request and remains isolated by owner', async () => {
  const { db, close } = setup();
  try {
    const created = await call(db, 'consultations', 'POST', input);
    assert.equal(created.status, 201);
    assert.equal(created.data.latest, null);
    const found = await call(db, `consultations/${created.data.id}`);
    assert.equal(found.data.call.title, input.title);
    const other = await call(
      db,
      `consultations/${created.data.id}`,
      'GET',
      undefined,
      'owner-b',
    );
    assert.equal(other.status, 404);
    const otherList = await call(db, 'workspace', 'GET', undefined, 'owner-b');
    assert.equal(otherList.data.calls.length, 0);
    assert.equal(
      (
        await call(
          db,
          `consultations/${created.data.id}`,
          'DELETE',
          undefined,
          'owner-b',
        )
      ).status,
      404,
    );
  } finally {
    close();
  }
});
test('rubric approval is mandatory and publishing preserves previous versions', async () => {
  const { db, close } = setup();
  try {
    assert.equal(
      (
        await call(db, 'rubrics', 'POST', {
          title: 'Review standard',
          definitions,
        })
      ).status,
      422,
    );
    const first = await call(db, 'rubrics', 'POST', {
      title: 'First standard',
      definitions,
      approved: true,
    });
    const second = await call(db, 'rubrics', 'POST', {
      title: 'Revised standard',
      definitions,
      approved: true,
    });
    assert.equal(first.status, 201);
    assert.notEqual(first.data.id, second.data.id);
    const repo = await Repository.forUser(db, 'owner-a');
    assert.equal((await repo.rubric(first.data.id)).title, 'First standard');
  } finally {
    close();
  }
});
test('reviews append history and stale submissions cannot overwrite newer work', async () => {
  const { db, close } = setup();
  try {
    const c = (await call(db, 'consultations', 'POST', input)).data;
    const r = (
      await call(db, 'rubrics', 'POST', {
        title: 'Review standard',
        definitions,
        approved: true,
      })
    ).data;
    const first = await call(db, `consultations/${c.id}/reviews`, 'POST', {
      rubric_id: r.id,
      base_assessment_id: '',
      dimensions,
    });
    assert.equal(first.status, 201);
    assert.equal(first.data.content.supported_count, 8);
    const stale = await call(db, `consultations/${c.id}/reviews`, 'POST', {
      rubric_id: r.id,
      base_assessment_id: '',
      dimensions,
    });
    assert.equal(stale.status, 409);
    const revision = await call(db, `consultations/${c.id}/reviews`, 'POST', {
      rubric_id: r.id,
      base_assessment_id: first.data.id,
      dimensions: dimensions.map((d) => ({ ...d, score: 3 })),
    });
    assert.equal(revision.status, 201);
    const detail = (await call(db, `consultations/${c.id}`)).data;
    assert.equal(detail.assessments.length, 2);
    assert.equal(detail.call.latest.content.average, 3);
  } finally {
    close();
  }
});
test('missing provider configuration never creates invented results', async () => {
  const { db, close } = setup();
  try {
    const c = (await call(db, 'consultations', 'POST', input)).data;
    const result = await call(db, `consultations/${c.id}/score`, 'POST', {});
    assert.equal(result.status, 503);
    assert.equal(
      (await call(db, `consultations/${c.id}`)).data.call.latest,
      null,
    );
  } finally {
    close();
  }
});
test('automated scoring validates model evidence and records run provenance', async () => {
  const { db, close } = setup();
  try {
    const c = (await call(db, 'consultations', 'POST', input)).data;
    await call(db, 'rubrics', 'POST', {
      title: 'Review standard',
      definitions,
      approved: true,
    });
    const env = { ANTHROPIC_API_KEY: 'test-only', AI_MODEL: 'test-model' };
    const result = await call(
      db,
      `consultations/${c.id}/score`,
      'POST',
      {},
      'owner-a',
      async () => ({
        dimensions: dimensions.map((d, i) =>
          i === 1
            ? {
                ...d,
                evidence: [
                  {
                    turn_index: 0,
                    span: 'This sentence is not in the transcript.',
                  },
                ],
              }
            : d,
        ),
      }),
      env,
    );
    assert.equal(result.status, 201);
    assert.equal(result.data.content.dimensions[1].score, null);
    assert.equal(result.data.kind, 'ai');
    assert.equal(result.data.model, 'test-model');
    assert.equal(result.data.prompt_version, 'assess-transcript/v1');
    const workspace = (await call(db, 'workspace')).data;
    assert.equal(workspace.jobs[0].status, 'completed');
  } finally {
    close();
  }
});
test('retrieval only searches the authenticated owner’s approved material', async () => {
  const { db, close } = setup();
  try {
    await call(db, 'library', 'POST', {
      title: 'Follow-up guide',
      body: 'Confirm the follow-up date and the person responsible for calling.',
      approved: true,
    });
    await call(
      db,
      'library',
      'POST',
      {
        title: 'Other confidential guide',
        body: 'Follow-up instructions belonging to another workspace.',
        approved: true,
      },
      'owner-b',
    );
    const found = (await call(db, 'library/search?q=follow-up')).data.sources;
    assert.equal(found.length, 1);
    assert.equal(found[0].title, 'Follow-up guide');
    assert.equal(
      (
        await call(db, 'library', 'POST', {
          title: 'Unapproved',
          body: 'A follow-up reference.',
        })
      ).status,
      422,
    );
  } finally {
    close();
  }
});
test('grounded coaching persists only when its citations match retrieved sources', async () => {
  const { db, close } = setup();
  try {
    const c = (await call(db, 'consultations', 'POST', input)).data;
    const doc = (
      await call(db, 'library', 'POST', {
        title: 'Follow-up guide',
        body: 'Confirm the follow-up date and the person responsible for calling.',
        approved: true,
      })
    ).data;
    const env = { ANTHROPIC_API_KEY: 'test-only', AI_MODEL: 'test-model' };
    const good = await call(
      db,
      `consultations/${c.id}/coaching`,
      'POST',
      { question: 'How should I confirm follow-up?' },
      'owner-a',
      async (_system, input, onUsage) => {
        onUsage({ input_tokens: 101, output_tokens: 31 });
        return {
          answer: 'Confirm the date and name the owner.',
          citations: [
            {
              chunk_id: input.sources[0].chunk_id,
              span: 'Confirm the follow-up date',
            },
          ],
        };
      },
      env,
    );
    assert.equal(good.status, 201);
    const bad = await call(
      db,
      `consultations/${c.id}/coaching`,
      'POST',
      { question: 'How should I confirm follow-up?' },
      'owner-a',
      async (_system, _input, onUsage) => {
        onUsage({ input_tokens: 102, output_tokens: 32 });
        return {
          answer: 'Unsupported advice.',
          citations: [{ chunk_id: 'invented', span: 'Invented guidance' }],
        };
      },
      env,
    );
    assert.equal(bad.status, 422);
    const jobs = (await call(db, 'workspace')).data.jobs;
    for (const [status, inputTokens, outputTokens] of [
      ['completed', 101, 31],
      ['failed', 102, 32],
    ]) {
      const job = jobs.find((j) => j.status === status);
      assert.equal(job.kind, 'coaching');
      assert.equal(job.telemetry.input_tokens, inputTokens);
      assert.equal(job.telemetry.output_tokens, outputTokens);
      assert.ok(Number.isFinite(job.telemetry.model_ms));
      assert.ok(Number.isFinite(job.telemetry.validation_save_ms));
    }
    assert.equal(
      (await call(db, `consultations/${c.id}`)).data.coaching.length,
      1,
    );
    await call(db, `library/${doc.id}`, 'DELETE');
    assert.equal(
      (await call(db, `consultations/${c.id}`)).data.coaching.length,
      0,
    );
  } finally {
    close();
  }
});
test('deleting a consultation removes the report and derived records', async () => {
  const { db, close } = setup();
  try {
    const c = (await call(db, 'consultations', 'POST', input)).data;
    assert.equal(
      (await call(db, `consultations/${c.id}`, 'DELETE')).status,
      200,
    );
    assert.equal((await call(db, `consultations/${c.id}`)).status, 404);
    assert.equal((await call(db, 'workspace')).data.calls.length, 0);
  } finally {
    close();
  }
});
test('input validation rejects real-data sources and invalid calendar dates', async () => {
  const { db, close } = setup();
  try {
    assert.equal(
      (await call(db, 'consultations', 'POST', { ...input, source: 'real' }))
        .status,
      422,
    );
    assert.equal(
      (
        await call(db, 'consultations', 'POST', {
          ...input,
          recorded_at: '2026-02-31',
        })
      ).status,
      422,
    );
  } finally {
    close();
  }
});

test('failed model output leaves no assessment and consumes the configured daily allowance', async () => {
  const { db, close } = setup();
  try {
    const c = (await call(db, 'consultations', 'POST', input)).data;
    await call(db, 'rubrics', 'POST', {
      title: 'Review standard',
      definitions,
      approved: true,
    });
    const config = {
      ANTHROPIC_API_KEY: 'test-only',
      AI_MODEL: 'test-model',
      MAX_AI_RUNS_PER_DAY: '1',
    };
    let invocations = 0;
    const invoke = async () => {
      invocations++;
      return { invalid: true };
    };
    const failed = await call(
      db,
      `consultations/${c.id}/score`,
      'POST',
      {},
      'owner-a',
      invoke,
      config,
    );
    assert.equal(failed.status, 502);
    assert.equal(
      (await call(db, `consultations/${c.id}`)).data.call.latest,
      null,
    );
    const workspace = (await call(db, 'workspace')).data;
    assert.equal(workspace.jobs[0].status, 'failed');
    const limited = await call(
      db,
      `consultations/${c.id}/score`,
      'POST',
      {},
      'owner-a',
      invoke,
      config,
    );
    assert.equal(limited.status, 429);
    assert.equal(invocations, 1);
  } finally {
    close();
  }
});

test('another workspace cannot inject its rubric into a private review', async () => {
  const { db, close } = setup();
  try {
    const c = (await call(db, 'consultations', 'POST', input)).data;
    const foreign = (
      await call(
        db,
        'rubrics',
        'POST',
        { title: 'Foreign standard', definitions, approved: true },
        'owner-b',
      )
    ).data;
    const review = await call(db, `consultations/${c.id}/reviews`, 'POST', {
      rubric_id: foreign.id,
      base_assessment_id: '',
      dimensions,
    });
    assert.equal(review.status, 404);
    assert.equal(
      (await call(db, `consultations/${c.id}`)).data.assessments.length,
      0,
    );
  } finally {
    close();
  }
});

for (const removed of ['cited source', 'uncited source', 'consultation']) {
  test(`coaching cannot restore content after an in-flight ${removed} deletion`, async () => {
    const { db, close } = setup();
    try {
      const c = (await call(db, 'consultations', 'POST', input)).data;
      for (const title of [
        'Follow-up guide',
        'Additional follow-up guidance',
      ]) {
        await call(db, 'library', 'POST', {
          title,
          body: 'Confirm the follow-up date and the person responsible for calling.',
          approved: true,
        });
      }
      const result = await call(
        db,
        `consultations/${c.id}/coaching`,
        'POST',
        { question: 'How should I confirm follow-up?' },
        'owner-a',
        async (_system, payload) => {
          assert.equal(payload.sources.length, 2);
          const path =
            removed === 'consultation'
              ? `consultations/${c.id}`
              : `library/${payload.sources[removed === 'cited source' ? 0 : 1].document_id}`;
          assert.equal((await call(db, path, 'DELETE')).status, 200);
          return {
            answer: 'Confirm the date and name the owner.',
            citations: [
              {
                chunk_id: payload.sources[0].chunk_id,
                span: 'Confirm the follow-up date',
              },
            ],
          };
        },
        { ANTHROPIC_API_KEY: 'test-only', AI_MODEL: 'test-model' },
      );
      assert.equal(result.status, 409);
      assert.equal(result.data.error, 'coaching_context_changed');
      assert.equal(
        (
          await db
            .prepare('SELECT COUNT(*) AS total FROM coaching_runs')
            .first()
        ).total,
        0,
      );
      assert.equal(
        (
          await db
            .prepare(
              "SELECT COUNT(*) AS total FROM audit_events WHERE action='coaching_saved'",
            )
            .first()
        ).total,
        0,
      );
      const workspace = (await call(db, 'workspace')).data;
      if (removed === 'consultation') assert.equal(workspace.jobs.length, 0);
      else {
        assert.equal(workspace.jobs[0].status, 'failed');
        assert.equal(workspace.jobs[0].error_code, 'coaching_context_changed');
      }
    } finally {
      close();
    }
  });
}

test('coaching persistence rejects another workspace’s consultation and source identities', async () => {
  const { db, close } = setup();
  try {
    const owner = await Repository.forUser(db, 'owner-a');
    const other = await Repository.forUser(db, 'owner-b');
    const ownCall = await owner.createCall(input);
    const otherCall = await other.createCall(input);
    for (const repo of [owner, other]) {
      await repo.addDocument({
        title: 'Guide',
        body: 'Confirm the follow-up date.',
        approved: true,
      });
    }
    const [ownSource] = await owner.retrieve('follow-up');
    const [otherSource] = await other.retrieve('follow-up');
    const activeJob = await owner.beginJob(ownCall.id, 'coaching', 30);
    for (const [callId, source] of [
      [otherCall.id, ownSource],
      [ownCall.id, otherSource],
    ]) {
      await assert.rejects(
        owner.saveCoaching(
          callId,
          'Follow-up?',
          'Confirm the date.',
          [{ ...source, span: 'Confirm the follow-up date.' }],
          'test-model',
          [source],
          activeJob,
        ),
        { status: 409, code: 'coaching_context_changed' },
      );
    }
    assert.equal(
      (await db.prepare('SELECT COUNT(*) AS total FROM coaching_runs').first())
        .total,
      0,
    );
  } finally {
    close();
  }
});

test('persisted telemetry distinguishes provider, validation and unknown usage on both success and failure', async () => {
  const { db, close } = setup();
  try {
    await call(db, 'rubrics', 'POST', {
      title: 'Review standard',
      definitions,
      approved: true,
    });
    const config = { ANTHROPIC_API_KEY: 'test-only', AI_MODEL: 'test-model' };
    for (const scenario of ['success', 'invalid', 'transport', 'unreported']) {
      const c = (await call(db, 'consultations', 'POST', input)).data;
      const invoke = async (_system, _input, onUsage) => {
        if (scenario === 'transport') throw new Error('private transport text');
        if (scenario !== 'unreported')
          onUsage({ input_tokens: 123, output_tokens: 45 });
        return scenario === 'invalid' ? { invalid: true } : { dimensions };
      };
      const result = await call(
        db,
        `consultations/${c.id}/score`,
        'POST',
        {},
        'owner-a',
        invoke,
        config,
      );
      assert.equal(
        result.status,
        scenario === 'success' || scenario === 'unreported'
          ? 201
          : scenario === 'transport'
            ? 500
            : 502,
      );
      const workspace = (await call(db, 'workspace')).data;
      const job = workspace.jobs.find((j) => j.call_id === c.id);
      const t = job.telemetry;
      assert.equal(t.schema_version, 1);
      assert.ok(Number.isFinite(t.total_ms) && t.total_ms >= 0);
      assert.ok(Number.isFinite(t.model_ms) && t.model_ms >= 0);
      assert.ok(t.total_ms >= t.model_ms);
      if (scenario === 'transport') assert.equal(t.validation_save_ms, null);
      else {
        assert.ok(
          Number.isFinite(t.validation_save_ms) && t.validation_save_ms >= 0,
        );
        assert.ok(t.total_ms >= t.model_ms + t.validation_save_ms);
      }
      assert.equal(
        t.input_tokens,
        scenario === 'transport' || scenario === 'unreported' ? null : 123,
      );
      assert.equal(
        t.output_tokens,
        scenario === 'transport' || scenario === 'unreported' ? null : 45,
      );
      assert.deepEqual(
        Object.keys(t).sort(),
        [
          'schema_version',
          'total_ms',
          'model_ms',
          'validation_save_ms',
          'input_tokens',
          'output_tokens',
        ].sort(),
      );
      assert.equal(JSON.stringify(t).includes('private'), false);
    }
    assert.deepEqual(
      (await call(db, 'workspace', 'GET', undefined, 'owner-b')).data.jobs,
      [],
    );
  } finally {
    close();
  }
});

test('legacy job telemetry remains null and another workspace cannot update job telemetry', async () => {
  const { db, close } = setup();
  try {
    const c = (await call(db, 'consultations', 'POST', input)).data;
    const owner = await Repository.forUser(db, 'owner-a');
    const other = await Repository.forUser(db, 'owner-b');
    const id = await owner.beginJob(c.id, 'scoring', 30);
    await other.finishJob(id, undefined, {
      schema_version: 1,
      total_ms: 1,
      model_ms: 1,
      validation_save_ms: null,
      input_tokens: 2,
      output_tokens: 3,
    });
    let job = (await call(db, 'workspace')).data.jobs[0];
    assert.equal(job.status, 'running');
    assert.equal(job.telemetry, null);
    await owner.finishJob(id);
    job = (await call(db, 'workspace')).data.jobs[0];
    assert.equal(job.status, 'completed');
    assert.equal(job.telemetry, null);
  } finally {
    close();
  }
});

for (const kind of ['scoring', 'coaching']) {
  test(`late ${kind} result cannot survive interruption or overwrite replacement job`, async () => {
    const { db, close } = setup();
    try {
      const repo = await Repository.forUser(db, 'owner-a');
      const c = await repo.createCall(input);
      await repo.publishRubric({
        title: 'Test rubric',
        definitions,
        approved: true,
      });
      await repo.addDocument({
        title: 'Guide',
        body: 'Confirm the follow-up date.',
        approved: true,
      });
      let oldId;
      let replacementId;
      const invoke = async (_system, payload) => {
        oldId = (
          await db
            .prepare("SELECT id FROM analysis_jobs WHERE status='running'")
            .first()
        ).id;
        await db
          .prepare('UPDATE analysis_jobs SET created_at=? WHERE id=?')
          .bind('2000-01-01T00:00:00.000Z', oldId)
          .run();
        replacementId = await repo.beginJob(c.id, kind, 30);
        return kind === 'scoring'
          ? { dimensions }
          : {
              answer: 'Confirm the date.',
              citations: [
                {
                  chunk_id: payload.sources[0].chunk_id,
                  span: 'Confirm the follow-up date.',
                },
              ],
            };
      };
      const response = await call(
        db,
        `consultations/${c.id}/${kind === 'scoring' ? 'score' : 'coaching'}`,
        'POST',
        { question: 'follow-up' },
        'owner-a',
        invoke,
        { ANTHROPIC_API_KEY: 'test-only', AI_MODEL: 'test-model' },
      );
      assert.equal(response.status, 409);
      const old = await db
        .prepare('SELECT * FROM analysis_jobs WHERE id=?')
        .bind(oldId)
        .first();
      assert.equal(old.status, 'failed');
      assert.equal(old.error_code, 'interrupted');
      await repo.finishJob(oldId);
      assert.deepEqual(
        await db
          .prepare('SELECT * FROM analysis_jobs WHERE id=?')
          .bind(oldId)
          .first(),
        old,
      );
      assert.equal(
        (
          await db
            .prepare('SELECT status FROM analysis_jobs WHERE id=?')
            .bind(replacementId)
            .first()
        ).status,
        'running',
      );
      for (const table of ['assessments', 'coaching_runs'])
        assert.equal(
          (await db.prepare(`SELECT COUNT(*) AS n FROM ${table}`).first()).n,
          0,
        );
      assert.equal(
        (
          await db
            .prepare(
              "SELECT COUNT(*) AS n FROM audit_events WHERE action IN ('assessment_saved','coaching_saved')",
            )
            .first()
        ).n,
        0,
      );
    } finally {
      close();
    }
  });
}

test('AI persistence requires a running job for the same workspace, consultation and operation', async () => {
  const { db, close } = setup();
  try {
    const owner = await Repository.forUser(db, 'owner-a');
    const other = await Repository.forUser(db, 'owner-b');
    const c = await owner.createCall(input);
    const another = await owner.createCall(input);
    const foreign = await other.createCall(input);
    const rubric = await owner.publishRubric({
      title: 'Test',
      definitions,
      approved: true,
    });
    await owner.addDocument({
      title: 'Guide',
      body: 'Confirm the follow-up date.',
      approved: true,
    });
    const [source] = await owner.retrieve('follow-up');
    const scoring = await owner.beginJob(c.id, 'scoring', 30);
    const wrongCall = await owner.beginJob(another.id, 'scoring', 30);
    const wrongWorkspace = await other.beginJob(foreign.id, 'scoring', 30);
    const review = { rubric_id: rubric.id, dimensions };
    for (const job of [undefined, 'missing', wrongCall, wrongWorkspace]) {
      await assert.rejects(
        owner.saveAssessment(c.id, review, 'ai', 'test', 'test', job),
        { status: 409 },
      );
    }
    for (const job of [undefined, scoring, wrongCall, wrongWorkspace]) {
      await assert.rejects(
        owner.saveCoaching(
          c.id,
          'follow-up',
          'Confirm the date.',
          [{ ...source, span: 'Confirm the follow-up date.' }],
          'test',
          [source],
          job,
        ),
        { status: 409 },
      );
    }
    await owner.finishJob(scoring);
    await assert.rejects(
      owner.saveAssessment(c.id, review, 'ai', 'test', 'test', scoring),
      { status: 409 },
    );
    const coaching = await owner.beginJob(c.id, 'coaching', 30);
    await assert.rejects(
      owner.saveAssessment(c.id, review, 'ai', 'test', 'test', coaching),
      { status: 409 },
    );
    await owner.saveAssessment(c.id, review);
    assert.equal((await owner.getCall(c.id)).latest.kind, 'human');
  } finally {
    close();
  }
});

for (const kind of ['scoring', 'coaching']) {
  for (const failure of ['completion', 'audit', 'telemetry']) {
    test(`${kind}: ${failure} failure preserves transaction semantics`, async (t) => {
      const { db, close, failNext } = setup();
      t.mock.method(console, 'warn', () => {});
      try {
        const repo = await Repository.forUser(db, 'owner-a');
        const c = await repo.createCall(input);
        await repo.publishRubric({
          title: 'Test',
          definitions,
          approved: true,
        });
        await repo.addDocument({
          title: 'Guide',
          body: 'Confirm the follow-up date.',
          approved: true,
        });
        const invoke = async (_system, payload) => {
          failNext(
            failure === 'completion'
              ? /UPDATE analysis_jobs SET status='completed'/
              : failure === 'audit'
                ? /INSERT INTO audit_events/
                : /UPDATE analysis_jobs SET telemetry_json=/,
          );
          return kind === 'scoring'
            ? { dimensions }
            : {
                answer: 'Confirm the date.',
                citations: [
                  {
                    chunk_id: payload.sources[0].chunk_id,
                    span: 'Confirm the follow-up date.',
                  },
                ],
              };
        };
        const response = await call(
          db,
          `consultations/${c.id}/${kind === 'scoring' ? 'score' : 'coaching'}`,
          'POST',
          { question: 'follow-up' },
          'owner-a',
          invoke,
          { ANTHROPIC_API_KEY: 'test-only', AI_MODEL: 'test-model' },
        );
        assert.equal(response.status, failure === 'telemetry' ? 201 : 500);
        const table = kind === 'scoring' ? 'assessments' : 'coaching_runs';
        const expected = failure === 'telemetry' ? 1 : 0;
        assert.equal(
          (await db.prepare(`SELECT COUNT(*) AS n FROM ${table}`).first()).n,
          expected,
        );
        assert.equal(
          (
            await db
              .prepare(
                "SELECT COUNT(*) AS n FROM audit_events WHERE action IN ('assessment_saved','coaching_saved')",
              )
              .first()
          ).n,
          expected,
        );
        const job = await db.prepare('SELECT * FROM analysis_jobs').first();
        assert.equal(
          job.status,
          failure === 'telemetry' ? 'completed' : 'failed',
        );
        if (failure === 'telemetry') {
          assert.equal(job.telemetry_json, null);
          const other = await Repository.forUser(db, 'owner-b');
          const measurement = {
            schema_version: 1,
            total_ms: 1,
            model_ms: 1,
            validation_save_ms: 0,
            input_tokens: null,
            output_tokens: null,
          };
          await other.recordCompletedTelemetry(job.id, measurement);
          assert.equal(
            (
              await db
                .prepare('SELECT telemetry_json FROM analysis_jobs')
                .first()
            ).telemetry_json,
            null,
          );
          await repo.recordCompletedTelemetry(job.id, measurement);
          await repo.recordCompletedTelemetry(job.id, {
            ...measurement,
            total_ms: 999,
          });
          assert.equal(
            JSON.parse(
              (
                await db
                  .prepare('SELECT telemetry_json FROM analysis_jobs')
                  .first()
              ).telemetry_json,
            ).total_ms,
            1,
          );
          await repo.finishJob(job.id, 'late_failure');
          assert.equal(
            (await db.prepare('SELECT status FROM analysis_jobs').first())
              .status,
            'completed',
          );
        }
      } finally {
        close();
      }
    });
  }
}

async function learningFixture(db) {
  const repo = await Repository.forUser(db, 'owner-a');
  const c = await repo.createCall(input);
  const rubric = await repo.publishRubric({
    title: 'Reviewed test standard',
    definitions,
    approved: true,
  });
  const baseline = await repo.saveAssessment(c.id, {
    rubric_id: rubric.id,
    dimensions,
  });
  const document = await repo.addDocument({
    title: 'Approved training guidance',
    body: 'Confirm the follow-up date.',
    approved: true,
  });
  const [source] = await repo.retrieve('follow-up');
  const job = await repo.beginJob(c.id, 'coaching', 30);
  const coaching = await repo.saveCoaching(
    c.id,
    'How to confirm follow-up?',
    'Confirm the date.',
    [{ ...source, span: 'Confirm the follow-up date.' }],
    'test-model',
    [source],
    job,
  );
  return { repo, c, rubric, baseline, document, coaching };
}
function assignmentInput(baseline, review = null) {
  return {
    request_id: crypto.randomUUID(),
    baseline_id: baseline.id,
    review_id: review,
    dimension: 0,
    instruction:
      'Practice confirming the next step and ask the patient to restate the date.',
  };
}

test('manual practice works without provider configuration, replays safely and compares pinned human reviews', async () => {
  const { db, close } = setup();
  try {
    const { repo, c, rubric, baseline } = await learningFixture(db);
    const body = assignmentInput(baseline);
    const path = `consultations/${c.id}/practice`;
    const created = await call(db, path, 'POST', body);
    assert.equal(created.status, 201);
    assert.equal((await call(db, path, 'POST', body)).data.id, created.data.id);
    assert.equal(
      (
        await call(db, path, 'POST', {
          ...body,
          instruction: 'Changed instructions',
        })
      ).status,
      409,
    );
    const followup = await repo.createCall({
      ...input,
      title: 'Follow-up practice',
      recorded_at: '2026-09-10',
    });
    const reviewed = await repo.saveAssessment(followup.id, {
      rubric_id: rubric.id,
      dimensions: dimensions.map((d) => ({ ...d, score: 5 })),
    });
    const complete = {
      request_id: crypto.randomUUID(),
      assessment_id: reviewed.id,
      reflection:
        'The coordinator confirmed the date clearly in this role-play.',
    };
    const end = `practice/${created.data.id}/complete`;
    assert.equal((await call(db, end, 'POST', complete)).status, 201);
    assert.equal((await call(db, end, 'POST', complete)).status, 201);
    assert.equal(
      (
        await call(db, end, 'POST', {
          ...complete,
          request_id: crypto.randomUUID(),
        })
      ).status,
      409,
    );
    const data = (await call(db, `consultations/${c.id}/learning`)).data;
    assert.equal(data.assignments[0].baseline.id, baseline.id);
    assert.equal(data.assignments[0].followup.id, reviewed.id);
    assert.equal(
      (
        await db
          .prepare(
            "SELECT COUNT(*) AS n FROM audit_events WHERE action='practice_assigned'",
          )
          .first()
      ).n,
      1,
    );
    assert.equal(
      (
        await db
          .prepare(
            "SELECT COUNT(*) AS n FROM audit_events WHERE action='practice_completed'",
          )
          .first()
      ).n,
      1,
    );
    await repo.deleteCall(followup.id);
    assert.equal(
      (await call(db, `consultations/${c.id}/learning`)).data.assignments[0]
        .completion,
      null,
    );
  } finally {
    close();
  }
});

test('coaching decisions append, stale saves conflict and revoked approvals block practice completion', async () => {
  const { db, close } = setup();
  try {
    const { repo, c, rubric, baseline, coaching } = await learningFixture(db);
    const path = `coaching/${coaching.id}/reviews`;
    const approval = {
      request_id: crypto.randomUUID(),
      base_id: '',
      decision: 'approved',
      guidance: 'Confirm the agreed date and invite the patient to repeat it.',
      notes: 'Checked the quoted guidance and its relevance.',
    };
    assert.equal((await call(db, path, 'POST', approval)).status, 201);
    assert.equal((await call(db, path, 'POST', approval)).status, 201);
    assert.equal(
      (
        await call(db, path, 'POST', {
          ...approval,
          request_id: crypto.randomUUID(),
        })
      ).status,
      409,
    );
    const task = await call(
      db,
      `consultations/${c.id}/practice`,
      'POST',
      assignmentInput(baseline, approval.request_id),
    );
    assert.equal(task.status, 201);
    const rejected = {
      request_id: crypto.randomUUID(),
      base_id: approval.request_id,
      decision: 'rejected',
      notes: 'This advice needs a domain review before use.',
    };
    assert.equal((await call(db, path, 'POST', rejected)).status, 201);
    assert.equal(
      (
        await call(
          db,
          `consultations/${c.id}/practice`,
          'POST',
          assignmentInput(baseline, approval.request_id),
        )
      ).status,
      409,
    );
    const f = await repo.createCall({ ...input, recorded_at: '2026-09-10' });
    const assessment = await repo.saveAssessment(f.id, {
      rubric_id: rubric.id,
      dimensions,
    });
    assert.equal(
      (
        await call(db, `practice/${task.data.id}/complete`, 'POST', {
          request_id: crypto.randomUUID(),
          assessment_id: assessment.id,
          reflection: 'Checked the role-play.',
        })
      ).status,
      409,
    );
    assert.equal(
      (await call(db, `consultations/${c.id}/learning`)).data.reviews.length,
      2,
    );
  } finally {
    close();
  }
});

test('learning operations reject foreign identities, mismatched rubrics, earlier and same consultations', async () => {
  const { db, close } = setup();
  try {
    const { repo, c, rubric, baseline, coaching } = await learningFixture(db);
    assert.equal(
      (
        await call(
          db,
          `consultations/${c.id}/learning`,
          'GET',
          undefined,
          'owner-b',
        )
      ).status,
      404,
    );
    assert.equal(
      (
        await call(
          db,
          `consultations/${c.id}/practice`,
          'POST',
          assignmentInput(baseline),
          'owner-b',
        )
      ).status,
      409,
    );
    assert.equal(
      (
        await call(
          db,
          `coaching/${coaching.id}/reviews`,
          'POST',
          {
            request_id: crypto.randomUUID(),
            decision: 'approved',
            guidance: 'Valid guidance text.',
            notes: 'Checked the source.',
          },
          'owner-b',
        )
      ).status,
      409,
    );
    const task = (
      await call(
        db,
        `consultations/${c.id}/practice`,
        'POST',
        assignmentInput(baseline),
      )
    ).data;
    const wrongRubric = await repo.publishRubric({
      title: 'Other test rubric',
      definitions,
      approved: true,
    });
    for (const [coordinator, date, rubricId] of [
      ['Different person', '2026-09-10', rubric.id],
      [input.coordinator, '2020-01-01', rubric.id],
      [input.coordinator, '2026-09-10', wrongRubric.id],
    ]) {
      const f = await repo.createCall({
        ...input,
        coordinator,
        recorded_at: date,
      });
      const a = await repo.saveAssessment(f.id, {
        rubric_id: rubricId,
        dimensions,
      });
      assert.equal(
        (
          await call(db, `practice/${task.id}/complete`, 'POST', {
            request_id: crypto.randomUUID(),
            assessment_id: a.id,
            reflection: 'Human reflection.',
          })
        ).status,
        409,
      );
    }
    assert.equal(
      (
        await call(db, `practice/${task.id}/complete`, 'POST', {
          request_id: crypto.randomUUID(),
          assessment_id: baseline.id,
          reflection: 'Human reflection.',
        })
      ).status,
      409,
    );
    assert.equal(
      (
        await call(
          db,
          `practice/${task.id}/complete`,
          'POST',
          {
            request_id: crypto.randomUUID(),
            assessment_id: baseline.id,
            reflection: 'Human reflection.',
          },
          'owner-b',
        )
      ).status,
      409,
    );
    assert.equal(
      (
        await call(db, `consultations/${c.id}/practice`, 'POST', {
          ...assignmentInput(baseline),
          dimension: 9,
        })
      ).status,
      422,
    );
  } finally {
    close();
  }
});

test('deleting approved sources removes linked learning content but preserves independent manual practice', async () => {
  const { db, close } = setup();
  try {
    const { repo, c, baseline, coaching } = await learningFixture(db);
    const review = {
      request_id: crypto.randomUUID(),
      decision: 'approved',
      guidance: 'Confirm the date.',
      notes: 'Source checked.',
    };
    await call(db, `coaching/${coaching.id}/reviews`, 'POST', review);
    await call(
      db,
      `consultations/${c.id}/practice`,
      'POST',
      assignmentInput(baseline, review.request_id),
    );
    const manual = await call(
      db,
      `consultations/${c.id}/practice`,
      'POST',
      assignmentInput(baseline),
    );
    const doc = await db.prepare('SELECT id FROM knowledge_documents').first();
    await repo.deleteDocument(doc.id);
    const data = (await call(db, `consultations/${c.id}/learning`)).data;
    assert.equal(data.reviews.length, 0);
    assert.deepEqual(
      data.assignments.map((a) => a.id),
      [manual.data.id],
    );
    await repo.deleteCall(c.id);
    assert.equal(
      (
        await db
          .prepare('SELECT COUNT(*) AS n FROM practice_assignments')
          .first()
      ).n,
      0,
    );
  } finally {
    close();
  }
});

test('learning audit failure rolls back assignment and allows an identical retry', async (t) => {
  const { db, close, failNext } = setup();
  t.mock.method(console, 'error', () => {});
  try {
    const { c, baseline } = await learningFixture(db);
    const body = assignmentInput(baseline),
      path = `consultations/${c.id}/practice`;
    failNext(/INSERT INTO audit_events/);
    assert.equal((await call(db, path, 'POST', body)).status, 500);
    assert.equal(
      (
        await db
          .prepare('SELECT COUNT(*) AS n FROM practice_assignments')
          .first()
      ).n,
      0,
    );
    assert.equal((await call(db, path, 'POST', body)).status, 201);
  } finally {
    close();
  }
});

test('concurrent replay creates one decision and one audit; competing revisions have one winner', async () => {
  const { db, close } = setup();
  try {
    const { coaching } = await learningFixture(db),
      path = `coaching/${coaching.id}/reviews`;
    const input = {
      request_id: crypto.randomUUID(),
      base_id: '',
      decision: 'approved',
      guidance: 'Confirm the date with the patient.',
      notes: 'Checked against the source.',
    };
    const replay = await Promise.all([
      call(db, path, 'POST', input),
      call(db, path, 'POST', input),
    ]);
    assert.deepEqual(
      replay.map((r) => r.status),
      [201, 201],
    );
    assert.equal(
      (
        await db
          .prepare(
            "SELECT COUNT(*) AS n FROM audit_events WHERE action='coaching_reviewed'",
          )
          .first()
      ).n,
      1,
    );
    const competing = await Promise.all([
      call(db, path, 'POST', {
        ...input,
        request_id: crypto.randomUUID(),
        base_id: input.request_id,
      }),
      call(db, path, 'POST', {
        ...input,
        request_id: crypto.randomUUID(),
        base_id: input.request_id,
        decision: 'rejected',
      }),
    ]);
    assert.deepEqual(
      competing.map((r) => r.status).sort((a, b) => a - b),
      [201, 409],
    );
    assert.equal(
      (await db.prepare('SELECT COUNT(*) AS n FROM coaching_reviews').first())
        .n,
      2,
    );
  } finally {
    close();
  }
});

test('practice rejects AI baselines and AI follow-ups and keeps original baseline after a later revision', async () => {
  const { db, close } = setup();
  try {
    const { repo, c, rubric, baseline } = await learningFixture(db);
    const task = (
      await call(
        db,
        `consultations/${c.id}/practice`,
        'POST',
        assignmentInput(baseline),
      )
    ).data;
    const job = await repo.beginJob(c.id, 'scoring', 30);
    const ai = await repo.saveAssessment(
      c.id,
      { rubric_id: rubric.id, base_assessment_id: baseline.id, dimensions },
      'ai',
      'test',
      'test',
      job,
    );
    assert.equal(
      (
        await call(
          db,
          `consultations/${c.id}/practice`,
          'POST',
          assignmentInput(ai),
        )
      ).status,
      409,
    );
    assert.equal(
      (
        await call(
          db,
          `consultations/${c.id}/practice`,
          'POST',
          assignmentInput(baseline),
        )
      ).status,
      409,
    );
    const f = await repo.createCall({ ...input, recorded_at: '2026-09-10' }),
      j = await repo.beginJob(f.id, 'scoring', 30);
    const a = await repo.saveAssessment(
      f.id,
      { rubric_id: rubric.id, dimensions },
      'ai',
      'test',
      'test',
      j,
    );
    assert.equal(
      (
        await call(db, `practice/${task.id}/complete`, 'POST', {
          request_id: crypto.randomUUID(),
          assessment_id: a.id,
          reflection: 'Review needed.',
        })
      ).status,
      409,
    );
    assert.equal(
      (await call(db, `consultations/${c.id}/learning`)).data.assignments[0]
        .baseline.id,
      baseline.id,
    );
  } finally {
    close();
  }
});

test('historical rubric versions remain available only in their workspace for follow-up review', async () => {
  const { db, close } = setup();
  try {
    const { repo, c, rubric, baseline } = await learningFixture(db);
    const task = (
      await call(
        db,
        `consultations/${c.id}/practice`,
        'POST',
        assignmentInput(baseline),
      )
    ).data;
    await repo.publishRubric({
      title: 'New standard',
      definitions,
      approved: true,
    });
    assert.equal((await call(db, `rubrics/${rubric.id}`)).data.id, rubric.id);
    assert.equal(
      (await call(db, `rubrics/${rubric.id}`, 'GET', undefined, 'owner-b'))
        .status,
      404,
    );
    assert.deepEqual(
      (await call(db, 'rubrics', 'GET', undefined, 'owner-b')).data.rubrics,
      [],
    );
    assert.equal((await call(db, 'rubrics')).data.rubrics.length, 2);
    const next = await repo.createCall({ ...input, recorded_at: '2026-09-10' });
    const oldVersionReview = await repo.saveAssessment(next.id, {
      rubric_id: rubric.id,
      dimensions,
    });
    assert.equal(
      (
        await call(db, `practice/${task.id}/complete`, 'POST', {
          request_id: crypto.randomUUID(),
          assessment_id: oldVersionReview.id,
          reflection: 'Reassessed using the pinned rubric.',
        })
      ).status,
      201,
    );
  } finally {
    close();
  }
});
