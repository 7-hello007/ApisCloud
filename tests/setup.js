// ============================================================
// 测试全局设置
// 在所有测试文件运行前执行一次
// ============================================================

// 环境变量：测试环境
process.env.NODE_ENV = 'test';
process.env.LOG_LEVEL = 'silent';
process.env.MESSAGE_BUS = 'memory';
process.env.SERVICE_NAME = 'test';
process.env.LAYER = 'single';

// 禁用 dotenv 提示输出
process.env.DOTENV_CONFIG_QUIET = 'true';

// 测试用密钥，避免用真实密钥
process.env.JWT_SECRET = 'test-secret-for-testing-only';

// 数据库和中间件：测试环境用假地址，避免误连生产
process.env.PG_HOST = 'localhost';
process.env.PG_PORT = '5432';
process.env.PG_USER = 'test';
process.env.PG_PASSWORD = 'test';
process.env.PG_DATABASE = 'test';
process.env.REDIS_URL = 'redis://localhost:6379';
process.env.MQTT_URL = 'mqtt://localhost:1883';
process.env.KAFKA_BROKERS = 'localhost:9092';

// ============================================================
// 全局超时
// ============================================================
jest.setTimeout(10000);

// ============================================================
// 全局 mock 清理
// ============================================================
afterEach(() => {
  jest.clearAllMocks();
});

// ============================================================
// 屏蔽测试中不必要的日志
// ============================================================
const originalError = console.error;
beforeAll(() => {
  // 测试环境屏蔽 mqtt/redis 连接错误，避免污染输出
  console.error = (...args) => {
    const msg = String(args[0] ?? '');
    if (
      msg.includes('[mqtt] error') ||
      msg.includes('[redis] error') ||
      msg.includes('ECONNREFUSED')
    ) {
      return;
    }
    originalError.call(console, ...args);
  };
});

afterAll(() => {
  console.error = originalError;
});