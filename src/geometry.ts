import type { Coordinate } from './types';
export function metres(a: Coordinate, b: Coordinate) {
  return Math.hypot((b[0] - a[0]) * 111320 * Math.cos((a[1] + b[1]) * Math.PI / 360), (b[1] - a[1]) * 111320);
}
export function along(line: Coordinate[], fraction: number) {
  const total = line.slice(1).reduce((sum, point, i) => sum + metres(line[i], point), 0);
  let remaining = total * Math.max(0, Math.min(1, fraction));
  for (let i = 1; i < line.length; i++) {
    const length = metres(line[i - 1], line[i]);
    if (remaining <= length || i === line.length - 1) {
      const t = length ? Math.min(1, remaining / length) : 0;
      const point: Coordinate = [line[i - 1][0] + (line[i][0] - line[i - 1][0]) * t, line[i - 1][1] + (line[i][1] - line[i - 1][1]) * t];
      const bearing = Math.atan2((line[i][0] - line[i - 1][0]) * Math.cos(point[1] * Math.PI / 180), line[i][1] - line[i - 1][1]) * 180 / Math.PI;
      return { point, bearing, index: i, t };
    }
    remaining -= length;
  }
  return { point: line[0] || [0, 0] as Coordinate, bearing: 0, index: 0, t: 0 };
}
export function traversed(segments: Coordinate[][], segment: number, fraction: number): Coordinate[] {
  const current = segments[segment - 1];
  if (!current) return [];
  const position = along(current, fraction);
  return [...segments.slice(0, segment - 1).flat(), ...current.slice(0, position.index), position.point];
}
