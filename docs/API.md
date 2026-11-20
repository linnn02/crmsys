# REST API

Интерактивная документация: `/api/docs`. Спецификация OpenAPI 3.1: `/api/openapi.json`. Схемы основных записывающих запросов строятся из Zod.

## Контракт

Авторизация — cookie `session`. Изменяющие запросы требуют `Origin`, равный WEB_ORIGIN, и `X-CSRF-Protection: 1`. CORS разрешает только этот origin. Денежные суммы — десятичные строки, например `"3500.50"`. UUID — строка; время — ISO 8601 с offset, дата рождения — YYYY-MM-DD.

Ошибка: `{ "error": { "code": "SCHEDULE_CONFLICT", "message": "...", "details": {} } }`. HTTP 401 — нет сессии; 403 — роль/CSRF; 404 — отсутствующая запись; 409 — конфликт/дубль; 422 — валидация; 500 — внутренняя ошибка без stack trace в ответе.

## Ресурсы

| Маршрут                               | Действия                                                   | Доступ                                      |
| ------------------------------------- | ---------------------------------------------------------- | ------------------------------------------- |
| /auth/login, /auth/me, /auth/logout   | вход, текущий пользователь, выход                          | сессия кроме login                          |
| /students                             | GET/POST, PUT /:id, GET /:id, POST /:id/archive            | ADMIN/MANAGER; TEACHER только чтение своих  |
| /parents                              | GET/POST/PUT                                               | ADMIN/MANAGER                               |
| /teachers, /courses, /rooms, /tariffs | GET/POST/PUT                                               | чтение ADMIN/MANAGER, запись ADMIN          |
| /groups                               | GET/POST/PUT                                               | ADMIN/MANAGER                               |
| /groups/:id/enrollments               | POST {studentId}, DELETE /:studentId                       | ADMIN/MANAGER                               |
| /my/groups                            | GET                                                        | для TEACHER собственные группы              |
| /lessons                              | GET, POST, PUT /:id?scope=ONE или SERIES, POST /:id/cancel | запись ADMIN/MANAGER, TEACHER чтение своих  |
| /attendance/:lessonId                 | GET, PUT {entries:[{studentId,status}]}                    | ADMIN/MANAGER или назначенный преподаватель |
| /subscriptions                        | GET/POST; POST /:id/freeze, resume, extend                 | ADMIN/MANAGER                               |
| /invoices                             | GET                                                        | ADMIN/MANAGER                               |
| /payments                             | GET/POST; POST /:id/refunds; GET /:id/receipt.pdf          | ADMIN/MANAGER                               |
| /reports/payments.csv                 | GET                                                        | ADMIN/MANAGER                               |
| /analytics                            | GET ?from=&to=&groupId=&courseId=                          | TEACHER получает ограниченный ответ         |
| /notifications                        | GET, POST /:id/read                                        | только получатель                           |
| /users                                | GET/POST, PATCH /:id {active, role, name, email, password} | ADMIN                                       |
| /settings                             | GET/PUT {centerName}                                       | ADMIN                                       |

Списки справочников: page, pageSize (1…100), search. Ученики дополнительно status и groupId. Расписание: from/to, groupId/teacherId. Платежи/CSV: from/to (YYYY-MM-DD), method, search. Для преподавателя teacherId берётся из проверенной сессии. Часть специализированных списков имеет фиксированный верхний лимит; не следует считать их неограниченным экспортом истории.

## Идемпотентность финансов

POST /payments требует studentId, invoiceId, amount, method и idempotencyKey (UUID). Ключ повторяется только при повторе того же действия. Изменившийся payload с тем же ключом — 409. Возврат требует amount, reason и отдельный idempotencyKey. Обычного DELETE для финансов нет.

## Неполнота документации

OpenAPI содержит маршруты и основные Zod-схемы, но типизированные response-схемы и тела некоторых специализированных операций пока описаны только текстом. Это отражено в PROJECT_PROGRESS.
