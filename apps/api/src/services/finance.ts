import { createHash } from 'node:crypto';
import { Prisma } from '@prisma/client';
import type { z } from 'zod';
import { transaction } from '../repositories/db.js';
import { paymentInput, subscriptionInput } from '../validators/index.js';
import type { Principal } from '../middlewares/auth.js';
import { requireCondition } from '../middlewares/errors.js';
import { audit } from './audit.js';
export const D = (n: Prisma.Decimal.Value) => new Prisma.Decimal(n);
export function debt(
  amount: Prisma.Decimal.Value,
  paid: Prisma.Decimal.Value,
  refunded: Prisma.Decimal.Value,
) {
  return D(amount).minus(paid).plus(refunded);
}
export async function buySubscription(input: z.infer<typeof subscriptionInput>, actor: Principal) {
  return transaction(async (tx) => {
    const tariff = await tx.tariffPlan.findUniqueOrThrow({ where: { id: input.tariffId } });
    requireCondition(tariff.active, 409, 'INACTIVE', 'Тариф отключён');
    const group = await tx.group.findUniqueOrThrow({ where: { id: input.groupId } });
    const start = new Date(input.startsAt),
      end = new Date(+start + tariff.validDays * 86400000);
    const sub = await tx.subscription.create({
      data: {
        ...input,
        courseId: group.courseId,
        startsAt: start,
        endsAt: end,
        price: tariff.price,
        lessonLimit: tariff.lessonLimit,
        chargeAbsent: tariff.chargeAbsent,
        chargeExcused: tariff.chargeExcused,
        chargeCancelled: tariff.chargeCancelled,
      },
    });
    await tx.invoice.create({
      data: { studentId: input.studentId, subscriptionId: sub.id, amount: sub.price, dueAt: start },
    });
    await audit(tx, actor.id, 'PURCHASE', 'Subscription', sub.id);
    return sub;
  });
}
export async function recordPayment(input: z.infer<typeof paymentInput>, actor: Principal) {
  return transaction(async (tx) => {
    const hash = createHash('sha256')
      .update(JSON.stringify({ ...input, amount: D(input.amount).toFixed(2) }))
      .digest('hex');
    const previous = await tx.payment.findUnique({
      where: { idempotencyKey: input.idempotencyKey },
    });
    if (previous) {
      requireCondition(
        previous.requestHash === hash,
        409,
        'IDEMPOTENCY',
        'Ключ уже использован для другой операции',
      );
      return previous;
    }
    const invoice = await tx.invoice.findUniqueOrThrow({
      where: { id: input.invoiceId },
      include: { allocations: { include: { payment: { include: { refunds: true } } } } },
    });
    requireCondition(
      invoice.studentId === input.studentId,
      422,
      'STUDENT_MISMATCH',
      'Счёт принадлежит другому ученику',
    );
    const paid = invoice.allocations.reduce(
      (s, a) => s.plus(a.amount).minus(a.payment.refunds.reduce((r, f) => r.plus(f.amount), D(0))),
      D(0),
    );
    requireCondition(
      D(input.amount).lte(invoice.amount.minus(paid)),
      409,
      'OVERPAYMENT',
      'Сумма больше задолженности по счёту',
    );
    const payment = await tx.payment.create({
      data: {
        studentId: input.studentId,
        amount: input.amount,
        method: input.method,
        idempotencyKey: input.idempotencyKey,
        requestHash: hash,
        recordedBy: actor.id,
        allocations: { create: { invoiceId: input.invoiceId, amount: input.amount } },
      },
    });
    await audit(tx, actor.id, 'PAYMENT', 'Payment', payment.id, {
      amount: input.amount,
      source: 'MANUAL',
    });
    return payment;
  });
}
export async function refundPayment(
  paymentId: string,
  amount: string,
  reason: string,
  key: string,
  actor: Principal,
) {
  return transaction(async (tx) => {
    const previous = await tx.refund.findUnique({ where: { idempotencyKey: key } });
    if (previous) {
      requireCondition(
        previous.paymentId === paymentId &&
          previous.amount.eq(amount) &&
          previous.reason === reason,
        409,
        'IDEMPOTENCY',
        'Ключ уже использован',
      );
      return previous;
    }
    const payment = await tx.payment.findUniqueOrThrow({
      where: { id: paymentId },
      include: { refunds: true },
    });
    const refunded = payment.refunds.reduce((s, r) => s.plus(r.amount), D(0));
    requireCondition(
      D(amount).lte(payment.amount.minus(refunded)),
      409,
      'REFUND_AMOUNT',
      'Возврат превышает остаток платежа',
    );
    const refund = await tx.refund.create({
      data: { paymentId, amount, reason, idempotencyKey: key, recordedBy: actor.id },
    });
    await audit(tx, actor.id, 'REFUND', 'Payment', paymentId, { amount, reason });
    return refund;
  });
}
