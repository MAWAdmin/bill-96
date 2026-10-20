import "server-only";
import fs from "node:fs";
import path from "node:path";
import { DATA_DIR } from "./config";

/**
 * Database access. Uses real Postgres when DATABASE_URL is set, otherwise an
 * embedded Postgres (PGlite) stored under DATA_DIR. Both expose the same
 * `query(text, params) -> { rows }` shape, so the rest of the app only sees
 * plain parameterised SQL.
 */

type Row = Record<string, any>;
interface Queryable {
  query<T = Row>(text: string, params?: unknown[]): Promise<{ rows: T[] }>;
}

interface DbState {
  client?: Queryable;
  ready?: Promise<Queryable>;
}

const g = globalThis as unknown as { __b96db?: DbState };
const state: DbState = (g.__b96db ??= {});

async function connect(): Promise<Queryable> {
  let client: Queryable;
  if (process.env.DATABASE_URL) {
    const { Pool } = await import("pg");
    client = new Pool({ connectionString: process.env.DATABASE_URL, max: 10 }) as unknown as Queryable;
  } else {
    const { PGlite } = await import("@electric-sql/pglite");
    const dir = path.join(DATA_DIR, "pglite");
    fs.mkdirSync(dir, { recursive: true });
    const lite = new PGlite(dir);
    await lite.waitReady;
    client = lite as unknown as Queryable;
  }
  const schema = fs.readFileSync(path.join(process.cwd(), "src/lib/schema.sql"), "utf8");
  for (const stmt of schema.split(/;\s*\n/).map((s) => s.trim()).filter(Boolean)) {
    await client.query(stmt);
  }
  // A process restart interrupts any scan that was in flight.
  await client.query(
    `UPDATE scans SET status = 'failed', error = 'Interrupted by server restart', finished_at = now()
     WHERE status IN ('running', 'queued')`
  );
  state.client = client;
  return client;
}

export async function db(): Promise<Queryable> {
  if (state.client) return state.client;
  state.ready ??= connect().catch((e) => {
    state.ready = undefined;
    throw e;
  });
  return state.ready;
}

export async function query<T = Row>(text: string, params: unknown[] = []): Promise<T[]> {
  const c = await db();
  const res = await c.query<T>(text, params);
  return res.rows;
}

export async function queryOne<T = Row>(text: string, params: unknown[] = []): Promise<T | null> {
  const rows = await query<T>(text, params);
  return rows[0] ?? null;
}

/** jsonb parameters must be passed as strings so pg doesn't turn arrays into PG arrays. */
export const json = (v: unknown) => JSON.stringify(v ?? null);
