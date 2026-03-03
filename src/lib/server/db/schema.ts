import { sql } from 'drizzle-orm';
import {
	bigint,
	check,
	date,
	index,
	jsonb,
	pgPolicy,
	pgTable,
	text,
	timestamp,
	uniqueIndex,
	uuid
} from 'drizzle-orm/pg-core';

export const ideaBacklog = pgTable(
	'idea_backlog',
	{
		id: uuid('id').defaultRandom().primaryKey(),
		ideaCode: text('idea_code')
			.notNull()
			.default(
				sql`'BL-' || to_char(timezone('utc', now()), 'YYYYMMDD') || '-' || upper(substring(replace(gen_random_uuid()::text, '-', '') from 1 for 8))`
			),
		url: text('url'),
		platform: text('platform').notNull().$type<'youtube' | 'facebook' | 'instagram' | 'tiktok'>(),
		contentType: text('content_type').notNull().default('video').$type<'video' | 'post' | 'image'>(),
		title: text('title'),
		description: text('description'),
		authorName: text('author_name'),
		thumbnailUrl: text('thumbnail_url'),
		publishedAt: timestamp('published_at', { withTimezone: true, mode: 'string' }),
		viewCount: bigint('view_count', { mode: 'number' }),
		likeCount: bigint('like_count', { mode: 'number' }),
		commentCount: bigint('comment_count', { mode: 'number' }),
		shareCount: bigint('share_count', { mode: 'number' }),
		saveCount: bigint('save_count', { mode: 'number' }),
		notes: text('notes'),
		status: text('status').notNull().default('new'),
		engagementJson: jsonb('engagement_json').$type<Record<string, unknown>>(),
		createdAt: timestamp('created_at', { withTimezone: true, mode: 'string' })
			.notNull()
			.defaultNow()
	},
	(table) => [
		uniqueIndex('ux_idea_backlog_idea_code').on(table.ideaCode),
		index('idx_idea_backlog_created_at').on(table.createdAt),
		index('idx_idea_backlog_platform').on(table.platform),
		check(
			'idea_backlog_platform_check',
			sql`${table.platform} in ('youtube', 'facebook', 'instagram', 'tiktok')`
		),
		check(
			'idea_backlog_content_type_check',
			sql`${table.contentType} in ('video', 'post', 'image')`
		),
		pgPolicy('public_read_backlog', {
			for: 'select',
			to: 'public',
			using: sql`true`
		}),
		pgPolicy('public_insert_backlog', {
			for: 'insert',
			to: 'public',
			withCheck: sql`true`
		}),
		pgPolicy('public_update_backlog', {
			for: 'update',
			to: 'public',
			using: sql`true`,
			withCheck: sql`true`
		}),
		pgPolicy('public_delete_backlog', {
			for: 'delete',
			to: 'public',
			using: sql`true`
		})
	]
).enableRLS();

export const productionCalendar = pgTable(
	'production_calendar',
	{
		id: uuid('id').defaultRandom().primaryKey(),
		backlogId: uuid('backlog_id')
			.notNull()
			.references(() => ideaBacklog.id, { onDelete: 'cascade' }),
		shootDate: date('shoot_date', { mode: 'string' }).notNull(),
		status: text('status').notNull().default('planned'),
		notes: text('notes'),
		createdAt: timestamp('created_at', { withTimezone: true, mode: 'string' })
			.notNull()
			.defaultNow()
	},
	(table) => [
		uniqueIndex('ux_production_calendar_backlog').on(table.backlogId),
		index('idx_production_calendar_shoot_date').on(table.shootDate),
		pgPolicy('public_read_calendar', {
			for: 'select',
			to: 'public',
			using: sql`true`
		}),
		pgPolicy('public_insert_calendar', {
			for: 'insert',
			to: 'public',
			withCheck: sql`true`
		}),
		pgPolicy('public_update_calendar', {
			for: 'update',
			to: 'public',
			using: sql`true`,
			withCheck: sql`true`
		}),
		pgPolicy('public_delete_calendar', {
			for: 'delete',
			to: 'public',
			using: sql`true`
		})
	]
).enableRLS();

export const producedVideos = pgTable(
	'produced_videos',
	{
		id: uuid('id').defaultRandom().primaryKey(),
		calendarId: uuid('calendar_id')
			.notNull()
			.references(() => productionCalendar.id, { onDelete: 'cascade' }),
		url: text('url').notNull(),
		platform: text('platform').notNull().$type<'youtube' | 'facebook' | 'instagram' | 'tiktok'>(),
		title: text('title'),
		thumbnailUrl: text('thumbnail_url'),
		publishedAt: timestamp('published_at', { withTimezone: true, mode: 'string' }),
		viewCount: bigint('view_count', { mode: 'number' }),
		likeCount: bigint('like_count', { mode: 'number' }),
		commentCount: bigint('comment_count', { mode: 'number' }),
		shareCount: bigint('share_count', { mode: 'number' }),
		saveCount: bigint('save_count', { mode: 'number' }),
		notes: text('notes'),
		createdAt: timestamp('created_at', { withTimezone: true, mode: 'string' })
			.notNull()
			.defaultNow()
	},
	(table) => [
		index('idx_produced_videos_calendar').on(table.calendarId),
		uniqueIndex('ux_produced_videos_calendar_platform').on(table.calendarId, table.platform),
		index('idx_produced_videos_platform').on(table.platform),
		check(
			'produced_videos_platform_check',
			sql`${table.platform} in ('youtube', 'facebook', 'instagram', 'tiktok')`
		),
		pgPolicy('public_read_produced_videos', {
			for: 'select',
			to: 'public',
			using: sql`true`
		}),
		pgPolicy('public_insert_produced_videos', {
			for: 'insert',
			to: 'public',
			withCheck: sql`true`
		}),
		pgPolicy('public_update_produced_videos', {
			for: 'update',
			to: 'public',
			using: sql`true`,
			withCheck: sql`true`
		}),
		pgPolicy('public_delete_produced_videos', {
			for: 'delete',
			to: 'public',
			using: sql`true`
		})
	]
).enableRLS();

export const monitoringContent = pgTable(
	'monitoring_content',
	{
		id: uuid('id').defaultRandom().primaryKey(),
		contentCode: text('content_code')
			.notNull()
			.default(
				sql`'MC-' || to_char(timezone('utc', now()), 'YYYYMMDD') || '-' || upper(substring(replace(gen_random_uuid()::text, '-', '') from 1 for 8))`
			),
		title: text('title').notNull(),
		description: text('description'),
		notes: text('notes'),
		status: text('status').notNull().default('active'),
		createdAt: timestamp('created_at', { withTimezone: true, mode: 'string' })
			.notNull()
			.defaultNow()
	},
	(table) => [
		uniqueIndex('ux_monitoring_content_code').on(table.contentCode),
		index('idx_monitoring_content_created_at').on(table.createdAt),
		pgPolicy('public_read_monitoring_content', {
			for: 'select',
			to: 'public',
			using: sql`true`
		}),
		pgPolicy('public_insert_monitoring_content', {
			for: 'insert',
			to: 'public',
			withCheck: sql`true`
		}),
		pgPolicy('public_update_monitoring_content', {
			for: 'update',
			to: 'public',
			using: sql`true`,
			withCheck: sql`true`
		}),
		pgPolicy('public_delete_monitoring_content', {
			for: 'delete',
			to: 'public',
			using: sql`true`
		})
	]
).enableRLS();

export const monitoringContentPlatform = pgTable(
	'monitoring_content_platform',
	{
		id: uuid('id').defaultRandom().primaryKey(),
		contentId: uuid('content_id')
			.notNull()
			.references(() => monitoringContent.id, { onDelete: 'cascade' }),
		url: text('url').notNull(),
		platform: text('platform').notNull().$type<'youtube' | 'facebook' | 'instagram' | 'tiktok'>(),
		title: text('title'),
		thumbnailUrl: text('thumbnail_url'),
		publishedAt: timestamp('published_at', { withTimezone: true, mode: 'string' }),
		viewCount: bigint('view_count', { mode: 'number' }),
		likeCount: bigint('like_count', { mode: 'number' }),
		commentCount: bigint('comment_count', { mode: 'number' }),
		shareCount: bigint('share_count', { mode: 'number' }),
		saveCount: bigint('save_count', { mode: 'number' }),
		notes: text('notes'),
		createdAt: timestamp('created_at', { withTimezone: true, mode: 'string' })
			.notNull()
			.defaultNow()
	},
	(table) => [
		index('idx_monitoring_content_platform_content').on(table.contentId),
		uniqueIndex('ux_monitoring_content_platform_unique').on(table.contentId, table.platform),
		index('idx_monitoring_content_platform_platform').on(table.platform),
		check(
			'monitoring_content_platform_check',
			sql`${table.platform} in ('youtube', 'facebook', 'instagram', 'tiktok')`
		),
		pgPolicy('public_read_monitoring_content_platform', {
			for: 'select',
			to: 'public',
			using: sql`true`
		}),
		pgPolicy('public_insert_monitoring_content_platform', {
			for: 'insert',
			to: 'public',
			withCheck: sql`true`
		}),
		pgPolicy('public_update_monitoring_content_platform', {
			for: 'update',
			to: 'public',
			using: sql`true`,
			withCheck: sql`true`
		}),
		pgPolicy('public_delete_monitoring_content_platform', {
			for: 'delete',
			to: 'public',
			using: sql`true`
		})
	]
).enableRLS();
