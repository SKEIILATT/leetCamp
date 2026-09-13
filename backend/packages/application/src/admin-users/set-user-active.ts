import {
  cannotDeactivateSelf,
  err,
  ok,
  userNotFound,
  type Result,
  type UserRepository,
} from '@leetcamp/domain';

import { toAdminUserView, type AdminUserView } from './admin-user-view.js';

export interface SetUserActiveDeps {
  readonly userRepository: UserRepository;
}

export interface SetUserActiveInput {
  /** From `request.identity.userId` — who is making the change. */
  readonly actingAdminId: string;
  readonly targetUserId: string;
  readonly isActive: boolean;
}

export function makeSetUserActive(
  deps: SetUserActiveDeps,
): (input: SetUserActiveInput) => Promise<Result<AdminUserView>> {
  return async (input) => {
    // Checked BEFORE the lookup: an admin locking themselves out has no
    // recovery path short of someone else's session or direct DB access —
    // cheap enough to prevent outright rather than merely allow-and-warn.
    if (input.targetUserId === input.actingAdminId && !input.isActive) {
      return err(cannotDeactivateSelf());
    }

    const existing = await deps.userRepository.findById(input.targetUserId);
    if (!existing.ok) return err(existing.error);
    if (existing.value === null) return err(userNotFound(input.targetUserId));

    const updated = await deps.userRepository.setActive(input.targetUserId, input.isActive);
    if (!updated.ok) return err(updated.error);

    return ok(toAdminUserView(updated.value));
  };
}
