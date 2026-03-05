import { json } from '@sveltejs/kit';
import type { RequestHandler } from './$types';
import { supabase } from '$lib/supabase';

function generateContentCode(): string {
	const date = new Date().toISOString().slice(0, 10).replace(/-/g, '');
	const rand = Math.random().toString(16).slice(2, 10).toUpperCase();
	return `MC-${date}-${rand}`;
}

export const GET: RequestHandler = async () => {
	if (!supabase) return json({ error: 'Supabase not configured' }, { status: 500 });

	const { data, error } = await supabase
		.from('monitoring_content')
		.select('*, monitoring_content_platform(*)')
		.order('created_at', { ascending: false });

	if (error) return json({ error: error.message }, { status: 500 });
	return json(data);
};

export const POST: RequestHandler = async ({ request }) => {
	if (!supabase) return json({ error: 'Supabase not configured' }, { status: 500 });

	const body = await request.json();
	if (!body.title) return json({ error: 'title is required' }, { status: 400 });

	const { data, error } = await supabase
		.from('monitoring_content')
		.insert({
			content_code: generateContentCode(),
			title: body.title,
			description: body.description ?? null,
			notes: body.notes ?? null,
			status: 'active'
		})
		.select()
		.single();

	if (error) return json({ error: error.message }, { status: 500 });
	return json(data, { status: 201 });
};
