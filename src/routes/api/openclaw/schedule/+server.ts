import { json } from '@sveltejs/kit';
import type { RequestHandler } from './$types';
import { supabase } from '$lib/supabase';

function attachIdeas(rows: Record<string, unknown>[], ideasMap: Map<string, Record<string, unknown>>) {
	return rows.map((r) => ({ ...r, idea: ideasMap.get(r.backlog_id as string) ?? null }));
}

async function fetchIdeasMap(backlogIds: string[]) {
	if (!supabase || backlogIds.length === 0) return new Map();
	const { data } = await supabase.from('idea_backlog').select('*').in('id', backlogIds);
	return new Map((data ?? []).map((i) => [i.id as string, i]));
}

export const GET: RequestHandler = async ({ url }) => {
	if (!supabase) return json({ error: 'Supabase not configured' }, { status: 500 });

	const range = url.searchParams.get('range') ?? 'today';
	const today = new Date().toISOString().slice(0, 10);

	let query = supabase.from('production_calendar').select('*');

	if (range === 'week') {
		const end = new Date(Date.now() + 7 * 86400000).toISOString().slice(0, 10);
		query = query.gte('shoot_date', today).lte('shoot_date', end).order('shoot_date');
	} else {
		query = query.eq('shoot_date', today).order('created_at');
	}

	const { data, error } = await query;
	if (error) return json({ error: error.message }, { status: 500 });

	const ids = (data ?? []).map((r) => r.backlog_id as string);
	const ideasMap = await fetchIdeasMap(ids);
	return json(attachIdeas(data ?? [], ideasMap));
};

export const POST: RequestHandler = async ({ request }) => {
	if (!supabase) return json({ error: 'Supabase not configured' }, { status: 500 });

	const body = await request.json();
	if (!body.backlog_id || !body.shoot_date) {
		return json({ error: 'backlog_id and shoot_date are required' }, { status: 400 });
	}

	const { data: idea } = await supabase.from('idea_backlog').select('id').eq('id', body.backlog_id).single();
	if (!idea) return json({ error: 'Idea not found' }, { status: 404 });

	const { data, error } = await supabase
		.from('production_calendar')
		.insert({
			backlog_id: body.backlog_id,
			carousel_project_id: body.carousel_project_id ?? null,
			handoff_source: body.handoff_source ?? 'manual',
			shoot_date: body.shoot_date,
			publish_deadline: body.publish_deadline ?? null,
			notes: body.notes ?? null,
			status: 'planned'
		})
		.select()
		.single();

	if (error) return json({ error: error.message }, { status: 500 });

	const ideasMap = await fetchIdeasMap([body.backlog_id]);
	return json({ ...data, idea: ideasMap.get(body.backlog_id) ?? null }, { status: 201 });
};
