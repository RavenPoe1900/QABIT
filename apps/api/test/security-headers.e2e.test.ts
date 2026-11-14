import { afterAll, beforeAll, describe, expect, it, vi } from 'vitest';
import { createTestApp, type TestApp } from './helpers/test-app';

/** Cabeceras de seguridad (Helmet) y ausencia de CORS, sobre la API real sin abrir puertos. */

const STRICT_CSP = "default-src 'none';frame-ancestors 'none'";
const OTHER_ORIGIN = 'https://otro-sitio.example';

/** Cabeceras que deben llevar TODAS las respuestas, sean de éxito o de error. */
function expectSecurityHeaders(headers: Record<string, string>, label: string): void {
  expect(headers['x-content-type-options'], label).toBe('nosniff');
  expect(headers['x-frame-options'], label).toBe('SAMEORIGIN');
  expect(headers['referrer-policy'], label).toBe('no-referrer');
  expect(headers['cross-origin-resource-policy'], label).toBe('same-origin');
  expect(headers['x-powered-by'], label).toBeUndefined();
  expect(headers['strict-transport-security'], label).toBeUndefined(); // la API se sirve por HTTP
}

describe('cabeceras de seguridad (modo desarrollo)', () => {
  let t: TestApp;
  beforeAll(async () => {
    t = await createTestApp();
  });
  afterAll(async () => {
    await t.close();
  });

  it('las llevan las respuestas correctas y las de error de cada capa, con la CSP estricta', async () => {
    const cases = [
      ['GET /api/tasks (200)', () => t.http().get('/api/tasks'), 200],
      ['POST /api/tasks (201)', () => t.http().post('/api/tasks').send({ title: 'A', assignee: 'B' }), 201],
      ['validación (400)', () => t.http().post('/api/tasks').send({}), 400],
      [
        'JSON mal formado (400 del parser)',
        () => t.http().post('/api/tasks').set('Content-Type', 'application/json').send('{"title":'),
        400,
      ],
      ['tarea inexistente (404)', () => t.http().patch('/api/tasks/999/status').send({ status: 'done' }), 404],
      ['ruta fuera de /api (404 final)', () => t.http().get('/nope'), 404],
      ['documento OpenAPI (JSON)', () => t.http().get('/api/docs-json'), 200],
    ] as const;

    for (const [label, send, status] of cases) {
      const res = await send();
      expect(res.status, label).toBe(status);
      expectSecurityHeaders(res.headers, label);
      expect(res.headers['content-security-policy'], label).toBe(STRICT_CSP);
    }
  });

  it('Swagger UI recibe una CSP que permite sus scripts propios, estilos inline e iconos data:', async () => {
    const res = await t.http().get('/api/docs').redirects(1);
    expect(res.status).toBe(200);
    expect(res.text).toContain('swagger-ui-bundle.js');
    expectSecurityHeaders(res.headers, '/api/docs');

    const csp = res.headers['content-security-policy'];
    expect(csp).toContain("script-src 'self'");
    expect(csp).toContain("style-src 'self' https: 'unsafe-inline'");
    expect(csp).toContain("img-src 'self' data:");
    expect(csp).toContain("frame-ancestors 'self'");
    expect(csp).not.toContain('upgrade-insecure-requests'); // se sirve por HTTP

    // Los recursos que pide la página se sirven bajo la misma CSP y responden.
    for (const asset of ['swagger-ui-bundle.js', 'swagger-ui-init.js', 'swagger-ui.css']) {
      const file = await t.http().get(`/api/docs/${asset}`);
      expect(file.status, asset).toBe(200);
      expect(file.headers['content-security-policy'], asset).toBe(csp);
    }
  });
});

describe('CORS desactivado', () => {
  let t: TestApp;
  beforeAll(async () => {
    t = await createTestApp();
  });
  afterAll(async () => {
    await t.close();
  });

  it('una petición desde otro origen no recibe Access-Control-Allow-Origin', async () => {
    const res = await t.http().get('/api/tasks').set('Origin', OTHER_ORIGIN);
    expect(res.status).toBe(200); // la API responde, pero el navegador no deja que esa web lo lea
    expect(res.headers['access-control-allow-origin']).toBeUndefined();
    expect(res.headers['access-control-allow-credentials']).toBeUndefined();
  });

  it('un preflight OPTIONS desde otro origen no autoriza nada', async () => {
    const res = await t
      .http()
      .options('/api/tasks')
      .set('Origin', OTHER_ORIGIN)
      .set('Access-Control-Request-Method', 'POST')
      .set('Access-Control-Request-Headers', 'content-type');
    expect(res.headers['access-control-allow-origin']).toBeUndefined();
    expect(res.headers['access-control-allow-methods']).toBeUndefined();
    expect(res.headers['access-control-allow-headers']).toBeUndefined();
  });
});

describe('cabeceras de seguridad en producción', () => {
  it('sin Swagger, /api/docs también recibe la CSP estricta (y es un 404)', async () => {
    vi.stubEnv('NODE_ENV', 'production');
    let t: TestApp | undefined;
    try {
      t = await createTestApp();
      for (const path of ['/api/docs', '/api/tasks']) {
        const res = await t.http().get(path);
        expectSecurityHeaders(res.headers, path);
        expect(res.headers['content-security-policy'], path).toBe(STRICT_CSP);
      }
    } finally {
      await t?.close();
      vi.unstubAllEnvs();
    }
  });
});
