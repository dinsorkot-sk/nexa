import 'dotenv/config';

export function getDatabaseUrl(): string {
  return process.env.DATABASE_URL ?? 'file:./local.db';
}
