import { JWT_SECRET_MIN_LENGTH } from './constants';

export interface SecretProvider {
  get(name: string): string;
  getOptional(name: string): string | undefined;
  requireStrongJwtSecret(): string;
}

export interface SecretsOptions {
  /** 环境变量前缀，默认无 */
  prefix?: string;
  /** 自定义读取函数，默认从 process.env 读 */
  reader?: (name: string) => string | undefined;
}

/**
 * 从环境变量读取密钥。
 * 生产环境应替换为 Secrets Manager（AWS Secrets Manager、Vault 等）。
 */
export function createSecrets(options: SecretsOptions = {}): SecretProvider {
  const { prefix = '', reader = (name: string) => process.env[name] } = options;

  function fullName(name: string): string {
    return prefix ? `${prefix}${name}` : name;
  }

  return {
    get(name: string): string {
      const value = reader(fullName(name));
      if (value === undefined || value === '') {
        throw new Error(`密钥不存在：${fullName(name)}`);
      }
      return value;
    },

    getOptional(name: string): string | undefined {
      const value = reader(fullName(name));
      return value === '' ? undefined : value;
    },

    requireStrongJwtSecret(): string {
      const secret = reader(fullName('JWT_SECRET'));
      if (!secret) {
        throw new Error('缺少 JWT_SECRET');
      }
      // 默认值检查必须先于长度检查：默认值本身就该被拦截，与长度无关
      if (secret === 'change-me-in-production') {
        throw new Error('JWT_SECRET 使用了默认值，必须更换');
      }
      if (secret.length < JWT_SECRET_MIN_LENGTH) {
        throw new Error(`JWT_SECRET 长度不足 ${JWT_SECRET_MIN_LENGTH}（当前 ${secret.length}）`);
      }
      return secret;
    },
  };
}
