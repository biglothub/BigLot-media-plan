import { json } from '@sveltejs/kit';
import type { RequestHandler } from './$types';
import { listVideoCarouselProjectItems, createVideoCarouselProject } from '$lib/server/video-carousel-store';
import { assertJamendoAudioUrl } from '$lib/server/jamendo';
import type { CarouselFontPreset } from '$lib/types';
import {
	VIDEO_CAROUSEL_DEFAULT_MUSIC_VOLUME_PERCENT,
	VIDEO_CAROUSEL_MUSIC_TRACK_BY_ID,
	recommendVideoCarouselMusicTrack,
	type VideoCarouselExternalMusicTrack,
	type VideoCarouselMusicTrackId,
	type VideoCarouselMusicSource,
	type VideoCarouselTemplateType
} from '$lib/video-carousel';

function normalizeMusicTrackId(
	value: unknown,
	templateType: VideoCarouselTemplateType,
	topic: string
): VideoCarouselMusicTrackId {
	if (value === undefined || value === null || value === 'auto') {
		return recommendVideoCarouselMusicTrack({ template_type: templateType, topic });
	}
	if (typeof value === 'string' && value in VIDEO_CAROUSEL_MUSIC_TRACK_BY_ID) {
		return value as VideoCarouselMusicTrackId;
	}
	return recommendVideoCarouselMusicTrack({ template_type: templateType, topic });
}

function normalizeMusicVolumePercent(value: unknown): number {
	const numberValue = typeof value === 'number' ? value : Number(value);
	if (!Number.isFinite(numberValue)) return VIDEO_CAROUSEL_DEFAULT_MUSIC_VOLUME_PERCENT;
	return Math.min(Math.max(Math.round(numberValue), 0), 100);
}

function normalizeExternalMusic(value: unknown): VideoCarouselExternalMusicTrack | null {
	if (!value || typeof value !== 'object') return null;
	const raw = value as Record<string, unknown>;
	if (
		raw.source !== 'jamendo' ||
		typeof raw.external_id !== 'string' ||
		!raw.external_id.trim() ||
		typeof raw.title !== 'string' ||
		!raw.title.trim() ||
		typeof raw.artist_name !== 'string' ||
		!raw.artist_name.trim() ||
		typeof raw.audio_url !== 'string' ||
		!raw.audio_url.trim()
	) {
		return null;
	}
	let audioUrl: string;
	try {
		audioUrl = assertJamendoAudioUrl(raw.audio_url.trim());
	} catch {
		return null;
	}
	return {
		source: 'jamendo',
		external_id: raw.external_id.trim(),
		title: raw.title.trim(),
		artist_name: raw.artist_name.trim(),
		audio_url: audioUrl,
		page_url: typeof raw.page_url === 'string' && raw.page_url.trim() ? raw.page_url.trim() : null,
		license_url: typeof raw.license_url === 'string' && raw.license_url.trim() ? raw.license_url.trim() : null,
		attribution_text:
			typeof raw.attribution_text === 'string' && raw.attribution_text.trim()
				? raw.attribution_text.trim()
				: `${raw.title.trim()} - ${raw.artist_name.trim()}`,
		duration_seconds:
			typeof raw.duration_seconds === 'number' && Number.isFinite(raw.duration_seconds)
				? Math.max(0, Math.round(raw.duration_seconds))
				: null,
		image_url: typeof raw.image_url === 'string' && raw.image_url.trim() ? raw.image_url.trim() : null,
		tags: Array.isArray(raw.tags) ? raw.tags.filter((tag): tag is string => typeof tag === 'string') : []
	};
}

export const GET: RequestHandler = async () => {
	try {
		const projects = await listVideoCarouselProjectItems();
		return json(projects);
	} catch (error) {
		return json({ error: error instanceof Error ? error.message : String(error) }, { status: 500 });
	}
};

export const POST: RequestHandler = async ({ request }) => {
	try {
		const body = await request.json();
		const title = typeof body.title === 'string' ? body.title.trim() : '';
		if (!title) return json({ error: 'title is required' }, { status: 400 });
		const templateType: VideoCarouselTemplateType =
			body.template_type === 'quote' ||
			body.template_type === 'listicle' ||
			body.template_type === 'stat'
				? body.template_type
				: 'quiz';
		const musicSource: VideoCarouselMusicSource = body.music_source === 'jamendo' ? 'jamendo' : 'generated';
		const externalMusic = normalizeExternalMusic(body.external_music);
		if (musicSource === 'jamendo' && !externalMusic) {
			return json({ error: 'external_music is required for Jamendo music' }, { status: 400 });
		}
		const project = await createVideoCarouselProject({
			title,
			template_type: templateType,
			font_preset: (body.font_preset as CarouselFontPreset) ?? 'biglot',
			music_track_id: normalizeMusicTrackId(body.music_track_id, templateType, title),
			music_source: musicSource,
			external_music: externalMusic,
			music_volume_percent: normalizeMusicVolumePercent(body.music_volume_percent)
		});
		return json(project, { status: 201 });
	} catch (error) {
		return json({ error: error instanceof Error ? error.message : String(error) }, { status: 500 });
	}
};
