// Behaviour tests for the instinct channel's decision logic.
//
// The plugin subscribes to events and reads files; this file tests what it
// decides. The two properties worth guarding are the ones the design claims:
// a rule appears only when a captured fact supports it, and an instinct file
// that is not in effect is visible rather than silently dropped.
import { test } from 'node:test'
import assert from 'node:assert/strict'
import {
  CONTEXT_NAME, MAX_CAPTURES, MAX_RULES, appendCapture, captureKey, firstLine, isTrigger,
  parseInstinct, renderInstincts, repeatFailures, stableJson,
} from '../hooks/instincts.mjs'

const ok = (tool, args, extra = {}) => ({ tool, key: captureKey(tool, args), ok: true, message: '', ...extra })
const failed = (tool, args, message, extra = {}) => ({ tool, key: captureKey(tool, args), ok: false, message, ...extra })

function instinctFile(text) {
  return parseInstinct(text, `.qh/instincts/${text.length}.md`)
}

const ALWAYS = ['---', 'id: keep-evidence', 'trigger: always', 'evidence: session-bb82e844 seq 174', '---', 'Lead with a labelled fact, not a claim.'].join('\n')

test('a call is keyed by tool and arguments, independent of key order', () => {
  assert.equal(stableJson({ a: 1, b: [2, { c: 3, d: 4 }] }), stableJson({ b: [2, { d: 4, c: 3 }], a: 1 }))
  assert.notEqual(captureKey('pwsh', { command: 'pnpm test' }), captureKey('pwsh', { command: 'pnpm build' }))
  assert.notEqual(captureKey('pwsh', { command: 'x' }), captureKey('read', { command: 'x' }))
})

test('arguments that cannot be keyed yield no key instead of a wrong one', () => {
  const deep = { next: null }
  let cursor = deep
  for (let index = 0; index < 64; index++) {
    cursor.next = { next: null }
    cursor = cursor.next
  }
  assert.equal(stableJson(deep), undefined)
  assert.equal(captureKey('pwsh', deep), undefined)
  assert.equal(captureKey('', {}), undefined)
})

test('a failure message is quoted as one capped line', () => {
  assert.equal(firstLine('line one\n  line two\t'), 'line one line two')
  const long = firstLine('x'.repeat(500))
  assert.equal(long.length, 200)
  assert.equal(firstLine(undefined), '')
})

test('captures stay bounded', () => {
  let captures = []
  for (let index = 0; index < MAX_CAPTURES + 5; index++) captures = appendCapture(captures, ok('read', { path: `${index}` }))
  assert.equal(captures.length, MAX_CAPTURES)
  assert.equal(captures.at(-1).key, captureKey('read', { path: `${MAX_CAPTURES + 4}` }))
})

test('only an identical second failure repeats', () => {
  assert.deepEqual(repeatFailures([failed('pwsh', { command: 'x' }, 'boom')]), [])
  assert.deepEqual(repeatFailures([ok('pwsh', { command: 'x' }), ok('pwsh', { command: 'x' })]), [])
  const repeated = repeatFailures([failed('pwsh', { command: 'x' }, 'first'), failed('pwsh', { command: 'x' }, 'second')])
  assert.equal(repeated.length, 1)
  assert.equal(repeated[0].tool, 'pwsh')
  assert.equal(repeated[0].count, 2)
  assert.equal(repeated[0].message, 'second')
  assert.deepEqual(repeatFailures([failed('pwsh', { command: 'x' }, 'a'), failed('pwsh', { command: 'y' }, 'b')]), [])
})

test('a well formed instinct parses, a broken one is reported', () => {
  const good = instinctFile(ALWAYS)
  assert.equal(good.ok, true)
  assert.equal(good.instinct.id, 'keep-evidence')
  assert.equal(good.instinct.trigger, 'always')

  for (const [text, reason] of [
    ['no frontmatter at all', 'no YAML'],
    ['---\ntrigger: always\n---\nbody', 'id'],
    ['---\nid: Not_A_Slug\ntrigger: always\n---\nbody', 'id'],
    ['---\nid: x\ntrigger: sometimes\n---\nbody', 'unknown trigger'],
    ['---\nid: x\n---\nbody', 'trigger'],
    ['---\nid: x\ntrigger: always\n---\n', 'body is empty'],
    [`---\nid: x\ntrigger: always\n---\n${'y'.repeat(500)}`, 'over 400'],
  ]) {
    const parsed = instinctFile(text)
    assert.equal(parsed.ok, false, `expected a rejection for ${JSON.stringify(text)}`)
    assert.match(parsed.error, new RegExp(reason), `wrong reason for ${JSON.stringify(text)}: ${parsed.error}`)
  }
})

test('triggers are always, tool-error, or tool:<name>', () => {
  for (const trigger of ['always', 'tool-error', 'tool:pwsh']) assert.equal(isTrigger(trigger), true)
  for (const trigger of ['sometimes', 'tool:', 'tool', '', undefined, 'always ']) assert.equal(isTrigger(trigger), false)
})

test('nothing captured and nothing promoted means no text at all', () => {
  assert.equal(renderInstincts().text, '')
  assert.equal(renderInstincts({ captures: [], loaded: [] }).text, '')
  assert.equal(renderInstincts({ captures: [ok('read', { path: 'a' })], loaded: [] }).text, '')
})

test('one failure is not yet a rule', () => {
  assert.equal(renderInstincts({ captures: [failed('pwsh', { command: 'x' }, 'boom')] }).text, '')
})

test('an identical second failure produces the rule with its quoted error', () => {
  const rendered = renderInstincts({
    captures: [failed('pwsh', { command: 'x' }, 'exit 1'), failed('pwsh', { command: 'x' }, 'exit 1')],
  })
  assert.match(rendered.text, /repeat-failure/)
  assert.match(rendered.text, /pwsh failed 2 times/)
  assert.match(rendered.text, /exit 1/)
  assert.equal(rendered.rules.length, 1)
})

test('promoted instincts follow their trigger', () => {
  const always = instinctFile(ALWAYS)
  const onError = instinctFile(['---', 'id: read-the-error', 'trigger: tool-error', '---', 'Read the whole error first.'].join('\n'))
  const onPwsh = instinctFile(['---', 'id: quote-exit-code', 'trigger: tool:pwsh', '---', 'Quote the exit code.'].join('\n'))
  const loaded = [always, onError, onPwsh]

  const quiet = renderInstincts({ captures: [], loaded })
  assert.equal(quiet.text.includes('keep-evidence'), true)
  assert.equal(quiet.text.includes('read-the-error'), false)
  assert.equal(quiet.text.includes('quote-exit-code'), false)

  const afterRead = renderInstincts({ captures: [ok('read', { path: 'a' })], loaded })
  assert.equal(afterRead.text.includes('read-the-error'), false)
  assert.equal(afterRead.text.includes('quote-exit-code'), false)

  const afterFailure = renderInstincts({ captures: [failed('pwsh', { command: 'x' }, 'boom')], loaded })
  assert.equal(afterFailure.text.includes('read-the-error'), true)
  assert.equal(afterFailure.text.includes('quote-exit-code'), true)
})

test('an unparsed instinct file is reported, and the rest still render', () => {
  const broken = instinctFile('---\nid: Broken_Name\ntrigger: always\n---\nbody')
  const rendered = renderInstincts({ captures: [], loaded: [broken, instinctFile(ALWAYS)] })
  assert.equal(rendered.diagnostics.length, 1)
  assert.match(rendered.text, /未通过解析/)
  assert.match(rendered.text, /keep-evidence/)
})

test('promoted instincts render in id order, whoever read them last', () => {
  const beta = instinctFile(['---', 'id: beta', 'trigger: always', '---', 'B.'].join('\n'))
  const alpha = instinctFile(['---', 'id: alpha', 'trigger: always', '---', 'A.'].join('\n'))
  const forwarded = renderInstincts({ captures: [], loaded: [beta, alpha] }).text
  const reversed = renderInstincts({ captures: [], loaded: [alpha, beta] }).text
  assert.equal(forwarded, reversed)
  assert.ok(forwarded.indexOf('alpha') < forwarded.indexOf('beta'))
})

test('a duplicate id keeps the first file and says so', () => {
  const first = instinctFile(['---', 'id: same', 'trigger: always', '---', 'First.'].join('\n'))
  const second = instinctFile(['---', 'id: same', 'trigger: always', '---', 'Second.'].join('\n'))
  const rendered = renderInstincts({ captures: [], loaded: [first, second] })
  assert.match(rendered.text, /First\./)
  assert.equal(rendered.text.includes('Second.'), false)
  assert.match(rendered.diagnostics.join('\n'), /duplicate id/)
})

test('template characters in captured text survive verbatim', () => {
  const rendered = renderInstincts({
    captures: [failed('pwsh', { command: 'x' }, 'unknown variable {{model}}'), failed('pwsh', { command: 'x' }, 'unknown variable {{model}}')],
  })
  assert.match(rendered.text, /\{\{model\}\}/)
})

test('the reminder stops growing past its budget', () => {
  const loaded = []
  for (const id of ['a', 'b', 'c', 'd', 'e']) loaded.push(instinctFile(['---', `id: ${id}`, 'trigger: always', '---', 'body'].join('\n')))
  const rendered = renderInstincts({ captures: [], loaded })
  assert.equal(rendered.rules.length, MAX_RULES)
  assert.match(rendered.text, /2 further rule\(s\) omitted/)
})

test('the context name is the one the checks and the log agree on', () => {
  assert.equal(CONTEXT_NAME, 'quanheng:instincts')
})
