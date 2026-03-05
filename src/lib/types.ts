export type SupportedPlatform = 'youtube' | 'facebook' | 'instagram' | 'tiktok';
export type BacklogContentType = 'video' | 'post' | 'image' | 'live';
export type BacklogContentCategory = 'hero' | 'help' | 'hub';

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

export interface MonitoringContentRow {
	id: string;
	content_code: string;
	title: string;
	description: string | null;
	owner: string | null;
	priority: MonitoringPriority;
	notes: string | null;
	status: string;
	is_own: boolean;
	created_at: string;
}

export type MonitoringPriority = 'low' | 'normal' | 'high' | 'urgent';

export interface MonitoringContentPlatformRow {
	id: string;
	content_id: string;
	url: string;
	platform: SupportedPlatform;
	is_channel: boolean;
	last_checked_at: string | null;
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

export interface MonitoringMetricSnapshotRow {
	id: string;
	content_id: string;
	platform_id: string;
	snapshot_date: string;
	followers_count: number | null;
	view_count: number | null;
	post_count: number | null;
	like_count: number | null;
	comment_count: number | null;
	share_count: number | null;
	save_count: number | null;
	notes: string | null;
	created_at: string;
}

export interface MonitoringChannelVideoRow {
	id: string;
	platform_id: string;
	video_id: string;
	video_url: string;
	title: string;
	thumbnail_url: string | null;
	published_label: string | null;
	view_label: string | null;
	view_count: number | null;
	duration_label: string | null;
	raw_json: Record<string, unknown> | null;
	created_at: string;
	updated_at: string;
}
