---
name: using-git-worktrees
description: Use when starting feature work that needs isolation from the current checkout, or before executing an implementation plan that would disturb the working tree - detects existing isolation first, then creates a linked worktree with git and runs every later command through an explicit working directory
---

# Isolated Workspaces with Git Worktrees

## Overview

Ensure work happens in an isolated workspace, and ensure the isolation is real.

**Core principle:** detect existing isolation first, then create one with git. This
deployment mounts no native worktree tool, so `git worktree` is the only mechanism
— there is no second path to look for.

**Two facts about this Harness that this skill depends on:**

1. **A session's working directory does not follow `git worktree add`.** The shell
   tool takes the directory per call (`workdir`); it does not keep a `cd`. Every
   command that must run inside the worktree passes `workdir` for that path, and
   no command relies on the session's directory having changed.
2. **There is no `EnterWorktree`/`WorktreeCreate` tool in this preset.** Do not
   spend a step looking for one; the tool list is what it is.

**Announce at start:** "I'm using the using-git-worktrees skill to set up an isolated workspace."

## Step 0: Detect existing isolation

**Before creating anything, check whether you are already isolated.** Run this in
the session's working directory:

```powershell
$gitDir = (Resolve-Path (git rev-parse --git-dir)).Path
$commonDir = (Resolve-Path (git rev-parse --git-common-dir)).Path
"linked worktree: $($gitDir -ne $commonDir)"
git branch --show-current
git rev-parse --show-superproject-working-tree
```

Resolve both paths before comparing: git prints one of them relative to the
current directory, so a text comparison reports the wrong answer.

**Submodule guard:** `--show-superproject-working-tree` printing a path means this
is a submodule, not a worktree. Treat it as a normal checkout.

**If `linked worktree: True` and not a submodule:** you are already in a linked
worktree. Skip to Step 2. Do not create another one. Report:

- on a branch: "Already in isolated workspace at `<path>` on branch `<name>`."
- detached HEAD: "Already in isolated workspace at `<path>` (detached HEAD). A
  branch is needed at finish time."

**Otherwise** you are in a normal checkout. If the user has not already stated a
worktree preference, ask before creating one:

> "Would you like me to set up an isolated worktree? It keeps the current branch
> untouched while I work."

A stated preference is not re-asked. If the user declines, work in place and skip
to Step 2 — and say in the report that the work happened on the current checkout.

## Step 1: Create the isolated workspace

### Directory

Explicit user preference wins over anything observed. Otherwise:

1. `.worktrees/` at the project root if it exists;
2. `worktrees/` if that exists instead;
3. otherwise `.worktrees/` at the project root.

**Verify the directory is ignored before creating the worktree:**

```powershell
git check-ignore -q .worktrees
if ($LASTEXITCODE -ne 0) { "not ignored" }
```

If it is not ignored, add it to `.gitignore` and commit that change first.
Otherwise the worktree's contents become part of the repository.

### Create

```powershell
git worktree add ".worktrees/<branch-name>" -b "<branch-name>"
```

**If `git worktree add` fails**, report the exact error and stop. Do not fall back
to working in the current directory: a session that says "isolated" while editing
the main checkout is worse than one that says the isolation failed.

From here on, every command for this work passes the worktree path explicitly:

```powershell
# workdir: <project>/.worktrees/<branch-name>
```

## Step 2: Project setup

Install the project's own dependencies, inside the worktree, in one call each.
Run only what the project actually declares — a missing manifest is not a reason
to guess a command.

| Manifest | Command |
|---|---|
| `package.json` | `npm ci` (or the lockfile's manager: `pnpm install --frozen-lockfile`) |
| `Cargo.toml` | `cargo build` |
| `pyproject.toml` | the project's own environment step, from its own README |
| `go.mod` | `go mod download` |

## Step 3: Verify a clean baseline

Run the project's test command **in the worktree** before changing anything:

```powershell
# workdir: <project>/.worktrees/<branch-name>
```

**If tests fail:** report the failures with their output and ask whether to
investigate first or proceed. A dirty baseline makes every later failure
ambiguous.

**If tests pass:** report ready.

### Report

```
Worktree ready at <full-path>
Baseline: <N> tests passing, 0 failures   (or: baseline failing, see above)
Every later command runs with workdir=<full-path>
Ready to implement <feature-name>
```

## Quick Reference

| Situation | Action |
|---|---|
| Already in a linked worktree | Skip creation (Step 0) |
| In a submodule | Treat as a normal checkout (Step 0 guard) |
| `.worktrees/` exists | Use it, after `git check-ignore` |
| `worktrees/` exists | Use it, after `git check-ignore` |
| Neither exists | Check instructions, then `.worktrees/` |
| Directory not ignored | Add to `.gitignore`, commit, then create |
| `git worktree add` refused | Report the error and stop |
| User declined isolation | Work in place, say so in the report |
| Baseline tests fail | Report the failures and ask before editing |

## Common Rationalizations

| Excuse | Reality |
|--------|---------|
| "I'm obviously not in a worktree — no need to check" | Harness-created isolation and submodules both fool eyeballing. Step 0 is three commands. |
| "I'll add the worktree, then `cd` into it" | There is no `cd` that persists. Pass `workdir` on each call or the command runs in the old directory. |
| "The worktree directory is surely ignored" | Run `git check-ignore`. An unignored worktree directory commits the whole tree. |
| "Creation failed, I'll just work in place" | Then the isolation claim is false. Report the failure. |
| "The workspace is fresh — baseline tests can wait" | A dirty baseline makes every later failure ambiguous. Run them now. |
| "Maybe this harness has a native worktree tool I should find" | This preset mounts none. Checking the tool list is cheap; hunting mid-task is not. |
