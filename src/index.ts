import { app } from "@/app";
import { env } from "@/env";
import { logger } from "@/lib/logger";
import { httpServer, registerGracefulShutdown } from "@/lib/shutdown";

process.on("unhandledRejection", (reason) => {
  logger.fatal({ err: reason }, "unhandled rejection");
});

const port = env.PORT ? Number(env.PORT) : 8080;

app.listen(port);

registerGracefulShutdown([httpServer(app.server ?? null)]);

logger.info(
  {
    hostname: app.server?.hostname,
    port: app.server?.port,
    env: env.NODE_ENV,
  },
  "openstream api listening",
);
