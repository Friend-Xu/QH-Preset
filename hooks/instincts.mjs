// Decision logic for the quanheng instinct channel.
//
// This module is deliberately dependency-free and free of I/O: it decides what
// the injected reminder says from two inputs — what this session's tools
// actually returned, and what the project promoted into `.qh/instincts/`. The
// plugin (`index.js`) owns the event subscription and the file reads; the tests
// own this file.
//
// The contract that matters: no captured fact and no promoted instinct means no
// text at all. An empty contribution is how the channel stays quiet.

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

/** Characters of a tool's failure message quoted back in a rule. */
export const MAX_MESSAGE_CHARS = 200

/** Characters of one promoted instinct body. */
export const MAX_INSTINCT_CHARS = 400

/** Nesting depth beyond which arguments are not keyed at all rather than keyed wrongly. */
const MAX_ARGUMENT_DEPTH = 32

const SLUG = /^[a-z0-9]+(?:-[a-z0-9]+)*$/

function canonical(value, depth) {
  if (depth > MAX_ARGUMENT_DEPTH) throw new Error('arguments nest too deeply to key')
  if (Array.isArray(value)) return `[${value.map(item => canonical(item, depth + 1)).join(',')}]`
  if (value === null) return 'null'
  if (typeof value !== 'object') return JSON.stringify(value) ?? 'null'
  const keys = Object.keys(value).sort()
  const fields = keys.map(key => `${JSON.stringify(key)}:${canonical(value[key], depth + 1)}`)
  return `{${fields.join(',')}}`
}

/**
 * A stable string for a parsed argument value: equal calls key equal.
 * @param value - the tool call's parsed arguments.
 * @returns the canonical form, or undefined when the value cannot be keyed.
 */
export function stableJson(value) {
  try {
    return canonical(value ?? null, 0)
  } catch {
    return undefined
  }
}

/**
 * The identity of one tool call, used to notice an identical retry.
 * @param tool - registered tool name.
 * @param args - parsed arguments as the executor recorded them.
 * @returns `tool` and canonical arguments joined by a NUL, or undefined.
 */
export function captureKey(tool, args) {
  if (typeof tool !== 'string' || tool === '') return undefined
  const canonicalArgs = stableJson(args)
  return canonicalArgs === undefined ? undefined : `${tool}\u0000${canonicalArgs}`
}

/**
 * Trim one failure message to the single line a reminder can quote.
 * @param message - model-facing failure text, possibly multi-line.
 * @returns the collapsed first line, capped.
 */
export function firstLine(message) {
  const text = typeof message === 'string' ? message : ''
  const collapsed = text.replace(/\s+/g, ' ').trim()
  return collapsed.length <= MAX_MESSAGE_CHARS ? collapsed : `${collapsed.slice(0, MAX_MESSAGE_CHARS - 1)}…`
}

/**
 * Append one completed call, keeping the newest {@link MAX_CAPTURES} entries.
 * @param captures - previous entries, oldest first.
 * @param record - the call to add.
 * @returns a new array; the input is not modified.
 */
export function appendCapture(captures, record) {
  const next = [...captures, record]
  return next.length <= MAX_CAPTURES ? next : next.slice(next.length - MAX_CAPTURES)
}

/**
 * Failures that repeated with identical arguments.
 *
 * The value of this rule is that it is decidable: no model text is interpreted,
 * only "the same call failed again". Ordered by count, then key, so an unchanged
 * session renders an unchanged string and the runtime-context snapshot is not
 * rewritten for a reordering.
 * @param captures - completed calls from this session.
 * @returns one entry per repeated call, most repeated first.
 */
export function repeatFailures(captures) {
  const byKey = new Map()
  for (const record of captures) {
    if (record?.ok !== false || typeof record.key !== 'string') continue
    const seen = byKey.get(record.key)
    if (seen === undefined) byKey.set(record.key, { key: record.key, tool: record.tool, count: 1, message: record.message })
    else {
      seen.count += 1
      seen.message = record.message
    }
  }
  return [...byKey.values()]
    .filter(entry => entry.count > 1)
    .sort((a, b) => b.count - a.count || (a.key < b.key ? -1 : a.key > b.key ? 1 : 0))
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
 * Two sources, one list: rules derived from this session's captures, then the
 * project's promoted instincts that this session has made relevant. A rejected
 * instinct file contributes a diagnostic line instead of disappearing — the
 * owner must be able to see that a file they wrote is not in effect.
 * @param options - captures for the session and the loaded `.qh/instincts` files.
 * @returns the text to inject, the rule lines it carries, and any diagnostics.
 */
export function renderInstincts({ captures = [], loaded = [] } = {}) {
  const rules = []
  const diagnostics = []

  for (const failure of repeatFailures(captures)) {
    const quoted = failure.message === undefined || failure.message === ''
      ? ''
      : `; latest error: ${failure.message}`
    rules.push(`repeat-failure: ${failure.tool} failed ${failure.count} times with identical arguments${quoted}. Change the evidence source before the next attempt.`)
  }

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
    'Quanheng instincts for this session, derived from captured tool results and .qh/instincts:',
    ...shown.map(rule => `- ${rule}`),
    ...omitted > 0 ? [`- ${omitted} further rule(s) omitted; keep fewer instincts or narrow their triggers`] : [],
    ...diagnostics.map(diagnostic => `- ${diagnostic}`),
  ]
  return { text: lines.join('\n'), rules: shown, diagnostics }
}
