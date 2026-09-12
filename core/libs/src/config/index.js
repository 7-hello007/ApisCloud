"use strict";
var __createBinding = (this && this.__createBinding) || (Object.create ? (function(o, m, k, k2) {
    if (k2 === undefined) k2 = k;
    var desc = Object.getOwnPropertyDescriptor(m, k);
    if (!desc || ("get" in desc ? !m.__esModule : desc.writable || desc.configurable)) {
      desc = { enumerable: true, get: function() { return m[k]; } };
    }
    Object.defineProperty(o, k2, desc);
}) : (function(o, m, k, k2) {
    if (k2 === undefined) k2 = k;
    o[k2] = m[k];
}));
var __setModuleDefault = (this && this.__setModuleDefault) || (Object.create ? (function(o, v) {
    Object.defineProperty(o, "default", { enumerable: true, value: v });
}) : function(o, v) {
    o["default"] = v;
});
var __importStar = (this && this.__importStar) || (function () {
    var ownKeys = function(o) {
        ownKeys = Object.getOwnPropertyNames || function (o) {
            var ar = [];
            for (var k in o) if (Object.prototype.hasOwnProperty.call(o, k)) ar[ar.length] = k;
            return ar;
        };
        return ownKeys(o);
    };
    return function (mod) {
        if (mod && mod.__esModule) return mod;
        var result = {};
        if (mod != null) for (var k = ownKeys(mod), i = 0; i < k.length; i++) if (k[i] !== "default") __createBinding(result, mod, k[i]);
        __setModuleDefault(result, mod);
        return result;
    };
})();
Object.defineProperty(exports, "__esModule", { value: true });
exports.ConfigSchema = void 0;
exports.loadConfig = loadConfig;
exports.resetConfig = resetConfig;
const dotenv = __importStar(require("dotenv"));
const schema_1 = require("./schema");
Object.defineProperty(exports, "ConfigSchema", { enumerable: true, get: function () { return schema_1.ConfigSchema; } });
let cached = null;
/**
 * 加载配置：
 * 1. 从 .env 读环境变量
 * 2. 用 zod 校验
 * 3. 缺关键字段直接抛错，启动即失败
 */
function loadConfig(overrides) {
    if (cached && !overrides) {
        return cached;
    }
    dotenv.config();
    const raw = {
        ...process.env,
        ...overrides,
    };
    const parsed = schema_1.ConfigSchema.safeParse(raw);
    if (!parsed.success) {
        const issues = parsed.error.issues
            .map((i) => `  - ${i.path.join('.')}: ${i.message}`)
            .join('\n');
        throw new Error(`配置校验失败：\n${issues}`);
    }
    if (!overrides) {
        cached = parsed.data;
    }
    return parsed.data;
}
/**
 * 重置缓存（测试用）
 */
function resetConfig() {
    cached = null;
}
//# sourceMappingURL=index.js.map