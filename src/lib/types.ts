export type SupportedPlatform = 'youtube' | 'facebook' | 'instagram' | 'tiktok';
export type BacklogContentType = 'video' | 'post' | 'image';

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

export type ProductionStage = 'planned' | 'scripting' | 'shooting' | 'editing' | 'published';

export type TeamMember = 'โฟน' | 'ฟิวส์' | 'อิก' | 'ต้า';

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
	status: string;
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
	notes: string | null;
	status: string;
	created_at: string;
}

export interface MonitoringContentPlatformRow {
	id: string;
	content_id: string;
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
