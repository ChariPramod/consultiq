import { createHash } from 'node:crypto';

const hash = (value) =>
  createHash('sha256').update(JSON.stringify(value)).digest('hex');
const quote = (name) => `"${name.replaceAll('"', '""')}"`;
const plain = (rows) =>
  rows.map((row) => Object.fromEntries(Object.entries(row)));

async function describe(tx) {
  const schema = plain(
    (
      await tx.execute(
        "SELECT type,name,tbl_name,sql FROM sqlite_master WHERE name NOT LIKE 'sqlite_%' ORDER BY type,name",
      )
    ).rows,
  );
  const tables = schema
    .filter(
      (entry) =>
        entry.type === 'table' && entry.name !== 'consultiq_migrations',
    )
    .map((entry) => entry.name);
  const columns = {};
  for (const table of tables) {
    columns[table] = (
      await tx.execute(`PRAGMA table_info(${quote(table)})`)
    ).rows.map((row) => row.name);
    if (table !== 'workspaces' && !columns[table].includes('workspace_id'))
      throw new Error('Unscoped table requires an explicit backup policy.');
  }
  const migrations = plain(
    (
      await tx.execute(
        'SELECT position,name,checksum FROM consultiq_migrations ORDER BY position',
      )
    ).rows,
  );
  return { tables, columns, fingerprint: hash({ schema, migrations }) };
}

function validate(backup, schema) {
  if (
    backup?.format !== 'consultiq-workspace-backup-v1' ||
    !backup.payload ||
    hash(backup.payload) !== backup.checksum
  )
    throw new Error('Invalid backup or checksum.');
  const { workspaceId, fingerprint, tables } = backup.payload;
  if (
    typeof workspaceId !== 'string' ||
    !workspaceId ||
    fingerprint !== schema.fingerprint ||
    !tables ||
    Object.keys(tables).sort().join() !== schema.tables.slice().sort().join()
  )
    throw new Error('Backup schema does not match destination.');
  for (const table of schema.tables) {
    if (!Array.isArray(tables[table])) throw new Error('Invalid rows.');
    if (table === 'workspace_invitations' && tables[table].length)
      throw new Error('Invitation credentials cannot be restored.');
    for (const row of tables[table]) {
      if (
        !row ||
        Object.keys(row).sort().join() !==
          schema.columns[table].slice().sort().join()
      )
        throw new Error('Invalid columns.');
      if ((table === 'workspaces' ? row.id : row.workspace_id) !== workspaceId)
        throw new Error('Backup crosses workspace boundary.');
      if (
        Object.values(row).some(
          (value) =>
            value !== null &&
            typeof value !== 'string' &&
            !(typeof value === 'number' && Number.isFinite(value)),
        )
      )
        throw new Error('Unsupported backup value.');
      if (
        table === 'analysis_jobs' &&
        ['queued', 'running'].includes(row.status)
      )
        throw new Error('Quiesce analysis before backup or restore.');
    }
  }
  if (tables.workspaces?.length !== 1)
    throw new Error('Exactly one workspace is required.');
}

/** One read transaction pins the schema and every workspace table to one snapshot. */
export async function backupWorkspace(client, workspaceId) {
  if (typeof workspaceId !== 'string' || !workspaceId.trim())
    throw new Error('Workspace ID required.');
  const tx = await client.transaction('read');
  try {
    const schema = await describe(tx);
    const tables = {};
    for (const table of schema.tables) {
      if (table === 'workspace_invitations') {
        tables[table] = [];
        continue;
      }
      tables[table] = plain(
        (
          await tx.execute({
            sql: `SELECT * FROM ${quote(table)} WHERE ${table === 'workspaces' ? 'id' : 'workspace_id'} = ? ORDER BY rowid`,
            args: [workspaceId],
          })
        ).rows,
      );
    }
    const payload = {
      workspaceId,
      createdAt: new Date().toISOString(),
      fingerprint: schema.fingerprint,
      tables,
    };
    const backup = {
      format: 'consultiq-workspace-backup-v1',
      payload,
      checksum: hash(payload),
    };
    validate(backup, schema);
    await tx.commit();
    return backup;
  } finally {
    if (!tx.closed) await tx.rollback();
    tx.close();
  }
}

/** No overwrite mode: all app tables must be empty under the same write lock. */
export async function restoreWorkspace(client, backup) {
  const tx = await client.transaction('write');
  try {
    if (
      Number(
        (await tx.execute('PRAGMA foreign_keys')).rows[0]?.foreign_keys,
      ) !== 1
    )
      throw new Error('Foreign keys required.');
    const schema = await describe(tx);
    validate(backup, schema);
    for (const table of schema.tables) {
      if (
        (await tx.execute(`SELECT 1 FROM ${quote(table)} LIMIT 1`)).rows.length
      )
        throw new Error('Destination must be empty.');
    }
    await tx.execute('PRAGMA defer_foreign_keys = ON');
    for (const table of schema.tables) {
      const columns = schema.columns[table];
      for (const row of backup.payload.tables[table]) {
        await tx.execute({
          sql: `INSERT INTO ${quote(table)} (${columns.map(quote).join(',')}) VALUES (${columns.map(() => '?').join(',')})`,
          args: columns.map((column) => row[column]),
        });
      }
    }
    if ((await tx.execute('PRAGMA foreign_key_check')).rows.length)
      throw new Error('Backup contains invalid references.');
    await tx.commit();
    return {
      tables: schema.tables.length,
      rows: Object.values(backup.payload.tables).reduce(
        (sum, rows) => sum + rows.length,
        0,
      ),
    };
  } finally {
    if (!tx.closed) await tx.rollback();
    tx.close();
  }
}
