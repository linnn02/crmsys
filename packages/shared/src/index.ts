export const roles = ['ADMIN', 'MANAGER', 'TEACHER'] as const;
export type Role = (typeof roles)[number];
export const timeZone = 'Asia/Almaty';
export type ApiError = { error: { code: string; message: string; details?: unknown } };
