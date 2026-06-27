import { Job, Queue, RedisConnection, Worker, type QueueOptions } from "bullmq";

const PORT = 6379;
const connection: QueueOptions = {
  connection: {
    host: "localhost",
    port: PORT,
  },
};

const myQueue = new Queue("nav-fetch", connection);

const myWorker = new Worker(
  "nav-fetch",
  async (job: Job) => {
    console.log(`Processing job: ${job.name}: ${JSON.stringify(job.data)}`);
  },
  connection,
);

myQueue.add(
  "test-job",
  {
    fundCode: "119551",
    fundName: "Motilal Oswal Midcap",
  },
  { delay: 5000 },
);
