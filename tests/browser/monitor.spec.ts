import { expect, test } from '@playwright/test';
import { readFileSync } from 'node:fs';
import { demoFeed } from '../../src/demo';
import type { Route } from '../../src/types';
const snapshots = JSON.parse(readFileSync(new URL('../../src/route-snapshot.json', import.meta.url), 'utf8')) as Route[];

test.beforeEach(async ({ page }) => {
  // No bulk tile downloading during tests. Tile failures are tested explicitly.
  await page.route('https://tiles.openfreemap.org/**', route => route.request().url().endsWith('/planet')
    ? route.fulfill({ json: { tilejson:'3.0.0', tiles:['https://tiles.openfreemap.org/test/{z}/{x}/{y}.pbf'], minzoom:0, maxzoom:14 } })
    : route.fulfill({ contentType:'application/x-protobuf', body:Buffer.alloc(0) }));
  await page.route('**/api/traffic*', route => route.fulfill({ json: { type:'FeatureCollection', features:[{type:'Feature',properties:{id:'test-road',name:'Test Road',speed:15,color:'#eb6c77'},geometry:{type:'LineString',coordinates:[[114.201,22.329],[114.202,22.328]]}}],sourceTime:new Date().toISOString(),fetchedAt:new Date().toISOString(),stale:false,monitored:1 } }));
});

test('live failure stays explicit; demo renders a working interactive map', async ({ page }) => {
  const errors: string[] = [];
  page.on('pageerror', e => errors.push(e.message));
  await page.route('**/api/route?*', route => route.fulfill({ status: 502, json: { error: 'The operator is unavailable.' } }));
  await page.goto('/');
  await expect(page.getByText('Live data is unavailable.', { exact: true })).toBeVisible();
  await expect(page.locator('.map-bus')).toHaveCount(0);
  await page.getByRole('button', { name: 'Explore demo' }).click();
  await expect(page.getByText('You’re exploring a demo.')).toBeVisible();
  await expect(page.locator('.map-stop')).toHaveCount(9);
  await expect(page.locator('.map-bus').first()).toBeVisible();
  await page.locator('.stop-list button').nth(3).click();
  await expect(page.locator('.arrival-card h2')).toHaveText('Miami Quay');
  await page.getByRole('button', { name: 'Fit route on map' }).click();
  const marker = page.locator('.map-stop').first();
  await page.waitForTimeout(800);
  const before = await marker.boundingBox();
  await page.getByRole('button', { name: 'Zoom out' }).click();
  await expect.poll(async () => Math.abs((await marker.boundingBox())!.y - before!.y)).toBeGreaterThan(3);
  await page.getByRole('button', { name: 'Zoom in', exact: true }).click();
  await page.getByRole('button', { name: '3D toy town' }).click();
  await expect(page.getByRole('button', { name: '3D toy town' })).toHaveClass(/active/);
  await page.getByRole('button', { name: 'Switch direction' }).click();
  await expect(page.locator('.map-stop')).toHaveCount(10);
  await expect(page.locator('.stop-list button')).toHaveCount(10);
  await page.getByRole('button', { name: 'Refresh arrivals' }).click();
  await expect(page.getByText('You’re exploring a demo.')).toBeVisible();
  expect(errors).toEqual([]);
});

test('fresh live fixtures become stale and stop generating position markers', async ({ page }) => {
  const now = Date.now();
  const routeData = { ...snapshots.find(r => r.direction === 'outbound')!, snapshot: false } as Route;
  const feed = demoFeed(routeData, now, now);
  await page.clock.install({ time: now });
  await page.route('**/api/route?*', route => route.fulfill({ json: routeData }));
  await page.route('**/api/etas?*', route => route.fulfill({ json: feed }));
  await page.goto('/');
  await expect(page.getByText('LIVE ARRIVALS', { exact: true })).toBeVisible();
  await expect(page.locator('.map-bus').first()).toBeVisible();
  await page.clock.fastForward(120_000);
  await expect(page.getByText('AWAITING FRESH DATA', { exact: true })).toBeVisible();
  await expect(page.locator('.map-bus')).toHaveCount(0);
  await expect(page.getByText('Data is stale', { exact: true })).toBeVisible();
});

test('route selection and shared URLs retain operator, route, and direction', async ({ page, context }) => {
  await context.grantPermissions(['clipboard-read', 'clipboard-write']);
  const selections: string[] = [];
  await page.route('**/api/route?*', route => {
    const params = new URL(route.request().url()).searchParams;
    selections.push(`${params.get('operator')}:${params.get('route')}:${params.get('direction')}`);
    return route.fulfill({ json: { ...snapshots[1], ...Object.fromEntries(params), snapshot: false } });
  });
  await page.route('**/api/etas?*', route => route.fulfill({ json: { stops: [], fetchedAt: new Date().toISOString(), partial: false } }));
  await page.goto('/');
  await page.getByRole('button', { name: 'Change' }).click();
  await page.getByRole('combobox', { name: 'Operator', exact: true }).selectOption('kmb');
  await page.getByLabel('Route number').fill('5R');
  await page.getByRole('button', { name: 'Show route' }).click();
  await expect(page.locator('.operator-label')).toHaveText('KMB 九巴');
  await expect.poll(() => selections).toContain('kmb:5R:outbound');
  await page.getByRole('button', { name: 'Share monitor' }).click();
  const link = await page.evaluate(() => navigator.clipboard.readText());
  expect(link).toContain('operator=kmb&route=5R&direction=outbound');
  await page.goto(link);
  await expect(page.locator('.route-number')).toHaveText('5R');
  await expect(page.locator('.operator-label')).toHaveText('KMB 九巴');
});

test('mobile demo has no horizontal overflow and supports route selection', async ({ page }) => {
  await page.setViewportSize({ width: 390, height: 844 });
  await page.goto('/?demo=1');
  await expect(page.getByText('You’re exploring a demo.')).toBeVisible();
  await expect(page.locator('.map-stop')).toHaveCount(9);
  expect(await page.evaluate(() => document.documentElement.scrollWidth <= window.innerWidth)).toBe(true);
  await page.locator('.stop-list button').nth(2).click();
  await expect(page.locator('.arrival-card h2')).toHaveText('Shing Fung Road Park');
  await page.screenshot({ path: 'test-results/mobile-demo.png', fullPage: true });
});

test('help explains uncertainty and traffic colours can be toggled', async ({ page }) => {
  await page.goto('/?demo=1');
  await page.getByRole('button', { name: 'How it works' }).click();
  await expect(page.getByRole('dialog')).toContainText('not vehicle coordinates or vehicle IDs');
  await page.keyboard.press('Escape');
  await expect(page.getByRole('dialog')).toHaveCount(0);
  const traffic = page.getByRole('button', { name: 'Show live traffic' });
  await expect(traffic).toHaveAttribute('aria-pressed', 'true');
  await expect(page.locator('.map-shell')).toHaveAttribute('data-traffic-segments', '1');
  await expect(page.locator('.traffic-card')).toContainText('as of');
  await traffic.click();
  await expect(page.locator('.map-shell')).toHaveAttribute('data-traffic-segments', '0');
  await expect(page.locator('.traffic-card')).toHaveCount(0);
});

test('desktop demo screenshot and no client errors', async ({ page }) => {
  await page.setViewportSize({ width: 1440, height: 1100 });
  const errors: string[] = [];
  page.on('pageerror', e => errors.push(e.message));
  await page.goto('/?demo=1');
  await expect(page.locator('.map-stop')).toHaveCount(9);
  await page.waitForTimeout(1000);
  await page.screenshot({ path: 'test-results/desktop-demo.png', fullPage: true });
  expect(errors).toEqual([]);
});

test('three routes can be compared, hidden, focused, and shared independently', async ({ page, context }) => {
  await context.grantPermissions(['clipboard-read', 'clipboard-write']);
  await page.goto('/?demo=1');
  await page.getByRole('button', { name: 'Show all 3', exact: true }).click();
  await expect(page.getByRole('checkbox', { name: 'Show route 22D', exact: true })).toBeChecked();
  await expect(page.getByRole('checkbox', { name: 'Show route 22S', exact: true })).toBeChecked();
  await expect(page.getByRole('checkbox', { name: 'Show route 22X', exact: true })).toBeChecked();
  await expect(page.locator('.map-stop')).toHaveCount(22);
  await expect(page.locator('.map-shell')).toHaveAttribute('data-road-routes', '3');
  await expect(page.locator('.map-bus[data-route="22S"]').first()).toBeVisible();
  await expect(page.locator('.map-bus[data-route="22X"]').first()).toBeVisible();
  const colors = await page.locator('.route-choice').evaluateAll(items => items.map(item => getComputedStyle(item).getPropertyValue('--route-color')));
  expect(new Set(colors).size).toBe(3);
  await page.getByRole('button', { name: 'View route 22X arrivals', exact: true }).click();
  await expect(page.locator('.route-number')).toHaveText('22X');
  await expect(page.locator('.stop-list button')).toHaveCount(2);
  await page.getByRole('checkbox', { name: 'Show route 22S', exact: true }).uncheck();
  await expect(page.locator('.map-stop[data-route="22S"]')).toHaveCount(0);
  await expect(page.locator('.map-bus[data-route="22S"]')).toHaveCount(0);
  await expect(page.locator('.map-stop')).toHaveCount(11);
  await page.getByRole('button', { name: 'Share monitor' }).click();
  const link = await page.evaluate(() => navigator.clipboard.readText());
  await page.goto(link);
  await expect(page.getByRole('checkbox', { name: 'Show route 22X', exact: true })).toBeChecked();
  await expect(page.locator('.route-number')).toHaveText('22X');
  await expect(page.getByRole('checkbox', { name: 'Show route 22S', exact: true })).not.toBeChecked();
  await expect(page.locator('.map-stop')).toHaveCount(11);
});

test('one failed route leaves other live routes and their arrival boards usable', async ({ page }) => {
  await page.route('**/api/route?*', request => {
    const selection = new URL(request.request().url()).searchParams;
    if (selection.get('route') === '22S') return request.fulfill({ status: 502, json: { error: '22S feed unavailable' } });
    return request.fulfill({ json: { ...snapshots.find(s => s.route === selection.get('route') && s.direction === selection.get('direction'))!, snapshot: false } });
  });
  await page.route('**/api/etas?*', request => {
    const params = new URL(request.request().url()).searchParams;
    const route = snapshots.find(s => s.route === params.get('route') && s.direction === params.get('direction'))!;
    return request.fulfill({ json: demoFeed(route, Date.now(), Date.now()) });
  });
  await page.goto('/');
  await page.getByRole('button', { name: 'Show all 3', exact: true }).click();
  await expect(page.locator('.route-error')).toContainText('22S: arrivals unavailable');
  await expect(page.locator('.map-stop[data-route="22X"]')).toHaveCount(2);
  await page.getByRole('button', { name: 'View route 22X arrivals', exact: true }).click();
  await expect(page.locator('.status-chip')).toHaveText('LIVE ARRIVALS');
  await expect(page.locator('.map-bus[data-route="22X"]').first()).toBeVisible();
});

test('3D prototype builds toy geometry and returns to the flat cartoon map', async ({ page }) => {
  const errors: string[]=[]; page.on('pageerror', e=>errors.push(e.message));
  await page.goto('/?demo=1');
  await expect(page.locator('.map-bus').first()).toBeVisible();
  await expect(page.locator('.map-shell')).toHaveAttribute('data-map-mode','2d');
  await page.getByRole('button',{name:'3D toy town'}).click();
  await expect(page.locator('.map-shell')).toHaveAttribute('data-map-mode','3d');
  await expect.poll(async()=>Number(await page.locator('.map-shell').getAttribute('data-model-parts'))).toBeGreaterThan(10);
  await expect(page.locator('.toy-notice')).toContainText('toy scale');
  await page.getByRole('button',{name:'Rotate toy town'}).click();
  await page.waitForTimeout(1000);
  await page.screenshot({path:'test-results/toy-town-3d.png',fullPage:true});
  await page.getByRole('button',{name:'2D cartoon'}).click();
  await expect(page.locator('.map-shell')).toHaveAttribute('data-map-mode','2d');
  await expect(page.locator('.map-shell')).toHaveAttribute('data-model-parts','0');
  expect(errors).toEqual([]);
});

test('stale traffic readings and upstream failures remove the speed colours', async ({ page }) => {
  await page.route('**/api/traffic*', route=>route.fulfill({json:{type:'FeatureCollection',features:[],sourceTime:new Date(Date.now()-20*60000).toISOString(),fetchedAt:new Date().toISOString(),stale:true,monitored:1}}));
  const staleResponse = page.waitForResponse(response => new URL(response.url()).pathname === '/api/traffic' && response.status() === 200);
  await page.goto('/?demo=1');
  await staleResponse;
  await expect(page.locator('.traffic-card')).toContainText('older than 10 minutes');
  await expect(page.locator('.map-shell')).toHaveAttribute('data-traffic-segments','0');
  await page.route('**/api/traffic*', route=>route.fulfill({status:502,json:{error:'Unavailable'}}));
  await page.getByRole('button',{name:'Show live traffic'}).click();
  await page.getByRole('button',{name:'Show live traffic'}).click();
  await expect(page.locator('.traffic-card')).toContainText('Traffic feed unavailable');
  await expect(page.locator('.map-shell')).toHaveAttribute('data-traffic-segments','0');
  await expect(page.locator('.map-bus').first()).toBeVisible();
});

test('22X shows an endpoint-only backcast and explains its estimated start', async ({ page }) => {
  const r = { ...snapshots.find(s=>s.route==='22X'&&s.direction==='outbound')!,snapshot:false };
  await page.route('**/api/route?*',request=>request.fulfill({json:r}));
  await page.route('**/api/etas?*',request=>request.fulfill({json:{fetchedAt:new Date().toISOString(),partial:true,stops:[{stopId:r.stops[1].id,seq:2,generatedAt:new Date().toISOString(),arrivals:[{eta:new Date(Date.now()+180000).toISOString(),remark:''}]}]}}));
  await page.goto('/?operator=ctb&route=22X&direction=outbound&serviceType=1');
  const bus=page.locator('.map-bus[data-route="22X"]').first();
  await expect(bus).toBeVisible();
  await expect(bus).toHaveCSS('width','34px');
  await bus.click();
  await expect(page.locator('.maplibregl-popup')).toContainText('Estimated leg start:');
  await expect(page.locator('.maplibregl-popup')).toContainText('Based on arrival at');
});

test('traffic requests follow the selected routes and directions', async ({ page }) => {
  const requested:string[]=[];
  page.on('request',r=>{const url=new URL(r.url());if(url.pathname==='/api/traffic')requested.push(url.searchParams.get('routes')||'');});
  await page.goto('/?demo=1');
  await expect.poll(()=>requested.at(-1)).toBe('ctb:22D:outbound:1');
  await page.getByRole('button',{name:'Show all 3',exact:true}).click();
  await expect.poll(()=>requested.at(-1)).toBe('ctb:22D:outbound:1,ctb:22S:outbound:1,ctb:22X:outbound:1');
  await page.getByRole('checkbox',{name:'Show route 22S',exact:true}).uncheck();
  await expect.poll(()=>requested.at(-1)).toBe('ctb:22D:outbound:1,ctb:22X:outbound:1');
  await page.getByRole('button',{name:'Switch direction'}).click();
  await expect.poll(()=>requested.at(-1)).toBe('ctb:22D:inbound:1,ctb:22X:outbound:1');
});
