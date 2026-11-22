---
name: eval-harness
description: Use when a result's quality cannot be settled by one unit test — agent or prompt or skill behaviour, report quality, a workflow that must be repeatable — or when you need pass/fail criteria defined before building, a regression suite for a skill or preset change, or a reliability number (pass@k, pass^k) for a task you will run more than once.
metadata:
  origin: ECC
  upstream: affaan-m/ECC 2.2.3
  path: eval-harness/SKILL.md
---

# Eval Harness

Evals are the unit tests of agent work: define the pass condition before you
build, run it every time the thing changes, and keep the number.

**Boundary:** `test-driven-development` owns code behaviour — a failing test
first. This skill is for the outcomes a unit test cannot capture: did the agent
follow the process, is this report usable, does this skill still trigger. When a
plain test can decide it, write the plain test; do not dress it up as an eval.

## Define first

Before implementation, write the eval definition. Two kinds, both cheap to state
and hard to fake:

```markdown
## EVAL: <feature>

### Capability evals — can it do something it could not before
1. <observable outcome>
2. ...

### Regression evals — did it break something that worked
1. <outcome that must stay true>
2. ...

### Graders
- <eval id>: code | rule | model | human — <the command or rubric>

### Metrics
- capability: pass@k with k = <n> — <why n>
- regression: pass^k = 1 for release-critical paths
```

An eval you cannot run with a command or a named rubric is not defined yet. "The
report reads well" becomes a rubric with three named checks, or it becomes a
human grader with a yes/no question.

## Four graders

| Grader | Use it for | In this Harness |
|---|---|---|
| **code** | anything a command decides | `pwsh` command, `node --test`, a script's exit code and printed counts |
| **rule** | structure and presence | `grep`, `glob`, a `check-*.mjs` style assertion list |
| **model** | open-ended quality, with a rubric | `workflow` with one `agent(prompt, { schema })` — the schema makes the verdict a validated object, not prose; or `subagent` with an exact reply format |
| **human** | ambiguous, costly, or taste | `ask_user_question` with the verdict as options and the evidence in the question |

A model grader is a measurement, so the rubric is fixed before you run it. A
rubric written after seeing the output measures the output you already have.

## Metrics

- **pass@k** — at least one success in k attempts. Use k=3 for a task whose
  first attempt often misses, and report pass@1 alongside it.
- **pass^k** — all k attempts succeed. Use for release-critical paths, where
  "usually works" is the defect.

**Cost is part of the definition.** Every attempt is a real run with real spend.
State k in the definition, get agreement for k > 1 up front, and never report a
pass@3 you measured with one run. A k=1 run is reported as pass@1, or as a single
observation when the task is not repeatable.

Do not report a metric for a path you did not exercise. "0 regressions" from a
suite that never touched the changed code is a false report.

## Run and record

- Definition: `docs/evals/<feature>.md` — committed, beside the plan it gates.
- History and baselines: `.qh/evals/<feature>.log`, `.qh/evals/baseline.json` —
  tool state, in the project, self-ignoring (same shape as `.superpowers/sdd/`).
- Report: the numbers, the graders used, what was skipped and why, and the
  verdict in the review format from `qh-judgment`.

```markdown
EVAL REPORT: <feature>
========================
Capability: 3/3 (pass@1 2/3, pass@3 3/3)
Regression: 3/3 (pass^3 = 1)
Skipped:    <path> — <reason>
Verdict:    WARN — <the HIGH finding that keeps it off a release path>
```

## Anti-patterns

- Tuning the prompt against the eval examples until they pass: that measures the
  examples.
- Happy path only, so every eval is green and the interesting failures are not
  in the suite.
- A flaky grader in a release gate — a check that changes verdict between runs is
  not a check.
- Reporting pass rates while ignoring the cost or latency of getting them.
- Treating a green eval as permission to skip review. It narrows what to look
  at; it does not look.

## Example: this preset

The preset's own behaviour is an eval target: does a fresh session trigger the
right skill before writing code?

```markdown
## EVAL: preset-skill-triggering
### Capability
1. A build request loads `brainstorming` before any project write
2. An implementation request loads `test-driven-development`
### Graders
- 1: code — `node scripts/assert-session.mjs <log> --skill-order using-superpowers,brainstorming --no-write-before brainstorming`
- 2: model — one grader agent reads the session chain against a fixed rubric
### Metrics
- pass@1 per probe; k > 1 only with spend agreed first
```

That command is the whole point: the eval is a check that runs, not a paragraph
that asserts.
