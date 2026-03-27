import IORedis, { type Redis as RedisClient } from 'ioredis';

let redisClient: RedisClient | null = null;

export function getRedis(): RedisClient {
  if (redisClient) return redisClient;

  const url = process.env.REDIS_URL || 'redis://localhost:6379';
  const RedisCtor = IORedis as unknown as new (
    redisUrl: string,
    options: {
      lazyConnect: boolean;
      maxRetriesPerRequest: number;
      retryStrategy: (times: number) => number;
    },
  ) => RedisClient;

  redisClient = new RedisCtor(url, {
    lazyConnect: true,
    maxRetriesPerRequest: 3,
    retryStrategy: (times: number) => Math.min(times * 200, 5000),
  });

  redisClient!.on('connect', () => {
    console.log('[redis] connected');
  });

  redisClient!.on('error', (error: Error) => {
    console.error('[redis]', error.message);
  });

  return redisClient!;
}
