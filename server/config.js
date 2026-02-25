import 'dotenv/config';

export const PORT = parseInt(process.env.PORT || '3000', 10);
export const DATABASE_URL = process.env.DATABASE_URL || 'postgresql://localhost:5432/tire_empire';
export const TICK_MS = parseInt(process.env.TICK_MS || '20000', 10);
export const NODE_ENV = process.env.NODE_ENV || 'development';
export const CORS_ORIGIN = process.env.CORS_ORIGIN || '*';
export const STORAGE_TYPE = process.env.STORAGE || 'memory';
