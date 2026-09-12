import {
  challengeAlreadyPublished,
  challengeNotFound,
  err,
  ok,
  type ChallengeRepository,
  type Clock,
  type Result,
} from '@leetcamp/domain';

export interface PublishChallengeDeps {
  readonly challengeRepository: ChallengeRepository;
  readonly clock: Clock;
}

export interface PublishChallengeInput {
  readonly challengeId: string;
}

export function makePublishChallenge(
  deps: PublishChallengeDeps,
): (input: PublishChallengeInput) => Promise<Result<void>> {
  return async (input) => {
    const found = await deps.challengeRepository.findById(input.challengeId);
    if (!found.ok) return err(found.error);
    if (found.value === null) return err(challengeNotFound(input.challengeId));

    // The transition check lives HERE, not in the repository — see the note
    // on `ChallengeRepository.updateStatus`.
    if (found.value.status === 'published') {
      return err(challengeAlreadyPublished(input.challengeId));
    }

    const updated = await deps.challengeRepository.updateStatus(
      input.challengeId,
      'published',
      deps.clock.now(),
    );
    if (!updated.ok) return err(updated.error);

    return ok(undefined);
  };
}
