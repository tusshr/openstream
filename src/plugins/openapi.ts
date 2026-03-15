import { openapi as openApiPlugin } from "@elysiajs/openapi";
import { Elysia, status } from "elysia";

import { env } from "@/env";
import { auth } from "@/lib/auth";

const DOCS_PATH_PREFIXES = ["/openapi", "/scalar", "/api-1"] as const;

function looksLikeDocsRequest(pathname: string): boolean {
  return DOCS_PATH_PREFIXES.some(
    (prefix) => pathname === prefix || pathname.startsWith(`${prefix}/`),
  );
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
          name: "better-auth.session_token",
          description: "Better Auth session cookie",
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

// In production we don't want anonymous reconnaissance of the API. The docs
// are still served, but only to authenticated admins. Non-admins (including
// anonymous callers) get 404, which is intentional: 403 would confirm the path
// exists. In development, the wrapper is a no-op pass-through.
export const openapi = new Elysia({ name: "openapi-docs" })
  .onRequest(async ({ request }) => {
    if (env.NODE_ENV !== "production") return;

    const url = new URL(request.url);
    if (!looksLikeDocsRequest(url.pathname)) return;

    const session = await auth.api
      .getSession({ headers: request.headers })
      .catch(() => null);

    if (!session || session.user.role !== "admin") {
      return status(404, { error: "Not Found" });
    }
  })
  .use(docsPlugin);
