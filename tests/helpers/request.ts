import { app } from "@/app";

export type ApiResponse<T = unknown> = {
  readonly status: number;
  readonly headers: Headers;
  readonly body: T;
};

// Sends a Request through the in-process Elysia app and returns a structured
// response. JSON content is auto-parsed; everything else falls back to text.
// Tests call this once per assertion to avoid juggling Response semantics.
export async function callApp<T = unknown>(
  path: string,
  init: RequestInit = {},
): Promise<ApiResponse<T>> {
  const url = path.startsWith("http") ? path : `http://localhost${path}`;
  const response = await app.handle(new Request(url, init));
  const contentType = response.headers.get("content-type") ?? "";
  const body = contentType.includes("application/json")
    ? ((await response.json()) as T)
    : ((await response.text()) as unknown as T);

  return {
    status: response.status,
    headers: response.headers,
    body,
  };
}

export function getJson<T = unknown>(
  path: string,
  init: Omit<RequestInit, "method" | "body"> = {},
): Promise<ApiResponse<T>> {
  return callApp<T>(path, { ...init, method: "GET" });
}

export function postJson<T = unknown>(
  path: string,
  body: unknown,
  init: Omit<RequestInit, "method" | "body"> = {},
): Promise<ApiResponse<T>> {
  const headers = new Headers(init.headers);
  if (!headers.has("content-type")) {
    headers.set("content-type", "application/json");
  }
  return callApp<T>(path, {
    ...init,
    method: "POST",
    headers,
    body: JSON.stringify(body),
  });
}
