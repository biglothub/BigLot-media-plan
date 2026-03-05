import { json } from '@sveltejs/kit';
import type { RequestHandler } from './$types';
import { supabase } from '$lib/supabase';

export const POST: RequestHandler = async ({ params, request }) => {
	if (!supabase) return json({ error: 'Supabase not configured' }, { status: 500 });

	const body = await request.json();
	if (!body.url || !body.platform) {
		return json({ error: 'url and platform are required' }, { status: 400 });
	}

	const { data, error } = await supabase
		.from('monitoring_content_platform')
		.insert({
			content_id: params.id,
			url: body.url,
			platform: body.platform,
			title: body.title ?? null,
			thumbnail_url: body.thumbnail_url ?? null,
			published_at: body.published_at ?? null,
			view_count: body.view_count ?? null,
			like_count: body.like_count ?? null,
			comment_count: body.comment_count ?? null,
			share_count: body.share_count ?? null,
			save_count: body.save_count ?? null,
			notes: body.notes ?? null
		})
		.select()
		.single();

	if (error) return json({ error: error.message }, { status: 500 });
	return json(data, { status: 201 });
};
