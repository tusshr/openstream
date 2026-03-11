import { describe, expect, it } from "bun:test";

import { generateId } from "@/lib/id";

const EPOCH = 1735689600000n;
const WORKER_BITS = 10n;
const SEQUENCE_BITS = 12n;

function decode(id: string) {
  const n = BigInt(id);
  const ts = n >> (WORKER_BITS + SEQUENCE_BITS);
  const worker = (n >> SEQUENCE_BITS) & ((1n << WORKER_BITS) - 1n);
  const seq = n & ((1n << SEQUENCE_BITS) - 1n);
  return {
    timestampMs: Number(ts + EPOCH),
    worker: Number(worker),
    seq: Number(seq),
  };
}

describe("generateId", () => {
  it("returns a string of digits only", () => {
    expect(generateId()).toMatch(/^\d+$/);
  });

  it("two back-to-back calls produce different increasing values", () => {
    const a = generateId();
    const b = generateId();
    expect(a).not.toBe(b);
    expect(BigInt(b) > BigInt(a)).toBe(true);
  });

  it("1000 rapid calls produce 1000 unique IDs", () => {
    const ids = Array.from({ length: 1000 }, generateId);
    expect(new Set(ids).size).toBe(1000);
  });

  it("IDs are monotonically non-decreasing over 1000 calls", () => {
    const ids = Array.from({ length: 1000 }, generateId).map(BigInt);
    for (let i = 1; i < ids.length; i++) {
      expect(ids[i]! >= ids[i - 1]!).toBe(true);
    }
  });

  it("decoded timestamp is within ±1 second of Date.now()", () => {
    const before = Date.now();
    const id = generateId();
    const after = Date.now();
    const { timestampMs } = decode(id);
    expect(timestampMs).toBeGreaterThanOrEqual(before - 1000);
    expect(timestampMs).toBeLessThanOrEqual(after + 1000);
  });

  it("worker ID decodes to 0 when WORKER_ID env is unset", () => {
    const { worker } = decode(generateId());
    expect(worker).toBe(0);
  });
});
