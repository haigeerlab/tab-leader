#!/usr/bin/env node
// Scan the working tree and the full git history for terms that must never
// appear in this public repository. The term list itself lives OUTSIDE the
// repository (it would otherwise leak the very terms it guards against).
//
// Usage: node scripts/check-internal-terms.mjs [--history]
// Term list: $TAB_LEADER_INTERNAL_TERMS or ~/.config/tab-leader/internal-terms.txt
//   one case-insensitive regular expression per line, `#` starts a comment.
import { execFileSync } from 'node:child_process'
import { existsSync, readFileSync } from 'node:fs'
import { homedir } from 'node:os'
import { join } from 'node:path'

const listPath =
  process.env.TAB_LEADER_INTERNAL_TERMS || join(homedir(), '.config', 'tab-leader', 'internal-terms.txt')

if (!existsSync(listPath)) {
  console.warn(`[check-internal-terms] term list not found at ${listPath}; skipped.`)
  process.exit(0)
}

const patterns = readFileSync(listPath, 'utf8')
  .split('\n')
  .map((line) => line.trim())
  .filter((line) => line && !line.startsWith('#'))
  .map((source) => new RegExp(source, 'i'))

const git = (...args) => execFileSync('git', args, { encoding: 'utf8', maxBuffer: 1 << 28 })
const hits = []

function scan(label, text) {
  text.split('\n').forEach((line, index) => {
    if (patterns.some((re) => re.test(line))) hits.push(`${label}:${index + 1}: ${line.trim().slice(0, 160)}`)
  })
}

for (const file of git('ls-files', '-co', '--exclude-standard').split('\n').filter(Boolean)) {
  if (!existsSync(file)) continue
  scan(file, readFileSync(file, 'utf8'))
}

if (process.argv.includes('--history')) {
  let log = ''
  try {
    log = git('log', '--all', '-p', '--format=commit %H%n%B')
  } catch {
    log = '' // no commits yet
  }
  scan('history', log)
}

if (hits.length) {
  console.error(`[check-internal-terms] ${hits.length} hit(s):`)
  for (const hit of hits) console.error('  ' + hit)
  process.exit(1)
}
console.log(`[check-internal-terms] clean (${patterns.length} patterns${process.argv.includes('--history') ? ', history included' : ''}).`)
