import {
  createClient,
  type Client,
  type Config,
  type InArgs,
} from '@libsql/client';
import type { Database, Statement } from './repository.ts';

export type DatabaseEnvironment = {
  [key: string]: string | undefined;
  DATABASE_URL?: string;
  DATABASE_AUTH_TOKEN?: string;
  VERCEL?: string;
};

/** Explicit storage only: a serverless filesystem is never a persistent database. */
export function databaseConfig(env: DatabaseEnvironment): Config {
  const value = env.DATABASE_URL?.trim();
  if (!value) throw new Error('DATABASE_URL is required.');
  let url: URL;
  try {
    url = new URL(value);
  } catch {
    throw new Error('DATABASE_URL must be a valid URL.');
  }
  if (url.protocol === 'file:') {
    if (env.VERCEL)
      throw new Error('File databases are not supported on Vercel.');
    if (value.includes(':memory:'))
      throw new Error('Use an explicit persistent database file.');
  } else if (url.protocol !== 'libsql:' && url.protocol !== 'https:') {
    throw new Error('Use a file, libsql, or HTTPS database URL.');
  } else if (!env.DATABASE_AUTH_TOKEN?.trim()) {
    throw new Error('DATABASE_AUTH_TOKEN is required for a remote database.');
  }
  if (url.username || url.password || url.search || url.hash) {
    throw new Error(
      'Database credentials and connection options must not be embedded in DATABASE_URL.',
    );
  }
  return {
    url: value,
    authToken: env.DATABASE_AUTH_TOKEN?.trim(),
    intMode: 'number',
  };
}

class LibsqlStatement implements Statement {
  readonly database: LibsqlDatabase;
  readonly sql: string;
  readonly args: InArgs;
  constructor(database: LibsqlDatabase, sql: string, args: InArgs = []) {
    this.database = database;
    this.sql = sql;
    this.args = args;
  }
  bind(...values: unknown[]): Statement {
    // Preserve null explicitly; undefined usually indicates a repository bug.
    for (const value of values) {
      if (
        value !== null &&
        typeof value !== 'string' &&
        typeof value !== 'number' &&
        typeof value !== 'bigint' &&
        !(value instanceof Uint8Array) &&
        !(value instanceof ArrayBuffer)
      ) {
        throw new TypeError('Unsupported SQL parameter.');
      }
    }
    return new LibsqlStatement(this.database, this.sql, values as InArgs);
  }
  async first<T = Record<string, unknown>>(): Promise<T | null> {
    const result = await this.database.client.execute({
      sql: this.sql,
      args: this.args,
    });
    return result.rows.length ? ({ ...result.rows[0] } as T) : null;
  }
  async all<T = Record<string, unknown>>(): Promise<{ results: T[] }> {
    const result = await this.database.client.execute({
      sql: this.sql,
      args: this.args,
    });
    return { results: result.rows.map((row) => ({ ...row }) as T) };
  }
  async run() {
    const result = await this.database.client.execute({
      sql: this.sql,
      args: this.args,
    });
    return { meta: { changes: result.rowsAffected } };
  }
}

/** libSQL batch runs in one write transaction, including changes()-gated audits. */
export class LibsqlDatabase implements Database {
  readonly client: Client;
  constructor(client: Client) {
    this.client = client;
  }
  prepare(sql: string): Statement {
    return new LibsqlStatement(this, sql);
  }
  async batch(statements: Statement[]) {
    const queries = statements.map((statement) => {
      if (
        !(statement instanceof LibsqlStatement) ||
        statement.database !== this
      ) {
        throw new TypeError('Batch statements must belong to this database.');
      }
      return { sql: statement.sql, args: statement.args };
    });
    if (!queries.length) return [];
    const results = await this.client.batch(queries, 'write');
    return results.map((result) => ({
      meta: { changes: result.rowsAffected },
    }));
  }
  close() {
    this.client.close();
  }
}

export async function createDatabase(
  env: DatabaseEnvironment,
): Promise<LibsqlDatabase> {
  const client = createClient(databaseConfig(env));
  try {
    // libSQL enables foreign keys by default. Assert this rather than silently losing cascades.
    const result = await client.execute('PRAGMA foreign_keys');
    if (Number(result.rows[0]?.foreign_keys) !== 1) {
      throw new Error('Database foreign-key enforcement is required.');
    }
    return new LibsqlDatabase(client);
  } catch (error) {
    client.close();
    throw error;
  }
}
