import type { CarouselProjectRow, CarouselProjectStatus, CarouselSlideRow } from '$lib/types';

export const INSTAGRAM_CAROUSEL_WIDTH = 1080;
export const INSTAGRAM_CAROUSEL_HEIGHT = 1350;
export const DEFAULT_CAROUSEL_SLIDE_COUNT = 6;

export const CAROUSEL_PROJECT_STATUSES = ['draft', 'ready', 'exported', 'archived'] as const satisfies readonly CarouselProjectStatus[];

export const carouselStatusLabel: Record<CarouselProjectStatus, string> = {
	draft: 'Draft',
	ready: 'Ready',
	exported: 'Exported',
	archived: 'Archived'
};

export const carouselRoleLabel = {
	cover: 'Cover',
	body: 'Content',
	cta: 'CTA'
} as const;

export const carouselLayoutLabel = {
	cover: 'Cover',
	content: 'Content',
	cta: 'CTA'
} as const;

export function normalizeHashtags(value: string[] | null | undefined): string[] {
	if (!Array.isArray(value)) return [];

	const seen = new Set<string>();
	const normalized: string[] = [];
	for (const tag of value) {
		if (typeof tag !== 'string') continue;
		const cleaned = tag.trim().replace(/\s+/g, '');
		if (!cleaned) continue;
		const normalizedTag = cleaned.startsWith('#') ? cleaned : `#${cleaned}`;
		const dedupeKey = normalizedTag.toLowerCase();
		if (seen.has(dedupeKey)) continue;
		seen.add(dedupeKey);
		normalized.push(normalizedTag);
	}
	return normalized;
}

export function toHashtagText(value: string[] | null | undefined): string {
	return normalizeHashtags(value).join(' ');
}

export function getCarouselSelectedAssetUrl(slide: Pick<CarouselSlideRow, 'selected_asset_json'>): string | null {
	return slide.selected_asset_json?.storage_url ?? slide.selected_asset_json?.preview_url ?? null;
}

export function hasCarouselSlideAsset(slide: Pick<CarouselSlideRow, 'selected_asset_json' | 'selected_asset_storage_path'>): boolean {
	return Boolean(slide.selected_asset_storage_path || slide.selected_asset_json?.storage_url);
}

export function hasCarouselSlideCopy(slide: Pick<CarouselSlideRow, 'role' | 'headline' | 'body' | 'cta' | 'visual_brief' | 'freepik_query'>): boolean {
	const hasHeadline = Boolean(slide.headline?.trim());
	const hasVisualBrief = Boolean(slide.visual_brief?.trim());
	const hasQuery = Boolean(slide.freepik_query?.trim());
	if (!hasHeadline || !hasVisualBrief || !hasQuery) return false;
	if (slide.role === 'cover') return true;
	if (slide.role === 'body') return Boolean(slide.body?.trim());
	return Boolean(slide.cta?.trim());
}

export function getCarouselSlideBlockers(
	slide: Pick<CarouselSlideRow, 'role' | 'headline' | 'body' | 'cta' | 'visual_brief' | 'freepik_query' | 'selected_asset_json' | 'selected_asset_storage_path'>
): string[] {
	const blockers: string[] = [];
	if (!slide.headline?.trim()) blockers.push('headline');
	if (!slide.visual_brief?.trim()) blockers.push('visual brief');
	if (!slide.freepik_query?.trim()) blockers.push('asset query');
	if (slide.role === 'body' && !slide.body?.trim()) blockers.push('body copy');
	if (slide.role === 'cta' && !slide.cta?.trim()) blockers.push('CTA');
	if (!hasCarouselSlideAsset(slide)) blockers.push('selected asset');
	return blockers;
}

export function getCarouselSlideReadiness(
	slide: Pick<CarouselSlideRow, 'role' | 'headline' | 'body' | 'cta' | 'visual_brief' | 'freepik_query' | 'selected_asset_json' | 'selected_asset_storage_path'>
): {
	hasCopy: boolean;
	hasAsset: boolean;
	isReady: boolean;
	blockers: string[];
} {
	const hasCopy = hasCarouselSlideCopy(slide);
	const hasAsset = hasCarouselSlideAsset(slide);
	const blockers = getCarouselSlideBlockers(slide);
	return {
		hasCopy,
		hasAsset,
		isReady: hasCopy && hasAsset,
		blockers
	};
}

export function getCarouselProjectBlockers(
	project: Pick<CarouselProjectRow, 'title' | 'caption'> | null | undefined,
	slides: Array<Pick<CarouselSlideRow, 'position' | 'role' | 'headline' | 'body' | 'cta' | 'visual_brief' | 'freepik_query' | 'selected_asset_json' | 'selected_asset_storage_path'>>
): string[] {
	const blockers: string[] = [];
	if (!project?.title?.trim()) blockers.push('Project title is missing');
	if (!project?.caption?.trim()) blockers.push('Caption is missing');
	if (slides.length === 0) blockers.push('Generate slides before exporting');

	for (const slide of slides) {
		const slideBlockers = getCarouselSlideBlockers(slide);
		if (slideBlockers.length === 0) continue;
		blockers.push(`Slide ${slide.position}: ${slideBlockers.join(', ')}`);
	}

	return blockers;
}

export function deriveCarouselProjectStatus(
	project: Pick<CarouselProjectRow, 'status' | 'title' | 'caption'> | null | undefined,
	slides: Array<Pick<CarouselSlideRow, 'role' | 'headline' | 'body' | 'cta' | 'visual_brief' | 'freepik_query' | 'selected_asset_json' | 'selected_asset_storage_path'>>,
	explicitStatus?: CarouselProjectStatus | null
): CarouselProjectStatus {
	if (explicitStatus === 'archived') return 'archived';
	if (explicitStatus === 'exported') return 'exported';
	if (explicitStatus === 'draft' || explicitStatus === 'ready') return explicitStatus;
	if (project?.status === 'archived') return 'archived';
	if (!project?.title?.trim() || !project.caption?.trim()) return 'draft';
	if (slides.length === 0) return 'draft';

	const everySlideReady = slides.every((slide) => hasCarouselSlideCopy(slide) && hasCarouselSlideAsset(slide));
	return everySlideReady ? 'ready' : 'draft';
}
