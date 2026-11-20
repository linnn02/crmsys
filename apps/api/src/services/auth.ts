import argon2 from 'argon2';
import jwt from 'jsonwebtoken';
import { db } from '../repositories/db.js';
import { config } from '../config.js';
import { HttpError } from '../middlewares/errors.js';
export async function login(email: string, password: string) {
  const user = await db.user.findUnique({
    where: { email: email.toLowerCase() },
    include: { role: true },
  });
  if (!user || !user.active || !(await argon2.verify(user.passwordHash, password)))
    throw new HttpError(401, 'CREDENTIALS', 'Неверный email или пароль');
  const session = await db.session.create({
    data: { userId: user.id, expiresAt: new Date(Date.now() + 8 * 3600000) },
  });
  const token = jwt.sign({ sid: session.id }, config.JWT_SECRET, {
    subject: user.id,
    expiresIn: '8h',
    algorithm: 'HS256',
    issuer: 'child-crm',
    audience: 'child-crm-web',
  });
  return { token, user: { id: user.id, name: user.name, email: user.email, role: user.role.code } };
}
