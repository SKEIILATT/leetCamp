import { randomUUID } from 'node:crypto';
import {
  conflict,
  err,
  notFound,
  ok,
  type JobRunRecord,
  type JobStatus,
  type JobTrigger,
  type RecurringJobDefinition,
  type RecurringJobScheduler,
  type Result,
} from '@leetcamp/domain';

import { clampDelayMs, nextDelayMs } from './schedule-timing.js';

/**
 * In-process cron scheduler.
 *
 * ┌───────────────────────────────────────────────────────────────────────────┐
 * │ ⚠⚠ SINGLE INSTANCE ONLY. NO DISTRIBUTED COORDINATION. ⚠⚠                  │
 * │                                                                           │
 * │ There are no advisory locks, no leader table, nothing stopping two        │
 * │ processes from waking at the same time. Two replicas with                 │
 * │ SCHEDULER_ENABLED=true run EVERY job TWICE. On most domains that is data  │
 * │ corruption, not a performance issue, and it does not surface until        │
 * │ somebody reads a number that does not add up.                             │
 * │                                                                           │
 * │ When you need to scale the API horizontally, the correct move is to split │
 * │ the scheduler into its own single-replica service — not to spread luck    │
 * │ across replicas. See docs/deployment.md.                                  │
 * └───────────────────────────────────────────────────────────────────────────┘
 *
 * The business logic of each job lives in the application package. This file
 * only supplies the *when*, plus four safety properties that are easy to get
 * wrong:
 *
 *   · OVERLAP GUARD — a run in flight blocks the next tick for that job. A slow
 *     job must never pile runs on top of each other.
 *   · THE `finally` THAT RELEASES IT — if the guard were released only on the
 *     happy path, one throw would wedge the job forever.
 *   · CLAMPED DELAYS — see `schedule-timing.ts`.
 *   · `unref()` — a pending timer must not keep the process alive during
 *     shutdown.
 */

export interface SchedulerLogger {
  debug: (obj: unknown, msg: string) => void;
  info: (obj: unknown, msg: string) => void;
  warn: (obj: unknown, msg: string) => void;
  error: (obj: unknown, msg: string) => void;
}

export interface InProcessSchedulerOptions {
  /** The master switch. When false, `start()` schedules nothing. */
  readonly enabled: boolean;
  /** Delay before `runOnBoot` jobs fire, in milliseconds. */
  readonly bootDelayMs: number;
  readonly logger: SchedulerLogger;
  /** Bounded history so a long-lived process does not grow without limit. */
  readonly historyLimit?: number;
}

interface JobEntry {
  readonly definition: RecurringJobDefinition;
  // `| undefined` explicitly, not just `?:` — these two are reset back to
  // "absent" in stop() via direct assignment, which exactOptionalPropertyTypes
  // forbids on a bare `?:` field (present-with-undefined is not the same as
  // absent for a serialized DTO, but this is a live in-memory struct, not one).
  timer?: NodeJS.Timeout | undefined;
  running: boolean;
  nextRunAt?: Date | undefined;
  lastRun?: JobRunRecord;
}

export function createInProcessScheduler(
  options: InProcessSchedulerOptions,
): RecurringJobScheduler {
  const { enabled, bootDelayMs, logger } = options;
  const historyLimit = options.historyLimit ?? 100;

  // A Map, not an object: insertion order is part of the contract (`listJobs`
  // returns registration order) and a Map guarantees it for string keys that
  // could otherwise be reordered as integer-like keys.
  const jobs = new Map<string, JobEntry>();
  const runHistory: JobRunRecord[] = [];
  let started = false;

  function record(entry: JobEntry, run: JobRunRecord): void {
    entry.lastRun = run;
    runHistory.unshift(run);
    if (runHistory.length > historyLimit) runHistory.length = historyLimit;

    const context = {
      job: run.jobName,
      runId: run.runId,
      trigger: run.trigger,
      durationMs: run.durationMs,
      outcome: run.outcome,
      err: run.error,
    };

    // The job's own outcome decides the level. The scheduler knows nothing about
    // the business, so a job that processed 36 records and failed all 36 can
    // only be logged as an error if it says so itself.
    if (run.status === 'failed') logger.error(context, 'job.run.failed');
    else if (run.status === 'partial') logger.warn(context, 'job.run.partial');
    else logger.info(context, 'job.run.ok');
  }

  async function execute(entry: JobEntry, trigger: JobTrigger): Promise<JobRunRecord> {
    const startedAt = new Date();
    const runId = randomUUID();
    entry.running = true;

    try {
      const result = await entry.definition.run();
      const finishedAt = new Date();
      const base = {
        runId,
        jobName: entry.definition.name,
        trigger,
        startedAt,
        finishedAt,
        durationMs: finishedAt.getTime() - startedAt.getTime(),
      };

      if (!result.ok) {
        const run: JobRunRecord = { ...base, status: 'failed', error: result.error.message };
        record(entry, run);
        return run;
      }

      const outcome = result.value;
      const status = outcome.failed === 0 ? 'ok' : outcome.succeeded === 0 ? 'failed' : 'partial';
      const run: JobRunRecord = { ...base, status, outcome };
      record(entry, run);
      return run;
    } catch (error) {
      // The safety net, not the contract: a handler is supposed to return
      // `Result`. Catching here means one badly written job cannot take the
      // scheduler — and therefore every other job — down with it.
      const finishedAt = new Date();
      const run: JobRunRecord = {
        runId,
        jobName: entry.definition.name,
        trigger,
        startedAt,
        finishedAt,
        durationMs: finishedAt.getTime() - startedAt.getTime(),
        status: 'failed',
        error: error instanceof Error ? error.message : String(error),
      };
      record(entry, run);
      return run;
    } finally {
      // ⚠ THE `finally` IS LOAD-BEARING. Releasing the guard only on the happy
      // path leaves `running` stuck at true after the first throw, and the job
      // never runs again — silently, because nothing errors.
      entry.running = false;
    }
  }

  function schedule(entry: JobEntry, delayOverrideMs?: number): void {
    if (!enabled || !entry.definition.enabled) return;

    const requested = delayOverrideMs ?? nextDelayMs(entry.definition.schedule, new Date());
    const { delayMs, wasClamped } = clampDelayMs(requested);

    if (wasClamped) {
      logger.warn(
        { job: entry.definition.name, requestedMs: requested, delayMs },
        'job.timer.clamped',
      );
    }

    entry.nextRunAt = new Date(Date.now() + delayMs);

    const timer = setTimeout(() => {
      void (async () => {
        // The overlap guard. Skipping the tick is deliberate: queueing it would
        // let a job that is slower than its interval build an unbounded backlog.
        if (entry.running) {
          logger.warn({ job: entry.definition.name }, 'job.run.skipped.already-running');
        } else {
          await execute(entry, 'schedule');
        }
        // Rescheduled AFTER the run, never before: with `setInterval` a job that
        // overruns its period fires again while still working.
        schedule(entry);
      })();
    }, delayMs);

    // ⚠ `unref()` so a pending timer does not hold the event loop open. Without
    // it a graceful shutdown waits for the next tick before the process can
    // exit, and the orchestrator eventually SIGKILLs it — defeating the whole
    // point of graceful shutdown.
    timer.unref();
    entry.timer = timer;
  }

  return {
    enabled,

    register(definition: RecurringJobDefinition): void {
      if (jobs.has(definition.name)) {
        // Throws, and does not return a Result: a duplicate job name is a wiring
        // error made at boot by a developer, not an expected business outcome.
        // It must stop the process, not be handled.
        throw new Error(`Job "${definition.name}" is already registered`);
      }
      jobs.set(definition.name, { definition, running: false });
    },

    start(): void {
      if (started) return; // idempotent
      started = true;

      if (!enabled) {
        logger.info({ jobs: jobs.size }, 'scheduler.disabled');
        return;
      }

      for (const entry of jobs.values()) {
        if (!entry.definition.enabled) continue;
        // `runOnBoot` jobs get the boot delay, not their normal interval: a
        // container in a restart loop must not turn ten restarts into ten runs
        // of real work.
        schedule(entry, entry.definition.runOnBoot ? bootDelayMs : undefined);
      }

      logger.info({ jobs: jobs.size, bootDelayMs }, 'scheduler.started');
    },

    async runNow(jobName: string): Promise<Result<JobRunRecord>> {
      const entry = jobs.get(jobName);
      if (!entry) return err(notFound(`Job "${jobName}" is not registered`));
      if (entry.running) return err(conflict(`Job "${jobName}" is already running`));
      // `ok(record)` even when the run failed: the Result answers "could it
      // run?", the record answers "how did it go?". Two questions, two channels.
      return ok(await execute(entry, 'manual'));
    },

    listJobs(): readonly JobStatus[] {
      return [...jobs.values()].map((entry) => ({
        name: entry.definition.name,
        description: entry.definition.description,
        schedule: entry.definition.schedule,
        enabled: entry.definition.enabled,
        runOnBoot: entry.definition.runOnBoot,
        running: entry.running,
        ...(entry.nextRunAt ? { nextRunAt: entry.nextRunAt } : {}),
        ...(entry.lastRun ? { lastRun: entry.lastRun } : {}),
      }));
    },

    history(jobName?: string): readonly JobRunRecord[] {
      return jobName ? runHistory.filter((run) => run.jobName === jobName) : [...runHistory];
    },

    stop(): void {
      for (const entry of jobs.values()) {
        if (entry.timer) clearTimeout(entry.timer);
        entry.timer = undefined;
        entry.nextRunAt = undefined;
      }
      started = false;
      logger.info({}, 'scheduler.stopped');
    },
  };
}
