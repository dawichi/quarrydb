const REPO = 'dawichi/quarrydb'
const API_URL = `https://api.github.com/repos/${REPO}/releases/latest`
const CACHE_KEY = 'quarry-latest-release'

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

// Cached in sessionStorage so repeat page views in the same session don't
// hit GitHub's unauthenticated API rate limit.
export async function fetchLatestRelease(): Promise<Release> {
    const cached = sessionStorage.getItem(CACHE_KEY)
    if (cached) return JSON.parse(cached)

    const release: Release = await fetch(API_URL).then((r) => r.json())

    if (release?.assets) {
        sessionStorage.setItem(CACHE_KEY, JSON.stringify(release))
    }

    return release
}
