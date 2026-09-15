import type { GeoPoint } from './types';

const EARTH_RADIUS_KM = 6371;

/**
 * Haversine 距离（km）。
 */
export function distanceKm(a: GeoPoint, b: GeoPoint): number {
  const dLat = ((b.lat - a.lat) * Math.PI) / 180;
  const dLng = ((b.lng - a.lng) * Math.PI) / 180;
  const lat1 = (a.lat * Math.PI) / 180;
  const lat2 = (b.lat * Math.PI) / 180;

  const h = Math.sin(dLat / 2) ** 2 + Math.cos(lat1) * Math.cos(lat2) * Math.sin(dLng / 2) ** 2;

  return 2 * EARTH_RADIUS_KM * Math.asin(Math.sqrt(h));
}

/**
 * 以平均速度估算 ETA（秒）。
 */
export function estimateEtaSec(distanceKmValue: number, avgSpeedKmh: number): number {
  if (avgSpeedKmh <= 0) return Number.POSITIVE_INFINITY;
  return (distanceKmValue / avgSpeedKmh) * 3600;
}

/**
 * 判断点是否在以 center 为圆心、radiusKm 为半径的圆内。
 */
export function isWithinRadius(point: GeoPoint, center: GeoPoint, radiusKm: number): boolean {
  return distanceKm(point, center) <= radiusKm;
}
