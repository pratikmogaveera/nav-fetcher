import { Job, Queue, Worker } from "bullmq";

const connection = { host: "localhost", port: 6379 };
const QUEUE_NAME = "nav-fetch";
const ts = () => new Date().toLocaleTimeString();

const queue = new Queue(QUEUE_NAME, { connection });
await queue.obliterate({ force: true });

const worker = new Worker(
  QUEUE_NAME,
  async (job: Job) => {
    console.log(`[${ts()}] Processing: ${job.name}`);
    // await new Promise((r) => setTimeout(r, 1000));
  },
  { connection, concurrency: 5, limiter: { max: 3, duration: 1000 } },
);

await worker.waitUntilReady();
console.log(`[${ts()}] Ready.`);

for (let i = 1; i < 21; i++) {
  queue.add(`job-${i.toString().padStart(2, "0")}`, {});
}
