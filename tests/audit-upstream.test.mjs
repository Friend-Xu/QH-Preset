// Behaviour tests for the upstream ledger audit.
//
// The audit is the machine half of docs/UPSTREAM.md: it answers "does every file
// in vendor/ have a recorded disposition, and does that record still match the
// bytes". Each property below is a way the record can lie, and each must fail
// rather than pass quietly — a record that cannot fail is what this replaced.
import { test } from 'node:test'
import assert from 'node:assert/strict'
import { auditUpstream, docLabels } from '../scripts/audit-upstream.mjs'

const SKILL = 'vendor/superpowers/skills/demo/SKILL.md'
const MIRROR = 'skills/demo/SKILL.md'
const HOOK = 'vendor/superpowers/hooks/run-hook.cmd'
const DOC = [
  '| # | 版本 | 改动 |',
  '|---|---|---|',
  '| 1 | v0.1 | 去掉命名空间 |',
  '| 2 | v0.1 | 关闭视觉伴生 |',
  '| 3 | v0.2 | helper 移植为 Node |',
  '| E7 | `development-workflow.md` 整篇 |',
  '| S2 | `diagnosing-superpowers` |',
].join('\n')

const UPSTREAMS = [{ id: 'superpowers', version: '7.0.2', path: 'vendor/superpowers' }]

/** Run the audit over an in-memory tree: path -> content, plus the ledger. */
function audit(files, entries, { upstreams = UPSTREAMS, doc = DOC } = {}) {
  const contents = new Map(Object.entries(files))
  const readBytes = path => (contents.has(path) ? Buffer.from(contents.get(path)) : null)
  return auditUpstream({
    // Only vendor/ is upstream; the fixture's other paths are the local mirrors.
    upstreamFiles: Object.keys(files).filter(path => path.startsWith('vendor/')).sort(),
    upstreams, entries, docText: doc, readBytes,
  })
}

const codes = result => result.problems.map(problem => problem.code)

test('a mirrored file that still matches upstream needs no entry', () => {
  const result = audit({ [SKILL]: 'same', [MIRROR]: 'same' }, [])
  assert.deepEqual(result.problems, [])
  assert.equal(result.counts.identical, 1)
})

test('a mirrored file that drifted with no entry fails as an undocumented edit', () => {
  const result = audit({ [SKILL]: 'upstream', [MIRROR]: 'ours' }, [])
  assert.deepEqual(codes(result), ['UNDOCUMENTED_EDIT'])
  assert.match(result.problems[0].message, /differs from skills\/demo\/SKILL\.md/)
})

test('a vendored file with no mirror and no entry fails as having no disposition', () => {
  const result = audit({ [HOOK]: 'upstream' }, [])
  assert.deepEqual(codes(result), ['NO_DISPOSITION'])
})

test('a subtree entry covers every file below it', () => {
  const result = audit(
    { [HOOK]: 'a', 'vendor/superpowers/hooks/second.cmd': 'b' },
    [{ path: 'vendor/superpowers/hooks/', disposition: 'omitted', doc: 'E7' }],
  )
  assert.deepEqual(result.problems, [])
  assert.equal(result.counts.omitted, 2)
})

test('an entry recorded as edited that is now identical fails as a false claim', () => {
  const result = audit(
    { [SKILL]: 'same', [MIRROR]: 'same' },
    [{ path: SKILL, disposition: 'edited', local: MIRROR, doc: 'R1' }],
  )
  assert.deepEqual(codes(result), ['FALSE_EDIT'])
})

test('a ported entry whose local file is missing fails', () => {
  const result = audit(
    { [HOOK]: 'upstream' },
    [{ path: HOOK, disposition: 'ported', local: 'hooks/run-hook.mjs', doc: 'R3' }],
  )
  assert.deepEqual(codes(result), ['MISSING_LOCAL'])
})

test('an entry for a path that is not vendored fails as stale', () => {
  const gone = audit(
    { [HOOK]: 'a' },
    [
      { path: HOOK, disposition: 'omitted', doc: 'R2' },
      { path: 'vendor/superpowers/hooks/gone.cmd', disposition: 'omitted', doc: 'R2' },
    ],
  )
  assert.deepEqual(codes(gone), ['STALE_ENTRY'])

  const directory = audit(
    { [HOOK]: 'a' },
    [
      { path: HOOK, disposition: 'omitted', doc: 'R2' },
      { path: 'vendor/superpowers/hooks', disposition: 'omitted', doc: 'R2' },
    ],
  )
  assert.deepEqual(codes(directory), ['STALE_ENTRY'])
  assert.match(directory.problems[0].message, /must end with "\/"/)
})

test('a reason that cites a row the document does not have fails', () => {
  const result = audit({ [HOOK]: 'a' }, [{ path: HOOK, disposition: 'omitted', doc: 'R99' }])
  assert.deepEqual(codes(result), ['BAD_DOC_REF'])
  assert.match(result.problems[0].message, /no matching row in docs\/UPSTREAM\.md/)
})

test('an upstream root that holds no vendored file fails', () => {
  const result = audit({ [HOOK]: 'a' }, [{ path: HOOK, disposition: 'omitted', doc: 'R2' }], {
    upstreams: [{ id: 'ecc', version: '2.2.3', path: 'vendor/ecc' }],
  })
  assert.deepEqual(codes(result), ['BAD_ROOT'])
})

test('two entries for one path fail instead of the last one winning', () => {
  const result = audit(
    { [HOOK]: 'a' },
    [
      { path: HOOK, disposition: 'omitted', doc: 'R2' },
      { path: HOOK, disposition: 'reference' },
    ],
  )
  assert.deepEqual(codes(result), ['DUPLICATE_ENTRY'])
})

test('a disposition that cannot carry a local path rejects one', () => {
  const result = audit({ [HOOK]: 'a' }, [{ path: HOOK, disposition: 'license', local: 'LICENSE', doc: 'R2' }])
  assert.deepEqual(codes(result), ['BAD_ENTRY'])
})

test('row labels are read from a bare number, E<n> and S<n>', () => {
  const labels = docLabels(DOC)
  assert.deepEqual([...labels].sort(), ['E7', 'R1', 'R2', 'R3', 'S2'])
})
