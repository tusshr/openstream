import { cors } from "@elysiajs/cors";
import { Elysia } from "elysia";

import { env } from "@/env";
import { authPlugin } from "@/modules/auth";
import { storage } from "@/modules/storage";

const app = new Elysia()
  .use(
    cors({
      origin: env.ALLOWED_ORIGIN ?? "http://localhost:3000",
      methods: ["GET", "POST", "PUT", "DELETE", "OPTIONS"],
      credentials: true, // required for better-auth session cookies
      allowedHeaders: ["Content-Type", "Authorization"],
    }),
  )
  .get("/", () => "OpenStream")
  .onError(({ code, error }) => {
    // Always log the real error internally — never expose it to the client
    console.error(`[${new Date().toISOString()}] [${code}]`, error);

    switch (code) {
      case "NOT_FOUND":
        return Response.json({ error: "Not found" }, { status: 404 });
      case "VALIDATION":
        return Response.json({ error: "Validation failed" }, { status: 422 });
      case "PARSE":
        return Response.json(
          { error: "Invalid request body" },
          { status: 400 },
        );
    }

    // Unknown errors (DB failures, unhandled exceptions) — never leak internals
    return Response.json({ error: "Internal server error" }, { status: 500 });
  })
  .use(authPlugin) // mounts better-auth at /api/auth/**
  .group("/api", (app) =>
    app
      .use(storage) // /api/storage/**
      // example protected route
      .get("/me", ({ user }) => user, { auth: true }),
  )
  .listen(env.PORT ? Number(env.PORT) : 8080);

console.log(
  `🦊 Elysia is running at ${app.server?.hostname}:${app.server?.port}`,
);
