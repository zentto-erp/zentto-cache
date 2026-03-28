import { describe, it, expect } from 'vitest';
import request from 'supertest';
import { createApp } from '../src/app.js';

const app = createApp();

describe('PUT /v1/report-templates/:templateId', () => {
  it('returns 400 with empty body', async () => {
    const res = await request(app)
      .put('/v1/report-templates/tpl-1')
      .send({});
    expect(res.status).toBe(400);
  });

  it('saves a user template', async () => {
    const res = await request(app)
      .put('/v1/report-templates/invoice-tpl')
      .send({
        companyId: '1',
        email: 'user@zentto.net',
        templateId: 'invoice-tpl',
        template: { name: 'Factura', layout: { sections: [] } },
      });
    expect(res.status).toBe(200);
    expect(res.body.ok).toBe(true);
  });
});

describe('GET /v1/report-templates/:templateId', () => {
  it('returns 404 for non-existent template', async () => {
    const res = await request(app)
      .get('/v1/report-templates/nonexistent')
      .query({ companyId: '999', email: 'nobody@test.com' });
    expect(res.status).toBe(404);
  });

  it('returns saved template', async () => {
    await request(app)
      .put('/v1/report-templates/get-test')
      .send({
        companyId: '5',
        email: 'tpl@zentto.net',
        templateId: 'get-test',
        template: { name: 'Test Report', columns: ['a'] },
      });

    const res = await request(app)
      .get('/v1/report-templates/get-test')
      .query({ companyId: '5', email: 'tpl@zentto.net' });
    expect(res.status).toBe(200);
    expect(res.body.template.name).toBe('Test Report');
  });
});

describe('GET /v1/report-templates/', () => {
  it('lists templateIds for a user', async () => {
    await request(app)
      .put('/v1/report-templates/list-a')
      .send({
        companyId: '20',
        userId: '5',
        templateId: 'list-a',
        template: { name: 'A' },
      });
    await request(app)
      .put('/v1/report-templates/list-b')
      .send({
        companyId: '20',
        userId: '5',
        templateId: 'list-b',
        template: { name: 'B' },
      });

    const res = await request(app)
      .get('/v1/report-templates/')
      .query({ companyId: '20', userId: '5' });
    expect(res.status).toBe(200);
    expect(res.body.templateIds).toContain('list-a');
    expect(res.body.templateIds).toContain('list-b');
  });
});

describe('DELETE /v1/report-templates/:templateId', () => {
  it('deletes a template', async () => {
    await request(app)
      .put('/v1/report-templates/to-remove')
      .send({
        companyId: '30',
        email: 'del@zentto.net',
        templateId: 'to-remove',
        template: { temp: true },
      });

    const del = await request(app)
      .delete('/v1/report-templates/to-remove')
      .query({ companyId: '30', email: 'del@zentto.net' });
    expect(del.status).toBe(200);

    const after = await request(app)
      .get('/v1/report-templates/to-remove')
      .query({ companyId: '30', email: 'del@zentto.net' });
    expect(after.status).toBe(404);
  });
});

describe('Public templates', () => {
  it('saves and lists public templates', async () => {
    await request(app)
      .put('/v1/report-templates/public/public-tpl-1')
      .send({
        companyId: '40',
        templateId: 'public-tpl-1',
        template: { name: 'Public Report', category: 'ventas', description: 'Reporte de ventas' },
      });

    const res = await request(app)
      .get('/v1/report-templates/public')
      .query({ companyId: '40' });
    expect(res.status).toBe(200);
    expect(res.body.templates.length).toBeGreaterThanOrEqual(1);
    expect(res.body.templates[0].name).toBe('Public Report');
  });

  it('public templates are company-isolated', async () => {
    const res = await request(app)
      .get('/v1/report-templates/public')
      .query({ companyId: '999' });
    expect(res.status).toBe(200);
    expect(res.body.templates).toEqual([]);
  });
});

describe('health & root', () => {
  it('GET / returns service info', async () => {
    const res = await request(app).get('/');
    expect(res.status).toBe(200);
    expect(res.body.name).toBe('@zentto/cache');
    expect(res.body.features).toContain('grid-layouts');
    expect(res.body.features).toContain('report-templates');
  });

  it('GET /health returns ok', async () => {
    const res = await request(app).get('/health');
    expect(res.status).toBe(200);
    expect(res.body.ok).toBe(true);
  });
});
