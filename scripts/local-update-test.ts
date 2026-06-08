#!/usr/bin/env bun
/**
 * Local harness for verifying the Tauri auto-update chain — detect, download,
 * signature check, install, relaunch — without cutting a real GitHub release or
 * asking users to test each version by hand.
 *
 * Builds are signed with a dedicated test-only keypair (gitignored, generated
 * once below) and point the updater at a localhost endpoint instead of GitHub
 * Releases — fully decoupled from the production signing key and pipeline.
 * See docs/architecture.md#testing-the-update-flow-locally for the walkthrough.
 *
 * One-time setup (creates scripts/local-update-test/keys/):
 *   bunx tauri signer generate --ci -p "" -w scripts/local-update-test/keys/test.key
 *
 * Usage:
 *   bun scripts/local-update-test.ts baseline <version>   build + open an installable "old" app
 *   bun scripts/local-update-test.ts release  <version>   build, sign, and serve an "update"
 *
 * Typical run: `baseline 0.0.1`, install it, then `release 0.0.2` and use the
 * installed app's "Check for Updates…" (or wait for the background poll) to watch
 * it detect, download, verify, install, and relaunch into the new version.
 */

import { existsSync } from 'node:fs'
import { mkdir, readFile, rm, writeFile } from 'node:fs/promises'
import { $ } from 'bun'

// Apple Silicon only — this harness is for local manual verification on the dev's
// own machine, not a substitute for CI's real cross-platform matrix builds.
const RUST_TARGET = 'aarch64-apple-darwin'
const ARCH_PLATFORM_KEY = 'darwin-aarch64'

const ROOT = 'scripts/local-update-test'
const KEYS_DIR = `${ROOT}/keys`
const PRIVATE_KEY_PATH = `${KEYS_DIR}/test.key`
const PUBLIC_KEY_PATH = `${KEYS_DIR}/test.key.pub`
const SERVE_DIR = `${ROOT}/serve`
const PORT = 17420

// Distinct from the real "Quarry"/"dev.quarrydb.app" so a test build can never
// collide with (or overwrite) your actual installed app.
const PRODUCT_NAME = 'QuarryUpdateTest'
const IDENTIFIER = 'dev.quarrydb.app.localtest'

const BUNDLE_DIR = `src-tauri/target/${RUST_TARGET}/release/bundle`
const TARBALL = `${PRODUCT_NAME}.app.tar.gz`

const [, , mode, version] = process.argv

if ((mode !== 'baseline' && mode !== 'release') || !version) {
    console.error('Usage: bun scripts/local-update-test.ts <baseline|release> <version>')
    process.exit(1)
}

if (!existsSync(PRIVATE_KEY_PATH) || !existsSync(PUBLIC_KEY_PATH)) {
    console.error(
        `Missing test keypair. Generate one once with:\n` +
            `  bunx tauri signer generate --ci -p "" -w ${PRIVATE_KEY_PATH}\n`,
    )
    process.exit(1)
}

const pubkey = (await readFile(PUBLIC_KEY_PATH, 'utf-8')).trim()
const privateKey = (await readFile(PRIVATE_KEY_PATH, 'utf-8')).trim()

const overlay = {
    productName: PRODUCT_NAME,
    identifier: IDENTIFIER,
    version,
    // Plain `tauri build` defaults this to false — CI only gets `.app.tar.gz` + `.sig`
    // because `tauri-action` enables it implicitly. We need it explicitly here too.
    bundle: { createUpdaterArtifacts: true },
    plugins: {
        updater: {
            pubkey,
            endpoints: [`http://localhost:${PORT}/latest.json`],
            // The plugin hard-rejects non-https endpoints in release builds (`tauri build`
            // always produces one) — this is its documented escape hatch for local testing.
            dangerousInsecureTransportProtocol: true,
        },
    },
}

console.log(`\n→ Building ${PRODUCT_NAME} v${version} (${mode}) for ${RUST_TARGET}…\n`)

await $`bunx tauri build --target ${RUST_TARGET} --config ${JSON.stringify(overlay)}`.env({
    ...process.env,
    TAURI_SIGNING_PRIVATE_KEY: privateKey,
    TAURI_SIGNING_PRIVATE_KEY_PASSWORD: '',
})

if (mode === 'baseline') {
    const dmgPath = `${BUNDLE_DIR}/dmg/${PRODUCT_NAME}_${version}_aarch64.dmg`
    if (!existsSync(dmgPath)) {
        console.error(`\nExpected installer not found at ${dmgPath} — check the build output above.`)
        process.exit(1)
    }

    console.log(`\n✓ Built baseline installer:\n  ${dmgPath}\n`)
    console.log(`Install it, launch ${PRODUCT_NAME}, then run:`)
    console.log(`  bun scripts/local-update-test.ts release <a higher version>\n`)
    await $`open ${dmgPath}`
    process.exit(0)
}

// mode === 'release' — sign the update artifact, write the manifest, and serve both.
const tarballPath = `${BUNDLE_DIR}/macos/${TARBALL}`
const sigPath = `${tarballPath}.sig`
if (!existsSync(tarballPath) || !existsSync(sigPath)) {
    console.error(`\nExpected updater artifact not found at ${tarballPath} (+ .sig) — check the build output above.`)
    process.exit(1)
}
const signature = (await readFile(sigPath, 'utf-8')).trim()

await rm(SERVE_DIR, { recursive: true, force: true })
await mkdir(SERVE_DIR, { recursive: true })
await $`cp ${tarballPath} ${SERVE_DIR}/${TARBALL}`

const manifest = {
    version,
    notes: `Local update test — v${version}`,
    pub_date: new Date().toISOString().replace(/\.\d+Z$/, 'Z'),
    platforms: {
        [ARCH_PLATFORM_KEY]: {
            signature,
            url: `http://localhost:${PORT}/${TARBALL}`,
        },
    },
}
await writeFile(`${SERVE_DIR}/latest.json`, JSON.stringify(manifest, null, 2))

console.log(`\n✓ Signed update artifact + manifest staged in ${SERVE_DIR}/`)
console.log(`\n→ Serving http://localhost:${PORT}/latest.json — Ctrl+C to stop.\n`)
console.log(`In the installed baseline app: open "Check for Updates…" (or wait up to 4 minutes`)
console.log(`for the background poll). It should detect v${version}, download, verify the`)
console.log(`signature against the test pubkey, install, and relaunch into the new version.\n`)

Bun.serve({
    port: PORT,
    async fetch(req) {
        const path = new URL(req.url).pathname.replace(/^\//, '') || 'latest.json'
        const file = Bun.file(`${SERVE_DIR}/${path}`)
        if (!(await file.exists())) return new Response('Not found', { status: 404 })
        console.log(`  served ${path}`)
        return new Response(file)
    },
})
