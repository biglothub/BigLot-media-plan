import { env } from '$env/dynamic/private';
import {
	recommendVideoCarouselMusicTrack,
	type VideoCarouselExternalMusicTrack,
	type VideoCarouselMusicTrackId,
	type VideoCarouselTemplateType
} from '$lib/video-carousel';

const JAMENDO_TRACKS_URL = 'https://api.jamendo.com/v3.0/tracks/';
const JAMENDO_TIMEOUT_MS = 20_000;

type JsonRecord = Record<string, unknown>;

export const hasJamendoConfig = Boolean(env.JAMENDO_CLIENT_ID);

const TRACK_SEARCH_PROFILES: Record<Exclude<VideoCarouselMusicTrackId, 'none'>, {
	search: string;
	fuzzytags: string;
	speed: string;
}> = {
	biglot_pulse: {
		search: 'upbeat electronic corporate instrumental',
		fuzzytags: 'electronic corporate upbeat',
		speed: 'medium high'
	},
	market_lofi: {
		search: 'lofi chillhop instrumental',
		fuzzytags: 'chillout lofi instrumental',
		speed: 'low medium'
	},
	calm_focus: {
		search: 'ambient cinematic piano instrumental',
		fuzzytags: 'ambient piano cinematic',
		speed: 'verylow low'
	}
};

function jamendoClientId(): string {
	if (!env.JAMENDO_CLIENT_ID) {
		throw new Error('JAMENDO_CLIENT_ID is required');
	}
	return env.JAMENDO_CLIENT_ID;
}

function toStringValue(value: unknown): string | null {
	if (typeof value !== 'string') return null;
	const trimmed = value.trim();
	return trimmed ? trimmed : null;
}

function toNumberValue(value: unknown): number | null {
	const numberValue = typeof value === 'number' ? value : Number(value);
	return Number.isFinite(numberValue) ? Math.max(0, Math.round(numberValue)) : null;
}

function collectTags(value: unknown, out = new Set<string>()): Set<string> {
	if (typeof value === 'string' && value.trim()) {
		out.add(value.trim());
		return out;
	}

	if (Array.isArray(value)) {
		for (const item of value) collectTags(item, out);
		return out;
	}

	if (value && typeof value === 'object') {
		for (const item of Object.values(value as JsonRecord)) collectTags(item, out);
	}

	return out;
}

function isCommercialFriendlyCreativeCommons(licenseUrl: string | null): boolean {
	if (!licenseUrl) return false;
	try {
		const url = new URL(licenseUrl);
		const pathParts = url.pathname.toLowerCase().split('/').filter(Boolean);
		const code = pathParts[0] === 'licenses' ? pathParts[1] : pathParts.join('-');
		return code === 'by' || code === 'by-sa' || pathParts.includes('zero');
	} catch {
		const normalized = licenseUrl.toLowerCase();
		return normalized.includes('/licenses/by/') || normalized.includes('/licenses/by-sa/');
	}
}

function normalizeJamendoTrack(item: JsonRecord): VideoCarouselExternalMusicTrack | null {
	const externalId = toStringValue(item.id);
	const title = toStringValue(item.name);
	const artistName = toStringValue(item.artist_name);
	const audioUrl = toStringValue(item.audiodownload) ?? toStringValue(item.audio);
	const licenseUrl = toStringValue(item.license_ccurl);
	const downloadAllowed = item.audiodownload_allowed !== false;

	if (!externalId || !title || !artistName || !audioUrl || !downloadAllowed) return null;
	if (!isCommercialFriendlyCreativeCommons(licenseUrl)) return null;

	const pageUrl = toStringValue(item.shareurl) ?? toStringValue(item.shorturl);
	const durationSeconds = toNumberValue(item.duration);
	const imageUrl = toStringValue(item.image) ?? toStringValue(item.album_image);
	const tags = [...collectTags((item.musicinfo as JsonRecord | undefined)?.tags)]
		.map((tag) => tag.toLowerCase())
		.slice(0, 16);

	return {
		source: 'jamendo',
		external_id: externalId,
		title,
		artist_name: artistName,
		audio_url: audioUrl,
		page_url: pageUrl,
		license_url: licenseUrl,
		attribution_text: `${title} - ${artistName}${licenseUrl ? ` (${licenseUrl})` : ''}`,
		duration_seconds: durationSeconds,
		image_url: imageUrl,
		tags
	};
}

function buildSearchProfile(input: {
	query?: string | null;
	templateType: VideoCarouselTemplateType;
	topic?: string | null;
}): {
	search: string;
	fuzzytags: string;
	speed: string;
	trackId: Exclude<VideoCarouselMusicTrackId, 'none'>;
} {
	const trackId = recommendVideoCarouselMusicTrack({
		template_type: input.templateType,
		topic: input.topic ?? input.query ?? null
	});
	const profile = TRACK_SEARCH_PROFILES[trackId];
	const customQuery = input.query?.trim();
	return {
		...profile,
		search: customQuery ? `${customQuery} ${profile.search}` : profile.search,
		trackId
	};
}

async function jamendoFetch(params: URLSearchParams): Promise<JsonRecord> {
	const controller = new AbortController();
	const timer = setTimeout(() => controller.abort(), JAMENDO_TIMEOUT_MS);

	try {
		const response = await fetch(`${JAMENDO_TRACKS_URL}?${params.toString()}`, {
			headers: { Accept: 'application/json' },
			signal: controller.signal
		});

		if (!response.ok) {
			const message = await response.text();
			throw new Error(`Jamendo API error ${response.status}: ${message}`);
		}

		const payload = (await response.json()) as JsonRecord;
		const headers = payload.headers as JsonRecord | undefined;
		if (headers?.status === 'failed') {
			throw new Error(toStringValue(headers.error_message) ?? 'Jamendo API returned an error');
		}

		return payload;
	} catch (error) {
		if ((error as Error).name === 'AbortError') {
			throw new Error('Jamendo request timed out');
		}
		throw error;
	} finally {
		clearTimeout(timer);
	}
}

export async function searchJamendoMusic(input: {
	query?: string | null;
	templateType: VideoCarouselTemplateType;
	topic?: string | null;
	limit?: number;
}): Promise<{
	tracks: VideoCarouselExternalMusicTrack[];
	query: string;
	recommended_track_id: Exclude<VideoCarouselMusicTrackId, 'none'>;
}> {
	const profile = buildSearchProfile(input);
	const limit = Math.min(Math.max(Math.round(input.limit ?? 8), 1), 20);
	const params = new URLSearchParams({
		client_id: jamendoClientId(),
		format: 'json',
		limit: String(Math.min(limit * 3, 60)),
		audioformat: 'mp32',
		audiodlformat: 'mp32',
		imagesize: '300',
		include: 'musicinfo',
		groupby: 'artist_id',
		content_id_free: 'true',
		vocalinstrumental: 'instrumental',
		search: profile.search,
		fuzzytags: profile.fuzzytags,
		speed: profile.speed,
		boost: 'popularity_month'
	});

	const payload = await jamendoFetch(params);
	const results = Array.isArray(payload.results) ? (payload.results as JsonRecord[]) : [];
	const tracks = results
		.map(normalizeJamendoTrack)
		.filter((track): track is VideoCarouselExternalMusicTrack => track !== null)
		.slice(0, limit);

	return {
		tracks,
		query: profile.search,
		recommended_track_id: profile.trackId
	};
}

export async function pickJamendoMusic(input: {
	query?: string | null;
	templateType: VideoCarouselTemplateType;
	topic?: string | null;
}): Promise<VideoCarouselExternalMusicTrack | null> {
	const result = await searchJamendoMusic({ ...input, limit: 1 });
	return result.tracks[0] ?? null;
}

export function assertJamendoAudioUrl(value: string): string {
	const url = new URL(value);
	if (url.protocol !== 'https:') throw new Error('Only HTTPS Jamendo audio URLs are allowed');
	if (url.hostname !== 'storage.jamendo.com' && !url.hostname.endsWith('.storage.jamendo.com')) {
		throw new Error('Only Jamendo audio URLs are allowed');
	}
	return url.toString();
}
