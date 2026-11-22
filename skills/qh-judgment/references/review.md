# Review

Part of `qh-judgment`. A review is a judgement with a verdict, not a list of
observations. This file says what each finding must carry and how the verdict is
reached.

## What a finding must contain

One finding, four parts:

1. **`file:line`** — where. A range when the defect spans lines.
2. **The failed expectation** — what the code does, and what it was supposed to
   do instead ("returns 0 for an empty input; the spec says it throws").
3. **A reproduction or the reason you have none** — the command, the input, or
   the test that fails. Without one, the finding cannot be HIGH (see below).
4. **The level** — CRITICAL / HIGH / MEDIUM / LOW.

A finding that cannot name (1) or (2) is a suspicion, and it is written as one:
"未复现：……，需要 …… 才能确认。它不影响本轮判定。"

## Levels and verdict

| Level | Meaning | Verdict | Behaviour |
|---|---|---|---|
| CRITICAL | security hole, data loss, silently wrong result, or a false claim in a deliverable | **BLOCK** | do not merge, do not hand over |
| HIGH | bug or significant quality defect on a real path | **WARN** | fix before merge |
| MEDIUM | maintainability, missing test for new behaviour, unexplained deviation from the plan | **INFO** | fix now or record why not |
| LOW | style, naming, preference, unreproduced suspicion | **NOTE** | optional |

The overall verdict is not an average:

- Any CRITICAL → **BLOCK**, whatever the rest says.
- No CRITICAL but any HIGH → **WARN**.
- Only MEDIUM/LOW → **Approve** with the list.
- Nothing found → say what you actually covered. "Approve" for a diff you did
  not open is a false report; say "未审查 `<path>`" instead.

## Review scope is stated before the verdict

Name the range and the files: `BASE..HEAD`, the files changed, and anything you
deliberately did not review. A reviewer who does not say what they skipped
implies they covered it.

## Check the claim, not the report

The author's summary is 推论 until you look. The cheapest sequence that actually
proves something:

1. Read the diff itself, not the description of it.
2. Run the test command yourself; do not trust a pasted result.
3. For a claimed fix, revert the fix and watch the test fail, then restore. A
   regression test that passes before the fix proves nothing.
4. For a claim about the environment (versions, paths, installed plugins), run
   the command; do not infer it from a log inside the diff.

## Reviewing a document or a plan

The same four parts, with the failed expectation replaced by the spec, decision,
or source the text contradicts:

- **Unsupported claim** — a number or a capability with no source. Level HIGH
  when someone would act on it, MEDIUM when it is background.
- **Contradiction** — two documents, or a document and the code, disagree. Give
  both `file:line` values; the reviewer does not pick a winner, the owner does.
- **Silent narrowing** — a scope cut that is not recorded where the cuts are
  logged. That is a MEDIUM even when the cut itself is reasonable.
- **Fatigue signals** — hedged verbs ("should", "probably") around a claim that
  a check would settle: run the check.

## Red flags in your own review

- A findings list with no verdict.
- A verdict with no finding at its level ("approve" but "some concerns").
- Repeating the author's framing as if independent.
- Level inflation: calling a preference CRITICAL, which makes the next real
  CRITICAL cheap.
- Level deflation: filing a reproduced bug as MEDIUM so the merge can proceed.
