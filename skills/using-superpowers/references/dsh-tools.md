# DeepSeek Harness tool notes

Superpowers skills speak in **actions** — "dispatch a subagent", "create a todo",
"read a file". This file maps those actions onto the tools of this deployment.
Read it once; the skills themselves stay harness-neutral.

## Actions to tools

| Action in a skill | Tool here |
|---|---|
| Read a file / inspect an image | `read` (images with `read_image`) |
| Create or rewrite a file | `write` |
| Change part of a file | `edit` |
| Find files by path pattern | `glob` |
| Search file contents | `grep` |
| Run a command, a test, or a build | `pwsh` |
| Dispatch a subagent (`Subagent (general-purpose):` template) | `subagent` — put the filled template in `prompt` |
| Create a todo / set a status | `todo_write` |
| Load a skill | `skill` with the exact skill name |
| Ask your human partner a question | `ask_user_question` |
| Search the web / open a page | `web_search`, `web_fetch` |
| Hand over a file | `present` |

Skill names carry no namespace here. Upstream writes them with its project
prefix; in this deployment you name the skill directly — `brainstorming`, not a
prefixed form.

## Subagents

`subagent` starts a child with a fresh context. Fill the skill's prompt
template (`implementer-prompt.md`, `task-reviewer-prompt.md`, …) and pass the
whole filled text as `prompt`. A child does **not** inherit this session's
history.

This Harness version dropped per-child personas: you cannot attach a role by
configuration. Put the role, the acceptance criteria, and the report format
inside the prompt. If a skill tells you to dispatch "an implementer" or "a
reviewer", that sentence is the persona.

If you dispatch, you own collection: wait for the child, integrate what it
found, then finish your turn.

## Shell scripts written for bash

Several skills run small helper scripts (`scripts/sdd-workspace`,
`scripts/task-brief`, `scripts/review-package`, `scripts/task-start`,
`scripts/task-done`) whose first line is `#!/usr/bin/env bash`. `bash` is not
on this machine's `PATH`; Git for Windows supplies one at an absolute path.

- Check it first: `Test-Path 'D:\Program Files\Git\bin\bash.exe'`.
- Present: call it with the script and its arguments,
  `& 'D:\Program Files\Git\bin\bash.exe' <script> <args>`, from the working
  tree the skill names.
- Absent: say the helper cannot run and stop there. Do not reimplement it from
  memory, and never pretend it ran.

## Plan mode

This deployment has a plan mode. When you are in it, do not edit files or run
mutating commands; present the plan with `exit_plan_mode` and wait for
approval. A conversational "sounds good" does not approve anything.

## Visual companion

Not available. There is no browser server and no click-to-answer channel. Do
not offer one. When seeing would help, write a text sketch, or write a
self-contained HTML file into the project and give your human partner its path.
