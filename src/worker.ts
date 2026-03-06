import { Elysia } from "elysia";

import { env } from "@/env";
import { logger } from "@/lib/logger";
import {
  type Closeable,
  httpServer,
  registerGracefulShutdown,
} from "@/lib/shutdown";
import { health } from "@/modules/health";
import { startWorker } from "@/modules/jobs";
import { requestLogger } from "@/plugins/logger";

// Minimal HTTP surface for the worker. Only /livez and /readyz so the PaaS
// (Coolify / Dokku) can probe liveness and readiness. No business routes —
// the worker is a queue consumer, not an HTTP server.
const workerApp = new Elysia().use(requestLogger).use(health);

const port = env.PORT ? Number(env.PORT) : 8081;
workerApp.listen(port);

const bullWorker = startWorker();

// Tell shutdown helper how to drain the BullMQ Worker. Worker.close() stops
// pulling new jobs and waits for the in-flight ones to finish.
const workerCloseable: Closeable = {
  name: "bullmq worker",
  close: async () => {
    await bullWorker.close();
  },
};

// Shutdown order: stop the HTTP probe server first (so the orchestrator
// stops sending traffic), then drain the queue worker, then the helper
// closes redis + db.
registerGracefulShutdown([
  httpServer(workerApp.server ?? null),
  workerCloseable,
]);

logger.info(
  {
    hostname: workerApp.server?.hostname,
    port: workerApp.server?.port,
    env: env.NODE_ENV,
  },
  "openstream worker started",
);
