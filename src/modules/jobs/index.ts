import { Queue, Worker } from "bullmq";

import { logger } from "@/lib/logger";
import { QUEUE_CONNECTION } from "@/lib/queue";

import {
  ECHO_JOB_NAME,
  parseEchoPayload,
  processEcho,
  type EchoPayload,
  type EchoResult,
} from "./echo";
import {
  EMAIL_JOB_NAME,
  parseEmailPayload,
  processEmail,
  type EmailPayload,
} from "./email";

const QUEUE_NAME = "openstream";

let queueInstance: Queue | null = null;
let workerInstance: Worker | null = null;

function getQueue(): Queue {
  if (!queueInstance) {
    queueInstance = new Queue(QUEUE_NAME, {
      connection: QUEUE_CONNECTION,
      defaultJobOptions: {
        attempts: 3,
        backoff: { type: "exponential", delay: 1_000 },
        removeOnComplete: { age: 24 * 3_600, count: 1_000 },
        removeOnFail: { age: 7 * 24 * 3_600 },
      },
    });
  }
  return queueInstance;
}

export async function enqueueEcho(payload: EchoPayload): Promise<void> {
  await getQueue().add(ECHO_JOB_NAME, payload);
}

export async function enqueueEmail(payload: EmailPayload): Promise<void> {
  await getQueue().add(EMAIL_JOB_NAME, payload);
}

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
        case EMAIL_JOB_NAME: {
          const payload = parseEmailPayload(job.data);
          return await processEmail(payload);
        }
        default:
          throw new Error(`Unknown job name: ${job.name}`);
      }
    },
    { connection: QUEUE_CONNECTION, concurrency: 4 },
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

export function getActiveQueue(): Queue | null {
  return queueInstance;
}

export function getActiveWorker(): Worker | null {
  return workerInstance;
}
