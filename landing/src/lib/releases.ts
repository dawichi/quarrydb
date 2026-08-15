const REPO = 'dawichi/quarrydb'
const API_URL = `https://api.github.com/repos/${REPO}/releases/latest`
const CACHE_KEY = 'quarry-latest-release'
const CACHE_TTL_MS = 15 * 60 * 1000

export const RELEASES_URL = `https://github.com/${REPO}/releases`

export interface ReleaseAsset {
    name: string
    browser_download_url: string
}

export interface Release {
    tag_name: string
    html_url: string
    assets: ReleaseAsset[]
}

interface CachedRelease {
    release: Release
    fetchedAt: number
}

// Cached in localStorage (across tabs and reloads) with a TTL so repeat page
// views don't hit GitHub's unauthenticated API rate limit, while still picking
// up new releases shortly after they're published.
export async function fetchLatestRelease(): Promise<Release> {
    const cached = localStorage.getItem(CACHE_KEY)
    if (cached) {
        try {
            const parsed: unknown = JSON.parse(cached)
            if (isCachedRelease(parsed) && Date.now() - parsed.fetchedAt < CACHE_TTL_MS) return parsed.release
        } catch {
            localStorage.removeItem(CACHE_KEY)
        }
    }

    const response = await fetch(API_URL)
    if (!response.ok) throw new Error(`GitHub release lookup failed (${response.status})`)
    const payload: unknown = await response.json()
    if (!isRelease(payload)) throw new Error('GitHub release response was not recognized')
    const release = payload

    if (release?.assets) {
        const entry: CachedRelease = { release, fetchedAt: Date.now() }
        localStorage.setItem(CACHE_KEY, JSON.stringify(entry))
    }

    return release
}

function isRelease(value: unknown): value is Release {
    if (!value || typeof value !== 'object') return false
    const release = value as Partial<Release>
    return (
        typeof release.tag_name === 'string' &&
        typeof release.html_url === 'string' &&
        Array.isArray(release.assets) &&
        release.assets.every(
            (asset): asset is ReleaseAsset =>
                !!asset && typeof asset === 'object' && typeof asset.name === 'string' && typeof asset.browser_download_url === 'string',
        )
    )
}

function isCachedRelease(value: unknown): value is CachedRelease {
    if (!value || typeof value !== 'object') return false
    const cached = value as Partial<CachedRelease>
    return isRelease(cached.release) && Number.isFinite(cached.fetchedAt)
}
