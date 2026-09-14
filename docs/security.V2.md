# 安全基础 V2

## 一、功能目标

从认证、输入验证、密钥管理建立安全基础。智能驾驶服务调度对安全要求极高，安全要内建，不是事后补。

**V2 相比 V1，新增 gateway JWT 认证和限流、ingest 指令签名校验。**

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

**V2 新增服务侧接入文件：**

```
core/services/gateway/src/
├── guards.ts                 — 认证 guard + 限流 guard
├── server.ts                 — 支持 guards 依次执行
├── service.ts                — 创建并注入 guards
└── config.ts                 — 加载 auth / rate limit 配置
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

## 四、V2 修改

### 变更一：gateway 接入 JWT 认证

**为什么改：** V1 只在 `libs` 里提供了认证工具（`createAuthMiddleware`、`createJwt`），**没有服务实际接入**。阶段六要"完善安全性"，必须落地到真实服务。

**怎么改：**

1. **新建 `core/services/gateway/src/guards.ts`**
   - `createAuthGuard(options)`：包装 `createAuthMiddleware`
   - 返回 `RequestGuard`，签名是 `(ctx: GuardContext) => Promise<boolean> | boolean`

2. **`GatewayConfig` 加 3 个字段**
   - `authEnabled`：是否开启认证
   - `jwtSecret`：JWT 密钥
   - `authPublicPaths`：白名单路径前缀

3. **`createGatewayServer` 加 `guards` 参数**
   - 请求进来后，**依次执行所有 guards**
   - 任一 guard 返回 false，直接返回，不再往下走
   - 全通过后，才走路由匹配

4. **`createGatewayService` 创建并注入 guards**
   - 创建 `authGuard` 和 `rateLimitGuard`
   - 传给 `createGatewayServer`

5. **默认关闭**
   - `GATEWAY_AUTH_ENABLED=false`
   - 方便前端 demo 和本地开发

**白名单：**

| 路径 | 理由 |
|---|---|
| `/health` | 编排系统探活 |
| `/metrics` | Prometheus 抓取 |
| `/api/registry` | 前端启动时拉插件清单 |

可通过 `GATEWAY_AUTH_PUBLIC_PATHS` 环境变量覆盖。

**Header：** `Authorization: Bearer <token>`

**未认证返回：**

```json
{ "error": "unauthorized", "reason": "missing or invalid token" }
```

HTTP 状态码 401。

**验证方式：**

```bash
# 1. 无 token 访问受保护路径
curl -s -o /dev/null -w "%{http_code}\n" http://localhost:9101/api/proxy/data-writer/health
# 预期：401

# 2. 带有效 token
TOKEN=$(node -e "
const { createJwt } = require('./core/libs/dist');
const jwt = createJwt({ secret: process.env.JWT_SECRET || 'change-me-in-production' });
console.log(jwt.sign({ sub: 'test-user', role: 'admin' }));
")

curl -s -o /dev/null -w "%{http_code}\n" \
  -H "Authorization: Bearer $TOKEN" \
  http://localhost:9101/api/proxy/data-writer/health
# 预期：200
```

### 变更二：gateway 接入限流

**为什么改：** 防刷、防 DoS。V1 的 `createRateLimiter` 没被真实使用。

**怎么改：**

1. **`guards.ts` 加 `createRateLimitGuard(options)`**
   - 每 IP 每分钟最大请求数
   - 从 `X-Forwarded-For` 或 `req.socket.remoteAddress` 取 IP
   - 内存版，单进程有效

2. **`GatewayConfig` 加 3 个字段**
   - `rateLimitEnabled`
   - `rateLimitMax`
   - `rateLimitWindowSec`

3. **默认开启**
   - `GATEWAY_RATE_LIMIT_ENABLED=true`
   - `GATEWAY_RATE_LIMIT_MAX=100`
   - `GATEWAY_RATE_LIMIT_WINDOW_SEC=60`

4. **白名单**
   - `/health`、`/metrics`：监控不能因为限流失败

**响应头：**

```
X-RateLimit-Limit: 100
X-RateLimit-Remaining: 99
X-RateLimit-Reset: 1789345999
```

**超限返回：**

```json
{ "error": "too_many_requests", "retry_after_sec": 45 }
```

HTTP 状态码 429。

**验证方式：**

```bash
# 快速触发 429
for i in $(seq 1 110); do
  curl -s -o /dev/null -w "%{http_code}\n" http://localhost:9101/api/proxy/data-writer/health
done | sort | uniq -c
# 预期：
#   100 200
#    10 429
```

**多实例部署：** 当前内存版，多实例需替换为 Redis 版。

### 变更三：ingest 接入指令签名校验

**为什么改：** 防伪造调度指令。V1 的 `createCommandSignature` 只做了签发，**没有接收方验证**。

**怎么改：**

1. **`IngestConfig` 加 3 个字段**
   - `verifySignature`：是否校验
   - `signSecret`：签名密钥
   - `signTtlSec`：签名有效期

2. **`handleDownlink` 加签名校验**
   - `DownlinkCommandSchema` 校验通过后
   - **如果 `verifySignature = true`**，从 `payload.signed` 提取签名
   - 缺签名 → 丢弃并 warn
   - 验证失败（签名错、过期、算法不匹配）→ 丢弃并 warn
   - 验证通过 → 继续发 MQTT

3. **默认关闭**
   - `INGEST_VERIFY_SIGNATURE=false`
   - 因为阶段三的 charging-scheduler / route-optimizer 发的命令没签名
   - **只有 dispatch-core 发的命令带签名**（阶段三 `command-builder.ts` 用 `createCommandSignature` 签发）

**签名格式：**

```ts
{
  vehicle_id: string,
  command_id: string,
  command_type: string,
  payload: {
    task_id?: string,
    signed?: {
      command: SignableCommand,
      signature: string,
      algorithm: string
    }
  }
}
```

**`extractSignedCommand` 辅助函数：**

```ts
function extractSignedCommand(payload: unknown): SignedCommand | null {
  if (!payload || typeof payload !== 'object') return null;
  const p = payload as { signed?: unknown };
  if (!p.signed || typeof p.signed !== 'object') return null;
  const s = p.signed as { command?: unknown; signature?: unknown; algorithm?: unknown };
  if (!s.command || typeof s.command !== 'object') return null;
  if (typeof s.signature !== 'string' || typeof s.algorithm !== 'string') return null;
  return {
    command: s.command as SignedCommand['command'],
    signature: s.signature,
    algorithm: s.algorithm,
  };
}
```

**验证方式：**

```bash
# 1. 开启签名校验
INGEST_VERIFY_SIGNATURE=true node core/services/ingest/dist/server-entry.js

# 2. 发无签名的命令
# 预期：被拒绝，ingest 日志 warn "下行命令缺签名，拒绝"

# 3. 发有效签名的命令
# 预期：通过，发 MQTT commands/{vehicle_id}

# 4. 发错误密钥签的命令
# 预期：被拒绝，ingest 日志 warn "下行命令签名校验失败，拒绝"

# 5. 发过期签名的命令
# 预期：被拒绝，ingest 日志 warn "指令已过期"
```

**TTL 一致性：** `INGEST_SIGN_TTL_SEC` 必须与 `DISPATCH_SIGN_TTL_SEC`（阶段三 command-builder 用的）一致。**不一致会导致合法命令被拒。**

### 变更四：环境变量

新增 7 个：

| 环境变量 | 默认值 | 说明 |
|---|---|---|
| `GATEWAY_AUTH_ENABLED` | `false` | 是否开启 JWT 认证 |
| `GATEWAY_AUTH_PUBLIC_PATHS` | `/health,/metrics,/api/registry` | 白名单路径（逗号分隔） |
| `GATEWAY_RATE_LIMIT_ENABLED` | `true` | 是否开启限流 |
| `GATEWAY_RATE_LIMIT_MAX` | `100` | 每 IP 每分钟请求数 |
| `GATEWAY_RATE_LIMIT_WINDOW_SEC` | `60` | 时间窗（秒） |
| `INGEST_VERIFY_SIGNATURE` | `false` | 是否校验签名 |
| `INGEST_SIGN_TTL_SEC` | `60` | 签名有效期（秒） |

**`.env.example` 已同步。**

### 变更五：新增 guard 架构

**为什么改：** 认证和限流是两个独立的横切关注点，**不应该混在 server 的业务逻辑里**。

**怎么改：**

1. **定义 `RequestGuard` 类型**

```ts
export interface GuardContext {
  req: IncomingMessage;
  res: ServerResponse;
  pathname: string;
  method: string;
}

export type RequestGuard = (ctx: GuardContext) => Promise<boolean> | boolean;
```

2. **server 层只管遍历**

```ts
for (const guard of guards) {
  const ok = await guard({ req, res, pathname, method });
  if (!ok) return;  // guard 已经写了响应，直接返回
}
```

3. **service 层决定要哪些 guard**

```ts
const guards: RequestGuard[] = [
  createAuthGuard({...}),
  createRateLimitGuard({...}),
];
```

**收益：**

- **加新 guard 不改 server**：未来加"IP 黑名单"、"请求签名"只改 service 的数组。
- **测试隔离**：`gateway.auth.test.ts` 只注入 auth guard，`gateway.rateLimit.test.ts` 只注入 rate limit guard。
- **默认行为明确**：默认 auth 关、限流开，业务零改动。

### 变更六：新增测试

3 个新测试文件：

| 文件 | 覆盖 |
|---|---|
| `tests/gateway.auth.test.ts` | 认证：关闭时通过、白名单通过、无 token 401、有效 token 200、无效 token 401、错误密钥 401（6 个用例） |
| `tests/gateway.rateLimit.test.ts` | 限流：关闭时通过、超阈值 429、retry_after_sec、X-RateLimit 头、白名单不过限流（5 个用例） |
| `tests/ingest.commandSignature.test.ts` | 签名：有效通过、无签名拒绝、错误密钥拒绝、过期拒绝、关闭时无签名也通过（5 个用例） |

## 五、后续版本

### 阶段六后续（可选）

- gateway 加 mTLS
- 插件签名与验证
- 限流器替换为 Redis 版
- 防重放替换为 Redis 版
- 威胁建模（STRIDE）
- 隐私保护（GDPR / 个人信息）

### 阶段六之外

- 车辆证书认证
- 插件权限声明
- 审计日志持久化
- 密钥轮换自动化

### 已知边界

| 能力 | 状态 |
|---|---|
| JWT 认证 | ✅ 已实现（默认关闭） |
| 限流（内存版） | ✅ 已实现（默认开启） |
| 指令签名（签发 + 验证） | ✅ 已实现 |
| 防重放 | ✅ V1 已实现 |
| 输入验证 | ✅ V1 已实现 |
| 密钥强校验 | ✅ V1 已实现 |
| mTLS | ❌ 预留 |
| 插件签名 | ❌ 预留 |
| 车辆证书认证 | ❌ 预留 |
| Redis 版限流 | ❌ 预留 |
| Redis 版防重放 | ❌ 预留 |
| 威胁建模 | ❌ 预留 |
| 隐私保护 | ❌ 预留 |

### 安全设计原则

1. **默认安全但不阻塞**
   - 认证默认关（demo 友好）
   - 限流默认开（防刷）
   - 签名默认关（兼容阶段三无签名插件）

2. **分层防御**
   - 网络层：限流（gateway）
   - 应用层：认证（gateway）、输入验证（ingest）
   - 数据层：指令签名（dispatch-core 签发 + ingest 验证）

3. **横切关注点用 guard 模式**
   - 新增安全能力时，只加 guard，不改 server 主逻辑

4. **契约稳定**
   - JWT 算法 HS256
   - 签名算法 HMAC-SHA256
   - 签名 TTL 60s
   - 这些是核心契约，破坏性改动需版本化

5. **多实例部署注意**
   - 限流和防重放当前是内存版，多实例会失效
   - 必须替换为 Redis 版（阶段六后续）

6. **密钥管理**
   - 开发环境：`.env` 明文
   - 生产环境：Secrets Manager
   - 上线前必须替换所有 `change-me-*` 默认值