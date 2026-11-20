import { beforeAll, afterAll, describe, it, expect } from 'vitest';
import request from 'supertest';
import { app } from '../apps/api/src/app.js';
import { db } from '../apps/api/src/repositories/db.js';
import { config } from '../apps/api/src/config.js';
const admin = request.agent(app),
  teacher = request.agent(app),
  manager = request.agent(app);
const origin = config.WEB_ORIGIN;
const tag = crypto.randomUUID().slice(0, 8);
let studentId = '',
  groupId = '',
  teacherId = '',
  roomId = '',
  courseId = '',
  subscriptionId = '',
  invoiceId = '',
  lessonId = '';
const parentIds: string[] = [];
const secure = (r: request.Test) => r.set('Origin', origin).set('X-CSRF-Protection', '1');
beforeAll(async () => {
  if (!process.env.TEST_DATABASE_URL)
    throw new Error('Use npm test to create an isolated database');
  if (!process.env.SEED_PASSWORD)
    throw new Error('SEED_PASSWORD required. Run against a dedicated seeded test database.');
  for (const [agent, email] of [
    [admin, 'admin@example.test'],
    [teacher, 'teacher1@example.test'],
    [manager, 'manager1@example.test'],
  ] as const) {
    const r = await secure(agent.post('/api/auth/login')).send({
      email,
      password: process.env.SEED_PASSWORD,
    });
    expect(r.status).toBe(200);
  }
});
afterAll(() => db.$disconnect());
describe('REST и PostgreSQL — реальные операции', () => {
  it('запрещает вход без сессии и запрос без CSRF', async () => {
    expect((await request(app).get('/api/students')).status).toBe(401);
    expect((await admin.post('/api/students').send({})).status).toBe(403);
  });
  it('RBAC запрещает преподавателю финансы, менеджеру роли', async () => {
    expect((await teacher.get('/api/payments')).status).toBe(403);
    expect((await manager.get('/api/users')).status).toBe(403);
  });
  it('создаёт двух представителей и ученика с обоими', async () => {
    for (let i = 0; i < 2; i++) {
      const r = await secure(admin.post('/api/parents')).send({
        name: `Тест представитель ${tag} ${i}`,
        phone: '+799' + String(Date.now()).slice(-8) + i,
      });
      expect(r.status).toBe(201);
      parentIds.push(r.body.id);
    }
    const r = await secure(admin.post('/api/students')).send({
      name: `Тест ученик ${tag}`,
      birthDate: '2019-04-20',
      parentIds,
    });
    expect(r.status).toBe(201);
    studentId = r.body.id;
    const detail = await admin.get('/api/students/' + studentId);
    expect(detail.body.parents).toHaveLength(2);
    expect(detail.body.age).toBeGreaterThan(0);
  });
  it('редактирует ученика и не допускает дубль', async () => {
    const input = { name: `Тест ученик ${tag} исправлен`, birthDate: '2019-04-20', parentIds };
    expect((await secure(admin.put('/api/students/' + studentId)).send(input)).status).toBe(200);
    expect((await secure(admin.post('/api/students')).send(input)).status).toBe(409);
    expect((await db.student.findUniqueOrThrow({ where: { id: studentId } })).name).toBe(
      input.name,
    );
  });
  it('записывает в группу и ограничивает вместимость', async () => {
    const teachers = await db.teacher.findMany({ orderBy: { email: 'asc' } });
    teacherId = teachers[1]!.id;
    courseId = (await db.course.findFirstOrThrow()).id;
    roomId = (await db.room.findFirstOrThrow()).id;
    const r = await secure(admin.post('/api/groups')).send({
      name: 'Тест группа ' + tag,
      courseId,
      teacherId,
      capacity: 1,
    });
    expect(r.status).toBe(201);
    groupId = r.body.id;
    expect(
      (await secure(admin.post(`/api/groups/${groupId}/enrollments`)).send({ studentId })).status,
    ).toBe(201);
    const another = await db.student.findFirstOrThrow({ where: { id: { not: studentId } } });
    expect(
      (
        await secure(admin.post(`/api/groups/${groupId}/enrollments`)).send({
          studentId: another.id,
        })
      ).status,
    ).toBe(409);
  });
  it('не даёт преподавателю чужую карточку', async () =>
    expect((await teacher.get('/api/students/' + studentId)).status).toBe(403));
  it('создаёт серию и отклоняет конфликт', async () => {
    const startsAt = new Date(
      Date.now() + 120 * 86400000 + Math.floor(Math.random() * 100000000),
    ).toISOString();
    const endsAt = new Date(+new Date(startsAt) + 3600000).toISOString();
    const input = { groupId, teacherId, roomId, startsAt, endsAt, count: 3 };
    const r = await secure(admin.post('/api/lessons')).send(input);
    expect(r.status).toBe(201);
    expect(r.body).toHaveLength(3);
    expect(new Set(r.body.map((l: { recurrenceId: string }) => l.recurrenceId)).size).toBe(1);
    expect((await secure(admin.post('/api/lessons')).send(input)).status).toBe(409);
    const moved = await secure(admin.put('/api/lessons/' + r.body[0].id + '?scope=SERIES')).send({
      ...input,
      startsAt: new Date(+new Date(startsAt) + 7 * 86400000).toISOString(),
      endsAt: new Date(+new Date(endsAt) + 7 * 86400000).toISOString(),
    });
    expect(moved.status).toBe(200);
    expect(moved.body).toHaveLength(3);
    expect(moved.body[0].startsAt).toBe(new Date(+new Date(startsAt) + 7 * 86400000).toISOString());
  });
  it('выдаёт абонемент со снимком цены и создаёт счёт', async () => {
    const tariff = await db.tariffPlan.findFirstOrThrow({ where: { lessonLimit: 8 } });
    const r = await secure(admin.post('/api/subscriptions')).send({
      studentId,
      groupId,
      tariffId: tariff.id,
      startsAt: new Date(Date.now() - 86400000).toISOString(),
    });
    expect(r.status).toBe(201);
    subscriptionId = r.body.id;
    const invoice = await db.invoice.findFirstOrThrow({ where: { subscriptionId } });
    invoiceId = invoice.id;
    expect(invoice.amount.eq(tariff.price)).toBe(true);
  });
  it('посещаемость списывает один раз, исправление восстанавливает', async () => {
    const start = new Date(Date.now() - 3600000);
    await db.groupEnrollment.updateMany({
      where: { groupId, studentId },
      data: { joinedAt: new Date(+start - 86400000) },
    });
    const r = await secure(admin.post('/api/lessons')).send({
      groupId,
      teacherId,
      roomId,
      startsAt: start.toISOString(),
      endsAt: new Date(+start + 1800000).toISOString(),
    });
    expect(r.status).toBe(201);
    lessonId = r.body[0].id;
    for (let i = 0; i < 2; i++)
      expect(
        (
          await secure(admin.put('/api/attendance/' + lessonId)).send({
            entries: [{ studentId, status: 'PRESENT' }],
          })
        ).status,
      ).toBe(200);
    expect(await db.subscriptionUsage.count({ where: { subscriptionId, reversedAt: null } })).toBe(
      1,
    );
    expect(
      (
        await secure(admin.put('/api/attendance/' + lessonId)).send({
          entries: [{ studentId, status: 'EXCUSED' }],
        })
      ).status,
    ).toBe(200);
    expect(await db.subscriptionUsage.count({ where: { subscriptionId, reversedAt: null } })).toBe(
      0,
    );
    expect(
      await db.attendanceHistory.count({ where: { attendance: { studentId, lessonId } } }),
    ).toBe(2);
  });
  it('преподаватель не может менять чужое посещение', async () =>
    expect(
      (
        await secure(teacher.put('/api/attendance/' + lessonId)).send({
          entries: [{ studentId, status: 'PRESENT' }],
        })
      ).status,
    ).toBe(403));
  it('частичная оплата, повторный запрос, возврат и задолженность', async () => {
    const amount = '5000.10';
    const input = {
      studentId,
      invoiceId,
      amount,
      method: 'CASH',
      idempotencyKey: crypto.randomUUID(),
    };
    const first = await secure(admin.post('/api/payments')).send(input);
    expect(first.status).toBe(201);
    const second = await secure(admin.post('/api/payments')).send(input);
    expect(second.body.id).toBe(first.body.id);
    expect(await db.payment.count({ where: { idempotencyKey: input.idempotencyKey } })).toBe(1);
    expect(
      (await secure(admin.post('/api/payments')).send({ ...input, amount: '100' })).status,
    ).toBe(409);
    expect(
      (
        await secure(admin.post('/api/payments/' + first.body.id + '/refunds')).send({
          amount: '1000',
          reason: 'Исправление суммы',
          idempotencyKey: crypto.randomUUID(),
        })
      ).status,
    ).toBe(201);
    const invoice = await db.invoice.findUniqueOrThrow({
      where: { id: invoiceId },
      include: { allocations: { include: { payment: { include: { refunds: true } } } } },
    });
    expect(invoice.allocations[0]!.amount.toFixed(2)).toBe('5000.10');
    expect(
      invoice.amount
        .minus('5000.10')
        .plus(invoice.allocations[0]!.payment.refunds[0]!.amount)
        .toFixed(2),
    ).toBe('23999.90');
  });
  it('аналитика совпадает с БД и не раскрывает финансы учителю', async () => {
    const r = await admin.get('/api/analytics');
    expect(r.status).toBe(200);
    expect(r.body.activeStudents).toBe(await db.student.count({ where: { status: 'ACTIVE' } }));
    const t = await teacher.get('/api/analytics');
    expect(t.body).not.toHaveProperty('receipts');
    expect(t.body).not.toHaveProperty('debt');
  });
  it('архивирование сохраняет финансовую историю', async () => {
    expect(
      (await secure(admin.post('/api/students/' + studentId + '/archive')).send({})).status,
    ).toBe(200);
    expect(await db.payment.count({ where: { studentId } })).toBe(1);
    expect(await db.groupEnrollment.count({ where: { studentId, leftAt: null } })).toBe(0);
  });
  it('изменение цены тарифа не меняет купленный абонемент', async () => {
    const sub = await db.subscription.findUniqueOrThrow({ where: { id: subscriptionId } });
    await db.tariffPlan.update({
      where: { id: sub.tariffId },
      data: { price: sub.price.plus(1000) },
    });
    const saved = await db.subscription.findUniqueOrThrow({ where: { id: subscriptionId } });
    expect(saved.price.eq(sub.price)).toBe(true);
  });
  it('отмена занятия восстанавливает списание и сохраняет историю', async () => {
    const start = (await db.lesson.findUniqueOrThrow({ where: { id: lessonId } })).startsAt;
    await db.groupEnrollment.updateMany({
      where: { groupId, studentId },
      data: { joinedAt: new Date(+start - 86400000), leftAt: new Date() },
    });
    expect(
      (
        await secure(admin.put('/api/attendance/' + lessonId)).send({
          entries: [{ studentId, status: 'PRESENT' }],
        })
      ).status,
    ).toBe(200);
    expect(await db.subscriptionUsage.count({ where: { subscriptionId, reversedAt: null } })).toBe(
      1,
    );
    expect((await secure(admin.post('/api/lessons/' + lessonId + '/cancel')).send({})).status).toBe(
      200,
    );
    expect(await db.subscriptionUsage.count({ where: { subscriptionId, reversedAt: null } })).toBe(
      0,
    );
    expect(await db.attendance.count({ where: { studentId, lessonId } })).toBe(1);
  });
  it('квитанция возвращает настоящий PDF и недоступна преподавателю', async () => {
    const payment = await db.payment.findFirstOrThrow({ where: { studentId } });
    const response = await admin.get('/api/payments/' + payment.id + '/receipt.pdf');
    expect(response.status).toBe(200);
    expect(response.headers['content-type']).toContain('application/pdf');
    expect(Buffer.from(response.body).subarray(0, 5).toString()).toBe('%PDF-');
    expect((await teacher.get('/api/payments/' + payment.id + '/receipt.pdf')).status).toBe(403);
  });
  it('уведомления создаются без дублей и читаются только владельцем', async () => {
    const a = await admin.get('/api/notifications');
    const b = await admin.get('/api/notifications');
    expect(a.status).toBe(200);
    expect(b.body.items.length).toBe(a.body.items.length);
    const notification = b.body.items[0];
    expect(notification).toBeTruthy();
    expect(
      (await secure(teacher.post('/api/notifications/' + notification.id + '/read')).send({})).body
        .count,
    ).toBe(0);
    expect(
      (await secure(admin.post('/api/notifications/' + notification.id + '/read')).send({})).body
        .count,
    ).toBe(1);
  });
  it('преподаватель видит только свои занятия, даже при подмене фильтра', async () => {
    const current = await teacher.get('/api/auth/me');
    const lessons = await teacher.get('/api/lessons?teacherId=' + teacherId);
    expect(lessons.status).toBe(200);
    expect(
      lessons.body.items.every(
        (l: { teacherId: string }) => l.teacherId === current.body.teacherId,
      ),
    ).toBe(true);
    expect(lessons.body.items.length).toBeGreaterThan(0);
  });
});
