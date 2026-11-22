#!/usr/bin/env node
// Render a skill's ```dot blocks to SVG.
//
// Port of `render-graphs.js` from Superpowers 7.0.2. Two things changed, both
// because of where this runs:
//   - the original fed the graph to `dot` on stdin and read SVG back from stdout,
//     which is a pipe; a confined child cannot open one. Each graph is written to
//     a `.dot` file and `dot -Tsvg` is pointed at it instead, which also leaves
//     the source next to the SVG for later editing.
//   - the graphviz probe ran the binary and caught the error; it now resolves the
//     executable first, so "not installed" is named instead of inferred.
//
// Usage:
//   node <absolute path>/render-graphs.mjs <skill-directory> [--combine]
//
// Exit: 0 rendered (or nothing to render), 1 a render failed, 2 bad usage,
//       3 graphviz is not installed.
import { existsSync, mkdirSync, readFileSync, writeFileSync } from 'node:fs'
import { basename, join, resolve } from 'node:path'
import { pathToFileURL } from 'node:url'
import {
  resolveExecutable, runInherited,
} from '../../subagent-driven-development/scripts/lib/exec.mjs'

const USAGE = [
  'usage: render-graphs.mjs <skill-directory> [--combine]',
  '',
  'options:',
  '  --combine    combine every diagram in the skill into one SVG',
  '',
  'example:',
  '  node render-graphs.mjs ../systematic-debugging',
  '  node render-graphs.mjs ../systematic-debugging --combine',
].join('\n')

/** Every ```dot block in the markdown, with the name of its digraph. */
function extractDotBlocks(markdown) {
  const blocks = []
  for (const match of markdown.matchAll(/```dot\r?\n([\s\S]*?)```/g)) {
    const content = match[1].trim()
    const name = /digraph\s+(\w+)/.exec(content)?.[1] ?? `graph_${blocks.length + 1}`
    blocks.push({ name, content })
  }
  return blocks
}

/** The nodes and edges of one digraph, without its wrapper or rank direction. */
function graphBody(content) {
  const match = /digraph\s+\w+\s*\{([\s\S]*)\}/.exec(content)
  if (match === null) return ''
  return match[1].replace(/^\s*rankdir\s*=\s*\w+\s*;?\s*$/gm, '').trim()
}

/** Every diagram as one clustered graph, for a single overview picture. */
function combineGraphs(blocks, skillName) {
  const clusters = blocks.map((block, index) => {
    const body = graphBody(block.content).split('\n').map(line => `  ${line}`).join('\n')
    return `  subgraph cluster_${index} {\n    label="${block.name}";\n${body}\n  }`
  })
  return `digraph ${skillName}_combined {\n  rankdir=TB;\n  compound=true;\n  newrank=true;\n\n${clusters.join('\n\n')}\n}`
}

/**
 * Render one graph by writing its source beside the output and pointing `dot` at it.
 * @returns true when `dot` exited 0.
 */
function render(dot, outputDirectory, name, source) {
  const dotPath = join(outputDirectory, `${name}.dot`)
  const svgPath = join(outputDirectory, `${name}.svg`)
  writeFileSync(dotPath, source)
  const status = runInherited(dot, ['-Tsvg', dotPath, '-o', svgPath])
  if (status !== 0) {
    process.stderr.write(`  failed: ${name} (dot exited ${status})\n`)
    return false
  }
  process.stdout.write(`  rendered: ${name}.svg (source: ${name}.dot)\n`)
  return true
}

function main(argv) {
  const combine = argv.includes('--combine')
  const target = argv.find(argument => !argument.startsWith('--'))
  if (target === undefined) {
    process.stderr.write(`${USAGE}\n`)
    return 2
  }
  const skillDirectory = resolve(target)
  const skillFile = join(skillDirectory, 'SKILL.md')
  if (!existsSync(skillFile)) {
    process.stderr.write(`${skillFile} does not exist\n`)
    return 2
  }
  const dot = resolveExecutable('dot')
  if (dot === undefined) {
    process.stderr.write('graphviz `dot` was not found on PATH; install graphviz to render diagrams\n')
    return 3
  }

  const blocks = extractDotBlocks(readFileSync(skillFile, 'utf8'))
  if (blocks.length === 0) {
    process.stdout.write(`no \`\`\`dot blocks in ${skillFile}\n`)
    return 0
  }
  process.stdout.write(`found ${blocks.length} diagram(s) in ${basename(skillDirectory)}/SKILL.md\n`)

  const outputDirectory = join(skillDirectory, 'diagrams')
  mkdirSync(outputDirectory, { recursive: true })
  const skillName = basename(skillDirectory).replace(/-/g, '_')

  if (combine) {
    return render(dot, outputDirectory, `${skillName}_combined`, combineGraphs(blocks, skillName)) ? 0 : 1
  }
  let rendered = 0
  for (const block of blocks) {
    if (render(dot, outputDirectory, block.name, block.content)) rendered++
  }
  process.stdout.write(`\n${rendered}/${blocks.length} rendered into ${outputDirectory}\n`)
  return rendered === blocks.length ? 0 : 1
}

const isMain = process.argv[1] !== undefined && import.meta.url === pathToFileURL(process.argv[1]).href
if (isMain) process.exitCode = main(process.argv.slice(2))

export { combineGraphs, extractDotBlocks, graphBody }
