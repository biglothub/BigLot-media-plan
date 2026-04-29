import { json } from '@sveltejs/kit';
import type { RequestHandler } from './$types';
import { generateVideoScript } from '$lib/server/video-ai';
import { searchPexelsVideos, pickBestVideoFile } from '$lib/server/pexels';
import { assertJamendoAudioUrl } from '$lib/server/jamendo';
import {
	createVideoCarouselProject,
	upsertVideoCarouselSlides
} from '$lib/server/video-carousel-store';
import type { CarouselFontPreset } from '$lib/types';
import {
	VIDEO_CAROUSEL_DEFAULT_MUSIC_VOLUME_PERCENT,
	VIDEO_CAROUSEL_MUSIC_TRACK_BY_ID,
	recommendVideoCarouselMusicTrack,
	type VideoCarouselExternalMusicTrack,
	type VideoCarouselMusicTrackId,
	type VideoCarouselMusicSource,
	type VideoCarouselTemplateType,
	type VideoTextPosition
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

export const POST: RequestHandler = async ({ request }) => {
	try {
		const body = await request.json();
		const topic = typeof body.topic === 'string' ? body.topic.trim() : '';
		if (!topic) return json({ error: 'topic is required' }, { status: 400 });

		const clipCount = typeof body.clip_count === 'number' ? body.clip_count : 5;
		const durationSeconds = typeof body.duration_seconds === 'number' ? body.duration_seconds : 10;
		const fontPreset: CarouselFontPreset =
			typeof body.font_preset === 'string' ? (body.font_preset as CarouselFontPreset) : 'biglot';
		const musicVolumePercent = normalizeMusicVolumePercent(body.music_volume_percent);
		const templateType: VideoCarouselTemplateType =
			body.template_type === 'quote' ||
			body.template_type === 'listicle' ||
			body.template_type === 'stat'
				? body.template_type
				: 'quiz';
		const musicTrackId = normalizeMusicTrackId(body.music_track_id, templateType, topic);
		const musicSource: VideoCarouselMusicSource = body.music_source === 'jamendo' ? 'jamendo' : 'generated';
		const externalMusic = normalizeExternalMusic(body.external_music);
		if (musicSource === 'jamendo' && !externalMusic) {
			return json({ error: 'external_music is required for Jamendo music' }, { status: 400 });
		}

		// Step 1: AI generates script
		const script = await generateVideoScript(topic, clipCount, durationSeconds, templateType);

		// Step 2: Search Pexels videos for each segment in parallel
		const videoResults = await Promise.all(
			script.segments.map((seg) => searchPexelsVideos(seg.search_query, 4).catch(() => []))
		);

		// Step 3: Create project in DB
		const project = await createVideoCarouselProject({
			title: script.title,
			template_type: templateType,
			font_preset: fontPreset,
			music_track_id: musicTrackId,
			music_source: musicSource,
			external_music: externalMusic,
			music_volume_percent: musicVolumePercent
		});

		// Step 4: Persist slides — pick the first video for each segment
		const slideInputs = script.segments.map((seg, i) => {
			const videos = videoResults[i];
			const best = videos[0] ?? null;
			const bestFile = best ? pickBestVideoFile(best.video_files) : null;

			return {
				position: seg.position,
				layout_type: seg.layout_type,
				text: seg.text,
				accent_text: seg.accent_text,
				subtext: seg.subtext,
				options: seg.options,
				text_position: seg.text_position as VideoTextPosition,
				pexels_video_id: best?.id ?? null,
				video_url: bestFile?.link ?? null,
				thumbnail_url: best?.image ?? null,
				duration_seconds: seg.duration_seconds,
				search_query: seg.search_query,
				sources: seg.sources,
				caption: seg.caption
			};
		});

		const slides = await upsertVideoCarouselSlides(project.id, slideInputs);

		return json(
			{
				project,
				slides,
				video_candidates: videoResults.map((videos, i) => ({
					position: script.segments[i].position,
					search_query: script.segments[i].search_query,
					videos: videos.map((v) => {
						const file = pickBestVideoFile(v.video_files);
						return {
							id: v.id,
							thumbnail_url: v.image,
							duration: v.duration,
							video_url: file?.link ?? null,
							user_name: v.user.name
						};
					})
				}))
			},
			{ status: 201 }
		);
	} catch (error) {
		return json({ error: error instanceof Error ? error.message : String(error) }, { status: 500 });
	}
};
