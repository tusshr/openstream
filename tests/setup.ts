import { mock } from "bun:test";

// Tests must not touch real Redis. Without this mock the auth macro would
// retry its connection 10x against a placeholder URL, blowing the suite to
// 10+ seconds and turning 401-ish flows into 500s. The mock implements just
// the surface the app actually uses; new methods are added on demand.
const store = new Map<string, string>();

mock.module("@/lib/redis", () => ({
  redis: {
    get: async (key: string) => store.get(key) ?? null,
    set: async (key: string, value: string) => {
      store.set(key, value);
      return "OK";
    },
    del: async (key: string) => {
      const had = store.has(key);
      store.delete(key);
      return had ? 1 : 0;
    },
    send: async (command: string, args: string[] = []) => {
      const upper = command.toUpperCase();
      if (upper === "PING") return "PONG";
      if (upper === "SET" && args.length >= 2) {
        store.set(args[0], args[1]);
        return "OK";
      }
      if (upper === "GET" && args.length >= 1) {
        return store.get(args[0]) ?? null;
      }
      if (upper === "DEL" && args.length >= 1) {
        const had = store.has(args[0]);
        store.delete(args[0]);
        return had ? 1 : 0;
      }
      return null;
    },
  },
}));
