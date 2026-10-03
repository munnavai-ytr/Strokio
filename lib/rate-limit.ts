import { Redis } from '@upstash/redis';
import { Ratelimit } from '@upstash/ratelimit';

export interface RateLimitResult {
  success: boolean;
  remaining: number;
  resetAt: number; // Unix timestamp in ms
}

export interface RateLimiter {
  check(identifier: string, limit?: number, windowMs?: number): Promise<RateLimitResult>;
  checkDaily(identifier: string, limit?: number): Promise<RateLimitResult>;
}

// In-Memory Implementation
interface InMemoryRecord {
  count: number;
  resetAt: number;
}

class InMemoryRateLimiter implements RateLimiter {
  private cache = new Map<string, InMemoryRecord>();

  async check(
    identifier: string,
    limit = 30,
    windowMs = 60000
  ): Promise<RateLimitResult> {
    const now = Date.now();
    const existing = this.cache.get(identifier);

    if (!existing || now > existing.resetAt) {
      const resetAt = now + windowMs;
      this.cache.set(identifier, { count: 1, resetAt });
      return {
        success: true,
        remaining: limit - 1,
        resetAt,
      };
    }

    if (existing.count >= limit) {
      return {
        success: false,
        remaining: 0,
        resetAt: existing.resetAt,
      };
    }

    existing.count += 1;
    return {
      success: true,
      remaining: limit - existing.count,
      resetAt: existing.resetAt,
    };
  }

  async checkDaily(identifier: string, limit = 3): Promise<RateLimitResult> {
    const now = new Date();
    // Midnight UTC reset
    const tomorrow = new Date(Date.UTC(now.getUTCFullYear(), now.getUTCMonth(), now.getUTCDate() + 1));
    const resetAt = tomorrow.getTime();
    const key = `daily:${identifier}:${now.toISOString().slice(0, 10)}`;

    const existing = this.cache.get(key);
    if (!existing || now.getTime() > existing.resetAt) {
      this.cache.set(key, { count: 1, resetAt });
      return {
        success: true,
        remaining: limit - 1,
        resetAt,
      };
    }

    if (existing.count >= limit) {
      return {
        success: false,
        remaining: 0,
        resetAt: existing.resetAt,
      };
    }

    existing.count += 1;
    return {
      success: true,
      remaining: limit - existing.count,
      resetAt: existing.resetAt,
    };
  }
}

// Upstash Implementation
class UpstashRateLimiter implements RateLimiter {
  private redis: Redis;

  constructor(url: string, token: string) {
    this.redis = new Redis({ url, token });
  }

  async check(
    identifier: string,
    limit = 30,
    windowMs = 60000
  ): Promise<RateLimitResult> {
    const windowSec = Math.max(Math.ceil(windowMs / 1000), 1);
    const ratelimit = new Ratelimit({
      redis: this.redis,
      limiter: Ratelimit.slidingWindow(limit, `${windowSec} s`),
      prefix: 'rl:win',
    });

    const result = await ratelimit.limit(identifier);
    return {
      success: result.success,
      remaining: result.remaining,
      resetAt: result.reset,
    };
  }

  async checkDaily(identifier: string, limit = 3): Promise<RateLimitResult> {
    const now = new Date();
    const dateStr = now.toISOString().slice(0, 10);
    const key = `rl:daily:${identifier}:${dateStr}`;

    const count = await this.redis.incr(key);
    if (count === 1) {
      // Expire at midnight UTC (next day)
      const tomorrow = new Date(Date.UTC(now.getUTCFullYear(), now.getUTCMonth(), now.getUTCDate() + 1));
      const ttlSec = Math.max(Math.ceil((tomorrow.getTime() - now.getTime()) / 1000), 60);
      await this.redis.expire(key, ttlSec);
    }

    const tomorrow = new Date(Date.UTC(now.getUTCFullYear(), now.getUTCMonth(), now.getUTCDate() + 1));
    const resetAt = tomorrow.getTime();

    if (count > limit) {
      return {
        success: false,
        remaining: 0,
        resetAt,
      };
    }

    return {
      success: true,
      remaining: Math.max(limit - count, 0),
      resetAt,
    };
  }
}

// Initialize active limiter
const upstashUrl = process.env.UPSTASH_REDIS_REST_URL;
const upstashToken = process.env.UPSTASH_REDIS_REST_TOKEN;

const activeLimiter: RateLimiter =
  upstashUrl && upstashToken && !upstashUrl.includes('your-redis')
    ? new UpstashRateLimiter(upstashUrl, upstashToken)
    : new InMemoryRateLimiter();

export const rateLimiter = activeLimiter;
export const globalRateLimiter = activeLimiter;
export const uploadRateLimiter = activeLimiter;

// Helper specific limiters
const rawDailyLimit = parseInt(process.env.DAILY_LESSON_LIMIT || '3', 10);
export const DAILY_LIMIT = isNaN(rawDailyLimit) || rawDailyLimit <= 0 ? 3 : rawDailyLimit;

export async function checkLessonCreationLimit(userId: string) {
  // 1. Minute burst limit: 5 / min / user
  const minuteCheck = await rateLimiter.check(`create:${userId}`, 5, 60000);
  if (!minuteCheck.success) {
    return {
      allowed: false,
      reason: 'BURST_LIMIT',
      message: 'Too many requests in a minute. Please slow down.',
      remaining: 0,
      resetAt: minuteCheck.resetAt,
    };
  }

  // 2. Daily UTC quota: DAILY_LESSON_LIMIT / day / user
  const dailyCheck = await rateLimiter.checkDaily(userId, DAILY_LIMIT);
  if (!dailyCheck.success) {
    return {
      allowed: false,
      reason: 'DAILY_LIMIT',
      message: `Daily lesson limit of ${DAILY_LIMIT} reached. Resets at midnight UTC.`,
      remaining: 0,
      resetAt: dailyCheck.resetAt,
    };
  }

  return {
    allowed: true,
    remaining: dailyCheck.remaining,
    resetAt: dailyCheck.resetAt,
  };
}

export async function checkNarrationLimit(userId: string) {
  // 30 / min / user
  return await rateLimiter.check(`tts:${userId}`, 30, 60000);
}

export async function checkFeedbackLimit(userId: string) {
  // 10 / hour / user (3600000 ms)
  return await rateLimiter.check(`feedback:${userId}`, 10, 3600000);
}

export async function checkPublicRouteLimit(ip: string) {
  // 60 / min / IP
  return await rateLimiter.check(`ip:${ip}`, 60, 60000);
}

// Global Concurrency Guard: max 4 lessons processing concurrently
class ConcurrencyGuard {
  private activeCount = 0;
  private maxConcurrent = 4;

  async acquire(): Promise<{ allowed: boolean; release: () => void }> {
    if (this.activeCount >= this.maxConcurrent) {
      return {
        allowed: false,
        release: () => {},
      };
    }
    this.activeCount++;
    let released = false;
    return {
      allowed: true,
      release: () => {
        if (!released) {
          released = true;
          this.activeCount = Math.max(0, this.activeCount - 1);
        }
      },
    };
  }

  getActiveCount() {
    return this.activeCount;
  }
}

export const globalConcurrencyGuard = new ConcurrencyGuard();
