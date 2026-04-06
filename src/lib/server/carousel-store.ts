import { deriveCarouselProjectStatus, normalizeCarouselTextLetterSpacingEm, normalizeHashtags } from '$lib/carousel';
import { supabase } from '$lib/supabase';
import type {
	CarouselAsset,
	CarouselFontPreset,
	CarouselProjectRow,
	CarouselProjectStatus,
	CarouselSlideRow,
	IdeaBacklogRow
} from '$lib/types';

type JsonRecord = Record<string, unknown>;
type SupabaseLikeError = { message?: string; details?: string; hint?: string; code?: string } | null | undefined;

export function isMissingCarouselProjectColumnError(error: SupabaseLikeError, columnName: string): boolean {
	const combined = `${error?.message ?? ''}\n${error?.details ?? ''}\n${error?.hint ?? ''}`.toLowerCase();
	return (
		combined.includes(columnName.toLowerCase()) &&
		(combined.includes('schema cache') || combined.includes('column') || error?.code === 'PGRST204')
	);
}

export function isMissingFontPresetColumnError(error: SupabaseLikeError): boolean {
	return isMissingCarouselProjectColumnError(error, 'font_preset');
}

function normalizeRelation<T>(value: unknown): T | null {
	if (Array.isArray(value)) {
		return (value[0] ?? null) as T | null;
	}
	return (value as T | null) ?? null;
}

function normalizeCarouselAssetList(value: unknown): CarouselAsset[] | null {
	if (!Array.isArray(value)) return null;
	return value.filter((item): item is CarouselAsset => Boolean(item && typeof item === 'object'));
}

function normalizeCarouselSlide(row: JsonRecord): CarouselSlideRow {
	return {
		id: row.id as string,
		project_id: row.project_id as string,
		position: Number(row.position),
		role: row.role as CarouselSlideRow['role'],
		layout_variant: row.layout_variant as CarouselSlideRow['layout_variant'],
		headline: typeof row.headline === 'string' ? row.headline : null,
		body: typeof row.body === 'string' ? row.body : null,
		cta: typeof row.cta === 'string' ? row.cta : null,
		visual_brief: typeof row.visual_brief === 'string' ? row.visual_brief : null,
		freepik_query: typeof row.freepik_query === 'string' ? row.freepik_query : null,
		candidate_assets_json: normalizeCarouselAssetList(row.candidate_assets_json),
		selected_asset_json:
			row.selected_asset_json && typeof row.selected_asset_json === 'object'
				? (row.selected_asset_json as CarouselAsset)
				: null,
		selected_asset_storage_path: typeof row.selected_asset_storage_path === 'string' ? row.selected_asset_storage_path : null,
		created_at: row.created_at as string,
		updated_at: row.updated_at as string
	};
}

function normalizeCarouselProject(row: JsonRecord): CarouselProjectRow {
	return {
		id: row.id as string,
		backlog_id: row.backlog_id as string,
		platform: 'instagram',
		status: row.status as CarouselProjectStatus,
		font_preset: ((typeof row.font_preset === 'string' ? row.font_preset : 'biglot') as CarouselFontPreset) ?? 'biglot',
		text_letter_spacing_em: normalizeCarouselTextLetterSpacingEm(row.text_letter_spacing_em),
		title: typeof row.title === 'string' ? row.title : null,
		visual_direction: typeof row.visual_direction === 'string' ? row.visual_direction : null,
		caption: typeof row.caption === 'string' ? row.caption : null,
		hashtags_json: normalizeHashtags(row.hashtags_json as string[] | null),
		slide_count: Number(row.slide_count ?? 0),
		last_generated_at: typeof row.last_generated_at === 'string' ? row.last_generated_at : null,
		last_exported_at: typeof row.last_exported_at === 'string' ? row.last_exported_at : null,
		created_at: row.created_at as string,
		updated_at: row.updated_at as string,
		idea_backlog: normalizeRelation<IdeaBacklogRow>(row.idea_backlog)
	};
}

export async function listCarouselProjects(): Promise<CarouselProjectRow[]> {
	if (!supabase) throw new Error('Supabase not configured');

	const { data, error } = await supabase
		.from('carousel_projects')
		.select('*, idea_backlog(*)')
		.order('updated_at', { ascending: false });

	if (error) throw new Error(error.message);
	return ((data ?? []) as JsonRecord[]).map(normalizeCarouselProject);
}

export async function getCarouselProjectById(id: string): Promise<CarouselProjectRow | null> {
	if (!supabase) throw new Error('Supabase not configured');

	const { data, error } = await supabase
		.from('carousel_projects')
		.select('*, idea_backlog(*)')
		.eq('id', id)
		.single();

	if (error) {
		if (error.code === 'PGRST116') return null;
		throw new Error(error.message);
	}

	return normalizeCarouselProject(data as JsonRecord);
}

export async function getCarouselSlides(projectId: string): Promise<CarouselSlideRow[]> {
	if (!supabase) throw new Error('Supabase not configured');

	const { data, error } = await supabase
		.from('carousel_slides')
		.select('*')
		.eq('project_id', projectId)
		.order('position', { ascending: true });

	if (error) throw new Error(error.message);
	return ((data ?? []) as JsonRecord[]).map(normalizeCarouselSlide);
}

export async function getCarouselBundle(projectId: string): Promise<{ project: CarouselProjectRow; slides: CarouselSlideRow[] }> {
	const project = await getCarouselProjectById(projectId);
	if (!project) {
		throw new Error('Carousel project not found');
	}
	const slides = await getCarouselSlides(projectId);
	return { project, slides };
}

export async function ensureCarouselProject(backlogId: string): Promise<CarouselProjectRow> {
	if (!supabase) throw new Error('Supabase not configured');

	const { data: existing, error: existingError } = await supabase
		.from('carousel_projects')
		.select('*, idea_backlog(*)')
		.eq('backlog_id', backlogId)
		.maybeSingle();

	if (existingError) throw new Error(existingError.message);
	if (existing) return normalizeCarouselProject(existing as JsonRecord);

	const { data: backlog, error: backlogError } = await supabase
		.from('idea_backlog')
		.select('*')
		.eq('id', backlogId)
		.single();

	if (backlogError) throw new Error('Idea backlog not found');

	const { data, error } = await supabase
		.from('carousel_projects')
		.insert({
			backlog_id: backlogId,
			platform: 'instagram',
			status: 'draft',
			font_preset: 'biglot',
			title: backlog.title ?? 'Untitled carousel',
			caption: backlog.description ?? null,
			hashtags_json: [],
			slide_count: 0
		})
		.select('*, idea_backlog(*)')
		.single();

	if (error && isMissingFontPresetColumnError(error)) {
		const fallbackInsert = await supabase
			.from('carousel_projects')
			.insert({
				backlog_id: backlogId,
				platform: 'instagram',
				status: 'draft',
				title: backlog.title ?? 'Untitled carousel',
				caption: backlog.description ?? null,
				hashtags_json: [],
				slide_count: 0
			})
			.select('*, idea_backlog(*)')
			.single();

		if (fallbackInsert.error) throw new Error(fallbackInsert.error.message);
		return normalizeCarouselProject(fallbackInsert.data as JsonRecord);
	}

	if (error) throw new Error(error.message);
	return normalizeCarouselProject(data as JsonRecord);
}

export async function recomputeCarouselStatus(
	projectId: string,
	explicitStatus?: CarouselProjectStatus | null
): Promise<CarouselProjectStatus> {
	if (!supabase) throw new Error('Supabase not configured');

	const { project, slides } = await getCarouselBundle(projectId);
	const nextStatus = deriveCarouselProjectStatus(project, slides, explicitStatus);

	if (project.status !== nextStatus) {
		const { error } = await supabase
			.from('carousel_projects')
			.update({
				status: nextStatus,
				slide_count: slides.length,
				updated_at: new Date().toISOString()
			})
			.eq('id', projectId);

		if (error) throw new Error(error.message);
	}

	return nextStatus;
}
