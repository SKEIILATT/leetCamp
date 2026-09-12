/**
 * Scheduler adapters.
 *
 * ⚠ The scheduler's LIFECYCLE belongs to the composition root: it starts it
 * after wiring and stops it in the `onClose` hook, before disconnecting the
 * database. `buildHttpApp` receives it as a port and only ever reads state from
 * it.
 */
export * from './in-process-scheduler.js';
export * from './register-jobs.js';
export * from './schedule-timing.js';
