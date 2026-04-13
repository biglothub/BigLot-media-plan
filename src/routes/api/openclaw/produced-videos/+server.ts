import { json } from '@sveltejs/kit';
import type { RequestHandler } from './$types';
import { supabase } from '$lib/supabase';

export const GET: RequestHandler = async ({ url }) => {
	if (!supabase) return json({ error: 'Supabase not configured' }, { status: 500 });

	const platform = url.searchParams.get('platform');
	let query = supabase
		.from('produced_videos')
		.select('*, production_calendar(shoot_date, status, idea_backlog(title, idea_code)), carousel_projects(title, content_mode, review_status)')
		.order('created_at', { ascending: false })
		.limit(50);

	if (platform) query = query.eq('platform', platform);

	const { data, error } = await query;
	if (error) return json({ error: error.message }, { status: 500 });
	return json(data);
};

export const POST: RequestHandler = async ({ request }) => {
	if (!supabase) return json({ error: 'Supabase not configured' }, { status: 500 });

	const body = await request.json();
	if (!body.calendar_id || !body.url || !body.platform) {
		return json({ error: 'calendar_id, url, and platform are required' }, { status: 400 });
	}

	const row = {
		calendar_id: body.calendar_id,
		carousel_project_id: body.carousel_project_id ?? null,
		content_kind: body.content_kind ?? 'video',
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
	};

	const { data, error } = await supabase.from('produced_videos').insert(row).select().single();
	if (error) return json({ error: error.message }, { status: 500 });
	return json(data, { status: 201 });
};
