import type { Prisma } from '@prisma/client';
import type { z } from 'zod';
import { db, transaction } from '../repositories/db.js';
import type { Principal } from '../middlewares/auth.js';
import { requireCondition } from '../middlewares/errors.js';
import { studentInput, page } from '../validators/index.js';
import { audit } from './audit.js';
export function age(birthDate: Date, now = new Date()) {
  return (
    now.getUTCFullYear() -
    birthDate.getUTCFullYear() -
    (now.getUTCMonth() < birthDate.getUTCMonth() ||
    (now.getUTCMonth() === birthDate.getUTCMonth() && now.getUTCDate() < birthDate.getUTCDate())
      ? 1
      : 0)
  );
}
export async function listStudents(query: unknown, actor: Principal) {
  const q = page.parse(query);
  const where: Prisma.StudentWhereInput = {
    status: q.status,
    AND: [
      {
        OR: [
          { name: { contains: q.search, mode: 'insensitive' } },
          { parents: { some: { parent: { phone: { contains: q.search } } } } },
        ],
      },
      ...(q.groupId ? [{ enrollments: { some: { groupId: q.groupId, leftAt: null } } }] : []),
      ...(actor.role === 'TEACHER'
        ? [
            {
              enrollments: {
                some: {
                  leftAt: null,
                  group: { teacherId: actor.teacherId ?? '00000000-0000-0000-0000-000000000000' },
                },
              },
            },
          ]
        : []),
    ],
  };
  const [items, total] = await db.$transaction([
    db.student.findMany({
      where,
      include: {
        parents: { include: { parent: true } },
        enrollments: { where: { leftAt: null }, include: { group: true } },
      },
      skip: (q.page - 1) * q.pageSize,
      take: q.pageSize,
      orderBy: { name: 'asc' },
    }),
    db.student.count({ where }),
  ]);
  return {
    items: items.map((s) => ({
      ...s,
      age: age(s.birthDate),
      enrollments:
        actor.role === 'TEACHER'
          ? s.enrollments.filter((e) => e.group.teacherId === actor.teacherId)
          : s.enrollments,
    })),
    total,
    page: q.page,
    pageSize: q.pageSize,
  };
}
export async function saveStudent(
  input: z.infer<typeof studentInput>,
  actor: Principal,
  id?: string,
) {
  return transaction(async (tx) => {
    const { parentIds, ...fields } = input;
    requireCondition(
      new Set(parentIds).size === parentIds.length,
      422,
      'DUPLICATE',
      'Представитель указан дважды',
    );
    requireCondition(
      (await tx.parent.count({ where: { id: { in: parentIds } } })) === parentIds.length,
      422,
      'PARENT',
      'Представитель не найден',
    );
    const data = { ...fields, birthDate: new Date(fields.birthDate) };
    const student = id
      ? await tx.student.update({ where: { id }, data })
      : await tx.student.create({ data });
    await tx.studentParent.deleteMany({ where: { studentId: student.id } });
    await tx.studentParent.createMany({
      data: parentIds.map((parentId) => ({ studentId: student.id, parentId })),
    });
    await audit(tx, actor.id, id ? 'UPDATE' : 'CREATE', 'Student', student.id);
    return student;
  });
}
export async function studentDetail(id: string, actor: Principal) {
  const student = await db.student.findUnique({
    where: { id },
    include: {
      parents: { include: { parent: true } },
      enrollments: { include: { group: true } },
      attendance: {
        include: { lesson: { include: { group: true } } },
        orderBy: { createdAt: 'desc' },
        take: 100,
      },
      ...(actor.role === 'TEACHER'
        ? {}
        : {
            subscriptions: { include: { tariff: true, usage: true } },
            invoices: {
              include: { allocations: { include: { payment: { include: { refunds: true } } } } },
            },
            payments: { include: { refunds: true } },
          }),
    },
  });
  requireCondition(student, 404, 'NOT_FOUND', 'Ученик не найден');
  if (actor.role === 'TEACHER') {
    requireCondition(
      student.enrollments.some((e) => !e.leftAt && e.group.teacherId === actor.teacherId),
      403,
      'FORBIDDEN',
      'Ученик не входит в ваши группы',
    );
    return {
      ...student,
      age: age(student.birthDate),
      enrollments: student.enrollments.filter((e) => e.group.teacherId === actor.teacherId),
      attendance: student.attendance.filter((a) => a.lesson.teacherId === actor.teacherId),
    };
  }
  return { ...student, age: age(student.birthDate) };
}
export async function enroll(groupId: string, studentId: string, actor: Principal) {
  return transaction(async (tx) => {
    const group = await tx.group.findUniqueOrThrow({
      where: { id: groupId },
      include: { enrollments: { where: { leftAt: null } } },
    });
    requireCondition(group.status === 'ACTIVE', 409, 'INACTIVE', 'Группа неактивна');
    const student = await tx.student.findUniqueOrThrow({ where: { id: studentId } });
    requireCondition(student.status === 'ACTIVE', 409, 'INACTIVE', 'Ученик неактивен');
    requireCondition(
      !group.enrollments.some((e) => e.studentId === studentId),
      409,
      'ENROLLED',
      'Ученик уже записан',
    );
    requireCondition(
      group.enrollments.length < group.capacity,
      409,
      'CAPACITY',
      'В группе нет свободных мест',
    );
    const result = await tx.groupEnrollment.create({ data: { groupId, studentId } });
    await audit(tx, actor.id, 'ENROLL', 'Group', groupId, { studentId });
    return result;
  });
}
