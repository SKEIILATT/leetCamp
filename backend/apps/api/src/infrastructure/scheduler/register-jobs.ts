import type { RecurringJobScheduler } from '@leetcamp/domain';
import type { SystemUseCases } from '@leetcamp/application';

/**
 * Wires use cases to the trigger. THE ONLY thing this file knows about a job is
 * its name, its cadence and which use case to call.
 *
 * The separation is the point: the business logic lives in the application
 * package, where it is called directly from a test with no timers involved. The
 * scheduler supplies the *when*, this file supplies the *what*, and neither one
 * knows the other's insides.
 *
 * Register every job here, one block each. Keeping them in one file makes the
 * set of scheduled work readable in one screen — which matters, because a job
 * you forgot exists is a job you cannot reason about.
 */
export interface RegisterJobsDeps {
  readonly system: SystemUseCases;
  readonly heartbeatMinutes: number;
}

export function registerSchedulerJobs(
  scheduler: RecurringJobScheduler,
  deps: RegisterJobsDeps,
): void {
  scheduler.register({
    name: 'system.heartbeat',
    description: 'Reference job. Proves the scheduler runs and logs. Safe to delete.',
    schedule: { kind: 'everyMinutes', minutes: deps.heartbeatMinutes },
    // Runs shortly after boot so a deploy confirms the scheduler is alive
    // without waiting a full interval.
    runOnBoot: true,
    enabled: true,
    run: deps.system.heartbeat,
  });

  // Add real jobs below. A daily job uses the other schedule shape:
  //
  //   scheduler.register({
  //     name: 'billing.close-day',
  //     description: 'Closes the previous day before business hours.',
  //     schedule: { kind: 'dailyAtUtc', hour: 6, minute: 0 },
  //     runOnBoot: false,
  //     enabled: true,
  //     run: deps.billing.closeDay,
  //   });
  //
  // The hour is UTC on purpose — see the port's header.
}
