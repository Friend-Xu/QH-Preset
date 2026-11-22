# Delegation

Part of `qh-judgment`. A subagent is a fresh context you are responsible for.
This file is the completion contract plus the prompt a child actually needs in
this Harness.

## The completion contract

Applies to every agent at every depth — you, your children, their children.

1. **Your final message is the deliverable.** Never end a turn with "waiting for
   the background agents". A spawned task is not a completed task, and a child
   that finishes after your turn ended has its result orphaned: nobody collects
   it. If work is still running, you are not done.
2. **If you delegate, you own collection.** Wait for the result, integrate it,
   and only then return. Fire-and-forget delegation is forbidden.
3. **Decompose only when the work cannot fit in one context.** Depth is an
   outcome of task size, not a plan for looking thorough. Re-delegating a task
   already sized for one agent multiplies cost and loses the context that made
   it coherent.

Observed failure this contract exists for: a research task follows "run these in
parallel", spawns three children, and returns "waiting" as the final answer. All
three children succeed; all three results are lost. The parallel rule without
the completion contract produces zombie tasks.

## What a child gets in this Harness

- **No persona configuration.** Per-child personas are gone from the subagent
  tool; the role exists only in the text you send. If a skill says "dispatch an
  implementer", that sentence is the persona, and it must be in the prompt.
- **No skill routing.** A child is told to skip the skills bootstrap, and it
  never saw this conversation. Whatever discipline it must follow has to be
  written into the prompt.
- **The preset's persona still applies.** A child with no explicit preset joins
  the parent's preset revision, so the invariants (evidence labels, collection,
  no fallbacks) reach it. Do not rely on it for anything specific to *this* task.
- **Nothing else is inherited.** Not the files you read, not the plan, not the
  constraints the owner stated. Point the child at the files; quote the
  constraints.

## The prompt a child needs

Six parts. Missing any one is a defect in the delegation, not in the child:

1. **Role and scope** — one sentence: what it is and what it must not do.
2. **The task text** — the actual requirement, not a summary of it. When a plan
   file exists, hand it the extracted brief file, not a paraphrase.
3. **Acceptance criteria** — the checks that decide success, as commands where
   possible.
4. **What to read** — paths, and what each path is for.
5. **Report format** — exact sections, so the reply is usable without another
   round: what changed, the commands run and their results, what failed, what it
   could not verify.
6. **The evidence rule** — every claim labelled 实测 / 源码 / 推论, and failures
   reported by name instead of smoothed over.

## What comes back is a claim

A child's "done, tests pass" is 推论 for you until you check it:

- Read the diff, not the summary.
- Run the test command yourself.
- A child reporting success while the diff is empty, or while the suite is red,
  is a **HIGH** finding against the delegation — fix the prompt, not just the
  code.

A child that says it could not verify something is more useful than one that
says everything is fine. Reward the first by keeping it; treat the second as
unverified by default.

## Parallelism

Parallel children are for genuinely independent work. They are not free: each
one re-reads its own context, and you own every result. Before fanning out, be
able to name the integration step for each result — if you cannot, the fan-out
is a way to avoid deciding, and the deciding still happens, later, with less
context.
