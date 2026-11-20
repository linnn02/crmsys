import type { Prisma } from '@prisma/client';
import type { Tx } from '../repositories/db.js';
export const audit = (
  tx: Tx,
  actorId: string,
  action: string,
  entity: string,
  entityId: string,
  details: Prisma.InputJsonValue = {},
) => tx.auditLog.create({ data: { actorId, action, entity, entityId, details } });
