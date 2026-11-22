#!/usr/bin/env node
// Does every vendored upstream file have a recorded disposition, and does the
// record still match the bytes?
//
// `vendor/` is the evidence this bundle is derived from, and `docs/UPSTREAM.md`
// is the prose account of what was changed. Prose alone cannot fail: a file can
// be dropped, or ported, with no row anywhere and nobody notices until someone
// diffs the two trees by hand — which is what this ledger replaced, because
// `diff` on this host is the `Compare-Object` alias and `diff -r` prints two
// directory names without error.
//
// `docs/upstream-ledger.json` holds one entry per vendored file (a subtree may be
// covered by one entry whose path ends with `/`). One disposition needs no entry:
// a mirrored skill file whose bytes still match upstream exactly.
//
// Exit: 0 every file accounted for, 1 at least one problem, 2 bad usage.
import { readFileSync, readdirSync, existsSync } from 'node:fs'
import { join, resolve, dirname, sep } from 'node:path'
import { fileURLToPath, pathToFileURL } from 'node:url'

/** Where a mirrored skill file lives relative to the vendored one. */
const MIRROR = 'vendor/superpowers/skills/'
const LEDGER = 'docs/upstream-ledger.json'
const DOC = 'docs/UPSTREAM.md'

const DISPOSITIONS = new Set(['edited', 'ported', 'omitted', 'reference', 'license'])
/** Dispositions that must carry a local path, and disposals that must not. */
const NEEDS_LOCAL = new Set(['edited', 'ported'])
const NEEDS_REASON = new Set(['edited', 'ported', 'omitted'])

function isPlainObject(value) {
  return typeof value === 'object' && value !== null && !Array.isArray(value)
}

/**
 * Row labels the reason field may cite: a bare number is a change row (R<n>),
 * `E<n>` an ECC judgement row, `S<n>` a skill-disposition row.
 * @param docText - the whole of `docs/UPSTREAM.md`.
 * @returns the set of labels the document actually has.
 */
export function docLabels(docText) {
  const labels = new Set()
  for (const line of docText.split(/\r?\n/)) {
    const first = /^\|\s*([A-Za-z]?\d+)\s*\|/.exec(line)
    if (first === null) continue
    const cell = first[1]
    labels.add(/^[0-9]+$/.test(cell) ? `R${cell}` : cell.toUpperCase())
  }
  return labels
}

/**
 * Check the ledger against the vendored tree.
 *
 * Pure: every byte comes in through `readBytes`, so a test can drive it with
 * fixtures instead of the filesystem.
 * @param input - the enumerations and the document text.
 * @returns the problems, each with a stable code, plus the counts for the summary.
 */
export function auditUpstream({ upstreamFiles, upstreams, entries, docText, readBytes }) {
  const problems = []
  const fail = (code, message) => problems.push({ code, message })
  const fileSet = new Set(upstreamFiles)
  const labels = docLabels(docText)

  // The declared roots must actually hold files, or the ledger is checking nothing.
  const roots = []
  for (const upstream of Array.isArray(upstreams) ? upstreams : []) {
    if (!isPlainObject(upstream) || typeof upstream.path !== 'string') {
      fail('BAD_ROOT', `upstreams holds an entry without a path: ${JSON.stringify(upstream)}`)
      continue
    }
    const prefix = `${upstream.path.replace(/\/$/, '')}/`
    const held = upstreamFiles.filter(file => file.startsWith(prefix))
    if (held.length === 0) fail('BAD_ROOT', `${upstream.path}: no vendored file lives under this root`)
    roots.push({ id: String(upstream.id ?? upstream.path), version: String(upstream.version ?? 'unknown'), path: prefix, files: held.length })
  }

  // Shape and existence of every entry, before it is used to explain a file.
  const seen = new Set()
  for (const entry of Array.isArray(entries) ? entries : []) {
    if (!isPlainObject(entry) || typeof entry.path !== 'string' || entry.path.length === 0) {
      fail('BAD_ENTRY', `entry without a path: ${JSON.stringify(entry)}`)
      continue
    }
    const path = entry.path.split('\\').join('/')
    if (seen.has(path)) { fail('DUPLICATE_ENTRY', `${path}: two entries for the same path`); continue }
    seen.add(path)
    if (!DISPOSITIONS.has(entry.disposition)) {
      fail('BAD_ENTRY', `${path}: disposition ${JSON.stringify(entry.disposition)} is not one of ${[...DISPOSITIONS].join(', ')}`)
      continue
    }
    const isSubtree = path.endsWith('/')
    if (!fileSet.has(path) && !(isSubtree && upstreamFiles.some(file => file.startsWith(path)))) {
      const asDirectory = upstreamFiles.some(file => file.startsWith(`${path}/`))
      fail('STALE_ENTRY', asDirectory
        ? `${path}: names a directory, so it must end with "/" to cover the whole subtree`
        : `${path}: no vendored file at this path`)
      continue
    }
    const locals = entry.local === undefined ? [] : Array.isArray(entry.local) ? entry.local : [entry.local]
    if (NEEDS_LOCAL.has(entry.disposition)) {
      if (locals.length === 0) fail('BAD_ENTRY', `${path}: disposition "${entry.disposition}" needs a "local" path`)
      for (const local of locals) {
        if (typeof local !== 'string' || local.length === 0) { fail('BAD_ENTRY', `${path}: local must be a path`); continue }
        if (readBytes(local) === null) fail('MISSING_LOCAL', `${path}: ${entry.disposition} to ${local}, which does not exist`)
      }
    } else if (locals.length > 0) {
      fail('BAD_ENTRY', `${path}: disposition "${entry.disposition}" cannot name a local file`)
    }
    if (NEEDS_REASON.has(entry.disposition)) {
      const cites = entry.doc === undefined ? [] : Array.isArray(entry.doc) ? entry.doc : [entry.doc]
      if (cites.length === 0) fail('BAD_ENTRY', `${path}: disposition "${entry.disposition}" needs a "doc" reason`)
      for (const cite of cites) {
        if (typeof cite !== 'string') { fail('BAD_ENTRY', `${path}: doc must be a label like R1, E7 or S2`); continue }
        if (!labels.has(cite.toUpperCase())) fail('BAD_DOC_REF', `${path}: doc "${cite}" has no matching row in ${DOC}`)
      }
    }
  }

  // Every vendored file is either covered by an entry or an identical mirror.
  const counts = { identical: 0, edited: 0, ported: 0, omitted: 0, reference: 0, license: 0 }
  const byPath = new Map()
  for (const entry of Array.isArray(entries) ? entries : []) {
    if (isPlainObject(entry) && typeof entry.path === 'string') byPath.set(entry.path.split('\\').join('/'), entry)
  }
  const subtrees = [...byPath.keys()].filter(path => path.endsWith('/')).sort((left, right) => right.length - left.length)

  for (const file of upstreamFiles) {
    const entry = byPath.get(file) ?? byPath.get(subtrees.find(prefix => file.startsWith(prefix)))
    if (entry !== undefined) {
      if (entry.disposition === 'edited') {
        counts.edited++
        const local = Array.isArray(entry.local) ? entry.local[0] : entry.local
        if (typeof local === 'string') {
          const vendored = readBytes(file)
          const mirrored = readBytes(local)
          if (vendored !== null && mirrored !== null && vendored.equals(mirrored)) {
            fail('FALSE_EDIT', `${file}: recorded as edited, but ${local} is byte-identical to it`)
          }
        }
      } else if (counts[entry.disposition] !== undefined) {
        counts[entry.disposition]++
      }
      continue
    }
    if (!file.startsWith(MIRROR)) {
      fail('NO_DISPOSITION', `${file}: no ledger entry says what happened to it`)
      continue
    }
    const local = `skills/${file.slice(MIRROR.length)}`
    const vendored = readBytes(file)
    const mirrored = readBytes(local)
    if (mirrored === null) {
      fail('NO_DISPOSITION', `${file}: no mirror at ${local} and no ledger entry`)
      continue
    }
    if (vendored !== null && vendored.equals(mirrored)) { counts.identical++; continue }
    fail('UNDOCUMENTED_EDIT', `${file}: differs from ${local} and no ledger entry says why`)
  }

  return { problems, counts, roots }
}

function walk(dir, out = []) {
  if (!existsSync(dir)) return out
  for (const entry of readdirSync(dir, { withFileTypes: true })) {
    const full = join(dir, entry.name)
    if (entry.isDirectory()) walk(full, out)
    else out.push(full)
  }
  return out
}

/**
 * Run the audit against one checkout: enumerate the tree, then check the record.
 * @param rootDir - the bundle root.
 * @returns the problems, the counts and the declared upstreams, or throws when the
 * ledger or the document cannot be read at all.
 */
export function auditCheckout(rootDir) {
  const rel = full => full.slice(rootDir.length + 1).split(sep).join('/')
  const readBytes = path => {
    const full = join(rootDir, path)
    return existsSync(full) ? readFileSync(full) : null
  }
  const ledger = JSON.parse(readFileSync(join(rootDir, LEDGER), 'utf8'))
  const docText = readFileSync(join(rootDir, DOC), 'utf8')
  const upstreamFiles = walk(join(rootDir, 'vendor')).map(rel).sort()
  const result = auditUpstream({
    upstreamFiles, upstreams: ledger.upstreams, entries: ledger.entries, docText, readBytes,
  })
  return { ...result, files: upstreamFiles.length }
}

/**
 * The command line: print one line per problem, then the tally.
 * @param rootDir - the bundle root.
 * @returns the process exit status.
 */
function main(rootDir) {
  let audit
  try {
    audit = auditCheckout(rootDir)
  } catch (error) {
    process.stderr.write(`${LEDGER}: the audit could not run: ${error.message}\n`)
    return 1
  }
  const { problems, counts, roots, files } = audit

  for (const problem of problems) process.stdout.write(`FAIL  [${problem.code}] ${problem.message}\n`)
  const detail = [
    `${counts.identical} identical mirrors`,
    `${counts.edited} edited`,
    `${counts.ported} ported`,
    `${counts.omitted} omitted`,
    `${counts.reference} reference`,
    `${counts.license} license`,
  ].join(', ')
  process.stdout.write(`\n${files} vendored files — ${detail} — ${problems.length} problem(s)\n`)
  process.stdout.write(`upstreams: ${roots.map(root => `${root.id} ${root.version} (${root.files} files)`).join(', ')}\n`)
  return problems.length === 0 ? 0 : 1
}

const isMain = process.argv[1] !== undefined && import.meta.url === pathToFileURL(process.argv[1]).href
if (isMain) {
  // It audits the checkout it lives in. An argument here would otherwise be
  // ignored, and a caller that thinks it pointed the audit somewhere else would
  // read a pass that never covered that tree.
  if (process.argv.length > 2) {
    process.stderr.write('usage: node scripts/audit-upstream.mjs (no arguments; it audits this checkout)\n')
    process.exitCode = 2
  } else {
    const root = resolve(join(dirname(fileURLToPath(import.meta.url)), '..'))
    process.exitCode = main(root)
  }
}

export { MIRROR, LEDGER, DOC, DISPOSITIONS }
