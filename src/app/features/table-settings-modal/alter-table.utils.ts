export interface AddColumnDef {
    name: string
    type: string
    notNull: boolean
    defaultValue: string
}

export function buildAddColumnSql(tableName: string, col: AddColumnDef): string {
    let sql = `ALTER TABLE "${tableName}" ADD COLUMN "${col.name}" ${col.type}`
    if (col.notNull) sql += ' NOT NULL'
    if (col.defaultValue.trim()) sql += ` DEFAULT ${col.defaultValue.trim()}`
    return sql
}

export function buildRenameColumnSql(tableName: string, oldName: string, newName: string): string {
    return `ALTER TABLE "${tableName}" RENAME COLUMN "${oldName}" TO "${newName}"`
}

export function buildRenameTableSql(oldName: string, newName: string): string {
    return `ALTER TABLE "${oldName}" RENAME TO "${newName}"`
}
