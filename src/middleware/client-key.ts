import type { NextFunction, Request, Response } from 'express';

export function requireClientKey(req: Request, res: Response, next: NextFunction) {
  const expectedKey = (process.env.CACHE_APP_KEY || '').trim();
  if (!expectedKey) {
    next();
    return;
  }

  const providedKey = String(req.header('x-app-key') || '').trim();
  if (providedKey && providedKey === expectedKey) {
    next();
    return;
  }

  res.status(401).json({ ok: false, error: 'invalid_app_key' });
}
