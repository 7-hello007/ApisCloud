'use strict';

/**
 * 报表生成纯逻辑。
 */

/**
 * 从车辆列表生成汇总。
 */
function summarizeVehicles(vehicles) {
  const total = vehicles.length;
  const byStatus = {};
  let batterySum = 0;
  let batteryCount = 0;
  let lowBatteryCount = 0;

  for (const v of vehicles) {
    const status = v.status ?? 'unknown';
    byStatus[status] = (byStatus[status] ?? 0) + 1;
    if (typeof v.battery === 'number') {
      batterySum += v.battery;
      batteryCount++;
      if (v.battery < 20) lowBatteryCount++;
    }
  }

  return {
    total,
    byStatus,
    avgBattery: batteryCount > 0 ? round(batterySum / batteryCount) : 0,
    lowBatteryCount,
  };
}

/**
 * 从告警列表生成汇总。
 */
function summarizeAlerts(alerts) {
  const total = alerts.length;
  const byLevel = {};
  const byType = {};

  for (const a of alerts) {
    const level = a.level ?? 'unknown';
    byLevel[level] = (byLevel[level] ?? 0) + 1;
    const type = a.alert_type ?? 'unknown';
    byType[type] = (byType[type] ?? 0) + 1;
  }

  return { total, byLevel, byType };
}

/**
 * 从命令列表生成汇总。
 */
function summarizeCommands(commands) {
  const total = commands.length;
  const byType = {};
  const byStatus = {};

  for (const c of commands) {
    const type = c.command_type ?? 'unknown';
    byType[type] = (byType[type] ?? 0) + 1;
    const status = c.status ?? 'unknown';
    byStatus[status] = (byStatus[status] ?? 0) + 1;
  }

  return { total, byType, byStatus };
}

/**
 * 生成完整报表。
 */
function buildSummary({ vehicles, alerts, commands, generatedAt }) {
  return {
    generated_at: generatedAt,
    vehicles: summarizeVehicles(vehicles),
    alerts: summarizeAlerts(alerts),
    commands: summarizeCommands(commands),
  };
}

function round(n) {
  return Math.round(n * 100) / 100;
}

module.exports = {
  summarizeVehicles,
  summarizeAlerts,
  summarizeCommands,
  buildSummary,
};
