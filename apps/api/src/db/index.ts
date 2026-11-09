import pg from 'pg';
import dns from 'dns';
import { createClient } from '@supabase/supabase-js';
import WebSocket from 'ws';
import { env } from '../config/env.js';

// Configure fast reliable DNS servers to prevent local stub resolver IPv6 timeouts
try {
  dns.setServers(['8.8.8.8', '1.1.1.1']);
} catch {
  // Ignore in environments where setting DNS servers is restricted
}

// Polyfill WebSocket for Node 18 environments
if (typeof globalThis.WebSocket === 'undefined') {
  (globalThis as any).WebSocket = WebSocket;
}

const { Pool } = pg;

// PostgreSQL Connection Pool for transactional integrity & queries
export const pool = new Pool({
  connectionString: env.DATABASE_URL,
  ssl: {
    rejectUnauthorized: false // Supabase direct connections require SSL
  },
  max: 20,
  idleTimeoutMillis: 30000,
  connectionTimeoutMillis: 10000,
});

pool.on('error', (err) => {
  console.error('Unexpected error on idle Postgres client', err);
});

// Helper query function
export async function query<T extends pg.QueryResultRow = any>(text: string, params?: any[]): Promise<pg.QueryResult<T>> {
  const start = Date.now();
  const res = await pool.query<T>(text, params);
  const duration = Date.now() - start;
  if (env.NODE_ENV === 'development') {
    // console.log('executed query', { text: text.slice(0, 80), duration, rows: res.rowCount });
  }
  return res;
}

// Transaction helper
export async function withTransaction<T>(callback: (client: pg.PoolClient) => Promise<T>): Promise<T> {
  const client = await pool.connect();
  try {
    await client.query('BEGIN');
    const result = await callback(client);
    await client.query('COMMIT');
    return result;
  } catch (err) {
    await client.query('ROLLBACK');
    throw err;
  } finally {
    client.release();
  }
}

// Supabase JS Client for Realtime / Storage
export const supabase = createClient(env.SUPABASE_URL, env.SUPABASE_SERVICE_ROLE_KEY || env.SUPABASE_ANON_KEY, {
  auth: { persistSession: false },
  realtime: { transport: WebSocket as any }
});
