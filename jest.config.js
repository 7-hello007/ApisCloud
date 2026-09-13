/** @type {import('jest').Config} */
module.exports = {
  preset: 'ts-jest',
  testEnvironment: 'node',

  roots: ['<rootDir>/tests'],
  testMatch: ['**/*.test.ts'],

  moduleFileExtensions: ['ts', 'tsx', 'js', 'json'],

  transform: {
    '^.+\\.tsx?$': [
      'ts-jest',
      {
        tsconfig: '<rootDir>/tsconfig.base.json',
        diagnostics: {
          ignoreCodes: ['TS151001'],
        },
      },
    ],
  },

  moduleNameMapper: {
    '^@apiscloud/libs$': '<rootDir>/core/libs/src',
    '^@apiscloud/libs/(.*)$': '<rootDir>/core/libs/src/$1',
    '^@apiscloud/message-bus$': '<rootDir>/shared/message-bus',
    '^@apiscloud/message-bus/(.*)$': '<rootDir>/shared/message-bus/$1',
    '^@apiscloud/contracts$': '<rootDir>/shared/contracts',
    '^@apiscloud/contracts/(.*)$': '<rootDir>/shared/contracts/$1',
    '^@apiscloud/types$': '<rootDir>/shared/types',
    '^@apiscloud/types/(.*)$': '<rootDir>/shared/types/$1',
    '^@apiscloud/layer-config$': '<rootDir>/shared/layer-config',
    '^@apiscloud/layer-config/(.*)$': '<rootDir>/shared/layer-config/$1',
    '^@apiscloud/plugin-host$': '<rootDir>/core/plugin-host/src',
    '^@apiscloud/plugin-host/(.*)$': '<rootDir>/core/plugin-host/src/$1',
    '^@apiscloud/observability$': '<rootDir>/core/services/observability/src',
    '^@apiscloud/observability/(.*)$': '<rootDir>/core/services/observability/src/$1',
    '^@apiscloud/simulator$': '<rootDir>/core/services/simulator/src',
    '^@apiscloud/simulator/(.*)$': '<rootDir>/core/services/simulator/src/$1',
    '^@apiscloud/ingest$': '<rootDir>/core/services/ingest/src',
    '^@apiscloud/ingest/(.*)$': '<rootDir>/core/services/ingest/src/$1',
    '^@apiscloud/data-writer$': '<rootDir>/core/services/data-writer/src',
    '^@apiscloud/data-writer/(.*)$': '<rootDir>/core/services/data-writer/src/$1',
    '^@apiscloud/dispatch-core$': '<rootDir>/core/services/dispatch-core/src',
    '^@apiscloud/dispatch-core/(.*)$': '<rootDir>/core/services/dispatch-core/src/$1',
  },

  setupFilesAfterEnv: ['<rootDir>/tests/setup.js'],

  collectCoverageFrom: [
    'core/libs/src/**/*.ts',
    'core/plugin-host/src/**/*.ts',
    'core/services/observability/src/**/*.ts',
    'core/services/simulator/src/**/*.ts',
    'core/services/ingest/src/**/*.ts',
    'core/services/data-writer/src/**/*.ts',
    'core/services/dispatch-core/src/**/*.ts',
    'shared/message-bus/**/*.ts',
    'shared/layer-config/**/*.ts',
    '!**/*.d.ts',
    '!**/index.ts',
    '!**/types.ts',
    '!**/node_modules/**',
    '!**/dist/**',
  ],

  coverageDirectory: 'coverage',
  coverageReporters: ['text', 'text-summary', 'lcov', 'html'],

  coverageThreshold: {
    global: {
      lines: 60,
      functions: 60,
      branches: 50,
      statements: 60,
    },
  },

  coveragePathIgnorePatterns: [
    '/node_modules/',
    '/dist/',
    '/coverage/',
    '\\.d\\.ts$',
  ],

  clearMocks: true,
  restoreMocks: true,
  verbose: false,

  // 忽略集成和端到端测试，默认只跑单元
  testPathIgnorePatterns: ['/node_modules/', '/dist/'],
};
