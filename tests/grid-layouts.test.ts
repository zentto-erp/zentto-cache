import { describe, it, expect, beforeEach } from 'vitest';
import request from 'supertest';
import { createApp } from '../src/app.js';

const app = createApp();

// No CACHE_APP_KEY set => middleware allows all requests

describe('GET /v1/grid-layouts/', () => {
  it('returns 400 without companyId', async () => {
    const res = await request(app).get('/v1/grid-layouts/');
    expect(res.status).toBe(400);
    expect(res.body.ok).toBe(false);
  });

  it('returns empty gridIds for a new user', async () => {
    const res = await request(app)
      .get('/v1/grid-layouts/')
      .query({ companyId: '1', email: 'test@zentto.net' });
    expect(res.status).toBe(200);
    expect(res.body.ok).toBe(true);
    expect(res.body.gridIds).toEqual([]);
  });
});

describe('PUT /v1/grid-layouts/:gridId', () => {
  it('returns 400 with empty body', async () => {
    const res = await request(app)
      .put('/v1/grid-layouts/test-grid')
      .send({});
    expect(res.status).toBe(400);
    expect(res.body.ok).toBe(false);
  });

  it('saves a layout successfully', async () => {
    const res = await request(app)
      .put('/v1/grid-layouts/invoices-grid')
      .send({
        companyId: '1',
        email: 'user@zentto.net',
        gridId: 'invoices-grid',
        layout: { columns: ['a', 'b'], widths: [100, 200] },
      });
    expect(res.status).toBe(200);
    expect(res.body.ok).toBe(true);
    expect(res.body.layout).toBeDefined();
    expect(res.body.layout.columns).toEqual(['a', 'b']);
    expect(res.body.updatedAt).toBeDefined();
  });

  it('stamps updatedAt if not provided', async () => {
    const res = await request(app)
      .put('/v1/grid-layouts/ts-grid')
      .send({
        companyId: '2',
        userId: '42',
        gridId: 'ts-grid',
        layout: { foo: 'bar' },
      });
    expect(res.status).toBe(200);
    expect(res.body.layout.updatedAt).toBeDefined();
  });

  it('preserves updatedAt if already set', async () => {
    const ts = '2026-01-15T10:00:00.000Z';
    const res = await request(app)
      .put('/v1/grid-layouts/ts-grid2')
      .send({
        companyId: '2',
        userId: '42',
        gridId: 'ts-grid2',
        layout: { foo: 'bar', updatedAt: ts },
      });
    expect(res.status).toBe(200);
    expect(res.body.layout.updatedAt).toBe(ts);
  });
});

describe('GET /v1/grid-layouts/:gridId', () => {
  it('returns 404 for non-existent grid', async () => {
    const res = await request(app)
      .get('/v1/grid-layouts/nonexistent')
      .query({ companyId: '999', email: 'nobody@test.com' });
    expect(res.status).toBe(404);
  });

  it('returns saved layout', async () => {
    // First save
    await request(app)
      .put('/v1/grid-layouts/fetch-test')
      .send({
        companyId: '10',
        email: 'fetch@zentto.net',
        gridId: 'fetch-test',
        layout: { cols: [1, 2, 3] },
      });

    // Then fetch
    const res = await request(app)
      .get('/v1/grid-layouts/fetch-test')
      .query({ companyId: '10', email: 'fetch@zentto.net' });
    expect(res.status).toBe(200);
    expect(res.body.ok).toBe(true);
    expect(res.body.layout.cols).toEqual([1, 2, 3]);
  });

  it('user isolation: different users see different layouts', async () => {
    await request(app)
      .put('/v1/grid-layouts/shared-grid')
      .send({
        companyId: '10',
        email: 'alice@zentto.net',
        gridId: 'shared-grid',
        layout: { owner: 'alice' },
      });

    await request(app)
      .put('/v1/grid-layouts/shared-grid')
      .send({
        companyId: '10',
        email: 'bob@zentto.net',
        gridId: 'shared-grid',
        layout: { owner: 'bob' },
      });

    const alice = await request(app)
      .get('/v1/grid-layouts/shared-grid')
      .query({ companyId: '10', email: 'alice@zentto.net' });
    expect(alice.body.layout.owner).toBe('alice');

    const bob = await request(app)
      .get('/v1/grid-layouts/shared-grid')
      .query({ companyId: '10', email: 'bob@zentto.net' });
    expect(bob.body.layout.owner).toBe('bob');
  });

  it('company isolation: same user different company sees nothing', async () => {
    await request(app)
      .put('/v1/grid-layouts/company-grid')
      .send({
        companyId: '100',
        email: 'user@zentto.net',
        gridId: 'company-grid',
        layout: { data: 'company100' },
      });

    const res = await request(app)
      .get('/v1/grid-layouts/company-grid')
      .query({ companyId: '200', email: 'user@zentto.net' });
    expect(res.status).toBe(404);
  });
});

describe('DELETE /v1/grid-layouts/:gridId', () => {
  it('deletes a layout', async () => {
    await request(app)
      .put('/v1/grid-layouts/to-delete')
      .send({
        companyId: '50',
        email: 'del@zentto.net',
        gridId: 'to-delete',
        layout: { temp: true },
      });

    const del = await request(app)
      .delete('/v1/grid-layouts/to-delete')
      .query({ companyId: '50', email: 'del@zentto.net' });
    expect(del.status).toBe(200);
    expect(del.body.ok).toBe(true);

    const after = await request(app)
      .get('/v1/grid-layouts/to-delete')
      .query({ companyId: '50', email: 'del@zentto.net' });
    expect(after.status).toBe(404);
  });
});

describe('grid-layouts index tracking', () => {
  it('lists saved gridIds after PUT', async () => {
    const company = '77';
    const email = 'index@zentto.net';

    await request(app)
      .put('/v1/grid-layouts/grid-a')
      .send({ companyId: company, email, gridId: 'grid-a', layout: { a: 1 } });
    await request(app)
      .put('/v1/grid-layouts/grid-b')
      .send({ companyId: company, email, gridId: 'grid-b', layout: { b: 2 } });

    const res = await request(app)
      .get('/v1/grid-layouts/')
      .query({ companyId: company, email });
    expect(res.status).toBe(200);
    expect(res.body.gridIds).toContain('grid-a');
    expect(res.body.gridIds).toContain('grid-b');
  });
});

describe('client-key middleware', () => {
  it('allows requests when CACHE_APP_KEY is not set', async () => {
    const res = await request(app)
      .get('/v1/grid-layouts/')
      .query({ companyId: '1', email: 'test@zentto.net' });
    expect(res.status).toBe(200);
  });
});
