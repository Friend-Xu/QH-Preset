#!/usr/bin/env node
// Contract checks for the quanheng preset bundle.
// No dependencies: the checks are structural, so a failing row points at a line.
import { readFileSync, readdirSync, existsSync } from 'node:fs'
import { join, dirname, resolve } from 'node:path'
import { fileURLToPath } from 'node:url'

const root = resolve(join(dirname(fileURLToPath(import.meta.url)), '..'))
const patchPath = join(root, 'cordis.patch.yml')
const failures = []
const passes = []

function check(name, fn) {
  try {
    const detail = fn()
    passes.push(detail === undefined ? name : `${name} — ${detail}`)
  } catch (error) {
    failures.push(`${name} — ${error.message}`)
  }
}

function assert(condition, message) {
  if (!condition) throw new Error(message)
}

function readPatch() {
  assert(existsSync(patchPath), 'cordis.patch.yml is missing')
  return readFileSync(patchPath, 'utf8')
}

function lines() {
  return readPatch().split(/\r?\n/)
}

/** Rows are `- id: <id>` lines; a row owns the lines until the next row. */
function rows() {
  const all = lines()
  const out = []
  for (let i = 0; i < all.length; i++) {
    const match = /^(\s*)- id:\s*(\S+)\s*$/.exec(all[i])
    if (!match) continue
    let end = all.length
    for (let j = i + 1; j < all.length; j++) {
      if (/^\s*- id:/.test(all[j])) { end = j; break }
    }
    out.push({ id: match[2], indent: match[1].length, start: i, end, body: all.slice(i + 1, end) })
  }
  return out
}

function skillDirs() {
  const base = join(root, 'skills')
  assert(existsSync(base), 'skills/ is missing')
  return readdirSync(base, { withFileTypes: true })
    .filter(entry => entry.isDirectory())
    .map(entry => entry.name)
}

function markdownFiles(dir, out = []) {
  for (const entry of readdirSync(dir, { withFileTypes: true })) {
    const full = join(dir, entry.name)
    if (entry.isDirectory()) markdownFiles(full, out)
    else if (entry.name.endsWith('.md')) out.push(full)
  }
  return out
}

check('patch declares exactly one preset row', () => {
  const found = rows().filter(row => row.id === 'preset-quanheng')
  assert(found.length === 1, `expected 1 preset-quanheng row, found ${found.length}`)
})

check('preset config has all five fields', () => {
  const text = readPatch()
  for (const [field, pattern] of [
    ['id', /^\s{8}id:\s*quanheng\s*$/m],
    ['name', /^\s{8}name:\s*\S/m],
    ['description', /^\s{8}description:\s*\S/m],
    ['order', /^\s{8}order:\s*\d+\s*$/m],
    ['plugins', /^\s{8}plugins:\s*$/m],
  ]) {
    assert(pattern.test(text), `missing config.${field}`)
  }
})

check('every plugin row names a plugin', () => {
  const all = rows().filter(row => row.id !== 'preset-quanheng')
  assert(all.length >= 15, `expected the full composition, found ${all.length} rows`)
  for (const row of all) {
    assert(row.body.some(line => /^\s*name:\s*\S/.test(line)), `row "${row.id}" has no name`)
  }
  return `${all.length} rows`
})

check('service groups carry their isolate realms', () => {
  const byId = new Map(rows().map(row => [row.id, row]))
  for (const [id, keys] of [
    ['planning', ['planMode: true']],
    ['compaction', ['compaction: true', 'toolResultPruner: true']],
    ['delegation', ['workflowEngine: true']],
  ]) {
    const row = byId.get(id)
    assert(row !== undefined, `group "${id}" is missing`)
    assert(row.body.some(line => /^\s*group:\s*true\s*$/.test(line)), `group "${id}" is not marked group: true`)
    assert(row.body.some(line => /^\s*isolate:\s*$/.test(line)), `group "${id}" has no isolate block`)
    for (const key of keys) {
      assert(row.body.some(line => line.trim() === key), `group "${id}" is missing isolate ${key}`)
    }
  }
})

check('skills directory holds the eight v0.1 skills', () => {
  const dirs = skillDirs()
  assert(dirs.length === 8, `expected 8 skills, found ${dirs.length}: ${dirs.join(', ')}`)
  for (const name of dirs) {
    const file = join(root, 'skills', name, 'SKILL.md')
    assert(existsSync(file), `skills/${name}/SKILL.md is missing`)
    const text = readFileSync(file, 'utf8').replace(/^\uFEFF/, '')
    const front = /^---\r?\n([\s\S]*?)\r?\n---/.exec(text)
    assert(front !== null, `skills/${name}/SKILL.md has no frontmatter`)
    for (const field of ['name:', 'description:']) {
      assert(front[1].includes(field), `skills/${name}/SKILL.md frontmatter lacks ${field}`)
    }
  }
  return dirs.join(', ')
})

check('no upstream namespace and no visual companion left', () => {
  const files = markdownFiles(join(root, 'skills'))
  for (const file of files) {
    const text = readFileSync(file, 'utf8')
    assert(!text.includes('superpowers:'), `${file} still references superpowers:`)
    assert(!/visual-companion|start-server/.test(text), `${file} still references the visual companion`)
  }
  return `${files.length} files`
})

check('dsh tool mapping covers the actions the skills use', () => {
  const file = join(root, 'skills', 'using-superpowers', 'references', 'dsh-tools.md')
  assert(existsSync(file), 'dsh-tools.md is missing')
  const text = readFileSync(file, 'utf8')
  for (const tool of ['read', 'write', 'edit', 'glob', 'grep', 'pwsh', 'subagent', 'todo_write', 'skill', 'ask_user_question']) {
    assert(text.includes('`' + tool + '`'), `dsh-tools.md does not mention ${tool}`)
  }
})

check('skill root resolves this package by name', () => {
  const pkg = JSON.parse(readFileSync(join(root, 'package.json'), 'utf8'))
  assert(pkg.name === '@quanheng/preset', `package.json name is ${pkg.name}`)
  const text = readPatch()
  assert(text.includes("createRequire(baseUrl).resolve('@quanheng/preset/package.json')"),
    'skill root does not resolve @quanheng/preset/package.json')
  assert(text.includes("createRequire(baseUrl).resolve('@deepseek-ai/dsh-agent-preset/package.json')"),
    'the shipped dsh-doc skill root is missing')
})

for (const line of passes) console.log(`PASS  ${line}`)
for (const line of failures) console.log(`FAIL  ${line}`)
console.log(`\n${passes.length} passed, ${failures.length} failed`)
process.exit(failures.length === 0 ? 0 : 1)
