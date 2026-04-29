import { json } from '@sveltejs/kit';
import type { RequestHandler } from './$types';
import { generateVideoScript } from '$lib/server/video-ai';
import { searchPexelsVideos, pickBestVideoFile } from '$lib/server/pexels';
import {
	createVideoCarouselProject,
	upsertVideoCarouselSlides
} from '$lib/server/video-carousel-store';
import type { CarouselFontPreset } from '$lib/types';
import type { VideoCarouselTemplateType, VideoTextPosition } from '$lib/video-carousel';

export const POST: RequestHandler = async ({ request }) => {
	try {
		const body = await request.json();
		const topic = typeof body.topic === 'string' ? body.topic.trim() : '';
		if (!topic) return json({ error: 'topic is required' }, { status: 400 });

		const clipCount = typeof body.clip_count === 'number' ? body.clip_count : 5;
		const durationSeconds = typeof body.duration_seconds === 'number' ? body.duration_seconds : 10;
		const fontPreset: CarouselFontPreset =
			typeof body.font_preset === 'string' ? (body.font_preset as CarouselFontPreset) : 'biglot';
		const templateType: VideoCarouselTemplateType =
			body.template_type === 'quote' ||
			body.template_type === 'listicle' ||
			body.template_type === 'stat'
				? body.template_type
				: 'quiz';

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
			font_preset: fontPreset
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
				search_query: seg.search_query
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
