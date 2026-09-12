import { conflict, notFound, unauthenticated } from '../errors.js';

/**
 * Per-aggregate error factories, built from the CLOSED catalogue in
 * `../errors.ts`. They never define a new code — see the note there on why
 * the catalogue stays closed.
 */

export const emailAlreadyRegistered = (email: string) =>
  conflict(`An account with email "${email}" already exists`);

/**
 * ⚠ ONE MESSAGE FOR BOTH "no such email" AND "wrong password".
 *
 * Returning a distinct error for each ("email not found" vs. "wrong password")
 * turns the login endpoint into a way to enumerate which emails have an
 * account. Both failures answer identically, and `loginUser` never branches
 * before reaching this call — see the use case.
 */
export const invalidCredentials = () => unauthenticated('Invalid email or password');

export const userNotFound = (userId: string) => notFound(`User ${userId} not found`);
