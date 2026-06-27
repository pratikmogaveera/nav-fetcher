# NAV Fetcher Queue — Plan

Learn job queue fundamentals with Redis + BullMQ by building a NAV fetching system. Foundation for Uptime Monitor and MF Dashboard scheduler.

---

## 1. Project Setup

**Goal:** Get a working Node.js + TypeScript + Redis + BullMQ environment.

**Tasks:**
- Initialize Node.js project with TypeScript
- Install dependencies: `bullmq`, `ioredis`, `bull-board` (with express adapter)
- Start Redis via Docker (`redis:7-alpine` on port 6379)
- Create a basic connection test — connect to Redis, confirm it works
- Set up `tsconfig.json` and dev scripts (`tsx` for running)

**Key Concepts:**
- BullMQ uses `ioredis` under the hood for Redis communication
- Queue, Worker, and QueueScheduler are separate concerns
- Redis is the persistence + communication backbone (no data in Node memory)

**Done when:** `npm run dev` connects to Redis and logs "Connected to Redis" without errors.

---

## 2. Basic Queue + Worker

**Goal:** Understand the core producer-consumer pattern — add a job to a queue, have a worker pick it up and process it.

**Tasks:**
- Create a `Queue` instance with a name (e.g., `nav-fetch`)
- Create a `Worker` that listens on the same queue name
- Add a job with `queue.add(name, data)` — data = `{ fundCode: "119551", fundName: "Motilal Oswal Midcap" }`
- Worker receives the job, logs the data, marks complete
- Observe: job goes from `waiting` → `active` → `completed`

**Key Concepts:**
- `Queue` = where jobs are pushed (producer side)
- `Worker` = where jobs are consumed (consumer side)
- Jobs are JSON-serializable objects stored in Redis
- A queue name is just a Redis key prefix — no explicit creation needed
- Workers poll Redis (configurable interval) for new jobs

**Done when:** You can add a job from one file/process and see it processed by the worker with the job data logged.

---

## 3. Job Options — Delay, Priority, Attempts, Backoff

**Goal:** Control how and when jobs execute using job-level options.

**Tasks:**
- Add a delayed job: `queue.add(name, data, { delay: 5000 })` — observe it waits 5s before processing
- Add jobs with priorities: `{ priority: 1 }` (lower = higher priority) — observe ordering
- Set `attempts: 3` on a job — intentionally throw in the worker to see retries
- Configure backoff: `{ backoff: { type: 'exponential', delay: 1000 } }` — observe increasing delays between retries
- Try `{ backoff: { type: 'fixed', delay: 2000 } }` for comparison
- Add `removeOnComplete: true` and `removeOnFail: 50` to control Redis memory

**Key Concepts:**
- Delayed jobs sit in a "delayed" set until their timestamp arrives
- Priority is a sorted set score — lower number = higher priority
- Attempts = total tries (1 attempt = no retry). Each failure decrements remaining attempts
- Backoff strategies: `fixed` (same delay each time), `exponential` (delay doubles), or custom function
- `removeOnComplete` / `removeOnFail` prevent Redis from growing unbounded

**Done when:** You can demonstrate a job that fails twice, backs off exponentially, then succeeds on the 3rd attempt.

---

## 4. Retries & Error Handling

**Goal:** Understand what happens when jobs fail — lifecycle, events, and dead letter patterns.

**Tasks:**
- Create a worker that randomly fails (simulate network errors)
- Listen to `worker.on('failed', (job, err) => ...)` — log which attempt failed and why
- Listen to `worker.on('error', err => ...)` — understand worker-level vs job-level errors
- After all attempts exhausted, job moves to "failed" state — query failed jobs with `queue.getFailed()`
- Implement a manual retry: `job.retry()` to move a failed job back to waiting
- Create a simple "dead letter" pattern: move permanently failed jobs to a separate queue for inspection

**Key Concepts:**
- Job states: `waiting` → `active` → `completed` OR `active` → `failed` (after all attempts)
- `worker.on('failed')` fires on each individual attempt failure
- `worker.on('error')` fires for worker infrastructure errors (Redis disconnect, etc.)
- Failed jobs stay in Redis (queryable) unless `removeOnFail` is set
- Idempotency matters: if a job partially completes before failing, retry must handle that

**Done when:** You can show a job exhausting retries, landing in failed state, then being manually retried or moved to a dead letter queue.

---

## 5. Concurrency & Rate Limiting

**Goal:** Control how many jobs run in parallel and how fast they're processed.

**Tasks:**
- Set worker concurrency: `new Worker(name, processor, { concurrency: 5 })` — add 20 jobs, observe 5 processing at a time
- Compare `concurrency: 1` vs `concurrency: 10` — measure total processing time
- Implement rate limiting with `{ limiter: { max: 10, duration: 1000 } }` on the Queue — max 10 jobs/second
- Combine concurrency + rate limiting — understand they're independent controls
- Test: what happens if worker concurrency > rate limit? (rate limit wins)

**Key Concepts:**
- Concurrency = how many jobs one worker processes simultaneously (parallel promises)
- Rate limiting = how many jobs can START per time window (across all workers)
- Concurrency is per-worker; rate limiting is per-queue (global)
- For API calls (like fetching NAVs), rate limiting prevents hitting external API limits
- Multiple workers can run on separate processes/machines — Redis coordinates them

**Done when:** You can demonstrate 20 jobs being processed with concurrency 3 and rate limit of 5/sec, and explain the observed behavior.

---

## 6. Scheduled & Repeating Jobs

**Goal:** Create cron-like recurring jobs — the pattern MF Dashboard needs for daily NAV fetches.

**Tasks:**
- Add a repeating job: `queue.add(name, data, { repeat: { every: 60000 } })` — fires every 60 seconds
- Add a cron-based job: `{ repeat: { pattern: '0 18 * * 1-5' } }` — weekdays at 6 PM (after market close)
- List all repeatable jobs: `queue.getRepeatableJobs()`
- Remove a repeating job: `queue.removeRepeatableByKey(key)`
- Understand: each trigger creates a NEW job instance (repeatable is a template, not a single job)
- Test: what happens if a repeating job's previous instance is still running when the next trigger fires?

**Key Concepts:**
- Repeating jobs use a scheduler that adds new job instances at each interval/cron tick
- Each instance is independent — has its own attempts, lifecycle, etc.
- `every` = interval in ms. `pattern` = cron expression (use `cron-parser` syntax)
- If you restart the app, repeating jobs resume from Redis state (they're persisted)
- Job deduplication: BullMQ won't add duplicate repeatables with same name + repeat config
- For MF Dashboard: cron job at 6 PM IST on weekdays → triggers NAV fetch for all tracked funds

**Done when:** A repeating job runs every 30 seconds, you can see it creating new job instances, and you can stop it cleanly.

---

## 7. Job Progress & Events

**Goal:** Report progress from inside a job and react to lifecycle events from outside.

**Tasks:**
- Inside worker processor: `job.updateProgress(50)` — report percentage
- Listen from producer side: `queueEvents.on('progress', ({ jobId, data }) => ...)`
- Listen for completed: `queueEvents.on('completed', ({ jobId, returnvalue }) => ...)`
- Listen for failed: `queueEvents.on('failed', ({ jobId, failedReason }) => ...)`
- Return a value from the processor — it becomes `job.returnvalue` (accessible after completion)
- Build a progress logger: fetch 10 NAVs, report progress as each completes (10%, 20%, ... 100%)

**Key Concepts:**
- `QueueEvents` is a separate class that uses Redis pub/sub for real-time event streaming
- Progress is stored on the job object in Redis — queryable anytime
- Return values are serialized to Redis — keep them small (just status/summary, not full data)
- Events are useful for: updating UI, triggering downstream actions, logging/monitoring
- `QueueEvents` must be closed when done (it holds a Redis connection open)

**Done when:** A job processing 10 items reports progress at each step, and an external listener logs the progress in real-time.

---

## 8. Multiple Queues & Flows (FlowProducer)

**Goal:** Orchestrate multi-step workflows — fetch NAVs first, then compute metrics after all fetches complete.

**Tasks:**
- Create two queues: `nav-fetch` and `compute-metrics`
- Use `FlowProducer` to define a parent-child dependency:
  - Parent: `compute-metrics` job (waits for children)
  - Children: multiple `nav-fetch` jobs (one per fund code)
- Children process independently (parallel NAV fetches)
- Parent auto-starts only when ALL children complete
- Handle partial failure: what if 2/10 children fail? Parent stays in "waiting-children" state
- Pass data from children to parent via `job.returnvalue` → accessible in parent as `childrenValues`

**Key Concepts:**
- `FlowProducer` creates a DAG (directed acyclic graph) of job dependencies
- Parent job waits in `waiting-children` state until all children are `completed`
- Children can be on different queues — each queue can have its own worker with different concurrency
- This is the pattern for: "fetch all NAVs → then compute portfolio metrics"
- Flows are atomic — either the entire tree is created or none of it (Redis transaction)
- Alternative: use a simple counter pattern (increment on each child complete, trigger parent at N)

**Done when:** 5 child "fetch NAV" jobs complete, then a parent "compute metrics" job auto-triggers and logs the combined results.

---

## 9. Bull Board UI

**Goal:** Add a visual dashboard to monitor queues, jobs, and their states in real-time.

**Tasks:**
- Install `@bull-board/express` and `@bull-board/api`
- Create an Express server that serves Bull Board at `/admin/queues`
- Register both queues (`nav-fetch`, `compute-metrics`) with the board
- Observe: job states, progress, data, return values, failed reasons — all visible in UI
- Test: add jobs, fail jobs, retry from UI, clean completed jobs from UI
- Optional: try `@bull-board/fastify` adapter if you prefer Fastify

**Key Concepts:**
- Bull Board is a read/write UI — you can retry, remove, and promote jobs from it
- It connects to the same Redis instance, reads job data directly
- Useful for development and debugging; in production, put it behind auth
- Alternatives: Arena (older), Taskforce.sh (commercial), custom dashboard with BullMQ API

**Done when:** Bull Board shows both queues with live job status, and you can retry a failed job from the UI.

---

## 10. Mini Project: NAV Fetcher System (Integration)

**Goal:** Combine everything into the complete NAV Fetcher system described in the idea file.

**Tasks:**
- Repeating scheduler job (every 1 min for testing, would be daily cron in production)
- Scheduler job uses `FlowProducer` to create:
  - Parent: `compute-metrics` job
  - Children: one `nav-fetch` job per fund code (use 5-6 real AMFI fund codes)
- NAV fetch worker: hits AMFI API (`https://api.mfapi.in/mf/{code}/latest`) for real NAV data
- Retry with exponential backoff on fetch failures (network errors, 5xx)
- Rate limit: max 5 requests/second (be nice to the API)
- Concurrency: 3 parallel fetches
- Compute metrics worker: receives all NAV data, logs a summary (fund name, NAV, date)
- Progress reporting on the parent job
- Bull Board showing everything
- Clean shutdown handling (graceful worker close on SIGTERM)

**Key Concepts:**
- This mirrors real production patterns: scheduler → fan-out → aggregate
- Graceful shutdown: `worker.close()` waits for active jobs to finish before exiting
- Connection management: share a single `IORedis` connection config, but each Queue/Worker creates its own
- Error boundaries: one child failing shouldn't crash the whole system
- Observability: Bull Board + console logs give full visibility

**Done when:** The system runs autonomously — every minute it fetches NAVs for 5 funds, computes a summary, and you can watch it all in Bull Board. Failures retry and the system recovers.

---

## Resources

- [BullMQ Docs](https://docs.bullmq.io/)
- [Bull Board GitHub](https://github.com/felixmosh/bull-board)
- [AMFI NAV API](https://api.mfapi.in/) — free, no auth needed
- [Cron expression reference](https://crontab.guru/)
- [Redis Docker image](https://hub.docker.com/_/redis)
