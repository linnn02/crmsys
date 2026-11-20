import type { z } from 'zod';
import { transaction } from '../repositories/db.js';
import { attendanceInput } from '../validators/index.js';
import type { Principal } from '../middlewares/auth.js';
import { requireCondition } from '../middlewares/errors.js';
import { audit } from './audit.js';
export const shouldCharge = (
  status: string,
  rule: { chargeAbsent: boolean; chargeExcused: boolean },
) =>
  status === 'PRESENT' ||
  status === 'LATE' ||
  (status === 'ABSENT' && rule.chargeAbsent) ||
  (status === 'EXCUSED' && rule.chargeExcused);
export async function markAttendance(
  lessonId: string,
  input: z.infer<typeof attendanceInput>,
  actor: Principal,
) {
  return transaction(async (tx) => {
    const lesson = await tx.lesson.findUniqueOrThrow({
      where: { id: lessonId },
      include: { group: true },
    });
    requireCondition(
      actor.role !== 'TEACHER' || lesson.teacherId === actor.teacherId,
      403,
      'FORBIDDEN',
      'Нельзя отмечать чужое занятие',
    );
    requireCondition(lesson.status !== 'CANCELLED', 409, 'CANCELLED', 'Занятие отменено');
    requireCondition(
      lesson.startsAt <= new Date(),
      409,
      'FUTURE',
      'Нельзя отметить посещение будущего занятия',
    );
    for (const entry of input.entries) {
      const enrollment = await tx.groupEnrollment.findFirst({
        where: {
          groupId: lesson.groupId,
          studentId: entry.studentId,
          joinedAt: { lte: lesson.startsAt },
          OR: [{ leftAt: null }, { leftAt: { gt: lesson.startsAt } }],
        },
      });
      requireCondition(
        enrollment,
        422,
        'NOT_ENROLLED',
        'Ученик не был записан в группу на дату занятия',
      );
      const old = await tx.attendance.findUnique({
        where: { studentId_lessonId: { studentId: entry.studentId, lessonId } },
        include: { usage: { include: { subscription: true } } },
      });
      const row = await tx.attendance.upsert({
        where: { studentId_lessonId: { studentId: entry.studentId, lessonId } },
        create: { ...entry, lessonId },
        update: { status: entry.status },
      });
      if (old?.status !== entry.status)
        await tx.attendanceHistory.create({
          data: {
            attendanceId: row.id,
            previous: old?.status,
            next: entry.status,
            actorId: actor.id,
          },
        });
      const candidates = old?.usage
        ? [old.usage.subscription]
        : await tx.subscription.findMany({
            where: {
              studentId: entry.studentId,
              groupId: lesson.groupId,
              status: { not: 'PAUSED' },
              startsAt: { lte: lesson.startsAt },
              endsAt: { gte: lesson.startsAt },
            },
            orderBy: { endsAt: 'asc' },
          });
      for (const sub of candidates) {
        const charge = shouldCharge(entry.status, sub);
        if (old?.usage && !charge) {
          await tx.subscriptionUsage.update({
            where: { id: old.usage.id },
            data: { reversedAt: new Date() },
          });
          break;
        }
        if (!charge) break;
        if (old?.usage && !old.usage.reversedAt) break;
        const used = await tx.subscriptionUsage.count({
          where: { subscriptionId: sub.id, reversedAt: null },
        });
        if (sub.lessonLimit !== null && used >= sub.lessonLimit) continue;
        await tx.subscriptionUsage.upsert({
          where: { attendanceId: row.id },
          create: { attendanceId: row.id, subscriptionId: sub.id },
          update: { reversedAt: null },
        });
        break;
      }
    }
    await tx.lesson.update({ where: { id: lessonId }, data: { status: 'COMPLETED' } });
    await audit(tx, actor.id, 'MARK', 'Attendance', lessonId, { count: input.entries.length });
    return tx.attendance.findMany({ where: { lessonId }, include: { student: true, usage: true } });
  });
}
