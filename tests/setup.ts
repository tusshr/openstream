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
      const [first, second] = args;

      if (upper === "PING") return "PONG";
      if (upper === "SET" && first !== undefined && second !== undefined) {
        store.set(first, second);
        return "OK";
      }
      if (upper === "GET" && first !== undefined) {
        return store.get(first) ?? null;
      }
      if (upper === "DEL" && first !== undefined) {
        const had = store.has(first);
        store.delete(first);
        return had ? 1 : 0;
      }
      return null;
    },
  },
}));
