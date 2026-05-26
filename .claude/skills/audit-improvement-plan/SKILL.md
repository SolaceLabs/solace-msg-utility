---
name: audit-improvement-plan
description: Wipe docs/improvement-plan.md, perform an independent scan for bugs, uncovered code, over-broad v8 ignores, and ceremonial tests, then document findings as OPEN items for user review. Does not modify source or test files.
trigger: /audit-improvement-plan
---

# /audit-improvement-plan

Run a fresh objective audit of the SolaceMessageUtility codebase along four axes — **bugs / incorrect code**, **coverage gaps**, **over-broad v8 ignores**, **ceremonial tests** — then document the findings in `docs/improvement-plan.md` as OPEN items for the user to review. **Do not modify source or test files.** The user reviews the documented plan and decides what ships.

## When to invoke

The user types `/audit-improvement-plan` or asks for any of:
- "wipe improvement plan and do a fresh scan/audit"
- "find bugs, uncovered code, ceremonial tests"
- "scan v8 ignores"
- Any combination of "audit" + "improvement plan"

## Hard boundaries

- **Read-only** on source, tests, configs, and CLAUDE.md.
- **One write** allowed: `docs/improvement-plan.md`.
- **No commits, no test runs, no `npm` / `npx` invocations.**
- **All findings are OPEN.** Do not "ship" or close them. The user decides.

## Prerequisites

Before scanning, verify these files exist. If any are missing, stop and tell the user how to produce them — do NOT proceed with a partial scan.

| File | Purpose | If missing |
|---|---|---|
| `docs/improvement-plan.md` | Existing plan with Historical Ledger to preserve | Tell user the file is missing and ask whether to create from scratch |
| `coverage/summary.txt` | Top-line totals (Statements/Branches/Functions/Lines %) | Tell user to run `npm run test:coverage` and re-invoke |
| `coverage/coverage.txt` | Per-file table with **uncovered line numbers** — easiest first-pass scan | Tell user to run `npm run test:coverage` and re-invoke |
| `coverage/lcov.info` | Source of truth for **branch** entries (BRDA) — needed when `coverage.txt` shows a branch gap but no uncovered line | Tell user to run `npm run test:coverage` and re-invoke |
| `CLAUDE.md` | Defines v8-ignore categories, required-element policy, coverage policy | Tell user the file is missing — audit can't apply project conventions |
| `graphify-out/GRAPH_REPORT.md` | OPTIONAL — speeds up navigation | If missing, fall back to direct file reads |

These three coverage files are emitted together by `vitest.config.ts`'s `text-summary`, `text` (file-bound), and `lcovonly` reporters. If `coverage/` exists but only some are present, the user has an outdated config — tell them to re-run `npm run test:coverage` so all three regenerate.

## Procedure

### Phase 1 — Read state (parallel)

In a single message, read:
1. `docs/improvement-plan.md`
2. `CLAUDE.md`
3. `coverage/summary.txt` — top-line %s, anchors the audit's "how far from 100%" framing
4. `coverage/coverage.txt` — per-file table; the **Uncovered Line #s** column is your starting list of source locations to inspect
5. `coverage/lcov.info` — only the parsed parts you need for branch-level detail (see Phase 2.B)
6. `graphify-out/GRAPH_REPORT.md` if it exists

Identify:
- The Historical Ledger boundaries (preserve verbatim).
- Any existing "Fresh Audit — YYYY-MM-DD" sections (these get wiped and replaced).
- The current v8-ignore policy categories sanctioned by CLAUDE.md.
- The current totals from `summary.txt` — quote the exact `Statements / Branches / Functions / Lines` percentages in the new audit's header so the delta from 100% is visible at a glance.

### Phase 2 — Scan along the four axes

Run all four axis scans before writing anything to `docs/improvement-plan.md`. Each axis produces a list of findings with location + current state + proposed fix.

#### 2.A — Bugs / incorrect code

Scan source files for:
- **Deprecated APIs**: `keypress`, `unload`, `mutationevent`, `webkitTransitionEnd`, etc. — search with Grep.
- **Inconsistencies between sibling modules**: e.g. one module switched `keypress` → `keydown` but the other didn't. Look for paired patterns and verify symmetry.
- **Dead defensive code that violates CLAUDE.md "don't validate scenarios that can't happen"**:
  - `if (X && X.length > 0)` where `X` is guaranteed by a factory like `defaultActiveFilters()` (companion: re-read CLAUDE.md's required-element policy).
  - `if (els.X)` guards on elements that are listed in the module's `required()` selector list.
  - `if (!els.X)` / `if (!els.X) return` guards — **same anti-pattern in negated form**, easily missed if you only grep the affirmative. Run BOTH greps:
    ```sh
    grep -rnE "if\s*\(\s*els\.\w+\s*\)" src/
    grep -rnE "if\s*\(\s*!\s*els\.\w+\s*\)" src/
    grep -rnE "if\s*\(\s*!\s*els\.\w+\s*&&|\|\|\s*!\s*els\.\w+" src/  # compound null-checks
    ```
  - **NodeList null-checks are always dead**: `querySelectorAll(...)` returns an empty NodeList for zero matches, never `null` or `undefined`. Any `if (!els.someNodeList) ...` guard on the result is literally unreachable. Grep `querySelectorAll` call sites, then grep for their assigned variable name in negated guards.
- **Sibling-module scoping miss**: when you enumerate affected guards across one module (e.g. `queue-browser/ui-*`), also sweep the SAME pattern across sibling modules (`connections/*`, `queue-discovery/*`). The full `src/` grep above catches this; the risk is enumerating only part of it in the findings table. Every hit from the greps must appear in the table or be explicitly marked "out of scope, reason …" — silence is a scoping bug.
- **Race-condition guards on impossibilities**: `if (timer)` checks that protect a state the lifecycle doesn't allow.
- **Off-by-one or truthy-coerce bugs**: `n != null` vs `n !== undefined`, `|| ''` fallbacks where the source is already typed as string.

When you scope a dead-code finding (like DEAD-1), enumerate EVERY hit from the greps in the finding's table. If you intentionally omit some (say, because they're in a different module and you want separate findings), add an **"Out of scope — sibling hits"** sub-bullet listing each with its file:line. A finding that omits a grep hit without acknowledgement is a silent scoping bug — downstream cleanup will miss the same lines.

For each finding: capture file path, line range, current snippet, the principle it violates, and a one-line proposed fix, alternate fix if it exists, rationale why proposed fix is better.

#### 2.B — Coverage gaps (text-table-first, lcov for branch detail)

**Start with `coverage/coverage.txt`** — it's the same per-file table v8 prints to stdout, with an **Uncovered Line #s** column. Read it top-to-bottom; any file showing < 100% on any metric is a candidate. The table is small enough to scan in one Read call.

```
File                         | % Stmts | % Branch | % Funcs | % Lines | Uncovered Line #s
src/core/dom.ts              |   85.71 |       75 |     100 |     100 | 20
src/modules/connections/...  |   99.54 |    95.69 |     100 |     100 | 42-44,62,113
```

A file at **100% lines but < 100% branches** has untaken branch paths that don't show in the line column — those are only visible in lcov (`BRDA:...,0`). For each file in that state, drop to lcov to enumerate the missing branches.

**lcov fallback** — parse `coverage/lcov.info`. Two patterns matter:

```
DA:line,0     → line uncovered
BRDA:line,block,branch,0  → branch never taken
```

Use Bash awk:
```sh
# Uncovered lines per file (redundant with coverage.txt — use only if coverage.txt is stale)
awk '/^SF:/ {f=$0; sub(/SF:/, "", f)} /^DA:[0-9]+,0$/ {print f": "$0}' coverage/lcov.info

# Untaken branches per file (NOT visible in coverage.txt — must come from lcov)
awk '/^SF:/ {f=$0; sub(/SF:/, "", f)} /^BRDA:.*,0$/ {print f": "$0}' coverage/lcov.info
```

For each entry:
1. Read the source file at the named line to understand what's there.
2. Read the corresponding test file(s) to see if a test is missing or just doesn't reach the branch.
3. Decide whether the gap warrants:
   - **A new test** — write a self-contained test spec. Only propose this if the uncovered code has a *real* failure mode a user or caller could hit. If the only way to reach it is by contriving state the system can't actually produce, the gap is not worth a test.
   - **Strengthening an existing test** — point at the file/test by name.
   - **Removing the code** — if the branch is unreachable / dead defensive.

**Do not propose a test just to turn a red line green.** Every proposed test must answer: *what real-world scenario does this protect against, and what regression would slip through without it?* If the answer is "it hits the line for coverage," the correct fix is usually to remove the code (dead defensive) or tighten a v8 ignore with justification — not to add a ceremonial test. A 100% target is a guardrail, not a mandate to test trivia.

For each finding: lcov entry, source location, root cause, proposed test (or removal), **why the scenario matters** (one sentence on the real failure it prevents), expected outcome (line-X covered / branch-Y reaches both sides).

#### 2.C — Over-broad v8 ignores

Find every `/* v8 ignore */` block:
```sh
grep -rn "v8 ignore" src/
```

For each block, ask three questions:
1. **Is it covering reachable code?** If yes, the ignore is hiding a real coverage gap. Propose removing the ignore and either testing the code or deleting it.
2. **Does it span more lines than necessary?** A `start/stop` block over a 20-line function when only 1 line is genuinely untestable should be tightened to a `next` directive on that one line.
3. **Does the justification match a CLAUDE.md sanctioned category?** Sanctioned: jsdom environment limits, SDK callbacks the test harness can't fire, defensive catches around contracts that never throw. NOT sanctioned: DOM null-guards on required elements, "this is hard to test" without a multi-option justification.

For each finding: file:line range, current ignore reason, the violation, proposed fix (remove / tighten / re-justify).

#### 2.D — Ceremonial tests

A test is ceremonial when it executes code without meaningfully verifying behavior — it exists to satisfy a coverage line, a habit, or a checklist, not to catch a real regression. Apply this litmus test to every suspect: *if I deleted this test, what real bug could now ship undetected?* If the answer is "none" or "I'd have to invent a contrived failure mode," it's ceremonial. Flag it for deletion or strengthening — do not preserve it just because it passes.

Common ceremonial shapes:
- Tests that assert *the function ran* rather than *the function did the right thing*.
- Tests that re-verify framework or language guarantees (e.g. that a `const` doesn't change, that a typed parameter is the right type).
- Tests written to cover a `/* v8 ignore */`-adjacent line where the underlying code is dead defensive — the right move is deleting the code, not testing it.
- Tests duplicated across files because the same scenario was added twice during different sessions.

Scan `tests/` for patterns that indicate weak assertions:

```sh
# Bare-comment tests — assertion replaced by a comment
grep -rn -E "// Should not throw|// No error|// Should not crash" tests/

# .not.toThrow() with no follow-up state assertion in the same `it`
# (manual inspection — search for `.not.toThrow()` and read the surrounding `it`)

# Empty/missing assertions — `it(...)` blocks with no `expect(`
# (manual inspection — open each test file)
```

Also look for:
- **Duplicate `describe` blocks** in the same file (e.g. `describe('foo()')` followed by `describe('foo() additional')` with the same content).
- **Weak substring matchers**: `.toContain('500')` could match `'5000ms'`. Prefer `.toBe('exact 500 phrase')` or anchored regex.
- **Event-dispatch tests with no downstream assertion**: `input.dispatchEvent(new KeyboardEvent('keypress', ...))` followed by no `expect`.
- **Tests that only verify the function was called** when the meaningful assertion is on the call's effect: `expect(fn).toHaveBeenCalled()` is weaker than `expect(fn).toHaveBeenCalledWith(...)` or `expect(state.X).toBe(Y)`.

For each finding: file path, test name, what's weak about it, proposed strengthening (specific assertion to add, or "delete — duplicate of [other test]").

### Phase 3 — Write the improvement plan

Open `docs/improvement-plan.md` and:

1. **Preserve** the top-level title, codebase version, and the "Historical Ledger" section verbatim. Update the "Last audit" date to today.
2. **Wipe** any existing "Fresh Audit — YYYY-MM-DD" sections (the old open items).
3. **Append a new section** titled `## Fresh Audit — YYYY-MM-DD (OPEN — for review)`.

Inside the new section, add a one-paragraph header noting the user's three asks and that all items are OPEN. Then list findings grouped by tier:

```markdown
### Tier 1 — Bugs / Incorrect Code
#### B1 [BUG] — <one-line summary>

**Location:** <file:line-range>
**Current code:** <snippet>
**Problem:** <why it's wrong, citing CLAUDE.md or sibling-module precedent>
**Proposed fix:** <concrete change>
**Test impact:** <what tests need editing / adding / deleting>

[B2, B3, …]

### Tier 2 — Dead-code removal
#### DEAD-1 — <summary>
[same structure]

### Tier 3 — v8 Ignore reductions
#### IGNORE-1 — <summary>
[same structure]

### Tier 4 — Coverage gaps
#### COV-1 — <summary>
**Lcov:** <entry>
**Proposed test:** <self-contained spec>

### Tier 5 — Ceremonial test strengthening
#### CER-1 — <table or per-test breakdown>
```

Close with a **summary table**:

```markdown
## Summary
| Item | Type | Severity |
|---|---|---|
| B1 | Bug | Medium |
| ... | ... | ... |
```

And a **suggested ship order** that minimises test breakage (typically: bugs first, dead code, ignore removals, then additive tests, then ceremonial strengthening).

### Phase 4 — Report

Tell the user:
- Counts per tier (e.g. "2 bugs, 2 dead-code, 2 ignore reductions, 13 coverage gaps, 2 ceremonial").
- Path to the updated plan.
- Confirmation that no source / test / config files were modified.
- Suggested next step: review the plan and pick which items to ship.

## Finding ID convention

- `B1, B2, …` — Bugs
- `DEAD-1, DEAD-2, …` — Dead defensive code
- `IGNORE-1, IGNORE-2, …` — Over-broad v8 ignores
- `COV-1, COV-2, …` — Coverage gaps (one per uncovered branch/line, not one per file)
- `CER-1, CER-2, …` — Ceremonial test groups (one per test file is fine)

Sequential numbering restarts each audit; the prior audit's IDs aren't preserved (that's what the Historical Ledger is for).

## Anti-patterns to avoid

- **Don't** edit source/test files even if you spot a "trivial" fix mid-scan. Document and move on.
- **Don't** skip the historical ledger preservation — that's the project's record of what shipped before.
- **Don't** propose fixes that can't be verified by reading the code (e.g. "this might be a security issue if untrusted input reaches it" — only flag when the data flow is actually present).
- **Don't** flag tests as ceremonial just because they're short. The test in question must lack assertion power, not just lines.
- **Don't** propose new tests purely to close a coverage gap. Every COV-* finding needs a *why this scenario matters* line; if you can't write that line truthfully, the finding belongs as a DEAD-* (remove the code) or IGNORE-* (justified skip), not as a new test.
- **Don't** treat the 100% coverage target as license for ceremonial tests. The target exists to surface real gaps; testing for the sake of testing degrades the suite by adding noise that future maintainers must read, debug, and update.
- **Don't** invent findings to fill out a tier. If a tier has zero findings, write "None — clean on this axis."

## Output expectations

- Plan length: typically 200–500 lines depending on findings.
- Tone: terse, factual. No hedging, no "may want to consider".
- Format: GitHub-flavoured Markdown, conforming to the existing improvement-plan.md style (tables, code fences, links).

## Verification (manual, by user)

After the skill runs, the user can spot-check:
1. `git status` shows only `docs/improvement-plan.md` modified.
2. The Historical Ledger paragraph is intact at the top of the file.
3. The new "Fresh Audit" section header quotes the totals from `coverage/summary.txt` verbatim.
4. The new "Fresh Audit" section enumerates each finding with file:line and a proposed fix.
5. Coverage figures cited match `coverage/coverage.txt` (per-file table) and `coverage/lcov.info` (branch entries) — the user can re-run `awk` on lcov or re-read `coverage.txt` to confirm.
