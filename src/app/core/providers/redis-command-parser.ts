export function parseRedisCommand(input: string): { args: string[]; error: string | null } {
    const args: string[] = []
    let current = ''
    let quote: '"' | "'" | null = null
    let escaped = false

    for (const character of input.trim()) {
        if (escaped) {
            current += character
            escaped = false
        } else if (character === '\\') {
            escaped = true
        } else if (quote) {
            if (character === quote) quote = null
            else current += character
        } else if (character === '"' || character === "'") {
            quote = character
        } else if (/\s/.test(character)) {
            if (current) {
                args.push(current)
                current = ''
            }
        } else {
            current += character
        }
    }

    if (escaped) current += '\\'
    if (quote) return { args: [], error: 'Unclosed quote in Redis command' }
    if (current) args.push(current)
    return { args, error: args.length === 0 ? 'Redis command cannot be empty' : null }
}
