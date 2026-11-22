// Behaviour tests for the ported find-polluter helper.
//
// The port matters because the shell original cannot run on this machine (no
// `bash` on PATH), and because a bisection tool that reports "clean" without
// having tested anything is worse than no tool. The end-to-end case runs a real
// `npm test` in a fixture package, so the forwarding of the file argument and
// the exit status are observed rather than assumed.
import { test } from 'node:test'
import assert from 'node:assert/strict'
import { spawnSync } from 'node:child_process'
import { existsSync, mkdirSync, mkdtempSync, readFileSync, rmSync, writeFileSync } from 'node:fs'
import { dirname, join, resolve } from 'node:path'
import { fileURLToPath } from 'node:url'

const root = resolve(dirname(fileURLToPath(import.meta.url)), '..')
const script = join(root, 'skills', 'systematic-debugging', 'scripts', 'find-polluter.mjs')

const tmpBase = join(root, 'tests', '.tmp')
mkdirSync(tmpBase, { recursive: true })

function fixture(files) {
  const directory = mkdtempSync(join(tmpBase, 'polluter-'))
  for (const [path, content] of Object.entries(files)) {
    const target = join(directory, path)
    mkdirSync(dirname(target), { recursive: true })
    writeFileSync(target, content)
  }
  return directory
}

function run(cwd, args) {
  return spawnSync(process.execPath, [script, ...args], { cwd, encoding: 'utf8', windowsHide: true })
}

const { findMatchingFiles, patternMatcher } = await import(
  new URL('../skills/systematic-debugging/scripts/find-polluter.mjs', import.meta.url).href
)

test('a double star matches zero or more directories', () => {
  const matches = patternMatcher('src/**/*.test.ts')
  assert.equal(matches('src/top.test.ts'), true)
  assert.equal(matches('src/a/b.test.ts'), true)
  assert.equal(matches('other/b.test.ts'), false)
  assert.equal(matches('src/b.spec.ts'), false)
  assert.equal(patternMatcher('*.test.js')('deep/a.test.js'), false)
  assert.equal(patternMatcher('.git')('.git'), true)
})

test('the walk returns matching files relative and sorted, and prunes nothing', () => {
  const directory = fixture({
    'b.test.ts': '',
    'a/top.test.ts': '',
    'a/deep/inner.test.ts': '',
    'a/deep/notes.md': '',
    '.git/skipme.test.ts': '',
  })
  try {
    assert.deepEqual(
      findMatchingFiles(directory, patternMatcher('**/*.test.ts')),
      ['.git/skipme.test.ts', 'a/deep/inner.test.ts', 'a/top.test.ts', 'b.test.ts'],
    )
  } finally {
    rmSync(directory, { recursive: true, force: true })
  }
})

test('bad usage and an empty search are different failures', () => {
  const directory = fixture({ 'only.md': 'nothing to test' })
  try {
    assert.equal(run(directory, []).status, 2)
    assert.equal(run(directory, ['leftover']).status, 2)
    const empty = run(directory, ['leftover', '*.test.js'])
    assert.equal(empty.status, 3)
    assert.match(empty.stderr, /no test file matches/)
    assert.doesNotMatch(empty.stdout, /No polluter found/)
  } finally {
    rmSync(directory, { recursive: true, force: true })
  }
})

test('pollution that already exists is reported, not blamed on a test', () => {
  const directory = fixture({ 'a.test.js': '', leftover: 'from before' })
  try {
    const result = run(directory, ['leftover', '*.test.js'])
    assert.equal(result.status, 3)
    assert.match(result.stderr, /could not be judged/)
  } finally {
    rmSync(directory, { recursive: true, force: true })
  }
})

test('a real test run names the file that created the pollution', () => {
  const directory = fixture({
    'package.json': JSON.stringify({
      name: 'polluter-fixture',
      version: '1.0.0',
      scripts: { test: 'node pollute.mjs' },
    }),
    'pollute.mjs': [
      "import { writeFileSync } from 'node:fs'",
      "const file = process.argv[2] ?? ''",
      "if (file.includes('bad')) writeFileSync('leftover', 'created by ' + file)",
      '',
    ].join('\n'),
    'bad.test.js': '',
    'clean.test.js': '',
  })
  try {
    const result = run(directory, ['leftover', '*.test.js'])
    assert.equal(result.status, 1, `stdout: ${result.stdout}\nstderr: ${result.stderr}`)
    assert.match(result.stdout, /FOUND POLLUTER/)
    assert.match(result.stdout, /bad\.test\.js/)
    assert.equal(existsSync(join(directory, 'leftover')), true)
    assert.equal(readFileSync(join(directory, 'leftover'), 'utf8'), 'created by bad.test.js')
  } finally {
    rmSync(directory, { recursive: true, force: true })
  }
})
