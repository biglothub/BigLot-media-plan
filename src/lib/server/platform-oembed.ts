/**
 * Free oEmbed fetchers for each platform.
 * None of these require API keys.
 */

import type { EnrichMetrics, SupportedPlatform } from '$lib/types';

export interface OEmbedResult {
    platform: SupportedPlatform;
    title: string | null;
    authorName: string | null;
    thumbnailUrl: string | null;
    metrics: EnrichMetrics;
    source: string;
}

const OEMBED_TIMEOUT_MS = 10_000;

function emptyMetrics(): EnrichMetrics {
    return { views: null, likes: null, comments: null, shares: null, saves: null };
}

// ── YouTube oEmbed ────────────────────────────────────────────────────
export async function fetchYouTubeOEmbed(
    videoUrl: string,
    fetchFn: typeof fetch = fetch
): Promise<OEmbedResult | null> {
    try {
        const endpoint = `https://www.youtube.com/oembed?url=${encodeURIComponent(videoUrl)}&format=json`;
        const controller = new AbortController();
        const timer = setTimeout(() => controller.abort(), OEMBED_TIMEOUT_MS);

        const res = await fetchFn(endpoint, {
            headers: { Accept: 'application/json' },
            signal: controller.signal
        });
        clearTimeout(timer);

        if (!res.ok) return null;

        const data = (await res.json()) as Record<string, unknown>;
        return {
            platform: 'youtube',
            title: typeof data.title === 'string' ? data.title.trim() || null : null,
            authorName: typeof data.author_name === 'string' ? data.author_name.trim() || null : null,
            thumbnailUrl:
                typeof data.thumbnail_url === 'string' ? data.thumbnail_url.trim() || null : null,
            metrics: emptyMetrics(),
            source: 'youtube-oembed'
        };
    } catch {
        return null;
    }
}

// ── Facebook oEmbed ───────────────────────────────────────────────────
export async function fetchFacebookOEmbed(
    videoUrl: string,
    fetchFn: typeof fetch = fetch
): Promise<OEmbedResult | null> {
    try {
        const endpoint = `https://www.facebook.com/plugins/video/oembed.json/?url=${encodeURIComponent(videoUrl)}`;
        const controller = new AbortController();
        const timer = setTimeout(() => controller.abort(), OEMBED_TIMEOUT_MS);

        const res = await fetchFn(endpoint, {
            headers: {
                Accept: 'application/json',
                'User-Agent':
                    'Mozilla/5.0 (Macintosh; Intel Mac OS X 10_15_7) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/122.0 Safari/537.36'
            },
            signal: controller.signal
        });
        clearTimeout(timer);

        if (!res.ok) return null;

        const data = (await res.json()) as Record<string, unknown>;
        return {
            platform: 'facebook',
            title: typeof data.title === 'string' ? data.title.trim() || null : null,
            authorName: typeof data.author_name === 'string' ? data.author_name.trim() || null : null,
            thumbnailUrl: null, // Facebook oEmbed for video doesn't typically return thumbnail
            metrics: emptyMetrics(),
            source: 'facebook-oembed'
        };
    } catch {
        return null;
    }
}

// ── TikTok oEmbed ─────────────────────────────────────────────────────
export async function fetchTikTokOEmbed(
    videoUrl: string,
    fetchFn: typeof fetch = fetch
): Promise<OEmbedResult | null> {
    try {
        const endpoint = `https://www.tiktok.com/oembed?url=${encodeURIComponent(videoUrl)}`;
        const controller = new AbortController();
        const timer = setTimeout(() => controller.abort(), OEMBED_TIMEOUT_MS);

        const res = await fetchFn(endpoint, {
            headers: { Accept: 'application/json' },
            signal: controller.signal
        });
        clearTimeout(timer);

        if (!res.ok) return null;

        const data = (await res.json()) as Record<string, unknown>;
        return {
            platform: 'tiktok',
            title: typeof data.title === 'string' ? data.title.trim() || null : null,
            authorName: typeof data.author_name === 'string' ? data.author_name.trim() || null : null,
            thumbnailUrl:
                typeof data.thumbnail_url === 'string' ? data.thumbnail_url.trim() || null : null,
            metrics: emptyMetrics(),
            source: 'tiktok-oembed'
        };
    } catch {
        return null;
    }
}

// ── TikTok Rehydration JSON scraping ──────────────────────────────────
// TikTok embeds metrics inside __UNIVERSAL_DATA_FOR_REHYDRATION__ or
// SIGI_STATE script blocks. This extracts them when available.

function safeInt(value: unknown): number | null {
    if (value === null || value === undefined) return null;
    const num = typeof value === 'number' ? value : Number(value);
    return Number.isFinite(num) ? Math.round(num) : null;
}

export function extractTikTokMetricsFromHtml(html: string): EnrichMetrics {
    const metrics = emptyMetrics();

    // Try __UNIVERSAL_DATA_FOR_REHYDRATION__
    const rehydrationMatch = html.match(
        /<script[^>]*id="__UNIVERSAL_DATA_FOR_REHYDRATION__"[^>]*>([\s\S]*?)<\/script>/i
    );
    if (rehydrationMatch) {
        try {
            const payload = JSON.parse(rehydrationMatch[1]);
            // Navigate the nested structure to find video stats
            const defaultScope = payload?.['__DEFAULT_SCOPE__'];
            const webappDetail = defaultScope?.['webapp.video-detail'];
            const videoDetail = webappDetail?.itemInfo?.itemStruct ?? webappDetail?.itemStruct;
            const stats = videoDetail?.stats;
            if (stats) {
                metrics.views = safeInt(stats.playCount);
                metrics.likes = safeInt(stats.diggCount);
                metrics.comments = safeInt(stats.commentCount);
                metrics.shares = safeInt(stats.shareCount);
                metrics.saves = safeInt(stats.collectCount);
                return metrics;
            }
        } catch {
            // fall through to SIGI_STATE
        }
    }

    // Try SIGI_STATE
    const sigiMatch = html.match(
        /<script[^>]*id="SIGI_STATE"[^>]*>([\s\S]*?)<\/script>/i
    );
    if (sigiMatch) {
        try {
            const payload = JSON.parse(sigiMatch[1]);
            const itemModule = payload?.ItemModule;
            if (itemModule && typeof itemModule === 'object') {
                const firstVideo = Object.values(itemModule)[0] as Record<string, unknown> | undefined;
                const stats = firstVideo?.stats as Record<string, unknown> | undefined;
                if (stats) {
                    metrics.views = safeInt(stats.playCount);
                    metrics.likes = safeInt(stats.diggCount);
                    metrics.comments = safeInt(stats.commentCount);
                    metrics.shares = safeInt(stats.shareCount);
                    metrics.saves = safeInt(stats.collectCount);
                }
            }
        } catch {
            // ignore
        }
    }

    return metrics;
}
