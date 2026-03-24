const EPOCH = 1735689600000n; // 2025-01-01T00:00:00.000Z
const WORKER_BITS = 10n;
const SEQUENCE_BITS = 12n;
const MAX_SEQUENCE = (1n << SEQUENCE_BITS) - 1n;

// Must be DISTINCT per process — the API uses 0, the worker must set
// WORKER_ID=1 (see env.ts / package.json). Two processes sharing a worker id
// can mint identical Snowflakes. Read straight from process.env (not @/env) so
// this module stays usable in standalone scripts like the seed without
// triggering full env validation. Falls back to 0 on a non-numeric value.
const rawWorkerId = Number(process.env.WORKER_ID ?? 0);
const workerId = BigInt(
  Number.isFinite(rawWorkerId) ? Math.max(0, Math.min(1023, rawWorkerId)) : 0,
);

let sequence = 0n;
let lastTimestamp = -1n;

export function generateId(): string {
  let ts = BigInt(Date.now()) - EPOCH;

  if (ts === lastTimestamp) {
    sequence = (sequence + 1n) & MAX_SEQUENCE;
    if (sequence === 0n) {
      // Sequence saturated — busy-wait to next millisecond.
      while (ts <= lastTimestamp) ts = BigInt(Date.now()) - EPOCH;
    }
  } else {
    sequence = 0n;
  }

  lastTimestamp = ts;

  return (
    (ts << (WORKER_BITS + SEQUENCE_BITS)) |
    (workerId << SEQUENCE_BITS) |
    sequence
  ).toString();
}
