/**
 * POST /api/openclaw/monitoring/sync-all
 *
 * Bulk auto-snapshot for all monitoring_content entries where is_own=true.
 * Calls the per-content auto-snapshot logic for each entry in sequence.
 *
 * Optional body: { content_ids?: string[] }  — sync only specific IDs
 *
 * Response:
 *   { synced_at, total, succeeded, failed, results: { id, title, snapshots_saved, error? }[] }
 */

import { json } from '@sveltejs/kit';
import type { RequestHandler } from './$types';
import { supabase } from '$lib/supabase';
import { scrapeYouTubeChannel, scrapeVideoMetrics } from '$lib/server/auto-snapshot';
import type { SupportedPlatform } from '$lib/types';

export const POST: RequestHandler = async ({ request, fetch }) => {
	if (!supabase) return json({ error: 'Supabase not configured' }, { status: 500 });

	let filterIds: string[] | null = null;
	try {
		const body = await request.json().catch(() => ({}));
		if (Array.isArray(body?.content_ids) && body.content_ids.length > 0) {
			filterIds = body.content_ids;
		}
	} catch { /* ignore parse errors */ }

	// Load all own-channel content (or a specific subset)
	let query = supabase.from('monitoring_content').select('id, title').eq('is_own', true);
	if (filterIds) query = query.in('id', filterIds);

	const { data: contents, error: contErr } = await query;
	if (contErr) return json({ error: contErr.message }, { status: 500 });
	if (!contents || contents.length === 0) {
		return json({ error: 'No own-channel content found' }, { status: 404 });
	}

	const snapshotDate = new Date().toISOString().slice(0, 10);
	const nowIso = new Date().toISOString();
	const results = [];
	let succeeded = 0;
	let failed = 0;

	for (const content of contents) {
		try {
			const { data: platforms } = await supabase
				.from('monitoring_content_platform')
				.select('id, platform, url, is_channel')
				.eq('content_id', content.id);

			if (!platforms || platforms.length === 0) {
				results.push({ id: content.id, title: content.title, snapshots_saved: 0, error: 'no-platform-links' });
				failed++;
				continue;
			}

			let snapshotsSaved = 0;

			for (const p of platforms) {
				const platform = p.platform as SupportedPlatform;
				let scrapeResult;

				if (p.is_channel && platform === 'youtube') {
					scrapeResult = await scrapeYouTubeChannel(p.id, p.url, fetch, async (videos) => {
						for (const v of videos) {
							await supabase!.from('monitoring_channel_videos').upsert(
								{ platform_id: p.id, video_id: v.video_id, view_count: v.view_count, updated_at: nowIso },
								{ onConflict: 'platform_id,video_id', ignoreDuplicates: false }
							);
						}
					});
				} else if (p.is_channel) {
					continue; // skip non-YouTube channels
				} else {
					scrapeResult = await scrapeVideoMetrics(p.id, platform, p.url, fetch);
				}

				const m = scrapeResult.metrics;
				const hasAny = m.view_count !== null || m.like_count !== null || m.comment_count !== null;
				if (!hasAny) continue;

				const { error: snapErr } = await supabase.from('monitoring_metric_snapshots').upsert(
					{
						content_id: content.id,
						platform_id: p.id,
						snapshot_date: snapshotDate,
						view_count: m.view_count,
						like_count: m.like_count,
						comment_count: m.comment_count,
						share_count: m.share_count,
						save_count: m.save_count,
						notes: 'auto-synced'
					},
					{ onConflict: 'platform_id,snapshot_date' }
				);

				if (!snapErr) {
					snapshotsSaved++;
					await supabase
						.from('monitoring_content_platform')
						.update({ last_checked_at: nowIso })
						.eq('id', p.id);
				}
			}

			results.push({ id: content.id, title: content.title, snapshots_saved: snapshotsSaved });
			succeeded++;
		} catch (err) {
			results.push({
				id: content.id,
				title: content.title,
				snapshots_saved: 0,
				error: err instanceof Error ? err.message : 'unknown'
			});
			failed++;
		}
	}

	return json({ synced_at: nowIso, total: contents.length, succeeded, failed, results });
};
