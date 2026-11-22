// Extract one task's full text from an implementation plan into a file the
// implementer reads in one call, so the task text never has to be pasted
// through the controller's context.
//
// Usage: node task-brief.mjs [-C DIR] PLAN_FILE TASK_NUMBER [OUTFILE]
// Default OUTFILE: <repo-root>/.superpowers/sdd/<plan-basename>/task-<N>-brief.md
// (per plan and per worktree; concurrent runs of the SAME plan in the same
// working tree share it). -C DIR runs as if started in DIR, as in sdd-workspace.
import { existsSync, mkdirSync, readFileSync, statSync, unlinkSync, writeFileSync } from 'node:fs'
import { dirname, join } from 'node:path'
import { pathToFileURL } from 'node:url'
import { resolveWorkspace } from './sdd-workspace.mjs'

const TASK_HEADING = /^#+[ \t]+Task[ \t]/
const FENCE = /^```/
const SHAPED_HEADING = /^#+[ \t]+[^ \t]+[ \t]+[A-Za-z0-9.]*[0-9]/

/**
 * The body of `Task <n>` in `planFile`, plus any warnings and the exit code the
 * CLI would use. A task heading is `Task` followed by an ID: letters and digits,
 * optionally dot-separated, containing at least one digit (3, 6b, A1, 2.1). The
 * digit keeps headings like "## Task Overview" from becoming task boundaries,
 * and the ID is compared to TASK_NUMBER as a whole string, so Task 6 never
 * matches Task 6b and Task 1 never matches Task 1.1. A deeper heading whose ID
 * extends the requested one with a letter or dot is a sub-task and stays in its
 * brief (### Task 7 keeps #### Task 7a). Depth alone is not enough: plans drift
 * from "## Task 1" to "### Task 2".
 *
 * The word stays the English literal "Task", whatever language the rest of the
 * plan is in. A plan with no Task headings at all usually translated it
 * ("## Tarea 1"), so the headings shaped like tasks are listed before the
 * not-found error instead of implying the plan has no task 1.
 *
 * A fence that never closes hides every Task heading after it. When it hides one
 * while the requested task is being captured, that task's end cannot be found and
 * the brief would run on through every later task: refuse (exit 4) rather than
 * hand an implementer several tasks as its requirements.
 */
export function extractTask(planFile, n) {
  const text = readFileSync(planFile, 'utf8')
  const lines = text.split(/\r?\n/)
  if (lines.length > 0 && lines[lines.length - 1] === '') lines.pop()

  let infence = false
  let fenceLine = 0
  let hidden = false
  let intask = false
  let level = 0
  let tasks = 0
  let found = false
  const body = []
  const shaped = []

  for (let index = 0; index < lines.length; index++) {
    const line = lines[index]
    const lineNumber = index + 1

    if (FENCE.test(line)) {
      infence = !infence
      if (infence) {
        fenceLine = lineNumber
        hidden = false
      }
    }
    if (infence && TASK_HEADING.test(line)) hidden = true

    if (!infence && TASK_HEADING.test(line)) {
      const match = /^[A-Za-z0-9]+(\.[A-Za-z0-9]+)*/.exec(line.replace(/^#+[ \t]+Task[ \t]+/, ''))
      if (match !== null && /[0-9]/.test(match[0])) {
        tasks += 1
        const id = match[0]
        const headingLevel = /^#+/.exec(line)[0].length
        const subtask = intask && headingLevel > level && id.startsWith(n)
          && /[A-Za-z.]/.test(id.slice(n.length, n.length + 1))
        if (!subtask) {
          intask = id === n
          level = headingLevel
        }
      }
    }

    if (!infence && SHAPED_HEADING.test(line) && shaped.length < 5) shaped.push(line)
    if (intask) {
      body.push(line)
      found = true
    }
  }

  const messages = []
  const where = `the code fence opened at line ${fenceLine} of ${planFile} never closes`
  let exitCode = 0
  if (infence && hidden && (intask || !found)) {
    messages.push(`task-brief: ${where}, so no Task heading after it can be seen; close that fence in the plan and rerun`)
    if (intask) exitCode = 4
  } else if (infence && intask) {
    messages.push(`task-brief: warning: ${where}; it hides no Task heading, so this brief is complete`)
  }
  // An open fence that hid Task headings already explains why none were seen;
  // the English-word hint would contradict it.
  if (tasks === 0 && shaped.length > 0 && !(infence && hidden)) {
    messages.push('task-brief: no task headings found. Task headings must use the English word "Task" ("### Task 1: ..."), even when the rest of the plan is in another language. Headings shaped like tasks:')
    for (const heading of shaped) messages.push(`  ${heading}`)
  }

  return {
    body: body.length === 0 ? '' : `${body.join('\n')}\n`,
    messages,
    exitCode,
    tasks,
  }
}

/**
 * Write the brief for `planFile` task `n` and return what the CLI reports.
 * On a refusal (exit 3 or 4) no output file is left behind.
 */
export function writeBrief(planFile, n, outFile) {
  const extracted = extractTask(planFile, n)
  const out = outFile ?? join(resolveWorkspace(planFile), `task-${n}-brief.md`)

  if (extracted.exitCode !== 0) {
    if (existsSync(out)) unlinkSync(out)
    return { out, lines: 0, messages: extracted.messages, exitCode: extracted.exitCode }
  }
  if (extracted.body === '') {
    if (existsSync(out)) unlinkSync(out)
    return {
      out,
      lines: 0,
      messages: [
        ...extracted.messages,
        `task ${n} not found in ${planFile} (no heading matching 'Task ${n}')`,
      ],
      exitCode: 3,
    }
  }

  mkdirSync(dirname(out), { recursive: true })
  writeFileSync(out, extracted.body)
  // `wc -l` counts newlines, and the body always ends with one.
  const lines = (extracted.body.match(/\n/g) ?? []).length
  return { out, lines, messages: extracted.messages, exitCode: 0 }
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
  if (args.length < 2 || args.length > 3) {
    process.stderr.write('usage: task-brief [-C DIR] PLAN_FILE TASK_NUMBER [OUTFILE]\n')
    return 2
  }
  const [plan, n, outFile] = args
  if (!existsSync(plan) || !statSync(plan).isFile()) {
    process.stderr.write(`no such plan file: ${plan}\n`)
    return 2
  }
  try {
    const result = writeBrief(plan, n, outFile)
    for (const message of result.messages) process.stderr.write(`${message}\n`)
    if (result.exitCode !== 0) return result.exitCode
    process.stdout.write(`wrote ${result.out}: ${result.lines} lines\n`)
    return 0
  } catch (error) {
    if (error?.name === 'WorkspaceError') {
      process.stderr.write(`${error.message}\n`)
      return error.code
    }
    throw error
  }
}

const isMain = process.argv[1] !== undefined && import.meta.url === pathToFileURL(process.argv[1]).href
if (isMain) process.exitCode = main(process.argv.slice(2))
