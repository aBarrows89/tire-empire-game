import pg from 'pg';
import { DATABASE_URL } from '../config.js';

export const pool = new pg.Pool({
  connectionString: DATABASE_URL,
  max: 30,                    // 30 connections (up from default 10)
  idleTimeoutMillis: 15000,   // close idle connections after 15s
  connectionTimeoutMillis: 5000, // fail fast if pool exhausted
  statement_timeout: 10000,   // kill queries after 10s
});

pool.on('error', (err) => {
  console.error('Unexpected PG pool error:', err);
});
