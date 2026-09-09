import { test } from 'node:test';
import assert from 'node:assert/strict';
import { DatabaseSync } from 'node:sqlite';
import { readFileSync, readdirSync } from 'node:fs';
import { handleApi } from '../server/handler.ts';
import { Repository } from '../server/repository.ts';
function setup() {
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
          const result = prepared.run(...parameters);
          return { meta: { changes: Number(result.changes) } };
        },
      };
    },
    async batch(statements) {
      sql.exec('BEGIN');
      try {
        const results = [];
        for (const statement of statements) results.push(await statement.run());
        sql.exec('COMMIT');
        return results;
      } catch (e) {
        sql.exec('ROLLBACK');
        throw e;
      }
    },
  };
  return { db, close: () => sql.close() };
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
      async (_system, input) => ({
        answer: 'Confirm the date and name the owner.',
        citations: [
          {
            chunk_id: input.sources[0].chunk_id,
            span: 'Confirm the follow-up date',
          },
        ],
      }),
      env,
    );
    assert.equal(good.status, 201);
    const bad = await call(
      db,
      `consultations/${c.id}/coaching`,
      'POST',
      { question: 'How should I confirm follow-up?' },
      'owner-a',
      async () => ({
        answer: 'Unsupported advice.',
        citations: [{ chunk_id: 'invented', span: 'Invented guidance' }],
      }),
      env,
    );
    assert.equal(bad.status, 422);
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
