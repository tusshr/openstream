import { openapi as openApiPlugin } from "@elysiajs/openapi";

export const openapi = openApiPlugin({
  documentation: {
    info: {
      title: "OpenStream API",
      description:
        "OpenStream backend API for authentication, user data, and file storage.",
      version: "1.0.0",
    },
    tags: [
      { name: "System", description: "Service-level endpoints" },
      { name: "Users", description: "Authenticated user endpoints" },
      {
        name: "Storage",
        description: "Presigned upload/download URLs and file management",
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
  exclude: {
    // paths: [/^\/api\/auth\//],
  },
  scalar: {
    hideClientButton: false,
    showSidebar: false,
    showDeveloperTools: "localhost",
    showToolbar: "never",
    operationTitleSource: "summary",
    theme: "default",
    persistAuth: false,
    telemetry: true,
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
    title: "API #1",
  },
});
