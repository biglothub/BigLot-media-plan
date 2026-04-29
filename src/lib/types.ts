export type SupportedPlatform = 'youtube' | 'facebook' | 'instagram' | 'tiktok';
export type BacklogContentType = 'video' | 'post' | 'image' | 'live';
export type BacklogContentCategory = 'hero' | 'help' | 'hub' | 'pin';
export type ContentJourneyStage = 'awareness' | 'trust' | 'conversion';
export type SuggestIdeasUseCase = 'backlog' | 'carousel_studio';
export type CarouselProjectStatus = 'draft' | 'ready' | 'exported' | 'archived';
export type CarouselContentMode = 'standard' | 'quote';
export type CarouselSlideRole = 'cover' | 'body' | 'cta';
export type CarouselLayoutVariant = 'cover' | 'content' | 'cta';
export type CarouselFontPreset =
	| 'biglot'
	| 'apple_clean'
	| 'mitr_friendly'
	| 'ibm_plex_thai'
	| 'editorial_serif'
	| 'kanit'
	| 'prompt_clean'
	| 'poppins_thai'
	| 'bebas_impact';

import type { TeamMember } from '$lib/team';
export type { TeamMember } from '$lib/team';

export interface EnrichMetrics {
	views: number | null;
	likes: number | null;
	comments: number | null;
	shares: number | null;
	saves: number | null;
}

export interface EnrichResult {
	url: string;
	platform: SupportedPlatform;
	contentType: BacklogContentType;
	title: string | null;
	description: string | null;
	authorName: string | null;
	thumbnailUrl: string | null;
	publishedAt: string | null;
	metrics: EnrichMetrics;
	source: string[];
}

export interface IdeaBacklogRow {
	id: string;
	idea_code: string;
	url: string | null;
	platform: SupportedPlatform;
	content_type: BacklogContentType;
	content_category: BacklogContentCategory | null;
	title: string | null;
	description: string | null;
	author_name: string | null;
	thumbnail_url: string | null;
	published_at: string | null;
	view_count: number | null;
	like_count: number | null;
	comment_count: number | null;
	share_count: number | null;
	save_count: number | null;
	notes: string | null;
	status: string;
	engagement_json: Record<string, unknown> | null;
	created_at: string;
}

export interface AIIdeaSuggestion {
	title: string;
	description: string;
	platform: SupportedPlatform;
	content_category: Exclude<BacklogContentCategory, 'pin'>;
	reason: string;
	audience: string | null;
	hook: string | null;
	journey_stage: ContentJourneyStage | null;
	slide_outline: string[];
	cta: string | null;
}

export type ProductionStage = 'planned' | 'scripting' | 'shooting' | 'editing' | 'review' | 'published';
export type ApprovalStatus = 'draft' | 'pending_review' | 'approved' | 'rejected';
export type CarouselReviewStatus = 'draft' | 'pending_review' | 'approved' | 'changes_requested';
export type HandoffSource = 'manual' | 'carousel_handoff';
export type ProducedContentKind = 'video' | 'carousel' | 'post';

export interface CalendarAssignmentRow {
	id: string;
	calendar_id: string;
	member_name: TeamMember;
	role_detail: string;
	created_at: string;
}

export interface ProductionCalendarRow {
	id: string;
	backlog_id: string;
	carousel_project_id: string | null;
	handoff_source: HandoffSource;
	shoot_date: string;
	publish_deadline: string | null;
	status: string;
	revision_count: number;
	approval_status: ApprovalStatus;
	submitted_at: string | null;
	draft_video_url: string | null;
	review_notes: string | null;
	notes: string | null;
	created_at: string;
	idea_backlog?: IdeaBacklogRow | null;
	carousel_project?: CarouselProjectRow | null;
	calendar_assignments?: CalendarAssignmentRow[];
}

export interface ProducedVideoRow {
	id: string;
	calendar_id: string;
	carousel_project_id: string | null;
	content_kind: ProducedContentKind;
	url: string;
	platform: SupportedPlatform;
	title: string | null;
	thumbnail_url: string | null;
	published_at: string | null;
	view_count: number | null;
	like_count: number | null;
	comment_count: number | null;
	share_count: number | null;
	save_count: number | null;
	notes: string | null;
	created_at: string;
}

export interface CarouselAsset {
	id: number;
	title: string;
	type: string | null;
	url: string | null;
	preview_url: string | null;
	preview_width: number | null;
	preview_height: number | null;
	orientation: string | null;
	author_name: string | null;
	author_slug: string | null;
	license_url: string | null;
	premium: boolean;
	is_ai_generated: boolean;
	downloads: number | null;
	likes: number | null;
	published_at: string | null;
	available_formats: string[];
	source_query: string | null;
	selected_format?: string | null;
	storage_url?: string | null;
}

export interface CarouselSlideHistoryEntry {
	saved_at: string;
	headline: string | null;
	body: string | null;
	cta: string | null;
	visual_brief: string | null;
	freepik_query: string | null;
}

export interface CarouselSlideRow {
	id: string;
	project_id: string;
	position: number;
	role: CarouselSlideRole;
	layout_variant: CarouselLayoutVariant;
	headline: string | null;
	body: string | null;
	cta: string | null;
	visual_brief: string | null;
	freepik_query: string | null;
	quote_font_scale_override: number | null;
	quote_text_offset_x_px: number;
	quote_text_offset_y_px: number;
	candidate_assets_json: CarouselAsset[] | null;
	selected_asset_json: CarouselAsset | null;
	selected_asset_storage_path: string | null;
	history_json: CarouselSlideHistoryEntry[];
	created_at: string;
	updated_at: string;
}

export interface CarouselProjectRow {
	id: string;
	backlog_id: string;
	platform: 'instagram';
	status: CarouselProjectStatus;
	content_mode: CarouselContentMode;
	font_preset: CarouselFontPreset;
	text_letter_spacing_em: number;
	quote_font_scale: number;
	title: string | null;
	visual_direction: string | null;
	caption: string | null;
	hashtags_json: string[] | null;
	review_status: CarouselReviewStatus;
	review_notes: string | null;
	reviewed_by: string | null;
	reviewed_at: string | null;
	account_display_name: string | null;
	account_handle: string | null;
	account_avatar_url: string | null;
	account_avatar_storage_path: string | null;
	account_is_verified: boolean;
	slide_count: number;
	last_generated_at: string | null;
	last_exported_at: string | null;
	cover_thumbnail_url?: string | null;
	created_at: string;
	updated_at: string;
	idea_backlog?: IdeaBacklogRow | null;
	carousel_slides?: CarouselSlideRow[];
	linked_schedule?: ProductionCalendarRow | null;
	published_record?: ProducedVideoRow | null;
}

export type ApprovalSubmissionStatus = 'pending' | 'approved' | 'changes_requested';
export type ApprovalSubmissionPlatform = 'youtube' | 'facebook' | 'instagram' | 'tiktok' | 'other';

export interface ApprovalSubmissionRow {
	id: string;
	title: string;
	platform: ApprovalSubmissionPlatform;
	drive_url: string;
	submitted_by: string;
	notes: string | null;
	status: ApprovalSubmissionStatus;
	reviewer_notes: string | null;
	reviewed_by: string | null;
	reviewed_at: string | null;
	created_at: string;
	updated_at: string;
}

export interface CarouselQuoteIdentityRow {
	id: string;
	name: string;
	account_display_name: string;
	account_handle: string | null;
	account_avatar_url: string | null;
	account_avatar_storage_path: string | null;
	account_is_verified: boolean;
	created_at: string;
	updated_at: string;
}
