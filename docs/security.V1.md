# 安全基础 V2

## 一、功能目标

从认证、输入验证、密钥管理建立安全基础。智能驾驶服务调度对安全要求极高，安全要内建，不是事后补。

## 二、基础实现

### 2.1 文件位置

```
core/libs/src/security/
├── constants.ts              — 算法、过期时间、长度约束
├── jwt.ts                    — JWT 签发/验证/刷新
├── auth.ts                   — 认证中间件（原生 http + Express 风格）
├── validation.ts             — 输入验证 + 常用 schema
├── secrets.ts                — 密钥管理
├── command-signature.ts      — 指令签名（HMAC-SHA256）
├── rate-limiter.ts           — 内存限流器
├── replay-guard.ts           — 防重放（nonce + 时间窗）
└── index.ts                  — 统一出口
```

### 2.2 身份与认证

| 对象 | 认证方式 | 状态 |
|---|---|---|
| 车辆 | 证书 + 设备指纹 | 预留，阶段三 |
| 服务 | 基础认证 | 已实现 |
| 用户 | JWT | 已实现 |
| 插件 | 权限声明 | 预留，阶段四 |

### 2.3 JWT

```ts
const jwt = createJwt({ secret: process.env.JWT_SECRET });

const token = jwt.sign({ sub: 'user-1', role: 'admin' });
const refresh = jwt.signRefresh({ sub: 'user-1' });
const payload = jwt.verify(token);
const decoded = jwt.decode(token); // 不验证签名
```

算法 HS256，访问 token 默认 1h，刷新 token 默认 7d。

### 2.4 认证中间件

兼容原生 http 和 Express 风格：

```ts
const auth = createAuthMiddleware({
  jwt,
  publicPaths: ['/health', '/metrics'],
});

// 原生 http
const result = auth.guard(req);
if (!result.ok) { /* 401 */ }

// Express 风格
app.use(auth.expressMiddleware);
```

### 2.5 输入验证

常用 schema 库：

| Schema | 用途 |
|---|---|
| SafeString | 非空字符串，限制最大 1024 |
| SafeName | 插件名/服务名，小写+数字+连字符 |
| VehicleId | 车辆 ID |
| TaskId | 任务 ID |
| Latitude、Longitude | 经纬度 |
| Position | 位置对象 |
| Battery | 电量（0-100） |
| TimeWindow | 时间窗 |
| Priority | 优先级（0-100） |
| EnvelopeSchema | 消息信封 |

### 2.6 密钥管理

```ts
const secrets = createSecrets();
const jwtSecret = secrets.requireStrongJwtSecret(); // 强校验
const optional = secrets.getOptional('SOME_KEY');
```

强校验规则：

- 长度 ≥ 32
- 不是默认值 change-me-in-production

生产环境应替换为 Secrets Manager（AWS Secrets Manager、Vault 等）。

### 2.7 指令签名

为阶段三的调度指令准备：

```ts
const sig = createCommandSignature({ secret: COMMAND_SIGN_SECRET });

const signed = sig.sign({
  command_id: 'cmd-1',
  vehicle_id: 'v-1',
  command_type: 'dispatch',
  payload: { lat: 31.2, lng: 121.4 },
  issued_at: Math.floor(Date.now() / 1000),
});

// 外部系统接收后验证
const result = sig.verify(signed);
if (!result.ok) { /* 拒绝执行 */ }
```

特性：

- HMAC-SHA256
- 规范化字符串，避免 JSON key 顺序影响
- timingSafeEqual 防时序攻击
- 默认 TTL 60 秒

### 2.8 限流器

内存版，单进程有效：

```ts
const limiter = createRateLimiter({ maxRequests: 100, windowSec: 60 });
const { allowed, remaining, resetAt } = limiter.tryConsume('ip:1.2.3.4');
```

多实例部署需替换为 Redis 版。

### 2.9 防重放

```ts
const guard = createReplayGuard({ ttlSec: 300 });
const result = guard.check(nonce);
if (!result.ok) { /* 拒绝 */ }
```

同一 nonce 在 TTL 内只允许一次。内存版，多实例需 Redis 版。

### 2.10 CI 集成

- gitleaks 扫硬编码密钥
- pnpm audit 扫依赖漏洞
- 每周一自动跑安全扫描

### 2.11 向后兼容

旧 API createSecurity(config) 仍可用：

```ts
const sec = createSecurity(config);
const token = sec.signJwt({ sub: 'user-1' });
const payload = sec.verifyJwt(token);
const data = sec.validate(schema, input);
```

内部用新模块组合。

## 三、V1 修改

无（首版）。

## 四、后续版本

- 阶段三：接入车辆证书认证
- 阶段四：接入插件权限声明
- 阶段六：补充 mTLS、威胁建模、隐私保护
- 阶段六：限流器和防重放替换为 Redis 版