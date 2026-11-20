import { randomBytes } from 'node:crypto';
import { existsSync, writeFileSync } from 'node:fs';
if (existsSync('.env')) {
  console.log('.env уже существует; изменения не внесены.');
  process.exit(0);
}
const password = randomBytes(24).toString('hex');
writeFileSync(
  '.env',
  `NODE_ENV=development\nPORT=4000\nDATABASE_URL=postgresql://crm:${password}@localhost:5432/crm?schema=public\nPOSTGRES_USER=crm\nPOSTGRES_PASSWORD=${password}\nPOSTGRES_DB=crm\nJWT_SECRET=${randomBytes(48).toString('hex')}\nWEB_ORIGIN=http://localhost:5173\nSEED_PASSWORD=${randomBytes(18).toString('base64url')}\n`,
  { mode: 0o600, flag: 'wx' },
);
console.log(
  'Создан локальный .env со случайными секретами. Пароль демонстрационных пользователей — SEED_PASSWORD в этом файле.',
);
