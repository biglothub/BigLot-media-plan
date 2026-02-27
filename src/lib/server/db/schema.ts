import { sql } from 'drizzle-orm';
import { bigint, check, index, jsonb, pgPolicy, pgTable, text, timestamp, uuid } from 'drizzle-orm/pg-core';

export const ideaBacklog = pgTable(
	'idea_backlog',
	{
		id: uuid('id').defaultRandom().primaryKey(),
		url: text('url').notNull(),
		platform: text('platform').notNull().$type<'youtube' | 'facebook' | 'instagram' | 'tiktok'>(),
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
		index('idx_idea_backlog_created_at').on(table.createdAt),
		index('idx_idea_backlog_platform').on(table.platform),
		check(
			'idea_backlog_platform_check',
			sql`${table.platform} in ('youtube', 'facebook', 'instagram', 'tiktok')`
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
		})
	]
).enableRLS();
