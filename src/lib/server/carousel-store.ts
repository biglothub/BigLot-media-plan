import {
	deriveCarouselProjectStatus,
	normalizeCarouselQuoteFontScale,
	normalizeCarouselQuoteTextOffsetPx,
	normalizeCarouselTextLetterSpacingEm,
	normalizeHashtags
} from '$lib/carousel';
import { supabase } from '$lib/supabase';
import type {
	CarouselAsset,
	CarouselContentMode,
	CarouselFontPreset,
	CarouselProjectRow,
	CarouselProjectStatus,
	CarouselReviewStatus,
	CarouselSlideRow,
	IdeaBacklogRow,
	ProducedContentKind,
	ProducedVideoRow,
	ProductionCalendarRow
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

function normalizeCarouselContentMode(value: unknown): CarouselContentMode {
	return value === 'quote' ? 'quote' : 'standard';
}

function normalizeCarouselReviewStatus(value: unknown): CarouselReviewStatus {
	if (value === 'pending_review' || value === 'approved' || value === 'changes_requested') {
		return value;
	}
	return 'draft';
}

function normalizeProducedContentKind(value: unknown): ProducedContentKind {
	if (value === 'carousel' || value === 'post') return value;
	return 'video';
}

function normalizeHandoffSource(value: unknown): ProductionCalendarRow['handoff_source'] {
	return value === 'carousel_handoff' ? 'carousel_handoff' : 'manual';
}

function normalizeTextOrNull(value: unknown): string | null {
	if (typeof value !== 'string') return null;
	const normalized = value.trim();
	return normalized ? normalized : null;
}

function normalizeAccountHandle(value: unknown): string | null {
	const normalized = normalizeTextOrNull(value);
	if (!normalized) return null;
	const stripped = normalized.replace(/^@+/, '').trim();
	return stripped ? stripped : null;
}

function normalizeRelation<T>(value: unknown): T | null {
	if (Array.isArray(value)) {
		return (value[0] ?? null) as T | null;
	}
	return (value as T | null) ?? null;
}

function normalizeNullableNumber(value: unknown): number | null {
	if (value === null || value === undefined || value === '') return null;
	const parsed = typeof value === 'number' ? value : Number(value);
	return Number.isFinite(parsed) ? parsed : null;
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
		quote_font_scale_override:
			row.quote_font_scale_override === null || row.quote_font_scale_override === undefined
				? null
				: normalizeCarouselQuoteFontScale(row.quote_font_scale_override),
		quote_text_offset_x_px: normalizeCarouselQuoteTextOffsetPx(row.quote_text_offset_x_px),
		quote_text_offset_y_px: normalizeCarouselQuoteTextOffsetPx(row.quote_text_offset_y_px),
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

function normalizeProductionCalendar(row: JsonRecord): ProductionCalendarRow {
	return {
		id: row.id as string,
		backlog_id: row.backlog_id as string,
		carousel_project_id: typeof row.carousel_project_id === 'string' ? row.carousel_project_id : null,
		handoff_source: normalizeHandoffSource(row.handoff_source),
		shoot_date: row.shoot_date as string,
		publish_deadline: typeof row.publish_deadline === 'string' ? row.publish_deadline : null,
		status: (row.status as string) ?? 'planned',
		revision_count: Number(row.revision_count ?? 0),
		approval_status:
			row.approval_status === 'pending_review' || row.approval_status === 'approved' || row.approval_status === 'rejected'
				? row.approval_status
				: 'draft',
		submitted_at: typeof row.submitted_at === 'string' ? row.submitted_at : null,
		notes: normalizeTextOrNull(row.notes),
		created_at: row.created_at as string,
		idea_backlog: normalizeRelation<IdeaBacklogRow>(row.idea_backlog),
		calendar_assignments: Array.isArray(row.calendar_assignments)
			? (row.calendar_assignments as ProductionCalendarRow['calendar_assignments'])
			: [],
		carousel_project: null
	};
}

function normalizeProducedVideo(row: JsonRecord): ProducedVideoRow {
	return {
		id: row.id as string,
		calendar_id: row.calendar_id as string,
		carousel_project_id: typeof row.carousel_project_id === 'string' ? row.carousel_project_id : null,
		content_kind: normalizeProducedContentKind(row.content_kind),
		url: typeof row.url === 'string' ? row.url : '',
		platform: row.platform as ProducedVideoRow['platform'],
		title: normalizeTextOrNull(row.title),
		thumbnail_url: normalizeTextOrNull(row.thumbnail_url),
		published_at: typeof row.published_at === 'string' ? row.published_at : null,
		view_count: normalizeNullableNumber(row.view_count),
		like_count: normalizeNullableNumber(row.like_count),
		comment_count: normalizeNullableNumber(row.comment_count),
		share_count: normalizeNullableNumber(row.share_count),
		save_count: normalizeNullableNumber(row.save_count),
		notes: normalizeTextOrNull(row.notes),
		created_at: row.created_at as string
	};
}

function normalizeCarouselProject(row: JsonRecord): CarouselProjectRow {
	return {
		id: row.id as string,
		backlog_id: row.backlog_id as string,
		platform: 'instagram',
		status: row.status as CarouselProjectStatus,
		content_mode: normalizeCarouselContentMode(row.content_mode),
		font_preset: ((typeof row.font_preset === 'string' ? row.font_preset : 'biglot') as CarouselFontPreset) ?? 'biglot',
		text_letter_spacing_em: normalizeCarouselTextLetterSpacingEm(row.text_letter_spacing_em),
		quote_font_scale: normalizeCarouselQuoteFontScale(row.quote_font_scale),
		title: normalizeTextOrNull(row.title),
		visual_direction: normalizeTextOrNull(row.visual_direction),
		caption: normalizeTextOrNull(row.caption),
		hashtags_json: normalizeHashtags(row.hashtags_json as string[] | null),
		review_status: normalizeCarouselReviewStatus(row.review_status),
		review_notes: normalizeTextOrNull(row.review_notes),
		reviewed_by: normalizeTextOrNull(row.reviewed_by),
		reviewed_at: typeof row.reviewed_at === 'string' ? row.reviewed_at : null,
		account_display_name: normalizeTextOrNull(row.account_display_name),
		account_handle: normalizeAccountHandle(row.account_handle),
		account_avatar_url: normalizeTextOrNull(row.account_avatar_url),
		account_avatar_storage_path: normalizeTextOrNull(row.account_avatar_storage_path),
		account_is_verified: Boolean(row.account_is_verified),
		slide_count: Number(row.slide_count ?? 0),
		last_generated_at: typeof row.last_generated_at === 'string' ? row.last_generated_at : null,
		last_exported_at: typeof row.last_exported_at === 'string' ? row.last_exported_at : null,
		created_at: row.created_at as string,
		updated_at: row.updated_at as string,
		idea_backlog: normalizeRelation<IdeaBacklogRow>(row.idea_backlog),
		linked_schedule: row.linked_schedule && typeof row.linked_schedule === 'object' ? normalizeProductionCalendar(row.linked_schedule as JsonRecord) : null,
		published_record: row.published_record && typeof row.published_record === 'object' ? normalizeProducedVideo(row.published_record as JsonRecord) : null
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

export async function ensureCarouselProject(
	backlogId: string,
	options?: { content_mode?: CarouselContentMode }
): Promise<CarouselProjectRow> {
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

	const baseInsert = {
		backlog_id: backlogId,
		platform: 'instagram',
		status: 'draft',
		content_mode: normalizeCarouselContentMode(options?.content_mode),
		font_preset: 'biglot',
		quote_font_scale: 1,
		title: backlog.title ?? 'Untitled carousel',
		caption: backlog.description ?? null,
		hashtags_json: [],
		account_display_name: null,
		account_handle: null,
		account_avatar_url: null,
		account_avatar_storage_path: null,
		account_is_verified: false,
		review_status: 'draft',
		review_notes: null,
		reviewed_by: null,
		reviewed_at: null,
		slide_count: 0
	};

	let pendingInsert: Record<string, unknown> = { ...baseInsert };
	let { data, error } = await supabase.from('carousel_projects').insert(pendingInsert).select('*, idea_backlog(*)').single();
	while (error) {
		const unsupportedColumns = [
			'content_mode',
			'font_preset',
			'quote_font_scale',
			'review_status',
			'review_notes',
			'reviewed_by',
			'reviewed_at',
			'account_display_name',
			'account_handle',
			'account_avatar_url',
			'account_avatar_storage_path',
			'account_is_verified'
		].filter((column) => column in pendingInsert && isMissingCarouselProjectColumnError(error, column));
		if (unsupportedColumns.length === 0) break;

		for (const column of unsupportedColumns) {
			delete pendingInsert[column];
		}

		if (Object.keys(pendingInsert).length === 0) {
			error = null;
			break;
		}

		const retryResult = await supabase.from('carousel_projects').insert(pendingInsert).select('*, idea_backlog(*)').single();
		data = retryResult.data;
		error = retryResult.error;
	}

	if (error) throw new Error(error.message);
	return normalizeCarouselProject(data as JsonRecord);
}

export async function getCarouselWorkflow(project: Pick<CarouselProjectRow, 'id' | 'backlog_id'>): Promise<{
	linked_schedule: ProductionCalendarRow | null;
	published_record: ProducedVideoRow | null;
}> {
	if (!supabase) throw new Error('Supabase not configured');

	const { data: scheduleData, error: scheduleError } = await supabase
		.from('production_calendar')
		.select('*, idea_backlog(*), calendar_assignments(*)')
		.eq('backlog_id', project.backlog_id)
		.maybeSingle();

	if (scheduleError) throw new Error(scheduleError.message);

	const linkedSchedule = scheduleData ? normalizeProductionCalendar(scheduleData as JsonRecord) : null;

	let publicationData: JsonRecord | null = null;
	const { data: byProject, error: byProjectError } = await supabase
		.from('produced_videos')
		.select('*')
		.eq('carousel_project_id', project.id)
		.maybeSingle();

	if (byProjectError && byProjectError.code !== 'PGRST116') {
		throw new Error(byProjectError.message);
	}
	publicationData = (byProject as JsonRecord | null) ?? null;

	if (!publicationData && linkedSchedule) {
		const { data: byCalendar, error: byCalendarError } = await supabase
			.from('produced_videos')
			.select('*')
			.eq('calendar_id', linkedSchedule.id)
			.eq('platform', 'instagram')
			.maybeSingle();

		if (byCalendarError && byCalendarError.code !== 'PGRST116') {
			throw new Error(byCalendarError.message);
		}
		publicationData = (byCalendar as JsonRecord | null) ?? null;
	}

	return {
		linked_schedule: linkedSchedule,
		published_record: publicationData ? normalizeProducedVideo(publicationData) : null
	};
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
