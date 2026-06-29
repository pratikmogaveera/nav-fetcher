import { Queue, Worker } from "bullmq";

const connection = { host: "localhost", port: 6379 };
const QUEUE_NAME = "nav-fetch";
const ts = () => new Date().toLocaleTimeString();

const queue = new Queue(QUEUE_NAME, { connection });
await queue.obliterate({ force: true });

const worker = new Worker(
  QUEUE_NAME,
  async (job) => {
    console.log(`[${ts()}] Processing: ${job.name} | data: ${JSON.stringify(job.data)}`);
  },
  { connection },
);

await worker.waitUntilReady();
console.log(`[${ts()}] Ready.\n`);

// Interval-based scheduler: every 5 seconds
queue.upsertJobScheduler(
  "interval-scheduler",
  { every: 5000 },
  { name: "interval-job", data: { source: "interval" } },
);

// Cron-based scheduler: every 10 seconds
queue.upsertJobScheduler(
  "cron-scheduler",
  { pattern: "*/10 * * * * *" },
  { name: "cron-job", data: { source: "cron" } },
);

// List schedulers after 12s, then remove and confirm
await new Promise<void>((r) =>
  setTimeout(async () => {
    const schedulers = await queue.getJobSchedulers(0, 10, true);
    console.log("\nActive schedulers:", schedulers.map((s) => s.key));

    await queue.removeJobScheduler("interval-scheduler");
    await queue.removeJobScheduler("cron-scheduler");

    const remaining = await queue.getJobSchedulers(0, 10, true);
    console.log("After removal:", remaining);
    r();
  }, 12000),
);
