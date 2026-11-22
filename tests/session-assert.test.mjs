// Behaviour tests for the session assertions that read runtime context.
//
// The instinct hook's acceptance question is "did the rule reach the model, and
// only after the evidence existed". Both halves are answerable from the log, so
// they are a command. These tests pin the two readings: a contribution counts
// only when the loop materialized it, and `--context-after` fails when the text
// appeared too early — which is the part that would let a claim pass unnoticed.
import { test } from 'node:test'
import assert from 'node:assert/strict'
import { checkSession, contextSections } from '../scripts/assert-session.mjs'

const header = { type: 'session', seq: 0, agentPreset: 'quanheng' }

function runtimeContext(seq, sections) {
  // A `user/message` payload is the UserMessage itself, so the source sits at
  // `data.source` (unlike `tool/result`, which wraps its payload in `message`).
  return { type: 'user/message', seq, data: { role: 'user', content: [], source: { kind: 'runtime-context', form: 'snapshot', sections } } }
}

function userMessage(seq) {
  return { type: 'user/message', seq, data: { role: 'user', content: [], source: { kind: 'user' } } }
}

const RULE = (text) => ({ name: 'quanheng:instincts', text })

function run(events, options) {
  const summary = checkSession([header, ...events], options)
  return summary.results.at(-1)
}

test('runtime context is read from the materialized user message only', () => {
  const events = [runtimeContext(10, [RULE('repeat-failure: pwsh')]), userMessage(12)]
  assert.deepEqual(contextSections(events), [{ seq: 10, name: 'quanheng:instincts', text: 'repeat-failure: pwsh' }])
})

test('a context that never appeared fails and names what did appear', () => {
  const result = run([runtimeContext(10, [{ name: 'other', text: 'x' }])], { context: { name: 'quanheng:instincts' } })
  assert.equal(result.ok, false)
  assert.match(result.detail, /not found/)
  assert.match(result.detail, /other/)
})

test('the expected contribution passes with its first seq', () => {
  const result = run([runtimeContext(30, [RULE('keep-evidence: label claims')])], { context: { name: 'quanheng:instincts' } })
  assert.equal(result.ok, true)
  assert.match(result.detail, /first at seq 30/)
})

test('a substring selects the rule that carried it', () => {
  const events = [runtimeContext(30, [RULE('always: keep-evidence')])]
  assert.equal(run(events, { context: { name: 'quanheng:instincts', substring: 'keep-evidence' } }).ok, true)
  assert.equal(run(events, { context: { name: 'quanheng:instincts', substring: 'repeat-failure' } }).ok, false)
})

test('appearing before the evidence is a failure, not a pass', () => {
  const early = run([runtimeContext(10, [RULE('repeat-failure')])], { context: { name: 'quanheng:instincts' }, contextAfter: 20 })
  assert.equal(early.ok, false)
  assert.match(early.detail, /earlier at seq 10/)

  const late = run([runtimeContext(25, [RULE('repeat-failure')])], { context: { name: 'quanheng:instincts' }, contextAfter: 20 })
  assert.equal(late.ok, true)
  assert.match(late.detail, /first at seq 25/)
})

test('the bound also requires the contribution to exist at all', () => {
  const result = run([], { context: { name: 'quanheng:instincts' }, contextAfter: 20 })
  assert.equal(result.ok, false)
  assert.match(result.detail, /never appeared/)
})
