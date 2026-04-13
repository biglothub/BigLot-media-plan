<script lang="ts">
	import { onMount, tick } from 'svelte';
	import { hasSupabaseConfig, supabase } from '$lib/supabase';
	import { TEAM_MEMBERS } from '$lib/team';
	import { KanbanCard, Modal, Button, Spinner, toast } from '$lib';
	import type {
		IdeaBacklogRow,
		ProductionCalendarRow,
		TeamMember,
		ProductionStage,
		ApprovalStatus,
		SupportedPlatform,
		BacklogContentType,
		BacklogContentCategory
	} from '$lib/types';
	import {
		PRODUCTION_STAGES,
		stageLabel,
		platformLabel,
		formatCount,
		formatCalendarDate,
		contentTypeLabel,
		contentCategoryLabel,
		getYouTubeEmbedUrl,
		getFacebookEmbedUrl,
		getTikTokEmbedUrl,
		getInstagramEmbedUrl,
		isYouTubeShort
	} from '$lib/media-plan';

	// ── Data ────────────────────────────────────────────────────────────────
	let calendarItems = $state<ProductionCalendarRow[]>([]);
	let loading = $state(false);
	let isTouchUi = $state(false);
	let mobileStage = $state<ProductionStage>('planned');

	// ── Drag ────────────────────────────────────────────────────────────────
	let draggingItemId = $state<string | null>(null);
	let dragHoverStage = $state<ProductionStage | null>(null);

	// ── Preview panel ────────────────────────────────────────────────────────
	let previewItem = $state<ProductionCalendarRow | null>(null);
	let previewPanelTop = $state(16);
	let previewPanelLeft = $state(16);
	let previewAnchorEl = $state<HTMLElement | null>(null);
	let previewPanelEl = $state<HTMLElement | null>(null);

	const previewUrl = $derived(previewItem?.idea_backlog?.url ?? null);
	const previewIsPortrait = $derived(
		!!previewUrl && (isYouTubeShort(previewUrl) || previewUrl.includes('tiktok.com') || previewUrl.includes('instagram.com'))
	);
	const previewYouTubeEmbed  = $derived(previewUrl ? getYouTubeEmbedUrl(previewUrl)   : null);
	const previewTikTokEmbed   = $derived(previewUrl ? getTikTokEmbedUrl(previewUrl)    : null);
	const previewInstagramEmbed = $derived(previewUrl ? getInstagramEmbedUrl(previewUrl) : null);
	const previewFacebookEmbed = $derived(previewUrl ? getFacebookEmbedUrl(previewUrl)  : null);

	// ── Detail modal ─────────────────────────────────────────────────────────
	let detailModalOpen = $state(false);
	let detailItem = $state<ProductionCalendarRow | null>(null);
	let detailNotes = $state('');
	let detailShootDate = $state('');
	let detailStatus = $state<ProductionStage>('planned');
	let detailRevisionCount = $state(0);
	let detailApprovalStatus = $state<ApprovalStatus>('draft');
	let detailPlatform = $state<SupportedPlatform>('youtube');
	let detailContentType = $state<BacklogContentType>('video');
	let detailContentCategory = $state<BacklogContentCategory | null>(null);
	let detailTitle = $state('');
	let detailUrl = $state('');
	let detailAuthorName = $state('');
	let detailDescription = $state('');
	let detailThumbnailUrl = $state('');
	let detailPublishedAt = $state('');
	let detailPublishDeadline = $state('');
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

	// ── Derived ──────────────────────────────────────────────────────────────
	const STAGE_META: Record<ProductionStage, { color: string; bg: string; headerBg: string }> = {
		planned:   { color: '#475569', bg: '#ffffff', headerBg: '#ffffff' },
		scripting: { color: '#6d28d9', bg: '#ffffff', headerBg: '#ffffff' },
		shooting:  { color: '#b45309', bg: '#ffffff', headerBg: '#ffffff' },
		editing:   { color: '#1d4ed8', bg: '#ffffff', headerBg: '#ffffff' },
		review:    { color: '#c2410c', bg: '#ffffff', headerBg: '#ffffff' },
		published: { color: '#166534', bg: '#ffffff', headerBg: '#ffffff' }
	};

	const approvalStatusLabel: Record<ApprovalStatus, string> = {
		draft: 'Draft',
		pending_review: 'รออนุมัติ',
		approved: 'อนุมัติแล้ว',
		rejected: 'Rejected'
	};

	const approvalStatusColor: Record<ApprovalStatus, string> = {
		draft: '#94a3b8',
		pending_review: '#c2410c',
		approved: '#16a34a',
		rejected: '#b91c1c'
	};

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

	const visibleStages = $derived.by(() => isTouchUi ? [mobileStage] : PRODUCTION_STAGES);

	// ── Helpers ──────────────────────────────────────────────────────────────
	function backlogCode(idea: Pick<IdeaBacklogRow, 'id' | 'idea_code'>): string {
		const code = idea.idea_code?.trim();
		return code ? code : `BL-${idea.id.slice(0, 8).toUpperCase()}`;
	}

	function handleQuickStageChange(calendarId: string, event: Event) {
		const target = event.currentTarget as HTMLSelectElement | null;
		if (!target) return;
		void moveCard(calendarId, target.value as ProductionStage);
	}

	// ── Data loading ─────────────────────────────────────────────────────────
	async function loadCalendar() {
		if (!supabase) return;
		loading = true;
		const { data, error } = await supabase
			.from('production_calendar')
			.select(
				'id, backlog_id, carousel_project_id, handoff_source, shoot_date, publish_deadline, status, revision_count, approval_status, submitted_at, notes, created_at, idea_backlog(*), calendar_assignments(*)'
			)
			.order('shoot_date', { ascending: true })
			.order('created_at', { ascending: true });
		loading = false;
		if (error) { toast.error(`โหลดข้อมูลไม่ได้: ${error.message}`); return; }
		calendarItems = ((data ?? []).map((item) => {
			const row = item as Record<string, unknown>;
			return {
				...row,
				idea_backlog: Array.isArray(row.idea_backlog) ? (row.idea_backlog[0] ?? null) : (row.idea_backlog ?? null),
				calendar_assignments: Array.isArray(row.calendar_assignments) ? row.calendar_assignments : []
			};
		})) as ProductionCalendarRow[];
	}

	// ── Drag & drop ──────────────────────────────────────────────────────────
	async function moveCard(calendarId: string, newStage: ProductionStage) {
		if (!supabase) return;
		calendarItems = calendarItems.map((item) => item.id === calendarId ? { ...item, status: newStage } : item);
		const { error } = await supabase.from('production_calendar').update({ status: newStage }).eq('id', calendarId);
		if (error) { toast.error(`อัปเดตสถานะไม่สำเร็จ: ${error.message}`); await loadCalendar(); }
	}

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
		const item = calendarItems.find((c) => c.id === itemId);
		if (!item || item.status === stage) return;
		await moveCard(itemId, stage);
	}

	// ── Preview ───────────────────────────────────────────────────────────────
	function positionPreviewNearAnchor(anchorEl: HTMLElement) {
		const margin = 12;
		const gap = 12;
		const rect = anchorEl.getBoundingClientRect();
		const panelWidth = previewPanelEl?.offsetWidth ?? 420;
		const panelHeight = previewPanelEl?.offsetHeight ?? 560;

		let left = rect.right + gap;
		if (left + panelWidth + margin > window.innerWidth) {
			left = rect.left - panelWidth - gap;
		}
		if (left < margin) {
			left = Math.max(margin, window.innerWidth - panelWidth - margin);
		}

		let top = rect.top;
		const maxTop = Math.max(margin, window.innerHeight - panelHeight - margin);
		if (top > maxTop) top = maxTop;
		if (top < margin) top = margin;

		previewPanelTop = top;
		previewPanelLeft = left;
	}

	async function openPreview(item: ProductionCalendarRow, event: MouseEvent) {
		previewItem = item;
		if (isTouchUi) return;
		const anchorEl = event.currentTarget instanceof HTMLElement ? event.currentTarget : null;
		if (!anchorEl) return;
		previewAnchorEl = anchorEl;
		await tick();
		positionPreviewNearAnchor(anchorEl);
	}

	function closePreview() {
		previewItem = null;
		previewAnchorEl = null;
	}

	function getCarouselStudioHref(item: ProductionCalendarRow | null | undefined): string | null {
		return item?.carousel_project_id ? `/carousel/${item.carousel_project_id}` : null;
	}

	// ── Detail modal ──────────────────────────────────────────────────────────
	function openDetail(item: ProductionCalendarRow) {
		detailItem = item;
		detailModalOpen = true;
		detailNotes = item.notes ?? '';
		detailShootDate = item.shoot_date ?? '';
		detailStatus = (item.status as ProductionStage) ?? 'planned';
		detailRevisionCount = item.revision_count ?? 0;
		detailApprovalStatus = (item.approval_status as ApprovalStatus) ?? 'draft';
		const bl = item.idea_backlog;
		detailPlatform = (bl?.platform as SupportedPlatform) ?? 'youtube';
		detailContentType = (bl?.content_type as BacklogContentType) ?? 'video';
		detailContentCategory = (bl?.content_category as BacklogContentCategory | null) ?? null;
		detailTitle = bl?.title ?? '';
		detailUrl = bl?.url ?? '';
		detailAuthorName = bl?.author_name ?? '';
		detailDescription = bl?.description ?? '';
		detailThumbnailUrl = bl?.thumbnail_url ?? '';
		detailPublishedAt = bl?.published_at ? new Date(bl.published_at).toISOString().slice(0, 16) : '';
		detailPublishDeadline = item.publish_deadline ?? '';
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

	function closeDetail() { detailModalOpen = false; detailItem = null; }

	async function saveDetail() {
		if (!supabase || !detailItem) return;
		savingDetail = true;
		const calendarId = detailItem.id;
		const backlogId = detailItem.backlog_id;

		const { error: blErr } = await supabase.from('idea_backlog').update({
			platform: detailPlatform,
			content_type: detailContentType,
			content_category: detailContentCategory,
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
		}).eq('id', backlogId);
		if (blErr) { toast.error(`บันทึก content info ไม่สำเร็จ: ${blErr.message}`); savingDetail = false; return; }

		const { error: calErr } = await supabase.from('production_calendar').update({
			shoot_date: detailShootDate,
			publish_deadline: detailPublishDeadline || null,
			status: detailStatus,
			revision_count: detailRevisionCount,
			approval_status: detailApprovalStatus,
			submitted_at: detailApprovalStatus === 'pending_review' && !detailItem.submitted_at
				? new Date().toISOString()
				: detailItem.submitted_at,
			notes: detailNotes.trim() || null
		}).eq('id', calendarId);
		if (calErr) { toast.error(`บันทึก calendar ไม่สำเร็จ: ${calErr.message}`); savingDetail = false; return; }

		await supabase.from('calendar_assignments').delete().eq('calendar_id', calendarId);
		const toInsert = TEAM_MEMBERS.filter((m) => assignmentDraft[m].enabled).map((m) => ({
			calendar_id: calendarId,
			member_name: m,
			role_detail: assignmentDraft[m].role_detail
		}));
		if (toInsert.length > 0) {
			const { error: aErr } = await supabase.from('calendar_assignments').insert(toInsert);
			if (aErr) { toast.error(`บันทึกหน้าที่ไม่สำเร็จ: ${aErr.message}`); savingDetail = false; return; }
		}

		savingDetail = false;
		toast.success('บันทึกเรียบร้อยแล้ว');
		closeDetail();
		await loadCalendar();
	}

	// ── Lifecycle ─────────────────────────────────────────────────────────────
	onMount(() => {
		loadCalendar();
		const sb = supabase;
		const touchQuery = window.matchMedia('(max-width: 900px), (pointer: coarse)');
		const syncTouchUi = () => {
			isTouchUi = touchQuery.matches;
			if (isTouchUi) {
				previewAnchorEl = null;
				return;
			}
			if (previewItem && previewAnchorEl) positionPreviewNearAnchor(previewAnchorEl);
		};
		const handleResize = () => {
			if (previewItem && previewAnchorEl) positionPreviewNearAnchor(previewAnchorEl);
		};
		syncTouchUi();
		window.addEventListener('resize', handleResize);
		touchQuery.addEventListener('change', syncTouchUi);
		if (!sb) {
			return () => {
				window.removeEventListener('resize', handleResize);
				touchQuery.removeEventListener('change', syncTouchUi);
			};
		}
		const channel = sb
			.channel('kanban-realtime')
			.on('postgres_changes', { event: '*', schema: 'public', table: 'production_calendar' }, () => loadCalendar())
			.on('postgres_changes', { event: '*', schema: 'public', table: 'calendar_assignments' }, () => loadCalendar())
			.subscribe();
		return () => {
			sb.removeChannel(channel);
			window.removeEventListener('resize', handleResize);
			touchQuery.removeEventListener('change', syncTouchUi);
		};
	});
</script>

<main class="page">
	<section class="hero">
		<p class="kicker">Production</p>
		<h1>Kanban Board</h1>
		<p>{isTouchUi ? 'เลือก stage แล้วอัปเดตสถานะจากการ์ดโดยตรง' : 'ลากการ์ดข้ามคอลัมน์เพื่ออัปเดตสถานะการผลิตคอนเทนต์'}</p>
	</section>

	{#if !hasSupabaseConfig}
		<p class="alert">ตั้งค่า env ก่อนใช้งาน: <code>PUBLIC_SUPABASE_URL</code> และ <code>PUBLIC_SUPABASE_ANON_KEY</code></p>
	{/if}

	<!-- Board + Preview side-by-side -->
	<div class="kanban-root">

		<!-- Board -->
		<div class="board-wrap">
			{#if loading}
				<div class="loading"><Spinner size="lg" label="กำลังโหลด Kanban..." /></div>
			{:else}
				{#if isTouchUi}
					<div class="mobile-stage-strip" aria-label="Select stage">
						{#each PRODUCTION_STAGES as stage}
							<button
								type="button"
								class:active={mobileStage === stage}
								style={`--stage-color:${STAGE_META[stage].color};--stage-bg:${STAGE_META[stage].headerBg};`}
								onclick={() => {
									mobileStage = stage;
									closePreview();
								}}
							>
								<span>{stageLabel[stage]}</span>
								<strong>{(boardColumns.get(stage) ?? []).length}</strong>
							</button>
						{/each}
					</div>
				{/if}
				<div class="board {isTouchUi ? 'board--mobile' : ''}">
					{#each visibleStages as stage}
						{@const meta = STAGE_META[stage]}
						{@const cards = boardColumns.get(stage) ?? []}
						<div
							class="column {dragHoverStage === stage ? 'drop-hover' : ''}"
							style="--col-bg:{meta.bg};--col-header-bg:{meta.headerBg};--col-color:{meta.color}"
							role="region"
							aria-label={stageLabel[stage]}
							ondragover={(e) => !isTouchUi && handleDragOver(e, stage)}
							ondragleave={() => !isTouchUi && (dragHoverStage = null)}
							ondrop={(e) => !isTouchUi && handleDrop(e, stage)}
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
								<KanbanCard
									{item}
									code={backlogCode(item.idea_backlog ?? { id: item.id, idea_code: '' })}
									isActive={previewItem?.id === item.id}
									{isTouchUi}
									draggable={!isTouchUi}
									{approvalStatusColor}
									{approvalStatusLabel}
									{formatCount}
									formatDate={formatCalendarDate}
									onclick={(e) => openPreview(item, e)}
									ondragstart={(e) => { if (!isTouchUi) handleDragStart(e, item.id); }}
									ondragend={() => { draggingItemId = null; dragHoverStage = null; }}
									ondetail={() => openDetail(item)}
									onstagechange={(id, s) => void moveCard(id, s as ProductionStage)}
								/>
							{/each}
							</div>
						</div>
					{/each}
				</div>
			{/if}
		</div>

		<!-- Preview panel — appears when a card is clicked -->
		{#if previewItem}
			{@const bl = previewItem.idea_backlog}
			<aside
				bind:this={previewPanelEl}
				class="preview-panel {previewIsPortrait ? 'portrait' : 'landscape'} {isTouchUi ? 'preview-panel--mobile' : ''}"
				style={isTouchUi ? '' : `top: ${previewPanelTop}px; left: ${previewPanelLeft}px; --preview-top: ${previewPanelTop}px;`}
			>
				<div class="preview-header">
					<div class="preview-title">
						<p class="preview-code">{bl ? backlogCode(bl) : 'Unknown'}</p>
						<h3>{bl?.title ?? 'Untitled'}</h3>
					</div>
					<div class="preview-actions">
						{#if previewUrl}
							<a class="btn-ghost" href={previewUrl} target="_blank" rel="noopener noreferrer">เปิด</a>
						{/if}
						{#if getCarouselStudioHref(previewItem)}
							<a class="btn-ghost" href={getCarouselStudioHref(previewItem) ?? '#'}>Carousel</a>
						{/if}
						<button class="btn-ghost" onclick={closePreview}>✕</button>
					</div>
				</div>

				<div class="preview-embed">
					{#if previewYouTubeEmbed}
						<iframe src={previewYouTubeEmbed} title={bl?.title ?? 'YouTube'} frameborder="0"
							allow="accelerometer; autoplay; clipboard-write; encrypted-media; gyroscope; picture-in-picture"
							allowfullscreen></iframe>
					{:else if previewTikTokEmbed}
						<iframe src={previewTikTokEmbed} title={bl?.title ?? 'TikTok'} frameborder="0"
							allow="autoplay" allowfullscreen></iframe>
					{:else if previewInstagramEmbed}
						<iframe src={previewInstagramEmbed} title={bl?.title ?? 'Instagram'} frameborder="0"
							scrolling="no" allowtransparency></iframe>
					{:else if previewFacebookEmbed}
						<iframe src={previewFacebookEmbed} title={bl?.title ?? 'Facebook'} frameborder="0"
							allow="autoplay; clipboard-write; encrypted-media; picture-in-picture; web-share"
							allowfullscreen></iframe>
					{:else if bl?.thumbnail_url}
						<img src={bl.thumbnail_url} alt={bl?.title ?? 'thumbnail'} />
					{:else}
						<div class="preview-empty">ไม่สามารถ embed ได้</div>
					{/if}
				</div>
			</aside>
		{/if}

	</div>
</main>

<!-- Detail modal -->
<Modal bind:open={detailModalOpen} title={detailTitle || 'Untitled'} size="md" onclose={closeDetail}>

			<section class="modal-section">
				<h4 class="section-title">Content Info</h4>
				<div class="form-row">
					<div class="form-field">
						<label for="k-platform">Platform</label>
						<select id="k-platform" bind:value={detailPlatform}>
							<option value="youtube">YouTube</option>
							<option value="facebook">Facebook</option>
							<option value="instagram">Instagram</option>
							<option value="tiktok">TikTok</option>
						</select>
					</div>
					<div class="form-field">
						<label for="k-content-type">Content Type</label>
						<select id="k-content-type" bind:value={detailContentType}>
							<option value="video">Video</option>
							<option value="post">Post</option>
							<option value="image">Image</option>
							<option value="live">Live</option>
						</select>
					</div>
					<div class="form-field">
						<label for="k-content-category">Content Category</label>
						<select id="k-content-category" bind:value={detailContentCategory}>
							<option value={null}>— ไม่ระบุ —</option>
							<option value="pin">Pin</option>
							<option value="hero">Hero</option>
							<option value="help">Help</option>
							<option value="hub">Hub</option>
						</select>
					</div>
				</div>
				<div class="form-field">
					<label for="k-title">Title</label>
					<input type="text" id="k-title" bind:value={detailTitle} placeholder="ชื่อคอนเทนต์..." />
				</div>
				<div class="form-field">
					<label for="k-url">Content Link</label>
					<input id="k-url" type="url" bind:value={detailUrl} placeholder="https://..." />
				</div>
				<div class="form-row">
					<div class="form-field">
						<label for="k-author">Creator / Account</label>
						<input id="k-author" type="text" bind:value={detailAuthorName} placeholder="ชื่อครีเอเตอร์..." />
					</div>
					<div class="form-field">
						<label for="k-thumbnail">Thumbnail URL</label>
						<input id="k-thumbnail" type="url" bind:value={detailThumbnailUrl} placeholder="https://..." />
					</div>
				</div>
			</section>

			<section class="modal-section">
				<h4 class="section-title">Schedule & Status</h4>
				<div class="form-row">
					<div class="form-field">
						<label for="k-shoot-date">Shoot Date</label>
						<input id="k-shoot-date" type="date" bind:value={detailShootDate} />
					</div>
					<div class="form-field">
						<label for="k-deadline">Publish Deadline</label>
						<input id="k-deadline" type="date" bind:value={detailPublishDeadline} />
					</div>
				</div>
				<div class="form-row">
					<div class="form-field">
						<label for="k-published-at">Published At</label>
						<input id="k-published-at" type="datetime-local" bind:value={detailPublishedAt} />
					</div>
				</div>
				<div class="form-row">
					<div class="form-field">
						<label for="k-status">Production Stage</label>
						<select id="k-status" bind:value={detailStatus}>
							{#each PRODUCTION_STAGES as stage}
								<option value={stage}>{stageLabel[stage]}</option>
							{/each}
						</select>
					</div>
					<div class="form-field">
						<label for="k-approval">Approval Status</label>
						<select id="k-approval" bind:value={detailApprovalStatus}>
							<option value="draft">Draft</option>
							<option value="pending_review">รออนุมัติ</option>
							<option value="approved">อนุมัติแล้ว</option>
							<option value="rejected">Rejected</option>
						</select>
					</div>
				</div>
				<div class="form-field">
					<label for="k-revision">Revision Count {#if detailRevisionCount >= 2}<span class="revision-warn">เกินเกณฑ์ KPI (≤2)</span>{/if}</label>
					<input id="k-revision" type="number" min="0" max="99" bind:value={detailRevisionCount} />
				</div>
			</section>

			<section class="modal-section">
				<h4 class="section-title">Metrics</h4>
				<div class="metrics-grid">
					<div class="form-field"><label for="k-views">Views</label><input id="k-views" type="number" min="0" bind:value={detailViews} placeholder="0" /></div>
					<div class="form-field"><label for="k-likes">Likes</label><input id="k-likes" type="number" min="0" bind:value={detailLikes} placeholder="0" /></div>
					<div class="form-field"><label for="k-comments">Comments</label><input id="k-comments" type="number" min="0" bind:value={detailComments} placeholder="0" /></div>
					<div class="form-field"><label for="k-shares">Shares</label><input id="k-shares" type="number" min="0" bind:value={detailShares} placeholder="0" /></div>
					<div class="form-field"><label for="k-saves">Saves</label><input id="k-saves" type="number" min="0" bind:value={detailSaves} placeholder="0" /></div>
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
								<input type="text" class="role-input" placeholder="รายละเอียดหน้าที่..." bind:value={assignmentDraft[member].role_detail} />
							{/if}
						</div>
					{/each}
				</div>
			</section>

			<section class="modal-section">
				<h4 class="section-title">Notes</h4>
				<textarea class="notes-input" placeholder="รายละเอียดเพิ่มเติม..." rows="3" bind:value={detailNotes}></textarea>
			</section>

	{#snippet footer()}
		<Button variant="primary" onclick={saveDetail} loading={savingDetail}>Save</Button>
		<Button variant="ghost" onclick={closeDetail}>Cancel</Button>
	{/snippet}
</Modal>

<style>
	h1, h3, h4 { font-family: var(--font-heading); }

	.page { display: grid; gap: 1rem; }

	.hero { text-align: center; padding: 1.2rem 0 0.2rem; }
	.hero h1 { margin: 0.4rem 0; font-size: clamp(1.8rem, 4.4vw, 2.7rem); }
	.hero p { margin: 0; color: var(--color-slate-600); }

	.kicker {
		margin: 0; font-size: 0.78rem; text-transform: uppercase;
		letter-spacing: 0.16em; color: var(--color-primary); font-weight: 700;
	}

	.alert { padding: 0.8rem 0.95rem; border-radius: 0.8rem; font-size: 0.9rem; }

	.loading { text-align: center; color: var(--color-slate-500); padding: 2rem; }

	/* ── Layout ── */
	.kanban-root {
		display: flex;
		gap: 1rem;
		align-items: start;
	}

	.board-wrap {
		flex: 1;
		min-width: 0;
		overflow-x: auto;
	}

	.mobile-stage-strip {
		display: none;
	}

	.board {
		display: grid;
		grid-template-columns: repeat(6, minmax(200px, 1fr));
		gap: 0.75rem;
		align-items: start;
		padding-bottom: 1rem;
		min-width: 1220px;
	}

	/* ── Column ── */
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
		display: flex; justify-content: space-between; align-items: center;
		padding: 0.7rem 0.9rem; background: var(--col-header-bg);
		border-radius: 0.85rem 0.85rem 0 0; gap: 0.5rem;
		border-bottom: 1px solid var(--color-border);
	}
	.col-title { font-weight: 700; font-size: 0.88rem; color: var(--col-color); font-family: var(--font-heading); }
	.col-count {
		padding: 0.12rem 0.55rem; border-radius: var(--radius-full); font-size: 0.72rem; font-weight: 700;
		background: color-mix(in srgb, var(--col-color) 15%, transparent); color: var(--col-color);
	}
	.col-body { display: grid; gap: 0.6rem; padding: 0.75rem; align-content: start; }
	.col-empty {
		padding: 1rem 0.5rem; text-align: center; color: var(--color-slate-400); font-size: 0.82rem;
		border: 1.5px dashed rgba(148,163,184,0.45); border-radius: 0.75rem;
	}



	/* ── Preview Panel ── */
	.preview-panel {
		position: fixed;
		z-index: 200;
		max-height: calc(100vh - var(--preview-top, 1rem) - 1rem);
		overflow-y: auto;
		background: var(--color-bg-elevated);
		border-radius: 1rem;
		border: 1px solid var(--color-border-medium);
		padding: 1.1rem;
		display: grid;
		gap: 0.85rem;
		align-content: start;
	}
	.preview-panel.landscape { width: 420px; }
	.preview-panel.portrait  { width: 340px; }

	.preview-header { display: flex; justify-content: space-between; align-items: flex-start; gap: 0.6rem; }
	.preview-title h3 { margin: 0; font-size: 0.95rem; line-height: 1.3; }
	.preview-code { margin: 0 0 0.2rem; font-size: 0.72rem; font-weight: 700; color: var(--color-primary); text-transform: uppercase; letter-spacing: 0.05em; }
	.preview-actions { display: flex; gap: 0.35rem; flex-shrink: 0; }

	.preview-embed { border-radius: 0.6rem; overflow: hidden; background: #000; }
	.preview-embed iframe { display: block; width: 100%; border: none; }
	.preview-panel.landscape .preview-embed iframe { height: 236px; }
	.preview-panel.portrait  .preview-embed iframe { height: 540px; }
	.preview-embed img { width: 100%; display: block; }
	.preview-empty { padding: 2.5rem; text-align: center; color: var(--color-slate-400); font-size: 0.88rem; }

	/* ── Shared button ── */
	.btn-ghost {
		border: 1px solid rgba(37,99,235,0.25); background: rgba(37,99,235,0.08);
		color: var(--color-primary); padding: 0.38rem 0.7rem; border-radius: 0.6rem;
		font-weight: 700; font-size: 0.8rem; cursor: pointer; text-decoration: none;
	}
	.btn-ghost:hover { background: rgba(37,99,235,0.14); }

	.modal-section { display: grid; gap: 0.65rem; padding-bottom: 0.8rem; border-bottom: 1px solid var(--color-border); }
	.modal-section:last-of-type { border-bottom: none; padding-bottom: 0; }
	.section-title { margin: 0; font-size: 0.82rem; font-weight: 700; text-transform: uppercase; letter-spacing: 0.08em; color: var(--color-slate-500); }

	.form-row { display: grid; grid-template-columns: 1fr 1fr; gap: 0.6rem; }
	.form-field { display: grid; gap: 0.3rem; }
	.form-field label { font-size: 0.78rem; font-weight: 600; color: var(--color-slate-600); }
	.form-field input, .form-field select {
		width: 100%; box-sizing: border-box; font: inherit; font-size: 0.85rem;
		padding: 0.42rem 0.6rem; border: 1px solid var(--color-border-strong); border-radius: 0.55rem; background: var(--color-bg-elevated);
	}
	.form-field input:focus, .form-field select:focus { outline: none; border-color: var(--color-blue-600); box-shadow: 0 0 0 2px rgba(37,99,235,0.15); }

	.metrics-grid { display: grid; grid-template-columns: repeat(3, 1fr); gap: 0.6rem; }

	.assignment-list { display: grid; gap: 0.65rem; }
	.assignment-row { display: grid; gap: 0.35rem; padding: 0.55rem; border: 1px solid var(--color-border); border-radius: 0.7rem; }
	.member-toggle { display: flex; align-items: center; gap: 0.45rem; cursor: pointer; }
	.member-name { font-weight: 700; font-size: 0.9rem; }
	.role-input { width: 100%; padding: 0.4rem 0.6rem; border: 1px solid var(--color-border-strong); border-radius: 0.55rem; font-size: 0.85rem; font-family: inherit; box-sizing: border-box; }
	.role-input:focus { outline: none; border-color: var(--color-blue-600); box-shadow: 0 0 0 2px rgba(37,99,235,0.15); }

	.notes-input { width: 100%; padding: 0.5rem 0.6rem; border: 1px solid var(--color-border-strong); border-radius: 0.55rem; font-size: 0.85rem; font-family: inherit; box-sizing: border-box; resize: vertical; }
	.notes-input:focus { outline: none; border-color: var(--color-blue-600); box-shadow: 0 0 0 2px rgba(37,99,235,0.15); }



	.revision-warn { color: #b91c1c; font-size: 0.72rem; font-weight: 700; margin-left: 0.3rem; }

	@media (max-width: 1300px) { .board { grid-template-columns: repeat(3, minmax(200px, 1fr)); } }
	@media (max-width: 900px) {
		.mobile-stage-strip {
			display: grid;
			grid-template-columns: repeat(3, minmax(0, 1fr));
			gap: 0.45rem;
			margin-bottom: 0.8rem;
		}

		.mobile-stage-strip button {
			border: 1px solid var(--color-border);
			background: var(--color-bg-elevated);
			border-radius: 0.85rem;
			padding: 0.6rem 0.7rem;
			display: grid;
			gap: 0.15rem;
			text-align: left;
			color: var(--color-slate-700);
			font: inherit;
			cursor: pointer;
		}

		.mobile-stage-strip button.active {
			border-color: color-mix(in srgb, var(--stage-color) 30%, transparent);
			background: color-mix(in srgb, var(--stage-bg) 72%, white);
			box-shadow: inset 0 0 0 1px color-mix(in srgb, var(--stage-color) 18%, transparent);
		}

		.mobile-stage-strip span {
			font-size: 0.72rem;
			font-weight: 700;
		}

		.mobile-stage-strip strong {
			font-size: 1rem;
			font-family: var(--font-heading);
		}

		.board--mobile {
			grid-template-columns: 1fr;
			min-width: 0;
		}

		.column {
			min-height: 0;
		}


		.preview-panel--mobile {
			position: fixed;
			inset: auto 0 0;
			width: auto;
			max-height: min(82vh, 44rem);
			border-radius: 1.2rem 1.2rem 0 0;
			padding-bottom: calc(1.1rem + env(safe-area-inset-bottom, 0px));
			box-shadow: var(--shadow-xl);
		}

		.preview-panel--mobile.landscape,
		.preview-panel--mobile.portrait {
			width: auto;
		}

		.preview-panel--mobile .preview-embed iframe {
			height: min(48vh, 22rem);
		}

		.form-row,
		.metrics-grid {
			grid-template-columns: 1fr;
		}
	}

	@media (max-width: 700px) {
		.mobile-stage-strip {
			grid-template-columns: repeat(2, minmax(0, 1fr));
		}
	}
</style>
