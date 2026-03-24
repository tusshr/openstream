import { describe, expect, test } from "bun:test";

import { buildAuditRow, extractIp, extractUserAgent } from "@/lib/audit";

function requestWith(headers: Record<string, string>): Request {
  return new Request("http://localhost/anywhere", { headers });
}

describe("extractIp", () => {
  test("reads the first IP from X-Forwarded-For", () => {
    const r = requestWith({ "x-forwarded-for": "203.0.113.1, 10.0.0.1" });
    expect(extractIp(r)).toBe("203.0.113.1");
  });

  test("trims whitespace around the IP", () => {
    const r = requestWith({ "x-forwarded-for": "   203.0.113.1  " });
    expect(extractIp(r)).toBe("203.0.113.1");
  });

  test("falls back to X-Real-IP when XFF is absent", () => {
    const r = requestWith({ "x-real-ip": "198.51.100.5" });
    expect(extractIp(r)).toBe("198.51.100.5");
  });

  test("returns null when no IP headers are set", () => {
    expect(extractIp(requestWith({}))).toBeNull();
  });

  test("returns null when X-Forwarded-For is empty string", () => {
    expect(extractIp(requestWith({ "x-forwarded-for": "" }))).toBeNull();
  });
});

describe("extractIp with trusted proxy hops", () => {
  test("hops=1 returns the rightmost entry — the IP our proxy actually saw", () => {
    const r = requestWith({ "x-forwarded-for": "1.2.3.4, 203.0.113.9" });
    expect(extractIp(r, 1)).toBe("203.0.113.9");
  });

  test("hops=2 returns the second-from-right entry", () => {
    const r = requestWith({
      "x-forwarded-for": "1.2.3.4, 203.0.113.9, 10.0.0.1",
    });
    expect(extractIp(r, 2)).toBe("203.0.113.9");
  });

  test("a spoofed leading XFF entry is ignored when hops=1", () => {
    // Attacker prepends a fake IP; our proxy appends the real socket IP.
    const r = requestWith({ "x-forwarded-for": "9.9.9.9, 203.0.113.9" });
    expect(extractIp(r, 1)).toBe("203.0.113.9");
  });

  test("returns null when there are fewer entries than trusted hops", () => {
    const r = requestWith({ "x-forwarded-for": "203.0.113.9" });
    expect(extractIp(r, 2)).toBeNull();
  });

  test("hops=0 (default) keeps the leftmost value", () => {
    const r = requestWith({ "x-forwarded-for": "1.2.3.4, 203.0.113.9" });
    expect(extractIp(r, 0)).toBe("1.2.3.4");
  });
});

describe("extractUserAgent", () => {
  test("reads the User-Agent header", () => {
    const r = requestWith({ "user-agent": "Mozilla/5.0 ..." });
    expect(extractUserAgent(r)).toBe("Mozilla/5.0 ...");
  });

  test("returns null when absent", () => {
    expect(extractUserAgent(requestWith({}))).toBeNull();
  });
});

describe("buildAuditRow", () => {
  test("builds the canonical row shape with explicit fields", () => {
    const row = buildAuditRow({
      actorId: "user-123",
      action: "storage.file.delete",
      resourceType: "storage.object",
      resourceId: "users/user-123/document/uuid/file.pdf",
      ip: "203.0.113.1",
      userAgent: "Mozilla/5.0",
      metadata: { reason: "user request" },
    });

    expect(row).toEqual({
      actorId: "user-123",
      action: "storage.file.delete",
      resourceType: "storage.object",
      resourceId: "users/user-123/document/uuid/file.pdf",
      ip: "203.0.113.1",
      userAgent: "Mozilla/5.0",
      metadata: { reason: "user request" },
    });
  });

  test("extracts ip and user-agent from request when explicit fields absent", () => {
    const request = requestWith({
      "x-forwarded-for": "203.0.113.1",
      "user-agent": "tester/1.0",
    });
    const row = buildAuditRow({
      request,
      action: "user.sign-in",
      resourceType: "session",
      resourceId: "session-abc",
    });
    expect(row.ip).toBe("203.0.113.1");
    expect(row.userAgent).toBe("tester/1.0");
  });

  test("explicit ip/userAgent override the request headers", () => {
    const request = requestWith({
      "x-forwarded-for": "203.0.113.1",
      "user-agent": "tester/1.0",
    });
    const row = buildAuditRow({
      request,
      ip: "10.0.0.5",
      userAgent: "override/2.0",
      action: "user.sign-in",
      resourceType: "session",
      resourceId: "session-abc",
    });
    expect(row.ip).toBe("10.0.0.5");
    expect(row.userAgent).toBe("override/2.0");
  });

  test("anonymous actor → actorId null", () => {
    const row = buildAuditRow({
      action: "user.failed-sign-in",
      resourceType: "user",
      resourceId: "unknown@example.com",
    });
    expect(row.actorId).toBeNull();
  });

  test("metadata defaults to null when not provided", () => {
    const row = buildAuditRow({
      actorId: "user-1",
      action: "user.sign-in",
      resourceType: "session",
      resourceId: "session-1",
    });
    expect(row.metadata).toBeNull();
  });

  test("explicit null ip/userAgent are preserved (not auto-extracted)", () => {
    const request = requestWith({ "x-forwarded-for": "203.0.113.1" });
    const row = buildAuditRow({
      request,
      ip: null,
      userAgent: null,
      action: "system.cron",
      resourceType: "system",
      resourceId: "scheduled-cleanup",
    });
    expect(row.ip).toBeNull();
    expect(row.userAgent).toBeNull();
  });
});
