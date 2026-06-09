export function buildCreateIndexSql(tableName: string, indexName: string, columns: string[], unique: boolean): string {
    const uniqueClause = unique ? 'UNIQUE ' : ''
    const cols = columns.map((c) => `"${c}"`).join(', ')
    return `CREATE ${uniqueClause}INDEX "${indexName}" ON "${tableName}" (${cols})`
}
