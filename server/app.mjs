import express from 'express';
import path from 'node:path';
import { fileURLToPath } from 'node:url';
import { createProvider, selectionFrom } from './provider.mjs';
import { createGeometryProvider } from './geometry.mjs';
import { createTrafficProvider } from './traffic.mjs';
import { trafficSelections } from './corridor.mjs';

export function createApp(provider = createProvider(), services = {}) {
  const app = express();
  app.disable('x-powered-by');
  app.use((_req, res, next) => { res.set('X-Content-Type-Options', 'nosniff'); next(); });
  app.get('/api/health', (_req, res) => res.json({ status: 'ok' }));
  const traffic = services.traffic || createTrafficProvider();
  const geometry = services.geometry || createGeometryProvider(provider);
  app.get('/api/traffic', async (req, res) => {
    let selections;
    try { selections = trafficSelections(req.query); } catch(error) { return res.status(400).json({error:error.message}); }
    try {
      const resolved = await Promise.allSettled(selections.map(s => geometry(s)));
      const paths = resolved.filter(r => r.status === 'fulfilled').map(r => r.value);
      if (!paths.length) throw new Error('Selected route paths unavailable.');
      res.set('Cache-Control', 'public, max-age=30').json({ ...await traffic(paths), partialCorridor: paths.length !== selections.length });
    }
    catch (error) {
      console.error('[traffic]', error.message);
      res.set('Cache-Control', 'no-store').status(502).json({ error: 'Transport Department traffic data unavailable. No speed colours are shown.' });
    }
  });
  const endpoints = { route: provider.route, etas: provider.etas, geometry };
  for (const endpoint of Object.keys(endpoints)) {
    app.get(`/api/${endpoint}`, async (req, res) => {
      let selection;
      try { selection = selectionFrom(req.query); }
      catch (err) { return res.status(400).json({ error: err.message }); }
      try {
        res.set('Cache-Control', 'public, max-age=15');
        res.json(await endpoints[endpoint](selection));
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
