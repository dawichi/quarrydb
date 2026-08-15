import { readdirSync, readFileSync, statSync } from 'node:fs'
import { dirname, extname, join, resolve } from 'node:path'

const root = resolve(import.meta.dir, '..')
const roots = ['README.md', 'docs', 'landing/README.md']
const markdownFiles = roots.flatMap((entry) => collectMarkdown(join(root, entry)))
const linkPattern = /\[[^\]]*\]\((<[^>]+>|[^\s)]+)(?:\s+[^)]*)?\)/g
const failures: string[] = []

for (const file of markdownFiles) {
    const source = readFileSync(file, 'utf8')
    for (const match of source.matchAll(linkPattern)) {
        const target = match[1].replace(/^<|>$/g, '')
        if (isExternal(target)) continue

        const [pathPart] = target.split('#', 1)
        if (!pathPart) continue

        const normalizedPath = pathPart.replace(/:\d+$/, '')
        const resolvedTarget = resolve(dirname(file), normalizedPath)
        if (!resolvedTarget.startsWith(root + '/') && resolvedTarget !== root) {
            failures.push(`${display(file)}: link escapes repository: ${target}`)
            continue
        }

        if (!exists(resolvedTarget)) {
            failures.push(`${display(file)}: missing target: ${target}`)
        }
    }
}

if (failures.length > 0) {
    console.error(`Documentation link check failed (${failures.length} issue${failures.length === 1 ? '' : 's'}):`)
    for (const failure of failures) console.error(`- ${failure}`)
    process.exit(1)
}

console.log(`Documentation link check passed (${markdownFiles.length} Markdown files).`)

function collectMarkdown(path: string): string[] {
    if (!exists(path)) return []
    if (statSync(path).isFile()) return extname(path).toLowerCase() === '.md' ? [path] : []

    return readdirSync(path, { withFileTypes: true }).flatMap((entry) => {
        if (entry.name === 'node_modules' || entry.name === 'dist' || entry.name === 'target') return []
        return collectMarkdown(join(path, entry.name))
    })
}

function isExternal(target: string): boolean {
    return target.startsWith('#') || /^[a-z][a-z\d+.-]*:/i.test(target) || target.startsWith('/')
}

function exists(path: string): boolean {
    try {
        statSync(path)
        return true
    } catch {
        return false
    }
}

function display(path: string): string {
    return path.slice(root.length + 1)
}
