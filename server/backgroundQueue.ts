type QueueJob = {
  id: string;
  name: string;
  enqueuedAt: string;
  status: "queued" | "running" | "completed" | "failed";
  error?: string;
};

type JobHandler = () => Promise<unknown>;

const jobs = new Map<string, QueueJob>();
const pending: Array<{ job: QueueJob; handler: JobHandler }> = [];
let running = false;

async function drain() {
  if (running) return;
  running = true;
  try {
    while (pending.length) {
      const next = pending.shift()!;
      next.job.status = "running";
      console.info(`[BackgroundQueue] starting ${next.job.name} (${next.job.id})`);
      try {
        await next.handler();
        next.job.status = "completed";
        console.info(`[BackgroundQueue] completed ${next.job.name} (${next.job.id})`);
      } catch (error) {
        next.job.status = "failed";
        next.job.error = error instanceof Error ? error.message : String(error);
        console.error(`[BackgroundQueue] failed ${next.job.name} (${next.job.id})`, error);
      }
    }
  } finally {
    running = false;
  }
}

export function enqueueBackgroundJob(name: string, handler: JobHandler) {
  const job: QueueJob = {
    id: `${name}-${Date.now()}-${Math.random().toString(36).slice(2, 8)}`,
    name,
    enqueuedAt: new Date().toISOString(),
    status: "queued",
  };
  jobs.set(job.id, job);
  pending.push({ job, handler });
  void drain();
  return job;
}

export function getBackgroundQueueStatus() {
  return {
    running,
    queued: pending.length,
    recent: Array.from(jobs.values()).slice(-20).reverse(),
  };
}
