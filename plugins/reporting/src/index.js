'use strict';

const {
  summarizeVehicles,
  summarizeAlerts,
  summarizeCommands,
  buildSummary,
} = require('./reports');

/**
 * reporting 插件。
 * 通过 ctx.http 调 data-writer 的查询端点，生成报表。
 * 通过 getRoutes 暴露 HTTP 端点，由 gateway 聚合。
 */

let http = null;
let services = null;

/** 从 data-writer 拉数据 */
async function fetchActiveVehicles() {
  const res = await http.get(`${services.dataWriter}/api/query/vehicles/active`);
  return res.vehicles ?? [];
}

async function fetchRecentAlerts() {
  const res = await http.get(`${services.dataWriter}/api/query/alerts/recent`);
  return res.alerts ?? [];
}

async function fetchRecentCommands() {
  const res = await http.get(`${services.dataWriter}/api/query/commands/recent`);
  return res.commands ?? [];
}

function sendJson(res, status, body) {
  res.writeHead(status, { 'Content-Type': 'application/json' });
  res.end(JSON.stringify(body));
}

module.exports = {
  async onLoad(ctx) {
    if (ctx.http) http = ctx.http;
    if (ctx.services) services = ctx.services;

    ctx.logger.info({ hasHttp: !!http, services }, 'reporting 插件已加载');
  },

  async onUnload() {
    http = null;
    services = null;
  },

  async onMessage() {},

  async onTimer() {},

  getRoutes() {
    return [
      {
        method: 'GET',
        path: '/api/reporting/summary',
        handler: async (_req, res) => {
          if (!http || !services?.dataWriter) {
            sendJson(res, 503, { error: 'http client or service url not available' });
            return;
          }
          try {
            const [vehicles, alerts, commands] = await Promise.all([
              fetchActiveVehicles(),
              fetchRecentAlerts(),
              fetchRecentCommands(),
            ]);
            const summary = buildSummary({
              vehicles,
              alerts,
              commands,
              generatedAt: new Date().toISOString(),
            });
            sendJson(res, 200, summary);
          } catch (err) {
            sendJson(res, 500, { error: err.message });
          }
        },
      },
      {
        method: 'GET',
        path: '/api/reporting/vehicles',
        handler: async (_req, res) => {
          if (!http || !services?.dataWriter) {
            sendJson(res, 503, { error: 'http client not available' });
            return;
          }
          try {
            const vehicles = await fetchActiveVehicles();
            sendJson(res, 200, {
              generated_at: new Date().toISOString(),
              summary: summarizeVehicles(vehicles),
              vehicles,
            });
          } catch (err) {
            sendJson(res, 500, { error: err.message });
          }
        },
      },
      {
        method: 'GET',
        path: '/api/reporting/alerts',
        handler: async (_req, res) => {
          if (!http || !services?.dataWriter) {
            sendJson(res, 503, { error: 'http client not available' });
            return;
          }
          try {
            const alerts = await fetchRecentAlerts();
            sendJson(res, 200, {
              generated_at: new Date().toISOString(),
              summary: summarizeAlerts(alerts),
              alerts,
            });
          } catch (err) {
            sendJson(res, 500, { error: err.message });
          }
        },
      },
    ];
  },

  async getHealth() {
    return {
      status: http && services?.dataWriter ? 'ok' : 'degraded',
      message: `dataWriter: ${services?.dataWriter ?? 'unknown'}`,
    };
  },

  // ============================================================
  // 测试辅助
  // ============================================================

  _setHttp(h) {
    http = h;
  },

  _setServices(s) {
    services = s;
  },

  _reset() {
    http = null;
    services = null;
  },
};
