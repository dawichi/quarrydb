import type { Column, ForeignKey, Index } from '@quarrydb/shared'

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

/**
 * Generates the multi-statement "rebuild dance" needed to drop a column from a SQLite table.
 * SQLite's native ALTER TABLE cannot drop columns directly, so we create a new table with the
 * remaining schema, copy the data across, swap the names, and recreate any surviving indexes.
 *
 * Returns an ordered array of SQL statements intended to be executed sequentially via
 * DatabaseService.runDdlScript(). The PRAGMA foreign_keys wrappers must be run outside any
 * transaction; the DDL itself runs inside BEGIN / COMMIT.
 *
 * Known limitation: inline UNIQUE, CHECK, and AUTOINCREMENT constraints are not captured by
 * PRAGMA table_info and will not appear in the reconstructed CREATE TABLE. The generated script
 * should always be reviewed before executing.
 */
export function buildDropColumnScript(
    tableName: string,
    colToDrop: string,
    remainingColumns: Column[],
    foreignKeys: ForeignKey[],
    indexes: Index[],
): string[] {
    const tmpName = `__quarry_new_${tableName}`

    const colDefs = remainingColumns.map((col) => {
        let def = `  "${col.name}" ${col.type}`
        if (col.primaryKey) def += ' PRIMARY KEY'
        if (!col.nullable && !col.primaryKey) def += ' NOT NULL'
        if (col.defaultValue !== undefined) def += ` DEFAULT ${col.defaultValue}`
        return def
    })

    const fkDefs = foreignKeys
        .filter((fk) => fk.column !== colToDrop)
        .map((fk) => `  FOREIGN KEY ("${fk.column}") REFERENCES "${fk.referencesTable}" ("${fk.referencesColumn}")`)

    const createSql = `CREATE TABLE "${tmpName}" (\n${[...colDefs, ...fkDefs].join(',\n')}\n)`

    const colList = remainingColumns.map((c) => `"${c.name}"`).join(', ')
    const insertSql = `INSERT INTO "${tmpName}" SELECT ${colList} FROM "${tableName}"`

    const remainingColSet = new Set(remainingColumns.map((c) => c.name))
    const indexSqls = indexes
        .filter((idx) => idx.columns.every((c) => remainingColSet.has(c)))
        .map((idx) => {
            const u = idx.unique ? 'UNIQUE ' : ''
            const cols = idx.columns.map((c) => `"${c}"`).join(', ')
            return `CREATE ${u}INDEX "${idx.name}" ON "${tableName}" (${cols})`
        })

    return [
        'PRAGMA foreign_keys = OFF',
        'BEGIN',
        createSql,
        insertSql,
        `DROP TABLE "${tableName}"`,
        `ALTER TABLE "${tmpName}" RENAME TO "${tableName}"`,
        ...indexSqls,
        'COMMIT',
        'PRAGMA foreign_keys = ON',
    ]
}
