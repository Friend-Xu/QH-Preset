#!/usr/bin/env node
// Assert what a session actually did, from its own log.
//
// The acceptance questions for this preset ("did it load the skill before it
// wrote code?", "did it end clean?") are answerable from the transcript, so they
// should be a command instead of a paragraph someone reads. This is the code
// grader the eval harness points at.
//
// Usage:
//   node scripts/assert-session.mjs SESSION_LOG [--preset ID]
//        [--skill-order a,b,c] [--no-write-before SKILL] [--no-tool-errors] [--json]
//
// Exit: 0 all assertions held, 1 an assertion failed, 2 the log could not be read.
import { existsSync, readFileSync, statSync } from 'node:fs'
import { zstdDecompressSync } from 'node:zlib'
import { resolve } from 'node:path'
import { pathToFileURL } from 'node:url'

const WRITE_TOOLS = new Set(['write', 'edit'])

function readEvents(file) {
  if (!existsSync(file) || !statSync(file).isFile()) {
    throw new Error(`no such session log: ${file}`)
  }
  const raw = readFileSync(file)
  const text = file.endsWith('.zstd') ? zstdDecompressSync(raw).toString('utf8') : raw.toString('utf8')
  const events = []
  for (const line of text.split('\n')) {
    if (line.trim() === '') continue
    events.push(JSON.parse(line))
  }
  return events
}

function skillNameOf(call) {
  if (call.data?.name !== 'skill') return undefined
  try {
    const parsed = JSON.parse(call.data.arguments)
    return typeof parsed.name === 'string' ? parsed.name : undefined
  } catch {
    return undefined
  }
}

/** The ordered list of skills the session loaded, with the seq of each call. */
export function skillChain(events) {
  const chain = []
  for (const event of events) {
    if (event.type !== 'tool/call') continue
    const name = skillNameOf(event)
    if (name !== undefined) chain.push({ seq: event.seq, name })
  }
  return chain
}

/**
 * The preset the session actually ran under.
 *
 * The header records the preset the session was created with; a GUI draft can be
 * created before the owner picks one, and switching it emits
 * `agent-preset/selected` before the first turn. The last such event wins, and the
 * header is the fallback.
 */
export function effectivePreset(events) {
  let preset
  for (const event of events) {
    if (event.type === 'agent-preset/selected' && typeof event.data?.agentPreset === 'string') {
      preset = event.data.agentPreset
    }
  }
  if (preset !== undefined) return preset
  return events.find(event => event.type === 'session')?.agentPreset
}

function subsequenceProblem(order, chain) {
  let position = 0
  for (const wanted of order) {
    const found = chain.findIndex((entry, index) => index >= position && entry.name === wanted)
    if (found === -1) {
      return `skill "${wanted}" never loaded after the ${position} earlier one(s); chain: ${chain.map(entry => entry.name).join(' → ') || '(empty)'}`
    }
    position = found + 1
  }
  return undefined
}

function firstSequenceOf(events, predicate) {
  const found = events.find(predicate)
  return found === undefined ? undefined : found.seq
}

function parseArgs(argv) {
  const options = { file: undefined, preset: undefined, skillOrder: undefined, noWriteBefore: undefined, noToolErrors: false, json: false }
  const rest = []
  for (let index = 0; index < argv.length; index++) {
    const argument = argv[index]
    if (argument === '--json') options.json = true
    else if (argument === '--no-tool-errors') options.noToolErrors = true
    else if (argument === '--preset') options.preset = argv[++index]
    else if (argument === '--skill-order') options.skillOrder = argv[++index]
    else if (argument === '--no-write-before') options.noWriteBefore = argv[++index]
    else if (argument.startsWith('--')) throw new Error(`unknown option: ${argument}`)
    else rest.push(argument)
  }
  if (rest.length !== 1) {
    throw new Error('usage: assert-session SESSION_LOG [--preset ID] [--skill-order a,b,c] [--no-write-before SKILL] [--no-tool-errors] [--json]')
  }
  options.file = rest[0]
  return options
}

export function checkSession(events, options) {
  const header = events.find(event => event.type === 'session')
  if (header === undefined) throw new Error('the log has no session header')
  const preset = effectivePreset(events)
  const chain = skillChain(events)
  const results = []

  if (options.preset !== undefined) {
    results.push({
      name: `agent preset is ${options.preset}`,
      ok: preset === options.preset,
      detail: `found ${JSON.stringify(preset)}${header.agentPreset !== preset ? ` (header said ${JSON.stringify(header.agentPreset)}, overridden by agent-preset/selected)` : ''}`,
    })
  }

  if (options.skillOrder !== undefined) {
    const order = options.skillOrder.split(',').map(name => name.trim()).filter(name => name !== '')
    const problem = subsequenceProblem(order, chain)
    results.push({
      name: `skills load in order: ${order.join(' → ')}`,
      ok: problem === undefined,
      detail: problem ?? `${chain.length} skill calls`,
    })
  }

  if (options.noWriteBefore !== undefined) {
    const gateSeq = firstSequenceOf(events, event => event.type === 'tool/call' && skillNameOf(event) === options.noWriteBefore)
    const writes = events.filter(event => event.type === 'tool/call' && WRITE_TOOLS.has(event.data?.name))
    if (gateSeq === undefined) {
      // The gate skill never loaded, which is the normal state of a session still
      // inside the gate. Nothing may have been written at all then.
      results.push({
        name: `nothing written while ${options.noWriteBefore} is still ahead (never loaded)`,
        ok: writes.length === 0,
        detail: writes.length === 0
          ? '0 write call(s); the gate simply has not opened yet'
          : `${writes.length} write call(s) without reaching ${options.noWriteBefore}: ${writes.map(event => `seq ${event.seq} ${event.data.name}`).join(', ')}`,
      })
    } else {
      const early = writes.filter(event => event.seq < gateSeq)
      results.push({
        name: `nothing written before ${options.noWriteBefore} (seq ${gateSeq})`,
        ok: early.length === 0,
        detail: early.length === 0
          ? `${writes.length} write call(s), all after`
          : `${early.length} write call(s) before it: ${early.map(event => `seq ${event.seq} ${event.data.name}`).join(', ')}`,
      })
    }
  }

  if (options.noToolErrors) {
    const errors = events.filter(event => event.type === 'tool/result' && event.data?.message?.isError === true)
    results.push({
      name: 'no tool call failed',
      ok: errors.length === 0,
      detail: errors.length === 0 ? '0 errors' : `${errors.length} failing call(s): ${errors.map(event => `seq ${event.seq}`).join(', ')}`,
    })
  }

  return {
    preset,
    cwd: header.cwd ?? null,
    events: events.length,
    chain,
    results,
    ok: results.every(result => result.ok),
  }
}

function main(argv) {
  let options
  try {
    options = parseArgs(argv)
    const file = resolve(options.file)
    const summary = checkSession(readEvents(file), options)
    if (options.json) {
      process.stdout.write(`${JSON.stringify({
        file,
        preset: summary.preset,
        cwd: summary.cwd,
        events: summary.events,
        chain: summary.chain.map(entry => `${entry.seq}:${entry.name}`),
        results: summary.results,
        ok: summary.ok,
      }, null, 2)}\n`)
    } else {
      process.stdout.write(`session: ${file}\n`)
      process.stdout.write(`preset:  ${summary.preset ?? '(none)'}\n`)
      process.stdout.write(`cwd:     ${summary.cwd ?? '(none)'}\n`)
      process.stdout.write(`events:  ${summary.events}\n`)
      process.stdout.write(`chain:   ${summary.chain.map(entry => `${entry.seq}:${entry.name}`).join(' → ') || '(no skill calls)'}\n`)
      for (const result of summary.results) {
        process.stdout.write(`${result.ok ? 'PASS' : 'FAIL'}  ${result.name} — ${result.detail}\n`)
      }
      process.stdout.write(`\n${summary.results.filter(result => result.ok).length} passed, ${summary.results.filter(result => !result.ok).length} failed\n`)
    }
    return summary.ok ? 0 : 1
  } catch (error) {
    process.stderr.write(`${error.message}\n`)
    return 2
  }
}

const isMain = process.argv[1] !== undefined && import.meta.url === pathToFileURL(process.argv[1]).href
if (isMain) process.exitCode = main(process.argv.slice(2))
