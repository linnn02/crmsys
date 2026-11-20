import 'dotenv/config';
import pg from 'pg';
import { spawnSync } from 'node:child_process';
const base = process.env.DATABASE_URL;
if (!base) throw new Error('DATABASE_URL is required');
const name = 'crm_test_' + Date.now();
const admin = new pg.Client({ connectionString: base });
await admin.connect();
await admin.query(
  `CREATE DATABASE "${name}" WITH TEMPLATE template0 ENCODING 'UTF8' LC_COLLATE 'C' LC_CTYPE 'C'`,
);
await admin.end();
const url = new URL(base);
url.pathname = '/' + name;
const env = { ...process.env, DATABASE_URL: url.toString(), TEST_DATABASE_URL: url.toString() };
for (const args of [
  ['node_modules/prisma/build/index.js', 'migrate', 'deploy'],
  ['node_modules/tsx/dist/cli.mjs', 'prisma/seed.ts'],
  ['node_modules/vitest/vitest.mjs', 'run'],
]) {
  const result = spawnSync(process.execPath, args, { stdio: 'inherit', env });
  if (result.status !== 0) {
    console.error('Тестовая БД сохранена для диагностики: ' + name);
    process.exit(result.status ?? 1);
  }
}
console.log('Тесты завершены. Изолированная БД сохранена: ' + name);
