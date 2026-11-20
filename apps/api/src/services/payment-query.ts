import { z } from 'zod';
import { page } from '../validators/index.js';
import type { Prisma } from '@prisma/client';
export function paymentQuery(query: unknown) {
  const paging = page.parse(query);
  const filters = z
    .object({
      from: z.iso.date().optional(),
      to: z.iso.date().optional(),
      method: z.enum(['CASH', 'CARD', 'TRANSFER', 'OTHER']).optional(),
    })
    .refine((q) => !q.from || !q.to || q.from <= q.to, 'Неверный период')
    .parse(query);
  const where: Prisma.PaymentWhereInput = {
    method: filters.method,
    student: { name: { contains: paging.search, mode: 'insensitive' } },
    createdAt: {
      gte: filters.from ? new Date(filters.from + 'T00:00:00+05:00') : undefined,
      lte: filters.to ? new Date(filters.to + 'T23:59:59.999+05:00') : undefined,
    },
  };
  return { paging, where };
}
