import express from 'express';
import path from 'node:path';
import { fileURLToPath } from 'node:url';
import { createProvider, selectionFrom } from './provider.mjs';

export function createApp(provider = createProvider()) {
  const app = express();
  app.disable('x-powered-by');
  app.use((_req, res, next) => { res.set('X-Content-Type-Options', 'nosniff'); next(); });
  app.get('/api/health', (_req, res) => res.json({ status: 'ok' }));
  for (const endpoint of ['route', 'etas']) {
    app.get(`/api/${endpoint}`, async (req, res) => {
      let selection;
      try { selection = selectionFrom(req.query); }
      catch (err) { return res.status(400).json({ error: err.message }); }
      try {
        res.set('Cache-Control', 'public, max-age=15');
        res.json(await provider[endpoint](selection));
      } catch (err) {
        console.error(`[${endpoint}]`, err.message);
        res.set('Cache-Control', 'no-store').status(502).json({ error: 'Live data could not be loaded. The operator may be unavailable or the route may not exist. You can retry or explore the demo.' });
      }
    });
  }
  app.use('/api', (_req, res) => res.status(404).json({ error: 'Unknown endpoint' }));
  const dist = fileURLToPath(new URL('../dist', import.meta.url));
  app.use(express.static(dist));
  app.get('/{*path}', (_req, res) => res.sendFile(path.join(dist, 'index.html')));
  return app;
}
