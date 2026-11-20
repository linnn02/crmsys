import { db } from '../repositories/db.js';
import type { Principal } from '../middlewares/auth.js';
import { D } from './finance.js';
const localDay = (date: Date) =>
  new Intl.DateTimeFormat('en-CA', {
    timeZone: 'Asia/Almaty',
    year: 'numeric',
    month: '2-digit',
    day: '2-digit',
  }).format(date);
export async function analytics(
  actor: Principal,
  from: Date,
  to: Date,
  filters: { groupId?: string; courseId?: string } = {},
) {
  const teacher = actor.role === 'TEACHER';
  const teacherFilter = teacher
    ? { teacherId: actor.teacherId ?? '00000000-0000-0000-0000-000000000000' }
    : {};
  const groupFilter = { ...teacherFilter, id: filters.groupId, courseId: filters.courseId };
  const scoped = teacher || !!filters.groupId || !!filters.courseId;
  const lessonFilter = {
    ...teacherFilter,
    group: { id: filters.groupId, courseId: filters.courseId },
  };
  const studentFilter = scoped
    ? { enrollments: { some: { leftAt: null, group: groupFilter } } }
    : {};
  const [students, newStudents, groups, lessons, attendance, upcoming] = await Promise.all([
    db.student.count({ where: { status: 'ACTIVE', ...studentFilter } }),
    db.student.count({ where: { createdAt: { gte: from, lte: to }, ...studentFilter } }),
    db.group.findMany({
      where: groupFilter,
      include: { course: true, _count: { select: { enrollments: { where: { leftAt: null } } } } },
    }),
    db.lesson.findMany({ where: { startsAt: { gte: from, lte: to }, ...lessonFilter } }),
    db.attendance.findMany({
      where: { lesson: { startsAt: { gte: from, lte: to }, status: 'COMPLETED', ...lessonFilter } },
      include: { lesson: true },
    }),
    db.lesson.findMany({
      where: { startsAt: { gte: new Date() }, status: 'PLANNED', ...lessonFilter },
      include: { group: true, teacher: true, room: true },
      take: 6,
      orderBy: { startsAt: 'asc' },
    }),
  ]);
  const present = attendance.filter((a) => ['PRESENT', 'LATE'].includes(a.status)).length;
  const attendanceByDay = new Map<string, { date: string; present: number; total: number }>();
  for (const a of attendance) {
    const date = localDay(a.lesson.startsAt);
    const v = attendanceByDay.get(date) ?? { date, present: 0, total: 0 };
    v.total++;
    v.present += ['PRESENT', 'LATE'].includes(a.status) ? 1 : 0;
    attendanceByDay.set(date, v);
  }
  const todayStart = new Date(localDay(new Date()) + 'T00:00:00+05:00');
  const [todayLessons, studentRows, enrollments] = await Promise.all([
    db.lesson.count({
      where: {
        ...lessonFilter,
        startsAt: { gte: todayStart, lt: new Date(+todayStart + 86400000) },
        status: { not: 'CANCELLED' },
      },
    }),
    db.student.findMany({
      where: { ...studentFilter, createdAt: { gte: from, lte: to } },
      select: { createdAt: true },
    }),
    db.groupEnrollment.findMany({
      where: { leftAt: null, group: groupFilter },
      include: { group: { include: { course: true } } },
    }),
  ]);
  const studentTrend = new Map<string, number>();
  for (const s of studentRows) {
    const key = localDay(s.createdAt);
    studentTrend.set(key, (studentTrend.get(key) ?? 0) + 1);
  }
  const distribution = new Map<string, Set<string>>();
  for (const e of enrollments) {
    const set = distribution.get(e.group.course.name) ?? new Set<string>();
    set.add(e.studentId);
    distribution.set(e.group.course.name, set);
  }
  const basic = {
    todayLessons,
    studentTrend: [...studentTrend]
      .sort(([a], [b]) => a.localeCompare(b))
      .map(([date, count]) => ({ date, count })),
    courseDistribution: [...distribution].map(([name, ids]) => ({ name, count: ids.size })),
    activeStudents: students,
    newStudents,
    groupCount: groups.length,
    completedLessons: lessons.filter((l) => l.status === 'COMPLETED').length,
    attendancePercent: attendance.length ? Math.round((present / attendance.length) * 100) : 0,
    attendanceChart: [...attendanceByDay.values()].sort((a, b) => a.date.localeCompare(b.date)),
    groups: groups.map((g) => ({
      name: g.name,
      course: g.course.name,
      students: g._count.enrollments,
      capacity: g.capacity,
    })),
    upcoming,
  };
  if (teacher) return basic;
  const invoiceFilter = scoped ? { subscription: { group: groupFilter } } : {};
  const paymentFilter = scoped ? { allocations: { some: { invoice: invoiceFilter } } } : {};
  const [payments, refunds, invoices, subscriptions] = await Promise.all([
    db.payment.findMany({
      where: { ...paymentFilter, createdAt: { gte: from, lte: to } },
      include: { student: true },
      orderBy: { createdAt: 'desc' },
    }),
    db.refund.findMany({ where: { payment: paymentFilter, createdAt: { gte: from, lte: to } } }),
    db.invoice.findMany({
      where: invoiceFilter,
      include: { allocations: { include: { payment: { include: { refunds: true } } } } },
    }),
    db.subscription.findMany({
      where: scoped ? { group: groupFilter } : {},
      include: { student: true, tariff: true, usage: { where: { reversedAt: null } } },
    }),
  ]);
  const receipts = payments.reduce((s, p) => s.plus(p.amount), D(0));
  const returned = refunds.reduce((s, r) => s.plus(r.amount), D(0));
  const outstanding = invoices.reduce(
    (s, i) =>
      s
        .plus(i.amount)
        .minus(
          i.allocations.reduce(
            (p, a) =>
              p.plus(a.amount).minus(a.payment.refunds.reduce((r, f) => r.plus(f.amount), D(0))),
            D(0),
          ),
        ),
    D(0),
  );
  const paymentByDay = new Map<string, string>();
  for (const p of payments) {
    const date = localDay(p.createdAt);
    paymentByDay.set(
      date,
      D(paymentByDay.get(date) ?? 0)
        .plus(p.amount)
        .toFixed(2),
    );
  }
  const attention = subscriptions.filter(
    (s) =>
      s.endsAt < new Date(Date.now() + 7 * 86400000) ||
      (s.lessonLimit !== null && s.lessonLimit - s.usage.length <= 2),
  );
  return {
    ...basic,
    expiredSubscriptions: subscriptions.filter((s) => s.endsAt < new Date()).length,
    expiringSubscriptions: subscriptions.filter(
      (s) => s.endsAt >= new Date() && +s.endsAt <= Date.now() + 7 * 86400000,
    ).length,
    receipts: receipts.toFixed(2),
    refunds: returned.toFixed(2),
    netReceipts: receipts.minus(returned).toFixed(2),
    charges: invoices
      .filter((i) => i.createdAt >= from && i.createdAt <= to)
      .reduce((s, i) => s.plus(i.amount), D(0))
      .toFixed(2),
    debt: outstanding.toFixed(2),
    activeSubscriptions: subscriptions.filter(
      (s) =>
        s.status === 'ACTIVE' &&
        s.endsAt >= new Date() &&
        (s.lessonLimit === null || s.usage.length < s.lessonLimit),
    ).length,
    attention: attention.slice(0, 10),
    paymentChart: [...paymentByDay]
      .map(([date, amount]) => ({ date, amount }))
      .sort((a, b) => a.date.localeCompare(b.date)),
    recentPayments: payments.slice(0, 6),
  };
}
