'use strict';

/**
 * dashboard 插件后端。
 * 阶段四只做前端展示，后端不提供 API。
 * 真实数据接入留到阶段五。
 */

module.exports = {
  async onLoad(ctx) {
    ctx.logger.info('dashboard 插件已加载（前端模式）');
  },

  async onUnload() {
    // 无资源清理
  },

  async onTimer() {},

  getRoutes() {
    return [];
  },

  async getHealth() {
    return { status: 'ok', message: 'dashboard plugin (frontend-only)' };
  },
};
