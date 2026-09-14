import { ok, type PasswordResetMailer, type Result } from '@leetcamp/domain';

/**
 * ⚠ DEV-ONLY STAND-IN, NOT A REAL MAIL ADAPTER. There is no SMTP/transactional
 * -email service configured for this project yet — building one requires a
 * real provider account and credentials that do not exist here. This adapter
 * satisfies the `PasswordResetMailer` port by logging the reset link instead
 * of emailing it, which is exactly why the port exists as an interface: swap
 * this one file for a real provider (Resend, SES, Postmark, ...) and nothing
 * in `requestPasswordReset` or the routes changes.
 *
 * ⚠⚠ BEFORE A REAL RELEASE: a student cannot reset their own password with
 * this adapter wired in — only whoever can read the server's logs can see the
 * link. Acceptable for local development and for a bootcamp still in its
 * pilot with an admin reading logs on request; NOT acceptable once the number
 * of students makes that unworkable.
 */
export function createConsolePasswordResetMailer(logger: {
  info: (obj: unknown, msg: string) => void;
}): PasswordResetMailer {
  return {
    async sendResetLink(input: { readonly email: string; readonly resetUrl: string }): Promise<Result<void>> {
      logger.info(
        { email: input.email, resetUrl: input.resetUrl },
        'password reset link (console adapter — no real email was sent, see this adapter\'s doc comment)',
      );
      return ok(undefined);
    },
  };
}
