# NAV Fetcher — Learning Notes

## 1. Project Setup

### Key Concepts

- BullMQ uses `ioredis` under the hood — Redis is the persistence + communication backbone
- No job data lives in Node memory; everything is stored in Redis
- Queue, Worker, and QueueEvents are separate concerns with separate Redis connections

### Tools / Config

| Tool | Purpose |
|------|---------|
| `tsx watch` | Dev runner with hot reload |
| `redis:latest` via Docker | Local Redis on port 6379 |
| `queue.obliterate()` | Wipe all jobs during dev (prevents duplicates from watch restarts) |

---

## 2. Basic Queue + Worker

### Key Concepts

- **Queue** = producer. Pushes jobs to Redis with `queue.add(name, data, opts)`
- **Worker** = consumer. Polls Redis and runs processor function for each job
- **QueueEvents** = observer. Uses Redis pub/sub to emit lifecycle events in real-time
- A queue name is just a Redis key prefix — no explicit creation needed
- Jobs are JSON-serializable objects that persist in Redis independent of your Node process
- Kill and restart your app — worker still picks up pending jobs

### Job Lifecycle

```
added → delayed (if delay option) → waiting → active → completed/failed
```

- `delay` = time before job enters the waiting queue, NOT delay before processing
- Once in waiting, job is picked up as soon as a worker is free
- Delayed jobs sit in a Redis sorted set scored by `Date.now() + delay`

### Event System (QueueEvents)

- Must call `waitUntilReady()` before adding jobs to avoid missing early events
- Each event includes `prev` — the state the job transitioned FROM
- `delayed` event only fires when a job is MOVED to delayed set (e.g., backoff), not on creation with `delay` option
- `waiting (prev: delayed)` confirms the job was in the delayed state

### Concurrency

- Default: `concurrency: 1` — sequential, one job at a time
- Jobs queue up in `waiting` and are served FIFO
- Higher concurrency = multiple processor promises running in parallel (per worker)

### Gotchas

- `tsx watch` restarts = duplicate jobs in Redis (use `obliterate` during dev)
- `QueueEvents` needs time to connect — race condition if you add jobs immediately

---

## 3. Job Options — Delay, Priority, Attempts, Backoff

### Key Concepts

- **delay** — time (ms) before job enters the waiting queue. Job sits in a Redis sorted set scored by `Date.now() + delay`.
- **priority** — lower number = higher priority. Jobs in waiting are sorted by priority before FIFO.
- **attempts** — total tries (not retries). `attempts: 3` = 1 original + 2 retries.
- **backoff** — delay between retries after a failure.
  - `fixed`: same delay every time (e.g., 3s, 3s, 3s)
  - `exponential`: doubles each time (e.g., 1s, 2s, 4s)
- **removeOnComplete** — `true` deletes job from Redis after success. Prevents unbounded growth.
- **removeOnFail** — `true` deletes after final failure. `number` keeps last N failures. Default `false` keeps all (useful for debugging/manual retry).

### Retry Flow

```
active → failed → delayed (backoff timer) → waiting (prev: delayed) → active → ...
```

- Intermediate failures show as `waiting (prev: delayed)` — the job backed off and returned.
- `failed` event only fires on the final attempt (all retries exhausted).
- After final failure, job stays in Redis (unless `removeOnFail` is set).

### Priority Behavior

- Priority is evaluated when multiple jobs are in the waiting state simultaneously.
- Lower priority number gets picked up first regardless of insertion order.

---

## Q&A

### What does `attempts: 3` mean — 3 retries or 3 total tries?
3 total tries. 1 original attempt + 2 retries.

### When would you use `removeOnFail: N` vs `true` vs `false`?
- `false` (default) — keep all failures for debugging, manual retry, alerting.
- `true` — transient jobs you don't care about (cache refreshes, recurring fetches).
- `N` (e.g., 50) — production sweet spot. Keep enough to debug recent issues, prevent Redis bloat.

### Should all code be in a single file?
For learning, yes. In production, split: queues/ (shared config), workers/ (processor logic), and separate entry points for producers vs workers. They run as different processes — producer (API server) adds jobs, worker processes consume them independently.

### What's the difference between delayed and waiting?
- **Delayed** = Redis sorted set, job waiting for its timer to expire. No worker can pick it up.
- **Waiting** = Redis list (FIFO), job ready to be processed. Next free worker picks it up.

### When would you use delay in production?
- Rate limiting retries (try again in 30s after API 429)
- Scheduling future work (send reminder in 24h)
- Debouncing (process only if no new update in 5s)
- Staggering (avoid thundering herd with increasing delays)

### What is `prev` in events?
The previous state before the current transition. Tells you where the job came from — useful when a job can arrive at `waiting` from multiple paths (new, retry, delay expired).

---

## 4. Retries & Error Handling

### Key Concepts

- **`worker.on('failed')`** fires on **every** failed attempt (not just the last). Gives you `(job, err)`.
- **`worker.on('error')`** fires for **worker infrastructure** issues (Redis disconnect, serialization errors). No job reference — just the error. You won't see it during normal job failures.
- **`queue.getFailed()`** returns all jobs in the `failed` state (exhausted all attempts). Each job retains `failedReason`, `attemptsMade`, `stacktrace` (array, one per attempt), and full job data.
- **`job.retry('failed')`** moves a failed job back to `waiting` for one more attempt. Does NOT reset `attemptsMade` — the counter continues (e.g., 3 → 4).
- **Dead letter queue (DLQ)** — a separate queue where permanently failed jobs are moved for inspection, alerting, or batch reprocessing.

### `worker.on('failed')` vs `queueEvents.on('failed')`

| | `worker.on('failed')` | `queueEvents.on('failed')` |
|---|---|---|
| Fires | Every attempt | Only final failure |
| Access | Full `job` object + `err` | `jobId` + `failedReason` string |
| Use case | Per-attempt logging, DLQ routing | External monitoring, alerting |

### Manual Retry Behavior

- `job.retry('failed')` — argument is the current state of the job (required since BullMQ v4)
- Gives the job one additional attempt, doesn't reset to original `attempts` value
- For a full fresh set of retries, create a new job instead

### Dead Letter Queue Pattern

```
processor fails → all attempts exhausted → worker.on('failed') detects attemptsMade >= attempts
→ add job data to DLQ → original job stays in failed (or remove it)
```

- DLQ is just another Queue — no special BullMQ concept
- Useful for: alerting ops team, batch retry later, auditing failure patterns

---

## 5. Concurrency & Rate Limiting

### Key Concepts

- **Concurrency** = how many jobs one worker processes simultaneously (parallel promises). Set on `Worker` options: `{ concurrency: 5 }`.
- **Rate limiting** = how many jobs can START processing per time window. Global across all workers on the queue.
- Two ways to set rate limit:
  - `Worker` options: `{ limiter: { max: 10, duration: 1000 } }` (original approach)
  - `Queue` method: `await queue.setGlobalRateLimit(10, 1000)` (newer, dynamic)
- Both achieve the same thing — global rate limiting. `setGlobalRateLimit` separates concerns better.
- Rate limiting controls jobs moving from `waiting → active`, NOT jobs being added to the queue.

### Mental Model

- **Rate limit** = gate at the entrance (how fast jobs can enter processing)
- **Concurrency** = room capacity (how many can be inside at once)
- The stricter one wins

### Observed Behavior

| Config | 10 jobs (1s processor) | Bottleneck |
|--------|----------------------|------------|
| concurrency: 1 | ~10s | Concurrency |
| concurrency: 5 | ~2s | Concurrency |
| concurrency: 5, rate: 2/sec | ~5s | Rate limit |
| concurrency: 3, rate: 5/sec | 3 jobs/sec | Concurrency |

### Production Use Cases

- **Concurrency** — limit CPU/memory usage per worker, control DB connection pool usage
- **Rate limiting** — respect external API limits (e.g., max 5 requests/sec to AMFI API), prevent thundering herd
