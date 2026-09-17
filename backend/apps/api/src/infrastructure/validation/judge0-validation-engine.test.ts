import { describe, expect, it } from 'vitest';
import type { CodeChallenge } from '@leetcamp/domain';

import { createJudge0ValidationEngine } from './judge0-validation-engine.js';

function b64(value: string): string {
  return Buffer.from(value, 'utf-8').toString('base64');
}

const codeChallenge: CodeChallenge = {
  id: 'challenge-1',
  categoryId: 'cat-1',
  difficultyId: 'diff-1',
  type: 'code',
  title: 'Reverse a string',
  promptMarkdown: 'Write a function that reverses a string.',
  starterCode: 'function reverse(s) {}',
  language: 'javascript',
  testCases: [
    { id: 'tc-1', input: 'abc', expectedOutput: 'cba', isHidden: false },
    { id: 'tc-2', input: 'xy', expectedOutput: 'yx', isHidden: true },
  ],
  status: 'published',
  createdBy: 'admin-1',
  createdAt: new Date('2026-01-01T00:00:00Z'),
  updatedAt: new Date('2026-01-01T00:00:00Z'),
};

/** Builds a `fetchFn` fake — each element in `responses` is the JSON body
 * returned for the Nth call, in order. Every unit test in this file is
 * hermetic: no real network call is ever made (`health.sh` requires it). */
function fakeFetch(responses: readonly unknown[]): typeof fetch {
  let call = 0;
  const requests: RequestInit[] = [];
  const fn = (async (_url: string | URL | Request, init?: RequestInit) => {
    requests.push(init ?? {});
    const body = responses[call];
    call += 1;
    return new Response(JSON.stringify(body), { status: 200 });
  }) as typeof fetch;
  (fn as unknown as { requests: RequestInit[] }).requests = requests;
  return fn;
}

function engine(fetchFn: typeof fetch) {
  return createJudge0ValidationEngine({
    baseUrl: 'http://judge0.internal:2358',
    apiKey: '',
    timeoutMs: 5000,
    shutdownSignal: new AbortController().signal,
    fetchFn,
  });
}

describe('judge0ValidationEngine', () => {
  it('marks the answer correct when every test case is Accepted', async () => {
    const fetchFn = fakeFetch([
      { status: { id: 3, description: 'Accepted' }, stdout: b64('cba'), stderr: null, compile_output: null },
      { status: { id: 3, description: 'Accepted' }, stdout: b64('yx'), stderr: null, compile_output: null },
    ]);

    const result = await engine(fetchFn).validate(codeChallenge, 'function reverse(s) { return [...s].reverse().join(""); }');

    expect(result.ok).toBe(true);
    if (!result.ok) throw new Error('unreachable');
    expect(result.value.isCorrect).toBe(true);
    expect(result.value.testResults).toHaveLength(2);
  });

  it('never leaks a hidden test case\'s input/expected/actual output', async () => {
    const fetchFn = fakeFetch([
      { status: { id: 3, description: 'Accepted' }, stdout: b64('cba'), stderr: null, compile_output: null },
      { status: { id: 4, description: 'Wrong Answer' }, stdout: b64('wrong'), stderr: null, compile_output: null },
    ]);

    const result = await engine(fetchFn).validate(codeChallenge, 'function reverse(s) { return "wrong"; }');

    expect(result.ok).toBe(true);
    if (!result.ok) throw new Error('unreachable');
    expect(result.value.isCorrect).toBe(false);
    const hiddenResult = result.value.testResults?.find((r) => r.hidden);
    expect(hiddenResult).toEqual({ passed: false, hidden: true });
    expect(hiddenResult).not.toHaveProperty('input');
    expect(hiddenResult).not.toHaveProperty('expectedOutput');
    expect(hiddenResult).not.toHaveProperty('actualOutput');

    const visibleResult = result.value.testResults?.find((r) => !r.hidden);
    expect(visibleResult).toMatchObject({ passed: true, input: 'abc', expectedOutput: 'cba', actualOutput: 'cba' });
  });

  it('short-circuits on a compilation error without judging every test case', async () => {
    const fetchFn = fakeFetch([
      {
        status: { id: 6, description: 'Compilation Error' },
        stdout: null,
        stderr: null,
        compile_output: b64('SyntaxError: unexpected token'),
      },
    ]);

    const result = await engine(fetchFn).validate(codeChallenge, 'function reverse(s) {');

    expect(result.ok).toBe(true);
    if (!result.ok) throw new Error('unreachable');
    expect(result.value.isCorrect).toBe(false);
    expect(result.value.compileError).toBe('SyntaxError: unexpected token');
    expect(result.value.testResults).toBeUndefined();
    expect((fetchFn as unknown as { requests: unknown[] }).requests).toHaveLength(1);
  });

  it('surfaces a runtime error once, from the first test case that crashed', async () => {
    const fetchFn = fakeFetch([
      {
        status: { id: 11, description: 'Runtime Error (NZEC)' },
        stdout: null,
        stderr: b64('TypeError: s.reverse is not a function'),
        compile_output: null,
      },
      { status: { id: 11, description: 'Runtime Error (NZEC)' }, stdout: null, stderr: b64('same crash again'), compile_output: null },
    ]);

    const result = await engine(fetchFn).validate(codeChallenge, 'function reverse(s) { return s.reverse(); }');

    expect(result.ok).toBe(true);
    if (!result.ok) throw new Error('unreachable');
    expect(result.value.isCorrect).toBe(false);
    expect(result.value.runtimeError).toBe('TypeError: s.reverse is not a function');
  });

  it('encodes source_code/stdin/expected_output as base64 and disables the network', async () => {
    const fetchFn = fakeFetch([
      { status: { id: 3, description: 'Accepted' }, stdout: b64('cba'), stderr: null, compile_output: null },
      { status: { id: 3, description: 'Accepted' }, stdout: b64('yx'), stderr: null, compile_output: null },
    ]);

    await engine(fetchFn).validate(codeChallenge, 'SOURCE');

    const requests = (fetchFn as unknown as { requests: RequestInit[] }).requests;
    const firstRequest = requests[0];
    if (firstRequest === undefined) throw new Error('expected at least one request');
    const sentBody = JSON.parse(firstRequest.body as string);
    expect(sentBody.source_code).toBe(b64('SOURCE'));
    expect(sentBody.stdin).toBe(b64('abc'));
    expect(sentBody.expected_output).toBe(b64('cba'));
    expect(sentBody.language_id).toBe(63);
    expect(sentBody.enable_network).toBe(false);
  });

  it('returns EXTERNAL_SERVICE, not a false negative, when Judge0 is unreachable', async () => {
    const failingFetch = (async () => {
      throw new Error('ECONNREFUSED');
    }) as unknown as typeof fetch;

    const result = await engine(failingFetch).validate(codeChallenge, 'anything');

    expect(result.ok).toBe(false);
    if (result.ok) throw new Error('unreachable');
    expect(result.error.code).toBe('EXTERNAL_SERVICE');
  });

  it('returns EXTERNAL_SERVICE on a non-2xx HTTP response from Judge0', async () => {
    const badFetch = (async () => new Response('', { status: 503 })) as typeof fetch;

    const result = await engine(badFetch).validate(codeChallenge, 'anything');

    expect(result.ok).toBe(false);
    if (result.ok) throw new Error('unreachable');
    expect(result.error.code).toBe('EXTERNAL_SERVICE');
  });
});
