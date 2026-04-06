import { supabase } from '$lib/supabase';
import type { BacklogContentCategory, IdeaBacklogRow } from '$lib/types';

export function generateIdeaCode(): string {
	const date = new Date().toISOString().slice(0, 10).replace(/-/g, '');
	const rand = Math.random().toString(16).slice(2, 10);
	return `BL-${date}-${rand}`;
}

export async function createBacklogIdeaFromCarouselDraft(input: {
	title: string;
	description?: string | null;
	content_category?: BacklogContentCategory | null;
	notes?: string | null;
}): Promise<IdeaBacklogRow> {
	if (!supabase) {
		throw new Error('Supabase not configured');
	}

	const title = input.title.trim();
	if (!title) {
		throw new Error('title is required');
	}

	const { data, error } = await supabase
		.from('idea_backlog')
		.insert({
			idea_code: generateIdeaCode(),
			platform: 'instagram',
			content_type: 'image',
			content_category: input.content_category ?? null,
			title,
			description: input.description?.trim() || null,
			notes: input.notes?.trim() || null,
			status: 'new'
		})
		.select('*')
		.single();

	if (error) {
		throw new Error(error.message);
	}

	return data as IdeaBacklogRow;
}
