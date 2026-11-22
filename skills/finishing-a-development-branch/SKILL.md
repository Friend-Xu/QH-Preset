---
name: finishing-a-development-branch
description: Use when implementation is complete and the tests pass, and you must decide how to integrate the work - verifies the suite, detects whether the checkout is a linked worktree, presents the integration options, and cleans up only what this workflow created
---

# Finishing a Development Branch

## Overview

**Core principle:** verify tests → detect environment → present options → execute the choice → clean up only what this workflow created.

**Two facts about this Harness:**

1. **Shell state does not persist between calls.** There is no `cd` that carries over;
   every command names its directory with `workdir`. The values you capture in
   Step 2 are written into each later command.
2. **This preset mounts no workspace-exit tool.** There is no `exit_worktree` here;
   leaving a worktree means removing it with `git worktree remove`, or leaving it
   in place and saying so.

**Announce at start:** "I'm using the finishing-a-development-branch skill to complete this work."

## Step 1: Verify Tests

Run the project's full suite in the tree you are about to integrate (`npm test`,
`cargo test`, `pytest`, `go test ./...`) with `workdir` set to that tree.

**If tests fail**, report and stop. The menu comes after a green suite:

```
Tests failing (<N> failures). Must be fixed before completing:

<failures>
```

## Step 2: Detect the environment

```powershell
$gitDir = (Resolve-Path (git rev-parse --git-dir)).Path
$commonDir = (Resolve-Path (git rev-parse --git-common-dir)).Path
"linked worktree: $($gitDir -ne $commonDir)"
git rev-parse --show-toplevel
git branch --show-current
```

Resolve both paths before comparing: git prints one of them relative to the current
directory, so a text comparison gives the wrong answer. Record three values in the
conversation, because nothing carries them forward: **is this a linked worktree**,
**the worktree path** (`--show-toplevel`), and **the current branch**.

| State | Menu | Cleanup |
|---|---|---|
| normal checkout | standard 3 options | nothing to remove |
| linked worktree, named branch | standard 3 options | this workflow created it (Step 6) |
| linked worktree, detached HEAD | reduced 2 options (no merge) | externally managed — leave it |

## Step 3: Determine the base branch

The base is what this work forked from: usually named in the plan, the
conversation, or the branch's upstream. If it is not already established, ask:
"This branch split from `<best guess>` — is that right?" Confirm before merging;
merging into the wrong base is expensive to undo.

## Step 4: Present the options

**Normal checkout and named-branch worktree:**

```
Implementation complete. What would you like to do?

1. Merge back to <base-branch> locally
2. Push and create a Pull Request
3. Keep the branch as-is (I'll handle it later)

Which option?
```

**Detached HEAD:**

```
Implementation complete. You're on a detached HEAD (externally managed workspace).

1. Push as new branch and create a Pull Request
2. Keep as-is (I'll handle it later)

Which option?
```

Present the menu as written and wait. The integration decision is your human
partner's; discarding the work happens only when they ask for it explicitly (see
below).

## Step 5: Execute the choice

### Option 1: merge locally

Run from the main checkout, never from inside the worktree:

```powershell
# workdir: <main checkout root>
git checkout <base-branch>
git pull
git merge <feature-branch>
```

Then run the test command again with `workdir: <main checkout root>`. A green run
before the merge proves nothing about the merged result.

If the merged result fails: stop, leave the branch and worktree untouched, and
investigate. Nothing has been pushed, so this is still local and recoverable.

Once the merged result is green, clean up (Step 6) and delete the branch:

```powershell
# workdir: <main checkout root>
git branch -d <feature-branch>
```

### Option 2: push and create a pull request

```powershell
# workdir: <worktree path>
git push -u origin <feature-branch>
# detached HEAD: git push origin HEAD:refs/heads/<new-branch>
```

Then open the request against `<base-branch>` with the forge's own tooling and
follow the repository's template. Report the URL.

If the forge CLI is not installed, say so and give the creation URL the push
printed; do not create the request by another route and do not claim one exists.
Keep the worktree — review feedback is fixed there.

### Option 3: keep as-is

Report: "Keeping branch `<name>`. Worktree preserved at `<path>`."

### If your human partner asks to discard the work

This path exists only in response to an explicit request to throw the work away.
Confirm first, and wait for the exact word:

```
This will permanently delete:
- branch <name>
- all commits: <commit-list>
- worktree at <path>

Type 'discard' to confirm.
```

Then clean up (Step 6) and force-delete the branch from the main checkout:

```powershell
# workdir: <main checkout root>
git branch -D <feature-branch>
```

## Step 6: Cleanup workspace

**Runs for Option 1 and for a confirmed discard.** Options 2 and 3 always keep the
worktree. Removal must run from **outside** the worktree, so every command here
uses `workdir: <main checkout root>` plus the absolute worktree path from Step 2.

**Normal checkout:** nothing to remove. Done.

**Worktree under `.worktrees/` or `worktrees/`:** this workflow created it, so it
may be removed:

```powershell
git worktree remove <worktree path>
git worktree prune
```

**If removal is refused** (`contains modified or untracked files`), the worktree
holds files that exist nowhere else. Never `--force` on your own initiative. Show
what is at stake and ask:

```powershell
git -C <worktree path> status --porcelain -uall
```

```
Worktree removal refused — these files were never committed:

<file list>

1. Commit them to <branch> before cleanup
2. Move them into <main checkout root>
3. Delete them (unrecoverable)

Which?
```

**Otherwise** the workspace belongs to the host: leave it in place and say so in
the report. This preset has no workspace-exit tool, so "leaving it" means exactly
that — do not invent a cleanup step.

## Quick Reference

| Option | Merge | Push | Keep worktree | Delete branch |
|---|---|---|---|---|
| 1. Merge locally | yes | – | – | yes |
| 2. Create PR | – | yes | yes | – |
| 3. Keep as-is | – | – | yes | – |
| Discard (explicit request only) | – | – | – | yes (force) |

## Common Rationalizations

| Excuse | Reality |
|---|---|
| "Tests passed earlier this session" | Run the suite on the tree you are about to integrate. A green run only proves the tree it ran on. |
| "They obviously want it merged" | Integration is your human partner's decision. Present the menu and wait. |
| "They seem done — I'll offer to discard it" | The menu is complete as written. Discard only on an explicit request. |
| "'Yeah, get rid of it' is confirmation" | Only the typed word `discard` authorizes deletion. |
| "The PR is up, so the worktree is clutter" | Review feedback is fixed there. It stays until the work lands. |
| "This other worktree looks stale — I'll clean it too" | Clean up only worktrees under `.worktrees/` or `worktrees/`. Everything else belongs to the host. |
| "Removal refused — `--force` just finishes the cleanup" | The refusal means files exist only there. `--force` destroys them permanently. |
| "The merged-result failure is probably flaky" | A failing merged result stops everything. Branch and worktree stay put while you investigate. |
| "The base branch is obviously main" | Confirm the fork point or ask. Merging into the wrong base is expensive to undo. |
| "The push was rejected — force-push will fix it" | A rejected push means the remote moved. Investigate; force-push only on an explicit request. |
| "I'll `cd` into the main checkout first" | Nothing persists. Pass `workdir` on the call that needs it. |
