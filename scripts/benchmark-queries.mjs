import { mkdtemp, rm } from 'node:fs/promises';
import { tmpdir } from 'node:os';
import { join } from 'node:path';
import { pathToFileURL } from 'node:url';
import { performance } from 'node:perf_hooks';
import { createDatabase } from '../server/database.ts';
import { Repository } from '../server/repository.ts';
import { queryConsultations } from '../server/consultation-query.ts';
import { queryPracticeInbox } from '../server/practice-inbox.ts';
import { queryFollowupCandidates } from '../server/followup-candidates.ts';
import { readMigrations } from './migrate-local.mjs';

// Disposable local synthetic data only. No .env loading, remote connection,
// provider invocation, actual transcript, or write to an existing database.
const directory = await mkdtemp(join(tmpdir(), 'consultiq-query-benchmark-'));
let db;
try {
  const migrations = await readMigrations();
  const boundary = migrations.findIndex(
    (m) => m.name === '0006_gray_polaris.sql',
  );
  if (boundary < 0) throw Error('Required comparison migration is missing.');
  const reports = {};
  for (const phase of ['before', 'after']) {
    db = await createDatabase({
      DATABASE_URL: pathToFileURL(join(directory, `${phase}.db`)).href,
    });
    for (const migration of phase === 'before'
      ? migrations.slice(0, boundary)
      : migrations.slice(0, boundary + 1))
      for (const sql of migration.statements) await db.client.execute(sql);
    const stamp = '2026-09-22T10:00:00.000Z';
    const pending = [];
    const seed = async (sql, args) => {
      pending.push({ sql, args });
      if (pending.length >= 200) {
        await db.client.batch(pending.splice(0), 'write');
      }
    };
    const pad = (n) => String(n).padStart(8, '0');
    for (const workspace of ['workspace-a', 'workspace-b']) {
      await seed('INSERT INTO workspaces VALUES (?,?,?,?)', [
        workspace,
        `${workspace}-owner`,
        'Synthetic benchmark',
        stamp,
      ]);
      await seed('INSERT INTO rubrics VALUES (?,?,?,?,?)', [
        `${workspace}-rubric`,
        workspace,
        'Mechanical fixture',
        '[]',
        stamp,
      ]);
      for (let i = 0; i < 800; i++) {
        const call = `${workspace}-call-${pad(i)}`;
        await seed(
          'INSERT INTO consultations(id,workspace_id,title,coordinator,source,outcome,turns,recorded_at,created_at) VALUES (?,?,?,?,?,?,?,?,?)',
          [
            call,
            workspace,
            'Synthetic role-play',
            `Coordinator ${i % 20}`,
            'synthetic',
            'unknown',
            JSON.stringify([
              {
                speaker: 'coordinator',
                text: 'Synthetic role-play passage. '.repeat(20),
              },
            ]),
            '2026-09-22',
            stamp,
          ],
        );
        for (let revision = 0; revision < 4; revision++)
          await seed(
            'INSERT INTO assessments(id,workspace_id,call_id,rubric_id,kind,content,prompt_version,model,created_at) VALUES (?,?,?,?,?,?,?,?,?)',
            [
              `${call}-revision-${revision}`,
              workspace,
              call,
              `${workspace}-rubric`,
              'human',
              JSON.stringify({
                average: null,
                supported_count: 0,
                dimensions: [{ dimension: 0, score: null, evidence: [] }],
              }),
              'fixture',
              'human',
              stamp,
            ],
          );
        await seed(
          'INSERT INTO practice_assignments(id,workspace_id,call_id,baseline_id,dimension,instruction,created_at) VALUES (?,?,?,?,?,?,?)',
          [
            `${call}-practice`,
            workspace,
            call,
            `${call}-revision-3`,
            0,
            'Synthetic practice instruction',
            stamp,
          ],
        );
        await seed(
          'INSERT INTO analysis_jobs(id,workspace_id,call_id,kind,status,created_at) VALUES (?,?,?,?,?,?)',
          [
            `${call}-job`,
            workspace,
            call,
            'scoring',
            i % 4 === 0 ? 'queued' : 'completed',
            stamp,
          ],
        );
      }
      for (let d = 0; d < 50; d++) {
        const document = `${workspace}-document-${pad(d)}`;
        const body = `Synthetic guidance ${d}. `.repeat(400);
        await seed(
          'INSERT INTO knowledge_documents(id,workspace_id,title,body,created_at) VALUES (?,?,?,?,?)',
          [document, workspace, 'Synthetic library source', body, stamp],
        );
        for (let c = 0; c < 5; c++)
          await seed(
            'INSERT INTO knowledge_chunks(id,workspace_id,document_id,position,body) VALUES (?,?,?,?,?)',
            [
              `${document}-chunk-${c}`,
              workspace,
              document,
              c,
              body.slice(c * 1800, (c + 1) * 1800),
            ],
          );
      }
    }
    if (pending.length) await db.client.batch(pending, 'write');
    const repo = new Repository(db, 'workspace-a');
    const captured = [];
    const original = repo.statement.bind(repo);
    repo.statement = (sql, ...args) => {
      captured.push({ sql, args });
      return original(sql, ...args);
    };
    await queryConsultations(repo, new URLSearchParams());
    const consultations = captured.find(({ sql }) =>
      sql.includes('ORDER BY c.created_at DESC,c.id DESC LIMIT'),
    );
    captured.length = 0;
    await queryPracticeInbox(repo, new URLSearchParams());
    const practice = captured.find(({ sql }) =>
      sql.includes('ORDER BY p.created_at ASC,p.id ASC LIMIT'),
    );
    captured.length = 0;
    await repo.getCall('workspace-a-call-00000000');
    const latest = captured.find(({ sql }) => sql.includes('FROM assessments'));
    captured.length = 0;
    await repo.retrieve('synthetic guidance');
    const retrieval = captured[0];
    captured.length = 0;
    await queryFollowupCandidates(
      repo,
      'workspace-a-call-00000000-practice',
      new URLSearchParams(),
    );
    const followup = captured.find(({ sql }) =>
      sql.includes('ORDER BY c.recorded_at DESC,c.id DESC LIMIT'),
    );
    const queries = {
      consultation_page: consultations,
      latest_assessment: latest,
      practice_page: practice,
      retrieval_candidates: retrieval,
      dispatcher_candidate: {
        sql: "SELECT id,workspace_id FROM analysis_jobs WHERE status='queued' ORDER BY created_at,id LIMIT 1",
        args: [],
      },
      active_call_guard: {
        sql: "SELECT 1 FROM analysis_jobs WHERE workspace_id=? AND call_id=? AND status IN ('queued','running')",
        args: ['workspace-a', 'workspace-a-call-00000000'],
      },
      followup_candidates: followup,
    };
    const measure = async () => {
      const result = {};
      for (const [name, query] of Object.entries(queries)) {
        if (!query) throw Error(`Query capture missing: ${name}`);
        const plan = (
          await db.client.execute({
            ...query,
            sql: 'EXPLAIN QUERY PLAN ' + query.sql,
          })
        ).rows.map((r) => String(r.detail));
        for (let i = 0; i < 5; i++) await db.client.execute(query);
        const durations = [];
        for (let i = 0; i < 25; i++) {
          const start = performance.now();
          await db.client.execute(query);
          durations.push(performance.now() - start);
        }
        durations.sort((a, b) => a - b);
        result[name] = {
          plan,
          median_ms: Number(durations[12].toFixed(3)),
          p95_ms: Number(durations[23].toFixed(3)),
        };
      }
      const pages = Number(
        (await db.client.execute('PRAGMA page_count')).rows[0].page_count,
      );
      const pageSize = Number(
        (await db.client.execute('PRAGMA page_size')).rows[0].page_size,
      );
      const freePages = Number(
        (await db.client.execute('PRAGMA freelist_count')).rows[0]
          .freelist_count,
      );
      return {
        queries: result,
        allocated_local_database_bytes: pages * pageSize,
        occupied_local_database_page_bytes: (pages - freePages) * pageSize,
      };
    };
    reports[phase] = await measure();
    db.close();
  }
  console.log(
    JSON.stringify(
      {
        scope:
          'Disposable local synthetic SQLite. Not hosted latency, capacity or billing evidence.',
        dataset: {
          workspaces: 2,
          consultations: 1600,
          assessment_revisions: 6400,
          practice_assignments: 1600,
          analysis_jobs: 1600,
          library_documents: 100,
          library_chunks: 500,
        },
        method: {
          warmup_runs: 5,
          measured_runs: 25,
          before_migration: '0005',
          after_migration: migrations[boundary].name,
          library_hashes: 'Legacy nulls retained; no backfill.',
        },
        ...reports,
      },
      null,
      2,
    ),
  );
} finally {
  db?.close();
  await rm(directory, { recursive: true, force: true });
}
