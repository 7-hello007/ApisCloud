/**
 * 安全相关常量。
 * 所有算法、过期时间、长度约束集中管理，避免散落各处。
 */

/** JWT 默认签名算法 */
export const JWT_ALGORITHM = 'HS256' as const;

/** JWT 默认过期时间 */
export const JWT_DEFAULT_EXPIRES_IN = '1h' as const;

/** JWT refresh token 过期时间 */
export const JWT_REFRESH_EXPIRES_IN = '7d' as const;

/** JWT secret 最小长度 */
export const JWT_SECRET_MIN_LENGTH = 32;

/** 指令签名算法 */
export const COMMAND_SIGN_ALGORITHM = 'sha256' as const;

/** 指令签名默认有效期（秒） */
export const COMMAND_SIGNATURE_TTL_SEC = 60;

/** 防重放 nonce 默认有效期（秒） */
export const REPLAY_NONCE_TTL_SEC = 300;

/** 限流默认窗口（秒） */
export const RATE_LIMIT_WINDOW_SEC = 60;

/** 限流默认窗口内最大请求数 */
export const RATE_LIMIT_MAX_REQUESTS = 100;

/** 输入验证最大长度 */
export const VALIDATION_MAX_STRING_LENGTH = 1024;
