/**
 * POST /api/openclaw/monitoring/[id]/auto-snapshot
 *
 * Scrapes metrics for all platform links of a monitoring_content entry
 * and upserts today's monitoring_metric_snapshots automatically.
 *
 * Response:
 *   { snapshot_date, results: PlatformScrapeResult[], snapshots_saved: number }
 */

import { json } from '@sveltejs/kit';
import type { RequestHandler } from './$types';
import { supabase } from '$lib/supabase';
import { scrapeYouTubeChannel, scrapeVideoMetrics } from '$lib/server/auto-snapshot';
import type { SupportedPlatform } from '$lib/types';

export const POST: RequestHandler = async ({ params, fetch }) => {
	if (!supabase) return json({ error: 'Supabase not configured' }, { status: 500 });

	// Load all platform links for this content
	const { data: platforms, error: platErr } = await supabase
		.from('monitoring_content_platform')
		.select('id, platform, url, is_channel')
		.eq('content_id', params.id);

	if (platErr) return json({ error: platErr.message }, { status: 500 });
	if (!platforms || platforms.length === 0) {
		return json({ error: 'No platform links found for this content' }, { status: 404 });
	}

	const snapshotDate = new Date().toISOString().slice(0, 10);
	const nowIso = new Date().toISOString();
	const results = [];
	let snapshotsSaved = 0;

	for (const p of platforms) {
		const platform = p.platform as SupportedPlatform;
		let result;

		if (p.is_channel && platform === 'youtube') {
			// Sync channel videos + compute total views
			result = await scrapeYouTubeChannel(
				p.id,
				p.url,
				fetch,
				async (videos) => {
					// Upsert channel videos into DB
					const rows = videos.map((v) => ({
						platform_id: p.id,
						video_id: v.video_id,
						// we need full video data; build minimal row from what we have
						view_count: v.view_count,
						updated_at: nowIso
					}));
					// Only update view_count for existing rows (don't overwrite title/thumbnail)
					for (const row of rows) {
						await supabase!
							.from('monitoring_channel_videos')
							.upsert(row, { onConflict: 'platform_id,video_id', ignoreDuplicates: false });
					}
				}
			);
		} else if (p.is_channel) {
			// TikTok/Facebook channel — not scrapeable
			result = {
				platform_id: p.id,
				platform,
				is_channel: true,
				scraped: false,
				skip_reason: `${platform}-channel-not-scrapeable`,
				metrics: { view_count: null, like_count: null, comment_count: null, share_count: null, save_count: null }
			};
		} else {
			// Individual video
			result = await scrapeVideoMetrics(p.id, platform, p.url, fetch);
		}

		results.push(result);

		// Save snapshot if we got any metrics
		const m = result.metrics;
		const hasAnyMetric =
			m.view_count !== null || m.like_count !== null || m.comment_count !== null;

		if (hasAnyMetric) {
			const { error: snapErr } = await supabase
				.from('monitoring_metric_snapshots')
				.upsert(
					{
						content_id: params.id,
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
				// Update last_checked_at on the platform link
				await supabase
					.from('monitoring_content_platform')
					.update({ last_checked_at: nowIso })
					.eq('id', p.id);
			}
		}
	}

	return json({
		snapshot_date: snapshotDate,
		synced_at: nowIso,
		results,
		snapshots_saved: snapshotsSaved
	});
};
