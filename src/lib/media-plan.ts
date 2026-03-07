import type { BacklogContentCategory, BacklogContentType, IdeaBacklogRow, ProductionStage, SupportedPlatform } from '$lib/types';

export const numberFormatter = new Intl.NumberFormat('en-US');

export const CONTENT_CATEGORY_ORDER = ['pin', 'hero', 'hub', 'help'] as const satisfies readonly BacklogContentCategory[];

export function backlogCode(idea: Pick<IdeaBacklogRow, 'id' | 'idea_code'>): string {
	const code = idea.idea_code?.trim();
	return code ? code : `BL-${idea.id.slice(0, 8).toUpperCase()}`;
}

export function toCategorySelectValue(
	value: BacklogContentCategory | null | undefined,
): BacklogContentCategory | '' {
	return value ?? '';
}

export function fromCategorySelectValue(
	value: BacklogContentCategory | '',
): BacklogContentCategory | null {
	return value || null;
}

export const platformOrder = ['youtube', 'facebook', 'instagram', 'tiktok'] as const;

export const platformLabel: Record<SupportedPlatform, string> = {
	youtube: 'YouTube',
	facebook: 'Facebook',
	instagram: 'Instagram',
	tiktok: 'TikTok'
};

export const contentTypeLabel: Record<BacklogContentType, string> = {
	video: 'Video',
	post: 'Post',
	image: 'Image',
	live: 'Live'
};

export const contentCategoryLabel: Record<BacklogContentCategory, string> = {
	hero: 'Hero',
	help: 'Help',
	hub: 'Hub',
	pin: 'Pin'
};

export const PRODUCTION_STAGES: ProductionStage[] = [
	'planned', 'scripting', 'shooting', 'editing', 'review', 'published'
];

export const stageLabel: Record<ProductionStage, string> = {
	planned: 'วางแผนแล้ว',
	scripting: 'เขียนสคริปต์',
	shooting: 'ถ่ายทำ',
	editing: 'ตัดต่อ',
	review: 'รออนุมัติ',
	published: 'เผยแพร่แล้ว'
};

export function nextStage(current: ProductionStage): ProductionStage {
	const idx = PRODUCTION_STAGES.indexOf(current);
	return PRODUCTION_STAGES[(idx + 1) % PRODUCTION_STAGES.length];
}

export function formatCount(value: number | null | undefined): string {
	return value === null || value === undefined ? '-' : numberFormatter.format(value);
}

export function toIsoLocalDate(date: Date): string {
	const year = date.getFullYear();
	const month = String(date.getMonth() + 1).padStart(2, '0');
	const day = String(date.getDate()).padStart(2, '0');
	return `${year}-${month}-${day}`;
}

export function parseIsoDate(isoDate: string): Date {
	const [year, month, day] = isoDate.split('-').map(Number);
	return new Date(year, month - 1, day);
}

export function getMonthStartIso(date: Date): string {
	return toIsoLocalDate(new Date(date.getFullYear(), date.getMonth(), 1));
}

export function addMonthsIso(isoDate: string, months: number): string {
	const target = parseIsoDate(isoDate);
	return toIsoLocalDate(new Date(target.getFullYear(), target.getMonth() + months, 1));
}

export function formatMonthLabel(monthStartIso: string): string {
	return parseIsoDate(monthStartIso).toLocaleDateString('en-US', {
		month: 'long',
		year: 'numeric'
	});
}

export function formatCalendarDate(isoDate: string): string {
	return parseIsoDate(isoDate).toLocaleDateString('en-US', {
		weekday: 'short',
		month: 'short',
		day: 'numeric'
	});
}

export function formatCalendarDayNumber(isoDate: string): string {
	return String(parseIsoDate(isoDate).getDate());
}

export function formatCalendarDayMeta(isoDate: string): string {
	return parseIsoDate(isoDate).toLocaleDateString('en-US', {
		month: 'short',
		day: 'numeric'
	});
}

export function buildMonthCells(monthStartIso: string): Array<{
	dateIso: string;
	inCurrentMonth: boolean;
}> {
	const monthStart = parseIsoDate(monthStartIso);
	const firstDayOffset = (monthStart.getDay() + 6) % 7;
	const gridStart = new Date(monthStart.getFullYear(), monthStart.getMonth(), 1 - firstDayOffset);

	return Array.from({ length: 42 }, (_, index) => {
		const current = new Date(gridStart);
		current.setDate(gridStart.getDate() + index);
		return {
			dateIso: toIsoLocalDate(current),
			inCurrentMonth: current.getMonth() === monthStart.getMonth()
		};
	});
}

export function getYouTubeEmbedUrl(videoUrl: string): string | null {
	try {
		const parsed = new URL(videoUrl);
		const host = parsed.hostname.toLowerCase();
		if (!host.includes('youtube.com') && !host.includes('youtu.be')) return null;

		if (host.includes('youtu.be')) {
			const id = parsed.pathname.slice(1).split('/')[0];
			return id ? `https://www.youtube.com/embed/${id}` : null;
		}

		const shortsMatch = parsed.pathname.match(/\/shorts\/([^/?#]+)/);
		if (shortsMatch) return `https://www.youtube.com/embed/${shortsMatch[1]}`;

		const videoId = parsed.searchParams.get('v');
		return videoId ? `https://www.youtube.com/embed/${videoId}` : null;
	} catch {
		return null;
	}
}

export function getFacebookEmbedUrl(videoUrl: string): string | null {
	try {
		const parsed = new URL(videoUrl);
		const host = parsed.hostname.toLowerCase();
		if (!host.includes('facebook.com') && !host.includes('fb.watch')) return null;
		return `https://www.facebook.com/plugins/video.php?href=${encodeURIComponent(videoUrl)}&show_text=false`;
	} catch {
		return null;
	}
}

export function getTikTokEmbedUrl(videoUrl: string): string | null {
	try {
		const parsed = new URL(videoUrl);
		const hostname = parsed.hostname.toLowerCase();
		if (!hostname.includes('tiktok.com')) return null;

		const videoId =
			parsed.pathname.match(/\/video\/(\d+)/)?.[1] ?? parsed.pathname.match(/\/v\/(\d+)/)?.[1] ?? null;

		return videoId ? `https://www.tiktok.com/embed/v2/${videoId}` : null;
	} catch {
		return null;
	}
}

export function getInstagramEmbedUrl(videoUrl: string): string | null {
	try {
		const parsed = new URL(videoUrl);
		const hostname = parsed.hostname.toLowerCase();
		if (!hostname.includes('instagram.com')) return null;

		const match = parsed.pathname.match(/\/(p|reels?|tv)\/([^/?#]+)/);
		if (!match) return null;

		const type = match[1] === 'reels' ? 'reel' : match[1];
		const shortcode = match[2];
		return `https://www.instagram.com/${type}/${shortcode}/embed/captioned`;
	} catch {
		return null;
	}
}

export function getPlatformFromUrl(url: string): SupportedPlatform | null {
	try {
		const host = new URL(url).hostname.toLowerCase();
		if (host.includes('youtu.be') || host.includes('youtube.com')) return 'youtube';
		if (host.includes('facebook.com') || host.includes('fb.watch')) return 'facebook';
		if (host.includes('instagram.com')) return 'instagram';
		if (host.includes('tiktok.com')) return 'tiktok';
		return null;
	} catch {
		return null;
	}
}

export function normalizeMetricValue(value: unknown): number | null {
	return typeof value === 'number' && Number.isFinite(value) ? value : null;
}

export type MetricSourceType = 'auto' | 'manual';

const autoMetrics: Record<SupportedPlatform, string[]> = {
	youtube: ['views', 'likes', 'comments'],
	tiktok: ['views', 'likes', 'comments', 'shares', 'saves'],
	facebook: ['views', 'likes', 'comments', 'shares'],
	instagram: []
};

export function getMetricSource(
	platform: SupportedPlatform,
	metric: 'followers' | 'views' | 'likes' | 'comments' | 'shares' | 'saves'
): MetricSourceType {
	if (metric === 'followers') return 'manual';
	return autoMetrics[platform].includes(metric) ? 'auto' : 'manual';
}

export function isYouTubeShort(url: string): boolean {
	try {
		const parsed = new URL(url);
		const host = parsed.hostname.toLowerCase();
		if (!host.includes('youtube.com') && !host.includes('youtu.be')) return false;
		return parsed.pathname.toLowerCase().includes('/shorts/');
	} catch {
		return false;
	}
}
