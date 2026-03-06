import { Queue, Worker } from "bullmq";

import { logger } from "@/lib/logger";
import { QUEUE_CONNECTION } from "@/lib/queue";

import {
  ECHO_JOB_NAME,
  type EchoPayload,
  type EchoResult,
  parseEchoPayload,
  processEcho,
} from "./echo";

// Single shared queue for now. Multiple queues are useful when jobs have
// very different rate-limit / priority needs; once that emerges, split per
// concern (e.g. queue.email, queue.export, queue.transcode).
const QUEUE_NAME = "openstream";

let queueInstance: Queue | null = null;
let workerInstance: Worker | null = null;

// Lazy because constructing a Queue eagerly would connect on every import,
// including from tests and from the api entry where the queue may never
// actually be used yet.
function getQueue(): Queue {
  if (!queueInstance) {
    queueInstance = new Queue(QUEUE_NAME, {
      connection: QUEUE_CONNECTION,
      defaultJobOptions: {
        // Sane defaults; jobs can override per-enqueue.
        attempts: 3,
        backoff: { type: "exponential", delay: 1_000 },
        removeOnComplete: { age: 24 * 3_600, count: 1_000 },
        removeOnFail: { age: 7 * 24 * 3_600 },
      },
    });
  }
  return queueInstance;
}

// Typed producer for the echo job. New jobs get their own `enqueueXxx`
// function so the call sites stay statically typed end-to-end.
export async function enqueueEcho(payload: EchoPayload): Promise<void> {
  await getQueue().add(ECHO_JOB_NAME, payload);
}

// Called from src/worker.ts at boot. Wires every job name to its processor.
// Returns the Worker instance so the shutdown handler can await its close().
export function startWorker(): Worker {
  if (workerInstance) return workerInstance;

  workerInstance = new Worker(
    QUEUE_NAME,
    async (job) => {
      switch (job.name) {
        case ECHO_JOB_NAME: {
          const payload = parseEchoPayload(job.data);
          return processEcho(payload) satisfies EchoResult;
        }
        default:
          throw new Error(`Unknown job name: ${job.name}`);
      }
    },
    {
      connection: QUEUE_CONNECTION,
      // Conservative concurrency for the placeholder echo job. Tune per-job
      // when real workloads exist (videos low, emails high).
      concurrency: 4,
    },
  );

  workerInstance.on("ready", () => logger.info("worker: ready"));
  workerInstance.on("failed", (job, err) => {
    logger.error(
      { jobId: job?.id, jobName: job?.name, err },
      "worker: job failed",
    );
  });
  workerInstance.on("error", (err) => {
    logger.error({ err }, "worker: error");
  });

  return workerInstance;
}

// Exposed for the shutdown helper; never call from request handlers.
export function getActiveQueue(): Queue | null {
  return queueInstance;
}

export function getActiveWorker(): Worker | null {
  return workerInstance;
}
