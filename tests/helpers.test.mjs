// Behaviour tests for the plan-execution helpers.
//
// These are the mechanical core of executing-plans and subagent-driven-development:
// they decide where a plan's artifacts live, what a task brief contains, and when
// a task is recorded as complete. The bash originals could not be tested here (no
// bash on PATH), which is why they were replaced rather than wrapped.
//
// Every child process here is captured through a file descriptor, never a pipe:
// under DSH's Windows sandbox a piped stdio child fails with EPERM, and a test
// that only works outside the sandbox proves nothing about where the helpers run.
import { after, test } from 'node:test'
import assert from 'node:assert/strict'
import { spawnSync } from 'node:child_process'
import {
  closeSync, existsSync, mkdirSync, mkdtempSync, openSync, readFileSync, readdirSync,
  realpathSync, rmSync, statSync, writeFileSync,
} from 'node:fs'
import { dirname, join, resolve } from 'node:path'
import { fileURLToPath } from 'node:url'

const root = resolve(dirname(fileURLToPath(import.meta.url)), '..')
const scripts = join(root, 'skills', 'subagent-driven-development', 'scripts')
const sddRepo = join(scripts, 'sdd-repo.mjs')
const sddWorkspace = join(scripts, 'sdd-workspace.mjs')
const taskBrief = join(scripts, 'task-brief.mjs')
const reviewPackage = join(scripts, 'review-package.mjs')
const taskStart = join(root, 'skills', 'executing-plans', 'scripts', 'task-start.mjs')
const taskDone = join(root, 'skills', 'executing-plans', 'scripts', 'task-done.mjs')

const tmpBase = join(root, 'tests', '.tmp')
mkdirSync(tmpBase, { recursive: true })
const tmpRoot = mkdtempSync(join(tmpBase, 'run-'))
after(() => rmSync(tmpRoot, { recursive: true, force: true }))

/** The path and the counts from a helper's `wrote <path>: ...` line. */
function wrote(stdout, pattern) {
  const match = new RegExp(`^wrote (.+): ${pattern}$`, 'm').exec(stdout)
  assert.ok(match !== null, `no "wrote" line in: ${stdout}`)
  return match
}

let captureCounter = 0

function git(cwd, args) {
  const result = spawnSync('git', args, { cwd, encoding: 'utf8', windowsHide: true })
  assert.equal(result.status, 0, `git ${args.join(' ')} failed: ${result.stderr}`)
  return result.stdout.trim()
}

/** Run one helper, capturing its output through files rather than pipes. */
function run(cwd, script, args) {
  const id = `${process.pid}-${captureCounter++}`
  const outFile = join(tmpRoot, `.out-${id}`)
  const errFile = join(tmpRoot, `.err-${id}`)
  const out = openSync(outFile, 'w')
  const err = openSync(errFile, 'w')
  let status
  try {
    const result = spawnSync(process.execPath, [script, ...args], {
      cwd,
      // Without the ceiling, git would walk out of the fixture and find this
      // package's own repository, and the "outside a working tree" case would
      // pass for the wrong reason.
      env: { ...process.env, GIT_CEILING_DIRECTORIES: tmpRoot },
      stdio: ['ignore', out, err],
      windowsHide: true,
    })
    status = result.status
  } finally {
    closeSync(out)
    closeSync(err)
  }
  return {
    status,
    stdout: readFileSync(outFile, 'utf8'),
    stderr: readFileSync(errFile, 'utf8'),
  }
}

/** Compare two paths regardless of separators or drive-letter case. */
function samePath(actual, expected) {
  const norm = value => value.replace(/\\/g, '/').replace(/^([a-z]):/i, (_, letter) => `${letter.toUpperCase()}:`)
  assert.equal(norm(actual), norm(expected))
}

const PLAN = `# Daily expense tracker

## Task 1: data model
Add the entry shape.

- [ ] one field

## Task 2: totals
Compute today and this month.

### Task 2a: rounding
Round to cents.

## Task 3: persistence
Save to storage.

\`\`\`html
## Task 9: this is a code sample, not a heading
\`\`\`

## Task 6: six
Body of six.

## Task 6b: six b
Body of six b.
`

/** A git repo with a committed plan, at docs/plan.md. */
function fixture({ plan = PLAN, commit = true, name = 'repo' } = {}) {
  const dir = mkdtempSync(join(tmpRoot, `${name}-`))
  git(dir, ['init', '--quiet'])
  git(dir, ['config', 'user.name', 'fixture'])
  git(dir, ['config', 'user.email', 'fixture@local'])
  mkdirSync(join(dir, 'docs'), { recursive: true })
  writeFileSync(join(dir, 'docs', 'plan.md'), plan)
  if (commit) {
    git(dir, ['add', '-A'])
    git(dir, ['commit', '--quiet', '-m', 'add plan'])
  }
  return dir
}

test('sdd-repo prints the working tree root', () => {
  const repo = fixture()
  const result = run(repo, sddRepo, [])
  assert.equal(result.status, 0)
  samePath(result.stdout.trim(), realpathSync.native(repo))
})

test('sdd-repo refuses outside a working tree and writes nothing there', () => {
  const dir = mkdtempSync(join(tmpRoot, 'plain-'))
  const result = run(dir, sddRepo, [])
  assert.equal(result.status, 2)
  assert.match(result.stderr, /must run from inside the git working tree/)
  assert.equal(existsSync(join(dir, '.superpowers')), false)
})

test('sdd-repo --with-commit refuses a repository with no commit', () => {
  const repo = fixture({ commit: false })
  assert.equal(run(repo, sddRepo, []).status, 0)
  const result = run(repo, sddRepo, ['--with-commit'])
  assert.equal(result.status, 2)
  assert.match(result.stderr, /with at least one commit/)
})

test('sdd-workspace creates the plan workspace with a plan marker', () => {
  const repo = fixture()
  const dir = run(repo, sddWorkspace, ['docs/plan.md'])
  assert.equal(dir.status, 0)
  const workspace = dir.stdout.trim()
  assert.equal(workspace.replace(/\\/g, '/').endsWith('/.superpowers/sdd/plan'), true)
  assert.equal(readFileSync(join(workspace, 'plan-path'), 'utf8').trim(), join('docs', 'plan.md'))
  assert.equal(readFileSync(join(repo, '.superpowers', 'sdd', '.gitignore'), 'utf8').trim(), '*')
  assert.equal(git(repo, ['status', '--porcelain']), '')
})

test('sdd-workspace is idempotent for one plan and disambiguates two plans with one name', () => {
  const repo = fixture()
  const first = run(repo, sddWorkspace, ['docs/plan.md']).stdout.trim()
  assert.equal(run(repo, sddWorkspace, ['docs/plan.md']).stdout.trim(), first)

  mkdirSync(join(repo, 'docs', 'beta'), { recursive: true })
  writeFileSync(join(repo, 'docs', 'beta', 'plan.md'), PLAN)
  const second = run(repo, sddWorkspace, ['docs/beta/plan.md']).stdout.trim()
  assert.equal(second.replace(/\\/g, '/').endsWith('/.superpowers/sdd/plan-beta'), true)
})

test('sdd-workspace -C selects the working tree instead of the cwd', () => {
  const repo = fixture()
  const other = fixture()
  const outside = mkdtempSync(join(tmpRoot, 'outside-'))
  const result = run(outside, sddWorkspace, ['-C', other, 'docs/plan.md'])
  assert.equal(result.status, 0)
  assert.equal(result.stdout.trim().replace(/\\/g, '/').startsWith(other.replace(/\\/g, '/')), true)
  assert.equal(existsSync(join(repo, '.superpowers')), false)
})

test('task-brief extracts only the requested task, keeping its sub-tasks', () => {
  const repo = fixture()
  const result = run(repo, taskBrief, ['docs/plan.md', '2'])
  assert.equal(result.status, 0)
  const outFile = wrote(result.stdout, '\\d+ lines')[1]
  assert.match(outFile, /task-2-brief\.md$/)
  const body = readFileSync(outFile, 'utf8')
  assert.match(body, /^## Task 2: totals$/m)
  assert.match(body, /^### Task 2a: rounding$/m)
  assert.match(body, /Round to cents\./)
  assert.doesNotMatch(body, /Task 1|Task 3|Task 6/)
})

test('task-brief compares task ids as whole strings', () => {
  const repo = fixture()
  const six = run(repo, taskBrief, ['docs/plan.md', '6'])
  assert.equal(six.status, 0)
  const body = readFileSync(wrote(six.stdout, '\\d+ lines')[1], 'utf8')
  assert.match(body, /^## Task 6: six$/m)
  assert.doesNotMatch(body, /six b/)
})

test('task-brief reports a missing task without leaving an output file', () => {
  const repo = fixture()
  const result = run(repo, taskBrief, ['docs/plan.md', '42'])
  assert.equal(result.status, 3)
  assert.match(result.stderr, /task 42 not found/)
  assert.equal(existsSync(join(repo, '.superpowers', 'sdd', 'plan', 'task-42-brief.md')), false)
})

test('task-brief refuses when an unclosed fence hides the next task', () => {
  const plan = '# Plan\n\n## Task 1: one\n\n```js\nconst a = 1\n\n## Task 2: two\nbody\n'
  const repo = fixture({ plan })
  const result = run(repo, taskBrief, ['docs/plan.md', '1'])
  assert.equal(result.status, 4)
  assert.match(result.stderr, /never closes/)
  assert.equal(existsSync(join(repo, '.superpowers', 'sdd', 'plan', 'task-1-brief.md')), false)
})

test('task-brief warns but delivers when the open fence hides no task', () => {
  const plan = '# Plan\n\n## Task 1: one\nbody\n\n```js\nconst a = 1\n'
  const repo = fixture({ plan })
  const result = run(repo, taskBrief, ['docs/plan.md', '1'])
  assert.equal(result.status, 0)
  assert.match(result.stderr, /hides no Task heading, so this brief is complete/)
  assert.match(readFileSync(wrote(result.stdout, '\\d+ lines')[1], 'utf8'), /^body$/m)
})

test('task-brief names the headings that look like translated tasks', () => {
  const plan = '# Plan\n\n## Tarea 1: modelo\ncuerpo\n'
  const repo = fixture({ plan })
  const result = run(repo, taskBrief, ['docs/plan.md', '1'])
  assert.equal(result.status, 3)
  assert.match(result.stderr, /no task headings found/)
  assert.match(result.stderr, /## Tarea 1: modelo/)
})

test('review-package writes the commit list, stat and diff for a range', () => {
  const repo = fixture()
  const base = git(repo, ['rev-parse', 'HEAD'])
  writeFileSync(join(repo, 'docs', 'extra.md'), 'extra\n')
  git(repo, ['add', '-A'])
  git(repo, ['commit', '--quiet', '-m', 'add extra'])
  const head = git(repo, ['rev-parse', 'HEAD'])

  const result = run(repo, reviewPackage, ['docs/plan.md', base, head])
  assert.equal(result.status, 0)
  const outFile = wrote(result.stdout, '1 commit\\(s\\), \\d+ bytes')[1]
  const text = readFileSync(outFile, 'utf8')
  assert.match(text, /^## Commits$/m)
  assert.match(text, /add extra/)
  assert.match(text, /^## Files changed$/m)
  assert.match(text, /^## Diff$/m)
  assert.match(text, /\+extra/)
})

test('review-package refuses an empty range and a non-descendant range', () => {
  const repo = fixture()
  const first = git(repo, ['rev-parse', 'HEAD'])
  writeFileSync(join(repo, 'docs', 'extra.md'), 'extra\n')
  git(repo, ['add', '-A'])
  git(repo, ['commit', '--quiet', '-m', 'add extra'])
  const second = git(repo, ['rev-parse', 'HEAD'])

  const empty = run(repo, reviewPackage, ['docs/plan.md', first, first])
  assert.equal(empty.status, 3)
  assert.match(empty.stderr, /empty commit range/)

  const backwards = run(repo, reviewPackage, ['docs/plan.md', second, first])
  assert.equal(backwards.status, 3)
  assert.match(backwards.stderr, /not a descendant/)
})

test('task-start prints the brief path and BASE', () => {
  const repo = fixture()
  const result = run(repo, taskStart, ['docs/plan.md', '1'])
  assert.equal(result.status, 0)
  const brief = /^brief: (.+)$/m.exec(result.stdout)
  const base = /^base: ([0-9a-f]{40})$/m.exec(result.stdout)
  assert.ok(brief !== null, result.stdout)
  assert.ok(base !== null, result.stdout)
  assert.equal(existsSync(brief[1]), true)
  assert.equal(base[1], git(repo, ['rev-parse', 'HEAD']))
})

test('task-done records a passing task and keeps the full output', () => {
  const repo = fixture()
  const base = git(repo, ['rev-parse', 'HEAD'])
  const result = run(repo, taskDone, ['docs/plan.md', '1', base, '--', 'node', '-e', 'console.log("ok")'])
  assert.equal(result.status, 0)
  assert.match(result.stdout, /^ok$/m)
  assert.match(result.stdout, /^ledger: Task 1: complete \(commits [0-9a-f]{7}\.\.[0-9a-f]{7}, tests: node -e 'console\.log\("ok"\)' → ok\)$/m)

  const workspace = join(repo, '.superpowers', 'sdd', 'plan')
  assert.equal(readFileSync(join(workspace, 'task-1-tests.log'), 'utf8'), 'ok\n')
  const ledger = readFileSync(join(workspace, 'progress.md'), 'utf8')
  assert.match(ledger, /^# SDD ledger — plan: docs\/plan\.md$/m)
  assert.match(ledger, /^Task 1: complete/m)
})

test('task-done propagates a failing command and records nothing', () => {
  const repo = fixture()
  const base = git(repo, ['rev-parse', 'HEAD'])
  const result = run(repo, taskDone, ['docs/plan.md', '1', base, '--', 'node', '-e', 'process.exit(7)'])
  assert.equal(result.status, 7)
  assert.match(result.stderr, /NOT recorded/)
  assert.equal(existsSync(join(repo, '.superpowers', 'sdd', 'plan', 'progress.md')), false)
})

test('helpers reject bad usage and a missing plan with exit 2', () => {
  const repo = fixture()
  const workspace = run(repo, sddWorkspace, [])
  assert.equal(workspace.status, 2)
  assert.match(workspace.stderr, /^usage: sdd-workspace/m)

  const brief = run(repo, taskBrief, ['docs/missing.md', '1'])
  assert.equal(brief.status, 2)
  assert.match(brief.stderr, /no such plan file/)

  const done = run(repo, taskDone, ['docs/plan.md', '1', 'HEAD'])
  assert.equal(done.status, 2)
  assert.match(done.stderr, /^usage: task-done/m)
})

test('helpers leave no capture files and no untracked changes behind', () => {
  const repo = fixture()
  const base = git(repo, ['rev-parse', 'HEAD'])
  run(repo, sddWorkspace, ['docs/plan.md'])
  run(repo, taskBrief, ['docs/plan.md', '2'])
  run(repo, taskStart, ['docs/plan.md', '1'])
  run(repo, taskDone, ['docs/plan.md', '1', base, '--', 'node', '-e', 'console.log("ok")'])

  const walk = dir => readdirSync(dir, { withFileTypes: true }).flatMap(entry => {
    const full = join(dir, entry.name)
    if (entry.isDirectory()) return entry.name === '.git' ? [] : walk(full)
    return entry.name.startsWith('.qh-capture') ? [full] : []
  })
  assert.deepEqual(walk(repo), [])
  assert.equal(git(repo, ['status', '--porcelain']), '')
  assert.equal(statSync(join(repo, '.superpowers', 'sdd')).isDirectory(), true)
})
