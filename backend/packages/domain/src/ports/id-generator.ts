/**
 * Port for generating entity identifiers.
 *
 * The alternative would be calling `crypto.randomUUID()` straight inside the
 * use case. That would drag a Node runtime API into the application layer and,
 * more importantly, leave a use case whose output cannot be asserted exactly in
 * a unit test: the id would differ on every run.
 *
 * Declaring the capability as a port keeps the application layer pure and its
 * tests deterministic. The concrete implementation lives in
 * `apps/api/src/infrastructure/id/`, and tests use a trivial sequential
 * generator.
 */
export interface IdGenerator {
  generate(): string;
}
