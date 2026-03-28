import { Router } from 'express';
import { z } from 'zod';
import { getRedis } from '../redis.js';
import type { GridLayoutRecord, GridLayoutSnapshot } from '../types.js';

const router = Router();

const maxLayoutBytes = Number(process.env.MAX_LAYOUT_BYTES || 50 * 1024);
const ttlSeconds = Math.max(1, Number(process.env.TTL_DAYS || 90)) * 24 * 60 * 60;
const keyIndexPrefix = 'zentto:grid-layout-index';

const identityBase = z.object({
  companyId: z.coerce.string().trim().min(1),
  email: z.string().trim().email().optional(),
  userId: z.coerce.string().trim().min(1).optional(),
});

const identitySchema = identityBase.refine(
  (data) => Boolean(data.userId || data.email),
  { message: 'userId or email is required' },
);

const putBodySchema = identityBase.extend({
  gridId: z.string().trim().min(1),
  layout: z.record(z.any()),
}).refine(
  (data) => Boolean(data.userId || data.email),
  { message: 'userId or email is required' },
);

function normalizeUserKey(userId?: string, email?: string): string {
  const key = userId?.trim() || email?.trim().toLowerCase();
  if (!key) {
    throw new Error('user identity is required');
  }
  return key;
}

function buildRedisKey(companyId: string, userKey: string, gridId: string): string {
  return `zentto:grid-layout:${companyId}:${userKey}:${gridId}`;
}

function buildIndexKey(companyId: string, userKey: string): string {
  return `${keyIndexPrefix}:${companyId}:${userKey}`;
}

function stampLayout(layout: GridLayoutSnapshot): GridLayoutSnapshot {
  return {
    ...layout,
    updatedAt: typeof layout.updatedAt === 'string' && layout.updatedAt.trim()
      ? layout.updatedAt
      : new Date().toISOString(),
  };
}

async function saveRecord(record: GridLayoutRecord) {
  const redis = getRedis();
  const redisKey = buildRedisKey(record.companyId, record.userKey, record.gridId);
  const indexKey = buildIndexKey(record.companyId, record.userKey);
  const raw = JSON.stringify(record);

  if (Buffer.byteLength(raw, 'utf8') > maxLayoutBytes) {
    throw new Error('layout_too_large');
  }

  const pipeline = redis.pipeline();
  pipeline.set(redisKey, raw, 'EX', ttlSeconds);
  pipeline.sadd(indexKey, record.gridId);
  pipeline.expire(indexKey, ttlSeconds);
  await pipeline.exec();
}

router.get('/', async (req, res) => {
  const parsedIdentity = identitySchema.safeParse(req.query);
  if (!parsedIdentity.success) {
    res.status(400).json({ ok: false, error: 'invalid_identity', details: parsedIdentity.error.flatten() });
    return;
  }

  const { companyId, email, userId } = parsedIdentity.data;
  const userKey = normalizeUserKey(userId, email);
  const redis = getRedis();
  const indexKey = buildIndexKey(companyId, userKey);
  const gridIds = await redis.smembers(indexKey);

  res.json({ ok: true, gridIds });
});

router.get('/:gridId', async (req, res) => {
  const parsedIdentity = identitySchema.safeParse(req.query);
  if (!parsedIdentity.success) {
    res.status(400).json({ ok: false, error: 'invalid_identity', details: parsedIdentity.error.flatten() });
    return;
  }

  const gridId = String(req.params.gridId || '').trim();
  if (!gridId) {
    res.status(400).json({ ok: false, error: 'grid_id_required' });
    return;
  }

  const { companyId, email, userId } = parsedIdentity.data;
  const userKey = normalizeUserKey(userId, email);
  const redisKey = buildRedisKey(companyId, userKey, gridId);
  const redis = getRedis();
  const raw = await redis.get(redisKey);

  if (!raw) {
    res.status(404).json({ ok: false, error: 'layout_not_found' });
    return;
  }

  const record = JSON.parse(raw) as GridLayoutRecord;
  res.json({ ok: true, layout: record.layout, updatedAt: record.updatedAt });
});

router.put('/:gridId', async (req, res) => {
  const parsedBody = putBodySchema.safeParse({
    ...req.body,
    gridId: req.params.gridId,
  });

  if (!parsedBody.success) {
    res.status(400).json({ ok: false, error: 'invalid_payload', details: parsedBody.error.flatten() });
    return;
  }

  const { companyId, email, gridId, layout, userId } = parsedBody.data;
  const userKey = normalizeUserKey(userId, email);
  const stamped = stampLayout(layout);
  const record: GridLayoutRecord = {
    companyId,
    gridId,
    layout: stamped,
    updatedAt: String(stamped.updatedAt),
    userKey,
  };

  try {
    await saveRecord(record);
    res.json({ ok: true, layout: stamped, updatedAt: record.updatedAt });
  } catch (error) {
    if ((error as Error).message === 'layout_too_large') {
      res.status(413).json({ ok: false, error: 'layout_too_large' });
      return;
    }
    throw error;
  }
});

router.delete('/:gridId', async (req, res) => {
  const parsedIdentity = identitySchema.safeParse(req.query);
  if (!parsedIdentity.success) {
    res.status(400).json({ ok: false, error: 'invalid_identity', details: parsedIdentity.error.flatten() });
    return;
  }

  const gridId = String(req.params.gridId || '').trim();
  if (!gridId) {
    res.status(400).json({ ok: false, error: 'grid_id_required' });
    return;
  }

  const { companyId, email, userId } = parsedIdentity.data;
  const userKey = normalizeUserKey(userId, email);
  const redisKey = buildRedisKey(companyId, userKey, gridId);
  const indexKey = buildIndexKey(companyId, userKey);
  const redis = getRedis();
  const pipeline = redis.pipeline();
  pipeline.del(redisKey);
  pipeline.srem(indexKey, gridId);
  await pipeline.exec();

  res.json({ ok: true });
});

export default router;
