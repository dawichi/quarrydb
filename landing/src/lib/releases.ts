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
        const { release, fetchedAt }: CachedRelease = JSON.parse(cached)
        if (Date.now() - fetchedAt < CACHE_TTL_MS) return release
    }

    const release: Release = await fetch(API_URL).then((r) => r.json())

    if (release?.assets) {
        const entry: CachedRelease = { release, fetchedAt: Date.now() }
        localStorage.setItem(CACHE_KEY, JSON.stringify(entry))
    }

    return release
}
