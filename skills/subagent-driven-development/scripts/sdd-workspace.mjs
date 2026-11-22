// Resolve and ensure the working-tree directory SDD uses for one plan's
// short-lived artifacts: task briefs, implementer reports, review packages, and
// the progress ledger. Print the plan directory's absolute path.
//
// One directory per plan (.superpowers/sdd/<plan-basename>/) so a follow-up plan
// in the same working tree can never read or overwrite another plan's artifacts.
// A stale ledger misread as current progress makes controllers skip whole task
// sequences - plan-scoping removes that failure structurally.
//
// Basename slugs collide when two plans share a filename (docs/alpha/plan.md vs
// docs/beta/plan.md), so each workspace records its owning plan's path in a
// plan-path marker (repo-relative in-repo, absolute outside). A workspace owned
// by a different plan is skipped and the slug disambiguated with the plan's
// parent-directory name, then a counter. A workspace with no marker predates the
// marker scheme and is adopted for the current plan so in-flight workspaces keep
// resolving - which means the first collision on such a legacy workspace adopts
// instead of detecting; acceptable, marker-less workspaces age out as plans
// finish.
//
// The workspace lives in the working tree (not under .git/), because harnesses
// deny agent writes there - which would block an implementer subagent from
// writing its report file. A self-ignoring .gitignore at .superpowers/sdd/ keeps
// every plan's workspace out of `git status` and out of accidental commits
// without modifying any tracked file.
//
// Single source of truth for the workspace location, so task-brief and
// review-package cannot drift to different directories.
//
// The repository is the current directory's (see sdd-repo). -C DIR runs as if
// started in DIR, the way git -C does: a caller working on another checkout or
// worktree needs no `cd DIR ;` prefix.
//
// Usage: node sdd-workspace.mjs [-C DIR] PLAN_FILE
import { existsSync, mkdirSync, readFileSync, realpathSync, statSync, writeFileSync } from 'node:fs'
import { basename, dirname, join, resolve, sep } from 'node:path'
import { pathToFileURL } from 'node:url'
import { repoRoot } from './sdd-repo.mjs'

export class WorkspaceError extends Error {
  constructor(message, code = 2) {
    super(message)
    this.name = 'WorkspaceError'
    this.code = code
  }
}

function isDirectory(path) {
  try {
    return statSync(path).isDirectory()
  } catch {
    return false
  }
}

/** The workspace name a plan file maps to, or a WorkspaceError. */
export function planSlug(plan) {
  const name = basename(plan)
  const slug = name.endsWith('.md') ? name.slice(0, -3) : name
  if (slug === '' || slug === '.' || slug === '..') {
    throw new WorkspaceError(`cannot derive a workspace name from: ${plan}`)
  }
  return slug
}

/**
 * Ensure the workspace for `plan` exists and return its absolute path.
 *
 * `scratchDir` is where the repository lookup may put its temporary capture
 * file; it defaults to the plan's own directory, which is inside the project.
 */
export function resolveWorkspace(plan, { scratchDir } = {}) {
  const planFile = resolve(plan)
  if (!existsSync(planFile) || !statSync(planFile).isFile()) {
    throw new WorkspaceError(`no such plan file: ${plan}`)
  }
  const slug = planSlug(plan)

  const scratch = scratchDir ?? dirname(planFile)
  const root = realpathSync.native(repoRoot({ cwd: process.cwd(), scratchDir: scratch }))
  const base = join(root, '.superpowers', 'sdd')

  // Physical path, so relative/absolute/../ spellings of one plan compare equal,
  // and expressed the way the marker stores it: repo-relative in-repo, absolute
  // outside.
  const planDir = realpathSync.native(dirname(planFile))
  const planAbs = join(planDir, basename(planFile))
  const planId = planAbs.startsWith(root + sep) ? planAbs.slice(root.length + 1) : planAbs

  // True when the workspace at `dir` is (or becomes) this plan's: an existing
  // marker must name this plan; a missing marker means a new workspace or a
  // pre-marker legacy one, and either way the plan claims it by writing one.
  const owns = dir => {
    const marker = join(dir, 'plan-path')
    if (existsSync(marker)) return readFileSync(marker, 'utf8').replace(/\r?\n$/, '') === planId
    mkdirSync(dir, { recursive: true })
    writeFileSync(marker, `${planId}\n`)
    return true
  }

  let dir = join(base, slug)
  if (!owns(dir)) {
    const parent = basename(planDir)
    dir = join(base, `${slug}-${parent}`)
    if (!owns(dir)) {
      let n = 2
      while (!owns(join(base, `${slug}-${parent}-${n}`))) n += 1
      dir = join(base, `${slug}-${parent}-${n}`)
    }
  }

  // Create-only: a repo may commit its own .gitignore here (e.g. to version
  // progress.md ledgers); overwriting it would revert that on every run.
  const ignore = join(base, '.gitignore')
  if (!existsSync(ignore)) writeFileSync(ignore, '*\n')

  return dir
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
  if (args.length !== 1) {
    process.stderr.write('usage: sdd-workspace [-C DIR] PLAN_FILE\n')
    return 2
  }
  try {
    process.stdout.write(`${resolveWorkspace(args[0])}\n`)
    return 0
  } catch (error) {
    if (error instanceof WorkspaceError) {
      process.stderr.write(`${error.message}\n`)
      return error.code
    }
    throw error
  }
}

const isMain = process.argv[1] !== undefined && import.meta.url === pathToFileURL(process.argv[1]).href
if (isMain) process.exitCode = main(process.argv.slice(2))
