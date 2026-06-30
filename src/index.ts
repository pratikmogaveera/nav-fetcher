import { Job, Queue, QueueEvents, Worker } from "bullmq";

const connection = { host: "localhost", port: 6379 };
const QUEUE_NAME = "nav-fetch";

const FUND_CODES: Record<"code", number>[] = [
  { code: 12345 },
  { code: 32187 },
  { code: 47289 },
  { code: 68497 },
  { code: 23593 },
];

// Structured progress type for type-safe progress reporting
interface JobProgress {
  completed: number;
  total: number;
  current: number;
}

const ts = () => new Date().toLocaleTimeString();

const queue = new Queue(QUEUE_NAME, { connection });
await queue.obliterate({ force: true });

// Worker: processes jobs and reports structured progress
const worker = new Worker(
  QUEUE_NAME,
  async (job: Job<typeof FUND_CODES>) => {
    for (const [index, data] of job.data.entries()) {
      await new Promise((r) => setTimeout(r, 1000));
      job.updateProgress({
        completed: index + 1,
        total: job.data.length,
        current: data.code,
      });
    }
    return { success: true, fetched: job.data.length };
  },
  { connection },
);

// QueueEvents: real-time lifecycle observer via Redis pub/sub
const queueEvents = new QueueEvents(QUEUE_NAME, { connection });

queueEvents.on("progress", ({ jobId, data }) => {
  const progress = data as JobProgress;
  const pct = Math.round((progress.completed / progress.total) * 100);
  console.log(
    `[${ts()}] [Progress] Job:${jobId} — ${pct}% (${progress.completed}/${progress.total}) | current: ${progress.current}`,
  );
});

queueEvents.on("completed", ({ jobId, returnvalue }) => {
  console.log(`[${ts()}] [Completed] Job:${jobId}`, returnvalue);
});

await worker.waitUntilReady();
await queueEvents.waitUntilReady();

queue.add("nav-fetch", FUND_CODES);
