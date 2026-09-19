import { Injectable, OnModuleDestroy, OnModuleInit, Logger } from '@nestjs/common';
import { ConfigService } from '@nestjs/config';
import IORedis, { Redis } from 'ioredis';

/**
 * Redis wrapper: quote cache, pub/sub fan-out, and simple NX locks.
 * Redis is never the source of truth for money — Postgres is.
 * If Redis is unavailable we degrade gracefully (in-process fallback) so the
 * platform still boots in a bare dev environment.
 */
@Injectable()
export class RedisService implements OnModuleInit, OnModuleDestroy {
  private readonly logger = new Logger(RedisService.name);
  private _pub!: Redis;
  private _sub!: Redis;
  private _client!: Redis;
  available = false;
  private _warned = false;

  constructor(private readonly config: ConfigService) {}

  onModuleInit() {
    const url = this.config.get<string>('redis.url')!;
    const opts = { lazyConnect: false, maxRetriesPerRequest: 2, retryStrategy: (t: number) => Math.min(t * 200, 3000) };
    this._client = new IORedis(url, opts);
    this._pub = new IORedis(url, opts);
    this._sub = new IORedis(url, opts);
    for (const [name, c] of [['client', this._client], ['pub', this._pub], ['sub', this._sub]] as const) {
      c.on('ready', () => {
        this.available = true;
        this._warned = false;
        this.logger.log(`Redis ${name} ready`);
      });
      // Warn once when Redis becomes unreachable, then stay quiet until it recovers,
      // so a Redis-less dev run does not spam the log.
      c.on('error', (e) => {
        if (!this._warned) {
          this._warned = true;
          this.logger.warn(`Redis unavailable — running in degraded mode (fan-out/cache off): ${e.message || 'connection refused'}`);
        }
      });
      c.on('end', () => (this.available = false));
    }
  }

  get client(): Redis {
    return this._client;
  }

  async publish(channel: string, payload: unknown): Promise<void> {
    if (!this.available) return;
    try {
      await this._pub.publish(channel, JSON.stringify(payload));
    } catch {
      /* ignore in degraded mode */
    }
  }

  subscribe(pattern: string, handler: (channel: string, message: any) => void): void {
    if (!this._sub) return;
    this._sub.psubscribe(pattern).catch(() => undefined);
    this._sub.on('pmessage', (_pat, channel, message) => {
      try {
        handler(channel, JSON.parse(message));
      } catch {
        /* ignore malformed */
      }
    });
  }

  async cacheSet(key: string, value: unknown, ttlSec?: number): Promise<void> {
    if (!this.available) return;
    try {
      const v = JSON.stringify(value);
      if (ttlSec) await this._client.set(key, v, 'EX', ttlSec);
      else await this._client.set(key, v);
    } catch {
      /* ignore */
    }
  }

  async cacheGet<T>(key: string): Promise<T | null> {
    if (!this.available) return null;
    try {
      const v = await this._client.get(key);
      return v ? (JSON.parse(v) as T) : null;
    } catch {
      return null;
    }
  }

  /** Simple distributed lock. Returns true if acquired. */
  async acquireLock(key: string, ttlMs = 3000): Promise<boolean> {
    if (!this.available) return true; // single-process dev: allow
    try {
      const res = await this._client.set(key, '1', 'PX', ttlMs, 'NX');
      return res === 'OK';
    } catch {
      return true;
    }
  }

  async releaseLock(key: string): Promise<void> {
    if (!this.available) return;
    try {
      await this._client.del(key);
    } catch {
      /* ignore */
    }
  }

  async onModuleDestroy() {
    await Promise.allSettled([this._client?.quit(), this._pub?.quit(), this._sub?.quit()]);
  }
}
