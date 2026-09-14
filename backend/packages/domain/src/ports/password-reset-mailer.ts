import type { Result } from '../result.js';

/**
 * Delivers the "reset your password" link to the student.
 *
 * Declared as a port for the same reason as `TokenIssuer`/`PasswordHasher`:
 * how the message actually reaches the student (SMTP, a transactional-email
 * API, a log line) is an infrastructure decision, swappable without touching
 * `requestPasswordReset`. See `infrastructure/notifications/` for the
 * concrete adapter this project ships with today, and its doc comment for
 * what "ships with today" means here.
 */
export interface PasswordResetMailer {
  sendResetLink(input: { readonly email: string; readonly resetUrl: string }): Promise<Result<void>>;
}
