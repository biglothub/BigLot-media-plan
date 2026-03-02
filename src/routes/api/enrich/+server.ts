import { json } from '@sveltejs/kit';
import type { RequestHandler } from './$types';
import type { EnrichMetrics, EnrichResult, SupportedPlatform } from '$lib/types';
import {
	fetchYouTubeOEmbed,
	fetchFacebookOEmbed,
	fetchTikTokOEmbed,
	extractTikTokMetricsFromHtml,
	type OEmbedResult
} from '$lib/server/platform-oembed';

const SUPPORTED_HOSTS: Record<SupportedPlatform, string[]> = {
	youtube: ['youtube.com', 'www.youtube.com', 'm.youtube.com', 'youtu.be'],
	facebook: ['facebook.com', 'www.facebook.com', 'm.facebook.com', 'fb.watch'],
	instagram: ['instagram.com', 'www.instagram.com'],
	tiktok: ['tiktok.com', 'www.tiktok.com', 'm.tiktok.com', 'vm.tiktok.com']
};

function detectPlatform(hostname: string): SupportedPlatform | null {
	for (const [platform, hosts] of Object.entries(SUPPORTED_HOSTS) as Array<
		[SupportedPlatform, string[]]
	>) {
		if (hosts.includes(hostname)) {
			return platform;
		}
	}

	return null;
}

function normalizeCount(value: unknown): number | null {
	if (value === null || value === undefined) return null;
	if (typeof value === 'number' && Number.isFinite(value)) return Math.round(value);

	const raw = String(value).trim();
	if (!raw) return null;

	const compact = raw
		.toLowerCase()
		.replace(/\s+/g, '')
		.replace(/,/g, '')
		.replace(/_/g, '');
	const compactMatch = compact.match(/^([0-9]*\.?[0-9]+)([kmb])?$/i);
	if (compactMatch) {
		const base = Number(compactMatch[1]);
		if (!Number.isFinite(base)) return null;

		const suffix = compactMatch[2]?.toLowerCase();
		const multiplier = suffix === 'k' ? 1_000 : suffix === 'm' ? 1_000_000 : suffix === 'b' ? 1_000_000_000 : 1;
		return Math.round(base * multiplier);
	}

	const cleaned = raw.replace(/[^0-9]/g, '');
	if (!cleaned) return null;

	const parsed = Number(cleaned);
	return Number.isFinite(parsed) ? Math.round(parsed) : null;
}

function decodeEntities(input: string): string {
	return input
		.replace(/&amp;/g, '&')
		.replace(/&quot;/g, '"')
		.replace(/&#39;/g, "'")
		.replace(/&lt;/g, '<')
		.replace(/&gt;/g, '>');
}

function decodeUnicodeEscapes(input: string): string {
	return input.replace(/\\u([0-9a-fA-F]{4})/g, (_match, hex) =>
		String.fromCharCode(Number.parseInt(hex, 16))
	);
}

function extractMetaContent(html: string, key: string): string | null {
	const escapedKey = key.replace(/[.*+?^${}()|[\]\\]/g, '\\$&');
	const tagPattern = new RegExp(
		`<meta[^>]*(?:property|name)=["']${escapedKey}["'][^>]*>`,
		'i'
	);
	const tag = html.match(tagPattern)?.[0];
	if (!tag) return null;

	const content = tag.match(/content=["']([^"']*)["']/i)?.[1];
	return content ? decodeEntities(content.trim()) : null;
}

function extractFirstByRegex(html: string, patterns: RegExp[]): number | null {
	for (const pattern of patterns) {
		const matched = html.match(pattern)?.[1];
		const normalized = normalizeCount(matched);
		if (normalized !== null) return normalized;
	}

	return null;
}

function toArray<T>(value: T | T[] | null | undefined): T[] {
	if (value === null || value === undefined) return [];
	return Array.isArray(value) ? value : [value];
}

function collectJsonLdObjects(value: unknown): Record<string, unknown>[] {
	const items: Record<string, unknown>[] = [];

	const walk = (node: unknown) => {
		if (Array.isArray(node)) {
			for (const item of node) walk(item);
			return;
		}

		if (node && typeof node === 'object') {
			const objectNode = node as Record<string, unknown>;
			items.push(objectNode);
			for (const nested of Object.values(objectNode)) walk(nested);
		}
	};

	walk(value);
	return items;
}

function extractInteractionMetrics(videoNode: Record<string, unknown>): EnrichMetrics {
	const metrics: EnrichMetrics = {
		views: null,
		likes: null,
		comments: null,
		shares: null,
		saves: null
	};

	for (const interaction of toArray(videoNode.interactionStatistic)) {
		if (!interaction || typeof interaction !== 'object') continue;

		const stat = interaction as Record<string, unknown>;
		const count = normalizeCount(stat.userInteractionCount ?? stat.count);
		if (count === null) continue;

		const interactionType = stat.interactionType;
		const interactionName =
			typeof interactionType === 'string'
				? interactionType
				: typeof interactionType === 'object' && interactionType
					? String(
						(interactionType as Record<string, unknown>).name ??
						(interactionType as Record<string, unknown>)['@type'] ??
						''
					).toLowerCase()
					: '';

		if (/comment/.test(interactionName)) metrics.comments = count;
		if (/like|favorite/.test(interactionName)) metrics.likes = count;
		if (/watch|view|play/.test(interactionName)) metrics.views = count;
		if (/share/.test(interactionName)) metrics.shares = count;
		if (/save|bookmark|collect/.test(interactionName)) metrics.saves = count;
	}

	return metrics;
}

function mergeMetrics(primary: EnrichMetrics, fallback: EnrichMetrics): EnrichMetrics {
	return {
		views: primary.views ?? fallback.views,
		likes: primary.likes ?? fallback.likes,
		comments: primary.comments ?? fallback.comments,
		shares: primary.shares ?? fallback.shares,
		saves: primary.saves ?? fallback.saves
	};
}

function hasAnyMetricValue(metrics: EnrichMetrics): boolean {
	return Object.values(metrics).some((value) => typeof value === 'number' && Number.isFinite(value));
}

function extractMetricsFromDescription(description: string | null): EnrichMetrics {
	const metrics: EnrichMetrics = {
		views: null,
		likes: null,
		comments: null,
		shares: null,
		saves: null
	};
	if (!description) return metrics;

	const normalized = description.replace(/\u00a0/g, ' ').toLowerCase();
	const readByPattern = (patterns: RegExp[]): number | null => {
		for (const pattern of patterns) {
			const matched = normalized.match(pattern)?.[1];
			const parsed = normalizeCount(matched);
			if (parsed !== null) return parsed;
		}
		return null;
	};

	metrics.likes = readByPattern([
		/([0-9][0-9.,kmb]*)\s*(?:likes?|ถูกใจ|คนถูกใจ)/i,
		/(?:likes?|ถูกใจ|คนถูกใจ)\s*([0-9][0-9.,kmb]*)/i
	]);
	metrics.comments = readByPattern([
		/([0-9][0-9.,kmb]*)\s*(?:comments?|ความคิดเห็น)/i,
		/(?:comments?|ความคิดเห็น)\s*([0-9][0-9.,kmb]*)/i
	]);
	metrics.views = readByPattern([
		/([0-9][0-9.,kmb]*)\s*(?:views?|plays?|การเล่น|ครั้งรับชม|ยอดดู)/i,
		/(?:views?|plays?|การเล่น|ครั้งรับชม|ยอดดู)\s*([0-9][0-9.,kmb]*)/i
	]);
	metrics.shares = readByPattern([
		/([0-9][0-9.,kmb]*)\s*(?:shares?|แชร์)/i,
		/(?:shares?|แชร์)\s*([0-9][0-9.,kmb]*)/i
	]);
	metrics.saves = readByPattern([
		/([0-9][0-9.,kmb]*)\s*(?:saves?|บันทึก)/i,
		/(?:saves?|บันทึก)\s*([0-9][0-9.,kmb]*)/i
	]);

	return metrics;
}

async function fetchInstagramOEmbed(
	targetUrl: string,
	fetchFn: typeof fetch
): Promise<{ title: string | null; authorName: string | null; thumbnailUrl: string | null }> {
	try {
		const endpoint = `https://www.instagram.com/api/v1/oembed/?url=${encodeURIComponent(targetUrl)}`;
		const response = await fetchFn(endpoint, {
			headers: {
				'User-Agent':
					'Mozilla/5.0 (Macintosh; Intel Mac OS X 10_15_7) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/122.0 Safari/537.36',
				Accept: 'application/json,text/plain,*/*',
				'Accept-Language': 'en-US,en;q=0.9'
			}
		});
		if (!response.ok) {
			return { title: null, authorName: null, thumbnailUrl: null };
		}

		const payload = (await response.json()) as Record<string, unknown>;
		const title = typeof payload.title === 'string' ? payload.title.trim() : '';
		const authorName = typeof payload.author_name === 'string' ? payload.author_name.trim() : '';
		const thumbnailUrl =
			typeof payload.thumbnail_url === 'string' ? payload.thumbnail_url.trim() : '';

		return {
			title: title || null,
			authorName: authorName || null,
			thumbnailUrl: thumbnailUrl || null
		};
	} catch {
		return { title: null, authorName: null, thumbnailUrl: null };
	}
}

export const GET: RequestHandler = async ({ url, fetch }) => {
	const rawUrl = url.searchParams.get('url')?.trim();
	if (!rawUrl) {
		return json({ error: 'Missing url query parameter.' }, { status: 400 });
	}

	let target: URL;
	try {
		target = new URL(rawUrl);
	} catch {
		return json({ error: 'Invalid URL.' }, { status: 400 });
	}

	if (!['http:', 'https:'].includes(target.protocol)) {
		return json({ error: 'Only http/https URLs are supported.' }, { status: 400 });
	}

	const platform = detectPlatform(target.hostname.toLowerCase());
	if (!platform) {
		return json(
			{ error: 'Platform not supported. Use YouTube, Facebook, Instagram, or TikTok.' },
			{ status: 400 }
		);
	}

	const controller = new AbortController();
	const timeout = setTimeout(() => controller.abort(), 15000);

	let html = '';
	let resolvedUrl = target.toString();
	try {
		const response = await fetch(target.toString(), {
			headers: {
				'User-Agent':
					'Mozilla/5.0 (Macintosh; Intel Mac OS X 10_15_7) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/122.0 Safari/537.36',
				Accept: 'text/html,application/xhtml+xml,application/xml;q=0.9,*/*;q=0.8',
				'Accept-Language': 'en-US,en;q=0.9'
			},
			signal: controller.signal
		});

		if (!response.ok) {
			return json(
				{
					error: `Failed to fetch the video page (${response.status}). Some platforms block automated metadata requests.`
				},
				{ status: 502 }
			);
		}

		resolvedUrl = response.url || target.toString();
		html = await response.text();
	} catch {
		return json(
			{
				error:
					'Could not read metadata from that URL. The post may be private, geo-blocked, or protected.'
			},
			{ status: 502 }
		);
	} finally {
		clearTimeout(timeout);
	}

	const instagramOEmbed =
		platform === 'instagram'
			? await fetchInstagramOEmbed(resolvedUrl || target.toString(), fetch)
			: { title: null, authorName: null, thumbnailUrl: null };

	// ── oEmbed calls (free, no API key) ──────────────────────────────
	let oEmbedResult: OEmbedResult | null = null;
	const oEmbedTarget = resolvedUrl || target.toString();
	if (platform === 'youtube') {
		oEmbedResult = await fetchYouTubeOEmbed(oEmbedTarget, fetch);
	} else if (platform === 'facebook') {
		oEmbedResult = await fetchFacebookOEmbed(oEmbedTarget, fetch);
	} else if (platform === 'tiktok') {
		oEmbedResult = await fetchTikTokOEmbed(oEmbedTarget, fetch);
	}

	// ── TikTok rehydration metrics ──────────────────────────────────
	const tiktokRehydrationMetrics: EnrichMetrics =
		platform === 'tiktok' ? extractTikTokMetricsFromHtml(html) : {
			views: null, likes: null, comments: null, shares: null, saves: null
		};

	let jsonLdSource: Record<string, unknown> | null = null;
	const jsonLdMatches = html.matchAll(
		/<script[^>]*type=["']application\/ld\+json["'][^>]*>([\s\S]*?)<\/script>/gi
	);

	for (const match of jsonLdMatches) {
		const scriptBody = decodeEntities(match[1]?.trim() ?? '');
		if (!scriptBody) continue;

		try {
			const parsed = JSON.parse(scriptBody);
			const nodes = collectJsonLdObjects(parsed);
			const videoNode = nodes.find((node) => {
				const typeField = String(node['@type'] ?? '').toLowerCase();
				return typeField.includes('videoobject') || typeField.includes('video');
			});
			if (videoNode) {
				jsonLdSource = videoNode;
				break;
			}
		} catch {
			// Ignore broken JSON-LD blocks and continue.
		}
	}

	const metricsHtml = decodeUnicodeEscapes(html);
	const regexMetrics: EnrichMetrics = {
		views: extractFirstByRegex(metricsHtml, [
			/"viewCount":"?([0-9.,kmb]+)"/i,
			/\\"viewCount\\":\\"?([0-9.,kmb]+)\\"?/i,
			/"playCount":\s*"?([0-9.,kmb]+)"?/i,
			/\\"playCount\\":\s*\\"?([0-9.,kmb]+)\\"?/i,
			/"video_view_count":\s*"?([0-9.,kmb]+)"?/i,
			/\\"video_view_count\\":\s*\\"?([0-9.,kmb]+)\\"?/i,
			/"video_play_count":\s*"?([0-9.,kmb]+)"?/i,
			/\\"video_play_count\\":\s*\\"?([0-9.,kmb]+)\\"?/i
		]),
		likes: extractFirstByRegex(metricsHtml, [
			/"likeCount":\s*"?([0-9.,kmb]+)"?/i,
			/\\"likeCount\\":\s*\\"?([0-9.,kmb]+)\\"?/i,
			/"diggCount":\s*"?([0-9.,kmb]+)"?/i,
			/\\"diggCount\\":\s*\\"?([0-9.,kmb]+)\\"?/i,
			/"edge_media_preview_like"\s*:\s*\{"count"\s*:\s*([0-9.,kmb]+)/i,
			/\\"edge_media_preview_like\\":\s*\{\\"count\\":\s*([0-9.,kmb]+)/i
		]),
		comments: extractFirstByRegex(metricsHtml, [
			/"commentCount":\s*"?([0-9.,kmb]+)"?/i,
			/\\"commentCount\\":\s*\\"?([0-9.,kmb]+)\\"?/i,
			/"comment_count":\s*"?([0-9.,kmb]+)"?/i,
			/\\"comment_count\\":\s*\\"?([0-9.,kmb]+)\\"?/i,
			/"edge_media_to_comment"\s*:\s*\{"count"\s*:\s*([0-9.,kmb]+)/i,
			/\\"edge_media_to_comment\\":\s*\{\\"count\\":\s*([0-9.,kmb]+)/i,
			/"edge_media_to_parent_comment"\s*:\s*\{"count"\s*:\s*([0-9.,kmb]+)/i,
			/\\"edge_media_to_parent_comment\\":\s*\{\\"count\\":\s*([0-9.,kmb]+)/i
		]),
		shares: extractFirstByRegex(metricsHtml, [
			/"shareCount":\s*"?([0-9.,kmb]+)"?/i,
			/\\"shareCount\\":\s*\\"?([0-9.,kmb]+)\\"?/i
		]),
		saves: extractFirstByRegex(metricsHtml, [
			/"saveCount":\s*"?([0-9.,kmb]+)"?/i,
			/\\"saveCount\\":\s*\\"?([0-9.,kmb]+)\\"?/i,
			/"collectCount":\s*"?([0-9.,kmb]+)"?/i,
			/\\"collectCount\\":\s*\\"?([0-9.,kmb]+)\\"?/i
		])
	};

	const pageDescriptionMetrics = extractMetricsFromDescription(
		extractMetaContent(metricsHtml, 'og:description') ?? extractMetaContent(metricsHtml, 'description')
	);
	const oEmbedTitleMetrics = extractMetricsFromDescription(instagramOEmbed.title);
	const jsonLdMetrics = jsonLdSource ? extractInteractionMetrics(jsonLdSource) : regexMetrics;
	const metrics = mergeMetrics(
		mergeMetrics(
			mergeMetrics(
				mergeMetrics(jsonLdMetrics, regexMetrics),
				pageDescriptionMetrics
			),
			oEmbedTitleMetrics
		),
		tiktokRehydrationMetrics
	);
	const fallbackUsed =
		(jsonLdMetrics.views === null && regexMetrics.views !== null) ||
		(jsonLdMetrics.likes === null && regexMetrics.likes !== null) ||
		(jsonLdMetrics.comments === null && regexMetrics.comments !== null) ||
		(jsonLdMetrics.shares === null && regexMetrics.shares !== null) ||
		(jsonLdMetrics.saves === null && regexMetrics.saves !== null);
	const hasMetaTags = resultHasAnyMetaValue(html);
	const extractedTitle =
		(jsonLdSource?.name as string | undefined) ??
		(jsonLdSource?.headline as string | undefined) ??
		extractMetaContent(metricsHtml, 'og:title') ??
		extractMetaContent(metricsHtml, 'twitter:title');
	const extractedDescription =
		(jsonLdSource?.description as string | undefined) ??
		extractMetaContent(metricsHtml, 'og:description') ??
		extractMetaContent(metricsHtml, 'description') ??
		extractMetaContent(metricsHtml, 'twitter:description');

	const normalizedTitle = extractedTitle?.trim() || null;
	const normalizedDescription = extractedDescription?.trim() || null;
	const resolvedTitle =
		platform === 'instagram'
			? normalizedTitle ?? instagramOEmbed.title ?? normalizedDescription
			: normalizedTitle ?? oEmbedResult?.title ?? null;

	const result: EnrichResult = {
		url: resolvedUrl,
		platform,
		title: resolvedTitle,
		description: normalizedDescription,
		authorName:
			(typeof jsonLdSource?.author === 'object' && jsonLdSource.author
				? ((jsonLdSource.author as Record<string, unknown>).name as string | undefined)
				: null) ??
			instagramOEmbed.authorName ??
			oEmbedResult?.authorName ??
			extractMetaContent(html, 'author') ??
			extractMetaContent(html, 'og:site_name'),
		thumbnailUrl:
			(typeof jsonLdSource?.thumbnailUrl === 'string'
				? (jsonLdSource.thumbnailUrl as string)
				: Array.isArray(jsonLdSource?.thumbnailUrl)
					? (jsonLdSource.thumbnailUrl[0] as string | undefined)
					: undefined) ??
			instagramOEmbed.thumbnailUrl ??
			oEmbedResult?.thumbnailUrl ??
			extractMetaContent(metricsHtml, 'og:image') ??
			extractMetaContent(metricsHtml, 'twitter:image'),
		publishedAt:
			(jsonLdSource?.uploadDate as string | undefined) ??
			(jsonLdSource?.datePublished as string | undefined) ??
			extractMetaContent(metricsHtml, 'article:published_time'),
		metrics,
		source: [
			jsonLdSource ? 'json-ld' : null,
			hasMetaTags ? 'meta-tags' : null,
			fallbackUsed ? 'regex-fallback' : null,
			platform === 'instagram' && hasAnyMetricValue(oEmbedTitleMetrics) ? 'instagram-oembed' : null,
			oEmbedResult ? oEmbedResult.source : null,
			platform === 'tiktok' && hasAnyMetricValue(tiktokRehydrationMetrics) ? 'tiktok-rehydration' : null
		].filter((value, index, self): value is string => value !== null && self.indexOf(value) === index)
	};

	return json(result, {
		headers: {
			'Cache-Control': 'no-store'
		}
	});
};

function resultHasAnyMetaValue(html: string): boolean {
	return Boolean(
		extractMetaContent(html, 'og:title') ||
		extractMetaContent(html, 'og:description') ||
		extractMetaContent(html, 'og:image')
	);
}
