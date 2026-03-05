import { json } from '@sveltejs/kit';
import type { RequestHandler } from './$types';
import { supabase } from '$lib/supabase';
import {
	normalizeYoutubeChannelVideosUrl,
	parseYoutubeVideosFromHtml
} from '$lib/server/youtube-channel';

export const GET: RequestHandler = async ({ params, url }) => {
	if (!supabase) return json({ error: 'Supabase not configured' }, { status: 500 });

	const limit = Math.min(Number(url.searchParams.get('limit') ?? 80), 200);
	const { data, error } = await supabase
		.from('monitoring_channel_videos')
		.select('*')
		.eq('platform_id', params.platformId)
		.order('updated_at', { ascending: false })
		.limit(limit);

	if (error) return json({ error: error.message }, { status: 500 });
	return json({ videos: data ?? [] });
};

export const POST: RequestHandler = async ({ params, fetch }) => {
	if (!supabase) return json({ error: 'Supabase not configured' }, { status: 500 });

	const { data: platform, error: platformError } = await supabase
		.from('monitoring_content_platform')
		.select('id, platform, url, is_channel')
		.eq('id', params.platformId)
		.single();

	if (platformError || !platform) {
		return json({ error: 'Platform link not found' }, { status: 404 });
	}
	if (platform.platform !== 'youtube') {
		return json({ error: 'Only youtube platform is supported for channel sync right now' }, { status: 400 });
	}
	if (!platform.is_channel) {
		return json({ error: 'This link is not marked as channel/profile' }, { status: 400 });
	}

	const channelVideosUrl = normalizeYoutubeChannelVideosUrl(platform.url);
	if (!channelVideosUrl) {
		return json({ error: 'Invalid YouTube channel URL' }, { status: 400 });
	}

	let html = '';
	try {
		const resp = await fetch(channelVideosUrl, {
			headers: {
				'User-Agent':
					'Mozilla/5.0 (Macintosh; Intel Mac OS X 10_15_7) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/122.0 Safari/537.36',
				Accept: 'text/html,application/xhtml+xml'
			}
		});
		if (!resp.ok) {
			return json({ error: `Unable to fetch channel page (${resp.status})` }, { status: 502 });
		}
		html = await resp.text();
	} catch (error) {
		return json({ error: `Channel fetch failed: ${error instanceof Error ? error.message : 'unknown'}` }, { status: 502 });
	}

	const videos = parseYoutubeVideosFromHtml(html);
	if (videos.length === 0) {
		return json({ error: 'No videos found from this channel page' }, { status: 422 });
	}

	const nowIso = new Date().toISOString();
	const rows = videos.map((video) => ({
		platform_id: params.platformId,
		video_id: video.video_id,
		video_url: video.video_url,
		title: video.title,
		thumbnail_url: video.thumbnail_url,
		published_label: video.published_label,
		view_label: video.view_label,
		view_count: video.view_count,
		duration_label: video.duration_label,
		raw_json: video.raw_json,
		updated_at: nowIso
	}));

	const { error: upsertError } = await supabase
		.from('monitoring_channel_videos')
		.upsert(rows, { onConflict: 'platform_id,video_id' });

	if (upsertError) return json({ error: upsertError.message }, { status: 500 });

	await supabase
		.from('monitoring_content_platform')
		.update({ last_checked_at: nowIso })
		.eq('id', params.platformId);

	const { data: savedRows, error: savedError } = await supabase
		.from('monitoring_channel_videos')
		.select('*')
		.eq('platform_id', params.platformId)
		.order('updated_at', { ascending: false })
		.limit(120);

	if (savedError) return json({ error: savedError.message }, { status: 500 });

	return json({
		synced_at: nowIso,
		channel_url: channelVideosUrl,
		video_count: videos.length,
		videos: savedRows ?? []
	});
};
