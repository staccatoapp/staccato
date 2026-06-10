import { describe, expect, it } from "vitest";
import { createRateLimitGate, parseRetryAfterMs } from "./rate-limit.js";

describe("createRateLimitGate", () => {
  it("starts clear (no wait)", () => {
    const gate = createRateLimitGate();
    expect(gate.waitMs(1000)).toBe(0);
  });

  it("applies the base backoff on the first hit", () => {
    const gate = createRateLimitGate({ baseBackoffMs: 1000 });
    const applied = gate.noteLimited({}, 0);
    expect(applied).toBe(1000);
    expect(gate.waitMs(0)).toBe(1000);
    expect(gate.waitMs(600)).toBe(400);
    expect(gate.waitMs(1000)).toBe(0);
  });

  it("grows the backoff exponentially per consecutive hit", () => {
    const gate = createRateLimitGate({ baseBackoffMs: 1000, factor: 2 });
    expect(gate.noteLimited({}, 0)).toBe(1000); // base * 2^0
    expect(gate.noteLimited({}, 0)).toBe(2000); // base * 2^1
    expect(gate.noteLimited({}, 0)).toBe(4000); // base * 2^2
  });

  it("caps the exponential growth at maxBackoffMs", () => {
    const gate = createRateLimitGate({
      baseBackoffMs: 1000,
      factor: 10,
      maxBackoffMs: 5000,
    });
    expect(gate.noteLimited({}, 0)).toBe(1000);
    expect(gate.noteLimited({}, 0)).toBe(5000); // 10000 capped to 5000
    expect(gate.noteLimited({}, 0)).toBe(5000);
  });

  it("honours an explicit Retry-After over the exponential value", () => {
    const gate = createRateLimitGate({ baseBackoffMs: 1000 });
    expect(gate.noteLimited({ retryAfterMs: 30_000 }, 0)).toBe(30_000);
    expect(gate.waitMs(0)).toBe(30_000);
  });

  it("resets the streak on a successful request", () => {
    const gate = createRateLimitGate({ baseBackoffMs: 1000, factor: 2 });
    gate.noteLimited({}, 0); // 1000
    gate.noteLimited({}, 0); // 2000
    gate.noteSuccess();
    expect(gate.noteLimited({}, 0)).toBe(1000); // back to base
  });

  it("never shortens an existing cooldown window", () => {
    const gate = createRateLimitGate({ baseBackoffMs: 5000 });
    gate.noteLimited({}, 1000); // pausedUntil = 6000
    gate.noteSuccess();
    gate.noteLimited({ retryAfterMs: 100 }, 1000); // would be 1100 -> ignored
    expect(gate.waitMs(1000)).toBe(5000);
  });

  it("isolates state between instances", () => {
    const a = createRateLimitGate({ baseBackoffMs: 1000 });
    const b = createRateLimitGate({ baseBackoffMs: 1000 });
    a.noteLimited({}, 0);
    expect(a.waitMs(0)).toBe(1000);
    expect(b.waitMs(0)).toBe(0);
  });
});

describe("parseRetryAfterMs", () => {
  it("returns null for a missing header", () => {
    expect(parseRetryAfterMs(null)).toBeNull();
  });

  it("parses delta-seconds", () => {
    expect(parseRetryAfterMs("30")).toBe(30_000);
  });

  it("parses an HTTP-date relative to now", () => {
    const now = Date.parse("2026-01-01T00:00:00Z");
    expect(parseRetryAfterMs("Thu, 01 Jan 2026 00:00:10 GMT", now)).toBe(
      10_000,
    );
  });

  it("clamps a past HTTP-date to 0", () => {
    const now = Date.parse("2026-01-01T00:00:20Z");
    expect(parseRetryAfterMs("Thu, 01 Jan 2026 00:00:10 GMT", now)).toBe(0);
  });

  it("returns null for an unparseable value", () => {
    expect(parseRetryAfterMs("not-a-date")).toBeNull();
  });
});
