<script lang="ts">
	import { onMount } from 'svelte';
	import { hasSupabaseConfig, supabase } from '$lib/supabase';
	import type { EnrichResult, IdeaBacklogRow } from '$lib/types';
	import {
		formatCount,
		getInstagramEmbedUrl,
		getTikTokEmbedUrl,
		platformLabel,
		platformOrder
	} from '$lib/media-plan';

	let linkInput = $state('');
	let notes = $state('');
	let loadingIdeas = $state(false);
	let enriching = $state(false);
	let saving = $state(false);
	let deletingId = $state<string | null>(null);
	let message = $state('');
	let errorMessage = $state('');
	let draft = $state<EnrichResult | null>(null);
	let ideas = $state<IdeaBacklogRow[]>([]);
	let scheduledBacklogIds = $state<Set<string>>(new Set());
	let metrics = $state({
		views: null as number | null,
		likes: null as number | null,
		comments: null as number | null,
		shares: null as number | null,
		saves: null as number | null
	});

	const groupedIdeas = $derived.by(() => {
		const grouped = new Map<string, IdeaBacklogRow[]>();

		for (const idea of ideas) {
			const bucket = grouped.get(idea.platform) ?? [];
			bucket.push(idea);
			grouped.set(idea.platform, bucket);
		}

		const orderedGroups: Array<{ key: string; label: string; items: IdeaBacklogRow[] }> = platformOrder
			.map((platform) => ({
				key: platform,
				label: platformLabel[platform],
				items: grouped.get(platform) ?? []
			}))
			.filter((group) => group.items.length > 0);

		const knownPlatforms = new Set<string>(platformOrder);
		for (const [platform, items] of grouped.entries()) {
			if (!knownPlatforms.has(platform)) {
				orderedGroups.push({
					key: platform,
					label: platform.toUpperCase(),
					items
				});
			}
		}

		return orderedGroups;
	});

	const draftTikTokEmbedUrl = $derived(
		draft && draft.platform === 'tiktok' ? getTikTokEmbedUrl(draft.url) : null
	);

	const draftInstagramEmbedUrl = $derived(
		draft && draft.platform === 'instagram' ? getInstagramEmbedUrl(draft.url) : null
	);

	function backlogCode(idea: Pick<IdeaBacklogRow, 'id' | 'idea_code'>): string {
		const code = idea.idea_code?.trim();
		return code ? code : `BL-${idea.id.slice(0, 8).toUpperCase()}`;
	}

	function platformFrameClass(platform: IdeaBacklogRow['platform'] | null | undefined): string {
		if (platform === 'instagram') return 'platform-frame--instagram';
		if (platform === 'tiktok') return 'platform-frame--tiktok';
		if (platform === 'youtube') return 'platform-frame--youtube';
		if (platform === 'facebook') return 'platform-frame--facebook';
		return '';
	}

	function clearState() {
		draft = null;
		notes = '';
		metrics = {
			views: null,
			likes: null,
			comments: null,
			shares: null,
			saves: null
		};
	}

	async function loadIdeas() {
		if (!supabase) return;
		loadingIdeas = true;
		errorMessage = '';

		const { data, error } = await supabase
			.from('idea_backlog')
			.select('*')
			.order('created_at', { ascending: false });

		loadingIdeas = false;

		if (error) {
			errorMessage = `โหลด backlog ไม่ได้: ${error.message}`;
			return;
		}

		ideas = (data ?? []) as IdeaBacklogRow[];
	}

	async function loadScheduledBacklogIds() {
		if (!supabase) return;

		const { data, error } = await supabase.from('production_calendar').select('backlog_id');
		if (error) {
			errorMessage = `โหลดสถานะ schedule ไม่ได้: ${error.message}`;
			return;
		}

		scheduledBacklogIds = new Set((data ?? []).map((item) => item.backlog_id as string));
	}

	async function analyzeLink() {
		message = '';
		errorMessage = '';
		clearState();

		if (!linkInput.trim()) {
			errorMessage = 'กรุณาวางลิงก์ก่อน';
			return;
		}

		enriching = true;
		try {
			const response = await fetch(`/api/enrich?url=${encodeURIComponent(linkInput.trim())}`);
			const body = await response.json();

			if (!response.ok) {
				errorMessage = body.error ?? 'อ่านข้อมูลจากลิงก์ไม่สำเร็จ';
				return;
			}

			draft = body as EnrichResult;
			metrics = {
				views: draft.metrics.views,
				likes: draft.metrics.likes,
				comments: draft.metrics.comments,
				shares: draft.metrics.shares,
				saves: draft.metrics.saves
			};
			message = 'ดึงข้อมูลสำเร็จแล้ว ตรวจค่า engagement ก่อนบันทึกได้เลย';
		} catch (error) {
			errorMessage =
				error instanceof Error ? error.message : 'เกิดข้อผิดพลาดระหว่าง analyze link';
		} finally {
			enriching = false;
		}
	}

	async function saveIdea() {
		if (!supabase) {
			errorMessage = 'ยังไม่ได้ตั้งค่า Supabase';
			return;
		}

		if (!draft) {
			errorMessage = 'ยังไม่มีข้อมูลจากการ analyze ลิงก์';
			return;
		}

		saving = true;
		errorMessage = '';
		message = '';

		const payload = {
			url: draft.url,
			platform: draft.platform,
			title: draft.title,
			description: draft.description,
			author_name: draft.authorName,
			thumbnail_url: draft.thumbnailUrl,
			published_at: draft.publishedAt,
			view_count: metrics.views,
			like_count: metrics.likes,
			comment_count: metrics.comments,
			share_count: metrics.shares,
			save_count: metrics.saves,
			notes: notes.trim() || null,
			status: 'new',
			engagement_json: {
				source: draft.source,
				extracted_at: new Date().toISOString()
			}
		};

		const { error } = await supabase.from('idea_backlog').insert(payload);
		saving = false;

		if (error) {
			errorMessage = `บันทึกไม่สำเร็จ: ${error.message}`;
			return;
		}

		message = 'บันทึกเข้า backlog แล้ว';
		linkInput = '';
		clearState();
		await loadIdeas();
	}

	async function deleteIdea(idea: IdeaBacklogRow) {
		if (!supabase) {
			errorMessage = 'ยังไม่ได้ตั้งค่า Supabase';
			return;
		}

		const confirmed = window.confirm(`ลบ backlog นี้ใช่ไหม?\n${backlogCode(idea)} • ${idea.title ?? idea.url}`);
		if (!confirmed) return;

		deletingId = idea.id;
		errorMessage = '';
		message = '';

		const { error } = await supabase.from('idea_backlog').delete().eq('id', idea.id);
		deletingId = null;

		if (error) {
			errorMessage = `ลบไม่สำเร็จ: ${error.message}`;
			return;
		}

		ideas = ideas.filter((item) => item.id !== idea.id);
		if (scheduledBacklogIds.has(idea.id)) {
			const next = new Set(scheduledBacklogIds);
			next.delete(idea.id);
			scheduledBacklogIds = next;
		}
		message = 'ลบออกจาก backlog แล้ว';
	}

	onMount(async () => {
		await Promise.all([loadIdeas(), loadScheduledBacklogIds()]);
	});
</script>

<main class="page">
	<section class="hero">
		<p class="kicker">BigLot Media Plan</p>
		<h1>Idea Backlog</h1>
		<p class="subtitle">วางลิงก์ YouTube / Facebook / Instagram / TikTok แล้วเก็บ engagement เป็น backlog</p>
	</section>

	{#if !hasSupabaseConfig}
		<p class="alert">
			ตั้งค่า env ก่อนใช้งาน: <code>PUBLIC_SUPABASE_URL</code> และ
			<code>PUBLIC_SUPABASE_ANON_KEY</code>
		</p>
	{/if}

	<section class="panel">
		<div class="row">
			<label for="video-link">Video Link</label>
			<input id="video-link" bind:value={linkInput} placeholder="https://www.youtube.com/watch?v=..." />
		</div>
		<button class="primary" onclick={analyzeLink} disabled={enriching}>
			{enriching ? 'Analyzing...' : 'Analyze Link'}
		</button>
	</section>

	{#if message}
		<p class="notice success">{message}</p>
	{/if}

	{#if errorMessage}
		<p class="notice error">{errorMessage}</p>
	{/if}

	{#if draft}
		<section class="panel">
			<div class="preview">
				{#if draftTikTokEmbedUrl}
					<iframe
						class="preview-media tiktok-frame"
						src={draftTikTokEmbedUrl}
						title="TikTok Preview"
						loading="lazy"
						allow="encrypted-media; picture-in-picture"
						allowfullscreen
					></iframe>
				{:else if draftInstagramEmbedUrl}
					<iframe
						class="preview-media instagram-frame"
						src={draftInstagramEmbedUrl}
						title="Instagram Preview"
						loading="lazy"
						allow="encrypted-media; picture-in-picture"
						allowfullscreen
					></iframe>
				{:else if draft.thumbnailUrl}
					<img class="preview-media" src={draft.thumbnailUrl} alt={draft.title ?? 'thumbnail'} />
				{/if}
				<div>
					<span class="platform">{draft.platform.toUpperCase()}</span>
					<h2>{draft.title ?? 'Untitled video'}</h2>
					<p class="meta">
						{draft.authorName ?? 'Unknown creator'}
						{#if draft.publishedAt}
							• {new Date(draft.publishedAt).toLocaleDateString()}
						{/if}
					</p>
				</div>
			</div>

			<div class="metrics">
				<div class="metric-item">
					<label for="views">Views</label>
					<input id="views" type="number" min="0" bind:value={metrics.views} />
				</div>
				<div class="metric-item">
					<label for="likes">Likes</label>
					<input id="likes" type="number" min="0" bind:value={metrics.likes} />
				</div>
				<div class="metric-item">
					<label for="comments">Comments</label>
					<input id="comments" type="number" min="0" bind:value={metrics.comments} />
				</div>
				<div class="metric-item">
					<label for="shares">Shares</label>
					<input id="shares" type="number" min="0" bind:value={metrics.shares} />
				</div>
				<div class="metric-item">
					<label for="saves">Saves</label>
					<input id="saves" type="number" min="0" bind:value={metrics.saves} />
				</div>
			</div>

			<div class="row">
				<label for="notes">Idea Notes</label>
				<textarea
					id="notes"
					bind:value={notes}
					rows={4}
					placeholder="ไอเดียที่ได้จากวิดีโอนี้ เช่น hook, visual style, CTA..."
				></textarea>
			</div>

			<button class="primary" onclick={saveIdea} disabled={saving || !hasSupabaseConfig}>
				{saving ? 'Saving...' : 'Save To Backlog'}
			</button>
		</section>
	{/if}

	<section class="panel">
		<div class="list-head">
			<h2>Backlog ({ideas.length})</h2>
			{#if loadingIdeas}
				<span>Loading...</span>
			{/if}
		</div>

		{#if ideas.length === 0}
			<p class="empty">ยังไม่มีรายการไอเดียในระบบ</p>
		{:else}
			<div class="platform-groups">
				{#each groupedIdeas as group}
					<section class="platform-group">
						<div class="platform-group-head">
							<h3>{group.label}</h3>
							<span class="group-count">{group.items.length}</span>
						</div>

						<div class="grid">
							{#each group.items as idea}
								{@const tiktokEmbedUrl = idea.platform === 'tiktok' ? getTikTokEmbedUrl(idea.url) : null}
								{@const instagramEmbedUrl =
									idea.platform === 'instagram' ? getInstagramEmbedUrl(idea.url) : null}
									<article class={`card ${platformFrameClass(idea.platform)}`}>
									{#if tiktokEmbedUrl}
										<iframe
											class="card-media tiktok-frame"
											src={tiktokEmbedUrl}
											title="TikTok Backlog Preview"
											loading="lazy"
											allow="encrypted-media; picture-in-picture"
											allowfullscreen
										></iframe>
									{:else if instagramEmbedUrl}
										<iframe
											class="card-media instagram-frame"
											src={instagramEmbedUrl}
											title="Instagram Backlog Preview"
											loading="lazy"
											allow="encrypted-media; picture-in-picture"
											allowfullscreen
										></iframe>
									{:else if idea.thumbnail_url}
										<img class="card-media" src={idea.thumbnail_url} alt={idea.title ?? 'thumbnail'} />
									{/if}

									<div class="card-body">
										<div class="head-row">
											<span class="platform">{idea.platform.toUpperCase()}</span>
											{#if scheduledBacklogIds.has(idea.id)}
												<span class="chip">Scheduled</span>
											{/if}
										</div>
										<h3>{backlogCode(idea)}</h3>
										<p class="idea-title">{idea.title ?? 'Untitled idea'}</p>
										<div class="stats">
											<div class="stat-badge"><span>Views</span><span>{formatCount(idea.view_count)}</span></div>
											<div class="stat-badge"><span>Likes</span><span>{formatCount(idea.like_count)}</span></div>
											<div class="stat-badge">
												<span>Comments</span><span>{formatCount(idea.comment_count)}</span>
											</div>
											<div class="stat-badge"><span>Shares</span><span>{formatCount(idea.share_count)}</span></div>
										</div>

										{#if idea.notes}
											<p class="notes">{idea.notes}</p>
										{/if}

										<a class="link" href={idea.url} target="_blank" rel="noreferrer">{idea.url}</a>
										<button class="danger" onclick={() => deleteIdea(idea)} disabled={deletingId === idea.id}>
											{deletingId === idea.id ? 'Deleting...' : 'Delete'}
										</button>
									</div>
								</article>
							{/each}
						</div>
					</section>
				{/each}
			</div>
		{/if}
	</section>
</main>

<style>
	.page {
		display: grid;
		gap: 1rem;
	}

	.hero {
		text-align: center;
		padding: 1.5rem 0 0.5rem;
	}

	.kicker {
		font-size: 0.78rem;
		text-transform: uppercase;
		letter-spacing: 0.16em;
		color: #b45309;
		font-weight: 700;
		margin: 0;
	}

	h1,
	h2,
	h3 {
		font-family: 'Space Grotesk', 'Noto Sans Thai', sans-serif;
	}

	h1 {
		margin: 0.45rem 0;
		font-size: clamp(2rem, 5vw, 3rem);
	}

	.subtitle {
		margin: 0;
		color: #475569;
	}

	.panel {
		padding: 1.25rem;
		border-radius: 1rem;
		background: rgba(255, 255, 255, 0.85);
		border: 1px solid rgba(15, 23, 42, 0.08);
	}

	.row {
		display: grid;
		gap: 0.45rem;
		margin-bottom: 0.9rem;
	}

	label {
		font-size: 0.86rem;
		color: #475569;
	}

	input,
	textarea {
		width: 100%;
		box-sizing: border-box;
		font: inherit;
		padding: 0.72rem 0.85rem;
		border-radius: 0.7rem;
		border: 1px solid rgba(15, 23, 42, 0.14);
		background: #fff;
	}

	.primary {
		width: 100%;
		border: 0;
		padding: 0.8rem;
		border-radius: 0.75rem;
		background: #2563eb;
		color: #fff;
		font-weight: 700;
		cursor: pointer;
	}

	.primary:disabled {
		opacity: 0.6;
		cursor: not-allowed;
	}

	.notice,
	.alert {
		padding: 0.8rem 0.95rem;
		border-radius: 0.8rem;
		font-size: 0.9rem;
	}

	.notice.success {
		background: rgba(22, 163, 74, 0.12);
		color: #166534;
		border: 1px solid rgba(22, 163, 74, 0.22);
	}

	.notice.error,
	.alert {
		background: rgba(220, 38, 38, 0.1);
		color: #991b1b;
		border: 1px solid rgba(220, 38, 38, 0.2);
	}

	.preview {
		display: grid;
		grid-template-columns: minmax(0, 280px) 1fr;
		gap: 1rem;
		align-items: start;
	}

	.preview-media,
	.card-media {
		width: 100%;
		aspect-ratio: 16 / 9;
		object-fit: cover;
		border-radius: 0.75rem;
		border: 1px solid rgba(15, 23, 42, 0.1);
	}

	.tiktok-frame {
		border: 0;
		background: #000;
		aspect-ratio: 9 / 16;
	}

	.instagram-frame {
		border: 0;
		background: #fff;
		aspect-ratio: 4 / 5;
	}

	.platform {
		display: inline-block;
		padding: 0.15rem 0.55rem;
		border-radius: 999px;
		font-size: 0.7rem;
		font-weight: 700;
		background: rgba(180, 83, 9, 0.14);
		color: #92400e;
	}

	.meta {
		margin: 0.25rem 0 0;
		color: #64748b;
		font-size: 0.9rem;
	}

	.metrics {
		display: grid;
		grid-template-columns: repeat(5, minmax(0, 1fr));
		gap: 0.6rem;
		margin: 1rem 0;
	}

	.metric-item {
		padding: 0.65rem;
		border-radius: 0.75rem;
		background: rgba(15, 23, 42, 0.04);
		border: 1px solid rgba(15, 23, 42, 0.08);
	}

	.metric-item input {
		border: 0;
		background: transparent;
		padding: 0;
		font-weight: 700;
		font-size: 1.02rem;
	}

	.metric-item label {
		font-size: 0.74rem;
	}

	.list-head {
		display: flex;
		justify-content: space-between;
		align-items: center;
		margin-bottom: 1rem;
		gap: 0.7rem;
	}

	.empty {
		text-align: center;
		color: #64748b;
		padding: 1.5rem;
	}

	.platform-groups {
		display: grid;
		gap: 1rem;
	}

	.platform-group-head {
		display: flex;
		justify-content: space-between;
		align-items: center;
		padding-bottom: 0.55rem;
		border-bottom: 1px solid rgba(15, 23, 42, 0.08);
		margin-bottom: 0.8rem;
	}

	.platform-group-head h3 {
		margin: 0;
	}

	.group-count {
		padding: 0.18rem 0.6rem;
		border-radius: 999px;
		font-size: 0.75rem;
		font-weight: 700;
		color: #1d4ed8;
		background: rgba(37, 99, 235, 0.12);
	}

	.grid {
		display: grid;
		grid-template-columns: repeat(auto-fill, minmax(280px, 1fr));
		gap: 0.9rem;
	}

	.card {
		--platform-frame-color: rgba(15, 23, 42, 0.1);
		background: #fff;
		border-radius: 0.95rem;
		border: 1px solid var(--platform-frame-color);
		padding: 0.7rem;
		display: grid;
		gap: 0.7rem;
	}

	.platform-frame--instagram {
		--platform-frame-color: #ec4899;
	}

	.platform-frame--tiktok {
		--platform-frame-color: #111111;
	}

	.platform-frame--youtube {
		--platform-frame-color: #dc2626;
	}

	.platform-frame--facebook {
		--platform-frame-color: #1877f2;
	}

	.card-body {
		display: grid;
		gap: 0.55rem;
	}

	.head-row {
		display: flex;
		align-items: center;
		gap: 0.35rem;
		flex-wrap: wrap;
	}

	.chip {
		padding: 0.12rem 0.48rem;
		border-radius: 999px;
		font-size: 0.7rem;
		font-weight: 700;
		background: rgba(22, 163, 74, 0.12);
		color: #166534;
	}

	.card h3 {
		margin: 0;
		font-size: 1rem;
	}

	.idea-title {
		margin: 0;
		font-size: 0.84rem;
		color: #475569;
	}

	.stats {
		display: grid;
		grid-template-columns: repeat(2, minmax(0, 1fr));
		gap: 0.4rem;
	}

	.stat-badge {
		display: flex;
		justify-content: space-between;
		font-size: 0.78rem;
		padding: 0.42rem 0.5rem;
		border-radius: 0.55rem;
		background: rgba(15, 23, 42, 0.05);
	}

	.notes {
		margin: 0;
		font-size: 0.85rem;
		color: #475569;
	}

	.link {
		font-size: 0.8rem;
		color: #2563eb;
		white-space: nowrap;
		overflow: hidden;
		text-overflow: ellipsis;
		text-decoration: none;
	}

	.danger {
		border: 1px solid rgba(220, 38, 38, 0.24);
		background: rgba(220, 38, 38, 0.08);
		color: #b91c1c;
		padding: 0.45rem 0.6rem;
		border-radius: 0.6rem;
		font-weight: 700;
		cursor: pointer;
	}

	@media (max-width: 900px) {
		.preview {
			grid-template-columns: 1fr;
		}

		.metrics {
			grid-template-columns: repeat(2, minmax(0, 1fr));
		}
	}
</style>
