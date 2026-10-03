import { mkdtemp, rm } from 'node:fs/promises';
import { tmpdir } from 'node:os';
import { join } from 'node:path';
import { pathToFileURL } from 'node:url';
import { performance } from 'node:perf_hooks';
import { createDatabase } from '../server/database.ts';
import { Repository } from '../server/repository.ts';
import { queryJobs } from '../server/job-query.ts';
import { queryAuditEvents } from '../server/audit-query.ts';
import { readMigrations } from './migrate-local.mjs';

// No environment loading or remote access. Each disposable database receives
// identical synthetic records; only the after database receives the new migration.
const directory = await mkdtemp(join(tmpdir(), 'consultiq-history-benchmark-'));
let db;
try {
  const migrations = await readMigrations();
  const boundary = migrations.findIndex(
    (m) => m.name === '0007_sharp_menace.sql',
  );
  if (boundary < 0) throw Error('Required comparison migration is missing.');
  const reports = {};
  for (const phase of ['before', 'after']) {
    db = await createDatabase({
      DATABASE_URL: pathToFileURL(join(directory, `${phase}.db`)).href,
    });
    for (const migration of migrations.slice(0, boundary))
      for (const sql of migration.statements) await db.client.execute(sql);
    const pending = [];
    const seed = async (sql, args) => {
      pending.push({ sql, args });
      if (pending.length >= 200)
        await db.client.batch(pending.splice(0), 'write');
    };
    const pad = (n) => String(n).padStart(5, '0');
    const stamp = (i) =>
      new Date(Date.UTC(2026, 8, 1, 0, Math.floor(i / 100))).toISOString();
    for (const workspace of ['workspace-a', 'workspace-b']) {
      await seed('INSERT INTO workspaces VALUES (?,?,?,?)', [
        workspace,
        `${workspace}-owner`,
        'Synthetic benchmark',
        stamp(0),
      ]);
      await seed(
        'INSERT INTO consultations(id,workspace_id,title,coordinator,source,outcome,turns,recorded_at,created_at) VALUES (?,?,?,?,?,?,?,?,?)',
        [
          `${workspace}-call`,
          workspace,
          'Synthetic role-play',
          'Fixture',
          'synthetic',
          'unknown',
          '[]',
          '2026-09-01',
          stamp(0),
        ],
      );
      for (let i = 0; i < 10000; i++) {
        await seed(
          'INSERT INTO analysis_jobs(id,workspace_id,call_id,kind,status,created_at,payload_json,requested_by,telemetry_json) VALUES (?,?,?,?,?,?,?,?,?)',
          [
            `${workspace}-job-${pad(i)}`,
            workspace,
            `${workspace}-call`,
            'scoring',
            i < 50 ? (i % 2 ? 'running' : 'queued') : 'completed',
            stamp(i),
            JSON.stringify({ synthetic: 'Disposable fixture '.repeat(50) }),
            `${workspace}-owner`,
            null,
          ],
        );
        await seed(
          'INSERT INTO audit_events(id,workspace_id,action,entity_id,created_at,actor_id) VALUES (?,?,?,?,?,?)',
          [
            `${workspace}-event-${pad(i)}`,
            workspace,
            i % 4 ? 'assessment_saved' : 'consultation_created',
            `${workspace}-call`,
            stamp(i),
            `${workspace}-owner`,
          ],
        );
      }
    }
    if (pending.length) await db.client.batch(pending, 'write');
    if (phase === 'after')
      for (const sql of migrations[boundary].statements)
        await db.client.execute(sql);
    const repo = new Repository(db, 'workspace-a', 'workspace-a-owner');
    const captured = [];
    const original = repo.statement.bind(repo);
    repo.statement = (sql, ...args) => {
      captured.push({ sql, args });
      return original(sql, ...args);
    };
    const captureJobs = async (cursor) => {
      captured.length = 0;
      const params = new URLSearchParams(cursor ? { cursor } : {});
      await queryJobs(repo, params, 'owner');
      return captured.find(({ sql }) => sql.includes('FROM analysis_jobs j'));
    };
    const cursor = Buffer.from(
      JSON.stringify({
        version: 1,
        scope: JSON.stringify(['workspace-a', '', 'all', 'all']),
        created_at: stamp(5000),
        id: 'workspace-a-job-05000',
      }),
    ).toString('base64url');
    const history = await captureJobs();
    const historyDeep = await captureJobs(cursor);
    captured.length = 0;
    await repo.overview();
    const bootstrap = captured.find(({ sql }) =>
      sql.includes('WITH active AS'),
    );
    if (!bootstrap) throw Error('Production bootstrap query was not captured.');
    const oldHistoryDeep = {
      sql: historyDeep.sql.replace(
        '(j.created_at,j.id)<(?,?)',
        '(j.created_at<? OR (j.created_at=? AND j.id<?))',
      ),
      args: [
        ...historyDeep.args.slice(0, -3),
        stamp(5000),
        stamp(5000),
        'workspace-a-job-05000',
        historyDeep.args.at(-1),
      ],
    };
    captured.length = 0;
    await queryAuditEvents(
      repo,
      new URLSearchParams({
        cursor: Buffer.from(
          JSON.stringify({
            version: 1,
            scope: JSON.stringify(['workspace-a', 'all']),
            created_at: stamp(5000),
            id: 'workspace-a-event-05000',
          }),
        ).toString('base64url'),
      }),
    );
    const audit = captured.find(({ sql }) => sql.includes('FROM audit_events'));
    if (!audit) throw Error('Production audit query was not captured.');
    const oldBootstrap = {
      sql: "SELECT id,call_id,kind,status,error_code,created_at,telemetry_json FROM analysis_jobs WHERE workspace_id=? ORDER BY CASE WHEN status IN ('queued','running') THEN 0 ELSE 1 END,created_at DESC,rowid DESC LIMIT 200",
      args: ['workspace-a'],
    };
    const measure = async (queries) => {
      const measurements = {};
      for (const [name, query] of Object.entries(queries)) {
        const plan = (
          await db.client.execute({
            ...query,
            sql: 'EXPLAIN QUERY PLAN ' + query.sql,
          })
        ).rows.map((r) => String(r.detail));
        for (let i = 0; i < 5; i++) await db.client.execute(query);
        const durations = [];
        for (let i = 0; i < 25; i++) {
          const started = performance.now();
          await db.client.execute(query);
          durations.push(performance.now() - started);
        }
        durations.sort((a, b) => a - b);
        measurements[name] = {
          plan,
          median_ms: Number(durations[12].toFixed(3)),
          p95_ms: Number(durations[23].toFixed(3)),
        };
      }
      const scalar = async (sql, key) =>
        Number((await db.client.execute(sql)).rows[0][key]);
      const pages = await scalar('PRAGMA page_count', 'page_count');
      const freePages = await scalar('PRAGMA freelist_count', 'freelist_count');
      const pageSize = await scalar('PRAGMA page_size', 'page_size');
      let indexBytes;
      try {
        indexBytes = (
          await db.client.execute(
            "SELECT d.name,SUM(d.pgsize) AS bytes FROM dbstat d JOIN sqlite_master s ON s.name=d.name WHERE s.type='index' AND (d.name LIKE 'jobs_%' OR d.name LIKE 'audit_%') GROUP BY d.name ORDER BY d.name",
          )
        ).rows.map((row) => ({
          name: String(row.name),
          bytes: Number(row.bytes),
        }));
      } catch {
        indexBytes = null; // Some SQLite builds do not expose dbstat.
      }
      return {
        queries: measurements,
        allocated_local_database_bytes: pages * pageSize,
        occupied_local_database_page_bytes: (pages - freePages) * pageSize,
        index_bytes: indexBytes,
      };
    };
    reports[phase] = await measure({
      bootstrap_jobs: phase === 'before' ? oldBootstrap : bootstrap,
      history_first_page: history,
      history_deep_page: phase === 'before' ? oldHistoryDeep : historyDeep,
      audit_deep_page: audit,
    });
    db.close();
  }
  const { before, after } = reports;
  console.log(
    JSON.stringify(
      {
        scope:
          'Disposable local synthetic libSQL; not hosted latency, capacity or billing evidence. No vacuum or content deletion.',
        dataset: {
          workspaces: 2,
          consultations: 2,
          analysis_jobs: 20000,
          audit_events: 20000,
          active_jobs: 100,
          equal_timestamp_groups: 100,
        },
        method: {
          warmup_runs: 5,
          measured_runs: 25,
          before_migration: migrations[boundary - 1].name,
          after_migration: migrations[boundary].name,
          bootstrap_and_job_sql:
            'Captured from production functions; before bootstrap and cursor retain previous implementation.',
          audit_sql:
            'Captured from production function; same query in both phases to isolate index effect.',
        },
        before,
        after,
        occupied_local_database_change_bytes:
          after.occupied_local_database_page_bytes -
          before.occupied_local_database_page_bytes,
      },
      null,
      2,
    ),
  );
} finally {
  db?.close();
  await rm(directory, { recursive: true, force: true });
}
