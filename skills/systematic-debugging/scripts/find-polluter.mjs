#!/usr/bin/env node
// Find the test that leaves state behind: bisect the test files that match a
// pattern, run each alone, and report the first one that creates the pollution.
//
// Port of `find-polluter.sh` from Superpowers 7.0.2. The shell original cannot
// run here: this machine has no `bash` on PATH (only Git for Windows' absolute
// path), and the helper is documented to be invoked from a skill, so it must be
// invocable the same way on every host.
//
// Usage:
//   node <absolute path>/find-polluter.mjs <file_or_dir_to_check> <test_pattern>
//   node <absolute path>/find-polluter.mjs .git 'src/**/*.test.ts'
//
// Exit: 0 no polluter found, 1 one test created the pollution, 2 bad usage,
//       3 the search could not run (no matching test file, or no `npm`).
import { existsSync, readdirSync, statSync } from 'node:fs'
import { join } from 'node:path'
import { pathToFileURL } from 'node:url'
import { resolveExecutable, spawnWithStdio } from '../../subagent-driven-development/scripts/lib/exec.mjs'

/** Entries a walk may visit before the search is declared too broad to trust. */
const MAX_ENTRIES = 200_000

function usage(message) {
  if (message !== undefined) process.stderr.write(`${message}\n`)
  process.stderr.write("usage: find-polluter.mjs <file_or_dir_to_check> <test_pattern>\n")
  process.stderr.write("example: find-polluter.mjs .git 'src/**/*.test.ts'\n")
  return 2
}

/**
 * Turn a `find -path` style pattern into one matcher.
 *
 * A double-star followed by a slash matches zero or more directories, so
 * `src/<double-star>/*.test.ts` also matches `src/top.test.ts`. The shell original
 * needed a second, collapsed pattern for that case because `find -path` cannot
 * match the double-star form against zero levels; one regex covers both, which
 * selects the same set of files.
 * @param pattern - the pattern as written on the command line.
 * @returns a matcher over forward-slash paths relative to the working directory.
 */
function patternMatcher(pattern) {
  const normalized = pattern.replace(/\\/g, '/').replace(/^\.\//, '')
  let source = ''
  for (let index = 0; index < normalized.length; index++) {
    const character = normalized[index]
    if (character === '*' && normalized[index + 1] === '*') {
      if (normalized[index + 2] === '/') {
        source += '(?:.*/)?'
        index += 2
        continue
      }
      source += '.*'
      index += 1
      continue
    }
    if (character === '*') source += '[^/]*'
    else if (character === '?') source += '[^/]'
    else source += character.replace(/[.+^${}()|[\]\\]/g, '\\$&')
  }
  const regex = new RegExp(`^${source}$`)
  return candidate => regex.test(candidate)
}

/**
 * Walk the working directory and collect matching files.
 *
 * Symbolic links to directories are not followed, so a symlink cycle cannot hang
 * the search. Nothing else is pruned: a polluter can live anywhere the pattern
 * reaches, and skipping a directory quietly would be a search that reports a
 * clean result it never established.
 * @param root - directory to walk.
 * @param matches - the pattern matcher.
 * @returns matching paths, forward-slashed and relative to `root`, sorted.
 */
function findMatchingFiles(root, matches) {
  const found = []
  const pending = ['']
  let visited = 0
  while (pending.length > 0) {
    const directory = pending.pop()
    const absolute = directory === '' ? root : join(root, directory)
    for (const entry of readdirSync(absolute, { withFileTypes: true })) {
      if (++visited > MAX_ENTRIES) {
        throw new Error(`the search visited ${MAX_ENTRIES} entries without finishing; narrow the directory or the pattern`)
      }
      const path = directory === '' ? entry.name : `${directory}/${entry.name}`
      if (entry.isDirectory()) pending.push(path)
      else if (entry.isFile() && matches(path)) found.push(path)
    }
  }
  return found.sort()
}

/** One line describing what the polluting path actually is. */
function describe(path) {
  try {
    const stats = statSync(path)
    return stats.isDirectory() ? 'a directory' : `${stats.size} bytes`
  } catch (error) {
    return `unreadable: ${error?.code ?? error?.message ?? 'unknown error'}`
  }
}

function main(argv) {
  if (argv.length === 1 && (argv[0] === '--help' || argv[0] === '-h')) return usage()
  if (argv.length !== 2) return usage(argv.length === 0 ? undefined : `expected 2 arguments, received ${argv.length}`)

  const [pollution, pattern] = argv
  const cwd = process.cwd()
  process.stdout.write(`Searching for the test that creates: ${pollution}\n`)
  process.stdout.write(`Test pattern: ${pattern}\n\n`)

  let files
  try {
    files = findMatchingFiles(cwd, patternMatcher(pattern))
  } catch (error) {
    process.stderr.write(`${error.message}\n`)
    return 3
  }
  if (files.length === 0) {
    // The shell original printed "all tests clean" with nothing tested. Absence
    // of a match is a failed search, not a clean result.
    process.stderr.write(`no test file matches ${JSON.stringify(pattern)} under ${cwd}\n`)
    return 3
  }
  process.stdout.write(`Found ${files.length} test file(s)\n\n`)

  const npm = resolveExecutable('npm')
  if (npm === undefined) {
    process.stderr.write('npm was not found on PATH; this helper runs each test file through `npm test`\n')
    return 3
  }

  let skipped = 0
  for (const [index, file] of files.entries()) {
    if (existsSync(pollution)) {
      // A leftover from an earlier run would be attributed to whichever test ran
      // next, so this file cannot be judged. Counted, and reported at the end.
      skipped++
      process.stdout.write(`[${index + 1}/${files.length}] skipped ${file}: ${pollution} already exists\n`)
      continue
    }
    process.stdout.write(`[${index + 1}/${files.length}] testing ${file}\n`)
    // Exit status is discarded on purpose: the question is whether the path
    // appeared, and a test that fails for its own reason still answers it. A
    // spawn that did not run at all is a different thing, and is reported.
    const spawned = spawnWithStdio(npm, ['test', file], { cwd, stdio: 'ignore' })
    if (spawned.error !== undefined) {
      process.stderr.write(`could not run ${npm}: ${spawned.error.message}\n`)
      return 3
    }
    if (!existsSync(pollution)) continue
    process.stdout.write(`\nFOUND POLLUTER\n  test:    ${file}\n  created: ${pollution} (${describe(join(cwd, pollution))})\n`)
    process.stdout.write(`\ninspect it with: npm test ${file}\n`)
    return 1
  }

  if (skipped > 0) {
    process.stderr.write(`\n${skipped} of ${files.length} test file(s) could not be judged because ${pollution} already existed\n`)
    return 3
  }
  process.stdout.write(`\nNo polluter found: ${files.length} test file(s) left ${pollution} absent\n`)
  return 0
}

const isMain = process.argv[1] !== undefined && import.meta.url === pathToFileURL(process.argv[1]).href
if (isMain) process.exitCode = main(process.argv.slice(2))

export { findMatchingFiles, patternMatcher }
