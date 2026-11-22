#!/usr/bin/env node
// Contract checks for the quanheng preset bundle.
// No dependencies: the checks are structural, so a failing row points at a line.
import { readFileSync, readdirSync, existsSync, statSync } from 'node:fs'
import { join, dirname, resolve, extname } from 'node:path'
import { fileURLToPath } from 'node:url'

const root = resolve(join(dirname(fileURLToPath(import.meta.url)), '..'))
const patchPath = join(root, 'cordis.patch.yml')
const failures = []
const passes = []

const EXPECTED_SKILLS = [
  'brainstorming',
  'eval-harness',
  'executing-plans',
  'finishing-a-development-branch',
  'qh-judgment',
  'receiving-code-review',
  'requesting-code-review',
  'subagent-driven-development',
  'systematic-debugging',
  'test-driven-development',
  'using-git-worktrees',
  'using-superpowers',
  'verification-before-completion',
  'writing-plans',
  'writing-skills',
]

// Skills distilled from ECC rather than ported from Superpowers. They must say
// where they came from, so a later reader can check the source instead of
// trusting the paraphrase.
const ECC_SKILLS = ['eval-harness', 'qh-judgment']

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

function entries(dir, out = []) {
  for (const entry of readdirSync(dir, { withFileTypes: true })) {
    const full = join(dir, entry.name)
    if (entry.isDirectory() && entry.name !== 'node_modules' && entry.name !== '.tmp') entries(full, out)
    else if (entry.isFile()) out.push(full)
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

/**
 * Every JavaScript file this bundle ships and runs: the skills' helpers, the
 * hook plugin, and the package-level scripts. They share one process and one
 * sandbox, so they share one set of rules.
 */
function helperFiles() {
  return [
    ...entries(join(root, 'skills')),
    ...existsSync(join(root, 'hooks')) ? entries(join(root, 'hooks')) : [],
    ...entries(join(root, 'scripts')),
  ].filter(file => ['.mjs', '.js'].includes(extname(file)))
}

/** Body text without the YAML frontmatter. */
function skillBody(file) {
  return readFileSync(file, 'utf8').replace(/^---\r?\n[\s\S]*?\r?\n---\r?\n/, '')
}

function skillFrontmatter(file) {
  const match = /^---\r?\n([\s\S]*?)\r?\n---/.exec(readFileSync(file, 'utf8'))
  return match === null ? null : match[1]
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

check('skills directory holds exactly the expected skills', () => {
  const dirs = skillDirs()
  const missing = EXPECTED_SKILLS.filter(name => !dirs.includes(name))
  const extra = dirs.filter(name => !EXPECTED_SKILLS.includes(name))
  assert(missing.length === 0, `missing skills: ${missing.join(', ')}`)
  assert(extra.length === 0, `unexpected skills: ${extra.join(', ')}`)
  return `${dirs.length} skills`
})

check('no shipped text file starts with a byte-order mark', () => {
  // A BOM turns a skill's first line into `\uFEFF---`, which the loader reads as
  // "no frontmatter": the skill leaves the catalog and only a log line says so.
  // Today the fs layer's TextDecoder strips the BOM, so the defect stays hidden
  // and reappears the moment the file is read another way. Reject it here
  // instead of stripping it in the parsers below.
  const files = [
    ...entries(join(root, 'skills')),
    ...existsSync(join(root, 'hooks')) ? entries(join(root, 'hooks')) : [],
    ...entries(join(root, 'scripts')),
  ].filter(file => ['.md', '.mjs', '.js'].includes(extname(file)))
  for (const file of files) {
    const bytes = readFileSync(file)
    assert(!(bytes.length >= 3 && bytes[0] === 0xEF && bytes[1] === 0xBB && bytes[2] === 0xBF),
      `${file} starts with a byte-order mark (EF BB BF), which the skill loader reads as "no frontmatter"`)
  }
  return `${files.length} files`
})

check('every SKILL.md carries matching frontmatter and stays under 500 lines', () => {
  for (const name of EXPECTED_SKILLS) {
    const file = join(root, 'skills', name, 'SKILL.md')
    assert(existsSync(file), `skills/${name}/SKILL.md is missing`)
    const front = skillFrontmatter(file)
    assert(front !== null, `skills/${name}/SKILL.md has no frontmatter`)
    assert(new RegExp(`^name:\\s*${name}\\s*$`, 'm').test(front),
      `skills/${name}/SKILL.md frontmatter name does not match its directory`)
    const description = /^description:\s*(\S.*)$/m.exec(front)
    assert(description !== null && description[1].length > 20,
      `skills/${name}/SKILL.md description is missing or too short to route on`)
    const count = skillBody(file).split('\n').length
    assert(count <= 500, `skills/${name}/SKILL.md body is ${count} lines, over the 500-line ceiling`)
  }
})

check('every markdown link in a skill resolves', () => {
  const files = entries(join(root, 'skills')).filter(file => extname(file) === '.md')
  for (const file of files) {
    const text = readFileSync(file, 'utf8')
    for (const match of text.matchAll(/\]\(([^)\s]+)\)/g)) {
      const target = match[1]
      if (/^(https?:|mailto:|#)/.test(target) || target.includes('<')) continue
      const path = resolve(dirname(file), target.split('#')[0])
      assert(existsSync(path), `${file} links to a missing target: ${target}`)
    }
  }
  return `${files.length} files`
})

check('every helper mention resolves and no bash invocation survives', () => {
  const files = entries(join(root, 'skills')).filter(file => extname(file) === '.md')
  // Helpers live in a skill's scripts/ or, for the package-level graders, in
  // scripts/. Both spellings appear in skill text.
  const known = entries(root)
    .filter(file => !file.includes(`${join(root, 'vendor')}`))
    .map(file => file.split(/[\\/]/).slice(-2).join('/'))
  let mentions = 0
  for (const file of files) {
    const text = readFileSync(file, 'utf8')
    assert(!/bash scripts\//.test(text), `${file} still invokes a helper through bash`)
    for (const match of text.matchAll(/scripts\/([a-z-]+\.mjs)/g)) {
      mentions++
      assert(known.includes(`scripts/${match[1]}`), `${file} mentions scripts/${match[1]}, which does not exist`)
    }
  }
  return `${mentions} mentions`
})

check('no upstream namespace, visual companion or home-directory path remains', () => {
  const files = entries(join(root, 'skills')).filter(file => extname(file) === '.md')
  for (const file of files) {
    const text = readFileSync(file, 'utf8')
    assert(!text.includes('superpowers:'), `${file} still references superpowers:`)
    assert(!/visual-companion|start-server/.test(text), `${file} still references the visual companion`)
    assert(!/~\/(\.claude|\.superpowers|\.local)/.test(text), `${file} still writes to a home directory`)
  }
  return `${files.length} files`
})

check('shipped helpers never capture a child through a pipe', () => {
  // Under the Windows ACL sandbox a piped stdio child cannot open its named pipe
  // and fails with EPERM, so a helper that captures that way breaks exactly where
  // it is supposed to run (DSH docs/subsystems sandbox-windows-acl). The auditor
  // is excluded: it names the pattern it forbids.
  const self = join(root, 'scripts', 'check-preset.mjs')
  const files = helperFiles().filter(file => file !== self)
  for (const file of files) {
    const text = readFileSync(file, 'utf8')
    assert(!/stdio:\s*['"]pipe['"]/.test(text), `${file} uses piped stdio`)
    assert(!/\b(execSync|execFileSync|execFile)\b/.test(text), `${file} captures through an implicit pipe`)
  }
  return `${files.length} scripts`
})

check('every relative import in a helper resolves', () => {
  const files = helperFiles()
  let count = 0
  for (const file of files) {
    const text = readFileSync(file, 'utf8')
    for (const match of text.matchAll(/(?:from|import)\s+['"](\.[^'"]+)['"]/g)) {
      count++
      const target = resolve(dirname(file), match[1])
      assert(existsSync(target), `${file} imports a missing module: ${match[1]}`)
    }
  }
  return `${count} imports`
})

check('persona carries the four invariants', () => {
  const text = readPatch()
  const start = text.indexOf('prefix: |-')
  assert(start !== -1, 'persona prefix is missing')
  const block = text.slice(start, text.indexOf('          - id: agent-instructions', start))
  for (const [invariant, pattern] of [
    ['skills bootstrap', /using-superpowers/],
    ['evidence labels', /实测[\s\S]*源码[\s\S]*推论[\s\S]*无法判定/],
    ['delegation collection', /own collection/],
    ['no fallbacks', /No fallbacks/],
  ]) {
    assert(pattern.test(block), `persona is missing the ${invariant} invariant`)
  }
})

check('dsh tool mapping covers the actions and the node invocation', () => {
  const file = join(root, 'skills', 'using-superpowers', 'references', 'dsh-tools.md')
  assert(existsSync(file), 'dsh-tools.md is missing')
  const text = readFileSync(file, 'utf8')
  for (const tool of ['read', 'write', 'edit', 'glob', 'grep', 'pwsh', 'subagent', 'todo_write', 'skill', 'ask_user_question']) {
    assert(text.includes('`' + tool + '`'), `dsh-tools.md does not mention ${tool}`)
  }
  assert(/node <absolute path/.test(text), 'dsh-tools.md does not say how to call a helper')
})

check('distilled skills name their upstream', () => {
  for (const name of ECC_SKILLS) {
    const front = skillFrontmatter(join(root, 'skills', name, 'SKILL.md'))
    assert(front !== null, `skills/${name}/SKILL.md has no frontmatter`)
    assert(/origin:\s*ECC/.test(front), `skills/${name}/SKILL.md does not record origin: ECC`)
  }
})

check('package metadata and skill root resolution', () => {
  const pkg = JSON.parse(readFileSync(join(root, 'package.json'), 'utf8'))
  assert(pkg.name === '@quanheng/preset', `package.json name is ${pkg.name}`)
  assert(/^\d+\.\d+\.\d+$/.test(pkg.version), `package.json version is ${pkg.version}`)
  assert(typeof pkg.engines?.node === 'string', 'package.json does not pin a node engine range')
  assert(pkg.dsh?.bundle?.patch === './cordis.patch.yml', 'package.json does not declare the bundle patch')
  const text = readPatch()
  assert(text.includes("createRequire(baseUrl).resolve('@quanheng/preset/package.json')"),
    'skill root does not resolve @quanheng/preset/package.json')
  assert(text.includes("createRequire(baseUrl).resolve('@deepseek-ai/dsh-agent-preset/package.json')"),
    'the shipped dsh-doc skill root is missing')
})

check('no skill file costs more context than it is worth', () => {
  const files = entries(join(root, 'skills'))
  let total = 0
  for (const file of files) {
    const size = statSync(file).size
    total += size
    assert(size <= 32 * 1024, `${file} is ${Math.round(size / 1024)} KB, over the 32 KB ceiling`)
  }
  return `${files.length} files, ${Math.round(total / 1024)} KB total`
})

check('the hooks plugin registers the capture and the injection it documents', () => {
  const file = join(root, 'hooks', 'index.js')
  assert(existsSync(file), 'hooks/index.js is missing')
  const text = readFileSync(file, 'utf8')
  assert(/export const name = '[\w-]+'/.test(text), 'hooks/index.js exports no plugin name')
  assert(/export const inject = \['systemPrompt'\]/.test(text), 'the hook does not inject systemPrompt')
  assert(/export function apply\(ctx\)/.test(text), 'hooks/index.js exports no apply(ctx)')
  assert(text.includes("'tools/result'"), 'the hook does not observe tools/result')
  assert(/ctx\.systemPrompt\.context\(/.test(text), 'the hook registers no prompt context')
  assert(/required: true/.test(text), 'the context is optional, so a suppressing deployment drops it silently')
  assert(/interpolate: false/.test(text), 'the context is interpolated, so captured `{{` would throw')
  for (const helper of ['index.js', 'instincts.mjs']) {
    const size = statSync(join(root, 'hooks', helper)).size
    assert(size <= 32 * 1024, `hooks/${helper} is ${Math.round(size / 1024)} KB, over the 32 KB ceiling`)
  }
})

check('the preset mounts the hooks row by package subpath', () => {
  const row = rows().find(candidate => candidate.id === 'hooks')
  assert(row !== undefined, 'cordis.patch.yml has no hooks row')
  assert(row.body.some(line => /^\s*name:\s*'@quanheng\/preset\/hooks'\s*$/.test(line)),
    "the hooks row does not name '@quanheng/preset/hooks'")
})

check('package exports the plugin subpath and its own manifest', () => {
  const pkg = JSON.parse(readFileSync(join(root, 'package.json'), 'utf8'))
  assert(pkg.exports?.['./hooks'] === './hooks/index.js', 'package.json does not export ./hooks')
  // The patch resolves the package manifest through this export to find skills/.
  assert(pkg.exports?.['./package.json'] === './package.json',
    'package.json must keep exporting ./package.json, or the skill root stops resolving')
  assert(existsSync(join(root, 'hooks', 'index.js')), 'the exported ./hooks file does not exist')
})

check('the instinct triggers are the same in the hook and in its contract', () => {
  const code = readFileSync(join(root, 'hooks', 'instincts.mjs'), 'utf8')
  const contract = readFileSync(join(root, 'skills', 'qh-judgment', 'references', 'instincts.md'), 'utf8')
  for (const [token, pattern] of [
    ['always', /FIXED_TRIGGERS = Object\.freeze\(\['always'/],
    ['tool-error', /'tool-error'/],
    ['tool:<name>', /TOOL_TRIGGER_PREFIX = 'tool:'/],
  ]) {
    assert(pattern.test(code), `hooks/instincts.mjs no longer defines the ${token} trigger`)
  }
  for (const token of ['`always`', '`tool-error`', '`tool:<name>`']) {
    assert(contract.includes(token), `the instincts contract does not document ${token}`)
  }
})


for (const line of passes) console.log(`PASS  ${line}`)
for (const line of failures) console.log(`FAIL  ${line}`)
console.log(`\n${passes.length} passed, ${failures.length} failed`)
process.exit(failures.length === 0 ? 0 : 1)
