// Child-process plumbing shared by the plan-execution helpers.
//
// Two rules live here, and both matter more than they look:
//
// 1. Never capture a child's output through a pipe. Under DSH's Windows ACL
//    sandbox a libuv pipe stdio is a NAMED pipe, and a confined process cannot
//    open one: a spawn whose stdio is set to `pipe` fails with EPERM. A helper
//    that only breaks under the sandbox reports "the script did nothing", which
//    is worse than a crash. So output is redirected to an ordinary file handle,
//    and inherited stdio is used where the caller needs no value.
// 2. Scratch files stay inside the project and are removed in a `finally`.
//    Callers pass the directory they own (the plan's directory, or the plan
//    workspace) - never a system temp area.
import { spawnSync } from 'node:child_process'
import { closeSync, existsSync, openSync, readFileSync, statSync, unlinkSync } from 'node:fs'
import { delimiter, isAbsolute, join } from 'node:path'

let captureCounter = 0

/**
 * Run a command and return its exit status plus everything it printed.
 *
 * `scratchDir` must already exist and must be inside the project - the caller
 * owns it (the plan's directory, or the plan workspace). The temporary capture
 * file exists only for the duration of the call; this function never creates a
 * directory, so a caller cannot leave a stray one behind.
 */
export function runCaptured(command, args, { cwd = process.cwd(), scratchDir } = {}) {
  if (typeof scratchDir !== 'string' || scratchDir === '') {
    throw new Error('runCaptured: scratchDir is required')
  }
  if (!statSync(scratchDir).isDirectory()) {
    throw new Error(`runCaptured: scratchDir is not a directory: ${scratchDir}`)
  }
  const captureFile = join(scratchDir, `.qh-capture-${process.pid}-${captureCounter++}.log`)
  const fd = openSync(captureFile, 'w')
  let status
  let failure
  let text
  try {
    const result = spawnSync(command, args, {
      cwd,
      stdio: ['ignore', fd, fd],
      windowsHide: true,
    })
    status = result.status
    failure = result.error
    text = readFileSync(captureFile, 'utf8')
  } finally {
    closeSync(fd)
    unlinkSync(captureFile)
  }
  return { status, error: failure, text }
}

/** Run a command with the caller's stdio, returning only its exit status. */
export function runInherited(command, args, { cwd = process.cwd() } = {}) {
  const result = spawnSync(command, args, { cwd, stdio: 'inherit', windowsHide: true })
  if (result.error !== undefined) throw result.error
  return result.status
}

/**
 * Spawn with an already-opened stdio array (file handles, never pipes).
 *
 * A `.cmd`/`.bat` shim - which is what `npm`, `pnpm` and most tool wrappers are
 * on Windows - cannot be spawned directly: CreateProcess rejects a batch file and
 * Node reports EINVAL. Those go through the command interpreter instead, with the
 * command line quoted here because the interpreter parses it, not the CRT.
 */
export function spawnWithStdio(executable, args, { cwd = process.cwd(), stdio }) {
  if (!(process.platform === 'win32' && /\.(cmd|bat)$/i.test(executable))) {
    const result = spawnSync(executable, args, { cwd, stdio, windowsHide: true })
    if (result.error !== undefined && result.error.code !== 'ENOENT') throw result.error
    return result
  }
  for (const argument of args) {
    if (argument.includes('"')) {
      throw new Error(`cannot pass an argument containing a double quote to ${executable}`)
    }
  }
  const line = [executable, ...args]
    .map(part => (/[\s&|<>^()]/.test(part) ? `"${part}"` : part))
    .join(' ')
  const result = spawnSync(line, { cwd, stdio, windowsHide: true, shell: true })
  if (result.error !== undefined) throw result.error
  return result
}

/** Run a command with its output discarded, returning only its exit status. */
export function runSilent(command, args, { cwd = process.cwd() } = {}) {
  const result = spawnSync(command, args, { cwd, stdio: 'ignore', windowsHide: true })
  if (result.error !== undefined && result.error.code !== 'ENOENT') throw result.error
  return result.status
}

/**
 * Resolve an executable the way a shell would, so a command name typed by the
 * user (`node`, `npm`, `cargo`) can be spawned without a shell - which would
 * otherwise re-split the arguments and lose the quoting.
 *
 * Returns the absolute path, or undefined when nothing matches.
 */
export function resolveExecutable(command) {
  const isWindows = process.platform === 'win32'
  const extensions = isWindows
    ? (process.env.PATHEXT ?? '.COM;.EXE;.BAT;.CMD').split(';').filter(entry => entry !== '')
    : ['']
  const hasSeparator = command.includes('/') || command.includes('\\')

  if (hasSeparator || isAbsolute(command)) {
    const candidates = isWindows && !extensions.some(ext => command.toLowerCase().endsWith(ext.toLowerCase()))
      ? [...extensions.map(ext => command + ext), command]
      : [command]
    return candidates.find(candidate => isFile(candidate))
  }

  const pathValue = process.env.PATH ?? ''
  // On Windows a bare name usually matches an extensionless sh shim as well
  // (`npm`, `npx`), which CreateProcess cannot execute. Probe the executable
  // extensions first so the resolved path is one that can actually be spawned.
  const ordered = isWindows ? [...extensions, ''] : ['']
  for (const directory of pathValue.split(delimiter)) {
    if (directory === '') continue
    for (const extension of ordered) {
      const candidate = join(directory, command + extension)
      if (isFile(candidate)) return candidate
    }
  }
  return undefined
}

function isFile(candidate) {
  try {
    return statSync(candidate).isFile()
  } catch {
    return false
  }
}

/** True when the path exists as a regular file. */
export function fileExists(candidate) {
  return existsSync(candidate) && statSync(candidate).isFile()
}

/** The last non-empty line of `text`, or undefined when there is none. */
export function lastNonEmptyLine(text) {
  const lines = text.split(/\r?\n/).filter(line => line.trim() !== '')
  return lines.length === 0 ? undefined : lines[lines.length - 1]
}

/** The last `count` lines of `text`, with no trailing blank line. */
export function tailLines(text, count) {
  const lines = text.split(/\r?\n/)
  if (lines.length > 0 && lines[lines.length - 1] === '') lines.pop()
  return lines.slice(-count)
}
