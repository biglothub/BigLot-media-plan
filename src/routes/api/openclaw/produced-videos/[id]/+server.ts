import { json } from '@sveltejs/kit';
import type { RequestHandler } from './$types';
import { supabase } from '$lib/supabase';

export const PATCH: RequestHandler = async ({ params, request }) => {
	if (!supabase) return json({ error: 'Supabase not configured' }, { status: 500 });

	const body = await request.json();
	const allowed = [
		'title',
		'url',
		'thumbnail_url',
		'published_at',
		'view_count',
		'like_count',
		'comment_count',
		'share_count',
		'save_count',
		'notes',
		'carousel_project_id',
		'content_kind'
	];
	const updates: Record<string, unknown> = {};
	for (const key of allowed) {
		if (body[key] !== undefined) updates[key] = body[key];
	}

	const { data, error } = await supabase.from('produced_videos').update(updates).eq('id', params.id).select().single();
	if (error) return json({ error: 'Video not found' }, { status: 404 });
	return json(data);
};

export const DELETE: RequestHandler = async ({ params }) => {
	if (!supabase) return json({ error: 'Supabase not configured' }, { status: 500 });
	await supabase.from('produced_videos').delete().eq('id', params.id);
	return new Response(null, { status: 204 });
};
