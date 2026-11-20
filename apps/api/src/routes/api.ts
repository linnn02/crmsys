import { Router } from 'express';
import { paymentQuery } from '../services/payment-query.js';
import { receipt } from '../services/receipt.js';
import { refreshNotifications } from '../services/notifications.js';
import { z } from 'zod';
import argon2 from 'argon2';
import { rateLimit } from 'express-rate-limit';
import { config } from '../config.js';
import { authenticate, allow } from '../middlewares/auth.js';
import { requireCondition } from '../middlewares/errors.js';
import { db, transaction } from '../repositories/db.js';
import * as v from '../validators/index.js';
import { login } from '../services/auth.js';
import { listStudents, saveStudent, studentDetail, enroll } from '../services/students.js';
import { createLessons, editLesson, cancelLesson } from '../services/lessons.js';
import { markAttendance } from '../services/attendance.js';
import { buySubscription, recordPayment, refundPayment, D } from '../services/finance.js';
import { analytics } from '../services/analytics.js';
import { audit } from '../services/audit.js';
import { resourceRoutes } from '../controllers/resources.js';
export const api = Router();
api.post(
  '/auth/login',
  rateLimit({
    windowMs: 15 * 60000,
    limit: 20,
    standardHeaders: 'draft-8',
    legacyHeaders: false,
    handler: (_req, res) =>
      res
        .status(429)
        .json({
          error: { code: 'RATE_LIMIT', message: 'Слишком много попыток входа. Повторите позже.' },
        }),
  }),
  async (req, res) => {
    const input = z
      .object({ email: z.email(), password: z.string().min(1).max(128) })
      .parse(req.body);
    const result = await login(input.email, input.password);
    res.cookie('session', result.token, {
      httpOnly: true,
      secure: config.NODE_ENV === 'production',
      sameSite: 'strict',
      path: '/api',
      maxAge: 8 * 3600000,
    });
    res.json(result.user);
  },
);
api.use(authenticate);
api.get('/auth/me', (req, res) => res.json(req.principal));
api.post('/auth/logout', async (req, res) => {
  await db.session.update({
    where: { id: req.principal.sessionId },
    data: { revokedAt: new Date() },
  });
  res
    .clearCookie('session', {
      path: '/api',
      httpOnly: true,
      sameSite: 'strict',
      secure: config.NODE_ENV === 'production',
    })
    .json({ ok: true });
});
api.use(resourceRoutes());
api.get('/students', async (req, res) => res.json(await listStudents(req.query, req.principal)));
api.get('/students/:id', async (req, res) =>
  res.json(await studentDetail(v.id.parse(req.params.id), req.principal)),
);
api.post('/students', allow('ADMIN', 'MANAGER'), async (req, res) =>
  res.status(201).json(await saveStudent(v.studentInput.parse(req.body), req.principal)),
);
api.put('/students/:id', allow('ADMIN', 'MANAGER'), async (req, res) =>
  res.json(
    await saveStudent(v.studentInput.parse(req.body), req.principal, v.id.parse(req.params.id)),
  ),
);
api.post('/students/:id/archive', allow('ADMIN', 'MANAGER'), async (req, res) =>
  res.json(
    await transaction(async (tx) => {
      const id = v.id.parse(req.params.id);
      const s = await tx.student.update({ where: { id }, data: { status: 'ARCHIVED' } });
      await tx.groupEnrollment.updateMany({
        where: { studentId: id, leftAt: null },
        data: { leftAt: new Date() },
      });
      await audit(tx, req.principal.id, 'ARCHIVE', 'Student', id);
      return s;
    }),
  ),
);
api.post('/groups/:id/enrollments', allow('ADMIN', 'MANAGER'), async (req, res) =>
  res
    .status(201)
    .json(await enroll(v.id.parse(req.params.id), v.id.parse(req.body.studentId), req.principal)),
);
api.delete('/groups/:id/enrollments/:studentId', allow('ADMIN', 'MANAGER'), async (req, res) =>
  res.json(
    await transaction(async (tx) => {
      const groupId = v.id.parse(req.params.id),
        studentId = v.id.parse(req.params.studentId);
      const result = await tx.groupEnrollment.updateMany({
        where: { groupId, studentId, leftAt: null },
        data: { leftAt: new Date() },
      });
      await audit(tx, req.principal.id, 'UNENROLL', 'Group', groupId, { studentId });
      return result;
    }),
  ),
);
api.get('/my/groups', async (req, res) =>
  res.json({
    items: await db.group.findMany({
      where:
        req.principal.role === 'TEACHER'
          ? { teacherId: req.principal.teacherId ?? '00000000-0000-0000-0000-000000000000' }
          : {},
      include: {
        course: true,
        enrollments: { where: { leftAt: null }, include: { student: true } },
      },
    }),
  }),
);
api.get('/lessons', async (req, res) => {
  const q = z
    .object({
      from: z.iso.datetime({ offset: true }).optional(),
      to: z.iso.datetime({ offset: true }).optional(),
      groupId: v.id.optional(),
      teacherId: v.id.optional(),
    })
    .parse(req.query);
  res.json({
    items: await db.lesson.findMany({
      where: {
        startsAt: {
          gte: q.from ? new Date(q.from) : new Date(Date.now() - 31 * 86400000),
          lte: q.to ? new Date(q.to) : new Date(Date.now() + 62 * 86400000),
        },
        groupId: q.groupId,
        teacherId:
          req.principal.role === 'TEACHER'
            ? (req.principal.teacherId ?? '00000000-0000-0000-0000-000000000000')
            : q.teacherId,
      },
      include: { group: true, teacher: true, room: true },
      orderBy: { startsAt: 'asc' },
      take: 1000,
    }),
  });
});
api.post('/lessons', allow('ADMIN', 'MANAGER'), async (req, res) =>
  res.status(201).json(await createLessons(v.lessonInput.parse(req.body), req.principal)),
);
api.put('/lessons/:id', allow('ADMIN', 'MANAGER'), async (req, res) =>
  res.json(
    await editLesson(
      v.id.parse(req.params.id),
      v.lessonInput.parse(req.body),
      z.enum(['ONE', 'SERIES']).default('ONE').parse(req.query.scope),
      req.principal,
    ),
  ),
);
api.post('/lessons/:id/cancel', allow('ADMIN', 'MANAGER'), async (req, res) =>
  res.json(await cancelLesson(v.id.parse(req.params.id), req.principal)),
);
api.get('/attendance/:lessonId', async (req, res) => {
  const lesson = await db.lesson.findUniqueOrThrow({
    where: { id: v.id.parse(req.params.lessonId) },
    include: { attendance: { include: { student: true } } },
  });
  requireCondition(
    req.principal.role !== 'TEACHER' || lesson.teacherId === req.principal.teacherId,
    403,
    'FORBIDDEN',
    'Чужое занятие',
  );
  const enrollments = await db.groupEnrollment.findMany({
    where: {
      groupId: lesson.groupId,
      joinedAt: { lte: lesson.startsAt },
      OR: [{ leftAt: null }, { leftAt: { gt: lesson.startsAt } }],
    },
    include: { student: true },
  });
  res.json({ lesson, students: enrollments.map((e) => e.student), entries: lesson.attendance });
});
api.put('/attendance/:lessonId', async (req, res) =>
  res.json(
    await markAttendance(
      v.id.parse(req.params.lessonId),
      v.attendanceInput.parse(req.body),
      req.principal,
    ),
  ),
);
api.get('/subscriptions', allow('ADMIN', 'MANAGER'), async (req, res) => {
  const q = v.page.parse(req.query);
  const where = { student: { name: { contains: q.search, mode: 'insensitive' as const } } };
  const [rows, total] = await Promise.all([
    db.subscription.findMany({
      where,
      include: { student: true, tariff: true, group: true, usage: { where: { reversedAt: null } } },
      skip: (q.page - 1) * q.pageSize,
      take: q.pageSize,
      orderBy: { endsAt: 'asc' },
    }),
    db.subscription.count({ where }),
  ]);
  res.json({
    items: rows.map((s) => ({
      ...s,
      used: s.usage.length,
      remaining: s.lessonLimit === null ? null : s.lessonLimit - s.usage.length,
      status:
        s.status === 'PAUSED'
          ? 'PAUSED'
          : s.endsAt < new Date()
            ? 'EXPIRED'
            : s.lessonLimit !== null && s.usage.length >= s.lessonLimit
              ? 'EXHAUSTED'
              : 'ACTIVE',
    })),
    total,
  });
});
api.post('/subscriptions', allow('ADMIN', 'MANAGER'), async (req, res) =>
  res.status(201).json(await buySubscription(v.subscriptionInput.parse(req.body), req.principal)),
);
api.post('/subscriptions/:id/:action', allow('ADMIN', 'MANAGER'), async (req, res) => {
  const action = z.enum(['freeze', 'resume', 'extend']).parse(req.params.action);
  res.json(
    await transaction(async (tx) => {
      const sub = await tx.subscription.findUniqueOrThrow({
        where: { id: v.id.parse(req.params.id) },
      });
      const now = new Date();
      let data: { status?: 'PAUSED' | 'ACTIVE'; frozenAt?: Date | null; endsAt?: Date };
      if (action === 'freeze') {
        requireCondition(
          sub.status !== 'PAUSED' && sub.endsAt > now,
          409,
          'STATE',
          'Нельзя заморозить этот абонемент',
        );
        data = { status: 'PAUSED', frozenAt: now };
      } else if (action === 'resume') {
        requireCondition(sub.frozenAt, 409, 'STATE', 'Абонемент не заморожен');
        data = {
          status: 'ACTIVE',
          frozenAt: null,
          endsAt: new Date(+sub.endsAt + (+now - +sub.frozenAt)),
        };
      } else {
        const days = z.number().int().min(1).max(365).parse(req.body.days);
        data = { endsAt: new Date(+sub.endsAt + days * 86400000) };
      }
      const result = await tx.subscription.update({ where: { id: sub.id }, data });
      await tx.subscriptionHistory.create({
        data: {
          subscriptionId: sub.id,
          action,
          actorId: req.principal.id,
          details: { previousEnd: sub.endsAt.toISOString(), nextEnd: result.endsAt.toISOString() },
        },
      });
      await audit(tx, req.principal.id, action, 'Subscription', sub.id);
      return result;
    }),
  );
});
api.get('/invoices', allow('ADMIN', 'MANAGER'), async (req, res) => {
  const q = v.page.parse(req.query);
  const [rows, total] = await Promise.all([
    db.invoice.findMany({
      include: {
        student: true,
        allocations: { include: { payment: { include: { refunds: true } } } },
      },
      skip: (q.page - 1) * q.pageSize,
      take: q.pageSize,
      orderBy: { createdAt: 'desc' },
    }),
    db.invoice.count(),
  ]);
  res.json({
    items: rows.map((i) => ({
      ...i,
      debt: i.allocations
        .reduce(
          (s, a) =>
            s.minus(a.amount).plus(a.payment.refunds.reduce((r, f) => r.plus(f.amount), D(0))),
          D(i.amount),
        )
        .toFixed(2),
    })),
    total,
  });
});
api.get('/payments', allow('ADMIN', 'MANAGER'), async (req, res) => {
  const { paging: q, where } = paymentQuery(req.query);
  const [items, total] = await Promise.all([
    db.payment.findMany({
      where,
      include: { student: true, refunds: true, allocations: true },
      skip: (q.page - 1) * q.pageSize,
      take: q.pageSize,
      orderBy: { createdAt: 'desc' },
    }),
    db.payment.count({ where }),
  ]);
  res.json({ items, total });
});
api.post('/payments', allow('ADMIN', 'MANAGER'), async (req, res) =>
  res.status(201).json(await recordPayment(v.paymentInput.parse(req.body), req.principal)),
);
api.post('/payments/:id/refunds', allow('ADMIN', 'MANAGER'), async (req, res) => {
  const data = z
    .object({ amount: v.money, reason: z.string().min(3).max(500), idempotencyKey: z.uuid() })
    .parse(req.body);
  res
    .status(201)
    .json(
      await refundPayment(
        v.id.parse(req.params.id),
        data.amount,
        data.reason,
        data.idempotencyKey,
        req.principal,
      ),
    );
});
api.get('/analytics', async (req, res) => {
  const q = z
    .object({
      from: z.iso.datetime({ offset: true }).optional(),
      to: z.iso.datetime({ offset: true }).optional(),
      groupId: v.id.optional(),
      courseId: v.id.optional(),
    })
    .refine((q) => !q.from || !q.to || new Date(q.from) <= new Date(q.to), 'Неверный период')
    .parse(req.query);
  res.json(
    await analytics(
      req.principal,
      q.from ? new Date(q.from) : new Date(Date.now() - 30 * 86400000),
      q.to ? new Date(q.to) : new Date(),
      { groupId: q.groupId, courseId: q.courseId },
    ),
  );
});
api.get('/reports/payments.csv', allow('ADMIN', 'MANAGER'), async (req, res) => {
  const { where } = paymentQuery(req.query);
  const rows = await db.payment.findMany({
    where,
    include: { student: true },
    orderBy: { createdAt: 'desc' },
    take: 10000,
  });
  const cell = (s: string) => '"' + (/^[=+\-@]/.test(s) ? "'" : '') + s.replaceAll('"', '""') + '"';
  res
    .type('text/csv')
    .attachment('payments.csv')
    .send(
      '\uFEFF' +
        [
          'Дата,Ученик,Сумма KZT,Способ,Источник',
          ...rows.map((p) =>
            [p.createdAt.toISOString(), p.student.name, p.amount.toFixed(2), p.method, p.source]
              .map(cell)
              .join(','),
          ),
        ].join('\r\n'),
    );
});
api.get('/notifications', async (req, res) => {
  if (req.principal.role !== 'TEACHER') await refreshNotifications();
  res.json({
    items: await db.notification.findMany({
      where: { userId: req.principal.id },
      orderBy: { createdAt: 'desc' },
      take: 100,
    }),
  });
});
api.get('/payments/:id/receipt.pdf', allow('ADMIN', 'MANAGER'), async (req, res) => {
  const id = v.id.parse(req.params.id);
  res
    .type('application/pdf')
    .attachment('receipt-' + id + '.pdf')
    .send(await receipt(id));
});
api.post('/notifications/:id/read', async (req, res) =>
  res.json(
    await db.notification.updateMany({
      where: { id: v.id.parse(req.params.id), userId: req.principal.id },
      data: { readAt: new Date() },
    }),
  ),
);
api.get('/users', allow('ADMIN'), async (_req, res) =>
  res.json({
    items: await db.user.findMany({
      select: {
        id: true,
        name: true,
        email: true,
        active: true,
        role: { select: { code: true } },
        teacher: { select: { id: true } },
      },
      orderBy: { name: 'asc' },
    }),
  }),
);
api.post('/users', allow('ADMIN'), async (req, res) => {
  const input = v.userInput.parse(req.body);
  const passwordHash = await argon2.hash(input.password, { type: argon2.argon2id });
  res.status(201).json(
    await transaction(async (tx) => {
      const role = await tx.role.findUniqueOrThrow({ where: { code: input.role } });
      const user = await tx.user.create({
        data: { name: input.name, email: input.email, passwordHash, roleId: role.id },
        select: { id: true, name: true, email: true },
      });
      await audit(tx, req.principal.id, 'CREATE', 'User', user.id);
      return user;
    }),
  );
});
api.patch('/users/:id', allow('ADMIN'), async (req, res) => {
  const input = z
    .object({
      active: z.boolean().optional(),
      role: z.enum(['ADMIN', 'MANAGER', 'TEACHER']).optional(),
      name: v.name.optional(),
      email: z
        .email()
        .transform((s) => s.toLowerCase())
        .optional(),
      password: z.string().min(12).max(128).optional(),
    })
    .refine((v) => Object.keys(v).length > 0, 'Пустой запрос')
    .parse(req.body);
  const id = v.id.parse(req.params.id);
  requireCondition(
    id !== req.principal.id || (input.active !== false && (!input.role || input.role === 'ADMIN')),
    409,
    'SELF',
    'Нельзя отключить собственную учётную запись',
  );
  const passwordHash = input.password
    ? await argon2.hash(input.password, { type: argon2.argon2id })
    : undefined;
  res.json(
    await transaction(async (tx) => {
      const current = await tx.user.findUniqueOrThrow({
        where: { id },
        include: { teacher: true },
      });
      requireCondition(
        !current.teacher || !input.role || input.role === 'TEACHER',
        409,
        'TEACHER_LINK',
        'Сначала снимите связь с профилем преподавателя',
      );
      const role = input.role
        ? await tx.role.findUniqueOrThrow({ where: { code: input.role } })
        : undefined;
      const user = await tx.user.update({
        where: { id },
        data: {
          active: input.active,
          name: input.name,
          email: input.email,
          passwordHash,
          roleId: role?.id,
        },
        select: { id: true, active: true },
      });
      if (input.active === false || input.role || passwordHash)
        await tx.session.updateMany({ where: { userId: id }, data: { revokedAt: new Date() } });
      await audit(tx, req.principal.id, 'UPDATE', 'User', id, {
        active: input.active ?? current.active,
        role: input.role ?? 'UNCHANGED',
        passwordChanged: !!passwordHash,
      });
      return user;
    }),
  );
});
api.get('/settings', allow('ADMIN'), async (_req, res) =>
  res.json({ items: await db.setting.findMany() }),
);
api.put('/settings', allow('ADMIN'), async (req, res) => {
  const input = z.object({ centerName: z.string().min(2).max(160) }).parse(req.body);
  res.json(
    await transaction(async (tx) => {
      const result = await tx.setting.upsert({
        where: { key: 'centerName' },
        create: { key: 'centerName', value: input.centerName },
        update: { value: input.centerName },
      });
      await audit(tx, req.principal.id, 'UPDATE', 'Setting', 'centerName');
      return result;
    }),
  );
});
