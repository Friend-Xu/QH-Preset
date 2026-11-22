// Close one task of an inline plan execution in a single call: run the task's
// test command, keep its full output in the workspace, print the tail, and -
// only if the command succeeded - append the completion line to the ledger.
// A failing command records nothing: the task is not complete.
//
// Usage: node task-done.mjs PLAN_FILE TASK_NUMBER BASE -- TEST_COMMAND [ARGS...]
//   BASE is the SHA task-start printed; the completion line records BASE..HEAD.
// Exit: the test command's exit status.
import { appendFileSync, closeSync, existsSync, openSync, readFileSync, statSync, writeFileSync } from 'node:fs'
import { dirname, join, resolve } from 'node:path'
import { pathToFileURL } from 'node:url'
import { spawnSync } from 'node:child_process'
import { lastNonEmptyLine, resolveExecutable, runCaptured, tailLines } from '../../subagent-driven-development/scripts/lib/exec.mjs'
import { headCommit, repoRoot, revisionExists } from '../../subagent-driven-development/scripts/sdd-repo.mjs'
import { resolveWorkspace } from '../../subagent-driven-development/scripts/sdd-workspace.mjs'

/** Render a command the way a person would type it, for the ledger line. */
export function renderCommand(command) {
  let rendered = ''
  for (const argument of command) {
    rendered += /[\s"|;&]/.test(argument) ? ` '${argument}'` : ` ${argument}`
  }
  return rendered.replace(/^ /, '')
}

function isFile(path) {
  try {
    return statSync(path).isFile()
  } catch {
    return false
  }
}

/**
 * Run the task's test command and record completion. Returns the exit status the
 * CLI must propagate; a non-zero status means nothing was recorded.
 */
export function finishTask(planFile, n, base, command) {
  const plan = resolve(planFile)
  if (!isFile(plan)) {
    const error = new Error(`no such plan file: ${planFile}`)
    error.name = 'UsageError'
    throw error
  }
  const scratchDir = dirname(plan)
  // The repository the workspace and ledger belong to (see sdd-repo); BASE and
  // HEAD are read there, not in the bare cwd.
  const repo = repoRoot({ cwd: process.cwd(), scratchDir })
  if (!revisionExists(repo, base)) {
    const error = new Error(`bad BASE: ${base}`)
    error.name = 'UsageError'
    throw error
  }

  const directory = resolveWorkspace(planFile, { scratchDir })
  const log = join(directory, `task-${n}-tests.log`)
  const ledger = join(directory, 'progress.md')
  const rendered = renderCommand(command)

  const executable = resolveExecutable(command[0])
  if (executable === undefined) {
    process.stderr.write(`task-done: command not found: ${command[0]}; Task ${n} NOT recorded\n`)
    return 127
  }

  const fd = openSync(log, 'w')
  let status
  let failure
  try {
    const result = spawnSync(executable, command.slice(1), {
      cwd: process.cwd(),
      stdio: ['ignore', fd, fd],
      windowsHide: true,
    })
    status = result.status
    failure = result.error
  } finally {
    closeSync(fd)
  }
  if (failure !== undefined) throw failure

  const output = readFileSync(log, 'utf8')
  for (const line of tailLines(output, 5)) process.stdout.write(`${line}\n`)

  if (status !== 0) {
    process.stderr.write(`task-done: test command exited ${status}; Task ${n} NOT recorded (full output: ${log})\n`)
    return status
  }

  const last = lastNonEmptyLine(output) ?? '(no output)'
  if (!existsSync(ledger)) writeFileSync(ledger, `# SDD ledger — plan: ${planFile}\n`)
  const baseShort = runCaptured('git', ['rev-parse', '--short=7', base], { cwd: repo, scratchDir }).text.trim()
  const head = headCommit({ cwd: repo, scratchDir })
  const headShort = runCaptured('git', ['rev-parse', '--short=7', head], { cwd: repo, scratchDir }).text.trim()
  const line = `Task ${n}: complete (commits ${baseShort}..${headShort}, tests: ${rendered} → ${last})`
  appendFileSync(ledger, `${line}\n`)
  process.stdout.write(`ledger: ${line}\n`)
  return 0
}

function main(argv) {
  if (argv.length < 5 || argv[3] !== '--') {
    process.stderr.write('usage: task-done PLAN_FILE TASK_NUMBER BASE -- TEST_COMMAND [ARGS...]\n')
    return 2
  }
  const [plan, n, base] = argv
  const command = argv.slice(4)
  try {
    return finishTask(plan, n, base, command)
  } catch (error) {
    if (error?.name === 'RepoError' || error?.name === 'WorkspaceError' || error?.name === 'UsageError') {
      process.stderr.write(`${error.message}\n`)
      return 2
    }
    throw error
  }
}

const isMain = process.argv[1] !== undefined && import.meta.url === pathToFileURL(process.argv[1]).href
if (isMain) process.exitCode = main(process.argv.slice(2))
