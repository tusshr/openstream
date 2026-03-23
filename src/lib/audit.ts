import { db } from "@/db";
import { auditLog } from "@/db/schema";
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

export function extractIp(request: Request): string | null {
  const xff = request.headers.get("x-forwarded-for");
  if (xff) {
    const first = xff.split(",")[0]?.trim();
    if (first) return first;
  }
  return request.headers.get("x-real-ip");
}

export function extractUserAgent(request: Request): string | null {
  return request.headers.get("user-agent");
}

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

// Fails open: if the DB insert fails we log but don't crash the caller.
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
