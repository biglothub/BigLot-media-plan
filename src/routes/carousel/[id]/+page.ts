import { hasSupabaseConfig } from '$lib/supabase';
import type { CarouselProjectRow, CarouselQuoteIdentityRow, CarouselSlideRow, ProducedVideoRow, ProductionCalendarRow } from '$lib/types';
import type { PageLoad } from './$types';

type ProjectResponse = CarouselProjectRow & {
	carousel_slides?: CarouselSlideRow[];
	linked_schedule?: ProductionCalendarRow | null;
	published_record?: ProducedVideoRow | null;
};

type CarouselStudioLoadData = {
	project: ProjectResponse | null;
	projectError: string;
	quoteIdentities: CarouselQuoteIdentityRow[];
};

export const load: PageLoad = async ({ fetch, params }) => {
	if (!hasSupabaseConfig) {
		return {
			project: null,
			projectError: '',
			quoteIdentities: []
		} satisfies CarouselStudioLoadData;
	}

	let project: ProjectResponse | null = null;
	let projectError = '';
	let quoteIdentities: CarouselQuoteIdentityRow[] = [];

	try {
		const [projectResponse, identitiesResponse] = await Promise.all([
			fetch(`/api/openclaw/carousels/${params.id}`),
			fetch('/api/openclaw/carousels/quote-identities')
		]);

		if (projectResponse.ok) {
			project = (await projectResponse.json()) as ProjectResponse;
		} else {
			const body = await projectResponse.json().catch(() => ({}));
			projectError = body.error ?? 'โหลด carousel project ไม่สำเร็จ';
		}

		if (identitiesResponse.ok) {
			const body = await identitiesResponse.json();
			quoteIdentities = Array.isArray(body.identities) ? body.identities : [];
		}
	} catch {
		projectError = 'โหลด carousel project ไม่สำเร็จ';
	}

	return {
		project,
		projectError,
		quoteIdentities
	} satisfies CarouselStudioLoadData;
};
