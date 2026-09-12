process.env.NODE_ENV = 'test';
process.env.LOG_LEVEL = 'silent';
process.env.MESSAGE_BUS = 'memory';

jest.setTimeout(10000);