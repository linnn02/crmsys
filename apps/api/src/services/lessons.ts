import type { z } from 'zod';
import { transaction, type Tx } from '../repositories/db.js';
import { lessonInput } from '../validators/index.js';
import type { Principal } from '../middlewares/auth.js';
import { requireCondition } from '../middlewares/errors.js';
import { audit } from './audit.js';
export function overlaps(aStart: Date, aEnd: Date, bStart: Date, bEnd: Date) {
  return aStart < bEnd && aEnd > bStart;
}
async function check(
  tx: Tx,
  data: { groupId: string; teacherId: string; roomId: string; startsAt: Date; endsAt: Date },
  ignoreIds: string[] = [],
) {
  const group = await tx.group.findUniqueOrThrow({ where: { id: data.groupId } });
  const teacher = await tx.teacher.findUniqueOrThrow({ where: { id: data.teacherId } });
  const room = await tx.room.findUniqueOrThrow({ where: { id: data.roomId } });
  requireCondition(
    group.status === 'ACTIVE' && teacher.status === 'ACTIVE',
    409,
    'INACTIVE',
    'Группа или преподаватель неактивны',
  );
  requireCondition(
    room.capacity >= group.capacity,
    409,
    'ROOM_CAPACITY',
    'Вместимость кабинета меньше вместимости группы',
  );
  const conflict = await tx.lesson.findFirst({
    where: {
      id: { notIn: ignoreIds },
      status: { not: 'CANCELLED' },
      startsAt: { lt: data.endsAt },
      endsAt: { gt: data.startsAt },
      OR: [{ groupId: data.groupId }, { teacherId: data.teacherId }, { roomId: data.roomId }],
    },
  });
  requireCondition(
    !conflict,
    409,
    'SCHEDULE_CONFLICT',
    'В это время заняты преподаватель, группа или кабинет',
  );
}
export async function createLessons(input: z.infer<typeof lessonInput>, actor: Principal) {
  return transaction(async (tx) => {
    const recurrence =
      input.count > 1
        ? await tx.recurrenceRule.create({
            data: { count: input.count, intervalWeeks: input.intervalWeeks },
          })
        : null;
    const lessons = [];
    for (let i = 0; i < input.count; i++) {
      const offset = i * input.intervalWeeks * 7 * 86400000;
      const data = {
        groupId: input.groupId,
        teacherId: input.teacherId,
        roomId: input.roomId,
        startsAt: new Date(+new Date(input.startsAt) + offset),
        endsAt: new Date(+new Date(input.endsAt) + offset),
        recurrenceId: recurrence?.id,
      };
      await check(tx, data);
      lessons.push(await tx.lesson.create({ data }));
    }
    await audit(tx, actor.id, 'CREATE', 'Lesson', lessons[0]!.id, { count: lessons.length });
    return lessons;
  });
}
export async function editLesson(
  id: string,
  input: z.infer<typeof lessonInput>,
  scope: 'ONE' | 'SERIES',
  actor: Principal,
) {
  return transaction(async (tx) => {
    const original = await tx.lesson.findUniqueOrThrow({ where: { id } });
    const targets =
      scope === 'SERIES' && original.recurrenceId
        ? await tx.lesson.findMany({
            where: { recurrenceId: original.recurrenceId, status: 'PLANNED' },
          })
        : [original];
    requireCondition(
      targets.every((l) => l.status === 'PLANNED'),
      409,
      'HISTORY',
      'Проведённые и отменённые занятия нельзя переносить',
    );
    const delta = +new Date(input.startsAt) - +original.startsAt;
    const duration = +new Date(input.endsAt) - +new Date(input.startsAt);
    const proposed = targets.map((l) => ({
      id: l.id,
      groupId: input.groupId,
      teacherId: input.teacherId,
      roomId: input.roomId,
      startsAt: new Date(+l.startsAt + delta),
      endsAt: new Date(+l.startsAt + delta + duration),
    }));
    for (const a of proposed)
      for (const b of proposed)
        if (a.id !== b.id)
          requireCondition(
            !overlaps(a.startsAt, a.endsAt, b.startsAt, b.endsAt),
            409,
            'SCHEDULE_CONFLICT',
            'Занятия серии пересекаются',
          );
    for (const p of proposed)
      await check(
        tx,
        p,
        targets.map((l) => l.id),
      );
    for (const p of proposed) {
      const { id: lessonId, ...data } = p;
      await tx.lesson.update({ where: { id: lessonId }, data });
    }
    await audit(tx, actor.id, 'RESCHEDULE', 'Lesson', id, { scope });
    const user = await tx.teacher.findUnique({ where: { id: input.teacherId } });
    if (user?.userId)
      await tx.notification.create({
        data: {
          userId: user.userId,
          type: 'SCHEDULE',
          message: 'Расписание вашей группы изменено',
          deduplicationKey: crypto.randomUUID(),
        },
      });
    return proposed;
  });
}
export async function cancelLesson(id: string, actor: Principal) {
  return transaction(async (tx) => {
    const lesson = await tx.lesson.findUniqueOrThrow({
      where: { id },
      include: { attendance: true, teacher: true },
    });
    await tx.lesson.update({ where: { id }, data: { status: 'CANCELLED' } });
    await tx.subscriptionUsage.updateMany({
      where: { attendanceId: { in: lesson.attendance.map((a) => a.id) }, reversedAt: null },
      data: { reversedAt: new Date() },
    });
    await audit(tx, actor.id, 'CANCEL', 'Lesson', id);
    if (lesson.teacher.userId)
      await tx.notification.create({
        data: {
          userId: lesson.teacher.userId,
          type: 'CANCELLED',
          message: 'Занятие отменено: ' + lesson.startsAt.toISOString(),
          deduplicationKey: crypto.randomUUID(),
        },
      });
    return { ok: true };
  });
}
