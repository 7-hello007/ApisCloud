/* eslint-disable @typescript-eslint/no-require-imports */
const {
  isInsideZone,
  detectZoneTransition,
  distanceKm,
} = require('../plugins/geofence/src/geofence.js');

interface Zone {
  id: string;
  name: string;
  type: 'circle';
  center: { lat: number; lng: number };
  radiusKm: number;
  alertOnExit?: boolean;
  alertOnEnter?: boolean;
}

const ZONE: Zone = {
  id: 'zone-1',
  name: '测试围栏',
  type: 'circle',
  center: { lat: 31.2304, lng: 121.4737 },
  radiusKm: 30,
  alertOnExit: true,
  alertOnEnter: false,
};

describe('geofence.zoneDetection', () => {
  describe('distanceKm', () => {
    it('同一点距离为 0', () => {
      const d = distanceKm({ lat: 31.23, lng: 121.47 }, { lat: 31.23, lng: 121.47 });
      expect(d).toBeCloseTo(0, 5);
    });

    it('纬度差 1 度约 111km', () => {
      const d = distanceKm({ lat: 31.0, lng: 121.0 }, { lat: 32.0, lng: 121.0 });
      expect(d).toBeGreaterThan(100);
      expect(d).toBeLessThan(120);
    });
  });

  describe('isInsideZone', () => {
    it('中心点在围栏内', () => {
      expect(isInsideZone(ZONE.center, ZONE)).toBe(true);
    });

    it('距中心 10km 的点在围栏内', () => {
      const point = { lat: 31.2304 + 0.09, lng: 121.4737 };
      expect(isInsideZone(point, ZONE)).toBe(true);
    });

    it('距中心 50km 的点在围栏外', () => {
      const point = { lat: 31.2304 + 0.45, lng: 121.4737 };
      expect(isInsideZone(point, ZONE)).toBe(false);
    });

    it('不支持的类型抛错', () => {
      const badZone = { ...ZONE, type: 'polygon' as never };
      expect(() => isInsideZone(ZONE.center, badZone)).toThrow(/不支持的围栏类型/);
    });
  });

  describe('detectZoneTransition', () => {
    const insidePoint = { lat: 31.2304, lng: 121.4737 };
    const outsidePoint = { lat: 31.9, lng: 121.4737 };

    it('首次观测（prevInside=null）不产生告警', () => {
      const result = detectZoneTransition({
        vehicleId: 'v-1',
        position: insidePoint,
        prevInside: null,
        zone: ZONE,
      });
      expect(result).toBeNull();
    });

    it('一直在内不产生告警', () => {
      const result = detectZoneTransition({
        vehicleId: 'v-1',
        position: insidePoint,
        prevInside: true,
        zone: ZONE,
      });
      expect(result).toBeNull();
    });

    it('一直在外不产生告警', () => {
      const result = detectZoneTransition({
        vehicleId: 'v-1',
        position: outsidePoint,
        prevInside: false,
        zone: ZONE,
      });
      expect(result).toBeNull();
    });

    it('从内到外，alertOnExit=true 时产生告警', () => {
      const result = detectZoneTransition({
        vehicleId: 'v-1',
        position: outsidePoint,
        prevInside: true,
        zone: ZONE,
      });
      expect(result).not.toBeNull();
      expect(result!.type).toBe('exit');
      expect(result!.alertType).toBe('geofence_exit');
      expect(result!.level).toBe('warning');
      expect(result!.zoneId).toBe('zone-1');
    });

    it('从内到外，alertOnExit=false 时不产生告警', () => {
      const zone: Zone = { ...ZONE, alertOnExit: false };
      const result = detectZoneTransition({
        vehicleId: 'v-1',
        position: outsidePoint,
        prevInside: true,
        zone,
      });
      expect(result).toBeNull();
    });

    it('从外到内，alertOnEnter=true 时产生告警', () => {
      const zone: Zone = { ...ZONE, alertOnEnter: true };
      const result = detectZoneTransition({
        vehicleId: 'v-1',
        position: insidePoint,
        prevInside: false,
        zone,
      });
      expect(result).not.toBeNull();
      expect(result!.type).toBe('enter');
      expect(result!.alertType).toBe('geofence_enter');
      expect(result!.level).toBe('info');
    });

    it('从外到内，alertOnEnter=false 时不产生告警', () => {
      const result = detectZoneTransition({
        vehicleId: 'v-1',
        position: insidePoint,
        prevInside: false,
        zone: ZONE,
      });
      expect(result).toBeNull();
    });
  });
});
