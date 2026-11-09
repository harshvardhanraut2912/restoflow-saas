import dotenv from 'dotenv';
import path from 'path';

// Load .env from workspace root or current directory
dotenv.config({ path: path.resolve(process.cwd(), '.env') });
dotenv.config({ path: path.resolve(process.cwd(), '../.env') });
dotenv.config({ path: path.resolve(process.cwd(), '../../.env') });

export const env = {
  NODE_ENV: process.env.NODE_ENV || 'development',
  PORT: parseInt(process.env.PORT || '5000', 10),
  CLIENT_URL: process.env.CLIENT_URL || 'http://localhost:5173',
  SUPABASE_URL: process.env.SUPABASE_URL || '',
  SUPABASE_ANON_KEY: process.env.SUPABASE_ANON_KEY || '',
  SUPABASE_SERVICE_ROLE_KEY: process.env.SUPABASE_SERVICE_ROLE_KEY || '',
  DATABASE_URL: process.env.DATABASE_URL || '',
  SESSION_SECRET: process.env.SESSION_SECRET || 'dev_session_secret_change_in_production_32chars',
  QR_TOKEN_SECRET: process.env.QR_TOKEN_SECRET || 'dev_qr_signing_secret_change_in_production_32chars',
  DEVADMIN_EMAIL: process.env.DEVADMIN_EMAIL || 'admin@smartresto.com',
  DEVADMIN_PASSWORD: process.env.DEVADMIN_PASSWORD || 'DevAdmin@Pass2026',
  DEFAULT_COUNTRY_CODE: process.env.DEFAULT_COUNTRY_CODE || '+91',
};
