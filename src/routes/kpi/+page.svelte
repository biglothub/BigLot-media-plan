<script lang="ts">
	import { onMount } from 'svelte';
	import { hasSupabaseConfig, supabase } from '$lib/supabase';
	import type { EnrichResult, ProductionCalendarRow, ProducedVideoRow } from '$lib/types';
	import {
		formatCalendarDate,
		formatCount,
		getInstagramEmbedUrl,
		getPlatformFromUrl,
		getTikTokEmbedUrl,
		normalizeMetricValue,
		numberFormatter
	} from '$lib/media-plan';

	type KpiStatus = 'up' | 'down' | 'same' | 'na';

	let calendarItems = $state<ProductionCalendarRow[]>([]);
	let producedVideos = $state<ProducedVideoRow[]>([]);
	let loadingCalendar = $state(false);
	let loadingProduced = $state(false);
	let selectedCalendarId = $state<string | null>(null);
	let producedLinkInput = $state('');
	let producedNotes = $state('');
	let producedDraft = $state<EnrichResult | null>(null);
	let analyzingProduced = $state(false);
	let savingProduced = $state(false);
	let message = $state('');
	let errorMessage = $state('');

	let producedMetrics = $state({
		views: null as number | null,
		likes: null as number | null,
		comments: null as number | null,
		shares: null as number | null,
		saves: null as number | null
	});

	const sortedCalendarIdeas = $derived.by(() =>
		[...calendarItems].sort((a, b) => a.shoot_date.localeCompare(b.shoot_date))
	);

	const selectedCalendarItem = $derived.by(
		() => sortedCalendarIdeas.find((item) => item.id === selectedCalendarId) ?? null
	);

	const producedByCalendarId = $derived.by(() => {
		const map = new Map<string, ProducedVideoRow>();
		for (const video of producedVideos) map.set(video.calendar_id, video);
		return map;
	});

	const selectedProducedVideo = $derived.by(() =>
		selectedCalendarId ? producedByCalendarId.get(selectedCalendarId) ?? null : null
	);

	const effectiveProducedPreview = $derived.by(() => {
		if (producedDraft) {
			return {
				platform: producedDraft.platform,
				url: producedDraft.url,
				title: producedDraft.title,
				thumbnailUrl: producedDraft.thumbnailUrl
			};
		}

		if (!selectedProducedVideo) return null;

		return {
			platform: selectedProducedVideo.platform,
			url: selectedProducedVideo.url,
			title: selectedProducedVideo.title,
			thumbnailUrl: selectedProducedVideo.thumbnail_url
		};
	});

	const producedTikTokEmbedUrl = $derived(
		effectiveProducedPreview && effectiveProducedPreview.platform === 'tiktok'
			? getTikTokEmbedUrl(effectiveProducedPreview.url)
			: null
	);

	const producedInstagramEmbedUrl = $derived(
		effectiveProducedPreview && effectiveProducedPreview.platform === 'instagram'
			? getInstagramEmbedUrl(effectiveProducedPreview.url)
			: null
	);

	const kpiRows = $derived.by(() => {
		const original = selectedCalendarItem?.idea_backlog;
		const produced = {
			view_count: normalizeMetricValue(producedMetrics.views),
			like_count: normalizeMetricValue(producedMetrics.likes),
			comment_count: normalizeMetricValue(producedMetrics.comments),
			share_count: normalizeMetricValue(producedMetrics.shares),
			save_count: normalizeMetricValue(producedMetrics.saves)
		};

		const specs = [
			{ key: 'views', label: 'Views' },
			{ key: 'likes', label: 'Likes' },
			{ key: 'comments', label: 'Comments' },
			{ key: 'shares', label: 'Shares' },
			{ key: 'saves', label: 'Saves' }
		] as const;

		const metricColumnByKey = {
			views: 'view_count',
			likes: 'like_count',
			comments: 'comment_count',
			shares: 'share_count',
			saves: 'save_count'
		} as const;

		return specs.map(({ key, label }) => {
			const metricColumn = metricColumnByKey[key];
			const originalValue = original?.[metricColumn] as number | null | undefined;
			const producedValue = produced[metricColumn];

			if (
				originalValue === null ||
				originalValue === undefined ||
				producedValue === null ||
				producedValue === undefined
			) {
				return {
					label,
					original: originalValue ?? null,
					produced: producedValue ?? null,
					delta: null as number | null,
					pct: null as number | null,
					status: 'na' as KpiStatus
				};
			}

			const delta = producedValue - originalValue;
			const pct = originalValue === 0 ? (producedValue === 0 ? 0 : null) : (delta / originalValue) * 100;
			const status: KpiStatus = delta > 0 ? 'up' : delta < 0 ? 'down' : 'same';

			return {
				label,
				original: originalValue,
				produced: producedValue,
				delta,
				pct,
				status
			};
		});
	});

	function metricLabel(status: KpiStatus): string {
		if (status === 'up') return 'Better';
		if (status === 'down') return 'Lower';
		if (status === 'same') return 'Same';
		return 'N/A';
	}

	function formatDelta(value: number | null): string {
		if (value === null) return '-';
		const sign = value > 0 ? '+' : '';
		return `${sign}${numberFormatter.format(value)}`;
	}

	function formatPercent(value: number | null): string {
		if (value === null) return '-';
		const sign = value > 0 ? '+' : '';
		return `${sign}${value.toFixed(1)}%`;
	}

	function resetProducedForm() {
		producedLinkInput = '';
		producedNotes = '';
		producedDraft = null;
		producedMetrics = {
			views: null,
			likes: null,
			comments: null,
			shares: null,
			saves: null
		};
	}

	async function loadCalendar() {
		if (!supabase) return;
		loadingCalendar = true;

		const { data, error } = await supabase
			.from('production_calendar')
			.select('id, backlog_id, shoot_date, status, notes, created_at, idea_backlog(*)')
			.order('shoot_date', { ascending: true })
			.order('created_at', { ascending: true });

		loadingCalendar = false;
		if (error) {
			errorMessage = `โหลด calendar ไม่ได้: ${error.message}`;
			return;
		}

		const normalized = (data ?? []).map((item) => {
			const row = item as Record<string, unknown>;
			const linkedIdea = row.idea_backlog;
			return {
				...row,
				idea_backlog: Array.isArray(linkedIdea) ? (linkedIdea[0] ?? null) : (linkedIdea ?? null)
			};
		});

		calendarItems = normalized as ProductionCalendarRow[];
		if (selectedCalendarId && !calendarItems.some((item) => item.id === selectedCalendarId)) {
			selectedCalendarId = null;
			resetProducedForm();
		}
	}

	async function loadProducedVideos() {
		if (!supabase) return;
		loadingProduced = true;

		const { data, error } = await supabase
			.from('produced_videos')
			.select('*')
			.order('created_at', { ascending: false });

		loadingProduced = false;
		if (error) {
			errorMessage = `โหลด produced videos ไม่ได้: ${error.message}`;
			return;
		}

		producedVideos = (data ?? []) as ProducedVideoRow[];
		if (selectedCalendarId) {
			hydrateProducedForm(selectedCalendarId);
		}
	}

	function hydrateProducedForm(calendarId: string | null) {
		if (!calendarId) {
			resetProducedForm();
			return;
		}

		const existing = producedVideos.find((video) => video.calendar_id === calendarId);
		if (!existing) {
			resetProducedForm();
			return;
		}

		producedLinkInput = existing.url;
		producedNotes = existing.notes ?? '';
		producedDraft = null;
		producedMetrics = {
			views: existing.view_count,
			likes: existing.like_count,
			comments: existing.comment_count,
			shares: existing.share_count,
			saves: existing.save_count
		};
	}

	function selectCalendarItem(calendarId: string) {
		selectedCalendarId = calendarId;
		hydrateProducedForm(calendarId);
	}

	async function analyzeProducedLink() {
		errorMessage = '';
		message = '';

		if (!selectedCalendarItem) {
			errorMessage = 'เลือกไอเดียจากฝั่งซ้ายก่อน';
			return;
		}

		if (!producedLinkInput.trim()) {
			errorMessage = 'กรุณาวางลิงก์วิดีโอที่ทำจริง';
			return;
		}

		analyzingProduced = true;
		try {
			const response = await fetch(`/api/enrich?url=${encodeURIComponent(producedLinkInput.trim())}`);
			const body = await response.json();

			if (!response.ok) {
				errorMessage = body.error ?? 'อ่านข้อมูลวิดีโอที่ทำจริงไม่สำเร็จ';
				return;
			}

			producedDraft = body as EnrichResult;
			producedLinkInput = producedDraft.url;
			producedMetrics = {
				views: producedDraft.metrics.views,
				likes: producedDraft.metrics.likes,
				comments: producedDraft.metrics.comments,
				shares: producedDraft.metrics.shares,
				saves: producedDraft.metrics.saves
			};
			message = 'ดึงข้อมูลวิดีโอที่ทำจริงสำเร็จแล้ว';
		} catch (error) {
			errorMessage =
				error instanceof Error ? error.message : 'เกิดข้อผิดพลาดระหว่าง analyze วิดีโอที่ทำจริง';
		} finally {
			analyzingProduced = false;
		}
	}

	async function saveProducedVideo() {
		if (!supabase) {
			errorMessage = 'ยังไม่ได้ตั้งค่า Supabase';
			return;
		}

		if (!selectedCalendarItem) {
			errorMessage = 'เลือกไอเดียจากฝั่งซ้ายก่อน';
			return;
		}

		const finalUrl = (producedDraft?.url ?? producedLinkInput).trim();
		if (!finalUrl) {
			errorMessage = 'กรุณาใส่ลิงก์วิดีโอที่ทำจริง';
			return;
		}

		errorMessage = '';
		message = '';
		savingProduced = true;

		const sourcePlatform =
			producedDraft?.platform ??
			getPlatformFromUrl(finalUrl) ??
			selectedCalendarItem.idea_backlog?.platform ??
			'youtube';

		const payload = {
			calendar_id: selectedCalendarItem.id,
			url: finalUrl,
			platform: sourcePlatform,
			title: producedDraft?.title ?? null,
			thumbnail_url: producedDraft?.thumbnailUrl ?? null,
			published_at: producedDraft?.publishedAt ?? null,
			view_count: producedMetrics.views,
			like_count: producedMetrics.likes,
			comment_count: producedMetrics.comments,
			share_count: producedMetrics.shares,
			save_count: producedMetrics.saves,
			notes: producedNotes.trim() || null
		};

		const { error } = await supabase.from('produced_videos').upsert(payload, { onConflict: 'calendar_id' });
		savingProduced = false;

		if (error) {
			errorMessage = `บันทึก produced video ไม่สำเร็จ: ${error.message}`;
			return;
		}

		message = 'บันทึกวิดีโอที่ทำจริงแล้ว';
		await loadProducedVideos();
		hydrateProducedForm(selectedCalendarItem.id);
	}

	onMount(async () => {
		await Promise.all([loadCalendar(), loadProducedVideos()]);
		if (!selectedCalendarId && calendarItems.length > 0) {
			selectCalendarItem(calendarItems[0].id);
		}
	});
</script>

<main class="page">
	<section class="hero">
		<p class="kicker">Measurement</p>
		<h1>KPI Compare</h1>
		<p>เทียบผล engagement ระหว่างไอเดียต้นฉบับกับวิดีโอที่ผลิตจริง</p>
	</section>

	{#if !hasSupabaseConfig}
		<p class="alert">
			ตั้งค่า env ก่อนใช้งาน: <code>PUBLIC_SUPABASE_URL</code> และ
			<code>PUBLIC_SUPABASE_ANON_KEY</code>
		</p>
	{/if}

	{#if message}
		<p class="notice success">{message}</p>
	{/if}

	{#if errorMessage}
		<p class="notice error">{errorMessage}</p>
	{/if}

	<section class="panel">
		<div class="kpi-layout">
			<div class="kpi-left">
				<div class="list-head">
					<h2>Calendar Ideas</h2>
					{#if loadingCalendar}
						<span>Loading...</span>
					{/if}
				</div>

				{#if sortedCalendarIdeas.length === 0}
					<p class="empty">ยังไม่มีไอเดียใน calendar</p>
				{:else}
					<div class="kpi-idea-list">
						{#each sortedCalendarIdeas as item}
							<button
								class={`kpi-idea-btn ${selectedCalendarId === item.id ? 'active' : ''}`}
								onclick={() => selectCalendarItem(item.id)}
							>
								<div>
									<strong>{item.idea_backlog?.title ?? 'Untitled idea'}</strong>
									<p>{formatCalendarDate(item.shoot_date)}</p>
								</div>
								{#if producedByCalendarId.has(item.id)}
									<span class="chip">Compared</span>
								{/if}
							</button>
						{/each}
					</div>
				{/if}
			</div>

			<div class="kpi-right">
				{#if !selectedCalendarItem}
					<p class="empty">เลือกไอเดียจากฝั่งซ้ายเพื่อเริ่มเทียบ KPI</p>
				{:else}
					<div class="kpi-source">
						<p class="kicker small">Original Idea</p>
						<h3>{selectedCalendarItem.idea_backlog?.title ?? 'Untitled idea'}</h3>
						<p class="meta">{formatCalendarDate(selectedCalendarItem.shoot_date)}</p>
					</div>

					<div class="row">
						<label for="produced-link">Produced Video Link</label>
						<input
							id="produced-link"
							bind:value={producedLinkInput}
							placeholder="https://www.youtube.com/watch?v=..."
						/>
					</div>
					<div class="kpi-actions">
						<button class="ghost" onclick={analyzeProducedLink} disabled={analyzingProduced}>
							{analyzingProduced ? 'Analyzing...' : 'Analyze Produced Video'}
						</button>
						<button class="primary" onclick={saveProducedVideo} disabled={savingProduced}>
							{savingProduced ? 'Saving...' : 'Save Produced KPI'}
						</button>
					</div>

					{#if loadingProduced}
						<p class="meta">Loading produced videos...</p>
					{/if}

					{#if effectiveProducedPreview}
						<div class="preview mini-preview">
							{#if producedTikTokEmbedUrl}
								<iframe
									class="preview-media tiktok-frame"
									src={producedTikTokEmbedUrl}
									title="Produced TikTok Preview"
									loading="lazy"
									allow="encrypted-media; picture-in-picture"
									allowfullscreen
								></iframe>
							{:else if producedInstagramEmbedUrl}
								<iframe
									class="preview-media instagram-frame"
									src={producedInstagramEmbedUrl}
									title="Produced Instagram Preview"
									loading="lazy"
									allow="encrypted-media; picture-in-picture"
									allowfullscreen
								></iframe>
							{:else if effectiveProducedPreview.thumbnailUrl}
								<img
									class="preview-media"
									src={effectiveProducedPreview.thumbnailUrl}
									alt={effectiveProducedPreview.title ?? 'thumbnail'}
								/>
							{/if}
							<div>
								<span class="platform">{effectiveProducedPreview.platform.toUpperCase()}</span>
								<h4>{effectiveProducedPreview.title ?? 'Untitled produced video'}</h4>
							</div>
						</div>
					{/if}

					<div class="metrics">
						<div class="metric-item">
							<label for="p-views">Views</label>
							<input id="p-views" type="number" min="0" bind:value={producedMetrics.views} />
						</div>
						<div class="metric-item">
							<label for="p-likes">Likes</label>
							<input id="p-likes" type="number" min="0" bind:value={producedMetrics.likes} />
						</div>
						<div class="metric-item">
							<label for="p-comments">Comments</label>
							<input id="p-comments" type="number" min="0" bind:value={producedMetrics.comments} />
						</div>
						<div class="metric-item">
							<label for="p-shares">Shares</label>
							<input id="p-shares" type="number" min="0" bind:value={producedMetrics.shares} />
						</div>
						<div class="metric-item">
							<label for="p-saves">Saves</label>
							<input id="p-saves" type="number" min="0" bind:value={producedMetrics.saves} />
						</div>
					</div>

					<div class="row">
						<label for="produced-notes">Produced Notes</label>
						<textarea
							id="produced-notes"
							bind:value={producedNotes}
							rows={3}
							placeholder="ผลลัพธ์ที่ต่างจากต้นฉบับ เช่น hook ที่ปรับ, ปัญหาหน้างาน..."
						></textarea>
					</div>

					<div class="kpi-table-wrap">
						<table class="kpi-table">
							<thead>
								<tr>
									<th>Metric</th>
									<th>Original</th>
									<th>Produced</th>
									<th>Delta</th>
									<th>%</th>
									<th>Status</th>
								</tr>
							</thead>
							<tbody>
								{#each kpiRows as row}
									<tr>
										<td>{row.label}</td>
										<td>{formatCount(row.original)}</td>
										<td>{formatCount(row.produced)}</td>
										<td>{formatDelta(row.delta)}</td>
										<td>{formatPercent(row.pct)}</td>
										<td>
											<span class={`kpi-status ${row.status}`}>{metricLabel(row.status)}</span>
										</td>
									</tr>
								{/each}
							</tbody>
						</table>
					</div>
				{/if}
			</div>
		</div>
	</section>
</main>

<style>
	.page {
		display: grid;
		gap: 1rem;
	}

	h1,
	h2,
	h3,
	h4 {
		font-family: 'Space Grotesk', 'Noto Sans Thai', sans-serif;
	}

	.hero {
		text-align: center;
		padding: 1.2rem 0 0.2rem;
	}

	.hero h1 {
		margin: 0.4rem 0;
		font-size: clamp(1.8rem, 4.4vw, 2.7rem);
	}

	.hero p {
		margin: 0;
		color: #475569;
	}

	.kicker {
		margin: 0;
		font-size: 0.78rem;
		text-transform: uppercase;
		letter-spacing: 0.16em;
		color: #b45309;
		font-weight: 700;
	}

	.kicker.small {
		color: #2563eb;
		font-size: 0.68rem;
	}

	.panel {
		padding: 1rem;
		border-radius: 1rem;
		border: 1px solid rgba(15, 23, 42, 0.08);
		background: rgba(255, 255, 255, 0.86);
	}

	.alert,
	.notice {
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

	.kpi-layout {
		display: grid;
		grid-template-columns: 320px 1fr;
		gap: 0.8rem;
	}

	.kpi-left,
	.kpi-right {
		border: 1px solid rgba(15, 23, 42, 0.09);
		border-radius: 0.85rem;
		background: #fff;
		padding: 0.8rem;
	}

	.list-head {
		display: flex;
		justify-content: space-between;
		align-items: center;
		gap: 0.5rem;
		margin-bottom: 0.6rem;
	}

	.list-head h2 {
		margin: 0;
		font-size: 1.1rem;
	}

	.kpi-idea-list {
		display: grid;
		gap: 0.45rem;
		max-height: 550px;
		overflow: auto;
	}

	.kpi-idea-btn {
		text-align: left;
		border: 1px solid rgba(15, 23, 42, 0.1);
		border-radius: 0.75rem;
		background: #fff;
		padding: 0.6rem;
		cursor: pointer;
		display: flex;
		justify-content: space-between;
		gap: 0.4rem;
	}

	.kpi-idea-btn strong {
		display: block;
		font-size: 0.86rem;
	}

	.kpi-idea-btn p {
		margin: 0.2rem 0 0;
		font-size: 0.74rem;
		color: #64748b;
	}

	.kpi-idea-btn.active {
		border-color: rgba(37, 99, 235, 0.4);
		box-shadow: inset 0 0 0 1px rgba(37, 99, 235, 0.2);
	}

	.chip {
		padding: 0.12rem 0.5rem;
		border-radius: 999px;
		font-size: 0.7rem;
		font-weight: 700;
		height: fit-content;
		background: rgba(22, 163, 74, 0.12);
		color: #166534;
	}

	.kpi-source h3 {
		margin: 0.2rem 0;
	}

	.meta {
		margin: 0;
		font-size: 0.84rem;
		color: #64748b;
	}

	.row {
		display: grid;
		gap: 0.45rem;
		margin: 0.7rem 0;
	}

	label {
		font-size: 0.82rem;
		color: #475569;
	}

	input,
	textarea {
		width: 100%;
		box-sizing: border-box;
		font: inherit;
		padding: 0.68rem 0.8rem;
		border-radius: 0.7rem;
		border: 1px solid rgba(15, 23, 42, 0.15);
		background: #fff;
	}

	.kpi-actions {
		display: flex;
		gap: 0.55rem;
		margin-bottom: 0.65rem;
		flex-wrap: wrap;
	}

	.primary,
	.ghost {
		border-radius: 0.68rem;
		font-weight: 700;
		padding: 0.58rem 0.8rem;
		cursor: pointer;
	}

	.primary {
		border: 0;
		background: #2563eb;
		color: #fff;
	}

	.ghost {
		border: 1px solid rgba(37, 99, 235, 0.25);
		background: rgba(37, 99, 235, 0.08);
		color: #1d4ed8;
	}

	.preview {
		display: grid;
		grid-template-columns: 180px 1fr;
		gap: 0.8rem;
		align-items: center;
		margin-bottom: 0.8rem;
	}

	.preview-media {
		width: 100%;
		aspect-ratio: 16 / 9;
		object-fit: cover;
		border-radius: 0.72rem;
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
		padding: 0.14rem 0.5rem;
		border-radius: 999px;
		font-size: 0.67rem;
		font-weight: 700;
		background: rgba(180, 83, 9, 0.14);
		color: #92400e;
	}

	.metrics {
		display: grid;
		grid-template-columns: repeat(5, minmax(0, 1fr));
		gap: 0.5rem;
		margin-bottom: 0.7rem;
	}

	.metric-item {
		padding: 0.55rem;
		border-radius: 0.7rem;
		background: rgba(15, 23, 42, 0.04);
		border: 1px solid rgba(15, 23, 42, 0.08);
	}

	.metric-item input {
		border: 0;
		background: transparent;
		padding: 0;
		font-weight: 700;
	}

	.metric-item label {
		font-size: 0.73rem;
	}

	.kpi-table-wrap {
		overflow-x: auto;
	}

	.kpi-table {
		width: 100%;
		min-width: 520px;
		border-collapse: collapse;
		font-size: 0.83rem;
	}

	.kpi-table th,
	.kpi-table td {
		border-bottom: 1px solid rgba(15, 23, 42, 0.08);
		padding: 0.48rem 0.4rem;
		text-align: left;
	}

	.kpi-table th {
		font-size: 0.74rem;
		color: #64748b;
		text-transform: uppercase;
	}

	.kpi-status {
		display: inline-block;
		border-radius: 999px;
		padding: 0.14rem 0.5rem;
		font-size: 0.7rem;
		font-weight: 700;
	}

	.kpi-status.up {
		background: rgba(22, 163, 74, 0.12);
		color: #166534;
	}

	.kpi-status.down {
		background: rgba(220, 38, 38, 0.12);
		color: #b91c1c;
	}

	.kpi-status.same {
		background: rgba(2, 132, 199, 0.12);
		color: #0c4a6e;
	}

	.kpi-status.na {
		background: rgba(100, 116, 139, 0.14);
		color: #475569;
	}

	.empty {
		margin: 0;
		color: #64748b;
		font-size: 0.9rem;
	}

	@media (max-width: 980px) {
		.kpi-layout {
			grid-template-columns: 1fr;
		}

		.preview {
			grid-template-columns: 1fr;
		}

		.metrics {
			grid-template-columns: repeat(2, minmax(0, 1fr));
		}
	}
</style>
