/**
 * Phase 10 — best-effort, PER-PROCESS in-memory rate limiter.
 *
 * NOT a distributed limiter: on Vercel serverless, each cold instance gets
 * its own counters (a burst of traffic that lands on 5 different warm
 * instances gets 5x the effective limit), and counters reset on every cold
 * start. This is a deliberate, approved tradeoff for this project's
 * current scale (a single college's exam-day traffic) — it raises the bar
 * against casual scripted abuse of the public seat-lookup endpoint without
 * adding an external dependency (Upstash/Redis) or a database table+
 * migration. If this project's traffic ever grows past what a single
 * instance's memory can reasonably track, or genuine multi-instance
 * accuracy is required, swap this module for a distributed limiter — the
 * call site (the route handler) doesn't need to change, only this file.
 *
 * Pure and independently testable: `now` is an explicit parameter rather
 * than reading the clock internally, so tests don't need real timers.
 */

export interface RateLimitResult {
  allowed: boolean;
  remaining: number;
  /** Seconds until the caller may retry — 0 when allowed. */
  retryAfterSeconds: number;
}

export interface RateLimiterOptions {
  /** Max requests allowed per window, per key. */
  limit: number;
  /** Window length in milliseconds. */
  windowMs: number;
}

interface WindowState {
  count: number;
  windowStart: number;
}

export class InMemoryRateLimiter {
  private readonly hits = new Map<string, WindowState>();

  constructor(private readonly options: RateLimiterOptions) {}

  check(key: string, now: number = Date.now()): RateLimitResult {
    const existing = this.hits.get(key);

    if (!existing || now - existing.windowStart >= this.options.windowMs) {
      this.hits.set(key, { count: 1, windowStart: now });
      return { allowed: true, remaining: this.options.limit - 1, retryAfterSeconds: 0 };
    }

    if (existing.count >= this.options.limit) {
      const retryAfterMs = this.options.windowMs - (now - existing.windowStart);
      return { allowed: false, remaining: 0, retryAfterSeconds: Math.max(1, Math.ceil(retryAfterMs / 1000)) };
    }

    existing.count += 1;
    return { allowed: true, remaining: this.options.limit - existing.count, retryAfterSeconds: 0 };
  }
}

/** Best-effort caller IP from standard proxy headers (Vercel sets
 * x-forwarded-for). Falls back to a shared "unknown" bucket — degrades to
 * one shared limit for all such callers rather than throwing. */
export function getClientIp(request: Request): string {
  const forwardedFor = request.headers.get("x-forwarded-for");
  if (forwardedFor) {
    const first = forwardedFor.split(",")[0]?.trim();
    if (first) return first;
  }
  const realIp = request.headers.get("x-real-ip");
  if (realIp) return realIp.trim();
  return "unknown";
}
