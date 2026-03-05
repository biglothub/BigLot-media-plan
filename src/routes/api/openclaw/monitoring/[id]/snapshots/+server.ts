import { json } from '@sveltejs/kit';
import type { RequestHandler } from './$types';
import { supabase } from '$lib/supabase';

function toNullableInt(value: unknown): number | null {
	if (value === null || value === undefined || value === '') return null;
	const n = Number(value);
	return Number.isFinite(n) ? Math.round(n) : null;
}

export const GET: RequestHandler = async ({ params, url }) => {
	if (!supabase) return json({ error: 'Supabase not configured' }, { status: 500 });

	const platformId = url.searchParams.get('platform_id');
	const limit = Math.min(Number(url.searchParams.get('limit') ?? 120), 365);

	let query = supabase
		.from('monitoring_metric_snapshots')
		.select('*')
		.eq('content_id', params.id)
		.order('snapshot_date', { ascending: false })
		.order('created_at', { ascending: false })
		.limit(limit);

	if (platformId) query = query.eq('platform_id', platformId);

	const { data, error } = await query;
	if (error) return json({ error: error.message }, { status: 500 });
	return json(data);
};

export const POST: RequestHandler = async ({ params, request }) => {
	if (!supabase) return json({ error: 'Supabase not configured' }, { status: 500 });

	const body = await request.json();
	if (!body.platform_id) {
		return json({ error: 'platform_id is required' }, { status: 400 });
	}

	const { data: platform, error: platformError } = await supabase
		.from('monitoring_content_platform')
		.select('id, content_id')
		.eq('id', body.platform_id)
		.single();

	if (platformError || !platform || platform.content_id !== params.id) {
		return json({ error: 'platform_id is invalid for this content' }, { status: 400 });
	}

	const snapshotDate = typeof body.snapshot_date === 'string' && body.snapshot_date.trim()
		? body.snapshot_date
		: new Date().toISOString().slice(0, 10);

	const payload = {
		content_id: params.id,
		platform_id: body.platform_id,
		snapshot_date: snapshotDate,
		followers_count: toNullableInt(body.followers_count),
		view_count: toNullableInt(body.view_count),
		post_count: toNullableInt(body.post_count),
		like_count: toNullableInt(body.like_count),
		comment_count: toNullableInt(body.comment_count),
		share_count: toNullableInt(body.share_count),
		save_count: toNullableInt(body.save_count),
		notes: body.notes ?? null
	};

	const { data, error } = await supabase
		.from('monitoring_metric_snapshots')
		.upsert(payload, { onConflict: 'platform_id,snapshot_date' })
		.select()
		.single();

	if (error) return json({ error: error.message }, { status: 500 });

	await supabase
		.from('monitoring_content_platform')
		.update({ last_checked_at: new Date().toISOString() })
		.eq('id', body.platform_id);

	return json(data, { status: 201 });
};
