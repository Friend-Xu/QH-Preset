// Begin one task of an inline plan execution in a single call: extract the
// task's brief (via subagent-driven-development's task-brief, so both skills
// share one workspace) and record BASE, the commit the task's review range is
// cut from. One tool call instead of two, because every call in an inline
// session is a turn that re-reads the whole context.
//
// Usage: node task-start.mjs PLAN_FILE TASK_NUMBER
// Prints:
//   brief: <path to the task's brief file>
//   base:  <full SHA of HEAD>
import { existsSync, statSync } from 'node:fs'
import { dirname, resolve } from 'node:path'
import { pathToFileURL } from 'node:url'
import { headCommit, repoRoot } from '../../subagent-driven-development/scripts/sdd-repo.mjs'
import { writeBrief } from '../../subagent-driven-development/scripts/task-brief.mjs'

export function startTask(planFile, n) {
  const plan = resolve(planFile)
  if (!existsSync(plan) || !statSync(plan).isFile()) {
    const error = new Error(`no such plan file: ${planFile}`)
    error.name = 'UsageError'
    throw error
  }
  // BASE comes from the same repository the brief is written into, not from the
  // bare cwd; the repository must already have a commit.
  const scratchDir = dirname(plan)
  const repo = repoRoot({ cwd: process.cwd(), scratchDir })
  const base = headCommit({ cwd: repo, scratchDir })

  const brief = writeBrief(planFile, n)
  if (brief.exitCode !== 0) {
    const error = new Error(brief.messages.join('\n'))
    error.name = 'BriefError'
    error.code = brief.exitCode
    error.messages = brief.messages
    throw error
  }
  return { brief: brief.out, base, messages: brief.messages }
}

function main(argv) {
  if (argv.length !== 2) {
    process.stderr.write('usage: task-start PLAN_FILE TASK_NUMBER\n')
    return 2
  }
  const [plan, n] = argv
  try {
    const result = startTask(plan, n)
    for (const message of result.messages) process.stderr.write(`${message}\n`)
    process.stdout.write(`brief: ${result.brief}\n`)
    process.stdout.write(`base: ${result.base}\n`)
    return 0
  } catch (error) {
    if (error?.name === 'RepoError' || error?.name === 'WorkspaceError' || error?.name === 'UsageError') {
      process.stderr.write(`${error.message}\n`)
      return 2
    }
    if (error?.name === 'BriefError') {
      for (const message of error.messages) process.stderr.write(`${message}\n`)
      return error.code
    }
    throw error
  }
}

const isMain = process.argv[1] !== undefined && import.meta.url === pathToFileURL(process.argv[1]).href
if (isMain) process.exitCode = main(process.argv.slice(2))
