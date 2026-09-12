/**
 * 模板插件。
 * 复制本目录到 plugins/新插件名/，改 plugin.json 的 name 和业务代码即可。
 */

module.exports = {
  /**
   * 加载时调用。
   * @param {object} ctx - PluginContext，含 pluginId、logger、config
   */
  async onLoad(ctx) {
    ctx.logger.info('template plugin loaded');
  },

  /**
   * 卸载时调用。
   */
  async onUnload() {
    // 清理资源
  },

  /**
   * 收到消息时调用。
   * @param {string} topic
   * @param {object} envelope
   */
  async onMessage(_topic, _envelope) {
    // 处理消息
  },

  /**
   * 定时调用。
   */
  async onTimer() {
    // 定时任务
  },

  /**
   * 暴露 HTTP 路由。
   * @returns {Array<{method: string, path: string, handler: Function}>}
   */
  getRoutes() {
    return [];
  },

  /**
   * 健康检查。
   * @returns {{status: 'ok'|'degraded'|'down', message?: string}}
   */
  async getHealth() {
    return { status: 'ok' };
  },
};
