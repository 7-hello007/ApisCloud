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
  },

  setupFilesAfterEnv: ['<rootDir>/tests/setup.js'],

  collectCoverageFrom: [
    'core/**/*.{ts,js}',
    'shared/**/*.{ts,js}',
    '!**/node_modules/**',
    '!**/dist/**',
  ],
  coverageDirectory: 'coverage',
  clearMocks: true,
};