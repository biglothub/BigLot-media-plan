import type { CarouselFontPreset } from '$lib/types';

export type VideoCarouselStatus = 'draft' | 'composing' | 'ready' | 'exported';
export type VideoTextPosition = 'top' | 'center' | 'bottom';
export type VideoLayoutType = 'standard' | 'quiz';

export interface VideoCarouselSlide {
	id: string;
	project_id: string;
	position: number;
	layout_type: VideoLayoutType;
	text: string;
	accent_text: string | null;
	subtext: string | null;
	options: string[];
	text_position: VideoTextPosition;
	pexels_video_id: number | null;
	video_url: string | null;
	thumbnail_url: string | null;
	duration_seconds: number;
	search_query: string | null;
	created_at: string;
	updated_at: string;
}

export interface VideoCarouselProject {
	id: string;
	title: string;
	status: VideoCarouselStatus;
	font_preset: CarouselFontPreset;
	aspect_ratio: '9:16';
	created_at: string;
	updated_at: string;
}

export interface VideoCarouselBundle {
	project: VideoCarouselProject;
	slides: VideoCarouselSlide[];
}

export const VIDEO_CAROUSEL_CANVAS_WIDTH = 1080;
export const VIDEO_CAROUSEL_CANVAS_HEIGHT = 1920;

export const OPTION_LETTERS = ['A', 'B', 'C', 'D', 'E', 'F', 'G', 'H'];
export const ACCENT_COLOR = '#F5C518'; // gold yellow matching the screenshot

export const VIDEO_FONT_MAP: Record<CarouselFontPreset, string> = {
	biglot: '"Noto Sans Thai", sans-serif',
	apple_clean: '"Space Grotesk", "Noto Sans Thai", sans-serif',
	mitr_friendly: '"Mitr", "Noto Sans Thai", sans-serif',
	ibm_plex_thai: '"IBM Plex Sans Thai", "Noto Sans Thai", sans-serif',
	editorial_serif: '"Playfair Display", "Noto Sans Thai", serif'
};

export const FONT_PRESET_LABELS: Record<CarouselFontPreset, string> = {
	biglot: 'BigLot (default)',
	apple_clean: 'Apple Clean',
	mitr_friendly: 'Mitr Friendly',
	ibm_plex_thai: 'IBM Plex Thai',
	editorial_serif: 'Editorial Serif'
};

export const VIDEO_CAROUSEL_STATUS_LABELS: Record<VideoCarouselStatus, string> = {
	draft: 'Draft',
	composing: 'Composing',
	ready: 'Ready',
	exported: 'Exported'
};

export function videoCarouselTotalDuration(slides: VideoCarouselSlide[]): number {
	return slides.reduce((sum, s) => sum + s.duration_seconds, 0);
}
