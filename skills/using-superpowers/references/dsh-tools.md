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

Nor does a child run the skill bootstrap: it is told to skip skill routing, and
it never saw this conversation. Whatever the child must follow has to be in the
prompt. What it does share is this preset — a child with no preset of its own
joins this one, so the persona's invariants (evidence labels, collection, no
fallbacks) still reach it. The prompt a child needs is in `qh-judgment`'s
`references/delegation.md`.

## Helper scripts

Several skills ship small helper scripts (`scripts/sdd-workspace.mjs`,
`scripts/task-brief.mjs`, `scripts/review-package.mjs`,
`scripts/task-start.mjs`, `scripts/task-done.mjs`, `scripts/sdd-repo.mjs`). They
are Node modules and need nothing but `node` on `PATH`:

- Call one as `node <absolute path to the script> <args>`, from the working tree
  the skill names. The skill prints the absolute path with the instruction.
- They write no temp files, capture no child output through pipes (that fails
  with `EPERM` under the Windows sandbox), and report failure through their exit
  status: 2 for a usage or location error, 3 and 4 for the specific refusals the
  skill describes.
- Non-zero exit means the action did not happen. Report its message; do not
  reimplement it from memory, and never pretend it ran.

## Plan mode

This deployment has a plan mode. When you are in it, do not edit files or run
mutating commands; present the plan with `exit_plan_mode` and wait for
approval. A conversational "sounds good" does not approve anything.

## Looking at a page

There is no visual companion: no review server, no click-to-answer channel. Do
not offer one. When seeing would help, write a text sketch, or write a
self-contained HTML file into the project and give your human partner its path.

If you want to look at that page yourself, `file:` URLs are blocked for the
browser tool (实测: the navigation is refused, which costs a call and tells you
nothing). Serve the directory from a short-lived local server bound to
`127.0.0.1`, look, then stop it in the same turn — a server nobody stopped is a
process left on the host.
