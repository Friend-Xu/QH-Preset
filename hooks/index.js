// The quanheng instinct hook: keep this project's promoted judgement rules in
// front of the model, selected by what the session has actually done.
//
// Two halves, both native to the Harness:
//   - `tools/result` is the emit-only observation of a completed call. It is
//     used here as a sensor: which tools ran, and whether any failed. It does
//     not derive rules from those facts — repeating tool calls is already the
//     job of the Harness's own repeat-tool-reminder guard.
//   - `systemPrompt.context` is the supported standing-reminder channel. The
//     agent loop materializes its text into a durable runtime-context message,
//     and rewrites it only when the contributions changed.
//
// There is no `agent/pre-step` message injection here on purpose: that path
// needs `createUserMessage` from a prerelease `@deepseek-ai/dsh-llm`, and this
// bundle resolves no DSH package at runtime. See docs/HOOKS.md.
import { readFileSync, readdirSync } from 'node:fs'
import { join } from 'node:path'
import { CONTEXT_NAME, appendCapture, callFailed, parseInstinct, renderInstincts } from './instincts.mjs'

/** Cordis plugin name used by loader diagnostics. */
export const name = 'quanheng-instincts'

/** The prompt registry this row contributes to. */
export const inject = ['systemPrompt']

/** Context order; zones sit far apart so a neighbour can be placed without renumbering. */
const CONTEXT_ORDER = 1000

/** Completed calls per session, keyed by the session that ran them. */
const sessions = new Map()

/**
 * Read this project's promoted instincts.
 *
 * A missing directory is the defined empty state — the project has promoted
 * nothing yet — and costs no diagnostic. Any other failure is reported as a
 * rejected entry, which `renderInstincts` surfaces in the injected text: an
 * instinct file that is not in effect must be visible, never silent.
 * @param cwd - the session's working directory.
 * @returns parsed instincts and rejections, stable by file name.
 */
function loadInstincts(cwd) {
  if (typeof cwd !== 'string' || cwd === '') return []
  const directory = join(cwd, '.qh', 'instincts')
  let entries
  try {
    entries = readdirSync(directory, { withFileTypes: true })
  } catch (error) {
    if (error?.code === 'ENOENT') return []
    return [{ ok: false, file: '.qh/instincts', error: `directory unreadable: ${error?.code ?? error?.message ?? 'unknown error'}` }]
  }
  const loaded = []
  for (const entry of entries) {
    if (!entry.name.endsWith('.md')) continue
    const file = `.qh/instincts/${entry.name}`
    try {
      loaded.push(parseInstinct(readFileSync(join(directory, entry.name), 'utf8'), file))
    } catch (error) {
      loaded.push({ ok: false, file, error: `file unreadable: ${error?.code ?? error?.message ?? 'unknown error'}` })
    }
  }
  return loaded.sort((a, b) => (a.file < b.file ? -1 : a.file > b.file ? 1 : 0))
}

/**
 * Record completed calls and contribute the rules they justify.
 * @param ctx - the preset scope owning the subscription and the context entry.
 */
export function apply(ctx) {
  ctx.on('tools/result', (exec, result) => {
    const session = exec.agent?.session
    if (session === undefined) return
    const id = session.header.id
    const state = sessions.get(id) ?? { captures: [] }
    state.captures = appendCapture(state.captures, { tool: exec.name, ok: !callFailed(result) })
    sessions.set(id, state)
  })

  ctx.on('agent/disposed', ({ agent }) => {
    sessions.delete(agent.session.header.id)
  })

  ctx.systemPrompt.context({
    name: CONTEXT_NAME,
    order: CONTEXT_ORDER,
    // Operational guidance, not optional decoration: a deployment that
    // suppresses runtime context must not silently drop the judgement rules.
    required: true,
    // Captured error text and instinct bodies are quoted verbatim; `{{` in them
    // is prose, not a prompt variable, and interpolating it would throw.
    interpolate: false,
    text: ({ agent }) => {
      if (agent === undefined) return ''
      const state = sessions.get(agent.session.header.id)
      return renderInstincts({
        captures: state?.captures ?? [],
        loaded: loadInstincts(agent.session.header.cwd),
      }).text
    },
  })
}
