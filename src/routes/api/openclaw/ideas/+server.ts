import { json } from '@sveltejs/kit';
import type { RequestHandler } from './$types';
import { supabase } from '$lib/supabase';
import { generateIdeaCode } from '$lib/server/backlog';

export const GET: RequestHandler = async ({ url }) => {
	if (!supabase) return json({ error: 'Supabase not configured' }, { status: 500 });

	const status = url.searchParams.get('status');
	const platform = url.searchParams.get('platform');
	const limit = Math.min(Number(url.searchParams.get('limit') ?? 50), 100);

	let query = supabase.from('idea_backlog').select('*').order('created_at', { ascending: false }).limit(limit);
	if (status) query = query.eq('status', status);
	if (platform) query = query.eq('platform', platform);

	const { data, error } = await query;
	if (error) return json({ error: error.message }, { status: 500 });
	return json(data);
};

export const POST: RequestHandler = async ({ request, fetch }) => {
	if (!supabase) return json({ error: 'Supabase not configured' }, { status: 500 });

	const body = await request.json();

	const row: Record<string, unknown> = {
		idea_code: generateIdeaCode(),
		platform: body.platform ?? 'youtube',
		content_type: body.content_type ?? 'video',
		content_category: body.content_category ?? null,
		title: body.title ?? null,
		description: body.description ?? null,
		author_name: body.author_name ?? null,
		thumbnail_url: body.thumbnail_url ?? null,
		notes: body.notes ?? null,
		url: body.url ?? null,
		status: 'new'
	};

	// Auto-enrich if URL provided and no title
	if (body.url && !body.title) {
		try {
			const enrichResp = await fetch(`/api/enrich?url=${encodeURIComponent(body.url)}`);
			if (enrichResp.ok) {
				const enriched = await enrichResp.json();
				row.platform = enriched.platform ?? row.platform;
				row.content_type = enriched.contentType ?? row.content_type;
				row.title = enriched.title ?? row.title;
				row.description = enriched.description ?? row.description;
				row.author_name = enriched.authorName ?? row.author_name;
				row.thumbnail_url = enriched.thumbnailUrl ?? row.thumbnail_url;
				row.published_at = enriched.publishedAt ?? null;
				const m = enriched.metrics ?? {};
				row.view_count = m.views ?? null;
				row.like_count = m.likes ?? null;
				row.comment_count = m.comments ?? null;
				row.share_count = m.shares ?? null;
				row.save_count = m.saves ?? null;
			}
		} catch {
			// enrich failed, continue with manual data
		}
	}

	const { data, error } = await supabase.from('idea_backlog').insert(row).select().single();
	if (error) return json({ error: error.message }, { status: 500 });
	return json(data, { status: 201 });
};
