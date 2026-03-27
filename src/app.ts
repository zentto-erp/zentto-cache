import cors from 'cors';
import express from 'express';
import pino from 'pino';
import { requireClientKey } from './middleware/client-key.js';
import gridLayoutsRouter from './routes/grid-layouts.js';
import { getRedis } from './redis.js';

const logger = pino({
  level: process.env.LOG_LEVEL || 'info',
});

function parseCorsOrigins(): string[] {
  return String(process.env.CORS_ORIGINS || '')
    .split(',')
    .map((item) => item.trim())
    .filter(Boolean);
}

export function createApp() {
  const app = express();
  const allowedOrigins = parseCorsOrigins();

  app.use(cors({
    origin: (origin, callback) => {
      if (!origin || allowedOrigins.length === 0 || allowedOrigins.includes(origin)) {
        callback(null, true);
        return;
      }
      callback(new Error('origin_not_allowed'));
    },
  }));
  app.use(express.json({ limit: '60kb' }));

  app.get('/', (_req, res) => {
    res.json({
      name: '@zentto/cache',
      ok: true,
      features: ['grid-layouts', 'redis', 'ttl'],
      version: '0.1.0',
    });
  });

  app.get('/health', async (_req, res) => {
    try {
      const redis = getRedis();
      await redis.ping();
      res.json({ ok: true, redis: true, timestamp: new Date().toISOString() });
    } catch (error) {
      logger.error({ err: error }, 'healthcheck_failed');
      res.status(503).json({ ok: false, redis: false, timestamp: new Date().toISOString() });
    }
  });

  app.use('/v1/grid-layouts', requireClientKey, gridLayoutsRouter);

  app.use((error: Error, _req: express.Request, res: express.Response, _next: express.NextFunction) => {
    logger.error({ err: error }, 'request_failed');
    res.status(500).json({ ok: false, error: 'internal_error' });
  });

  return app;
}
