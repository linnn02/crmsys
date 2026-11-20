import type { ErrorRequestHandler } from 'express';
import { ZodError } from 'zod';
import { Prisma } from '@prisma/client';
export class HttpError extends Error {
  constructor(
    public status: number,
    public code: string,
    message: string,
  ) {
    super(message);
  }
}
export function requireCondition(
  value: unknown,
  status: number,
  code: string,
  message: string,
): asserts value {
  if (!value) throw new HttpError(status, code, message);
}
export const errors: ErrorRequestHandler = (error: unknown, _req, res, _next) => {
  if (error instanceof SyntaxError && 'status' in error && error.status === 400) {
    res.status(400).json({ error: { code: 'INVALID_JSON', message: 'Некорректный JSON' } });
    return;
  }
  if (error instanceof ZodError) {
    res.status(422).json({
      error: {
        code: 'VALIDATION',
        message: 'Проверьте заполнение полей',
        details: error.flatten(),
      },
    });
    return;
  }
  if (error instanceof HttpError) {
    res.status(error.status).json({ error: { code: error.code, message: error.message } });
    return;
  }
  if (error instanceof Prisma.PrismaClientKnownRequestError) {
    const code = error.code;
    res.status(code === 'P2025' ? 404 : 409).json({
      error: {
        code,
        message:
          code === 'P2002'
            ? 'Такая запись уже существует'
            : code === 'P2025'
              ? 'Запись не найдена'
              : 'Изменение конфликтует с другими данными. Обновите страницу.',
      },
    });
    return;
  }
  console.error(error instanceof Error ? error.message : 'Unknown error');
  res.status(500).json({ error: { code: 'INTERNAL', message: 'Внутренняя ошибка сервера' } });
};
