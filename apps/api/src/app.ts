import express from 'express';
import swaggerUi from 'swagger-ui-express';
import { openapi } from './openapi.js';
import cors from 'cors';
import helmet from 'helmet';
import cookieParser from 'cookie-parser';
import { config } from './config.js';
import { csrf } from './middlewares/auth.js';
import { errors } from './middlewares/errors.js';
import { api } from './routes/api.js';
import { db } from './repositories/db.js';
export const app = express();
app.disable('x-powered-by');
app.use(
  helmet(),
  cors({ origin: config.WEB_ORIGIN, credentials: true }),
  express.json({ limit: '128kb' }),
  cookieParser(),
);
app.get('/health', async (_req, res) => {
  try {
    await db.$queryRaw`SELECT 1`;
    res.json({ status: 'ok', database: 'connected' });
  } catch {
    res.status(503).json({ status: 'unavailable', database: 'disconnected' });
  }
});
app.get('/api/openapi.json', (_req, res) => res.json(openapi));
app.use('/api/docs', swaggerUi.serve, swaggerUi.setup(openapi));
app.use('/api', csrf, api);
app.use((_req, res) =>
  res.status(404).json({ error: { code: 'NOT_FOUND', message: 'Маршрут не найден' } }),
);
app.use(errors);
