// Decision logic for the quanheng instinct channel.
//
// This module is deliberately dependency-free and free of I/O: it decides what
// the injected reminder says from two inputs — what this session's tools
// actually did, and what the project promoted into `.qh/instincts/`. The plugin
// (`index.js`) owns the event subscription and the file reads; the tests own
// this file.
//
// Two boundaries this module keeps:
//   - No captured fact and no promoted instinct means no text at all. An empty
//     contribution is how the channel stays quiet.
//   - Captured facts select which instinct is relevant; they do not write rules.
//     A judgement enters the prompt because someone promoted it, and repeating
//     tool calls is already covered by the Harness's own repeat-tool-reminder
//     guard, so this module does not duplicate it. See docs/HOOKS.md.

/** Prompt-context name; also the `source.sections[].name` a session log records. */
export const CONTEXT_NAME = 'quanheng:instincts'

/** Triggers that do not name a tool. A tool trigger is `TOOL_TRIGGER_PREFIX` + tool name. */
export const FIXED_TRIGGERS = Object.freeze(['always', 'tool-error'])

/** Prefix of a trigger that activates only after that tool was used in the session. */
export const TOOL_TRIGGER_PREFIX = 'tool:'

/** Captures kept per session; older entries are dropped so a long session stays bounded. */
export const MAX_CAPTURES = 200

/** Lines an assembled reminder may carry before it starts costing more than it is worth. */
export const MAX_RULES = 3

/** Characters of one promoted instinct body. */
export const MAX_INSTINCT_CHARS = 400

const SLUG = /^[a-z0-9]+(?:-[a-z0-9]+)*$/

/**
 * Whether one completed tool call failed.
 *
 * `isError` alone is not enough: a shell tool reports a non-zero command exit as
 * an ordinary result whose content carries `[exit code: N]`, and only
 * infrastructure failures become `isError` (`dsh-tool-pwsh/src/render.ts:5-8`).
 * The command's own outcome is the tool's canonical value, so a numeric
 * `exitCode` other than zero counts as a failure. Reading the text marker
 * instead would tie this module to a display format.
 * @param result - the result object handed to a `tools/result` listener.
 * @returns true when the call itself failed, or a command it ran exited non-zero.
 */
export function callFailed(result) {
  if (result?.isError === true) return true
  const exitCode = result?.value?.exitCode
  return typeof exitCode === 'number' && exitCode !== 0
}

/**
 * Append one completed call, keeping the newest {@link MAX_CAPTURES} entries.
 *
 * Only the tool name and the outcome are kept: the outcome gates the
 * `tool-error` trigger, and the name gates `tool:<name>`. Quoting tool output
 * back into the prompt is the Harness's job, not this module's.
 * @param captures - previous entries, oldest first.
 * @param record - `{ tool, ok }` for the call that just finished.
 * @returns a new array; the input is not modified.
 */
export function appendCapture(captures, record) {
  const next = [...captures, record]
  return next.length <= MAX_CAPTURES ? next : next.slice(next.length - MAX_CAPTURES)
}

/** Whether a trigger string is one this build understands. */
export function isTrigger(trigger) {
  if (typeof trigger !== 'string') return false
  if (FIXED_TRIGGERS.includes(trigger)) return true
  return trigger.startsWith(TOOL_TRIGGER_PREFIX) && trigger.length > TOOL_TRIGGER_PREFIX.length
}

/**
 * Read one promoted instinct. A file the owner wrote is user-owned input, so a
 * rejection is reported, never repaired and never thrown.
 * @param text - file contents.
 * @param file - the path to name in a diagnostic.
 * @returns a parsed instinct, or the reason it was rejected.
 */
export function parseInstinct(text, file) {
  const source = String(text).replace(/^\uFEFF/, '')
  const match = /^---\r?\n([\s\S]*?)\r?\n---\r?\n?([\s\S]*)$/.exec(source)
  if (match === null) return { ok: false, file, error: 'no YAML frontmatter' }
  const fields = {}
  for (const line of match[1].split(/\r?\n/)) {
    if (line.trim() === '' || line.trim().startsWith('#')) continue
    const pair = /^([a-z][a-z0-9-]*):\s*(.+?)\s*$/.exec(line)
    if (pair === null) return { ok: false, file, error: `unreadable frontmatter line ${JSON.stringify(line.trim())}` }
    fields[pair[1]] = pair[2]
  }
  if (fields.id === undefined || !SLUG.test(fields.id)) {
    return { ok: false, file, error: 'id is missing or not a lowercase slug' }
  }
  if (fields.trigger === undefined) return { ok: false, file, error: 'trigger is missing' }
  if (!isTrigger(fields.trigger)) {
    return {
      ok: false,
      file,
      error: `unknown trigger ${JSON.stringify(fields.trigger)}; expected always, tool-error, or tool:<name>`,
    }
  }
  const body = match[2].trim()
  if (body === '') return { ok: false, file, error: 'body is empty' }
  if (body.length > MAX_INSTINCT_CHARS) {
    return { ok: false, file, error: `body is ${body.length} characters, over ${MAX_INSTINCT_CHARS}` }
  }
  return {
    ok: true,
    file,
    instinct: { id: fields.id, trigger: fields.trigger, body, evidence: fields.evidence, skill: fields.skill },
  }
}

function matches(trigger, usedTools, sawError) {
  if (trigger === 'always') return true
  if (trigger === 'tool-error') return sawError
  return usedTools.has(trigger.slice(TOOL_TRIGGER_PREFIX.length))
}

/**
 * Assemble the reminder text for one assembly.
 *
 * A rejected instinct file contributes a diagnostic line instead of
 * disappearing — the owner must be able to see that a file they wrote is not in
 * effect. Instincts render in id order, so an unchanged session produces an
 * unchanged string and the runtime-context snapshot is not rewritten.
 * @param options - captures for this session and the loaded `.qh/instincts` files.
 * @returns the text to inject, the rule lines it carries, and any diagnostics.
 */
export function renderInstincts({ captures = [], loaded = [] } = {}) {
  const rules = []
  const diagnostics = []

  const usedTools = new Set(captures.map(record => record?.tool).filter(tool => typeof tool === 'string'))
  const sawError = captures.some(record => record?.ok === false)
  const byId = new Map()
  for (const entry of loaded) {
    if (entry?.ok !== true) {
      diagnostics.push(`instincts: ${entry?.file ?? '(unnamed)'} 未通过解析：${entry?.error ?? 'unknown error'}`)
      continue
    }
    const instinct = entry.instinct
    const previous = byId.get(instinct.id)
    if (previous !== undefined) {
      diagnostics.push(`instincts: duplicate id ${JSON.stringify(instinct.id)} in ${entry.file}; kept ${previous.file}`)
      continue
    }
    byId.set(instinct.id, { ...instinct, file: entry.file })
  }
  for (const instinct of [...byId.values()].sort((a, b) => (a.id < b.id ? -1 : a.id > b.id ? 1 : 0))) {
    if (!matches(instinct.trigger, usedTools, sawError)) continue
    rules.push(`${instinct.id}: ${instinct.body}`)
  }

  if (rules.length === 0 && diagnostics.length === 0) return { text: '', rules, diagnostics }

  const shown = rules.slice(0, MAX_RULES)
  const omitted = rules.length - shown.length
  const lines = [
    'Quanheng instincts for this session, from .qh/instincts, selected by what this session has done so far:',
    ...shown.map(rule => `- ${rule}`),
    ...omitted > 0 ? [`- ${omitted} further rule(s) omitted; keep fewer instincts or narrow their triggers`] : [],
    ...diagnostics.map(diagnostic => `- ${diagnostic}`),
  ]
  return { text: lines.join('\n'), rules: shown, diagnostics }
}
