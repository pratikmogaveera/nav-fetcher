# NAV Fetcher

Learning BullMQ job queues by building a NAV fetcher system — scheduled jobs, retries, flows, and Bull Board.

## Purpose

Hands-on exploration of BullMQ concepts by building a system that fetches mutual fund NAV data on a schedule, retries on failure, and orchestrates multi-step workflows using Flows.

## Tech Stack

- Node.js + TypeScript
- BullMQ (job queue)
- Redis (via Docker)
- Bull Board (queue monitoring UI)

## How to Run

```bash
# Start Redis
docker run -d --name docker-redis -p 6379:6379 redis:latest

# Install dependencies
npm install

# Run in dev mode (watch)
npm run dev
```

## File Structure

```
nav-fetcher/
├── src/
│   └── index.ts        — entry point
├── package.json
├── tsconfig.json
├── .prettierrc         — formatter config
├── .prettierignore     — excludes markdown from formatting
├── PLAN.md             — learning roadmap
├── NOTES.md            — concepts and Q&A
└── .gitignore
```

## Progress

- [x] 1. Project Setup
- [x] 2. Basic Queue + Worker
- [x] 3. Job Options (delay, priority, attempts, backoff)
- [ ] 4. Retries & Error Handling
- [ ] 5. Concurrency & Rate Limiting
- [ ] 6. Scheduled & Repeating Jobs
- [ ] 7. Job Progress & Events
- [ ] 8. Multiple Queues & Flows (FlowProducer)
- [ ] 9. Bull Board UI
- [ ] 10. Mini Project: NAV Fetcher System

## Resources

- [BullMQ Docs](https://docs.bullmq.io/)
- [Bull Board](https://github.com/felixmosh/bull-board)
- [AMFI NAV API](https://api.mfapi.in/)
