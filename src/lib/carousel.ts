import type {
	CarouselContentMode,
	CarouselFontPreset,
	CarouselProjectRow,
	CarouselProjectStatus,
	CarouselSlideRow
} from '$lib/types';

export const INSTAGRAM_CAROUSEL_WIDTH = 1080;
export const INSTAGRAM_CAROUSEL_HEIGHT = 1350;
export const DEFAULT_CAROUSEL_SLIDE_COUNT = 6;
export const DEFAULT_CAROUSEL_TEXT_LETTER_SPACING_EM = 0;
export const CAROUSEL_TEXT_LETTER_SPACING_MIN_EM = -0.08;
export const CAROUSEL_TEXT_LETTER_SPACING_MAX_EM = 0.24;
export const CAROUSEL_TEXT_LETTER_SPACING_STEP_EM = 0.01;
export const DEFAULT_CAROUSEL_QUOTE_FONT_SCALE = 1;
export const CAROUSEL_QUOTE_FONT_SCALE_MIN = 0.55;
export const CAROUSEL_QUOTE_FONT_SCALE_MAX = 1.8;
export const CAROUSEL_QUOTE_FONT_SCALE_STEP = 0.05;
export const DEFAULT_CAROUSEL_QUOTE_TEXT_OFFSET_PX = 0;
export const CAROUSEL_QUOTE_TEXT_OFFSET_MIN_PX = -180;
export const CAROUSEL_QUOTE_TEXT_OFFSET_MAX_PX = 180;
export const CAROUSEL_QUOTE_TEXT_OFFSET_STEP_PX = 4;
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

type CarouselProjectLike = Pick<CarouselProjectRow, 'status' | 'title' | 'caption'> & {
	content_mode?: CarouselContentMode | null;
	account_display_name?: string | null;
	account_handle?: string | null;
	account_avatar_url?: string | null;
	account_is_verified?: boolean | null;
};

type CarouselSlideLike = Pick<
	CarouselSlideRow,
	'position' | 'role' | 'headline' | 'body' | 'cta' | 'visual_brief' | 'freepik_query' | 'selected_asset_json' | 'selected_asset_storage_path'
>;

function normalizeContentMode(value: unknown): CarouselContentMode {
	return value === 'quote' ? 'quote' : 'standard';
}

function resolveContentMode(project?: CarouselProjectLike | null): CarouselContentMode {
	return normalizeContentMode(project?.content_mode);
}

function hasNonEmptyString(value: string | null | undefined): boolean {
	return Boolean(value?.trim());
}

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
	},
	{
		value: 'kanit',
		label: 'Kanit',
		description: 'Kanit — Thai & English rounded',
		headingFont: "'Kanit', sans-serif",
		bodyFont: "'Kanit', sans-serif"
	},
	{
		value: 'prompt_clean',
		label: 'Prompt Clean',
		description: 'Prompt — Thai & English clean',
		headingFont: "'Prompt', sans-serif",
		bodyFont: "'Prompt', sans-serif"
	},
	{
		value: 'poppins_thai',
		label: 'Poppins + Sarabun',
		description: 'Poppins (EN) + Sarabun (TH)',
		headingFont: "'Poppins', 'Sarabun', sans-serif",
		bodyFont: "'Poppins', 'Sarabun', sans-serif"
	},
	{
		value: 'bebas_impact',
		label: 'Bebas Impact',
		description: 'Bebas Neue heading + Noto Sans Thai',
		headingFont: "'Bebas Neue', 'Noto Sans Thai', sans-serif",
		bodyFont: "'Noto Sans Thai', sans-serif"
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

export function normalizeCarouselQuoteFontScale(value: unknown): number {
	const parsed =
		typeof value === 'number'
			? value
			: typeof value === 'string' && value.trim()
				? Number(value)
				: DEFAULT_CAROUSEL_QUOTE_FONT_SCALE;

	if (!Number.isFinite(parsed)) return DEFAULT_CAROUSEL_QUOTE_FONT_SCALE;

	const clamped = Math.min(CAROUSEL_QUOTE_FONT_SCALE_MAX, Math.max(CAROUSEL_QUOTE_FONT_SCALE_MIN, parsed));
	return Math.round(clamped * 100) / 100;
}

export function normalizeCarouselQuoteTextOffsetPx(value: unknown): number {
	const parsed =
		typeof value === 'number'
			? value
			: typeof value === 'string' && value.trim()
				? Number(value)
				: DEFAULT_CAROUSEL_QUOTE_TEXT_OFFSET_PX;

	if (!Number.isFinite(parsed)) return DEFAULT_CAROUSEL_QUOTE_TEXT_OFFSET_PX;

	const clamped = Math.min(CAROUSEL_QUOTE_TEXT_OFFSET_MAX_PX, Math.max(CAROUSEL_QUOTE_TEXT_OFFSET_MIN_PX, parsed));
	return Math.round(clamped);
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

export function hasCarouselSlideCopy(
	slide: Pick<CarouselSlideRow, 'role' | 'headline' | 'body' | 'cta' | 'visual_brief' | 'freepik_query'>,
	contentMode: CarouselContentMode = 'standard'
): boolean {
	const isQuoteMode = contentMode === 'quote';
	const hasHeadline = hasNonEmptyString(slide.headline);
	const hasVisualBrief = hasNonEmptyString(slide.visual_brief);
	const requiresQuery = !isQuoteMode || slide.role === 'cta';
	const hasQuery = !requiresQuery || hasNonEmptyString(slide.freepik_query);

	if (!hasHeadline || !hasVisualBrief || !hasQuery) return false;
	if (slide.role === 'cover') return true;
	if (slide.role === 'body') return isQuoteMode ? true : hasNonEmptyString(slide.body);
	return hasNonEmptyString(slide.cta);
}

export function getCarouselSlideBlockers(
	slide: CarouselSlideLike,
	contentMode: CarouselContentMode = 'standard'
): string[] {
	const blockers: string[] = [];
	const isQuoteMode = contentMode === 'quote';
	if (!hasNonEmptyString(slide.headline)) blockers.push('headline');
	if (!hasNonEmptyString(slide.visual_brief)) blockers.push('visual brief');
	if (slide.role === 'cta') {
		if (!hasNonEmptyString(slide.freepik_query)) blockers.push('asset query');
		if (!hasNonEmptyString(slide.cta)) blockers.push('CTA');
		if (!hasCarouselSlideAsset(slide)) blockers.push('selected asset');
		return blockers;
	}
	if (!isQuoteMode && !hasNonEmptyString(slide.freepik_query)) blockers.push('asset query');
	if (slide.role === 'body' && !isQuoteMode && !hasNonEmptyString(slide.body)) blockers.push('body copy');
	if (!isQuoteMode && !hasCarouselSlideAsset(slide)) blockers.push('selected asset');
	return blockers;
}

export function getCarouselSlideReadiness(
	slide: CarouselSlideLike,
	contentMode: CarouselContentMode = 'standard'
): {
	hasCopy: boolean;
	hasAsset: boolean;
	isReady: boolean;
	blockers: string[];
} {
	const hasCopy = hasCarouselSlideCopy(slide, contentMode);
	const hasAsset = hasCarouselSlideAsset(slide);
	const blockers = getCarouselSlideBlockers(slide, contentMode);
	const requiresAsset = contentMode === 'standard' || slide.role === 'cta';
	return {
		hasCopy,
		hasAsset,
		isReady: hasCopy && (requiresAsset ? hasAsset : true),
		blockers
	};
}

export function getCarouselProjectBlockers(
	project: CarouselProjectLike | null | undefined,
	slides: CarouselSlideLike[]
): string[] {
	const blockers: string[] = [];
	const contentMode = resolveContentMode(project);
	if (!hasNonEmptyString(project?.title)) blockers.push('Project title is missing');
	if (!hasNonEmptyString(project?.caption)) blockers.push('Caption is missing');
	if (contentMode === 'quote') {
		if (!hasNonEmptyString(project?.account_display_name)) blockers.push('Account display name is missing');
		if (!hasNonEmptyString(project?.account_avatar_url)) blockers.push('Account avatar is missing');
	}
	if (slides.length === 0) blockers.push('Generate slides before exporting');

	for (const slide of slides) {
		const slideBlockers = getCarouselSlideBlockers(slide, contentMode);
		if (slideBlockers.length === 0) continue;
		blockers.push(`Slide ${slide.position}: ${slideBlockers.join(', ')}`);
	}

	return blockers;
}

export function deriveCarouselProjectStatus(
	project: CarouselProjectLike | null | undefined,
	slides: CarouselSlideLike[],
	explicitStatus?: CarouselProjectStatus | null
): CarouselProjectStatus {
	if (explicitStatus === 'archived') return 'archived';
	if (explicitStatus === 'exported') return 'exported';
	if (explicitStatus === 'draft' || explicitStatus === 'ready') return explicitStatus;
	if (project?.status === 'archived') return 'archived';
	const blockers = getCarouselProjectBlockers(project, slides);
	if (blockers.length > 0) return 'draft';
	if (slides.length === 0) return 'draft';

	const contentMode = resolveContentMode(project);
	const everySlideReady = slides.every((slide) => getCarouselSlideReadiness(slide, contentMode).isReady);
	return everySlideReady ? 'ready' : 'draft';
}
