import { describe, it, expect } from "vitest";
import { InMemoryRateLimiter, getClientIp } from "./rate-limit";

describe("InMemoryRateLimiter", () => {
  it("allows requests up to the limit", () => {
    const limiter = new InMemoryRateLimiter({ limit: 3, windowMs: 60_000 });
    const now = 1_000_000;
    expect(limiter.check("ip-1", now).allowed).toBe(true);
    expect(limiter.check("ip-1", now).allowed).toBe(true);
    expect(limiter.check("ip-1", now).allowed).toBe(true);
  });

  it("blocks the request that exceeds the limit", () => {
    const limiter = new InMemoryRateLimiter({ limit: 3, windowMs: 60_000 });
    const now = 1_000_000;
    limiter.check("ip-1", now);
    limiter.check("ip-1", now);
    limiter.check("ip-1", now);
    const fourth = limiter.check("ip-1", now);
    expect(fourth.allowed).toBe(false);
    expect(fourth.remaining).toBe(0);
    expect(fourth.retryAfterSeconds).toBeGreaterThan(0);
  });

  it("reports decreasing remaining count while under the limit", () => {
    const limiter = new InMemoryRateLimiter({ limit: 5, windowMs: 60_000 });
    const now = 1_000_000;
    expect(limiter.check("ip-1", now).remaining).toBe(4);
    expect(limiter.check("ip-1", now).remaining).toBe(3);
  });

  it("resets the count once the window has elapsed", () => {
    const limiter = new InMemoryRateLimiter({ limit: 2, windowMs: 1000 });
    const start = 1_000_000;
    limiter.check("ip-1", start);
    limiter.check("ip-1", start);
    expect(limiter.check("ip-1", start).allowed).toBe(false);

    // Window has fully elapsed — should allow again.
    const afterWindow = start + 1000;
    expect(limiter.check("ip-1", afterWindow).allowed).toBe(true);
  });

  it("tracks separate keys independently", () => {
    const limiter = new InMemoryRateLimiter({ limit: 1, windowMs: 60_000 });
    const now = 1_000_000;
    expect(limiter.check("ip-1", now).allowed).toBe(true);
    expect(limiter.check("ip-2", now).allowed).toBe(true);
    expect(limiter.check("ip-1", now).allowed).toBe(false);
  });

  it("retryAfterSeconds shrinks as the window progresses", () => {
    const limiter = new InMemoryRateLimiter({ limit: 1, windowMs: 10_000 });
    const start = 1_000_000;
    limiter.check("ip-1", start);
    const blockedEarly = limiter.check("ip-1", start + 1000);
    const blockedLate = limiter.check("ip-1", start + 9000);
    expect(blockedEarly.retryAfterSeconds).toBeGreaterThan(blockedLate.retryAfterSeconds);
  });
});

describe("getClientIp", () => {
  it("reads the first address from x-forwarded-for", () => {
    const request = new Request("http://localhost/", { headers: { "x-forwarded-for": "1.2.3.4, 5.6.7.8" } });
    expect(getClientIp(request)).toBe("1.2.3.4");
  });

  it("falls back to x-real-ip when x-forwarded-for is absent", () => {
    const request = new Request("http://localhost/", { headers: { "x-real-ip": "9.8.7.6" } });
    expect(getClientIp(request)).toBe("9.8.7.6");
  });

  it("falls back to 'unknown' when neither header is present", () => {
    const request = new Request("http://localhost/");
    expect(getClientIp(request)).toBe("unknown");
  });
});
