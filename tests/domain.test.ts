import { describe, it, expect } from 'vitest';
import { age } from '../apps/api/src/services/students.js';
import { overlaps } from '../apps/api/src/services/lessons.js';
import { shouldCharge } from '../apps/api/src/services/attendance.js';
import { debt } from '../apps/api/src/services/finance.js';
import { lessonInput, paymentInput } from '../apps/api/src/validators/index.js';
describe('Бизнес-правила', () => {
  it('возраст меняется в день рождения', () => {
    expect(age(new Date('2018-10-18'), new Date('2026-10-17'))).toBe(7);
    expect(age(new Date('2018-10-18'), new Date('2026-10-18'))).toBe(8);
  });
  it('смежные интервалы не конфликтуют', () => {
    expect(overlaps(new Date(0), new Date(10), new Date(10), new Date(20))).toBe(false);
    expect(overlaps(new Date(0), new Date(11), new Date(10), new Date(20))).toBe(true);
  });
  it('правила уважительного пропуска отличаются от отсутствия', () => {
    expect(shouldCharge('EXCUSED', { chargeAbsent: true, chargeExcused: false })).toBe(false);
    expect(shouldCharge('ABSENT', { chargeAbsent: true, chargeExcused: false })).toBe(true);
  });
  it('денежные операции не теряют десятичную точность', () =>
    expect(debt('100.30', '50.20', '0.10').toFixed(2)).toBe('50.20'));
  it('отклоняет отрицательный платёж', () =>
    expect(
      paymentInput.safeParse({
        studentId: crypto.randomUUID(),
        invoiceId: crypto.randomUUID(),
        amount: '-1',
        method: 'CASH',
        idempotencyKey: crypto.randomUUID(),
      }).success,
    ).toBe(false));
  it('отклоняет неправильный интервал занятия', () =>
    expect(
      lessonInput.safeParse({
        groupId: crypto.randomUUID(),
        teacherId: crypto.randomUUID(),
        roomId: crypto.randomUUID(),
        startsAt: '2026-10-18T12:00:00Z',
        endsAt: '2026-10-18T11:00:00Z',
      }).success,
    ).toBe(false));
});
