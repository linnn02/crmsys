import { z } from 'zod';
export const id = z.string().uuid();
export const name = z.string().trim().min(2).max(160);
export const phone = z
  .string()
  .transform((s) => s.replace(/[\s()-]/g, ''))
  .pipe(z.string().regex(/^\+?[0-9]{10,15}$/));
export const status = z.enum(['ACTIVE', 'PAUSED', 'ARCHIVED']);
export const page = z.object({
  page: z.coerce.number().int().min(1).default(1),
  pageSize: z.coerce.number().int().min(1).max(100).default(20),
  search: z.string().max(160).default(''),
  status: status.optional(),
  groupId: id.optional(),
});
export const studentInput = z.object({
  name,
  birthDate: z.iso.date().refine((s) => new Date(s) <= new Date(), 'Дата рождения в будущем'),
  gender: z.enum(['MALE', 'FEMALE']).nullable().optional(),
  status: status.default('ACTIVE'),
  notes: z.string().max(3000).default(''),
  parentIds: z.array(id).min(1).max(5),
});
export const parentInput = z.object({
  name,
  phone,
  email: z.union([z.email(), z.literal('')]).optional(),
  notes: z.string().max(3000).default(''),
  preferredContact: z.enum(['PHONE', 'EMAIL', 'MESSENGER']).default('PHONE'),
});
export const teacherInput = z.object({
  name,
  phone,
  email: z.email(),
  specialization: z.string().min(2).max(200),
  status: status.default('ACTIVE'),
  userId: id.nullable().optional(),
});
export const courseInput = z
  .object({
    name,
    description: z.string().max(3000).default(''),
    minAge: z.number().int().min(0).max(18),
    maxAge: z.number().int().min(0).max(18),
    duration: z.number().int().min(15).max(240),
  })
  .refine((v) => v.maxAge >= v.minAge, 'Возрастной диапазон некорректен');
export const groupInput = z.object({
  name,
  courseId: id,
  teacherId: id,
  capacity: z.number().int().min(1).max(100),
  status: status.default('ACTIVE'),
});
export const roomInput = z.object({ name, capacity: z.number().int().min(1).max(100) });
export const money = z
  .string()
  .regex(/^\d{1,12}(\.\d{1,2})?$/)
  .refine((s) => Number(s) > 0, 'Сумма должна быть больше нуля');
export const tariffInput = z.object({
  name,
  price: money,
  lessonLimit: z.number().int().min(1).max(500).nullable(),
  validDays: z.number().int().min(1).max(730),
  chargeAbsent: z.boolean().default(true),
  chargeExcused: z.boolean().default(false),
  chargeCancelled: z.literal(false).default(false),
  active: z.boolean().default(true),
});
export const lessonInput = z
  .object({
    groupId: id,
    teacherId: id,
    roomId: id,
    startsAt: z.iso.datetime({ offset: true }),
    endsAt: z.iso.datetime({ offset: true }),
    count: z.number().int().min(1).max(52).default(1),
    intervalWeeks: z.number().int().min(1).max(4).default(1),
  })
  .refine((v) => new Date(v.endsAt) > new Date(v.startsAt), 'Окончание должно быть позже начала');
export const attendanceInput = z
  .object({
    entries: z
      .array(z.object({ studentId: id, status: z.enum(['PRESENT', 'ABSENT', 'EXCUSED', 'LATE']) }))
      .min(1)
      .max(100),
  })
  .refine(
    (v) => new Set(v.entries.map((e) => e.studentId)).size === v.entries.length,
    'Ученик указан дважды',
  );
export const subscriptionInput = z.object({
  studentId: id,
  tariffId: id,
  groupId: id,
  startsAt: z.iso.datetime({ offset: true }),
});
export const paymentInput = z.object({
  studentId: id,
  invoiceId: id,
  amount: money,
  method: z.enum(['CASH', 'CARD', 'TRANSFER', 'OTHER']),
  idempotencyKey: z.string().uuid(),
});
export const userInput = z.object({
  name,
  email: z.email().transform((s) => s.toLowerCase()),
  password: z.string().min(12).max(128),
  role: z.enum(['ADMIN', 'MANAGER', 'TEACHER']),
});
