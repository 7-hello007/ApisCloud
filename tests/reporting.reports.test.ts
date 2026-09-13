/* eslint-disable @typescript-eslint/no-require-imports */
const {
  summarizeVehicles,
  summarizeAlerts,
  summarizeCommands,
  buildSummary,
} = require('../plugins/reporting/src/reports.js');

describe('reporting.reports', () => {
  describe('summarizeVehicles', () => {
    it('空列表返回默认值', () => {
      const result = summarizeVehicles([]);
      expect(result).toEqual({
        total: 0,
        byStatus: {},
        avgBattery: 0,
        lowBatteryCount: 0,
      });
    });

    it('按状态统计', () => {
      const result = summarizeVehicles([
        { status: 'running', battery: 80 },
        { status: 'running', battery: 60 },
        { status: 'idle', battery: 90 },
      ]);
      expect(result.total).toBe(3);
      expect(result.byStatus).toEqual({ running: 2, idle: 1 });
      expect(result.avgBattery).toBeCloseTo(76.67, 2);
      expect(result.lowBatteryCount).toBe(0);
    });

    it('统计低电量车辆', () => {
      const result = summarizeVehicles([
        { status: 'running', battery: 10 },
        { status: 'running', battery: 80 },
        { status: 'idle', battery: 15 },
      ]);
      expect(result.lowBatteryCount).toBe(2);
    });
  });

  describe('summarizeAlerts', () => {
    it('按 level 和 type 统计', () => {
      const result = summarizeAlerts([
        { level: 'warning', alert_type: 'speed_anomaly' },
        { level: 'warning', alert_type: 'speed_anomaly' },
        { level: 'critical', alert_type: 'battery_drop' },
      ]);
      expect(result.total).toBe(3);
      expect(result.byLevel).toEqual({ warning: 2, critical: 1 });
      expect(result.byType).toEqual({ speed_anomaly: 2, battery_drop: 1 });
    });
  });

  describe('summarizeCommands', () => {
    it('按 type 和 status 统计', () => {
      const result = summarizeCommands([
        { command_type: 'dispatch', status: 'pending' },
        { command_type: 'charge', status: 'pending' },
        { command_type: 'dispatch', status: 'acked' },
      ]);
      expect(result.total).toBe(3);
      expect(result.byType).toEqual({ dispatch: 2, charge: 1 });
      expect(result.byStatus).toEqual({ pending: 2, acked: 1 });
    });
  });

  describe('buildSummary', () => {
    it('组合三个汇总', () => {
      const result = buildSummary({
        vehicles: [{ status: 'running', battery: 80 }],
        alerts: [{ level: 'warning', alert_type: 'speed_anomaly' }],
        commands: [{ command_type: 'dispatch', status: 'pending' }],
        generatedAt: '2026-01-01T00:00:00Z',
      });
      expect(result.generated_at).toBe('2026-01-01T00:00:00Z');
      expect(result.vehicles.total).toBe(1);
      expect(result.alerts.total).toBe(1);
      expect(result.commands.total).toBe(1);
    });
  });
});
