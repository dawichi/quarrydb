export interface ColumnDef {
    id: string
    name: string
    type: string
    notNull: boolean
    primaryKey: boolean
    defaultValue: string
}

export const SQL_TYPES = [
    'INTEGER',
    'TEXT',
    'REAL',
    'BLOB',
    'NUMERIC',
    'BOOLEAN',
    'DATE',
    'DATETIME',
    'VARCHAR(255)',
] as const

export function makeColumn(): ColumnDef {
    return { id: crypto.randomUUID(), name: '', type: 'TEXT', notNull: false, primaryKey: false, defaultValue: '' }
}

export function generateCreateTableSql(tableName: string, columns: ColumnDef[]): string {
    const pks = columns.filter((c) => c.primaryKey)
    const lines: string[] = columns.map((c) => {
        const parts: string[] = [`"${c.name}" ${c.type}`]
        if (c.primaryKey && pks.length === 1) parts.push('PRIMARY KEY')
        if (c.notNull && !c.primaryKey) parts.push('NOT NULL')
        if (c.defaultValue.trim()) parts.push(`DEFAULT ${c.defaultValue.trim()}`)
        return `    ${parts.join(' ')}`
    })
    if (pks.length > 1) {
        lines.push(`    PRIMARY KEY (${pks.map((c) => `"${c.name}"`).join(', ')})`)
    }
    return `CREATE TABLE "${tableName}" (\n${lines.join(',\n')}\n)`
}
