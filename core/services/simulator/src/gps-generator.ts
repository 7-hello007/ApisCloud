import type { GeoPoint } from './types';

const EARTH_RADIUS_KM = 6371;

/**
 * 在给定圆心和半径内随机生成一个点。
 * 用 sqrt 保证面积均匀分布，避免点集中在圆心。
 */
export function randomPointInRadius(center: GeoPoint, radiusKm: number): GeoPoint {
  const angle = Math.random() * 2 * Math.PI;
  const distance = Math.sqrt(Math.random()) * radiusKm;

  const dLat = (distance * Math.cos(angle)) / EARTH_RADIUS_KM;
  const dLng =
    (distance * Math.sin(angle)) /
    (EARTH_RADIUS_KM * Math.cos((center.lat * Math.PI) / 180));

  return {
    lat: center.lat + (dLat * 180) / Math.PI,
    lng: center.lng + (dLng * 180) / Math.PI,
  };
}

/**
 * 计算两点间距离（km），Haversine 公式。
 */
export function distanceKm(a: GeoPoint, b: GeoPoint): number {
  const dLat = ((b.lat - a.lat) * Math.PI) / 180;
  const dLng = ((b.lng - a.lng) * Math.PI) / 180;
  const lat1 = (a.lat * Math.PI) / 180;
  const lat2 = (b.lat * Math.PI) / 180;

  const h =
    Math.sin(dLat / 2) ** 2 +
    Math.cos(lat1) * Math.cos(lat2) * Math.sin(dLng / 2) ** 2;

  return 2 * EARTH_RADIUS_KM * Math.asin(Math.sqrt(h));
}

/**
 * 从 from 向 to 移动 distanceKm，返回新位置。
 * 若剩余距离不足 distanceKm，直接返回 to。
 */
export function moveTowards(from: GeoPoint, to: GeoPoint, stepKm: number): GeoPoint {
  const total = distanceKm(from, to);
  if (total <= stepKm || total === 0) {
    return { ...to };
  }
  const ratio = stepKm / total;
  return {
    lat: from.lat + (to.lat - from.lat) * ratio,
    lng: from.lng + (to.lng - from.lng) * ratio,
  };
}

/**
 * 计算 from 到 to 的航向角（0-360 度，正北为 0）。
 */
export function bearing(from: GeoPoint, to: GeoPoint): number {
  const lat1 = (from.lat * Math.PI) / 180;
  const lat2 = (to.lat * Math.PI) / 180;
  const dLng = ((to.lng - from.lng) * Math.PI) / 180;

  const y = Math.sin(dLng) * Math.cos(lat2);
  const x =
    Math.cos(lat1) * Math.sin(lat2) -
    Math.sin(lat1) * Math.cos(lat2) * Math.cos(dLng);

  const brng = (Math.atan2(y, x) * 180) / Math.PI;
  return (brng + 360) % 360;
}