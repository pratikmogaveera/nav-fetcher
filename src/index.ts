import { Queue, QueueEvents, Worker } from "bullmq";

const connection = { host: "localhost", port: 6379 };
const QUEUE_NAME = "nav-fetch";
const QUEUE_ATTEMPTS = 3;
const ts = () => new Date().toLocaleTimeString();

const queue = new Queue(QUEUE_NAME, { connection });
const dlQueue = new Queue("dlqueue", { connection });

await queue.obliterate({ force: true });
await dlQueue.obliterate({ force: true });

const queueEvents = new QueueEvents("dlqueue", { connection });

const worker = new Worker(
  QUEUE_NAME,
  async () => {
    throw new Error("Network timeout.");
  },
  { connection },
);

worker.on("failed", (job, error) => {
  console.log(
    `[${ts()}] [Failed] [${job?.id}]: ${error.message} - ${job?.attemptsMade}`,
  );
});

worker.on("error", (failedReason) => {
  console.log(`[${ts()}] [Error] - ${failedReason}`);
});

queueEvents.on("added", (job) => {
  console.log(
    `[${ts()}] [DLQueue] - [${job.jobId}] ${job.name} - Added to dlqueue.`,
  );
});

await worker.waitUntilReady();
await queueEvents.waitUntilReady();
console.log(`[${ts()}] Ready.\n`);

queue.add(
  "Large Cap",
  { fundName: "Motilal Oswal Large Cap" },
  {
    attempts: QUEUE_ATTEMPTS,
    backoff: { type: "fixed", delay: 1000 },
    priority: 1,
    removeOnComplete: true,
  },
);

await new Promise((resolve) => setTimeout(resolve, 5000));
const failedJobs = await queue.getFailed();
failedJobs.forEach((item) => {
  console.log(
    `Failed Job: [${item.queueName}: ${item.name}] - ${item.failedReason} - ${item.attemptsMade}`,
  );

  if (item.attemptsMade >= (item.opts.attempts || QUEUE_ATTEMPTS))
    dlQueue.add(item.name, {
      data: item.data,
      originalJobId: item.id,
      attemptsMade: item.attemptsMade,
      failedReason: item.failedReason,
    });
});
