# Орбита — CRM детского центра

Работающее full-stack приложение: React/TypeScript, Express, Prisma и PostgreSQL. Русский интерфейс, роли ADMIN/MANAGER/TEACHER, серверные проверки доступа, календарь, посещаемость, абонементы и финансовый журнал. Валюта KZT, часовой пояс Asia/Almaty.

**Статус:** реализовано ядро MVP. Это не заявление о полном выполнении исходного расширенного ТЗ. Проверенные функции и оставшиеся пункты перечислены в `PROJECT_PROGRESS.md`. Docker-файлы подготовлены, но запуск Docker в исходном окружении не проверен.

## Требования

- Node.js 24 LTS, npm 11+.
- PostgreSQL 18 с UTF-8 и расширением `btree_gist`, либо Docker Compose v2.
- В PostgreSQL пользователь миграций должен иметь право создавать расширение. Рабочей учётной записи в production следует выдавать только нужные права на таблицы.

## Локальный запуск

```powershell
cd E:\dev\diplom\crm-child-center
npm ci
node scripts/init-env.mjs
```

Скрипт создаёт `.env` со случайными секретами, не перезаписывает существующий файл и не выводит пароли в консоль. Настройте `DATABASE_URL` на собственный PostgreSQL. Создайте пустую базу с UTF-8. Не указывайте базу с рабочими данными для seed.

```powershell
npm run db:generate
npm run db:migrate
npm run db:seed
npm run dev
```

- Приложение: http://localhost:5173 (используйте именно localhost, соответствующий WEB_ORIGIN).
- API: http://localhost:4000/api
- Проверка БД: http://localhost:4000/health
- Swagger: http://localhost:4000/api/docs
- OpenAPI JSON: http://localhost:4000/api/openapi.json

В начальном окружении дополнительно запущен изолированный PostgreSQL из соседнего игнорируемого каталога `.local-postgres`. Он использовался для проверки и не является зависимостью приложения. Этот каталог не переносится вместе с проектом; для обычного запуска используйте свой PostgreSQL или Docker.

## Демонстрационные аккаунты

| Роль          | Email                                         |
| ------------- | --------------------------------------------- |
| Администратор | admin@example.test                            |
| Менеджеры     | manager1@example.test, manager2@example.test  |
| Преподаватели | teacher1@example.test … teacher5@example.test |

Пароль для локального seed находится в **вашем локальном `.env`, поле `SEED_PASSWORD`**. Его генерирует `scripts/init-env.mjs`; в исходниках фиксированного пароля нет. Для реального центра создавайте отдельные учётные записи с уникальными паролями. Seed содержит только вымышленные персональные данные, выполняется в одной транзакции и отказывается менять непустую базу.

## Docker Compose

### GitHub Codespaces

Репозиторий содержит `.devcontainer/devcontainer.json`. Откройте GitHub Codespaces → New codespace → выберите `linnn02/crmsys`, дождитесь установки зависимостей и выполните в терминале Codespace:

```bash
docker compose up --build -d
docker compose exec -T api npm run db:seed
```

Откройте автоматически опубликированный порт `8080`. Для остановки используйте меню Codespaces → Stop codespace, а для полного удаления — Delete. Не оставляйте Codespace запущенным без необходимости: бесплатная квота личного GitHub Free ограничена.

```powershell
node scripts/init-env.mjs
docker compose up --build -d
docker compose exec api npm run db:seed
```

Откройте http://localhost:8080. Сначала автоматически выполняются миграции; seed запускается отдельно и только один раз. PostgreSQL и API не публикуют внешние порты. Том БД сохраняется между перезапусками. **Не выполняйте `docker compose down -v` для базы, которую нужно сохранить.**

Compose по умолчанию предназначен для локальной демонстрации по HTTP. Для production нужен HTTPS reverse proxy, `NODE_ENV=production`, точный HTTPS `DOCKER_WEB_ORIGIN` и ограниченный доступ к серверу. В production cookies получают флаг Secure. Подробности — `docs/DEPLOYMENT.md`.

## Проверки

```powershell
npm run typecheck
npm run lint
npm run build
npm test
npx playwright install chromium
npm run test:e2e
```

`npm test` создаёт отдельную БД `crm_test_<timestamp>`, применяет миграции и seed, запускает реальные Supertest/Vitest проверки и сохраняет базу для диагностики. Пользователь из DATABASE_URL должен иметь CREATEDB. Скрипт не удаляет базы. E2E выполняются на локальном приложении и создают вымышленные записи; используйте отдельное демонстрационное окружение. Не запускайте E2E против production.

## Возможности

- JWT в HttpOnly cookie, серверная сессия с отзывом и сроком 8 часов; RBAC на API; CSRF, Helmet, CORS и ограничение попыток входа.
- Ученики с несколькими представителями, поиск по имени/телефону, пагинация, редактирование, архивирование; история посещений и оплат в карточке.
- Справочники преподавателей, направлений, кабинетов, групп и тарифов; запись с контролем вместимости, история отчисления.
- FullCalendar 7: день/неделя/месяц/список, создание, перенос, отмена, недельные серии. Проверки пересечения группы, преподавателя, кабинета в транзакции и PostgreSQL exclusion constraints.
- Посещаемость со всеми четырьмя статусами и историей правок; идемпотентное списание, восстановление при изменении отметки и отмене занятия.
- Снимок цены и правил тарифа в абонементе, расчёт остатка, заморозка, возобновление и административное продление срока.
- Счёт при выдаче абонемента, частичная оплата, идемпотентность, возвраты, задолженность, PDF-квитанция и CSV платежей. Платежи помечены как ручные; банковской интеграции нет.
- Dashboard и графики из БД; внутренние уведомления о сроках, остатках, долгах и изменениях расписания.

## Структура

```text
apps/api/src/      routes, controllers, services, repositories, middlewares, validators
apps/web/src/      pages, components/ui, hooks, api, i18n
packages/shared/   общие роли, часовой пояс, формат ошибки
prisma/           схема, четыре миграции, seed
tests/            unit и REST/PostgreSQL проверки
e2e/              Playwright
docs/             материалы для диплома
scripts/          генерация .env, тестовая БД, резервное копирование
```

При изменении модели добавляйте новую миграцию; не редактируйте применённые миграции. Не используйте `db push` вместо миграций. Финансовые записи не удаляются: исправления оформляются возвратами.

## Документация

Начните с `docs/ARCHITECTURE.md`, `docs/DATABASE.md`, `docs/USE_CASES.md` и `docs/USER_GUIDE.md`. Результаты проверок — `docs/TESTING.md`; ограничения — `PROJECT_PROGRESS.md`.
