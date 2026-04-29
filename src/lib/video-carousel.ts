import type { CarouselFontPreset } from '$lib/types';

export type VideoCarouselStatus = 'draft' | 'composing' | 'ready' | 'exported';
export type VideoTextPosition = 'top' | 'center' | 'bottom';
export type VideoLayoutType = 'standard' | 'quiz' | 'quote' | 'listicle' | 'stat';
export type VideoCarouselTemplateType = 'quiz' | 'quote' | 'listicle' | 'stat';
export type VideoFilterType = 'none' | 'grayscale';
export interface VideoTextBoxTransform {
	x_px: number;
	y_px: number;
	scale_percent: number;
}
export type VideoTextBoxTransforms = Record<string, VideoTextBoxTransform>;
export type VideoQuoteCategory =
	| 'discipline'
	| 'mindset'
	| 'risk'
	| 'patience'
	| 'news'
	| 'cut_loss'
	| 'trading_plan'
	| 'confidence';

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
	text_offset_x_px: number;
	text_offset_y_px: number;
	text_scale_percent: number;
	text_box_transforms: VideoTextBoxTransforms;
	pexels_video_id: number | null;
	video_url: string | null;
	thumbnail_url: string | null;
	video_filter: VideoFilterType;
	duration_seconds: number;
	search_query: string | null;
	created_at: string;
	updated_at: string;
}

export interface VideoCarouselProject {
	id: string;
	title: string;
	status: VideoCarouselStatus;
	template_type: VideoCarouselTemplateType;
	font_preset: CarouselFontPreset;
	aspect_ratio: '9:16';
	created_at: string;
	updated_at: string;
}

export interface VideoCarouselProjectPreview {
	id: string;
	position: number;
	video_url: string | null;
	thumbnail_url: string | null;
	video_filter: VideoFilterType;
	duration_seconds: number;
}

export interface VideoCarouselProjectListItem extends VideoCarouselProject {
	preview: VideoCarouselProjectPreview | null;
	slide_count: number;
	total_duration_seconds: number;
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
	editorial_serif: '"Playfair Display", "Noto Sans Thai", serif',
	kanit: '"Kanit", sans-serif',
	prompt_clean: '"Prompt", sans-serif',
	poppins_thai: '"Poppins", "Sarabun", sans-serif',
	bebas_impact: '"Bebas Neue", "Noto Sans Thai", sans-serif'
};

export const FONT_PRESET_LABELS: Record<CarouselFontPreset, string> = {
	biglot: 'BigLot (default)',
	apple_clean: 'Apple Clean',
	mitr_friendly: 'Mitr Friendly',
	ibm_plex_thai: 'IBM Plex Thai',
	editorial_serif: 'Editorial Serif',
	kanit: 'Kanit',
	prompt_clean: 'Prompt Clean',
	poppins_thai: 'Poppins + Sarabun',
	bebas_impact: 'Bebas Impact'
};

export const VIDEO_CAROUSEL_TEMPLATE_LABELS: Record<VideoCarouselTemplateType, string> = {
	quiz: 'Quiz / ตัวเลือก',
	quote: 'Quote / คำคม',
	listicle: 'Listicle / อันดับ Top N',
	stat: 'Stat / ตัวเลขช็อก'
};

export const VIDEO_CAROUSEL_TEMPLATE_DESCRIPTIONS: Record<VideoCarouselTemplateType, string> = {
	quiz: 'Template ตามตัวอย่าง: หัวข้อหลัก ข้อความเน้นสีทอง และตัวเลือก A-F',
	quote: 'Template คำคม: ข้อความหลักกลางจอ พร้อมข้อความรองสั้น ๆ',
	listicle: 'นับถอยหลัง #5 → #1 แต่ละสไลด์โชว์อันดับ + หัวข้อ + caption สั้น',
	stat: 'ตัวเลขใหญ่กลางจอ + ประโยค claim + source อ้างอิง (ฮุก "90% ของเทรดเดอร์...")'
};

export const VIDEO_FILTER_LABELS: Record<VideoFilterType, string> = {
	none: 'สีปกติ',
	grayscale: 'ขาวดำ'
};

export const VIDEO_QUOTE_CATEGORY_LABELS: Record<VideoQuoteCategory, string> = {
	discipline: 'วินัยการเทรด',
	mindset: 'Mindset / จิตวิทยา',
	risk: 'Risk management',
	patience: 'รอจังหวะ / ความอดทน',
	news: 'รับมือข่าว',
	cut_loss: 'Cut loss / ยอมผิด',
	trading_plan: 'Trading plan',
	confidence: 'ความมั่นใจพอดี'
};

export const VIDEO_QUOTE_CATEGORY_PROMPTS: Record<VideoQuoteCategory, string> = {
	discipline: 'เน้นวินัย การทำตามกฎ และการไม่หลุดแผนตอนกราฟผันผวน',
	mindset: 'เน้นจิตวิทยาเทรดเดอร์ อารมณ์ ความกลัว ความโลภ และการจัดการใจ',
	risk: 'เน้นการคุมความเสี่ยง position size, R:R, drawdown และการอยู่รอดในตลาด',
	patience: 'เน้นการรอจังหวะ ไม่ไล่ราคา และไม่เข้าเทรดเพราะกลัวพลาด',
	news: 'เน้นการรับมือข่าวแรง ความผันผวน และการไม่เดาทิศทางก่อนตลาดเฉลย',
	cut_loss: 'เน้นการยอมรับว่าผิด การ cut loss และไม่ปล่อยให้ไม้เดียวทำลายพอร์ต',
	trading_plan: 'เน้นแผนเทรด checklist ก่อนเข้า และการวัดผลตามระบบ',
	confidence: 'เน้นความมั่นใจที่พอดี ไม่ overtrade และไม่มั่นใจเกินจนลืมความเสี่ยง'
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
