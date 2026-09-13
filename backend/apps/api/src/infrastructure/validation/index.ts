/**
 * Adapters for the `ValidationEngine` port. Only the composition root imports
 * from here — `submitAttempt` sees the port and nothing else, which is what
 * lets Fase 2 swap this for a Judge0-backed engine without the use case
 * changing.
 */
export * from './prediction-validation-engine.js';
