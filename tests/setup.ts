import { vi } from 'vitest';
import Redis from 'ioredis-mock';

// Mock ioredis with ioredis-mock before any imports
vi.mock('ioredis', () => {
  const MockRedis = Redis;
  return { default: MockRedis };
});
