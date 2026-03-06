import { app } from "@/app";
import { env } from "@/env";
import { logger } from "@/lib/logger";
import { registerGracefulShutdown } from "@/lib/shutdown";

const port = env.PORT ? Number(env.PORT) : 8080;

app.listen(port);

registerGracefulShutdown(app.server ?? null);

logger.info(
  {
    hostname: app.server?.hostname,
    port: app.server?.port,
    env: env.NODE_ENV,
  },
  "openstream api listening",
);
