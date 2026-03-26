import { openapi as openApiPlugin } from "@elysiajs/openapi";
import { Elysia } from "elysia";

import { env } from "@/env";
import { problem } from "@/lib/response";
import { getSession } from "@/lib/session";

const DOCS_PATH_PREFIXES = ["/openapi", "/scalar", "/api-1"] as const;

function looksLikeDocsRequest(pathname: string): boolean {
  return DOCS_PATH_PREFIXES.some(
    (prefix) => pathname === prefix || pathname.startsWith(`${prefix}/`),
  );
}

function parseCookie(headers: Headers, name: string): string | null {
  const raw = headers.get("cookie") ?? "";
  for (const part of raw.split(";")) {
    const eq = part.indexOf("=");
    if (eq < 0) continue;
    if (part.slice(0, eq).trim() === name) return part.slice(eq + 1).trim();
  }
  return null;
}

const docsPlugin = openApiPlugin({
  documentation: {
    info: {
      title: "OpenStream API",
      description:
        "REST API for the OpenStream LMS platform. Covers authentication, user profiles, course catalog, chapter and lesson management, enrollments, progress tracking, reviews, certificates, orders, and file storage.",
      version: "1.0.0",
    },
    tags: [
      {
        name: "System",
        description: "Service-level health and meta endpoints",
      },
      {
        name: "Auth",
        description:
          "Authentication — sign-up, sign-in, session, 2FA, password reset",
      },
      { name: "Users", description: "Authenticated user profile" },
      { name: "Educators", description: "Educator profile management" },
      {
        name: "Courses",
        description: "Course catalog — create, publish, search",
      },
      { name: "Categories", description: "Course category taxonomy" },
      { name: "Tags", description: "Course tag management" },
      {
        name: "Chapters",
        description: "Course chapter ordering and management",
      },
      { name: "Lessons", description: "Lesson content and attachments" },
      { name: "Enrollments", description: "Student enrollment lifecycle" },
      { name: "Progress", description: "Per-lesson watch progress tracking" },
      { name: "Reviews", description: "Course ratings and reviews" },
      {
        name: "Certificates",
        description: "Completion certificates and verification",
      },
      { name: "Orders", description: "Purchase and payment management" },
      {
        name: "Storage",
        description: "Presigned S3 upload/download URLs and file management",
      },
    ],
    components: {
      securitySchemes: {
        sessionCookie: {
          type: "apiKey",
          in: "cookie",
          name: "session_token",
          description: "Session cookie set after sign-in.",
        },
        csrfHeader: {
          type: "apiKey",
          in: "header",
          name: "x-requested-with",
          description:
            "Required on all state-changing requests (POST/PUT/PATCH/DELETE). Value must be exactly **openstream**. Add this in Scalar's Authentication panel once and it will be sent with every request.",
        },
      },
    },
  },
  scalar: {
    hideClientButton: false,
    showSidebar: true,
    showDeveloperTools: "localhost",
    showToolbar: "never",
    operationTitleSource: "summary",
    theme: "default",
    persistAuth: false,
    telemetry: false,
    layout: "classic",
    isEditable: false,
    isLoading: false,
    hideModels: false,
    documentDownloadType: "both",
    hideTestRequestButton: false,
    hideSearch: false,
    showOperationId: false,
    hideDarkModeToggle: false,
    withDefaultFonts: true,
    defaultOpenFirstTag: true,
    defaultOpenAllTags: false,
    expandAllModelSections: false,
    expandAllResponses: false,
    orderSchemaPropertiesBy: "alpha",
    orderRequiredPropertiesFirst: true,
    _integration: "elysiajs",
    defaultHttpClient: {
      targetKey: "javascript",
      clientKey: "fetch",
    },
    default: false,
    slug: "api-1",
    title: "OpenStream API",
  },
});

export const openapi = new Elysia({ name: "openapi-docs" })
  .onRequest(async ({ request }) => {
    if (env.NODE_ENV !== "production") return;

    const url = new URL(request.url);
    if (!looksLikeDocsRequest(url.pathname)) return;

    const token = parseCookie(request.headers, "session_token");
    const session = token ? await getSession(token).catch(() => null) : null;

    if (!session || session.user.role !== "admin") {
      return problem({
        status: 404,
        code: "NOT_FOUND",
        detail: "Not found",
        instance: url.pathname,
      });
    }
  })
  .use(docsPlugin);
