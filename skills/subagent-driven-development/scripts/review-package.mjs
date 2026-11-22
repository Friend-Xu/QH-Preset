// Generate a review package: commit list, stat summary, and the net diff with
// extended context, written to a file the reviewer reads in one call. Using the
// recorded per-task BASE (not HEAD~1) keeps multi-commit tasks intact.
//
// Usage: node review-package.mjs [-C DIR] PLAN_FILE BASE HEAD [OUTFILE]
// Default OUTFILE: <repo-root>/.superpowers/sdd/<plan-basename>/review-<base7>..<head7>.diff
// (named per range, so a re-review after fixes gets a distinct fresh file).
// The repository is the one sdd-repo names; -C DIR runs as if started in DIR, as
// in sdd-workspace.
import { existsSync, mkdirSync, statSync, writeFileSync } from 'node:fs'
import { dirname, join, resolve } from 'node:path'
import { pathToFileURL } from 'node:url'
import { runCaptured } from './lib/exec.mjs'
import { repoRoot, revisionExists } from './sdd-repo.mjs'
import { resolveWorkspace } from './sdd-workspace.mjs'

export class ReviewPackageError extends Error {
  constructor(message, code) {
    super(message)
    this.name = 'ReviewPackageError'
    this.code = code
  }
}

/** Run one git command in `repo` and return its trimmed stdout. */
function git(repo, args, scratchDir) {
  const { status, text, error } = runCaptured('git', args, { cwd: repo, scratchDir })
  if (error !== undefined) throw error
  if (status !== 0) {
    throw new ReviewPackageError(`git ${args[0]} failed (exit ${status}): ${text.trim()}`, 2)
  }
  return text
}

/**
 * Write a review package for `base..head` and return the path plus its totals.
 * Range guards refuse a wrong-branch HEAD: a range that is empty or not rooted
 * at BASE would silently produce a bogus review package.
 */
export function writeReviewPackage(planFile, base, head, outFile) {
  const plan = resolve(planFile)
  const scratchDir = dirname(plan)
  const repo = repoRoot({ cwd: process.cwd(), scratchDir })

  if (!revisionExists(repo, base)) throw new ReviewPackageError(`bad BASE: ${base}`, 2)
  if (!revisionExists(repo, head)) throw new ReviewPackageError(`bad HEAD: ${head}`, 2)

  const ancestor = runCaptured('git', ['merge-base', '--is-ancestor', base, head], { cwd: repo, scratchDir })
  if (ancestor.status !== 0) {
    throw new ReviewPackageError(`HEAD is not a descendant of BASE: ${base}..${head}`, 3)
  }
  const commits = Number.parseInt(git(repo, ['rev-list', '--count', `${base}..${head}`], scratchDir).trim(), 10)
  if (!Number.isFinite(commits) || commits <= 0) {
    throw new ReviewPackageError(`empty commit range: ${base}..${head}`, 3)
  }

  let out = outFile
  if (out === undefined) {
    const shortBase = git(repo, ['rev-parse', '--short', base], scratchDir).trim()
    const shortHead = git(repo, ['rev-parse', '--short', head], scratchDir).trim()
    out = join(resolveWorkspace(planFile), `review-${shortBase}..${shortHead}.diff`)
  }

  const content = [
    `# Review package: ${base}..${head}`,
    '',
    '## Commits',
    git(repo, ['log', '--oneline', `${base}..${head}`], scratchDir).replace(/\r?\n$/, ''),
    '',
    '## Files changed',
    git(repo, ['diff', '--stat', `${base}..${head}`], scratchDir).replace(/\r?\n$/, ''),
    '',
    '## Diff',
    git(repo, ['diff', '-U10', `${base}..${head}`], scratchDir),
  ].join('\n')

  mkdirSync(dirname(out), { recursive: true })
  writeFileSync(out, content)
  return { out, commits, bytes: statSync(out).size }
}

function isDirectory(path) {
  try {
    return statSync(path).isDirectory()
  } catch {
    return false
  }
}

function main(argv) {
  const args = [...argv]
  if (args[0] === '-C') {
    const directory = args[1]
    if (directory === undefined || !isDirectory(directory)) {
      process.stderr.write(`bad -C directory: ${directory ?? ''}\n`)
      return 2
    }
    process.chdir(directory)
    args.splice(0, 2)
  }
  if (args.length < 3 || args.length > 4) {
    process.stderr.write('usage: review-package [-C DIR] PLAN_FILE BASE HEAD [OUTFILE]\n')
    return 2
  }
  const [plan, base, head, outFile] = args
  if (!existsSync(plan) || !statSync(plan).isFile()) {
    process.stderr.write(`no such plan file: ${plan}\n`)
    return 2
  }
  try {
    const result = writeReviewPackage(plan, base, head, outFile)
    process.stdout.write(`wrote ${result.out}: ${result.commits} commit(s), ${result.bytes} bytes\n`)
    return 0
  } catch (error) {
    if (error?.name === 'ReviewPackageError' || error?.name === 'WorkspaceError' || error?.name === 'RepoError') {
      process.stderr.write(`${error.message}\n`)
      return error.code ?? 2
    }
    throw error
  }
}

const isMain = process.argv[1] !== undefined && import.meta.url === pathToFileURL(process.argv[1]).href
if (isMain) process.exitCode = main(process.argv.slice(2))
