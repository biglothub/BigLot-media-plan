import { hasSupabaseConfig } from '$lib/supabase';
import type { CarouselProjectRow } from '$lib/types';
import type { PageLoad } from './$types';

type CarouselListLoadData = {
	projects: CarouselProjectRow[];
	loadError: string;
};

export const load: PageLoad = async ({ fetch }) => {
	if (!hasSupabaseConfig) {
		return {
			projects: [],
			loadError: ''
		} satisfies CarouselListLoadData;
	}

	try {
		const response = await fetch('/api/openclaw/carousels');
		if (!response.ok) {
			const body = await response.json().catch(() => ({}));
			return {
				projects: [],
				loadError: body.error ?? 'โหลด carousel projects ไม่สำเร็จ'
			} satisfies CarouselListLoadData;
		}

		const projects = (await response.json()) as CarouselProjectRow[];
		return {
			projects,
			loadError: ''
		} satisfies CarouselListLoadData;
	} catch {
		return {
			projects: [],
			loadError: 'โหลด carousel projects ไม่สำเร็จ'
		} satisfies CarouselListLoadData;
	}
};
