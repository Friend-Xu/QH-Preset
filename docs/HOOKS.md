# The instinct hook

`hooks/` is the part of this bundle that runs rather than being read. It keeps a
project's own judgement rules — `.qh/instincts/*.md` — in the request context,
selected by what the current session has actually done, so the discipline does
not depend on remembering to load a skill.

The bundle mounts it as one preset row:

```yaml
- id: hooks
  name: '@quanheng/preset/hooks'
```

## Two channels, both the Harness's own

| Need | Mechanism | Where |
|---|---|---|
| Know what this session did | `ctx.on('tools/result', …)` | `tools/src/events.ts` — emit-only, scoped by `exec.agent` |
| Put text in front of the model | `ctx.systemPrompt.context({ text })` | `system-prompt/src/index.ts` — evaluated at assembly and admission refresh |

The loop materializes every context contribution into a durable runtime-context
`user/message` whose `source.sections` carries the contribution's name
(`agent-loop/src/runtime-context.ts:76-92`), and rewrites that message only when
the rendered contributions change. So injection is durable, attributable, and
inspectable from the session log; it is also idle when there is nothing to say,
because an empty contribution renders no section at all.

The registration uses `required: true` and `interpolate: false`:

- `required: true` — a deployment that suppresses optional runtime context must
  not silently drop the judgement rules.
- `interpolate: false` — captured text and instinct bodies are quoted verbatim;
  a `{{` inside them is prose, and interpolating it would throw during assembly.

## Why not `agent/pre-step`

The plan for this version said `agent/pre-step` injection. That path is real —
`time-context` uses it (`context/time-context/src/index.ts:199-242`) — but it
needs a `UserMessage`, built with `createUserMessage` from
`@deepseek-ai/dsh-llm`, which means a `peerDependencies` entry pinned to a
prerelease runtime (`0.2.3-alpha.1`) and a second resolving path for a bundle
that is installed by link.

`systemPrompt.context` reaches the same model-visible, durable place with no
import at all: the plugin resolves nothing outside its own directory. The cost
is that the text lands in the standard runtime-context slot before each request
instead of at a step boundary this code chooses. For standing discipline that is
the right slot.

DSH's own reminder subsystem does the same: `experimental/timeline` captures
via `tools/result` and injects via `systemPrompt.context`
(`experimental/timeline/src/reminders.ts:79-114`).

## What it deliberately does not do

- **No repeat-call detection.** `@deepseek-ai/dsh-repeat-tool-reminder` is
  already active in the profile: it counts consecutive identical calls and
  injects at thresholds `[3, 5, 8]`. A second implementation of the same
  judgement would be a second path, so this hook does not have one.
- **No rules written from captures.** Captures select which promoted instinct is
  relevant (`tool-error`, `tool:<name>`); they never author text. Rule-making is
  a judgement, and a judgement enters the prompt only because someone promoted
  it — see `skills/qh-judgment/references/instincts.md`.
- **No file writes.** Sessions keep captures in memory, bounded at 200 calls and
  released on `agent/disposed`. The only durable artifact is the instinct file
  the owner wrote.
- **No interception.** No `tools/pre-execute` gate, no blocked results. A
  reminder that turns a success into an error teaches the model to distrust the
  transcript.

## What counts as a failed tool call

`isError` is not the signal for a command failure. A shell tool reports a
non-zero exit as an ordinary result whose content ends in `[exit code: N]`, and
reserves `isError` for infrastructure failures — spawn errors, aborts, denials
(`shell/tool-pwsh/src/render.ts:5-8`). So `hooks/instincts.mjs` classifies a call
as failed when:

- the result is `isError`, **or**
- the result's canonical value carries a numeric `exitCode !== 0`.

The canonical value is the tool's structured output — for the shell tool,
`{ kind: 'foreground', exitCode, signal, timedOut, … }`. Reading the display
marker would tie this module to a format the tool is free to restyle.

## Failure behaviour

- **A malformed instinct file** produces a diagnostic line inside the injected
  text (`instincts: <file> 未通过解析：<reason>`). It is not swallowed and does not
  fail the request: the file is the owner's own input, and one bad file must not
  break a conversation — but it must be visible. This is the layout's only
  tolerated failure, and it is named in one place (`renderInstincts`).
- **An unreadable `.qh/instincts/` directory** produces the same kind of
  diagnostic.
- **A missing directory** is the defined empty state: the project has promoted
  nothing.
- **A duplicate `id`** keeps the first file read and reports the second.

## Verifying it

The plugin needs a Host restart after its own source changes: the preset's
plugin is not an HMR-managed package, so a recomposition reports
`application: restart-required`. Instinct *files* need no restart — they are
read on every assembly.

```powershell
node scripts/check-preset.mjs          # structure of the plugin and its row
node --test                            # capture/render/parse decision logic
node scripts/assert-session.mjs <log> --preset quanheng `
  --context "quanheng:instincts=keep-evidence"
node scripts/assert-session.mjs <log> `
  --context "quanheng:instincts=read-the-error" --context-after <seq of the failure>
```

The last assertion is the interesting one: it fails if the rule appeared before
the evidence that justifies it.
