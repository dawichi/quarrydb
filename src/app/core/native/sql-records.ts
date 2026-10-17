/** Rows as objects. Repeated column names keep every value: `id`, `id_2`, … */
export function toRecords(result: { columns: string[]; rows: unknown[][] }): Record<string, unknown>[] {
    const keys = uniqueColumnNames(result.columns)
    return result.rows.map((row) => {
        const record: Record<string, unknown> = {}
        keys.forEach((key, index) => {
            record[key] = row[index]
        })
        return record
    })
}

export function uniqueColumnNames(columns: string[]): string[] {
    const seen = new Map<string, number>()
    return columns.map((name) => {
        const count = (seen.get(name) ?? 0) + 1
        seen.set(name, count)
        return count === 1 ? name : `${name}_${count}`
    })
}
