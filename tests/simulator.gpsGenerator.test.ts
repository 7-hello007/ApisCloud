import { bearing, distanceKm, moveTowards, randomPointInRadius } from '@apiscloud/simulator';

describe('simulator.gpsGenerator', () => {
  const shanghai = { lat: 31.2304, lng: 121.4737 };

  describe('distanceKm', () => {
    it('同点距离为 0', () => {
      expect(distanceKm(shanghai, shanghai)).toBe(0);
    });

    it('上海到北京约 1067 km', () => {
      const beijing = { lat: 39.9042, lng: 116.4074 };
      const d = distanceKm(shanghai, beijing);
      expect(d).toBeGreaterThan(1000);
      expect(d).toBeLessThan(1150);
    });

    it('对称性：d(a,b) === d(b,a)', () => {
      const a = { lat: 31.23, lng: 121.47 };
      const b = { lat: 31.24, lng: 121.48 };
      expect(distanceKm(a, b)).toBeCloseTo(distanceKm(b, a), 10);
    });

    it('1 度纬度约 111 km', () => {
      const a = { lat: 0, lng: 0 };
      const b = { lat: 1, lng: 0 };
      const d = distanceKm(a, b);
      expect(d).toBeGreaterThan(110);
      expect(d).toBeLessThan(112);
    });
  });

  describe('randomPointInRadius', () => {
    it('生成的点在半径内', () => {
      const radius = 10;
      for (let i = 0; i < 100; i++) {
        const p = randomPointInRadius(shanghai, radius);
        const d = distanceKm(shanghai, p);
        expect(d).toBeLessThanOrEqual(radius * 1.01);
      }
    });

    it('生成的点不集中在圆心', () => {
      const radius = 10;
      let outsideHalf = 0;
      for (let i = 0; i < 100; i++) {
        const p = randomPointInRadius(shanghai, radius);
        if (distanceKm(shanghai, p) > radius / 2) {
          outsideHalf++;
        }
      }
      // 面积均匀分布下，外圈应占约 75%
      expect(outsideHalf).toBeGreaterThan(50);
    });

    it('半径为 0 时返回圆心', () => {
      const p = randomPointInRadius(shanghai, 0);
      expect(p.lat).toBeCloseTo(shanghai.lat, 10);
      expect(p.lng).toBeCloseTo(shanghai.lng, 10);
    });
  });

  describe('moveTowards', () => {
    it('移动距离不足时到达目标', () => {
      const from = { lat: 31.23, lng: 121.47 };
      const to = { lat: 31.231, lng: 121.471 };
      const result = moveTowards(from, to, 100);
      expect(result.lat).toBeCloseTo(to.lat, 10);
      expect(result.lng).toBeCloseTo(to.lng, 10);
    });

    it('移动距离恰好时精确到达', () => {
      const from = { lat: 0, lng: 0 };
      const to = { lat: 0.001, lng: 0 };
      const total = distanceKm(from, to);
      const result = moveTowards(from, to, total);
      expect(result.lat).toBeCloseTo(to.lat, 8);
      expect(result.lng).toBeCloseTo(to.lng, 8);
    });

    it('部分移动位置在两点之间', () => {
      const from = { lat: 0, lng: 0 };
      const to = { lat: 1, lng: 0 };
      const total = distanceKm(from, to);
      const result = moveTowards(from, to, total / 2);
      expect(result.lat).toBeCloseTo(0.5, 3);
      expect(result.lng).toBeCloseTo(0, 8);
    });

    it('起点等于终点时直接返回', () => {
      const p = { lat: 31.23, lng: 121.47 };
      const result = moveTowards(p, p, 10);
      expect(result.lat).toBeCloseTo(p.lat, 10);
      expect(result.lng).toBeCloseTo(p.lng, 10);
    });
  });

  describe('bearing', () => {
    it('正北为 0 度', () => {
      const from = { lat: 0, lng: 0 };
      const to = { lat: 1, lng: 0 };
      expect(bearing(from, to)).toBeCloseTo(0, 5);
    });

    it('正东约 90 度', () => {
      const from = { lat: 0, lng: 0 };
      const to = { lat: 0, lng: 1 };
      expect(bearing(from, to)).toBeCloseTo(90, 1);
    });

    it('正南约 180 度', () => {
      const from = { lat: 1, lng: 0 };
      const to = { lat: 0, lng: 0 };
      expect(bearing(from, to)).toBeCloseTo(180, 5);
    });

    it('正西约 270 度', () => {
      const from = { lat: 0, lng: 1 };
      const to = { lat: 0, lng: 0 };
      expect(bearing(from, to)).toBeCloseTo(270, 1);
    });

    it('返回值在 0-360 之间', () => {
      for (let i = 0; i < 20; i++) {
        const from = { lat: Math.random() * 80 - 40, lng: Math.random() * 160 - 80 };
        const to = { lat: Math.random() * 80 - 40, lng: Math.random() * 160 - 80 };
        const b = bearing(from, to);
        expect(b).toBeGreaterThanOrEqual(0);
        expect(b).toBeLessThan(360);
      }
    });
  });
});
