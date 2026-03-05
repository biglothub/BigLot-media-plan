/**
 * Auto-snapshot: scrape per-platform metrics and save to monitoring_metric_snapshots.
 *
 * What can be scraped (no API key required):
 *   YouTube video  → view_count, like_count, comment_count
 *   TikTok video   → view_count, like_count, comment_count, share_count, save_count
 *   Facebook video → view_count, like_count, comment_count, share_count
 *   YouTube channel → view_count (sum from channel video list)
 *   TikTok/FB channel, Instagram (any) → not scrapeable, returns null metrics
 *
 * followers_count is ALWAYS manual — platforms do not expose it publicly.
 */

import type { SupportedPlatform } from '$lib/types';
import {
	extractYouTubeMetricsFromHtml,
	extractFacebookMetricsFromHtml,
	extractTikTokMetricsFromHtml
} from './platform-oembed';
import {
	normalizeYoutubeChannelVideosUrl,
	parseYoutubeVideosFromHtml
} from './youtube-channel';

const SCRAPE_TIMEOUT_MS = 15_000;
const SCRAPE_HEADERS = {
	'User-Agent':
		'Mozilla/5.0 (Macintosh; Intel Mac OS X 10_15_7) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/122.0 Safari/537.36',
	Accept: 'text/html,application/xhtml+xml,application/xml;q=0.9,*/*;q=0.8',
	'Accept-Language': 'en-US,en;q=0.5'
};

export interface ScrapedMetrics {
	view_count: number | null;
	like_count: number | null;
	comment_count: number | null;
	share_count: number | null;
	save_count: number | null;
}

export interface PlatformScrapeResult {
	platform_id: string;
	platform: SupportedPlatform;
	is_channel: boolean;
	scraped: boolean;
	/** Human-readable reason when scraped=false */
	skip_reason: string | null;
	metrics: ScrapedMetrics;
	/** For YouTube channels: videos synced to DB */
	videos_synced?: number;
}

const emptyMetrics = (): ScrapedMetrics => ({
	view_count: null,
	like_count: null,
	comment_count: null,
	share_count: null,
	save_count: null
});

async function fetchHtml(url: string, fetchFn: typeof fetch): Promise<string | null> {
	try {
		const controller = new AbortController();
		const timer = setTimeout(() => controller.abort(), SCRAPE_TIMEOUT_MS);
		const res = await fetchFn(url, { headers: SCRAPE_HEADERS, signal: controller.signal });
		clearTimeout(timer);
		if (!res.ok) return null;
		return await res.text();
	} catch {
		return null;
	}
}

function extractYouTubeViewCount(html: string): number | null {
	// "viewCount":"1234567" appears in ytInitialData.videoDetails
	const match = html.match(/"viewCount"\s*:\s*"(\d+)"/);
	return match ? parseInt(match[1], 10) : null;
}

/**
 * Scrape metrics for a YouTube channel page.
 * Also upserts the video list into monitoring_channel_videos via the provided upsert callback.
 */
export async function scrapeYouTubeChannel(
	platformId: string,
	channelUrl: string,
	fetchFn: typeof fetch,
	onVideos?: (videos: { video_id: string; view_count: number | null }[]) => Promise<void>
): Promise<PlatformScrapeResult> {
	const base = { platform_id: platformId, platform: 'youtube' as SupportedPlatform, is_channel: true };

	const videosPageUrl = normalizeYoutubeChannelVideosUrl(channelUrl);
	if (!videosPageUrl) {
		return { ...base, scraped: false, skip_reason: 'invalid-youtube-url', metrics: emptyMetrics() };
	}

	const html = await fetchHtml(videosPageUrl, fetchFn);
	if (!html) {
		return { ...base, scraped: false, skip_reason: 'fetch-failed', metrics: emptyMetrics() };
	}

	const videos = parseYoutubeVideosFromHtml(html);
	if (videos.length === 0) {
		return { ...base, scraped: false, skip_reason: 'no-videos-found', metrics: emptyMetrics() };
	}

	// Notify caller with parsed videos (for DB upsert)
	if (onVideos) {
		await onVideos(videos.map((v) => ({ video_id: v.video_id, view_count: v.view_count })));
	}

	// Total views = sum of all visible video view counts
	const totalViews = videos.reduce((sum, v) => sum + (v.view_count ?? 0), 0);

	return {
		...base,
		scraped: true,
		skip_reason: null,
		metrics: {
			view_count: totalViews > 0 ? totalViews : null,
			like_count: null,    // channel-level likes not available without API
			comment_count: null,
			share_count: null,
			save_count: null
		},
		videos_synced: videos.length
	};
}

/**
 * Scrape metrics for a single video/post URL.
 */
export async function scrapeVideoMetrics(
	platformId: string,
	platform: SupportedPlatform,
	url: string,
	fetchFn: typeof fetch
): Promise<PlatformScrapeResult> {
	const base = { platform_id: platformId, platform, is_channel: false };

	if (platform === 'instagram') {
		return { ...base, scraped: false, skip_reason: 'instagram-no-public-metrics', metrics: emptyMetrics() };
	}

	const html = await fetchHtml(url, fetchFn);
	if (!html) {
		return { ...base, scraped: false, skip_reason: 'fetch-failed', metrics: emptyMetrics() };
	}

	if (platform === 'youtube') {
		const m = extractYouTubeMetricsFromHtml(html);
		return {
			...base,
			scraped: true,
			skip_reason: null,
			metrics: {
				view_count: extractYouTubeViewCount(html),
				like_count: m.likes,
				comment_count: m.comments,
				share_count: null,
				save_count: null
			}
		};
	}

	if (platform === 'tiktok') {
		const m = extractTikTokMetricsFromHtml(html);
		const hasAny = m.views !== null || m.likes !== null || m.comments !== null;
		return {
			...base,
			scraped: hasAny,
			skip_reason: hasAny ? null : 'tiktok-parse-failed',
			metrics: {
				view_count: m.views,
				like_count: m.likes,
				comment_count: m.comments,
				share_count: m.shares,
				save_count: m.saves
			}
		};
	}

	if (platform === 'facebook') {
		const m = extractFacebookMetricsFromHtml(html);
		const hasAny = m.views !== null || m.likes !== null || m.comments !== null;
		return {
			...base,
			scraped: hasAny,
			skip_reason: hasAny ? null : 'facebook-parse-failed',
			metrics: {
				view_count: m.views,
				like_count: m.likes,
				comment_count: m.comments,
				share_count: m.shares,
				save_count: null
			}
		};
	}

	return { ...base, scraped: false, skip_reason: 'unsupported-platform', metrics: emptyMetrics() };
}
