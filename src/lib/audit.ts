import { db } from "@/database";
import { auditLog } from "@/database/schema";
import { logger } from "@/lib/logger";

export type AuditParams = {
  readonly action: string;
  readonly resourceType: string;
  readonly resourceId: string;
  readonly actorId?: string | null;
  readonly request?: Request;
  readonly ip?: string | null;
  readonly userAgent?: string | null;
  readonly metadata?: Record<string, unknown>;
};

export type AuditRow = {
  readonly actorId: string | null;
  readonly action: string;
  readonly resourceType: string;
  readonly resourceId: string;
  readonly ip: string | null;
  readonly userAgent: string | null;
  readonly metadata: Record<string, unknown> | null;
};

// First non-empty X-Forwarded-For value, then X-Real-IP. Real client IP from
// a Bun-served Request isn't directly readable, so we trust headers set by
// the reverse proxy / PaaS. The deploy must therefore strip / canonicalize
// X-Forwarded-For at the edge so a malicious client can't spoof.
export function extractIp(request: Request): string | null {
  const xff = request.headers.get("x-forwarded-for");
  if (xff) {
    const first = xff.split(",")[0]?.trim();
    if (first) return first;
  }
  const real = request.headers.get("x-real-ip");
  if (real) return real;
  return null;
}

export function extractUserAgent(request: Request): string | null {
  return request.headers.get("user-agent");
}

// Builders for the audit-emitting auth hooks. They live here, not in
// `src/lib/auth.ts`, so the path-filter on session.delete is unit-testable
// without standing up better-auth + the DB.

// better-auth's session.delete fires from many places: an explicit sign-out
// POST, admin revoke, and the cascade triggered by
// `revokeSessionsOnPasswordReset: true`. We only want to audit user-initiated
// sign-outs; everything else gets its own audit entry from its own hook.
// `null` means "do not audit this delete".
export function buildSignOutAuditParams(
  session: { readonly id: string; readonly userId: string },
  context:
    | {
        readonly path?: string | undefined;
        readonly request?: Request | undefined;
      }
    | null
    | undefined,
): AuditParams | null {
  if (context?.path !== "/sign-out") return null;
  return {
    ...(context.request ? { request: context.request } : {}),
    actorId: session.userId,
    action: "user.sign-out",
    resourceType: "session",
    resourceId: session.id,
  };
}

// Pairs with `emailAndPassword.onPasswordReset`. The hook only fires on a
// successful reset, so no filtering is needed here.
export function buildPasswordResetAuditParams(
  user: { readonly id: string },
  request: Request | undefined,
): AuditParams {
  return {
    ...(request ? { request } : {}),
    actorId: user.id,
    action: "user.password-reset",
    resourceType: "user",
    resourceId: user.id,
  };
}

// Pure builder. Tests cover this; the db.insert path is a thin wrapper.
export function buildAuditRow(params: AuditParams): AuditRow {
  const ip =
    params.ip !== undefined
      ? params.ip
      : params.request
        ? extractIp(params.request)
        : null;
  const userAgent =
    params.userAgent !== undefined
      ? params.userAgent
      : params.request
        ? extractUserAgent(params.request)
        : null;

  return {
    actorId: params.actorId ?? null,
    action: params.action,
    resourceType: params.resourceType,
    resourceId: params.resourceId,
    ip,
    userAgent,
    metadata: params.metadata ?? null,
  };
}

// Async — awaited by callers so audit happens before the response. If the
// insert fails (DB down, schema drift), we don't fail the caller; we emit a
// structured error log instead, so the audit trail is at least preserved in
// the log aggregator. This is a deliberate compliance-vs-availability
// trade-off: an LMS staying up matters more than every audit row hitting
// the table, but we always want a paper trail somewhere.
export async function audit(params: AuditParams): Promise<void> {
  const row = buildAuditRow(params);
  try {
    await db.insert(auditLog).values(row);
  } catch (error) {
    logger.error(
      { err: error, audit: row },
      "audit: db insert failed; falling back to log-only trail",
    );
  }
}
