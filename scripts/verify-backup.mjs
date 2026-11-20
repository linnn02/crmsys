import 'dotenv/config';
import { execFileSync } from 'node:child_process';
import { mkdirSync } from 'node:fs';
import { resolve, join } from 'node:path';
import pg from 'pg';
const url = new URL(process.env.DATABASE_URL);
const database = decodeURIComponent(url.pathname.slice(1));
const restored = 'crm_restore_' + Date.now();
mkdirSync('backups', { recursive: true });
const file = resolve('backups', restored + '.dump');
const env = { ...process.env, PGPASSWORD: decodeURIComponent(url.password) };
const binary = (name) =>
  process.env.PG_BIN
    ? join(process.env.PG_BIN, name + (process.platform === 'win32' ? '.exe' : ''))
    : name;
const connection = [
  '-h',
  url.hostname,
  '-p',
  url.port || '5432',
  '-U',
  decodeURIComponent(url.username),
];
execFileSync(binary('pg_dump'), [...connection, '-d', database, '-Fc', '-f', file], {
  env,
  stdio: 'inherit',
});
const client = new pg.Client({ connectionString: url.toString() });
await client.connect();
await client.query(
  `CREATE DATABASE "${restored}" WITH TEMPLATE template0 ENCODING 'UTF8' LC_COLLATE 'C' LC_CTYPE 'C'`,
);
execFileSync(
  binary('pg_restore'),
  [...connection, '-d', restored, '--no-owner', '--exit-on-error', file],
  { env, stdio: 'inherit' },
);
const restoredUrl = new URL(url);
restoredUrl.pathname = '/' + restored;
const target = new pg.Client({ connectionString: restoredUrl.toString() });
await target.connect();
for (const table of [
  'User',
  'Student',
  'Parent',
  'Lesson',
  'Payment',
  'Refund',
  'Invoice',
  'AuditLog',
]) {
  const query = `SELECT count(*)::int AS count FROM "${table}"`;
  const source = await client.query(query),
    copy = await target.query(query);
  if (source.rows[0].count !== copy.rows[0].count) throw new Error('Несовпадение: ' + table);
}
for (const table of ['Invoice', 'Payment', 'Refund']) {
  const query = `SELECT COALESCE(sum(amount),0)::text AS total FROM "${table}"`;
  const source = await client.query(query),
    copy = await target.query(query);
  if (source.rows[0].total !== copy.rows[0].total) throw new Error('Не совпали суммы: ' + table);
}
await client.end();
await target.end();
console.log(
  'Резервная копия и восстановление проверены. Файл: ' +
    file +
    '. Новая база: ' +
    restored +
    '. Исходная база не изменялась.',
);
