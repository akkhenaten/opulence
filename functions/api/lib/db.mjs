import pg from 'pg';
import fs from 'node:fs';
import path from 'node:path';
import { fileURLToPath } from 'node:url';

pg.types.setTypeParser(1700, (v) => (v === null ? null : Number(v))); // numeric → number
pg.types.setTypeParser(20, (v) => (v === null ? null : Number(v)));   // bigint → number
pg.types.setTypeParser(1082, (v) => v);                               // date stays 'YYYY-MM-DD'

let pool;
export function getPool() {
  if (!pool) {
    pool = new pg.Pool({
      connectionString: process.env.DATABASE_URL,
      ssl: { rejectUnauthorized: false },
      max: 3,
      idleTimeoutMillis: 60_000,
      connectionTimeoutMillis: 8_000,
    });
    pool.on('error', (err) => console.error('[pg] idle connection dropped:', err.message));
  }
  return pool;
}

export const q = async (sql, params) => (await getPool().query(sql, params)).rows;
export const one = async (sql, params) => (await getPool().query(sql, params)).rows[0] || null;

export async function tx(fn) {
  const client = await getPool().connect();
  try {
    await client.query('BEGIN');
    const t = {
      q: async (s, p) => (await client.query(s, p)).rows,
      one: async (s, p) => (await client.query(s, p)).rows[0] || null,
    };
    const res = await fn(t);
    await client.query('COMMIT');
    return res;
  } catch (e) {
    await client.query('ROLLBACK');
    throw e;
  } finally {
    client.release();
  }
}

// Build "SET a=$1, b=$2" from an object; returns [setSql, values]
export function setClause(obj, start = 1) {
  const keys = Object.keys(obj);
  return [keys.map((k, i) => `${k} = $${i + start}`).join(', '), keys.map((k) => obj[k])];
}

export async function insert(table, obj, db = { one }) {
  const keys = Object.keys(obj);
  const sql = `INSERT INTO ${table} (${keys.join(',')}) VALUES (${keys.map((_, i) => `$${i + 1}`).join(',')}) RETURNING *`;
  return db.one(sql, keys.map((k) => obj[k]));
}

export async function update(table, id, obj, db = { one }) {
  if (!Object.keys(obj).length) return db.one(`SELECT * FROM ${table} WHERE id = $1`, [id]);
  const [set, vals] = setClause(obj, 2);
  return db.one(`UPDATE ${table} SET ${set} WHERE id = $1 RETURNING *`, [id, ...vals]);
}

let migrated = false;
export async function migrate() {
  if (migrated) return;
  const dir = path.join(path.dirname(fileURLToPath(import.meta.url)), '..', 'db', 'migrations');
  await q('CREATE TABLE IF NOT EXISTS schema_migrations (name text PRIMARY KEY, applied_at timestamptz DEFAULT now())');
  const done = new Set((await q('SELECT name FROM schema_migrations')).map((r) => r.name));
  for (const file of fs.readdirSync(dir).filter((f) => f.endsWith('.sql')).sort()) {
    if (done.has(file)) continue;
    const sql = fs.readFileSync(path.join(dir, file), 'utf8');
    await tx(async (t) => {
      await t.q('SELECT pg_advisory_xact_lock(424242)');
      if (await t.one('SELECT 1 FROM schema_migrations WHERE name = $1', [file])) return;
      await t.q(sql);
      await t.q('INSERT INTO schema_migrations (name) VALUES ($1)', [file]);
    });
    console.log('[migrate] applied', file);
  }
  migrated = true;
}
