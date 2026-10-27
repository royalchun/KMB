import { useEffect, useState } from 'react';
import type { FeatureCollection, LineString } from 'geojson';
import type { Selection } from './types';
export interface TrafficData extends FeatureCollection<LineString> { sourceTime: string; fetchedAt: string; stale: boolean; monitored: number; corridorMetres?: number; coveredSegments?: number; partialCorridor?: boolean }
export const TRAFFIC_MAX_AGE = 10 * 60 * 1000;
export function useTraffic(enabled: boolean, selections: Selection[]) {
  const routeKey = selections.map(s => `${s.operator}:${s.route}:${s.direction}:${s.serviceType}`).sort().join(',');
  const [stored, setStored] = useState<{key:string;data:TrafficData} | null>(null);
  const data = stored?.key === routeKey ? stored.data : null;
  const [error, setError] = useState('');
  const [loading, setLoading] = useState(false);
  const [clock, setClock] = useState(Date.now());
  useEffect(() => {
    setStored(null); setError('');
    if (!enabled || !routeKey) { setLoading(false); return; }
    const controller = new AbortController(); let busy = false;
    async function update() {
      if (busy) return; busy = true; setLoading(true);
      try {
        const r = await fetch(`/api/traffic?${new URLSearchParams({routes:routeKey})}`, { signal: controller.signal }); const value = await r.json();
        if (!r.ok) throw new Error(value.error || 'Traffic feed unavailable.');
        if (!controller.signal.aborted) { setStored({key:routeKey,data:value}); setError(''); }
      } catch (e) { if (!controller.signal.aborted) { setError('Traffic feed unavailable. Colours are hidden; try again shortly.'); setStored(null); } }
      finally { if (!controller.signal.aborted) setLoading(false); busy = false; }
    }
    void update(); const timer = setInterval(update, 60000);
    return () => { controller.abort(); clearInterval(timer); };
  }, [enabled, routeKey]);
  useEffect(() => { const timer = setInterval(() => setClock(Date.now()), 1000); return () => clearInterval(timer); }, []);
  const sourceTime = Date.parse(data?.sourceTime || '');
  const stale = !!data && (data.stale || !Number.isFinite(sourceTime) || clock - sourceTime > TRAFFIC_MAX_AGE || sourceTime - clock > 60000);
  const sourceLabel = data?.sourceTime ? `as of ${new Date(data.sourceTime).toLocaleTimeString('en-GB', { timeZone: 'Asia/Hong_Kong', hour: '2-digit', minute: '2-digit' })} HKT` : '';
  return { data: stale && data ? { ...data, features: [] } : data, error: stale ? `Readings are older than 10 minutes (${sourceLabel}); colours hidden.` : error, sourceLabel, loading };
}
