// Print the top-level directory of the git working tree the SDD scripts use:
// the current directory's, exactly as git itself picks one. A caller that means
// a different working tree says so with the scripts' -C DIR, which they apply
// (chdir) before calling this.
//
// The plan file's location never picks the repository. An executor working in a
// linked worktree commonly holds an absolute path to the plan in the main
// checkout (writing-plans leaves the plan uncommitted there), and its workspace
// and commits belong to the worktree it is working in. And a caller standing
// outside any repository, such as the skill's own directory in an installed
// plugin, is in the wrong place: guessing a repository from the plan would
// silently act on whichever checkout the path points into.
//
// Outside any working tree, stop. --with-commit also stops on a repository with
// no commit yet, for callers that need HEAD as a BASE or a review range.
//
// Single source of truth for which repository the SDD and executing-plans
// scripts work in, so no two of them can disagree.
//
// Usage: node sdd-repo.mjs [--with-commit]
import { pathToFileURL } from 'node:url'
import { runCaptured, runInherited, runSilent } from './lib/exec.mjs'

export class RepoError extends Error {
  constructor(message) {
    super(message)
    this.name = 'RepoError'
  }
}

function outsideRepoMessage(cwd) {
  return `SDD scripts must run from inside the git working tree you're executing in, with at least one commit (current directory: ${cwd}). If this is a new project, run 'git init' and make a first commit, then rerun.`
}

function firstLine(text) {
  const line = text.split(/\r?\n/).find(candidate => candidate.trim() !== '')
  return line === undefined ? undefined : line.trim()
}

/**
 * The working tree root of `cwd`, or a RepoError naming why there is none.
 * `scratchDir` is where the call's temporary capture file may live.
 */
export function repoRoot({ cwd = process.cwd(), scratchDir } = {}) {
  const { status, text } = runCaptured('git', ['rev-parse', '--show-toplevel'], { cwd, scratchDir })
  const root = text.split(/\r?\n/).map(line => line.trim()).find(line => line !== '')
  if (status !== 0 || root === undefined) {
    const said = firstLine(text)
    throw new RepoError(said === undefined ? outsideRepoMessage(cwd) : `${outsideRepoMessage(cwd)} git said: ${said}`)
  }
  return root
}

/** The full HEAD commit of the working tree at `cwd`, or a RepoError. */
export function headCommit({ cwd = process.cwd(), scratchDir } = {}) {
  const { status, text } = runCaptured('git', ['rev-parse', '--verify', 'HEAD'], { cwd, scratchDir })
  const sha = text.trim()
  if (status !== 0 || sha === '') {
    const said = firstLine(text)
    throw new RepoError(said === undefined ? outsideRepoMessage(cwd) : `${outsideRepoMessage(cwd)} git said: ${said}`)
  }
  return sha
}

/** True when `rev` resolves to a commit in `repo`. */
export function revisionExists(repo, rev) {
  return runSilent('git', ['rev-parse', '--verify', '--quiet', rev], { cwd: repo }) === 0
}

function main(argv) {
  const args = [...argv]
  let withCommit = false
  if (args[0] === '--with-commit') {
    withCommit = true
    args.shift()
  }
  if (args.length !== 0) {
    process.stderr.write('usage: sdd-repo [--with-commit]\n')
    return 2
  }

  // The root is printed by git itself through inherited stdio: no capture file
  // and no pipe, so this works even where the caller cannot write.
  const shown = runInherited('git', ['rev-parse', '--show-toplevel'])
  if (shown !== 0) {
    process.stderr.write(`\n${outsideRepoMessage(process.cwd())}\n`)
    return 2
  }
  if (!withCommit) return 0

  if (runSilent('git', ['rev-parse', '--verify', '--quiet', 'HEAD']) === 0) return 0
  process.stderr.write(`\n${outsideRepoMessage(process.cwd())}\n`)
  process.stderr.write('git said: this repository has no commit yet\n')
  return 2
}

const isMain = process.argv[1] !== undefined && import.meta.url === pathToFileURL(process.argv[1]).href
if (isMain) process.exitCode = main(process.argv.slice(2))
