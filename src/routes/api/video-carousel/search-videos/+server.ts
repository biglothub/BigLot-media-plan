import { json } from '@sveltejs/kit';
import type { RequestHandler } from './$types';
import { searchPexelsVideos, pickBestVideoFile } from '$lib/server/pexels';

export const GET: RequestHandler = async ({ url }) => {
	try {
		const q = url.searchParams.get('q') ?? '';
		if (!q.trim()) return json({ videos: [] });

		const rawVideos = await searchPexelsVideos(q.trim(), 8);
		const videos = rawVideos.map((v) => {
			const file = pickBestVideoFile(v.video_files);
			return {
				id: v.id,
				thumbnail_url: v.image,
				video_url: file?.link ?? null,
				duration: v.duration,
				user_name: v.user.name
			};
		});

		return json({ videos });
	} catch (error) {
		return json({ error: error instanceof Error ? error.message : String(error) }, { status: 500 });
	}
};
