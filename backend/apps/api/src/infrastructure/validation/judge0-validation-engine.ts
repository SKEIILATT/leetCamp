import {
  err,
  externalService,
  ok,
  type CodeChallenge,
  type CodeLanguage,
  type Result,
  type TestCase,
  type TestCaseResult,
  type ValidationEngine,
  type ValidationOutcome,
} from '@leetcamp/domain';

/**
 * Fase 2 adapter: judges a `type: 'code'` challenge's submitted source code
 * against every one of its test cases through a self-hosted Judge0 instance.
 * Satisfies the same `ValidationEngine` port as
 * `prediction-validation-engine.ts` — `submitAttempt` does not know or care
 * which one it is talking to (see docs/DECISIONS.md).
 *
 * ── WHY SYNCHRONOUS (`wait=true`), NOT SUBMIT-THEN-POLL ──────────────────────
 * Judge0's own docs warn against `wait=true` under heavy load, but this
 * project's whole scale (30-100 students) makes a polling/webhook pipeline
 * pure speculative complexity: a synchronous round trip per test case is far
 * simpler to reason about and to test, and the numbers here never approach
 * where that warning starts to matter.
 *
 * ── WHY SEQUENTIAL, NOT ONE ROUND TRIP PER TEST CASE IN PARALLEL ─────────────
 * Running a single student's test cases one after another (not
 * `Promise.all`) keeps the worst-case load on Judge0 proportional to how many
 * students submit at once, not to (students × test cases per challenge). A
 * challenge with, say, 8 hidden test cases must not turn one submission into
 * 8 simultaneous sandboxes.
 */

/** Judge0 CE's numeric `language_id` per supported `CodeLanguage`. These are
 * NOT guaranteed stable across Judge0 versions — verify against `GET
 * /languages` on the real instance before relying on this map in production
 * (see docs/DECISIONS.md). */
const LANGUAGE_ID: Record<CodeLanguage, number> = {
  javascript: 63, // Node.js
  python: 71, // Python 3
  sql: 82, // SQLite3
};

const CPU_TIME_LIMIT_SECONDS = 5;
const MEMORY_LIMIT_KB = 256_000;
const WALL_TIME_LIMIT_SECONDS = 10;

/** Judge0's own `status.id` values (see `GET /statuses` on the instance for
 * the full table). Sending `expected_output` makes Judge0 do the
 * trim/whitespace-tolerant comparison itself — `3` ("Accepted") IS "ran AND
 * matched"; this adapter never re-compares `stdout` against
 * `expected_output` by hand. */
const STATUS_ACCEPTED = 3;
const STATUS_COMPILATION_ERROR = 6;

interface Judge0SubmissionResult {
  readonly stdout: string | null;
  readonly stderr: string | null;
  readonly compile_output: string | null;
  readonly status: { readonly id: number; readonly description: string };
}

export interface CreateJudge0ValidationEngineOptions {
  /** No trailing slash — same convention as `FRONTEND_BASE_URL`. */
  readonly baseUrl: string;
  /** Empty string = no `X-Auth-Token` header sent. */
  readonly apiKey: string;
  readonly timeoutMs: number;
  /** The abort signal tied to the process's graceful-shutdown sequence — see
   * `composition-root.ts`'s `shutdown` controller, built anticipating exactly
   * this kind of long-lived outbound call. */
  readonly shutdownSignal: AbortSignal;
  /** Injectable so unit tests never make a real network call (`health.sh`
   * requires hermetic tests) — defaults to the global `fetch`. */
  readonly fetchFn?: typeof fetch;
}

function decodeBase64(value: string | null): string {
  if (value === null) return '';
  return Buffer.from(value, 'base64').toString('utf-8');
}

function encodeBase64(value: string): string {
  return Buffer.from(value, 'utf-8').toString('base64');
}

export function createJudge0ValidationEngine(
  options: CreateJudge0ValidationEngineOptions,
): ValidationEngine {
  const fetchFn = options.fetchFn ?? fetch;

  async function judgeOne(
    languageId: number,
    sourceCode: string,
    testCase: TestCase,
  ): Promise<Result<Judge0SubmissionResult>> {
    const signal = AbortSignal.any([options.shutdownSignal, AbortSignal.timeout(options.timeoutMs)]);
    try {
      const response = await fetchFn(`${options.baseUrl}/submissions?base64_encoded=true&wait=true`, {
        method: 'POST',
        signal,
        headers: {
          'Content-Type': 'application/json',
          ...(options.apiKey !== '' ? { 'X-Auth-Token': options.apiKey } : {}),
        },
        body: JSON.stringify({
          source_code: encodeBase64(sourceCode),
          language_id: languageId,
          stdin: encodeBase64(testCase.input),
          expected_output: encodeBase64(testCase.expectedOutput),
          cpu_time_limit: CPU_TIME_LIMIT_SECONDS,
          memory_limit: MEMORY_LIMIT_KB,
          wall_time_limit: WALL_TIME_LIMIT_SECONDS,
          // Explicit, not left at Judge0's own default: a student's
          // submitted code must never reach the network (docs/DECISIONS.md's
          // long-standing Judge0 pending item).
          enable_network: false,
        }),
      });
      if (!response.ok) {
        return err(externalService(`Judge0 responded with HTTP ${response.status}`));
      }
      const body = (await response.json()) as Judge0SubmissionResult;
      return ok(body);
    } catch (error) {
      const reason = error instanceof Error ? error.message : String(error);
      return err(externalService(`Judge0 request failed: ${reason}`));
    }
  }

  return {
    async validate(challenge, answer): Promise<Result<ValidationOutcome>> {
      if (challenge.type !== 'code') {
        // Unreachable through `createCompositeValidationEngine`, which only
        // ever routes `type: 'code'` here — guarded anyway so this adapter is
        // never silently wrong if it is ever wired up directly by mistake.
        return err(externalService('judge0ValidationEngine received a non-code challenge'));
      }
      const codeChallenge: CodeChallenge = challenge;
      const languageId = LANGUAGE_ID[codeChallenge.language];

      const testResults: TestCaseResult[] = [];
      // The FIRST runtime error seen across test cases, surfaced once at the
      // outcome level — a crash is a property of the submission, showing it
      // per test case would just repeat the same message.
      let runtimeError: string | undefined;

      for (const testCase of codeChallenge.testCases) {
        const judged = await judgeOne(languageId, answer, testCase);
        if (!judged.ok) return err(judged.error);

        if (judged.value.status.id === STATUS_COMPILATION_ERROR) {
          // Compilation is a property of the source code, not of any one
          // test case's input — one failure here means every test case
          // would fail identically, so stop spending Judge0 calls on the rest.
          return ok({
            isCorrect: false,
            compileError: decodeBase64(judged.value.compile_output) || judged.value.status.description,
          });
        }

        const passed = judged.value.status.id === STATUS_ACCEPTED;
        const actualOutput = decodeBase64(judged.value.stdout);
        if (!passed && runtimeError === undefined) {
          const stderr = decodeBase64(judged.value.stderr);
          if (stderr !== '') runtimeError = stderr;
        }

        testResults.push(
          testCase.isHidden
            ? { passed, hidden: true }
            : {
                passed,
                hidden: false,
                input: testCase.input,
                expectedOutput: testCase.expectedOutput,
                actualOutput,
              },
        );
      }

      return ok({
        isCorrect: testResults.every((result) => result.passed),
        testResults,
        ...(runtimeError !== undefined ? { runtimeError } : {}),
      });
    },
  };
}
