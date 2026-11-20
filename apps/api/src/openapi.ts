import { z } from 'zod';
import * as validators from './validators/index.js';
const error = {
  description: 'Ошибка запроса',
  content: {
    'application/json': {
      schema: {
        type: 'object',
        properties: {
          error: {
            type: 'object',
            properties: {
              code: { type: 'string' },
              message: { type: 'string' },
              details: { type: 'object' },
            },
          },
        },
      },
    },
  },
};
const schemas = Object.fromEntries(
  Object.entries(validators)
    .filter(([key]) => key.endsWith('Input'))
    .map(([key, schema]) => [key, z.toJSONSchema(schema, { unrepresentable: 'any', io: 'input' })]),
);
const paths: Record<string, Record<string, unknown>> = {};
function endpoint(path: string, method: string, summary: string, schema?: string) {
  paths['/api' + path] ??= {};
  paths['/api' + path]![method] = {
    summary,
    tags: [path.split('/')[1]],
    security: path === '/auth/login' ? [] : [{ session: [] }],
    parameters: [
      ...[...path.matchAll(/\{([^}]+)\}/g)].map((m) => ({
        name: m[1],
        in: 'path',
        required: true,
        schema: { type: 'string', format: 'uuid' },
      })),
      ...(['post', 'put', 'patch', 'delete'].includes(method)
        ? [
            {
              name: 'X-CSRF-Protection',
              in: 'header',
              required: true,
              schema: { type: 'string', enum: ['1'] },
            },
            { name: 'Origin', in: 'header', required: true, schema: { type: 'string' } },
          ]
        : []),
    ],
    ...(schema
      ? {
          requestBody: {
            required: true,
            content: { 'application/json': { schema: { $ref: '#/components/schemas/' + schema } } },
          },
        }
      : {}),
    responses: {
      200: { description: 'Успешно' },
      201: { description: 'Создано' },
      401: error,
      403: error,
      404: error,
      409: error,
      422: error,
    },
  };
}
endpoint('/auth/login', 'post', 'Вход: email и password');
endpoint('/auth/me', 'get', 'Текущий пользователь');
endpoint('/auth/logout', 'post', 'Завершить сессию');
for (const [resource, schema] of Object.entries({
  students: 'studentInput',
  parents: 'parentInput',
  teachers: 'teacherInput',
  courses: 'courseInput',
  groups: 'groupInput',
  rooms: 'roomInput',
  tariffs: 'tariffInput',
})) {
  endpoint('/' + resource, 'get', 'Список: page, pageSize (до 100), search');
  endpoint('/' + resource, 'post', 'Создать запись', schema);
  endpoint('/' + resource + '/{id}', 'put', 'Редактировать запись', schema);
}
for (const r of [
  'subscriptions',
  'payments',
  'invoices',
  'notifications',
  'users',
  'settings',
  'lessons',
  'analytics',
])
  endpoint('/' + r, 'get', 'Получить ' + r);
endpoint('/students/{id}', 'get', 'Карточка ученика; финансовые поля скрыты от преподавателя');
endpoint('/students/{id}/archive', 'post', 'Архивировать без удаления истории');
endpoint('/lessons', 'post', 'Создать занятие или недельную серию', 'lessonInput');
endpoint('/lessons/{id}', 'put', 'Изменить занятие: scope=ONE|SERIES', 'lessonInput');
endpoint('/lessons/{id}/cancel', 'post', 'Отменить и восстановить списания');
endpoint('/attendance/{lessonId}', 'get', 'Список учеников на дату занятия');
endpoint('/attendance/{lessonId}', 'put', 'Посещаемость и списание', 'attendanceInput');
endpoint('/groups/{id}/enrollments', 'post', 'Запись ученика: studentId');
endpoint('/groups/{id}/enrollments/{studentId}', 'delete', 'Завершить запись');
endpoint('/subscriptions', 'post', 'Выдать абонемент и выставить счёт', 'subscriptionInput');
for (const a of ['freeze', 'resume', 'extend'])
  endpoint('/subscriptions/{id}/' + a, 'post', 'Изменить абонемент: ' + a);
endpoint(
  '/payments',
  'post',
  'Зарегистрировать платёж (idempotencyKey обязателен)',
  'paymentInput',
);
endpoint('/payments/{id}/refunds', 'post', 'Возврат: amount, reason, idempotencyKey');
endpoint('/payments/{id}/receipt.pdf', 'get', 'Квитанция PDF');
endpoint('/reports/payments.csv', 'get', 'Экспорт платежей CSV');
endpoint('/notifications/{id}/read', 'post', 'Прочитать собственное уведомление');
endpoint('/users', 'post', 'Создать пользователя (ADMIN)', 'userInput');
endpoint('/users/{id}', 'patch', 'Включить/отключить: active');
endpoint('/settings', 'put', 'Изменить название: centerName');
endpoint('/my/groups', 'get', 'Собственные группы преподавателя');
export const openapi = {
  openapi: '3.1.0',
  info: {
    title: 'Oi-Qaragai · Угуша CRM API',
    version: '0.1.0',
    description:
      'Денежные суммы передаются десятичными строками. Авторизация — HttpOnly cookie. Изменяющие запросы требуют доверенный Origin и X-CSRF-Protection: 1. Финансы доступны ADMIN/MANAGER; пользователи и настройки только ADMIN.',
  },
  servers: [{ url: '/' }],
  paths,
  components: {
    securitySchemes: { session: { type: 'apiKey', in: 'cookie', name: 'session' } },
    schemas,
  },
};
