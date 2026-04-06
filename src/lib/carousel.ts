import type { CarouselFontPreset, CarouselProjectRow, CarouselProjectStatus, CarouselSlideRow } from '$lib/types';

export const INSTAGRAM_CAROUSEL_WIDTH = 1080;
export const INSTAGRAM_CAROUSEL_HEIGHT = 1350;
export const DEFAULT_CAROUSEL_SLIDE_COUNT = 6;
export const DEFAULT_CAROUSEL_TEXT_LETTER_SPACING_EM = 0;
export const CAROUSEL_TEXT_LETTER_SPACING_MIN_EM = -0.08;
export const CAROUSEL_TEXT_LETTER_SPACING_MAX_EM = 0.24;
export const CAROUSEL_TEXT_LETTER_SPACING_STEP_EM = 0.01;

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

export const CAROUSEL_FONT_PRESETS = [
	{
		value: 'biglot',
		label: 'BigLot Default',
		description: 'Space Grotesk + Noto Sans Thai',
		headingFont: "'Space Grotesk', 'Noto Sans Thai', sans-serif",
		bodyFont: "'Noto Sans Thai', sans-serif"
	},
	{
		value: 'apple_clean',
		label: 'Apple Clean',
		description: 'SF Pro style system stack',
		headingFont:
			"'SF Pro Display', 'SF Pro Text', -apple-system, BlinkMacSystemFont, 'Segoe UI', 'Noto Sans Thai', sans-serif",
		bodyFont:
			"'SF Pro Text', -apple-system, BlinkMacSystemFont, 'Segoe UI', 'Noto Sans Thai', sans-serif"
	},
	{
		value: 'mitr_friendly',
		label: 'Mitr Friendly',
		description: 'Mitr from Google Fonts',
		headingFont: "'Mitr', 'Noto Sans Thai', sans-serif",
		bodyFont: "'Mitr', 'Noto Sans Thai', sans-serif"
	},
	{
		value: 'ibm_plex_thai',
		label: 'IBM Plex Thai',
		description: 'IBM Plex Sans Thai from Google Fonts',
		headingFont: "'IBM Plex Sans Thai', 'Noto Sans Thai', sans-serif",
		bodyFont: "'IBM Plex Sans Thai', 'Noto Sans Thai', sans-serif"
	},
	{
		value: 'editorial_serif',
		label: 'Editorial Serif',
		description: 'Playfair Display + Sarabun',
		headingFont: "'Playfair Display', 'Noto Sans Thai', serif",
		bodyFont: "'Sarabun', 'Noto Sans Thai', sans-serif"
	}
] as const satisfies ReadonlyArray<{
	value: CarouselFontPreset;
	label: string;
	description: string;
	headingFont: string;
	bodyFont: string;
}>;

const carouselFontPresetMap = Object.fromEntries(
	CAROUSEL_FONT_PRESETS.map((preset) => [preset.value, preset])
) as Record<CarouselFontPreset, (typeof CAROUSEL_FONT_PRESETS)[number]>;

export function getCarouselFontPresetDefinition(fontPreset: CarouselFontPreset | null | undefined) {
	return carouselFontPresetMap[fontPreset ?? 'biglot'] ?? carouselFontPresetMap.biglot;
}

export function normalizeCarouselTextLetterSpacingEm(value: unknown): number {
	const parsed =
		typeof value === 'number'
			? value
			: typeof value === 'string' && value.trim()
				? Number(value)
				: DEFAULT_CAROUSEL_TEXT_LETTER_SPACING_EM;

	if (!Number.isFinite(parsed)) return DEFAULT_CAROUSEL_TEXT_LETTER_SPACING_EM;

	const clamped = Math.min(CAROUSEL_TEXT_LETTER_SPACING_MAX_EM, Math.max(CAROUSEL_TEXT_LETTER_SPACING_MIN_EM, parsed));
	return Math.round(clamped * 1000) / 1000;
}

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
