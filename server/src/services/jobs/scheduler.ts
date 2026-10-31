import { logger } from "../../lib/logger.js";

export interface Job {
  name: string;
  run: (now: Date) => Promise<unknown>;
}

/**
 * Minimal in-process scheduler: runs every job at start-up and then every `intervalMs`.
 * Jobs must be idempotent (they are – see each job), so overlapping instances on deploy are harmless.
 */
export function startScheduler(jobs: Job[], intervalMs = 15 * 60_000): () => void {
  let running = false;
  const tick = async () => {
    if (running) return;
    running = true;
    try {
      for (const job of jobs) {
        try {
          await job.run(new Date());
        } catch (err) {
          logger.error({ err, job: job.name }, "Job failed");
        }
      }
    } finally {
      running = false;
    }
  };
  const first = setTimeout(() => void tick(), 3_000);
  const timer = setInterval(() => void tick(), intervalMs);
  return () => {
    clearTimeout(first);
    clearInterval(timer);
  };
}
