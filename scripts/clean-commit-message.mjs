import { readFileSync, writeFileSync } from 'node:fs'

const path = process.argv[2]
const text = readFileSync(path, 'utf8')
const cleaned = text.replace(/^co-authored-by:[^\r\n]*cursor[^\r\n]*(?:\r?\n|$)/gim, '')
if (cleaned !== text) writeFileSync(path, cleaned, 'utf8')
