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
        const endpoints = [
            `https://www.facebook.com/plugins/video/oembed.json/?url=${encodeURIComponent(videoUrl)}`,
            `https://www.facebook.com/plugins/post/oembed.json/?url=${encodeURIComponent(videoUrl)}`
        ];

        for (const endpoint of endpoints) {
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

            if (!res.ok) continue;

            const data = (await res.json()) as Record<string, unknown>;
            return {
                platform: 'facebook',
                title: typeof data.title === 'string' ? data.title.trim() || null : null,
                authorName:
                    typeof data.author_name === 'string' ? data.author_name.trim() || null : null,
                thumbnailUrl: null,
                metrics: emptyMetrics(),
                source: endpoint.includes('/video/') ? 'facebook-video-oembed' : 'facebook-post-oembed'
            };
        }

        return null;
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

// ── Shared helpers ────────────────────────────────────────────────────

function safeInt(value: unknown): number | null {
    if (value === null || value === undefined) return null;
    const num = typeof value === 'number' ? value : Number(value);
    return Number.isFinite(num) ? Math.round(num) : null;
}

function parseCompactNumber(raw: string): number | null {
    const m = raw.trim().replace(/,/g, '').match(/^([\d]*\.?[\d]+)\s*([KMBkmb])?$/);
    if (!m) return null;
    const base = parseFloat(m[1]);
    if (!Number.isFinite(base)) return null;
    const suffix = m[2]?.toUpperCase();
    const mul = suffix === 'K' ? 1_000 : suffix === 'M' ? 1_000_000 : suffix === 'B' ? 1_000_000_000 : 1;
    return Math.round(base * mul);
}

// ── YouTube HTML scraping ─────────────────────────────────────────────
// YouTube hid exact like counts from public JSON fields (~2023).
// We scrape accessibility labels and factoid renderers instead.

export function extractYouTubeMetricsFromHtml(html: string): EnrichMetrics {
    const metrics = emptyMetrics();

    // Likes — accessibility text: "like this video along with 1,234 other people"
    const likeAccessMatch = html.match(
        /like this video along with ([\d][\d,. ]*) other people/i
    );
    if (likeAccessMatch) {
        metrics.likes = safeInt(likeAccessMatch[1].replace(/[,. ]/g, ''));
    }

    // Likes — "label":"1,234 likes" or "accessibilityText":"1,234 likes"
    if (metrics.likes === null) {
        const likeLabelMatch = html.match(
            /"(?:label|accessibilityText)"\s*:\s*"([\d][\d,. ]*?)\s+likes?"/i
        );
        if (likeLabelMatch) {
            metrics.likes = safeInt(likeLabelMatch[1].replace(/[, ]/g, ''));
        }
    }

    // Likes — factoidRenderer: {"value":{"simpleText":"1.2K"},...,"label":{"simpleText":"Likes"}}
    if (metrics.likes === null) {
        const factoidMatch = html.match(
            /"simpleText"\s*:\s*"([\d][\d,.KMBkmb ]*?)"\s*\}\s*,\s*"label"\s*:\s*\{\s*"simpleText"\s*:\s*"Likes"/i
        );
        if (factoidMatch) {
            metrics.likes = parseCompactNumber(factoidMatch[1]);
        }
    }

    // Comments — "commentCountText":{"simpleText":"1,234"}
    const commentMatch = html.match(
        /"commentCountText"\s*:\s*\{\s*"simpleText"\s*:\s*"([\d][\d,.KMBkmb ]*)/i
    ) ?? html.match(
        /"commentCount"\s*:\s*\{\s*"simpleText"\s*:\s*"([\d][\d,.KMBkmb ]*)/i
    );
    if (commentMatch) {
        metrics.comments = parseCompactNumber(commentMatch[1]);
    }

    return metrics;
}

// ── Facebook HTML scraping ────────────────────────────────────────────
// Facebook embeds metrics in relay store / inline data objects.

export function extractFacebookMetricsFromHtml(html: string): EnrichMetrics {
    const metrics = emptyMetrics();

    // Views
    const viewMatch = html.match(/"video_view_count"\s*:\s*(\d+)/i)
        ?? html.match(/"play_count"\s*:\s*(\d+)/i);
    if (viewMatch) metrics.views = safeInt(viewMatch[1]);

    // Reactions (≈ likes)
    const reactionMatch = html.match(/"reaction_count"\s*:\s*\{\s*"count"\s*:\s*(\d+)/i)
        ?? html.match(/"reactors"\s*:\s*\{\s*"count"\s*:\s*(\d+)/i);
    if (reactionMatch) metrics.likes = safeInt(reactionMatch[1]);

    // Comments
    const commentMatch = html.match(/"comment_count"\s*:\s*\{\s*"total_count"\s*:\s*(\d+)/i)
        ?? html.match(/"total_comment_count"\s*:\s*(\d+)/i)
        ?? html.match(/"comments"\s*:\s*\{\s*"total_count"\s*:\s*(\d+)/i);
    if (commentMatch) metrics.comments = safeInt(commentMatch[1]);

    // Shares
    const shareMatch = html.match(/"share_count"\s*:\s*\{\s*"count"\s*:\s*(\d+)/i)
        ?? html.match(/"reshares"\s*:\s*\{\s*"count"\s*:\s*(\d+)/i);
    if (shareMatch) metrics.shares = safeInt(shareMatch[1]);

    return metrics;
}

// ── TikTok Rehydration JSON scraping ──────────────────────────────────
// TikTok embeds metrics inside __UNIVERSAL_DATA_FOR_REHYDRATION__ or
// SIGI_STATE script blocks. This extracts them when available.

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
