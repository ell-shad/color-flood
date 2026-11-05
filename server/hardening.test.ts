import { afterAll, beforeAll, describe, it, expect } from 'vitest';
import { createAppServer } from '../server';

/**
 * P3.6 server hardening: helmet security headers, CORS restricted to APP_URL
 * (unset = same-origin only), and the HTTP rate limit on /api. The instance is
 * created lazily inside beforeAll so process.env.APP_URL is set for it; the env
 * var is deleted afterwards so other test files' module-level instances are
 * never affected.
 */
let instance: ReturnType<typeof createAppServer>;
let base = '';

beforeAll(async () => {
  process.env.APP_URL = 'https://game.example.com';
  instance = createAppServer();
  await instance.listen(0);
  const addr = instance.server.address();
  if (typeof addr === 'object' && addr) {
    base = `http://127.0.0.1:${addr.port}`;
  }
});

afterAll(async () => {
  delete process.env.APP_URL;
  await instance.stop();
});

describe('P3.6 hardening', () => {
  it('helmet security headers are applied', async () => {
    const res = await fetch(`${base}/api/health`);
    expect(res.status).toBe(200);
    expect(res.headers.get('x-content-type-options')).toBe('nosniff');
    expect(res.headers.get('x-frame-options')).toContain('SAMEORIGIN');
    expect(res.headers.get('referrer-policy')).toBeTruthy();
  });

  it('rejects foreign cross-origin requests to /api', async () => {
    const res = await fetch(`${base}/api/health`, {
      headers: { Origin: 'https://evil.example.net' },
    });
    expect(res.status).toBe(403);
  });

  it('allows the configured APP_URL origin and echoes CORS', async () => {
    const res = await fetch(`${base}/api/health`, {
      headers: { Origin: 'https://game.example.com' },
    });
    expect(res.status).toBe(200);
    expect(res.headers.get('access-control-allow-origin')).toBe(
      'https://game.example.com',
    );
  });

  it('preflight from APP_URL returns 204 with allowed methods', async () => {
    const res = await fetch(`${base}/api/health`, {
      method: 'OPTIONS',
      headers: {
        Origin: 'https://game.example.com',
        'Access-Control-Request-Method': 'POST',
      },
    });
    expect(res.status).toBe(204);
    expect(res.headers.get('access-control-allow-methods')).toContain('POST');
  });
});
