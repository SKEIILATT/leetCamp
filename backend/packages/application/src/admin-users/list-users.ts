import { err, ok, type Result, type UserRepository } from '@leetcamp/domain';

import { toAdminUserView, type AdminUserView } from './admin-user-view.js';

export function makeListUsers(deps: {
  readonly userRepository: UserRepository;
}): () => Promise<Result<readonly AdminUserView[]>> {
  return async () => {
    const users = await deps.userRepository.list();
    if (!users.ok) return err(users.error);
    return ok(users.value.map(toAdminUserView));
  };
}
