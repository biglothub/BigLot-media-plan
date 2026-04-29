import { json } from '@sveltejs/kit';
import type { RequestHandler } from './$types';
import {
	getVideoCarouselProject,
	updateVideoCarouselProject,
	deleteVideoCarouselProject
} from '$lib/server/video-carousel-store';
import { assertJamendoAudioUrl } from '$lib/server/jamendo';
import type { CarouselFontPreset } from '$lib/types';
import {
	VIDEO_CAROUSEL_MUSIC_TRACK_BY_ID,
	type VideoCarouselMusicTrackId,
	type VideoCarouselMusicSource,
	type VideoCarouselStatus,
	type VideoCarouselTemplateType
} from '$lib/video-carousel';

function normalizeMusicTrackId(value: unknown): VideoCarouselMusicTrackId | null {
	if (typeof value === 'string' && value in VIDEO_CAROUSEL_MUSIC_TRACK_BY_ID) {
		return value as VideoCarouselMusicTrackId;
	}
	return null;
}

function normalizeMusicVolumePercent(value: unknown): number | null {
	const numberValue = typeof value === 'number' ? value : Number(value);
	if (!Number.isFinite(numberValue)) return null;
	return Math.min(Math.max(Math.round(numberValue), 0), 100);
}

function normalizeMusicSource(value: unknown): VideoCarouselMusicSource | null {
	if (value === 'generated' || value === 'jamendo') return value;
	return null;
}

function normalizeNullableString(value: unknown): string | null {
	return typeof value === 'string' && value.trim() ? value.trim() : null;
}

function normalizeNullableInteger(value: unknown): number | null {
	const numberValue = typeof value === 'number' ? value : Number(value);
	return Number.isFinite(numberValue) ? Math.max(0, Math.round(numberValue)) : null;
}

export const GET: RequestHandler = async ({ params }) => {
	try {
		const project = await getVideoCarouselProject(params.id);
		if (!project) return json({ error: 'Not found' }, { status: 404 });
		return json(project);
	} catch (error) {
		return json({ error: error instanceof Error ? error.message : String(error) }, { status: 500 });
	}
};

export const PATCH: RequestHandler = async ({ params, request }) => {
	try {
		const body = await request.json();
		const patch: Parameters<typeof updateVideoCarouselProject>[1] = {};
		if (typeof body.title === 'string') patch.title = body.title.trim();
		if (typeof body.status === 'string') patch.status = body.status as VideoCarouselStatus;
		if (typeof body.template_type === 'string') patch.template_type = body.template_type as VideoCarouselTemplateType;
		if (typeof body.font_preset === 'string') patch.font_preset = body.font_preset as CarouselFontPreset;
		const musicSource = normalizeMusicSource(body.music_source);
		if (musicSource === 'generated') {
			patch.music_source = 'generated';
			patch.music_external_id = null;
			patch.music_title = null;
			patch.music_artist_name = null;
			patch.music_audio_url = null;
			patch.music_page_url = null;
			patch.music_license_url = null;
			patch.music_attribution_text = null;
			patch.music_duration_seconds = null;
			patch.music_image_url = null;
		}
		if (musicSource === 'jamendo') {
			const rawMusic =
				body.external_music && typeof body.external_music === 'object'
					? (body.external_music as Record<string, unknown>)
					: (body as Record<string, unknown>);
			const externalId = normalizeNullableString(rawMusic.external_id ?? rawMusic.music_external_id);
			const title = normalizeNullableString(rawMusic.title ?? rawMusic.music_title);
			const artistName = normalizeNullableString(rawMusic.artist_name ?? rawMusic.music_artist_name);
			const audioUrl = normalizeNullableString(rawMusic.audio_url ?? rawMusic.music_audio_url);
			if (!externalId || !title || !artistName || !audioUrl) {
				return json({ error: 'Jamendo music requires id, title, artist, and audio_url' }, { status: 400 });
			}
			let safeAudioUrl: string;
			try {
				safeAudioUrl = assertJamendoAudioUrl(audioUrl);
			} catch (error) {
				return json({ error: error instanceof Error ? error.message : String(error) }, { status: 400 });
			}
			patch.music_source = 'jamendo';
			patch.music_track_id = 'none';
			patch.music_external_id = externalId;
			patch.music_title = title;
			patch.music_artist_name = artistName;
			patch.music_audio_url = safeAudioUrl;
			patch.music_page_url = normalizeNullableString(rawMusic.page_url ?? rawMusic.music_page_url);
			patch.music_license_url = normalizeNullableString(rawMusic.license_url ?? rawMusic.music_license_url);
			patch.music_attribution_text =
				normalizeNullableString(rawMusic.attribution_text ?? rawMusic.music_attribution_text) ??
				`${title} - ${artistName}`;
			patch.music_duration_seconds = normalizeNullableInteger(rawMusic.duration_seconds ?? rawMusic.music_duration_seconds);
			patch.music_image_url = normalizeNullableString(rawMusic.image_url ?? rawMusic.music_image_url);
		}
		const musicTrackId = normalizeMusicTrackId(body.music_track_id);
		if (musicTrackId && musicSource !== 'jamendo') patch.music_track_id = musicTrackId;
		const musicVolumePercent = normalizeMusicVolumePercent(body.music_volume_percent);
		if (musicVolumePercent !== null) patch.music_volume_percent = musicVolumePercent;
		const project = await updateVideoCarouselProject(params.id, patch);
		return json(project);
	} catch (error) {
		return json({ error: error instanceof Error ? error.message : String(error) }, { status: 500 });
	}
};

export const DELETE: RequestHandler = async ({ params }) => {
	try {
		await deleteVideoCarouselProject(params.id);
		return new Response(null, { status: 204 });
	} catch (error) {
		return json({ error: error instanceof Error ? error.message : String(error) }, { status: 500 });
	}
};
