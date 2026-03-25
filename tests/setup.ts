import { mock } from "bun:test";

// Tests must not touch real Redis. Without this mock the auth macro would
// retry its connection 10x against a placeholder URL, blowing the suite to
// 10+ seconds and turning 401-ish flows into 500s. The mock implements just
// the surface the app actually uses; new methods are added on demand.
const store = new Map<string, string>();
// TTLs are stored as absolute expiry-ms. The rate-limit plugin uses TTL only
// for the Retry-After hint, so simulated time is fine — no real timers run.
const ttls = new Map<string, number>();

function purgeIfExpired(key: string): void {
  const expiry = ttls.get(key);
  if (expiry !== undefined && expiry <= Date.now()) {
    store.delete(key);
    ttls.delete(key);
  }
}

// Exposed so tests can reset the shared mock state between cases.
export function __resetRedisMock(): void {
  store.clear();
  ttls.clear();
}

mock.module("@/lib/redis", () => ({
  redis: {
    get: async (key: string) => {
      purgeIfExpired(key);
      return store.get(key) ?? null;
    },
    set: async (key: string, value: string) => {
      store.set(key, value);
      ttls.delete(key);
      return "OK";
    },
    del: async (key: string) => {
      const had = store.has(key);
      store.delete(key);
      ttls.delete(key);
      return had ? 1 : 0;
    },
    send: async (command: string, args: string[] = []) => {
      const upper = command.toUpperCase();
      const [first, second] = args;

      if (upper === "PING") return "PONG";
      if (upper === "SET" && first !== undefined && second !== undefined) {
        const opts = args.slice(2).map((a) => String(a).toUpperCase());
        if (opts.includes("NX")) {
          purgeIfExpired(first);
          if (store.has(first)) return null; // NX: key exists → no-op
        }
        store.set(first, second);
        ttls.delete(first);
        const exIdx = opts.indexOf("EX");
        if (exIdx >= 0 && opts[exIdx + 1] !== undefined) {
          const seconds = Number(opts[exIdx + 1]);
          if (Number.isFinite(seconds)) {
            ttls.set(first, Date.now() + seconds * 1_000);
          }
        }
        return "OK";
      }
      if (upper === "GET" && first !== undefined) {
        purgeIfExpired(first);
        return store.get(first) ?? null;
      }
      if (upper === "DEL" && first !== undefined) {
        const had = store.has(first);
        store.delete(first);
        ttls.delete(first);
        return had ? 1 : 0;
      }
      if (upper === "INCR" && first !== undefined) {
        purgeIfExpired(first);
        const current = Number(store.get(first) ?? "0");
        const next = current + 1;
        store.set(first, String(next));
        return next;
      }
      if (upper === "EXPIRE" && first !== undefined && second !== undefined) {
        if (!store.has(first)) return 0;
        ttls.set(first, Date.now() + Number(second) * 1_000);
        return 1;
      }
      if (upper === "TTL" && first !== undefined) {
        if (!store.has(first)) return -2;
        const expiry = ttls.get(first);
        if (expiry === undefined) return -1;
        return Math.max(0, Math.floor((expiry - Date.now()) / 1_000));
      }
      return null;
    },
  },
}));
