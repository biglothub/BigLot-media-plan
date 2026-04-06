import { json } from '@sveltejs/kit';
import type { RequestHandler } from './$types';
import { listCarouselProjects, ensureCarouselProject } from '$lib/server/carousel-store';
import { createBacklogIdeaFromCarouselDraft } from '$lib/server/backlog';
import type { BacklogContentCategory } from '$lib/types';

export const GET: RequestHandler = async () => {
	try {
		const projects = await listCarouselProjects();
		return json(projects);
	} catch (error) {
		return json({ error: error instanceof Error ? error.message : String(error) }, { status: 500 });
	}
};

export const POST: RequestHandler = async ({ request }) => {
	try {
		const body = await request.json();
		const backlogId = typeof body.backlog_id === 'string' ? body.backlog_id.trim() : '';
		let resolvedBacklogId = backlogId;

		if (!resolvedBacklogId) {
			const title = typeof body.title === 'string' ? body.title.trim() : '';
			if (!title) {
				return json({ error: 'backlog_id or title is required' }, { status: 400 });
			}

			const idea = await createBacklogIdeaFromCarouselDraft({
				title,
				description: typeof body.description === 'string' ? body.description : null,
				content_category:
					typeof body.content_category === 'string' ? (body.content_category as BacklogContentCategory) : null,
				notes: typeof body.notes === 'string' ? body.notes : null
			});
			resolvedBacklogId = idea.id;
		}

		const project = await ensureCarouselProject(resolvedBacklogId);
		return json(project, { status: 201 });
	} catch (error) {
		return json({ error: error instanceof Error ? error.message : String(error) }, { status: 500 });
	}
};
