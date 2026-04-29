import { supabaseAdmin } from '$lib/server/supabase-admin';
import type {
	VideoCarouselProject,
	VideoCarouselSlide,
	VideoCarouselStatus,
	VideoTextPosition,
	VideoLayoutType,
	VideoCarouselTemplateType
} from '$lib/video-carousel';
import type { CarouselFontPreset } from '$lib/types';

type JsonRecord = Record<string, unknown>;

function db() {
	if (!supabaseAdmin) throw new Error('SUPABASE_SERVICE_ROLE_KEY is required');
	return supabaseAdmin;
}

function normalizeStatus(value: unknown): VideoCarouselStatus {
	if (value === 'composing' || value === 'ready' || value === 'exported') return value;
	return 'draft';
}

function normalizeTextPosition(value: unknown): VideoTextPosition {
	if (value === 'top' || value === 'bottom') return value;
	return 'center';
}

function normalizeFontPreset(value: unknown): CarouselFontPreset {
	const valid = new Set(['biglot', 'apple_clean', 'mitr_friendly', 'ibm_plex_thai', 'editorial_serif', 'kanit', 'prompt_clean', 'poppins_thai', 'bebas_impact']);
	return valid.has(value as string) ? (value as CarouselFontPreset) : 'biglot';
}

function normalizeTemplateType(value: unknown): VideoCarouselTemplateType {
	return value === 'quote' ? 'quote' : 'quiz';
}

function normalizeProject(row: JsonRecord): VideoCarouselProject {
	return {
		id: row.id as string,
		title: typeof row.title === 'string' ? row.title : 'Untitled',
		status: normalizeStatus(row.status),
		template_type: normalizeTemplateType(row.template_type),
		font_preset: normalizeFontPreset(row.font_preset),
		aspect_ratio: '9:16',
		created_at: row.created_at as string,
		updated_at: row.updated_at as string
	};
}

function normalizeLayoutType(value: unknown): VideoLayoutType {
	if (value === 'quiz' || value === 'quote') return value;
	return 'standard';
}

function normalizeOptions(value: unknown): string[] {
	if (!Array.isArray(value)) return [];
	return value.filter((v): v is string => typeof v === 'string');
}

function normalizeSlide(row: JsonRecord): VideoCarouselSlide {
	return {
		id: row.id as string,
		project_id: row.project_id as string,
		position: Number(row.position),
		layout_type: normalizeLayoutType(row.layout_type),
		text: typeof row.text === 'string' ? row.text : '',
		accent_text: typeof row.accent_text === 'string' && row.accent_text.trim() ? row.accent_text.trim() : null,
		subtext: typeof row.subtext === 'string' && row.subtext.trim() ? row.subtext.trim() : null,
		options: normalizeOptions(row.options_json),
		text_position: normalizeTextPosition(row.text_position),
		pexels_video_id: typeof row.pexels_video_id === 'number' ? row.pexels_video_id : null,
		video_url: typeof row.video_url === 'string' ? row.video_url : null,
		thumbnail_url: typeof row.thumbnail_url === 'string' ? row.thumbnail_url : null,
		duration_seconds: Number(row.duration_seconds ?? 10),
		search_query: typeof row.search_query === 'string' ? row.search_query : null,
		created_at: row.created_at as string,
		updated_at: row.updated_at as string
	};
}

export async function listVideoCarouselProjects(): Promise<VideoCarouselProject[]> {
	const { data, error } = await db()
		.from('video_carousel_projects')
		.select('*')
		.order('updated_at', { ascending: false });
	if (error) throw new Error(error.message);
	return ((data ?? []) as JsonRecord[]).map(normalizeProject);
}

export async function getVideoCarouselProject(id: string): Promise<VideoCarouselProject | null> {
	const { data, error } = await db()
		.from('video_carousel_projects')
		.select('*')
		.eq('id', id)
		.single();
	if (error) {
		if (error.code === 'PGRST116') return null;
		throw new Error(error.message);
	}
	return normalizeProject(data as JsonRecord);
}

export async function getVideoCarouselSlides(projectId: string): Promise<VideoCarouselSlide[]> {
	const { data, error } = await db()
		.from('video_carousel_slides')
		.select('*')
		.eq('project_id', projectId)
		.order('position', { ascending: true });
	if (error) throw new Error(error.message);
	return ((data ?? []) as JsonRecord[]).map(normalizeSlide);
}

export async function createVideoCarouselProject(input: {
	title: string;
	template_type?: VideoCarouselTemplateType;
	font_preset?: CarouselFontPreset;
}): Promise<VideoCarouselProject> {
	const { data, error } = await db()
		.from('video_carousel_projects')
		.insert({
			title: input.title.trim() || 'Untitled video carousel',
			status: 'draft',
			template_type: input.template_type ?? 'quiz',
			font_preset: input.font_preset ?? 'biglot',
			aspect_ratio: '9:16'
		})
		.select('*')
		.single();
	if (error) throw new Error(error.message);
	return normalizeProject(data as JsonRecord);
}

export async function upsertVideoCarouselSlides(
	projectId: string,
	slides: Array<{
		position: number;
		layout_type?: VideoLayoutType;
		text: string;
		accent_text?: string | null;
		subtext?: string | null;
		options?: string[];
		text_position: VideoTextPosition;
		pexels_video_id?: number | null;
		video_url?: string | null;
		thumbnail_url?: string | null;
		duration_seconds: number;
		search_query?: string | null;
	}>
): Promise<VideoCarouselSlide[]> {
	const { error: deleteError } = await db()
		.from('video_carousel_slides')
		.delete()
		.eq('project_id', projectId);
	if (deleteError) throw new Error(deleteError.message);

	if (slides.length === 0) return [];

	const rows = slides.map((s) => ({
		project_id: projectId,
		position: s.position,
		layout_type: s.layout_type ?? 'quiz',
		text: s.text,
		accent_text: s.accent_text ?? null,
		subtext: s.subtext ?? null,
		options_json: s.options ?? [],
		text_position: s.text_position,
		pexels_video_id: s.pexels_video_id ?? null,
		video_url: s.video_url ?? null,
		thumbnail_url: s.thumbnail_url ?? null,
		duration_seconds: s.duration_seconds,
		search_query: s.search_query ?? null
	}));

	const { data, error } = await db()
		.from('video_carousel_slides')
		.insert(rows)
		.select('*')
		.order('position', { ascending: true });

	if (error) throw new Error(error.message);
	return ((data ?? []) as JsonRecord[]).map(normalizeSlide);
}

export async function updateVideoCarouselSlide(
	slideId: string,
	patch: Partial<{
		layout_type: VideoLayoutType;
		text: string;
		accent_text: string | null;
		subtext: string | null;
		options_json: string[];
		text_position: VideoTextPosition;
		pexels_video_id: number | null;
		video_url: string | null;
		thumbnail_url: string | null;
		duration_seconds: number;
	}>
): Promise<VideoCarouselSlide> {
	const { data, error } = await db()
		.from('video_carousel_slides')
		.update({ ...patch, updated_at: new Date().toISOString() })
		.eq('id', slideId)
		.select('*')
		.single();
	if (error) throw new Error(error.message);
	return normalizeSlide(data as JsonRecord);
}

export async function updateVideoCarouselProject(
	id: string,
	patch: Partial<{
		title: string;
		status: VideoCarouselStatus;
		template_type: VideoCarouselTemplateType;
		font_preset: CarouselFontPreset;
	}>
): Promise<VideoCarouselProject> {
	const { data, error } = await db()
		.from('video_carousel_projects')
		.update({ ...patch, updated_at: new Date().toISOString() })
		.eq('id', id)
		.select('*')
		.single();
	if (error) throw new Error(error.message);
	return normalizeProject(data as JsonRecord);
}

export async function deleteVideoCarouselProject(id: string): Promise<void> {
	const { error } = await db().from('video_carousel_projects').delete().eq('id', id);
	if (error) throw new Error(error.message);
}
