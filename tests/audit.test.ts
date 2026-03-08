import { describe, expect, test } from "bun:test";

import {
  buildAuditRow,
  buildPasswordResetAuditParams,
  buildSignOutAuditParams,
  extractIp,
  extractUserAgent,
} from "@/lib/audit";

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

describe("buildSignOutAuditParams", () => {
  const session = { id: "session-1", userId: "user-1" };

  test("emits an audit when context.path is '/sign-out'", () => {
    const request = requestWith({ "x-forwarded-for": "203.0.113.1" });
    const params = buildSignOutAuditParams(session, {
      path: "/sign-out",
      request,
    });
    expect(params).toEqual({
      request,
      actorId: "user-1",
      action: "user.sign-out",
      resourceType: "session",
      resourceId: "session-1",
    });
  });

  test("returns null for non-sign-out delete paths (e.g. admin revoke)", () => {
    expect(
      buildSignOutAuditParams(session, { path: "/admin/revoke-session" }),
    ).toBeNull();
  });

  test("returns null when context is null", () => {
    expect(buildSignOutAuditParams(session, null)).toBeNull();
  });

  test("returns null when context is undefined", () => {
    expect(buildSignOutAuditParams(session, undefined)).toBeNull();
  });

  test("omits request key when the hook context has no request", () => {
    const params = buildSignOutAuditParams(session, { path: "/sign-out" });
    expect(params).not.toBeNull();
    expect(params).not.toHaveProperty("request");
  });
});

describe("buildPasswordResetAuditParams", () => {
  const user = { id: "user-1" };

  test("emits an audit with the request when provided", () => {
    const request = requestWith({ "x-forwarded-for": "203.0.113.1" });
    expect(buildPasswordResetAuditParams(user, request)).toEqual({
      request,
      actorId: "user-1",
      action: "user.password-reset",
      resourceType: "user",
      resourceId: "user-1",
    });
  });

  test("omits the request key when no request is supplied", () => {
    const params = buildPasswordResetAuditParams(user, undefined);
    expect(params).not.toHaveProperty("request");
    expect(params.actorId).toBe("user-1");
    expect(params.action).toBe("user.password-reset");
  });
});
