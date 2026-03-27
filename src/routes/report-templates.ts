import { Router } from 'express';
import { z } from 'zod';
import { getRedis } from '../redis.js';
import type { ReportTemplateRecord } from '../types.js';

const router = Router();

const maxTemplateBytes = Number(process.env.MAX_TEMPLATE_BYTES || 50 * 1024);
const ttlSeconds = Math.max(1, Number(process.env.TTL_DAYS || 90)) * 24 * 60 * 60;
const keyIndexPrefix = 'zentto:report-template-index';
const keyPublicPrefix = 'zentto:report-template-public';
const keyPublicIndexPrefix = 'zentto:report-template-public-index';

const identitySchema = z.object({
  companyId: z.coerce.string().trim().min(1),
  email: z.string().trim().email().optional(),
  userId: z.coerce.string().trim().min(1).optional(),
});

const companyOnlySchema = z.object({
  companyId: z.coerce.string().trim().min(1),
});

const putBodySchema = identitySchema.extend({
  templateId: z.string().trim().min(1),
  template: z.record(z.any()),
});

const putPublicBodySchema = companyOnlySchema.extend({
  templateId: z.string().trim().min(1),
  template: z.record(z.any()),
});

function normalizeUserKey(userId?: string, email?: string): string {
  const key = userId?.trim() || email?.trim().toLowerCase();
  if (!key) {
    throw new Error('user identity is required');
  }
  return key;
}

function buildRedisKey(companyId: string, userKey: string, templateId: string): string {
  return `zentto:report-template:${companyId}:${userKey}:${templateId}`;
}

function buildIndexKey(companyId: string, userKey: string): string {
  return `${keyIndexPrefix}:${companyId}:${userKey}`;
}

function buildPublicKey(companyId: string, templateId: string): string {
  return `${keyPublicPrefix}:${companyId}:${templateId}`;
}

function buildPublicIndexKey(companyId: string): string {
  return `${keyPublicIndexPrefix}:${companyId}`;
}

function stampTemplate(template: Record<string, unknown>): Record<string, unknown> {
  return {
    ...template,
    updatedAt: typeof template.updatedAt === 'string' && (template.updatedAt as string).trim()
      ? template.updatedAt
      : new Date().toISOString(),
  };
}

async function saveRecord(record: ReportTemplateRecord) {
  const redis = getRedis();
  const redisKey = buildRedisKey(record.companyId, record.userKey, record.templateId);
  const indexKey = buildIndexKey(record.companyId, record.userKey);
  const raw = JSON.stringify(record);

  if (Buffer.byteLength(raw, 'utf8') > maxTemplateBytes) {
    throw new Error('template_too_large');
  }

  const pipeline = redis.pipeline();
  pipeline.set(redisKey, raw, 'EX', ttlSeconds);
  pipeline.sadd(indexKey, record.templateId);
  pipeline.expire(indexKey, ttlSeconds);
  await pipeline.exec();
}

/* ── List all template IDs for a user/company ── */
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
  const templateIds = await redis.smembers(indexKey);

  res.json({ ok: true, templateIds });
});

/* ── List all PUBLIC templates for a company ── */
router.get('/public', async (req, res) => {
  const parsed = companyOnlySchema.safeParse(req.query);
  if (!parsed.success) {
    res.status(400).json({ ok: false, error: 'invalid_payload', details: parsed.error.flatten() });
    return;
  }

  const { companyId } = parsed.data;
  const redis = getRedis();
  const publicIndexKey = buildPublicIndexKey(companyId);
  const templateIds = await redis.smembers(publicIndexKey);

  if (templateIds.length === 0) {
    res.json({ ok: true, templates: [] });
    return;
  }

  const keys = templateIds.map((id) => buildPublicKey(companyId, id));
  const pipeline = redis.pipeline();
  for (const key of keys) {
    pipeline.get(key);
  }
  const results = await pipeline.exec();

  const templates: Array<{ templateId: string; name: string; description: string; category: string; updatedAt: string }> = [];
  if (results) {
    for (const [, result] of results) {
      if (result) {
        const record = JSON.parse(String(result)) as Record<string, unknown>;
        templates.push({
          templateId: String(record.templateId || ''),
          name: String(record.name || ''),
          description: String(record.description || ''),
          category: String(record.category || ''),
          updatedAt: String(record.updatedAt || ''),
        });
      }
    }
  }

  res.json({ ok: true, templates });
});

/* ── Save/update a PUBLIC template ── */
router.put('/public/:templateId', async (req, res) => {
  const parsed = putPublicBodySchema.safeParse({
    ...req.body,
    templateId: req.params.templateId,
  });

  if (!parsed.success) {
    res.status(400).json({ ok: false, error: 'invalid_payload', details: parsed.error.flatten() });
    return;
  }

  const { companyId, templateId, template } = parsed.data;
  const stamped = stampTemplate(template);
  const publicKey = buildPublicKey(companyId, templateId);
  const publicIndexKey = buildPublicIndexKey(companyId);

  const record = {
    companyId,
    templateId,
    template: stamped,
    name: String(template.name || ''),
    description: String(template.description || ''),
    category: String(template.category || ''),
    updatedAt: String(stamped.updatedAt),
  };

  const raw = JSON.stringify(record);
  if (Buffer.byteLength(raw, 'utf8') > maxTemplateBytes) {
    res.status(413).json({ ok: false, error: 'template_too_large' });
    return;
  }

  const redis = getRedis();
  const pipeline = redis.pipeline();
  pipeline.set(publicKey, raw, 'EX', ttlSeconds);
  pipeline.sadd(publicIndexKey, templateId);
  pipeline.expire(publicIndexKey, ttlSeconds);
  await pipeline.exec();

  res.json({ ok: true });
});

/* ── Get a specific template ── */
router.get('/:templateId', async (req, res) => {
  const parsedIdentity = identitySchema.safeParse(req.query);
  if (!parsedIdentity.success) {
    res.status(400).json({ ok: false, error: 'invalid_identity', details: parsedIdentity.error.flatten() });
    return;
  }

  const templateId = String(req.params.templateId || '').trim();
  if (!templateId) {
    res.status(400).json({ ok: false, error: 'template_id_required' });
    return;
  }

  const { companyId, email, userId } = parsedIdentity.data;
  const userKey = normalizeUserKey(userId, email);
  const redisKey = buildRedisKey(companyId, userKey, templateId);
  const redis = getRedis();
  const raw = await redis.get(redisKey);

  if (!raw) {
    res.status(404).json({ ok: false, error: 'template_not_found' });
    return;
  }

  const record = JSON.parse(raw) as ReportTemplateRecord;
  res.json({ ok: true, template: record.template, updatedAt: record.updatedAt });
});

/* ── Save/update a template ── */
router.put('/:templateId', async (req, res) => {
  const parsedBody = putBodySchema.safeParse({
    ...req.body,
    templateId: req.params.templateId,
  });

  if (!parsedBody.success) {
    res.status(400).json({ ok: false, error: 'invalid_payload', details: parsedBody.error.flatten() });
    return;
  }

  const { companyId, email, templateId, template, userId } = parsedBody.data;
  const userKey = normalizeUserKey(userId, email);
  const stamped = stampTemplate(template);
  const record: ReportTemplateRecord = {
    companyId,
    templateId,
    template: stamped,
    updatedAt: String(stamped.updatedAt),
    userKey,
  };

  try {
    await saveRecord(record);
    res.json({ ok: true });
  } catch (error) {
    if ((error as Error).message === 'template_too_large') {
      res.status(413).json({ ok: false, error: 'template_too_large' });
      return;
    }
    throw error;
  }
});

/* ── Delete a template ── */
router.delete('/:templateId', async (req, res) => {
  const parsedIdentity = identitySchema.safeParse(req.query);
  if (!parsedIdentity.success) {
    res.status(400).json({ ok: false, error: 'invalid_identity', details: parsedIdentity.error.flatten() });
    return;
  }

  const templateId = String(req.params.templateId || '').trim();
  if (!templateId) {
    res.status(400).json({ ok: false, error: 'template_id_required' });
    return;
  }

  const { companyId, email, userId } = parsedIdentity.data;
  const userKey = normalizeUserKey(userId, email);
  const redisKey = buildRedisKey(companyId, userKey, templateId);
  const indexKey = buildIndexKey(companyId, userKey);
  const redis = getRedis();
  const pipeline = redis.pipeline();
  pipeline.del(redisKey);
  pipeline.srem(indexKey, templateId);
  await pipeline.exec();

  res.json({ ok: true });
});

export default router;
