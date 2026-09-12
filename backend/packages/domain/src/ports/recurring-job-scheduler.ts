import type { Result } from '../result.js';

/**
 * Port for RECURRING work (cron).
 *
 * ── WHY A SEPARATE PORT AND NOT A WIDENED ONE ────────────────────────────────
 *
 * One-shot deferred work ("auto-approve THIS record in 48 h") and recurring
 * work ("sync every 30 min", "close the day at 06:00 UTC") look similar and are
 * not. The one-shot unit is an *instance* with its own payload, cancellable by
 * id. The recurring unit is a *definition*, fixed at boot, with no payload,
 * that repeats forever.
 *
 * Forcing both through one interface means each run has to reschedule itself
 * with a freshly invented `runAt` and `id`, and `cancel(jobId)` starts meaning
 * "cancel the next iteration" instead of "cancel this job" — two semantics
 * under one name, which is how an API that lies gets built. If you later need
 * one-shot deferred work, add a second port next to this one; do not widen
 * this.
 *
 * ── WHY A DISCRIMINATED UNION AND NOT A CRON STRING ──────────────────────────
 *
 * Five-field cron syntax admits expressions nobody can validate at a glance and
 * that this kind of product never needs. With this shape, a negative interval
 * or an impossible hour is rejected by the compiler or by the Zod schema — not
 * by production at 3 a.m.
 *
 * The hour is UTC, not local, on purpose: the container's zone is not part of
 * the contract. Translating to a local time is the job of whoever READS the
 * state, not of whoever schedules it.
 */
export type JobSchedule =
  | {
      readonly kind: 'everyMinutes';
      /** Minutes between runs. The implementation clamps to a 1 s floor. */
      readonly minutes: number;
    }
  | {
      readonly kind: 'dailyAtUtc';
      /** UTC hour, 0-23. */
      readonly hour: number;
      /** UTC minute, 0-59. */
      readonly minute: number;
    };

/** What triggered a run. */
export type JobTrigger = 'boot' | 'schedule' | 'manual';

/**
 * What a job reports about itself when it finishes.
 *
 * NOT decorative: it is what decides the LOG LEVEL of the run (see
 * `JobRunStatus`). A job that returns `{ processed: 36, succeeded: 0, failed:
 * 36 }` has to come out at `error`, and the only way the scheduler can know
 * that without knowing the business is for the job to tell it.
 *
 * A job with nothing to report returns zeros; that is not a failure.
 */
export interface JobRunOutcome {
  /** Units of work considered (records, groups, rows…). */
  readonly processed: number;
  /** Of those, how many succeeded. */
  readonly succeeded: number;
  /** Of those, how many failed. */
  readonly failed: number;
  /** Free-form context for the log. Ids, not entities. */
  readonly detail?: Readonly<Record<string, unknown>>;
}

/**
 * The function the scheduler invokes. **This is where the business lives, and
 * it lives in the application package, not in the scheduler's infrastructure.**
 *
 * That separation is what makes jobs testable without timers: the use case is
 * called directly in a test and its `Result` is asserted. The scheduler only
 * supplies the *when*.
 *
 * Returns `Result` and does not throw. If it throws anyway, the implementation
 * catches it and records a failed run — but that is the safety net, not the
 * contract.
 */
export type JobHandler = () => Promise<Result<JobRunOutcome>>;

/** A job as registered at boot. */
export interface RecurringJobDefinition {
  /** Logical, UNIQUE name, e.g. 'billing.sync'. It is the registry key. */
  readonly name: string;
  /** For the operator reading the jobs endpoint. */
  readonly description: string;
  readonly schedule: JobSchedule;
  /**
   * Whether it should also run once shortly after boot. With a daily job, a
   * deploy is otherwise the only way to force a refresh without waiting 24 h.
   */
  readonly runOnBoot: boolean;
  /**
   * PER-JOB switch, independent of the scheduler's master switch. A disabled
   * job still shows up in the listing — "not scheduled" and "does not exist"
   * are different diagnoses.
   */
  readonly enabled: boolean;
  readonly run: JobHandler;
}

/**
 * How a run ended. Determines the log level:
 *   ok      → info
 *   partial → warn
 *   failed  → error
 */
export type JobRunStatus = 'ok' | 'partial' | 'failed';

/** The record of ONE run. The unit of the auditable history. */
export interface JobRunRecord {
  readonly runId: string;
  readonly jobName: string;
  readonly trigger: JobTrigger;
  readonly startedAt: Date;
  readonly finishedAt: Date;
  readonly durationMs: number;
  readonly status: JobRunStatus;
  /** Absent when the job returned `err` or threw before producing an outcome. */
  readonly outcome?: JobRunOutcome;
  /** Failure message. Present only when the run failed with an error. */
  readonly error?: string;
}

/** Current state of a registered job, for diagnostics. */
export interface JobStatus {
  readonly name: string;
  readonly description: string;
  readonly schedule: JobSchedule;
  readonly enabled: boolean;
  readonly runOnBoot: boolean;
  /** `true` while a run is in flight. */
  readonly running: boolean;
  /** `undefined` when the scheduler is off or the job is disabled. */
  readonly nextRunAt?: Date;
  readonly lastRun?: JobRunRecord;
}

/**
 * Registration and firing of recurring jobs.
 *
 * `register` at boot, `start` once, `stop` on graceful shutdown.
 * `runNow` exists for tests and for a possible future manual trigger; it is NOT
 * exposed over HTTP by default — an endpoint that fires payroll or billing is a
 * product decision, not a side effect of the method existing.
 */
export interface RecurringJobScheduler {
  /** Throws if the name is already registered: that is a wiring error, not a business one. */
  register(job: RecurringJobDefinition): void;

  /** Schedules every registered job. Idempotent. */
  start(): void;

  /**
   * Run a job right now, skipping the timer.
   *
   * The `Result` answers "could it run?" (`NOT_FOUND` if unknown, `CONFLICT` if
   * already running). The `JobRunRecord` answers "how did it go?" — a job that
   * failed returns `ok(record)` with `status: 'failed'`.
   */
  runNow(jobName: string): Promise<Result<JobRunRecord>>;

  /** State of every registered job, in registration order. */
  listJobs(): readonly JobStatus[];

  /** Run history, most recent first. */
  history(jobName?: string): readonly JobRunRecord[];

  /** Cancels every timer. Does NOT wait for a run in flight. */
  stop(): void;

  /** The master switch, so it can be reported without re-reading the env. */
  readonly enabled: boolean;
}
