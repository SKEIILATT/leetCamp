import type { Result } from '../result.js';
import type { AttemptRepository } from './attempt.js';
import type { StreakRepository } from './streak.js';

/**
 * The two repositories `submitAttempt` writes to, scoped to ONE database
 * transaction. Handed to the callback in `AttemptTransactionRunner.run` —
 * never constructed by the use case itself, which knows nothing about how a
 * transaction is actually opened.
 */
export interface AttemptTransactionRepositories {
  readonly attemptRepository: AttemptRepository;
  readonly streakRepository: StreakRepository;
}

/**
 * Runs the "create the attempt, then update the streak" pair atomically.
 *
 * Exists to close the gap documented on `submitAttempt` since the vertical
 * was first built: without this, a failure between the two writes could not
 * lose the attempt (it is re-derivable from history) but could leave the
 * streak stale until the next submission repairs it. One database
 * transaction removes the window entirely.
 *
 * The callback returns `Result<T>`, not a bare value: an adapter that opens a
 * REAL transaction (Prisma's `$transaction`) needs the callback to THROW to
 * trigger a rollback, since `Result` failures don't throw by convention
 * elsewhere in this codebase — translating `err(...)` into a rollback is the
 * adapter's job, not something `submitAttempt` should know about.
 */
export interface AttemptTransactionRunner {
  run<T>(work: (repos: AttemptTransactionRepositories) => Promise<Result<T>>): Promise<Result<T>>;
}
