import type { CarouselFontPreset } from '$lib/types';

export type VideoCarouselStatus = 'draft' | 'composing' | 'ready' | 'exported';
export type VideoTextPosition = 'top' | 'center' | 'bottom';
export type VideoLayoutType = 'standard' | 'quiz' | 'quote' | 'listicle' | 'stat';
export type VideoCarouselTemplateType = 'quiz' | 'quote' | 'listicle' | 'stat';
export type VideoFilterType = 'none' | 'grayscale';
export type VideoCarouselMusicTrackId = 'none' | 'biglot_pulse' | 'market_lofi' | 'calm_focus';
export type VideoCarouselMusicSelection = 'auto' | VideoCarouselMusicTrackId;
export type VideoCarouselMusicSource = 'generated' | 'jamendo';

export interface VideoCarouselExternalMusicTrack {
	source: 'jamendo';
	external_id: string;
	title: string;
	artist_name: string;
	audio_url: string;
	page_url: string | null;
	license_url: string | null;
	attribution_text: string;
	duration_seconds: number | null;
	image_url: string | null;
	tags: string[];
}

export interface VideoTextBoxTransform {
	x_px: number;
	y_px: number;
	scale_percent: number;
}
export type VideoTextBoxTransforms = Record<string, VideoTextBoxTransform>;
export interface VideoSlideSource {
	title: string;
	url: string;
	snippet: string;
	published_date: string | null;
}
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
	sources: VideoSlideSource[];
	caption: string | null;
	created_at: string;
	updated_at: string;
}

export interface VideoCarouselProject {
	id: string;
	title: string;
	status: VideoCarouselStatus;
	template_type: VideoCarouselTemplateType;
	font_preset: CarouselFontPreset;
	music_track_id: VideoCarouselMusicTrackId;
	music_source: VideoCarouselMusicSource;
	music_external_id: string | null;
	music_title: string | null;
	music_artist_name: string | null;
	music_audio_url: string | null;
	music_page_url: string | null;
	music_license_url: string | null;
	music_attribution_text: string | null;
	music_duration_seconds: number | null;
	music_image_url: string | null;
	music_volume_percent: number;
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
export const VIDEO_LISTICLE_MIN_ITEMS = 3;
export const VIDEO_LISTICLE_MAX_ITEMS = 7;
export const VIDEO_LISTICLE_DEFAULT_ITEMS = 5;
export const VIDEO_CAROUSEL_DEFAULT_MUSIC_VOLUME_PERCENT = 45;

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
	listicle: 'รวมทุกอันดับ #5 → #1 ไว้ใน video เดียว พร้อมหัวข้อและรายการอันดับ',
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

export interface VideoCarouselMusicTrack {
	id: VideoCarouselMusicTrackId;
	label: string;
	mood: string;
	bpm: number | null;
	safe_note: string;
}

export const VIDEO_CAROUSEL_MUSIC_TRACKS: VideoCarouselMusicTrack[] = [
	{
		id: 'none',
		label: 'ไม่มีเพลง',
		mood: 'ใช้เฉพาะภาพและข้อความ',
		bpm: null,
		safe_note: 'ไม่มี audio track'
	},
	{
		id: 'biglot_pulse',
		label: 'BigLot Pulse',
		mood: 'จังหวะมั่นใจสำหรับ market hook',
		bpm: 104,
		safe_note: 'Synth loop สร้างใน browser ไม่มี sample ภายนอก'
	},
	{
		id: 'market_lofi',
		label: 'Market Lo-fi',
		mood: 'นุ่ม เท่ เหมาะกับ quote และ mindset',
		bpm: 82,
		safe_note: 'Synth loop สร้างใน browser ไม่มี sample ภายนอก'
	},
	{
		id: 'calm_focus',
		label: 'Calm Focus',
		mood: 'เบา โปร่ง เหมาะกับ stat และ insight',
		bpm: 72,
		safe_note: 'Synth loop สร้างใน browser ไม่มี sample ภายนอก'
	}
];

export const VIDEO_CAROUSEL_MUSIC_TRACK_BY_ID: Record<VideoCarouselMusicTrackId, VideoCarouselMusicTrack> =
	Object.fromEntries(VIDEO_CAROUSEL_MUSIC_TRACKS.map((track) => [track.id, track])) as Record<
		VideoCarouselMusicTrackId,
		VideoCarouselMusicTrack
	>;

const MUSIC_RECOMMENDATION_KEYWORDS: Array<{
	track_id: Exclude<VideoCarouselMusicTrackId, 'none'>;
	reason: string;
	keywords: string[];
}> = [
	{
		track_id: 'market_lofi',
		reason: 'เหมาะกับคอนเทนต์ mindset / quote ที่ต้องการโทนนิ่งและฟังสบาย',
		keywords: [
			'mindset',
			'psychology',
			'discipline',
			'patience',
			'emotion',
			'วินัย',
			'จิตวิทยา',
			'อารมณ์',
			'ใจ',
			'อดทน',
			'รอจังหวะ',
			'คำคม',
			'กลัว',
			'โลภ',
			'มั่นใจ'
		]
	},
	{
		track_id: 'calm_focus',
		reason: 'เหมาะกับคอนเทนต์ตัวเลข ความเสี่ยง หรือ insight ที่ต้องการความน่าเชื่อถือ',
		keywords: [
			'stat',
			'data',
			'risk',
			'drawdown',
			'stop loss',
			'cut loss',
			'loss',
			'สถิติ',
			'ตัวเลข',
			'ข้อมูล',
			'ความเสี่ยง',
			'ขาดทุน',
			'หมดพอร์ต',
			'พอร์ต',
			'คัทลอส',
			'ตัดขาดทุน'
		]
	},
	{
		track_id: 'biglot_pulse',
		reason: 'เหมาะกับ market hook, ข่าว, quiz และ listicle ที่ต้องการจังหวะดึงความสนใจ',
		keywords: [
			'news',
			'fed',
			'fomc',
			'cpi',
			'nfp',
			'inflation',
			'interest',
			'gold',
			'xau',
			'volatility',
			'breakout',
			'ข่าว',
			'เฟด',
			'เงินเฟ้อ',
			'ดอกเบี้ย',
			'ทอง',
			'ราคาทอง',
			'ผันผวน',
			'เศรษฐกิจ',
			'อันดับ',
			'เลือกทางไหน'
		]
	}
];

function normalizeRecommendationText(value: string | null | undefined): string {
	return (value ?? '').trim().toLowerCase();
}

function defaultMusicTrackForTemplate(templateType: VideoCarouselTemplateType): Exclude<VideoCarouselMusicTrackId, 'none'> {
	if (templateType === 'quote') return 'market_lofi';
	if (templateType === 'stat') return 'calm_focus';
	return 'biglot_pulse';
}

export function recommendVideoCarouselMusicTrack(input: {
	template_type: VideoCarouselTemplateType;
	topic?: string | null;
}): Exclude<VideoCarouselMusicTrackId, 'none'> {
	const topic = normalizeRecommendationText(input.topic);
	if (topic) {
		for (const group of MUSIC_RECOMMENDATION_KEYWORDS) {
			if (group.keywords.some((keyword) => topic.includes(keyword))) return group.track_id;
		}
	}
	return defaultMusicTrackForTemplate(input.template_type);
}

export function describeVideoCarouselMusicRecommendation(input: {
	template_type: VideoCarouselTemplateType;
	topic?: string | null;
}): string {
	const trackId = recommendVideoCarouselMusicTrack(input);
	const topic = normalizeRecommendationText(input.topic);
	if (topic) {
		const keywordGroup = MUSIC_RECOMMENDATION_KEYWORDS.find((group) => group.track_id === trackId);
		if (keywordGroup?.keywords.some((keyword) => topic.includes(keyword))) return keywordGroup.reason;
	}
	if (input.template_type === 'quote') return 'Quote ใช้โทน lo-fi ที่ไม่แย่งความสนใจจากข้อความหลัก';
	if (input.template_type === 'stat') return 'Stat ใช้โทนเบาและนิ่ง เพื่อให้ตัวเลขดูน่าเชื่อถือ';
	return 'Template นี้ต้องเริ่มไวและดึง attention จึงใช้จังหวะ pulse';
}

export function videoCarouselTotalDuration(slides: VideoCarouselSlide[]): number {
	return slides.reduce((sum, s) => sum + s.duration_seconds, 0);
}
