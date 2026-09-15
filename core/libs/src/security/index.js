'use strict';
var __importDefault =
  (this && this.__importDefault) ||
  function (mod) {
    return mod && mod.__esModule ? mod : { default: mod };
  };
Object.defineProperty(exports, '__esModule', { value: true });
exports.z = void 0;
exports.createSecurity = createSecurity;
const jsonwebtoken_1 = __importDefault(require('jsonwebtoken'));
const zod_1 = require('zod');
Object.defineProperty(exports, 'z', {
  enumerable: true,
  get: function () {
    return zod_1.z;
  },
});
function createSecurity(config) {
  return {
    signJwt(payload, expiresIn = '1h') {
      return jsonwebtoken_1.default.sign(payload, config.JWT_SECRET, { expiresIn });
    },
    verifyJwt(token) {
      try {
        const decoded = jsonwebtoken_1.default.verify(token, config.JWT_SECRET);
        if (typeof decoded === 'string') {
          throw new Error('invalid jwt payload');
        }
        return decoded;
      } catch (err) {
        const message = err instanceof Error ? err.message : String(err);
        throw new Error(`JWT 校验失败：${message}`);
      }
    },
    validate(schema, data) {
      const parsed = schema.safeParse(data);
      if (!parsed.success) {
        const issues = parsed.error.issues
          .map((i) => `${i.path.join('.')}: ${i.message}`)
          .join('; ');
        throw new Error(`输入校验失败：${issues}`);
      }
      return parsed.data;
    },
  };
}
//# sourceMappingURL=index.js.map
