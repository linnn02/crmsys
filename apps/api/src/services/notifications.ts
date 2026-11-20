import { db } from '../repositories/db.js';
import { D } from './finance.js';
// Internal delivery only. External transports can consume the same persisted events later.
export async function refreshNotifications() {
  const recipients = await db.user.findMany({
    where: { active: true, role: { code: { in: ['ADMIN', 'MANAGER'] } } },
    select: { id: true },
  });
  const subscriptions = await db.subscription.findMany({
    where: { status: { not: 'PAUSED' } },
    include: { student: true, usage: { where: { reversedAt: null } } },
  });
  const events: { type: string; key: string; message: string }[] = [];
  const now = Date.now();
  for (const s of subscriptions) {
    if (+s.endsAt >= now && +s.endsAt <= now + 7 * 86400000)
      events.push({
        type: 'EXPIRING',
        key: 'expiry:' + s.id + ':' + s.endsAt.toISOString().slice(0, 10),
        message: `Скоро истекает абонемент: ${s.student.name}`,
      });
    if (s.lessonLimit !== null && s.lessonLimit - s.usage.length <= 2 && +s.endsAt >= now)
      events.push({
        type: 'LOW_BALANCE',
        key: 'balance:' + s.id + ':' + s.usage.length,
        message: `Осталось ${s.lessonLimit - s.usage.length} занятий: ${s.student.name}`,
      });
  }
  const invoices = await db.invoice.findMany({
    where: { dueAt: { lt: new Date() } },
    include: {
      student: true,
      allocations: { include: { payment: { include: { refunds: true } } } },
    },
  });
  for (const i of invoices) {
    const balance = i.allocations.reduce(
      (s, a) => s.minus(a.amount).plus(a.payment.refunds.reduce((r, f) => r.plus(f.amount), D(0))),
      D(i.amount),
    );
    if (balance.gt(0))
      events.push({
        type: 'OVERDUE',
        key: 'overdue:' + i.id,
        message: `Просрочен счёт: ${i.student.name}. Проверьте остаток в разделе платежей.`,
      });
  }
  if (events.length && recipients.length)
    await db.notification.createMany({
      data: recipients.flatMap((u) =>
        events.map((e) => ({
          userId: u.id,
          type: e.type,
          message: e.message,
          deduplicationKey: u.id + ':' + e.key,
        })),
      ),
      skipDuplicates: true,
    });
}
