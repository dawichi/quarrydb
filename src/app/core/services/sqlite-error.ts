export function describeSqliteError(error: unknown, fallback = 'SQLite operation failed'): string {
    const message = error instanceof Error ? error.message : typeof error === 'string' ? error : ''
    const normalized = message.toLowerCase()

    if (normalized.includes('database is locked') || normalized.includes('database is busy')) {
        return `${fallback}: the database is busy or locked. Close other writers and try again.`
    }

    if (normalized.includes('readonly') || normalized.includes('read-only')) {
        return `${fallback}: the database is read-only. Check file permissions or open a writable copy.`
    }

    if (normalized.includes('not a database') || normalized.includes('file is encrypted')) {
        return `${fallback}: the file is not a readable SQLite database.`
    }

    if (normalized.includes('unable to open database') || normalized.includes('no such file')) {
        return `${fallback}: the database file could not be opened. Check that it still exists and is accessible.`
    }

    return message || fallback
}
