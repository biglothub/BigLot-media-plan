export type SupportedPlatform = 'youtube' | 'facebook' | 'instagram' | 'tiktok';
export type BacklogContentType = 'video' | 'post' | 'image' | 'live';
export type BacklogContentCategory = 'hero' | 'help' | 'hub' | 'pin';
export type ContentJourneyStage = 'awareness' | 'trust' | 'conversion';
export type SuggestIdeasUseCase = 'backlog' | 'carousel_studio';
export type CarouselProjectStatus = 'draft' | 'ready' | 'exported' | 'archived';
export type CarouselSlideRole = 'cover' | 'body' | 'cta';
export type CarouselLayoutVariant = 'cover' | 'content' | 'cta';
export type CarouselFontPreset =
	| 'biglot'
	| 'apple_clean'
	| 'mitr_friendly'
	| 'ibm_plex_thai'
	| 'editorial_serif';

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
	shoot_date: string;
	publish_deadline: string | null;
	status: string;
	revision_count: number;
	approval_status: ApprovalStatus;
	submitted_at: string | null;
	notes: string | null;
	created_at: string;
	idea_backlog?: IdeaBacklogRow | null;
	calendar_assignments?: CalendarAssignmentRow[];
}

export interface ProducedVideoRow {
	id: string;
	calendar_id: string;
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
	candidate_assets_json: CarouselAsset[] | null;
	selected_asset_json: CarouselAsset | null;
	selected_asset_storage_path: string | null;
	created_at: string;
	updated_at: string;
}

export interface CarouselProjectRow {
	id: string;
	backlog_id: string;
	platform: 'instagram';
	status: CarouselProjectStatus;
	font_preset: CarouselFontPreset;
	text_letter_spacing_em: number;
	title: string | null;
	visual_direction: string | null;
	caption: string | null;
	hashtags_json: string[] | null;
	slide_count: number;
	last_generated_at: string | null;
	last_exported_at: string | null;
	created_at: string;
	updated_at: string;
	idea_backlog?: IdeaBacklogRow | null;
	carousel_slides?: CarouselSlideRow[];
}
