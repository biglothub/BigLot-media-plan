/**
 * Shared YouTube channel page parsing utilities.
 * Used by both the channel videos sync endpoint and the auto-snapshot feature.
 */

export type YoutubeVideoItem = {
	video_id: string;
	video_url: string;
	title: string;
	thumbnail_url: string | null;
	published_label: string | null;
	view_label: string | null;
	view_count: number | null;
	duration_label: string | null;
	raw_json: Record<string, unknown>;
};

function readText(value: unknown): string | null {
	if (!value || typeof value !== 'object') return null;
	const node = value as Record<string, unknown>;
	if (typeof node.simpleText === 'string' && node.simpleText.trim()) {
		return node.simpleText.trim();
	}
	if (Array.isArray(node.runs)) {
		const merged = node.runs
			.map((run) =>
				run && typeof run === 'object' && typeof (run as Record<string, unknown>).text === 'string'
					? ((run as Record<string, unknown>).text as string)
					: ''
			)
			.join('')
			.trim();
		return merged || null;
	}
	return null;
}

function parseCount(text: string | null): number | null {
	if (!text) return null;
	const normalized = text.toLowerCase().replace(/,/g, '').replace(/\s+/g, ' ');
	const match = normalized.match(/([0-9]*\.?[0-9]+)\s*([kmb])?/i);
	if (!match) return null;
	const base = Number(match[1]);
	if (!Number.isFinite(base)) return null;
	const suffix = match[2]?.toLowerCase();
	const multiplier =
		suffix === 'k' ? 1_000 : suffix === 'm' ? 1_000_000 : suffix === 'b' ? 1_000_000_000 : 1;
	return Math.round(base * multiplier);
}

function pickBestThumbnail(value: unknown): string | null {
	if (!value || typeof value !== 'object') return null;
	const node = value as Record<string, unknown>;
	const thumbs = Array.isArray(node.thumbnails) ? node.thumbnails : [];
	const candidates = thumbs
		.filter((item): item is Record<string, unknown> => !!item && typeof item === 'object')
		.map((item) => ({
			url: typeof item.url === 'string' ? item.url : '',
			width: typeof item.width === 'number' ? item.width : 0
		}))
		.filter((item) => item.url);
	if (candidates.length === 0) return null;
	candidates.sort((a, b) => b.width - a.width);
	return candidates[0].url;
}

function extractBalancedJson(source: string, marker: string): string | null {
	const markerIndex = source.indexOf(marker);
	if (markerIndex < 0) return null;
	const start = source.indexOf('{', markerIndex + marker.length);
	if (start < 0) return null;

	let depth = 0;
	let inString = false;
	let escaped = false;

	for (let i = start; i < source.length; i++) {
		const char = source[i];
		if (inString) {
			if (escaped) {
				escaped = false;
			} else if (char === '\\') {
				escaped = true;
			} else if (char === '"') {
				inString = false;
			}
			continue;
		}
		if (char === '"') { inString = true; continue; }
		if (char === '{') depth += 1;
		if (char === '}') {
			depth -= 1;
			if (depth === 0) return source.slice(start, i + 1);
		}
	}
	return null;
}

function collectVideoRenderers(
	node: unknown,
	out: Record<string, unknown>[] = []
): Record<string, unknown>[] {
	if (Array.isArray(node)) {
		for (const item of node) collectVideoRenderers(item, out);
		return out;
	}
	if (!node || typeof node !== 'object') return out;
	const objectNode = node as Record<string, unknown>;
	if (objectNode.videoRenderer && typeof objectNode.videoRenderer === 'object') {
		out.push(objectNode.videoRenderer as Record<string, unknown>);
	}
	for (const value of Object.values(objectNode)) {
		collectVideoRenderers(value, out);
	}
	return out;
}

export function normalizeYoutubeChannelVideosUrl(raw: string): string | null {
	try {
		const parsed = new URL(raw);
		const host = parsed.hostname.toLowerCase();
		if (!host.includes('youtube.com')) return null;
		let path = parsed.pathname;
		if (path.startsWith('/@')) {
			const handle = path.split('/').filter(Boolean)[0];
			return `https://www.youtube.com/${handle}/videos`;
		}
		if (path.startsWith('/channel/') || path.startsWith('/c/') || path.startsWith('/user/')) {
			path = path.replace(/\/+$/, '');
			if (!path.endsWith('/videos')) path += '/videos';
			return `https://www.youtube.com${path}`;
		}
		return `https://www.youtube.com${path.replace(/\/+$/, '')}/videos`;
	} catch {
		return null;
	}
}

export function parseYoutubeVideosFromHtml(html: string): YoutubeVideoItem[] {
	const payloadJson =
		extractBalancedJson(html, 'var ytInitialData =') ??
		extractBalancedJson(html, 'window["ytInitialData"] =') ??
		extractBalancedJson(html, 'ytInitialData =');

	if (!payloadJson) return [];

	let payload: unknown;
	try {
		payload = JSON.parse(payloadJson);
	} catch {
		return [];
	}

	const renderers = collectVideoRenderers(payload);
	const dedup = new Map<string, YoutubeVideoItem>();

	for (const renderer of renderers) {
		const videoId = typeof renderer.videoId === 'string' ? renderer.videoId.trim() : '';
		if (!videoId) continue;

		const title = readText(renderer.title) ?? 'Untitled';
		const publishedLabel = readText(renderer.publishedTimeText);
		const viewLabel = readText(renderer.viewCountText);
		const durationLabel =
			readText(renderer.lengthText) ??
			readText((renderer.thumbnailOverlays as unknown[] | undefined)?.[0]);

		const video: YoutubeVideoItem = {
			video_id: videoId,
			video_url: `https://www.youtube.com/watch?v=${videoId}`,
			title,
			thumbnail_url: pickBestThumbnail(renderer.thumbnail),
			published_label: publishedLabel,
			view_label: viewLabel,
			view_count: parseCount(viewLabel),
			duration_label: durationLabel,
			raw_json: renderer
		};

		if (!dedup.has(videoId)) dedup.set(videoId, video);
	}

	return Array.from(dedup.values());
}
