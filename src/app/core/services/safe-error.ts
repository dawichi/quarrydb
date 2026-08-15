const CONNECTION_CREDENTIALS = /([a-z][a-z\d+.-]*:\/\/)[^\s/]+@/gi

export function describeSafeError(error: unknown, fallback = 'Unknown error', secrets: string[] = []): string {
    const message = error instanceof Error ? error.message : typeof error === 'string' ? error : ''
    if (!message.trim()) return fallback

    let safeMessage = message
    for (const secret of secrets) {
        if (secret) safeMessage = safeMessage.replaceAll(secret, '[redacted]')
    }
    return safeMessage.replace(CONNECTION_CREDENTIALS, '$1[redacted]@')
}
