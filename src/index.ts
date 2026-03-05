import { app } from "@/app";
import { env } from "@/env";

const port = env.PORT ? Number(env.PORT) : 8080;

app.listen(port);

console.log(
  `🦊 Elysia is running at ${app.server?.hostname}:${app.server?.port}`,
);
