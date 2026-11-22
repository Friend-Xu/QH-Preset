# Instincts

An instinct is one judgement rule that survived its evidence, stored where the
hook can put it in front of you without a skill load. It is the part of this
preset that learns inside a project.

This file is the contract: what goes in `.qh/instincts/`, when a rule earns a
place there, and how the hook treats it.

## Three places judgement can live

| Place | Owner | Loaded |
|---|---|---|
| Persona (the four invariants) | this bundle | always, in every request |
| A skill | this bundle | when a skill is routed to |
| An instinct | the project | whenever its trigger matches this session |

The rule of thumb: if it is true of all engineering work, it belongs in the
persona or a skill. If it is true of *this* project — "the sandbox needs
`workdir`", "the validator must reject empty scope" — it belongs here.

## Where and what

One rule per file, in `<project>/.qh/instincts/<id>.md`, where `<project>` is
the session's working directory. `.qh/` is already gitignored: instincts are the
owner's working notes, not a deliverable.

```markdown
---
id: no-retry-same-args
trigger: tool-error
evidence: session-bb82e844 seq 174
---
Recorded twice: the same command failed, was retried with identical arguments,
and failed again. Change the evidence source instead of repeating the call.
```

| Field | Required | Meaning |
|---|---|---|
| `id` | yes | lowercase slug; it is the rule's name in the injected text and in diagnostics |
| `trigger` | yes | when this rule becomes relevant; one of the tokens below |
| `evidence` | no | where the rule came from: a session id and seq, a file and line, an owner correction |
| `skill` | no | a skill to load when this rule fires |

The body is the instruction itself: at most 400 characters, imperative, and
short enough to act on mid-task.

## The trigger vocabulary

Exactly three forms. Anything else is rejected and reported.

| Token | Fires when |
|---|---|
| `always` | every request that renders the context |
| `tool-error` | this session has seen at least one failed tool call |
| `tool:<name>` | this session has called the tool `<name>`, whether it succeeded or failed |

Start with the narrowest trigger that still catches the case. `always` costs
context in every request; a rule that only matters while debugging should say
`tool-error`.

## When a rule earns a place

Promote on evidence, never on a hunch:

- **A failure repeated.** The same call failed twice with the same arguments —
  that is a fact about this project, not about this attempt.
- **A 推论 was disproved.** You reasoned something would work and the run said
  otherwise; the correction is worth keeping.
- **The owner corrected you.** Their correction outranks your inference.

Do not write an instinct for something a command can enforce — write the check
instead, and let it fail. Do not restate a skill; link it with `skill:` if the
sequence matters. Do not carry a number (a coverage threshold, a line limit)
whose source nobody can name.

## What the hook does with them

- Rules whose trigger matches are added to the request context under the name
  `quanheng:instincts`, next to the rules derived from this session's tool
  results.
- A file that cannot be parsed appears as a diagnostic line in that same
  context — `instincts: <file> 未通过解析：<reason>` — and every other rule still
  applies. A rule you wrote that is not in effect must be visible, not silently
  dropped.
- At most three rules are shown per request. When more match, the extra ones are
  counted in the text rather than listed: narrow the triggers or drop a rule.

## Worked example

A project where the test runner needs an explicit temp directory:

```markdown
---
id: pytest-basetemp
trigger: tool:pwsh
evidence: session-9c6fb552 seq 141
---
Run pytest with --basetemp inside the project. The default temp root has broken
ACLs here, and the suite fails during collection instead of running.
```

`trigger: tool:pwsh` keeps it out of conversations that never touch a shell.
