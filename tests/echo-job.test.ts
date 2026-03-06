import { describe, expect, test } from "bun:test";

import {
  ECHO_JOB_NAME,
  parseEchoPayload,
  processEcho,
} from "@/modules/jobs/echo";

describe("processEcho", () => {
  test("returns the input message and a timestamp", () => {
    const result = processEcho({ message: "hello" });
    expect(result.echoed).toBe("hello");
    expect(new Date(result.receivedAt).toString()).not.toBe("Invalid Date");
  });

  test("treats different inputs as different results", () => {
    const a = processEcho({ message: "alpha" });
    const b = processEcho({ message: "beta" });
    expect(a.echoed).not.toBe(b.echoed);
  });
});

describe("parseEchoPayload", () => {
  test("accepts a well-formed payload", () => {
    const payload = parseEchoPayload({ message: "ok" });
    expect(payload.message).toBe("ok");
  });

  test("rejects a payload missing 'message'", () => {
    expect(() => parseEchoPayload({})).toThrow(/Invalid echo job payload/);
  });

  test("rejects a payload with an empty 'message'", () => {
    expect(() => parseEchoPayload({ message: "" })).toThrow(
      /Invalid echo job payload/,
    );
  });

  test("rejects a payload with a non-string 'message'", () => {
    expect(() => parseEchoPayload({ message: 42 })).toThrow(
      /Invalid echo job payload/,
    );
  });
});

describe("ECHO_JOB_NAME", () => {
  test("is a stable identifier", () => {
    expect(ECHO_JOB_NAME).toBe("echo");
  });
});
