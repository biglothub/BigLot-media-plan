<script lang="ts">
	import { onMount } from 'svelte';
	import { hasSupabaseConfig, supabase } from '$lib/supabase';
	import type {
		IdeaBacklogRow,
		ProductionCalendarRow,
		CalendarAssignmentRow,
		TeamMember,
		ProductionStage,
		SupportedPlatform,
		BacklogContentType
	} from '$lib/types';
	import {
		PRODUCTION_STAGES,
		stageLabel,
		platformLabel,
		formatCount,
		formatCalendarDate,
		contentTypeLabel
	} from '$lib/media-plan';

	let calendarItems = $state<ProductionCalendarRow[]>([]);
	let loading = $state(false);
	let message = $state('');
	let errorMessage = $state('');

	// Drag state
	let draggingItemId = $state<string | null>(null);
	let dragHoverStage = $state<ProductionStage | null>(null);

	// Detail modal
	let detailItem = $state<ProductionCalendarRow | null>(null);
	let detailNotes = $state('');
	let detailShootDate = $state('');
	let detailStatus = $state<ProductionStage>('planned');
	let detailPlatform = $state<SupportedPlatform>('youtube');
	let detailContentType = $state<BacklogContentType>('video');
	let detailTitle = $state('');
	let detailUrl = $state('');
	let detailAuthorName = $state('');
	let detailDescription = $state('');
	let detailThumbnailUrl = $state('');
	let detailPublishedAt = $state('');
	let detailViews = $state<number | null>(null);
	let detailLikes = $state<number | null>(null);
	let detailComments = $state<number | null>(null);
	let detailShares = $state<number | null>(null);
	let detailSaves = $state<number | null>(null);
	let savingDetail = $state(false);
	let assignmentDraft = $state<Record<TeamMember, { enabled: boolean; role_detail: string }>>({
		โฟน: { enabled: false, role_detail: '' },
		ฟิวส์: { enabled: false, role_detail: '' },
		อิก: { enabled: false, role_detail: '' },
		ต้า: { enabled: false, role_detail: '' }
	});

	const TEAM_MEMBERS: TeamMember[] = ['โฟน', 'ฟิวส์', 'อิก', 'ต้า'];

	const STAGE_META: Record<ProductionStage, { color: string; bg: string; headerBg: string; count?: number }> = {
		planned:    { color: '#475569', bg: '#f1f5f9', headerBg: '#e2e8f0' },
		scripting:  { color: '#6d28d9', bg: '#f5f3ff', headerBg: '#ede9fe' },
		shooting:   { color: '#b45309', bg: '#fffbeb', headerBg: '#fef3c7' },
		editing:    { color: '#1d4ed8', bg: '#eff6ff', headerBg: '#dbeafe' },
		published:  { color: '#166534', bg: '#f0fdf4', headerBg: '#dcfce7' }
	};

	// Group items by stage
	const boardColumns = $derived.by(() => {
		const map = new Map<ProductionStage, ProductionCalendarRow[]>();
		for (const stage of PRODUCTION_STAGES) map.set(stage, []);
		for (const item of calendarItems) {
			const stage = (item.status as ProductionStage) ?? 'planned';
			const bucket = map.get(stage) ?? [];
			bucket.push(item);
			map.set(stage, bucket);
		}
		return map;
	});

	function backlogCode(idea: Pick<IdeaBacklogRow, 'id' | 'idea_code'>): string {
		const code = idea.idea_code?.trim();
		return code ? code : `BL-${idea.id.slice(0, 8).toUpperCase()}`;
	}

	async function loadCalendar() {
		if (!supabase) return;
		loading = true;
		const { data, error } = await supabase
			.from('production_calendar')
			.select('id, backlog_id, shoot_date, status, notes, created_at, idea_backlog(*), calendar_assignments(*)')
			.order('shoot_date', { ascending: true })
			.order('created_at', { ascending: true });

		loading = false;
		if (error) {
			errorMessage = `โหลดข้อมูลไม่ได้: ${error.message}`;
			return;
		}
		const normalized = (data ?? []).map((item) => {
			const row = item as Record<string, unknown>;
			const linkedIdea = row.idea_backlog;
			const assignments = row.calendar_assignments;
			return {
				...row,
				idea_backlog: Array.isArray(linkedIdea) ? (linkedIdea[0] ?? null) : (linkedIdea ?? null),
				calendar_assignments: Array.isArray(assignments) ? assignments : []
			};
		});
		calendarItems = normalized as ProductionCalendarRow[];
	}

	async function moveCard(calendarId: string, newStage: ProductionStage) {
		if (!supabase) return;
		errorMessage = '';
		// Optimistic update
		calendarItems = calendarItems.map((item) =>
			item.id === calendarId ? { ...item, status: newStage } : item
		);
		const { error } = await supabase
			.from('production_calendar')
			.update({ status: newStage })
			.eq('id', calendarId);
		if (error) {
			errorMessage = `อัปเดตสถานะไม่สำเร็จ: ${error.message}`;
			await loadCalendar();
		}
	}

	// Drag handlers
	function handleDragStart(event: DragEvent, itemId: string) {
		draggingItemId = itemId;
		event.dataTransfer?.setData('text/plain', itemId);
		if (event.dataTransfer) event.dataTransfer.effectAllowed = 'move';
	}

	function handleDragOver(event: DragEvent, stage: ProductionStage) {
		event.preventDefault();
		dragHoverStage = stage;
		if (event.dataTransfer) event.dataTransfer.dropEffect = 'move';
	}

	async function handleDrop(event: DragEvent, stage: ProductionStage) {
		event.preventDefault();
		const itemId = event.dataTransfer?.getData('text/plain') || draggingItemId;
		draggingItemId = null;
		dragHoverStage = null;
		if (!itemId) return;
		// Find the current item stage to avoid unnecessary updates
		const item = calendarItems.find((c) => c.id === itemId);
		if (!item || item.status === stage) return;
		await moveCard(itemId, stage);
	}

	// Detail modal
	function openDetail(item: ProductionCalendarRow) {
		detailItem = item;
		detailNotes = item.notes ?? '';
		detailShootDate = item.shoot_date ?? '';
		detailStatus = (item.status as ProductionStage) ?? 'planned';
		const bl = item.idea_backlog;
		detailPlatform = (bl?.platform as SupportedPlatform) ?? 'youtube';
		detailContentType = (bl?.content_type as BacklogContentType) ?? 'video';
		detailTitle = bl?.title ?? '';
		detailUrl = bl?.url ?? '';
		detailAuthorName = bl?.author_name ?? '';
		detailDescription = bl?.description ?? '';
		detailThumbnailUrl = bl?.thumbnail_url ?? '';
		detailPublishedAt = bl?.published_at ? new Date(bl.published_at).toISOString().slice(0, 16) : '';
		detailViews = bl?.view_count ?? null;
		detailLikes = bl?.like_count ?? null;
		detailComments = bl?.comment_count ?? null;
		detailShares = bl?.share_count ?? null;
		detailSaves = bl?.save_count ?? null;
		assignmentDraft = {
			โฟน: { enabled: false, role_detail: '' },
			ฟิวส์: { enabled: false, role_detail: '' },
			อิก: { enabled: false, role_detail: '' },
			ต้า: { enabled: false, role_detail: '' }
		};
		for (const a of item.calendar_assignments ?? []) {
			assignmentDraft[a.member_name] = { enabled: true, role_detail: a.role_detail };
		}
	}

	function closeDetail() {
		detailItem = null;
	}

	async function saveDetail() {
		if (!supabase || !detailItem) return;
		savingDetail = true;
		errorMessage = '';
		const calendarId = detailItem.id;
		const backlogId = detailItem.backlog_id;

		const { error: blErr } = await supabase
			.from('idea_backlog')
			.update({
				platform: detailPlatform,
				content_type: detailContentType,
				title: detailTitle.trim() || null,
				url: detailUrl.trim() || null,
				author_name: detailAuthorName.trim() || null,
				description: detailDescription.trim() || null,
				thumbnail_url: detailThumbnailUrl.trim() || null,
				published_at: detailPublishedAt ? new Date(detailPublishedAt).toISOString() : null,
				view_count: detailViews,
				like_count: detailLikes,
				comment_count: detailComments,
				share_count: detailShares,
				save_count: detailSaves
			})
			.eq('id', backlogId);

		if (blErr) {
			errorMessage = `บันทึก content info ไม่สำเร็จ: ${blErr.message}`;
			savingDetail = false;
			return;
		}

		const { error: calErr } = await supabase
			.from('production_calendar')
			.update({ shoot_date: detailShootDate, status: detailStatus, notes: detailNotes.trim() || null })
			.eq('id', calendarId);

		if (calErr) {
			errorMessage = `บันทึก calendar ไม่สำเร็จ: ${calErr.message}`;
			savingDetail = false;
			return;
		}

		await supabase.from('calendar_assignments').delete().eq('calendar_id', calendarId);
		const toInsert = TEAM_MEMBERS.filter((m) => assignmentDraft[m].enabled).map((m) => ({
			calendar_id: calendarId,
			member_name: m,
			role_detail: assignmentDraft[m].role_detail
		}));
		if (toInsert.length > 0) {
			const { error: aErr } = await supabase.from('calendar_assignments').insert(toInsert);
			if (aErr) {
				errorMessage = `บันทึกหน้าที่ไม่สำเร็จ: ${aErr.message}`;
				savingDetail = false;
				return;
			}
		}

		savingDetail = false;
		message = 'บันทึกเรียบร้อยแล้ว';
		closeDetail();
		await loadCalendar();
	}

	onMount(() => {
		loadCalendar();
	});
</script>

<main class="page">
	<section class="hero">
		<p class="kicker">Production</p>
		<h1>Kanban Board</h1>
		<p>ลากการ์ดข้ามคอลัมน์เพื่ออัปเดตสถานะการผลิตคอนเทนต์</p>
	</section>

	{#if !hasSupabaseConfig}
		<p class="alert">ตั้งค่า env ก่อนใช้งาน: <code>PUBLIC_SUPABASE_URL</code> และ <code>PUBLIC_SUPABASE_ANON_KEY</code></p>
	{/if}

	{#if message}
		<p class="notice success">{message}</p>
	{/if}
	{#if errorMessage}
		<p class="notice error">{errorMessage}</p>
	{/if}

	{#if loading}
		<p class="loading">กำลังโหลด...</p>
	{:else}
		<div class="board">
			{#each PRODUCTION_STAGES as stage}
				{@const meta = STAGE_META[stage]}
				{@const cards = boardColumns.get(stage) ?? []}
				<div
					class="column {dragHoverStage === stage ? 'drop-hover' : ''}"
					style="--col-bg: {meta.bg}; --col-header-bg: {meta.headerBg}; --col-color: {meta.color}"
					role="region"
					aria-label={stageLabel[stage]}
					ondragover={(e) => handleDragOver(e, stage)}
					ondragleave={() => (dragHoverStage = null)}
					ondrop={(e) => handleDrop(e, stage)}
				>
					<div class="col-header">
						<span class="col-title">{stageLabel[stage]}</span>
						<span class="col-count">{cards.length}</span>
					</div>

					<div class="col-body">
						{#if cards.length === 0}
							<div class="col-empty">ยังไม่มีรายการ</div>
						{/if}
						{#each cards as item}
							{@const bl = item.idea_backlog}
							<!-- svelte-ignore a11y_no_static_element_interactions -->
							<article
								class="card stage--{item.status || 'planned'}"
								draggable="true"
								ondragstart={(e) => handleDragStart(e, item.id)}
								ondragend={() => { draggingItemId = null; dragHoverStage = null; }}
							>
								{#if bl?.thumbnail_url}
									<img class="card-thumb" src={bl.thumbnail_url} alt={bl.title ?? 'thumbnail'} />
								{/if}

								<div class="card-body">
									{#if bl}
										<div class="card-meta">
											<span class="badge platform">{platformLabel[bl.platform] ?? bl.platform}</span>
											<span class="badge content-type">{contentTypeLabel[bl.content_type] ?? bl.content_type}</span>
										</div>
										<p class="card-code">{backlogCode(bl)}</p>
										<p class="card-title">{bl.title ?? 'Untitled'}</p>
										{#if bl.view_count != null}
											<p class="card-views">Views: {formatCount(bl.view_count)}</p>
										{/if}
									{:else}
										<p class="card-code">Unknown</p>
									{/if}

									{#if item.shoot_date}
										<p class="card-date">{formatCalendarDate(item.shoot_date)}</p>
									{/if}

									{#if (item.calendar_assignments ?? []).length > 0}
										<div class="card-members">
											{#each item.calendar_assignments ?? [] as a}
												<span class="badge member">{a.member_name}</span>
											{/each}
										</div>
									{/if}
								</div>

								<div class="card-actions">
									<button
										class="btn-detail"
										onclick={(e) => { e.stopPropagation(); openDetail(item); }}
									>Detail</button>
								</div>
							</article>
						{/each}
					</div>
				</div>
			{/each}
		</div>
	{/if}
</main>

{#if detailItem}
	<!-- svelte-ignore a11y_no_static_element_interactions -->
	<div class="modal-overlay" onclick={closeDetail} onkeydown={(e) => e.key === 'Escape' && closeDetail()}>
		<!-- svelte-ignore a11y_no_static_element_interactions -->
		<div class="modal-box" onclick={(e) => e.stopPropagation()} onkeydown={() => {}}>
			<div class="modal-header">
				<div>
					<p class="modal-code">{detailItem.idea_backlog ? backlogCode(detailItem.idea_backlog) : 'Unknown'}</p>
					<h3>{detailTitle || 'Untitled'}</h3>
				</div>
				<button class="ghost" onclick={closeDetail}>✕</button>
			</div>

			<section class="modal-section">
				<h4 class="section-title">Content Info</h4>
				<div class="form-row">
					<div class="form-field">
						<label>Platform</label>
						<select bind:value={detailPlatform}>
							<option value="youtube">YouTube</option>
							<option value="facebook">Facebook</option>
							<option value="instagram">Instagram</option>
							<option value="tiktok">TikTok</option>
						</select>
					</div>
					<div class="form-field">
						<label>Content Type</label>
						<select bind:value={detailContentType}>
							<option value="video">Video</option>
							<option value="post">Post</option>
							<option value="image">Image</option>
						</select>
					</div>
				</div>
				<div class="form-field">
					<label>Title</label>
					<input type="text" bind:value={detailTitle} placeholder="ชื่อคอนเทนต์..." />
				</div>
				<div class="form-field">
					<label>Content Link</label>
					<input type="url" bind:value={detailUrl} placeholder="https://..." />
				</div>
				<div class="form-row">
					<div class="form-field">
						<label>Creator / Account</label>
						<input type="text" bind:value={detailAuthorName} placeholder="ชื่อครีเอเตอร์..." />
					</div>
					<div class="form-field">
						<label>Thumbnail URL</label>
						<input type="url" bind:value={detailThumbnailUrl} placeholder="https://..." />
					</div>
				</div>
			</section>

			<section class="modal-section">
				<h4 class="section-title">Schedule & Status</h4>
				<div class="form-row">
					<div class="form-field">
						<label>Shoot Date</label>
						<input type="date" bind:value={detailShootDate} />
					</div>
					<div class="form-field">
						<label>Published At</label>
						<input type="datetime-local" bind:value={detailPublishedAt} />
					</div>
				</div>
				<div class="form-field">
					<label>Production Stage</label>
					<select bind:value={detailStatus}>
						{#each PRODUCTION_STAGES as stage}
							<option value={stage}>{stageLabel[stage]}</option>
						{/each}
					</select>
				</div>
			</section>

			<section class="modal-section">
				<h4 class="section-title">Metrics</h4>
				<div class="metrics-grid">
					<div class="form-field"><label>Views</label><input type="number" min="0" bind:value={detailViews} placeholder="0" /></div>
					<div class="form-field"><label>Likes</label><input type="number" min="0" bind:value={detailLikes} placeholder="0" /></div>
					<div class="form-field"><label>Comments</label><input type="number" min="0" bind:value={detailComments} placeholder="0" /></div>
					<div class="form-field"><label>Shares</label><input type="number" min="0" bind:value={detailShares} placeholder="0" /></div>
					<div class="form-field"><label>Saves</label><input type="number" min="0" bind:value={detailSaves} placeholder="0" /></div>
				</div>
			</section>

			<section class="modal-section">
				<h4 class="section-title">Team Assignments</h4>
				<div class="assignment-list">
					{#each TEAM_MEMBERS as member}
						<div class="assignment-row">
							<label class="member-toggle">
								<input type="checkbox" bind:checked={assignmentDraft[member].enabled} />
								<span class="member-name">{member}</span>
							</label>
							{#if assignmentDraft[member].enabled}
								<input
									type="text"
									class="role-input"
									placeholder="รายละเอียดหน้าที่..."
									bind:value={assignmentDraft[member].role_detail}
								/>
							{/if}
						</div>
					{/each}
				</div>
			</section>

			<section class="modal-section">
				<h4 class="section-title">Notes</h4>
				<textarea class="notes-input" placeholder="รายละเอียดเพิ่มเติม..." rows="3" bind:value={detailNotes}></textarea>
			</section>

			<div class="modal-footer">
				<button class="btn-save" onclick={saveDetail} disabled={savingDetail}>
					{savingDetail ? 'Saving...' : 'Save'}
				</button>
				<button class="ghost" onclick={closeDetail}>Cancel</button>
			</div>
		</div>
	</div>
{/if}

<style>
	h1, h2, h3, h4 {
		font-family: 'Space Grotesk', 'Noto Sans Thai', sans-serif;
	}

	.page {
		display: grid;
		gap: 1rem;
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
		color: #1d4ed8;
		font-weight: 700;
	}

	.alert, .notice {
		padding: 0.8rem 0.95rem;
		border-radius: 0.8rem;
		font-size: 0.9rem;
	}

	.notice.success {
		background: rgba(22, 163, 74, 0.12);
		color: #166534;
		border: 1px solid rgba(22, 163, 74, 0.22);
	}

	.notice.error, .alert {
		background: rgba(220, 38, 38, 0.1);
		color: #991b1b;
		border: 1px solid rgba(220, 38, 38, 0.2);
	}

	.loading {
		text-align: center;
		color: #64748b;
		padding: 2rem;
	}

	/* ── Board Layout ── */
	.board {
		display: grid;
		grid-template-columns: repeat(5, minmax(240px, 1fr));
		gap: 0.75rem;
		align-items: start;
		overflow-x: auto;
		padding-bottom: 1rem;
	}

	.column {
		background: var(--col-bg);
		border-radius: 1rem;
		display: grid;
		grid-template-rows: auto 1fr;
		min-height: 200px;
		border: 2px solid transparent;
		transition: border-color 0.15s;
	}

	.column.drop-hover {
		border-color: var(--col-color);
		box-shadow: 0 0 0 3px color-mix(in srgb, var(--col-color) 15%, transparent);
	}

	.col-header {
		display: flex;
		justify-content: space-between;
		align-items: center;
		padding: 0.7rem 0.9rem;
		background: var(--col-header-bg);
		border-radius: 0.85rem 0.85rem 0 0;
		gap: 0.5rem;
	}

	.col-title {
		font-weight: 700;
		font-size: 0.88rem;
		color: var(--col-color);
		font-family: 'Space Grotesk', 'Noto Sans Thai', sans-serif;
	}

	.col-count {
		padding: 0.12rem 0.55rem;
		border-radius: 999px;
		font-size: 0.72rem;
		font-weight: 700;
		background: color-mix(in srgb, var(--col-color) 15%, transparent);
		color: var(--col-color);
	}

	.col-body {
		display: grid;
		gap: 0.6rem;
		padding: 0.75rem;
		align-content: start;
	}

	.col-empty {
		padding: 1rem 0.5rem;
		text-align: center;
		color: #94a3b8;
		font-size: 0.82rem;
		border: 1.5px dashed rgba(148, 163, 184, 0.45);
		border-radius: 0.75rem;
	}

	/* ── Card ── */
	.card {
		background: #fff;
		border-radius: 0.8rem;
		border: 1px solid rgba(15, 23, 42, 0.09);
		border-left: 3px solid #94a3b8;
		display: grid;
		gap: 0;
		cursor: grab;
		transition: box-shadow 0.15s, transform 0.1s;
		overflow: hidden;
	}

	.card:active {
		cursor: grabbing;
		transform: scale(0.98);
	}

	.card:hover {
		box-shadow: 0 4px 12px rgba(15, 23, 42, 0.1);
	}

	.card.stage--planned    { border-left-color: #94a3b8; }
	.card.stage--scripting  { border-left-color: #8b5cf6; }
	.card.stage--shooting   { border-left-color: #f59e0b; }
	.card.stage--editing    { border-left-color: #3b82f6; }
	.card.stage--published  { border-left-color: #16a34a; }

	.card-thumb {
		width: 100%;
		aspect-ratio: 16 / 9;
		object-fit: cover;
		display: block;
		border-bottom: 1px solid rgba(15, 23, 42, 0.06);
	}

	.card-body {
		padding: 0.6rem 0.75rem 0.35rem;
		display: grid;
		gap: 0.2rem;
	}

	.card-meta {
		display: flex;
		flex-wrap: wrap;
		gap: 0.25rem;
		margin-bottom: 0.15rem;
	}

	.badge {
		display: inline-block;
		padding: 0.1rem 0.45rem;
		border-radius: 999px;
		font-size: 0.65rem;
		font-weight: 700;
	}

	.badge.platform {
		background: rgba(180, 83, 9, 0.12);
		color: #92400e;
	}

	.badge.content-type {
		background: rgba(100, 116, 139, 0.12);
		color: #475569;
	}

	.badge.member {
		background: rgba(37, 99, 235, 0.12);
		color: #1d4ed8;
	}

	.card-code {
		margin: 0;
		font-size: 0.72rem;
		font-weight: 700;
		color: #1d4ed8;
		text-transform: uppercase;
		letter-spacing: 0.05em;
	}

	.card-title {
		margin: 0;
		font-size: 0.82rem;
		font-weight: 600;
		color: #0f172a;
		line-height: 1.35;
		display: -webkit-box;
		-webkit-line-clamp: 2;
		-webkit-box-orient: vertical;
		overflow: hidden;
	}

	.card-views, .card-date {
		margin: 0;
		font-size: 0.72rem;
		color: #64748b;
	}

	.card-members {
		display: flex;
		flex-wrap: wrap;
		gap: 0.2rem;
		margin-top: 0.15rem;
	}

	.card-actions {
		padding: 0.35rem 0.75rem 0.55rem;
		display: flex;
		justify-content: flex-end;
	}

	.btn-detail {
		border: 0;
		background: rgba(37, 99, 235, 0.1);
		color: #1d4ed8;
		border-radius: 0.45rem;
		font-size: 0.68rem;
		font-weight: 700;
		padding: 0.2rem 0.5rem;
		cursor: pointer;
	}

	.btn-detail:hover {
		background: rgba(37, 99, 235, 0.18);
	}

	/* ── Modal ── */
	.modal-overlay {
		position: fixed;
		inset: 0;
		z-index: 1000;
		background: rgba(0, 0, 0, 0.45);
		display: grid;
		place-items: center;
		padding: 1rem;
	}

	.modal-box {
		background: #fff;
		border-radius: 1rem;
		padding: 1.5rem;
		width: 100%;
		max-width: 480px;
		max-height: 90vh;
		overflow-y: auto;
		display: grid;
		gap: 1rem;
	}

	.modal-header {
		display: flex;
		justify-content: space-between;
		align-items: flex-start;
		gap: 0.5rem;
	}

	.modal-header h3 { margin: 0; font-size: 1.05rem; }

	.modal-code {
		margin: 0 0 0.2rem;
		font-size: 0.75rem;
		font-weight: 700;
		color: #1d4ed8;
		text-transform: uppercase;
		letter-spacing: 0.06em;
	}

	.ghost {
		border: 1px solid rgba(37, 99, 235, 0.25);
		background: rgba(37, 99, 235, 0.08);
		color: #1d4ed8;
		padding: 0.42rem 0.75rem;
		border-radius: 0.65rem;
		font-weight: 700;
		cursor: pointer;
	}

	.modal-section {
		display: grid;
		gap: 0.65rem;
		padding-bottom: 0.8rem;
		border-bottom: 1px solid rgba(15, 23, 42, 0.07);
	}

	.modal-section:last-of-type { border-bottom: none; padding-bottom: 0; }

	.section-title {
		margin: 0;
		font-size: 0.82rem;
		font-weight: 700;
		text-transform: uppercase;
		letter-spacing: 0.08em;
		color: #64748b;
	}

	.form-row {
		display: grid;
		grid-template-columns: 1fr 1fr;
		gap: 0.6rem;
	}

	.form-field { display: grid; gap: 0.3rem; }

	.form-field label {
		font-size: 0.78rem;
		font-weight: 600;
		color: #475569;
	}

	.form-field input,
	.form-field select,
	.form-field textarea {
		width: 100%;
		box-sizing: border-box;
		font: inherit;
		font-size: 0.85rem;
		padding: 0.42rem 0.6rem;
		border: 1px solid rgba(15, 23, 42, 0.15);
		border-radius: 0.55rem;
		background: #fff;
	}

	.form-field input:focus,
	.form-field select:focus,
	.form-field textarea:focus {
		outline: none;
		border-color: #2563eb;
		box-shadow: 0 0 0 2px rgba(37, 99, 235, 0.15);
	}

	.metrics-grid {
		display: grid;
		grid-template-columns: repeat(3, 1fr);
		gap: 0.6rem;
	}

	.assignment-list { display: grid; gap: 0.65rem; }

	.assignment-row {
		display: grid;
		gap: 0.35rem;
		padding: 0.55rem;
		border: 1px solid rgba(15, 23, 42, 0.09);
		border-radius: 0.7rem;
	}

	.member-toggle {
		display: flex;
		align-items: center;
		gap: 0.45rem;
		cursor: pointer;
	}

	.member-name { font-weight: 700; font-size: 0.9rem; }

	.role-input {
		width: 100%;
		padding: 0.4rem 0.6rem;
		border: 1px solid rgba(15, 23, 42, 0.15);
		border-radius: 0.55rem;
		font-size: 0.85rem;
		font-family: inherit;
		box-sizing: border-box;
	}

	.role-input:focus {
		outline: none;
		border-color: #2563eb;
		box-shadow: 0 0 0 2px rgba(37, 99, 235, 0.15);
	}

	.notes-input {
		width: 100%;
		padding: 0.5rem 0.6rem;
		border: 1px solid rgba(15, 23, 42, 0.15);
		border-radius: 0.55rem;
		font-size: 0.85rem;
		font-family: inherit;
		box-sizing: border-box;
		resize: vertical;
	}

	.notes-input:focus {
		outline: none;
		border-color: #2563eb;
		box-shadow: 0 0 0 2px rgba(37, 99, 235, 0.15);
	}

	.modal-footer {
		display: flex;
		gap: 0.5rem;
		justify-content: flex-end;
	}

	.btn-save {
		border: 0;
		background: #1d4ed8;
		color: #fff;
		padding: 0.5rem 1.2rem;
		border-radius: 0.65rem;
		font-weight: 700;
		font-size: 0.85rem;
		cursor: pointer;
	}

	.btn-save:disabled {
		opacity: 0.6;
		cursor: not-allowed;
	}

	@media (max-width: 1100px) {
		.board {
			grid-template-columns: repeat(3, minmax(220px, 1fr));
		}
	}

	@media (max-width: 700px) {
		.board {
			grid-template-columns: repeat(2, minmax(200px, 1fr));
		}
	}
</style>
