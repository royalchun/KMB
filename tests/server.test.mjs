import { afterAll, beforeAll, describe, expect, it } from 'vitest';
import { createApp } from '../server/app.mjs';
let server, base;
beforeAll(async () => {
  server = createApp({ route: async s => s, etas: async () => { throw new Error('Upstream unavailable'); } }).listen(0, '127.0.0.1');
  await new Promise(resolve => server.once('listening', resolve));
  base = `http://127.0.0.1:${server.address().port}`;
});
afterAll(() => new Promise(resolve => server.close(resolve)));
describe('same-origin API', () => {
  it('answers health probes', async () => expect(await (await fetch(`${base}/api/health`)).json()).toEqual({ status: 'ok' }));
  it('rejects hostile route input', async () => expect((await fetch(`${base}/api/route?route=../../etc`)).status).toBe(400));
  it('passes normalized selection to the adapter', async () => expect(await (await fetch(`${base}/api/route?operator=kmb&route=5R`)).json()).toMatchObject({ route: '5R', operator: 'kmb' }));
  it('returns an honest, noncached upstream failure', async () => {
    const response = await fetch(`${base}/api/etas`);
    expect(response.status).toBe(502);
    expect(response.headers.get('cache-control')).toBe('no-store');
    expect((await response.json()).error).toContain('Live data could not be loaded');
  });
});
