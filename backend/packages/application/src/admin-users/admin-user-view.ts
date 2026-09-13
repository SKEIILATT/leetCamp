import type { User } from '@leetcamp/domain';

/**
 * The admin-facing view of an account.
 *
 * ⚠ NO `passwordHash` FIELD, ON PURPOSE — same reasoning as `PublicChallenge`
 * in the `dailyChallenges` vertical: even a trusted admin has no legitimate
 * reason to receive a password hash over HTTP, and the guarantee lives in
 * this type's SHAPE, not in the route remembering to omit a field.
 */
export interface AdminUserView {
  readonly id: string;
  readonly email: string;
  readonly displayName: string;
  readonly roleId: number;
  readonly timezone: string;
  readonly isActive: boolean;
  readonly createdAt: Date;
}

export function toAdminUserView(user: User): AdminUserView {
  return {
    id: user.id,
    email: user.email,
    displayName: user.displayName,
    roleId: user.roleId,
    timezone: user.timezone,
    isActive: user.isActive,
    createdAt: user.createdAt,
  };
}
