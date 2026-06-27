import { Job, Queue, QueueEvents, Worker } from "bullmq";

const connection = { host: "localhost", port: 6379 };
const QUEUE_NAME = "nav-fetch";
const ts = () => new Date().toLocaleTimeString();

const queue = new Queue(QUEUE_NAME, { connection });
await queue.obliterate({ force: true });

const worker = new Worker(
  QUEUE_NAME,
  async (job: Job) => {
    console.log(`[${ts()}] Processing: ${job.name} ${JSON.stringify(job.data)}`);
    if (Math.random() < 0.7) throw new Error("Random failure");
  },
  { connection },
);

const queueEvents = new QueueEvents(QUEUE_NAME, { connection });

queueEvents.on("waiting", ({ jobId, prev }) => {
  console.log(`[${ts()}] [${jobId}] waiting (prev: ${prev})`);
});

queueEvents.on("active", ({ jobId }) => {
  console.log(`[${ts()}] [${jobId}] active`);
});

queueEvents.on("completed", ({ jobId }) => {
  console.log(`[${ts()}] [${jobId}] completed`);
});

queueEvents.on("failed", ({ jobId, failedReason }) => {
  console.log(`[${ts()}] [${jobId}] failed: ${failedReason}`);
});

await queueEvents.waitUntilReady();
await worker.waitUntilReady();
console.log(`[${ts()}] Ready.\n`);

queue.add(
  "Large Cap",
  { fundName: "Motilal Oswal Large Cap" },
  {
    attempts: 3,
    backoff: { type: "exponential", delay: 1000 },
    priority: 1,
    removeOnComplete: true,
  },
);
