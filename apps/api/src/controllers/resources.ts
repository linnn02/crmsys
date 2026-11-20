import { Router } from 'express';
import type { Prisma, RoleCode } from '@prisma/client';
import { db, transaction, type Tx } from '../repositories/db.js';
import { allow } from '../middlewares/auth.js';
import {
  page,
  id,
  parentInput,
  teacherInput,
  courseInput,
  groupInput,
  roomInput,
  tariffInput,
} from '../validators/index.js';
import { audit } from '../services/audit.js';
import { requireCondition } from '../middlewares/errors.js';
type Resource = {
  list: (skip: number, take: number, search: string) => Promise<unknown[]>;
  count: (search: string) => Promise<number>;
  save: (tx: Tx, input: unknown, id?: string) => Promise<{ id: string }>;
  write: RoleCode[];
};
const match = (search: string) => ({ name: { contains: search, mode: 'insensitive' as const } });
const resources: Record<string, Resource> = {
  parents: {
    write: ['ADMIN', 'MANAGER'],
    list: (skip, take, s) =>
      db.parent.findMany({
        skip,
        take,
        where: match(s),
        include: { students: { include: { student: true } } },
        orderBy: { name: 'asc' },
      }),
    count: (s) => db.parent.count({ where: match(s) }),
    save: async (tx, input, id) => {
      const data = parentInput.parse(input);
      return id ? tx.parent.update({ where: { id }, data }) : tx.parent.create({ data });
    },
  },
  teachers: {
    write: ['ADMIN'],
    list: (skip, take, s) =>
      db.teacher.findMany({
        skip,
        take,
        where: match(s),
        include: { groups: true },
        orderBy: { name: 'asc' },
      }),
    count: (s) => db.teacher.count({ where: match(s) }),
    save: async (tx, input, id) => {
      const data = teacherInput.parse(input);
      if (data.userId) {
        const user = await tx.user.findUniqueOrThrow({
          where: { id: data.userId },
          include: { role: true },
        });
        requireCondition(
          user.role.code === 'TEACHER',
          422,
          'ROLE',
          'Учётная запись должна иметь роль преподавателя',
        );
      }
      return id ? tx.teacher.update({ where: { id }, data }) : tx.teacher.create({ data });
    },
  },
  courses: {
    write: ['ADMIN'],
    list: (skip, take, s) =>
      db.course.findMany({ skip, take, where: match(s), orderBy: { name: 'asc' } }),
    count: (s) => db.course.count({ where: match(s) }),
    save: async (tx, input, id) => {
      const data = courseInput.parse(input);
      return id ? tx.course.update({ where: { id }, data }) : tx.course.create({ data });
    },
  },
  groups: {
    write: ['ADMIN', 'MANAGER'],
    list: (skip, take, s) =>
      db.group.findMany({
        skip,
        take,
        where: match(s),
        include: {
          course: true,
          teacher: true,
          enrollments: { where: { leftAt: null }, include: { student: true } },
        },
        orderBy: { name: 'asc' },
      }),
    count: (s) => db.group.count({ where: match(s) }),
    save: async (tx, input, id) => {
      const data = groupInput.parse(input);
      if (id)
        requireCondition(
          (await tx.groupEnrollment.count({ where: { groupId: id, leftAt: null } })) <=
            data.capacity,
          409,
          'CAPACITY',
          'Вместимость меньше числа записанных учеников',
        );
      return id ? tx.group.update({ where: { id }, data }) : tx.group.create({ data });
    },
  },
  rooms: {
    write: ['ADMIN'],
    list: (skip, take, s) =>
      db.room.findMany({ skip, take, where: match(s), orderBy: { name: 'asc' } }),
    count: (s) => db.room.count({ where: match(s) }),
    save: async (tx, input, id) => {
      const data = roomInput.parse(input);
      return id ? tx.room.update({ where: { id }, data }) : tx.room.create({ data });
    },
  },
  tariffs: {
    write: ['ADMIN'],
    list: (skip, take, s) =>
      db.tariffPlan.findMany({ skip, take, where: match(s), orderBy: { name: 'asc' } }),
    count: (s) => db.tariffPlan.count({ where: match(s) }),
    save: async (tx, input, id) => {
      const data = tariffInput.parse(input);
      return id ? tx.tariffPlan.update({ where: { id }, data }) : tx.tariffPlan.create({ data });
    },
  },
};
export function resourceRoutes() {
  const router = Router();
  for (const [path, resource] of Object.entries(resources)) {
    router.get('/' + path, allow('ADMIN', 'MANAGER'), async (req, res) => {
      const q = page.parse(req.query);
      const [items, total] = await Promise.all([
        resource.list((q.page - 1) * q.pageSize, q.pageSize, q.search),
        resource.count(q.search),
      ]);
      res.json({ items, total, page: q.page, pageSize: q.pageSize });
    });
    for (const method of ['post', 'put'] as const)
      router[method](
        '/' + path + (method === 'put' ? '/:id' : ''),
        allow(...resource.write),
        async (req, res) => {
          const result = await transaction(async (tx) => {
            const row = await resource.save(
              tx,
              req.body,
              method === 'put' ? id.parse(req.params.id) : undefined,
            );
            await audit(
              tx,
              req.principal.id,
              method === 'post' ? 'CREATE' : 'UPDATE',
              path,
              row.id,
              {} as Prisma.InputJsonValue,
            );
            return row;
          });
          res.status(method === 'post' ? 201 : 200).json(result);
        },
      );
  }
  return router;
}
