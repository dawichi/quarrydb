export type SqlIdentifierDialect = 'sqlite' | 'mysql'

/**
 * Quotes one identifier without interpreting its contents as SQL.
 * Values must still be sent as parameters; this helper is only for names.
 */
export function quoteIdentifier(identifier: string, dialect: SqlIdentifierDialect): string {
    if (identifier.length === 0 || identifier.includes('\0')) {
        throw new Error('SQL identifiers must be non-empty and cannot contain NUL bytes')
    }
    const quote = dialect === 'mysql' ? '`' : '"'
    return `${quote}${identifier.replaceAll(quote, `${quote}${quote}`)}${quote}`
}

/**
 * Quotes a name in the form `schema.table`/`database.table` one component at a time.
 * A dot is treated as a qualification separator by provider contracts.
 */
export function quoteQualifiedIdentifier(name: string, dialect: SqlIdentifierDialect): string {
    const parts = name.split('.')
    if (parts.some((part) => part.length === 0)) {
        throw new Error('Qualified SQL identifiers cannot contain empty components')
    }
    return parts.map((part) => quoteIdentifier(part, dialect)).join('.')
}
