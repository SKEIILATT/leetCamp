#!/usr/bin/env bash
#
# health.sh — the repository's quality gate.
#
# It exists so "is the repo healthy?" has ONE answer that a human, CI and an
# agent all obtain the same way. A gate that each person runs differently is not
# a gate.
#
# Steps, in order. THE FIRST FAILURE STOPS THE REST:
#
#   1. env       — pnpm present, Node satisfies engines.node, node_modules installed
#   2. coverage  — every workspace declares the scripts this script will invoke
#   3. secrets   — no client-prefixed variable in any .env* holds a privileged credential
#   4. typecheck — pnpm -r typecheck   (every workspace, not just one)
#   5. build     — pnpm -r build       (with tsc, never a transpile-only path)
#   6. tests     — pnpm -r test
#   7. lint      — pnpm lint           (root eslint, with the hexagonal boundaries)
#   8. e2e       — pnpm test:e2e       — OPT-IN, see below
#
# ── WHY STEP 2 EXISTS AT ALL ────────────────────────────────────────────────
# `pnpm -r <script>` SKIPS IN SILENCE any workspace that does not declare the
# script. A new package without a `typecheck` would sit outside the gate with
# nothing saying so, and steps 4-7 would keep printing green. Step 2 turns that
# silence into a visible failure, and it is the reason the exemption table lives
# in this file with a written reason per entry: if something is not checked, you
# read WHY here.
#
# ── WHY STEP 3 GOES SO EARLY ────────────────────────────────────────────────
# Because it costs milliseconds, and because building with an exposed secret
# produces an artefact you have to throw away regardless. It also runs the
# detector's own self-test first: a safeguard that has forgotten how to fail
# gives confidence without giving protection, so a green step 3 asserts TWO
# things — no exposed secrets AND a detector still capable of seeing them.
#
# ── WHY STEP 6 IS BLOCKING AND STEP 8 IS NOT ────────────────────────────────
# Unit tests are hermetic: no network, no database, no browser. There is no
# prerequisite a developer might not have installed, so making them blocking
# costs nothing and catches real regressions.
#
# The e2e suite needs a dev server and a browser binary. Failing the health
# check of someone who never ran the browser install would punish them for
# something unrelated to the repository's health. CI has no such problem and
# runs it in its own job. Locally: HEALTH_E2E=1.
#
# Step 6 runs AFTER build on purpose: there is no point interrogating the
# behaviour of a tree that is not yet known to compile, and a test failure on
# code that does not build is noise that hides the real fault.
#
# Usage:
#   bash health.sh              # summary; detail only for a failing step
#   bash health.sh --verbose    # full output of every step
#   bash health.sh --list       # print the coverage table and exit
#   HEALTH_E2E=1 bash health.sh # also run the e2e suite
#
# Exit: 0 if every step passes, 1 otherwise. The summary names the failing step
# and how to reproduce it by hand.

set -euo pipefail

REPO_ROOT="$(cd "$(dirname "${BASH_SOURCE[0]}")" && pwd)"
cd "$REPO_ROOT"

# ── Presentation ──────────────────────────────────────────────────────────────
if [ -t 1 ] && [ -z "${NO_COLOR:-}" ]; then
  C_RESET=$'\033[0m'; C_BOLD=$'\033[1m'; C_DIM=$'\033[2m'
  C_GREEN=$'\033[32m'; C_RED=$'\033[31m'; C_YELLOW=$'\033[33m'
else
  C_RESET=''; C_BOLD=''; C_DIM=''; C_GREEN=''; C_RED=''; C_YELLOW=''
fi

VERBOSE=0
LIST_ONLY=0
for arg in "$@"; do
  case "$arg" in
    -v|--verbose) VERBOSE=1 ;;
    --list)       LIST_ONLY=1 ;;
    # ⚠ The range ends at the last line of the header comment block (the line
    # before `set -euo pipefail`). If you add or remove header lines, adjust it —
    # otherwise --help either truncates the usage section or prints shell code.
    -h|--help)    sed -n '2,56p' "${BASH_SOURCE[0]}" | sed 's/^# \{0,1\}//'; exit 0 ;;
    *) echo "health.sh: unknown option '$arg' (try --help)" >&2; exit 2 ;;
  esac
done

# Step 8 only counts when it is requested. Otherwise the counter would say "1/8"
# and then skip a step, which is a cheap way to confuse whoever is watching.
RUN_E2E="${HEALTH_E2E:-0}"
if [ "$RUN_E2E" = "1" ]; then TOTAL_STEPS=8; else TOTAL_STEPS=7; fi
STEP_NUM=0
FAILED_STEP=''
FAILED_CMD=''
declare -a SUMMARY_LINES=()

LOG_DIR="$(mktemp -d "${TMPDIR:-/tmp}/health.XXXXXX")"
cleanup() { rm -rf "$LOG_DIR"; }
trap cleanup EXIT

hr() { printf '%s\n' "${C_DIM}────────────────────────────────────────────────────────────────${C_RESET}"; }

# record_step <name> <status> <detail>
record_step() {
  local name="$1" status="$2" detail="${3:-}"
  local color label
  case "$status" in
    OK)      color="$C_GREEN";  label='OK     ' ;;
    FAILED)  color="$C_RED";    label='FAILED ' ;;
    SKIPPED) color="$C_DIM";    label='SKIPPED' ;;
    *)       color="$C_YELLOW"; label="$status" ;;
  esac
  SUMMARY_LINES+=("$(printf '  %-12s %s%s%s %s' "$name" "$color" "$label" "$C_RESET" "$detail")")
}

# run_step <name> <human-readable command> -- <cmd...>
#
# Captures the output. On success it prints one line; on failure it dumps the
# whole output, so the fault is diagnosable without re-running the step.
run_step() {
  local name="$1" pretty="$2"; shift 3   # discard the '--'
  STEP_NUM=$((STEP_NUM + 1))
  local log="$LOG_DIR/$name.log"
  local started=$SECONDS

  printf '%s[%d/%d] %-10s%s %s%s%s\n' \
    "$C_BOLD" "$STEP_NUM" "$TOTAL_STEPS" "$name" "$C_RESET" "$C_DIM" "$pretty" "$C_RESET"

  local rc=0
  if [ "$VERBOSE" -eq 1 ]; then
    # The exit code is written to a side file: in a pipeline `$?` would be tee's.
    { "$@" 2>&1; printf '%s' "$?" >"$log.rc"; } | tee "$log"
    rc="$(cat "$log.rc")"
  else
    "$@" >"$log" 2>&1 || rc=$?
  fi

  local elapsed=$(( SECONDS - started ))

  if [ "$rc" -eq 0 ]; then
    printf '          %sOK%s (%ss)\n' "$C_GREEN" "$C_RESET" "$elapsed"
    record_step "$name" 'OK' "(${elapsed}s)"
    return 0
  fi

  printf '          %sFAILED%s (%ss, exit %s)\n' "$C_RED" "$C_RESET" "$elapsed" "$rc"
  if [ "$VERBOSE" -eq 0 ]; then
    echo
    echo "${C_DIM}── output of '$pretty' ─────────────────────────────${C_RESET}"
    cat "$log"
    echo "${C_DIM}── end of output ───────────────────────────────────${C_RESET}"
  fi
  record_step "$name" 'FAILED' "(${elapsed}s, exit $rc)"
  FAILED_STEP="$name"
  FAILED_CMD="$pretty"
  return 1
}

# Mark the steps that never ran because an earlier one failed. Without this they
# would simply be absent from the summary, which reads like they passed.
skip_remaining() {
  for name in "$@"; do
    STEP_NUM=$((STEP_NUM + 1))
    record_step "$name" 'SKIPPED' '(did not run: an earlier step failed)'
  done
}

print_summary() {
  echo
  hr
  printf '%sSUMMARY%s\n' "$C_BOLD" "$C_RESET"
  for line in ${SUMMARY_LINES[@]+"${SUMMARY_LINES[@]}"}; do printf '%s\n' "$line"; done
  hr
  # ── THE PART THAT MAKES THIS SCRIPT HONEST ─────────────────────────────────
  # A gate that only prints "GREEN" invites the reader to conclude more than the
  # gate actually checked. Stating the limits on every run is what keeps a green
  # result from being over-read. KEEP THIS SECTION UPDATED as the project grows:
  # a stale "what this does not cover" list is worse than none.
  cat <<EOF
${C_BOLD}HOW TO READ THIS${C_RESET}
  What a green run DOES guarantee:
    · Every workspace compiles under its tsconfig, with strict: true.
    · The hexagonal boundary holds: domain and application import no framework
      and no infrastructure (eslint-plugin-boundaries).
    · No client-prefixed variable in any .env* is a privileged credential, and
      the detector that checks it passed its own self-test in both directions.
    · The declared unit tests pass in every workspace that has them — see the
      'coverage' table above for who is exempt and why.

  What it does NOT guarantee:
    · That the application WORKS. These are static checks plus unit tests; none
      of them talks to a real database, and none starts the server.
    · That the configured credentials are valid. Step 3 asks "are we publishing
      privileges?", not "is this the right key?". A placeholder that does not
      look like a credential passes, and that is deliberate — CI builds with
      placeholders on purpose.
    · Anything about the UI, unless HEALTH_E2E=1 was set.
    · That the Docker images build or that the compose file is valid. A green
      run here says nothing about deployment.
EOF
  hr
}

# ── Header ────────────────────────────────────────────────────────────────────
printf '%s\n' "${C_BOLD}════════════════════════════════════════════════════════════════${C_RESET}"
printf '%s\n' " ${C_BOLD}leetcamp · health check${C_RESET}"
printf '%s\n' "${C_BOLD}════════════════════════════════════════════════════════════════${C_RESET}"

# ── STEP 1 · env ──────────────────────────────────────────────────────────────
STEP_NUM=1
printf '%s[1/%d] %-10s%s %s%s%s\n' "$C_BOLD" "$TOTAL_STEPS" 'env' "$C_RESET" \
  "$C_DIM" 'pnpm + engines.node + node_modules' "$C_RESET"

env_error() {
  printf '          %sFAILED%s %s\n' "$C_RED" "$C_RESET" "$1"
  record_step 'env' 'FAILED' "$1"
  FAILED_STEP='env'
  FAILED_CMD='environment verification'
  skip_remaining coverage secrets typecheck build tests lint
  if [ "${RUN_E2E:-0}" = "1" ]; then skip_remaining e2e; fi
  print_summary
  echo "${C_RED}${C_BOLD}HEALTH CHECK: FAILED${C_RESET} at step '${FAILED_STEP}'."
  echo "  -> $2"
  exit 1
}

command -v node >/dev/null 2>&1 || env_error 'node is not on PATH' \
  'Install Node (see engines.node in package.json) and run again.'
command -v pnpm >/dev/null 2>&1 || env_error 'pnpm is not on PATH' \
  'Install it: corepack enable'

NODE_VERSION="$(node --version)"
NODE_MAJOR="${NODE_VERSION#v}"; NODE_MAJOR="${NODE_MAJOR%%.*}"
PNPM_VERSION="$(pnpm --version)"

# `engines.node` and `packageManager` are READ from the root package.json: the
# minimum version lives in exactly one place and this script does not duplicate
# it. Duplicating it is how the two drift and the error message starts lying.
ENGINES_NODE="$(node --input-type=commonjs -e \
  "process.stdout.write(String(require('./package.json').engines?.node ?? ''))")"
PKG_MANAGER="$(node --input-type=commonjs -e \
  "process.stdout.write(String(require('./package.json').packageManager ?? ''))")"

REQUIRED_MAJOR="$(printf '%s' "$ENGINES_NODE" | tr -d ' ' | sed -E 's/^[^0-9]*([0-9]+).*/\1/')"
if [ -n "$REQUIRED_MAJOR" ] && [ "$NODE_MAJOR" -lt "$REQUIRED_MAJOR" ]; then
  env_error "Node $NODE_VERSION does not satisfy engines.node ('$ENGINES_NODE')" \
    "Switch to Node >=$REQUIRED_MAJOR."
fi

[ -d "$REPO_ROOT/node_modules" ] || env_error 'node_modules is missing' \
  'Run: pnpm install --frozen-lockfile'

# A pnpm version differing from `packageManager` is a WARNING, not a failure:
# corepack corrects it on its own and blocking here would stop work for no real
# risk.
PNPM_EXPECTED="${PKG_MANAGER#pnpm@}"
PNPM_NOTE=''
if [ -n "$PNPM_EXPECTED" ] && [ "$PNPM_EXPECTED" != "$PNPM_VERSION" ]; then
  PNPM_NOTE=" ${C_YELLOW}(packageManager declares pnpm@${PNPM_EXPECTED})${C_RESET}"
fi

printf '          %sOK%s node %s (engines: %s), pnpm %s%s\n' \
  "$C_GREEN" "$C_RESET" "$NODE_VERSION" "$ENGINES_NODE" "$PNPM_VERSION" "$PNPM_NOTE"
record_step 'env' 'OK' "node $NODE_VERSION, pnpm $PNPM_VERSION"

# ── STEP 2 · coverage ─────────────────────────────────────────────────────────
# See the header: `pnpm -r` skips missing scripts in silence. This turns that
# into a visible failure.
STEP_NUM=2
printf '%s[2/%d] %-10s%s %s%s%s\n' "$C_BOLD" "$TOTAL_STEPS" 'coverage' "$C_RESET" \
  "$C_DIM" 'every workspace declares the scripts that will be run' "$C_RESET"

COVERAGE_OUT="$LOG_DIR/coverage.txt"
set +e
node "$REPO_ROOT/scripts/check-coverage.mjs" >"$COVERAGE_OUT" 2>&1
COVERAGE_RC=$?
set -e

cat "$COVERAGE_OUT"
if [ "$COVERAGE_RC" -ne 0 ]; then
  printf '          %sFAILED%s workspaces are outside the quality gate\n' "$C_RED" "$C_RESET"
  record_step 'coverage' 'FAILED' '(workspaces missing required scripts)'
  FAILED_STEP='coverage'; FAILED_CMD='node scripts/check-coverage.mjs'
  skip_remaining secrets typecheck build tests lint
  if [ "${RUN_E2E:-0}" = "1" ]; then skip_remaining e2e; fi
  print_summary
  echo "${C_RED}${C_BOLD}HEALTH CHECK: FAILED${C_RESET} at step 'coverage'."
  echo '  -> Declare the missing scripts, or register the exemption with its reason.'
  exit 1
fi
printf '          %sOK%s\n' "$C_GREEN" "$C_RESET"
record_step 'coverage' 'OK' '(typecheck/build/test/lint declared or exempt)'

if [ "$LIST_ONLY" -eq 1 ]; then
  echo
  echo "${C_DIM}--list: secrets/typecheck/build/tests/lint were not run.${C_RESET}"
  print_summary
  exit 0
fi

# ── STEP 3 · secrets ──────────────────────────────────────────────────────────
# Two checks in one: the detector's self-test first, then the scan of the real
# .env* files. See the header for why both.
STEP_NUM=3
printf '%s[3/%d] %-10s%s %s%s%s\n' "$C_BOLD" "$TOTAL_STEPS" 'secrets' "$C_RESET" \
  "$C_DIM" 'no client-prefixed variable holds a privileged credential' "$C_RESET"

SECRETS_OUT="$LOG_DIR/secrets.txt"
set +e
{
  node "$REPO_ROOT/scripts/check-env-secrets.mjs" --self-test &&
  node "$REPO_ROOT/scripts/check-env-secrets.mjs"
} >"$SECRETS_OUT" 2>&1
SECRETS_RC=$?
set -e

cat "$SECRETS_OUT"
if [ "$SECRETS_RC" -ne 0 ]; then
  printf '          %sFAILED%s\n' "$C_RED" "$C_RESET"
  record_step 'secrets' 'FAILED' '(privileged credential with a client prefix)'
  FAILED_STEP='secrets'; FAILED_CMD='node scripts/check-env-secrets.mjs'
  skip_remaining typecheck build tests lint
  if [ "$RUN_E2E" = "1" ]; then skip_remaining e2e; fi
  print_summary
  echo "${C_RED}${C_BOLD}HEALTH CHECK: FAILED${C_RESET} at step 'secrets'."
  echo "  -> Reproduce with: ${FAILED_CMD}"
  echo '  -> Do NOT skip it and build anyway: the value would end up in the public bundle.'
  exit 1
fi
printf '          %sOK%s\n' "$C_GREEN" "$C_RESET"
record_step 'secrets' 'OK' '(detector verified + .env* scanned)'

# ── STEPS 4-7 · typecheck -> build -> tests -> lint ──────────────────────────
# ⚠ THE ORDER IS MIRRORED EXACTLY BY .github/workflows/ci.yml. If you reorder one,
# reorder the other. When they diverge, the same breakage stops at a different
# point locally and in CI, and you end up diagnosing two symptoms for one cause.
if ! run_step 'typecheck' 'pnpm -r typecheck' -- pnpm -r typecheck; then
  skip_remaining build tests lint
  if [ "$RUN_E2E" = "1" ]; then skip_remaining e2e; fi
  print_summary
  echo "${C_RED}${C_BOLD}HEALTH CHECK: FAILED${C_RESET} at step '${FAILED_STEP}'."
  echo "  -> Reproduce with: ${FAILED_CMD}"
  exit 1
fi

if ! run_step 'build' 'pnpm -r build' -- pnpm -r build; then
  skip_remaining tests lint
  if [ "$RUN_E2E" = "1" ]; then skip_remaining e2e; fi
  print_summary
  echo "${C_RED}${C_BOLD}HEALTH CHECK: FAILED${C_RESET} at step '${FAILED_STEP}'."
  echo "  -> Reproduce with: ${FAILED_CMD}"
  # The frontend build validates its environment and aborts when a variable is
  # missing. That failure looks nothing like a compile error, so it gets its own
  # hint rather than leaving the reader to decode a Zod dump.
  if [ -d "$REPO_ROOT/apps/web" ] && [ ! -f "$REPO_ROOT/apps/web/.env" ] \
     && [ ! -f "$REPO_ROOT/apps/web/.env.local" ]; then
    echo '  -> There is no apps/web/.env. The frontend build validates its VITE_*'
    echo '     variables and aborts if they are missing:'
    echo '       cp apps/web/.env.example apps/web/.env  (see docs/ENV_VARIABLES.md)'
  fi
  exit 1
fi

if ! run_step 'tests' 'pnpm -r test' -- pnpm -r test; then
  skip_remaining lint
  if [ "$RUN_E2E" = "1" ]; then skip_remaining e2e; fi
  print_summary
  echo "${C_RED}${C_BOLD}HEALTH CHECK: FAILED${C_RESET} at step '${FAILED_STEP}'."
  echo "  -> Reproduce with: ${FAILED_CMD}"
  echo '  -> A single workspace: pnpm --filter <name> test'
  exit 1
fi

# `pnpm lint` (root), NOT `pnpm -r lint`: it is a single tree-wide invocation,
# because eslint-plugin-boundaries has to classify imports that cross package
# borders and cannot do that one package at a time.
if ! run_step 'lint' 'pnpm lint' -- pnpm lint; then
  if [ "$RUN_E2E" = "1" ]; then skip_remaining e2e; fi
  print_summary
  echo "${C_RED}${C_BOLD}HEALTH CHECK: FAILED${C_RESET} at step '${FAILED_STEP}'."
  echo "  -> Reproduce with: ${FAILED_CMD}"
  exit 1
fi

# ── STEP 8 · e2e (opt-in) ─────────────────────────────────────────────────────
# The scaffold ships no e2e suite, so `test:e2e` may not exist yet. Asking for it
# and getting a "command not found" out of pnpm would read like a broken health
# check, so say what is actually going on instead.
if [ "$RUN_E2E" = "1" ] && ! node --input-type=commonjs -e \
     "process.exit(require('./package.json').scripts?.['test:e2e'] ? 0 : 1)"; then
  printf '%s[%d/%d] %-10s%s %s%s%s\n' "$C_BOLD" "$((STEP_NUM + 1))" "$TOTAL_STEPS" 'e2e' \
    "$C_RESET" "$C_DIM" 'no test:e2e script declared yet' "$C_RESET"
  record_step 'e2e' 'SKIPPED' '(HEALTH_E2E=1 but no test:e2e script exists)'
  RUN_E2E=0
fi

if [ "$RUN_E2E" = "1" ]; then
  if ! run_step 'e2e' 'pnpm test:e2e' -- pnpm test:e2e; then
    print_summary
    echo "${C_RED}${C_BOLD}HEALTH CHECK: FAILED${C_RESET} at step '${FAILED_STEP}'."
    echo "  -> Reproduce with: ${FAILED_CMD}"
    exit 1
  fi
else
  record_step 'e2e' 'SKIPPED' '(non-blocking: enable with HEALTH_E2E=1)'
fi

print_summary
printf '%s%sHEALTH CHECK: GREEN%s — %d/%d steps OK.\n' \
  "$C_GREEN" "$C_BOLD" "$C_RESET" "$TOTAL_STEPS" "$TOTAL_STEPS"
exit 0
