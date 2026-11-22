// Behaviour tests for the instinct channel's decision logic.
//
// The plugin subscribes to events and reads files; this file tests what it
// decides. Three properties are worth guarding, because each is a claim the
// design makes:
//   - a rule appears only when the session's own facts make its trigger true;
//   - captured facts select rules, they never author them;
//   - an instinct file that is not in effect is visible, not silently dropped.
import { test } from 'node:test'
import assert from 'node:assert/strict'
import {
  CONTEXT_NAME, MAX_CAPTURES, MAX_RULES, appendCapture, callFailed, isTrigger, parseInstinct, renderInstincts,
} from '../hooks/instincts.mjs'

const ok = (tool) => ({ tool, ok: true })
const failed = (tool) => ({ tool, ok: false })

function instinctFile(text, name = 'file') {
  return parseInstinct(text, `.qh/instincts/${name}.md`)
}

function instinct(id, trigger, body = 'Do the thing.') {
  return instinctFile(['---', `id: ${id}`, `trigger: ${trigger}`, '---', body].join('\n'), id)
}

test('a shell command that exits non-zero counts as a failure', () => {
  // `isError` is reserved for infrastructure failures; a failed command comes
  // back as an ordinary result whose canonical value carries the exit code.
  assert.equal(callFailed({ isError: false, value: { kind: 'foreground', exitCode: 7 } }), true)
  assert.equal(callFailed({ isError: false, value: { kind: 'foreground', exitCode: 0 } }), false)
  assert.equal(callFailed({ isError: false, value: { kind: 'foreground', exitCode: null } }), false)
  assert.equal(callFailed({ isError: false, value: { content: 'plain tool value' } }), false)
  assert.equal(callFailed({ isError: false }), false)
  assert.equal(callFailed({ isError: true, content: [] }), true)
})

test('captures stay bounded', () => {
  let captures = []
  for (let index = 0; index < MAX_CAPTURES + 5; index++) captures = appendCapture(captures, ok('read'))
  assert.equal(captures.length, MAX_CAPTURES)
  assert.equal(captures.at(-1).tool, 'read')
})

test('a well formed instinct parses, a broken one is reported', () => {
  const good = instinctFile(['---', 'id: keep-evidence', 'trigger: always', 'evidence: session-bb82e844 seq 174', '---', 'Lead with a labelled fact.'].join('\n'))
  assert.equal(good.ok, true)
  assert.equal(good.instinct.id, 'keep-evidence')
  assert.equal(good.instinct.trigger, 'always')
  assert.equal(good.instinct.evidence, 'session-bb82e844 seq 174')

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
  assert.equal(renderInstincts({ captures: [ok('read')], loaded: [] }).text, '')
})

test('captured facts select rules but never author them', () => {
  // Five failures and no promoted instinct: the channel says nothing. Writing a
  // rule is the Harness's own reminder plugins' job, not this one's.
  const captured = [failed('pwsh'), failed('pwsh'), failed('pwsh'), failed('read'), failed('read')]
  assert.equal(renderInstincts({ captures: captured, loaded: [] }).text, '')
})

test('a promoted instinct renders once its trigger is true', () => {
  const always = instinct('keep-evidence', 'always', 'Lead with a labelled fact.')
  const onError = instinct('read-the-error', 'tool-error', 'Read the whole error first.')
  const onPwsh = instinct('quote-exit-code', 'tool:pwsh', 'Quote the exit code.')
  const loaded = [always, onError, onPwsh]

  const quiet = renderInstincts({ captures: [], loaded })
  assert.match(quiet.text, /keep-evidence/)
  assert.doesNotMatch(quiet.text, /read-the-error/)
  assert.doesNotMatch(quiet.text, /quote-exit-code/)

  const afterRead = renderInstincts({ captures: [ok('read')], loaded })
  assert.doesNotMatch(afterRead.text, /read-the-error/)
  assert.doesNotMatch(afterRead.text, /quote-exit-code/)

  const afterFailure = renderInstincts({ captures: [failed('pwsh')], loaded })
  assert.match(afterFailure.text, /read-the-error/)
  assert.match(afterFailure.text, /quote-exit-code/)
})

test('an unparsed instinct file is reported, and the rest still render', () => {
  const broken = instinctFile('---\nid: Broken_Name\ntrigger: always\n---\nbody')
  const rendered = renderInstincts({ captures: [], loaded: [broken, instinct('keep-evidence', 'always')] })
  assert.equal(rendered.diagnostics.length, 1)
  assert.match(rendered.text, /未通过解析/)
  assert.match(rendered.text, /keep-evidence/)
})

test('promoted instincts render in id order, whoever read them last', () => {
  const beta = instinct('beta', 'always', 'B.')
  const alpha = instinct('alpha', 'always', 'A.')
  const forwarded = renderInstincts({ captures: [], loaded: [beta, alpha] }).text
  const reversed = renderInstincts({ captures: [], loaded: [alpha, beta] }).text
  assert.equal(forwarded, reversed)
  assert.ok(forwarded.indexOf('alpha') < forwarded.indexOf('beta'))
})

test('a duplicate id keeps the first file and says so', () => {
  const first = instinct('same', 'always', 'First.')
  const second = instinct('same', 'always', 'Second.')
  const rendered = renderInstincts({ captures: [], loaded: [first, second] })
  assert.match(rendered.text, /First\./)
  assert.equal(rendered.text.includes('Second.'), false)
  assert.match(rendered.diagnostics.join('\n'), /duplicate id/)
})

test('template characters in an instinct body survive verbatim', () => {
  const rendered = renderInstincts({ captures: [], loaded: [instinct('vars', 'always', 'Never write {{model}} into a prompt.')] })
  assert.match(rendered.text, /\{\{model\}\}/)
})

test('the reminder stops growing past its budget', () => {
  const loaded = ['a', 'b', 'c', 'd', 'e'].map(id => instinct(id, 'always', 'body'))
  const rendered = renderInstincts({ captures: [], loaded })
  assert.equal(rendered.rules.length, MAX_RULES)
  assert.match(rendered.text, /2 further rule\(s\) omitted/)
})

test('the context name is the one the checks and the log agree on', () => {
  assert.equal(CONTEXT_NAME, 'quanheng:instincts')
})
