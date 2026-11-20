import type { RequestHandler } from 'express';
import jwt from 'jsonwebtoken';
import type { RoleCode } from '@prisma/client';
import { db } from '../repositories/db.js';
import { config } from '../config.js';
import { HttpError } from './errors.js';
export type Principal = {
  id: string;
  name: string;
  email: string;
  role: RoleCode;
  teacherId: string | null;
  sessionId: string;
};
declare global {
  namespace Express {
    interface Request {
      principal: Principal;
    }
  }
}
export const authenticate: RequestHandler = async (req, _res, next) => {
  try {
    const token: unknown = req.cookies?.session;
    if (typeof token !== 'string') throw new Error('Missing token');
    const claims = jwt.verify(token, config.JWT_SECRET, {
      algorithms: ['HS256'],
      issuer: 'child-crm',
      audience: 'child-crm-web',
    });
    if (typeof claims === 'string' || typeof claims.sid !== 'string')
      throw new Error('Invalid token');
    const session = await db.session.findUnique({
      where: { id: claims.sid },
      include: { user: { include: { role: true, teacher: true } } },
    });
    if (
      !session ||
      session.revokedAt ||
      session.expiresAt <= new Date() ||
      !session.user.active ||
      claims.sub !== session.userId
    )
      throw new Error('Expired session');
    req.principal = {
      id: session.userId,
      name: session.user.name,
      email: session.user.email,
      role: session.user.role.code,
      teacherId: session.user.teacher?.id ?? null,
      sessionId: session.id,
    };
    next();
  } catch {
    next(new HttpError(401, 'UNAUTHENTICATED', 'Войдите в систему'));
  }
};
export const allow =
  (...roles: RoleCode[]): RequestHandler =>
  (req, _res, next) =>
    roles.includes(req.principal.role)
      ? next()
      : next(new HttpError(403, 'FORBIDDEN', 'Недостаточно прав'));
export const csrf: RequestHandler = (req, _res, next) => {
  if (['GET', 'HEAD', 'OPTIONS'].includes(req.method)) return next();
  if (req.headers.origin !== config.WEB_ORIGIN || req.headers['x-csrf-protection'] !== '1')
    return next(new HttpError(403, 'CSRF', 'Источник запроса не разрешён'));
  next();
};
