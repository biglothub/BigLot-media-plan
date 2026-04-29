import { json } from '@sveltejs/kit';
import type { RequestHandler } from './$types';
import { listVideoCarouselProjects, createVideoCarouselProject } from '$lib/server/video-carousel-store';
import type { CarouselFontPreset } from '$lib/types';
import type { VideoCarouselTemplateType } from '$lib/video-carousel';

export const GET: RequestHandler = async () => {
	try {
		const projects = await listVideoCarouselProjects();
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
		const templateType: VideoCarouselTemplateType = body.template_type === 'quote' ? 'quote' : 'quiz';
		const project = await createVideoCarouselProject({
			title,
			template_type: templateType,
			font_preset: (body.font_preset as CarouselFontPreset) ?? 'biglot'
		});
		return json(project, { status: 201 });
	} catch (error) {
		return json({ error: error instanceof Error ? error.message : String(error) }, { status: 500 });
	}
};
