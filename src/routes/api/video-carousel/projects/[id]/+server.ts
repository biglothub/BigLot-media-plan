import { json } from '@sveltejs/kit';
import type { RequestHandler } from './$types';
import {
	getVideoCarouselProject,
	updateVideoCarouselProject,
	deleteVideoCarouselProject
} from '$lib/server/video-carousel-store';
import type { CarouselFontPreset } from '$lib/types';
import type { VideoCarouselStatus, VideoCarouselTemplateType } from '$lib/video-carousel';

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
