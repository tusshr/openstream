import { t, type TSchema } from "elysia";

import {
  collectionOf,
  responseOf,
  type FieldError,
  type PaginationLinks,
  type PaginationMeta,
  type ProblemDetails,
} from "@/lib/api/models";

export function ok<T>(data: T): { data: T } {
  return { data };
}

export function dataOf<T extends TSchema>(schema: T) {
  return t.Object({ data: schema });
}

export function okWithMeta<T>(
  data: T,
  meta: PaginationMeta,
  links?: PaginationLinks,
): { data: T; meta: PaginationMeta; links?: PaginationLinks } {
  return links === undefined ? { data, meta } : { data, meta, links };
}

const STATUS_TITLES: Record<number, string> = {
  400: "Bad Request",
  401: "Unauthorized",
  403: "Forbidden",
  404: "Not Found",
  409: "Conflict",
  415: "Unsupported Media Type",
  422: "Unprocessable Content",
  429: "Too Many Requests",
  500: "Internal Server Error",
  503: "Service Unavailable",
};

export function problem(opts: {
  status: number;
  code: string;
  detail: string;
  instance?: string;
  errors?: FieldError[];
  extensions?: Record<string, unknown>;
  headers?: Record<string, string>;
}): Response {
  const { status, code, detail, instance, errors, extensions, headers } = opts;
  const body: ProblemDetails & Record<string, unknown> = {
    type: "about:blank",
    title: STATUS_TITLES[status] ?? "Error",
    status,
    detail,
    code,
    ...(instance ? { instance } : {}),
    ...(errors?.length ? { errors } : {}),
    ...extensions,
  };
  return new Response(JSON.stringify(body), {
    status,
    headers: { "content-type": "application/problem+json", ...headers },
  });
}

// Throw from any handler/resolve/hook to short-circuit with an RFC 9457 error.
// The central onError formats it via problem(), so call sites stay free of
// Response plumbing (and dodge Elysia's typed-handler return-union friction).
export class HttpProblem extends Error {
  readonly errors?: FieldError[] | undefined;
  readonly extensions?: Record<string, unknown> | undefined;
  readonly headers?: Record<string, string> | undefined;
  constructor(
    readonly status: number,
    readonly code: string,
    readonly detail: string,
    options?: {
      errors?: FieldError[];
      extensions?: Record<string, unknown>;
      headers?: Record<string, string>;
    },
  ) {
    super(detail);
    this.name = "HttpProblem";
    this.errors = options?.errors;
    this.extensions = options?.extensions;
    this.headers = options?.headers;
  }
}

export { responseOf, collectionOf };
