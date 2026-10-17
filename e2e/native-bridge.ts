import type { Page } from '@playwright/test'

// Runs the UI against the real Rust commands served by the `ui_bridge` test in
// src-tauri/src/lib.rs. Only OS-level pieces (dialogs, keychain, events, updater) stay fake:
// dialogs write into `dir`, secrets live in memory for the page's lifetime, and native menu
// events are fired with `window.__quarryEmit('menu:export-diagnostics')`.
function installNativeBridge(dir: string): void {
    const secrets = new Map<string, string>()
    const callbacks = new Map<number, (payload: unknown) => void>()
    const listeners = new Map<string, number[]>()
    Object.assign(window, {
        __quarryEmit: (event: string) => {
            for (const id of listeners.get(event) ?? []) callbacks.get(id)?.({ event, id, payload: null })
        },
    })
    window.__TAURI_INTERNALS__ = {
        transformCallback: (callback: (payload: unknown) => void) => {
            const id = callbacks.size + 1
            callbacks.set(id, callback)
            return id
        },
        invoke: async (command: string, args: Record<string, unknown> & { options?: { defaultPath?: string } }) => {
            if (command === 'plugin:dialog|save' || command === 'plugin:dialog|open') {
                return `${dir}/${args.options?.defaultPath ?? 'quarry-sample.db'}`
            }
            if (command === 'plugin:event|listen') {
                const event = String(args.event)
                listeners.set(event, [...(listeners.get(event) ?? []), Number(args.handler)])
                return listeners.get(event)?.length
            }
            if (command === 'plugin:event|unlisten') return null
            if (command === 'plugin:updater|check') return null
            if (command === 'plugin:app|version') return '0.2.0'
            const secret = command.match(/^(get|set|delete)_(mysql|redis)_password$/)
            if (secret) {
                const key = `${secret[2]}:${args.connectionId}`
                if (secret[1] === 'set') secrets.set(key, String(args.password))
                if (secret[1] === 'delete') secrets.delete(key)
                return secret[1] === 'get' ? (secrets.get(key) ?? null) : null
            }
            const response = await fetch('http://127.0.0.1:1430/invoke', {
                method: 'POST',
                headers: { 'content-type': 'application/json' },
                body: JSON.stringify({ cmd: command, args }),
            })
            const reply = (await response.json()) as { ok?: unknown; err?: unknown }
            if ('err' in reply) throw reply.err
            return reply.ok
        },
    }
}

export async function useNativeBridge(page: Page, dir: string): Promise<void> {
    await page.addInitScript({ content: `(${installNativeBridge.toString()})(${JSON.stringify(dir)})` })
}
