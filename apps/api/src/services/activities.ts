import type { Prisma, BookingStatus } from '@prisma/client';
import { db, transaction } from '../repositories/db.js';
import type { Principal } from '../middlewares/auth.js';
import { requireCondition } from '../middlewares/errors.js';
import { audit } from './audit.js';
import { age } from './students.js';
import type * as v from '../validators/index.js';
import type { z } from 'zod';

const activeStatuses: { notIn: BookingStatus[] } = { notIn: ['CANCELLED', 'NO_SHOW'] };

export const listActivities = () => db.activity.findMany({ orderBy: { name: 'asc' }, include: { course: true } });
export const listVenues = () => db.venue.findMany({ orderBy: { name: 'asc' } });
export const listInventory = () => db.inventoryItem.findMany({ orderBy: { name: 'asc' } });
export const listConsents = (studentId?: string) => db.parentConsent.findMany({
  where: studentId ? { studentId } : undefined,
  include: { student: true, parent: true }, orderBy: { validUntil: 'asc' },
});
export const listBookings = (from?: Date, to?: Date) => db.activityBooking.findMany({
  where: { startsAt: { gte: from ?? new Date(Date.now() - 86400000), lte: to ?? new Date(Date.now() + 30 * 86400000) } },
  include: { student: true, activity: true, venue: true, instructor: true, consent: true, inventoryIssues: { include: { item: true } } },
  orderBy: { startsAt: 'asc' }, take: 1000,
});

export async function saveActivity(input: z.infer<typeof v.activityInput>, actor: Principal, id?: string) {
  return transaction(async (tx) => {
    const data = { ...input, minHeightCm: input.minHeightCm ?? null, maxWeightKg: input.maxWeightKg ?? null, courseId: input.courseId ?? null };
    const result = id ? await tx.activity.update({ where: { id }, data }) : await tx.activity.create({ data });
    await audit(tx, actor.id, id ? 'UPDATE' : 'CREATE', 'Activity', result.id);
    return result;
  });
}
export async function saveVenue(input: z.infer<typeof v.venueInput>, actor: Principal, id?: string) {
  return transaction(async (tx) => { const result = id ? await tx.venue.update({ where: { id }, data: input }) : await tx.venue.create({ data: input }); await audit(tx, actor.id, id ? 'UPDATE' : 'CREATE', 'Venue', result.id); return result; });
}
export async function saveInventory(input: z.infer<typeof v.inventoryItemInput>, actor: Principal, id?: string) {
  return transaction(async (tx) => { const result = id ? await tx.inventoryItem.update({ where: { id }, data: input }) : await tx.inventoryItem.create({ data: input }); await audit(tx, actor.id, id ? 'UPDATE' : 'CREATE', 'InventoryItem', result.id); return result; });
}
export async function saveConsent(input: z.infer<typeof v.consentInput>, actor: Principal, id?: string) {
  return transaction(async (tx) => {
    const relation = await tx.studentParent.findUnique({ where: { studentId_parentId: { studentId: input.studentId, parentId: input.parentId } } });
    requireCondition(Boolean(relation), 422, 'INVALID_CONSENT', 'Представитель не связан с ребёнком');
    const data = { ...input, validUntil: input.validUntil ? new Date(input.validUntil) : null, validFrom: new Date(input.validFrom) };
    const result = id ? await tx.parentConsent.update({ where: { id }, data }) : await tx.parentConsent.create({ data });
    await audit(tx, actor.id, id ? 'UPDATE' : 'CREATE', 'ParentConsent', result.id); return result;
  });
}

export async function createBooking(input: z.infer<typeof v.activityBookingInput>, actor: Principal) {
  return transaction(async (tx) => {
    const startsAt = new Date(input.startsAt), endsAt = new Date(input.endsAt);
    const [student, activity, venue] = await Promise.all([
      tx.student.findUniqueOrThrow({ where: { id: input.studentId } }),
      tx.activity.findUniqueOrThrow({ where: { id: input.activityId } }),
      tx.venue.findUniqueOrThrow({ where: { id: input.venueId } }),
    ]);
    requireCondition(activity.status === 'ACTIVE', 422, 'ACTIVITY_INACTIVE', 'Активность недоступна');
    requireCondition(venue.active, 422, 'VENUE_INACTIVE', 'Площадка недоступна');
    const studentAge = age(student.birthDate);
    requireCondition(studentAge >= activity.minAge && studentAge <= activity.maxAge, 422, 'AGE_RESTRICTION', 'Возраст ребёнка не подходит');
    if (activity.minHeightCm) requireCondition(Boolean(student.heightCm && Number(student.heightCm) >= Number(activity.minHeightCm)), 422, 'HEIGHT_RESTRICTION', 'Рост ребёнка ниже ограничения');
    if (activity.maxWeightKg) requireCondition(Boolean(student.weightKg && Number(student.weightKg) <= Number(activity.maxWeightKg)), 422, 'WEIGHT_RESTRICTION', 'Вес ребёнка выше ограничения');
    if (activity.requiresConsent) {
      requireCondition(Boolean(input.consentId), 422, 'CONSENT_REQUIRED', 'Нужно согласие родителя');
      const consent = await tx.parentConsent.findUnique({ where: { id: input.consentId! } });
      const day = new Date(startsAt.toISOString().slice(0, 10));
      requireCondition(Boolean(consent && consent.studentId === student.id && consent.validFrom <= day && (!consent.validUntil || consent.validUntil >= day)), 422, 'CONSENT_INVALID', 'Согласие недействительно');
    }
    const overlap = { startsAt: { lt: endsAt }, endsAt: { gt: startsAt }, status: activeStatuses };
    const [activityCount, venueConflict, studentConflict, instructorConflict] = await Promise.all([
      tx.activityBooking.count({ where: { activityId: activity.id, ...overlap } }),
      tx.activityBooking.findFirst({ where: { venueId: venue.id, ...overlap } }),
      tx.activityBooking.findFirst({ where: { studentId: student.id, ...overlap } }),
      input.instructorId ? tx.activityBooking.findFirst({ where: { instructorId: input.instructorId, ...overlap } }) : null,
    ]);
    requireCondition(activityCount < activity.capacity, 409, 'ACTIVITY_FULL', 'Свободных мест больше нет');
    requireCondition(!venueConflict, 409, 'VENUE_CONFLICT', 'Площадка уже занята');
    requireCondition(!studentConflict, 409, 'STUDENT_CONFLICT', 'У ребёнка уже есть активность в это время');
    requireCondition(!instructorConflict, 409, 'INSTRUCTOR_CONFLICT', 'Инструктор уже занят в это время');
    const result = await tx.activityBooking.create({ data: { ...input, startsAt, endsAt, price: input.price, instructorId: input.instructorId ?? null, consentId: input.consentId ?? null } });
    await audit(tx, actor.id, 'CREATE', 'ActivityBooking', result.id); return result;
  });
}
export async function updateBookingStatus(id: string, status: 'RESERVED'|'PAID'|'EQUIPMENT_ISSUED'|'ARRIVED'|'IN_PROGRESS'|'CONFIRMED'|'COMPLETED'|'CANCELLED'|'NO_SHOW', actor: Principal) {
  return transaction(async (tx) => { const result = await tx.activityBooking.update({ where: { id }, data: { status } }); await audit(tx, actor.id, 'STATUS', 'ActivityBooking', id, { status }); return result; });
}
export async function issueInventory(bookingId: string, input: z.infer<typeof v.inventoryIssueInput>, actor: Principal) {
  return transaction(async (tx) => {
    const item = await tx.inventoryItem.findUniqueOrThrow({ where: { id: input.itemId } });
    const issued = await tx.inventoryIssue.aggregate({ where: { itemId: item.id, returnedAt: null }, _sum: { quantity: true } });
    requireCondition(item.status !== 'RETIRED' && item.status !== 'MAINTENANCE' && (issued._sum.quantity ?? 0) + input.quantity <= item.quantity, 409, 'INVENTORY_UNAVAILABLE', 'Инвентарь недоступен');
    const result = await tx.inventoryIssue.create({ data: { bookingId, itemId: item.id, quantity: input.quantity } });
    await tx.inventoryItem.update({ where: { id: item.id }, data: { status: 'ISSUED' } }); await audit(tx, actor.id, 'ISSUE', 'InventoryIssue', result.id); return result;
  });
}
export async function returnInventory(id: string, actor: Principal) {
  return transaction(async (tx) => { const issue = await tx.inventoryIssue.update({ where: { id }, data: { returnedAt: new Date() } }); await tx.inventoryItem.update({ where: { id: issue.itemId }, data: { status: 'AVAILABLE' } }); await audit(tx, actor.id, 'RETURN', 'InventoryIssue', id); return issue; });
}

export async function createPublicBooking(input: z.infer<typeof import('../validators/index.js').publicBookingInput>) {
  const admin = await db.user.findFirstOrThrow({ where: { role: { code: 'ADMIN' }, active: true } });
  const result = await transaction(async (tx) => {
    const parent = await tx.parent.upsert({
      where: { phone: input.parentPhone },
      create: { name: input.parentName, phone: input.parentPhone, email: input.parentEmail ?? '' },
      update: { name: input.parentName, email: input.parentEmail ?? undefined },
    });
    const student = await tx.student.upsert({
      where: { name_birthDate: { name: input.childName, birthDate: new Date(input.birthDate) } },
      create: { name: input.childName, birthDate: new Date(input.birthDate), footSize: input.footSize ?? null, skiLevel: input.skiLevel ?? null, parents: { create: { parentId: parent.id } } },
      update: { footSize: input.footSize ?? undefined, skiLevel: input.skiLevel ?? undefined },
    });
    await tx.studentParent.upsert({ where: { studentId_parentId: { studentId: student.id, parentId: parent.id } }, create: { studentId: student.id, parentId: parent.id }, update: {} });
    const consent = await tx.parentConsent.create({ data: { studentId: student.id, parentId: parent.id, consentType: 'ОНЛАЙН-ЗАПИСЬ', validFrom: new Date() } });
    return { student, consent };
  });
  const { childName: _childName, birthDate: _birthDate, footSize: _footSize, skiLevel: _skiLevel, parentName: _parentName, parentPhone: _parentPhone, parentEmail: _parentEmail, consentAccepted: _consentAccepted, ...booking } = input;
  return createBooking({ ...booking, studentId: result.student.id, consentId: result.consent.id, source: 'ONLINE' }, { id: admin.id, name: admin.name, email: admin.email, role: 'ADMIN', teacherId: null, sessionId: '' });
}
