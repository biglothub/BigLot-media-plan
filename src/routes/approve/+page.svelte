<script lang="ts">
	import { onMount } from 'svelte';
	import { hasSupabaseConfig, supabase } from '$lib/supabase';
	import { Modal, Button, Spinner, EmptyState, toast } from '$lib';
	import { TEAM_MEMBERS } from '$lib/team';
	import type { ApprovalSubmissionRow, TeamMember } from '$lib/types';

	// ── Tabs ─────────────────────────────────────────────────────────────────
	type Tab = 'pending' | 'submit';
	let activeTab = $state<Tab>('pending');

	// ── Data ─────────────────────────────────────────────────────────────────
	let items = $state<ApprovalSubmissionRow[]>([]);
	let loading = $state(false);

	// ── Submit form ───────────────────────────────────────────────────────────
	let formTitle = $state('');
	let formSubmittedBy = $state<TeamMember>('อิก');
	let formDriveUrl = $state('');
	let formNotes = $state('');
	let submitting = $state(false);

	// ── Preview modal ─────────────────────────────────────────────────────────
	let previewModalOpen = $state(false);
	let previewModalItem = $state<ApprovalSubmissionRow | null>(null);

	// ── Approve modal ─────────────────────────────────────────────────────────
	let approveModalOpen = $state(false);
	let approveModalItem = $state<ApprovalSubmissionRow | null>(null);
	let approveReviewedBy = $state<TeamMember>('ฟิวส์');
	let approvingItem = $state(false);

	// ── Request changes modal ─────────────────────────────────────────────────
	let changesModalOpen = $state(false);
	let changesModalItem = $state<ApprovalSubmissionRow | null>(null);
	let changesNotes = $state('');
	let changesReviewedBy = $state<TeamMember>('ฟิวส์');
	let submittingChanges = $state(false);

	// ── Detail / Edit modal (history) ─────────────────────────────────────────
	let detailModalOpen = $state(false);
	let detailItem = $state<ApprovalSubmissionRow | null>(null);
	let editTitle = $state('');
	let editDriveUrl = $state('');
	let editNotes = $state('');
	let editStatus = $state<ApprovalSubmissionRow['status']>('pending');
	let editReviewedBy = $state('');
	let editReviewerNotes = $state('');
	let savingDetail = $state(false);
	let deletingDetail = $state(false);

	// ── Helpers ───────────────────────────────────────────────────────────────
	function getDriveEmbedUrl(url: string): string | null {
		const match = url.match(/\/file\/d\/([^/]+)/);
		if (!match) return null;
		return `https://drive.google.com/file/d/${match[1]}/preview`;
	}

	const statusLabel: Record<ApprovalSubmissionRow['status'], string> = {
		pending: 'รออนุมัติ',
		approved: 'อนุมัติแล้ว',
		changes_requested: 'ขอแก้ไข'
	};

	// ── Data loading ──────────────────────────────────────────────────────────
	async function loadItems() {
		if (!supabase) return;
		loading = true;
		const { data, error } = await supabase
			.from('approval_submissions')
			.select('*')
			.order('created_at', { ascending: false });
		loading = false;
		if (error) { toast.error(`โหลดข้อมูลไม่ได้: ${error.message}`); return; }
		items = (data ?? []) as ApprovalSubmissionRow[];
	}

	const pendingItems = $derived(items.filter((i) => i.status === 'pending'));
	const historyItems = $derived(items.filter((i) => i.status !== 'pending'));

	// ── Submit new ────────────────────────────────────────────────────────────
	async function submitForApproval() {
		if (!supabase) return;
		if (!formTitle.trim()) { toast.error('กรุณาใส่ชื่อคอนเทนต์'); return; }
		if (!formDriveUrl.trim()) { toast.error('กรุณาใส่ลิงก์ Google Drive'); return; }
		submitting = true;
		const { error } = await supabase.from('approval_submissions').insert({
			title: formTitle.trim(),
			submitted_by: formSubmittedBy,
			drive_url: formDriveUrl.trim(),
			notes: formNotes.trim() || null,
			status: 'pending'
		});
		submitting = false;
		if (error) { toast.error(`ส่งไม่สำเร็จ: ${error.message}`); return; }
		toast.success('ส่งรออนุมัติแล้ว');
		formTitle = '';
		formDriveUrl = '';
		formNotes = '';
		activeTab = 'pending';
		await loadItems();
	}

	// ── Preview ───────────────────────────────────────────────────────────────
	function openPreviewModal(item: ApprovalSubmissionRow) {
		previewModalItem = item;
		previewModalOpen = true;
	}

	// ── Approve ───────────────────────────────────────────────────────────────
	function openApproveModal(item: ApprovalSubmissionRow) {
		approveModalItem = item;
		approveReviewedBy = 'ฟิวส์';
		approveModalOpen = true;
	}

	async function confirmApprove() {
		if (!supabase || !approveModalItem) return;
		approvingItem = true;
		const { error } = await supabase
			.from('approval_submissions')
			.update({
				status: 'approved',
				reviewed_by: approveReviewedBy,
				reviewed_at: new Date().toISOString()
			})
			.eq('id', approveModalItem.id);
		approvingItem = false;
		if (error) { toast.error(`อนุมัติไม่สำเร็จ: ${error.message}`); return; }
		toast.success('อนุมัติแล้ว');
		approveModalOpen = false;
		approveModalItem = null;
		await loadItems();
	}

	// ── Request changes ───────────────────────────────────────────────────────
	function openChangesModal(item: ApprovalSubmissionRow) {
		changesModalItem = item;
		changesNotes = '';
		changesReviewedBy = 'ฟิวส์';
		changesModalOpen = true;
	}

	async function submitChangesRequest() {
		if (!supabase || !changesModalItem) return;
		if (!changesNotes.trim()) { toast.error('กรุณาใส่ feedback'); return; }
		submittingChanges = true;
		const { error } = await supabase
			.from('approval_submissions')
			.update({
				status: 'changes_requested',
				reviewer_notes: changesNotes.trim(),
				reviewed_by: changesReviewedBy,
				reviewed_at: new Date().toISOString()
			})
			.eq('id', changesModalItem.id);
		submittingChanges = false;
		if (error) { toast.error(`บันทึกไม่สำเร็จ: ${error.message}`); return; }
		toast.success('ส่ง Request Changes แล้ว');
		changesModalOpen = false;
		changesModalItem = null;
		await loadItems();
	}

	// ── Detail / Edit (history) ───────────────────────────────────────────────
	function openDetailModal(item: ApprovalSubmissionRow) {
		detailItem = item;
		editTitle = item.title;
		editDriveUrl = item.drive_url;
		editNotes = item.notes ?? '';
		editStatus = item.status;
		editReviewedBy = item.reviewed_by ?? '';
		editReviewerNotes = item.reviewer_notes ?? '';
		detailModalOpen = true;
	}

	async function saveDetail() {
		if (!supabase || !detailItem) return;
		savingDetail = true;
		const { error } = await supabase
			.from('approval_submissions')
			.update({
				title: editTitle.trim(),
				drive_url: editDriveUrl.trim(),
				notes: editNotes.trim() || null,
				status: editStatus,
				reviewed_by: editReviewedBy.trim() || null,
				reviewer_notes: editReviewerNotes.trim() || null
			})
			.eq('id', detailItem.id);
		savingDetail = false;
		if (error) { toast.error(`บันทึกไม่สำเร็จ: ${error.message}`); return; }
		toast.success('บันทึกแล้ว');
		detailModalOpen = false;
		detailItem = null;
		await loadItems();
	}

	async function deleteItem() {
		if (!supabase || !detailItem) return;
		if (!confirm(`ลบ "${detailItem.title}" ออกจากระบบ?`)) return;
		deletingDetail = true;
		const { error } = await supabase
			.from('approval_submissions')
			.delete()
			.eq('id', detailItem.id);
		deletingDetail = false;
		if (error) { toast.error(`ลบไม่สำเร็จ: ${error.message}`); return; }
		toast.success('ลบแล้ว');
		detailModalOpen = false;
		detailItem = null;
		await loadItems();
	}

	// ── Lifecycle ─────────────────────────────────────────────────────────────
	onMount(() => {
		loadItems();
		const sb = supabase;
		if (!sb) return;
		const channel = sb
			.channel('approve-realtime')
			.on('postgres_changes', { event: '*', schema: 'public', table: 'approval_submissions' }, () => loadItems())
			.subscribe();
		return () => { sb.removeChannel(channel); };
	});
</script>

<main class="page">
	<section class="hero">
		<p class="kicker">BigLot</p>
		<h1>Approve Content</h1>
	</section>

	<!-- Tabs -->
	<div class="tabs">
		<button class="tab-btn" class:active={activeTab === 'pending'} onclick={() => activeTab = 'pending'}>
			รออนุมัติ
			{#if pendingItems.length > 0}
				<span class="badge">{pendingItems.length}</span>
			{/if}
		</button>
		<button class="tab-btn" class:active={activeTab === 'submit'} onclick={() => activeTab = 'submit'}>
			ส่งคอนเทนต์
		</button>
	</div>

	{#if !hasSupabaseConfig}
		<EmptyState title="ไม่ได้เชื่อมต่อ Supabase" />

	<!-- ── Tab: รออนุมัติ ──────────────────────────────────────────────────── -->
	{:else if activeTab === 'pending'}
		{#if loading}
			<div class="spinner-wrap"><Spinner /></div>
		{:else if pendingItems.length === 0}
			<EmptyState title="ไม่มีคอนเทนต์รออนุมัติ" />
		{:else}
			<div class="card-list">
				{#each pendingItems as item (item.id)}
					<div class="submission-card">
						<div class="card-info">
							<div class="card-header">
								<span class="submitted-by">โดย {item.submitted_by}</span>
								<span class="submitted-date">· {new Date(item.created_at).toLocaleDateString('th-TH')}</span>
							</div>
							<h3 class="card-title">{item.title}</h3>
							{#if item.notes}
								<p class="card-notes">{item.notes}</p>
							{/if}
							<div class="drive-actions">
								<button class="drive-preview-btn" onclick={() => openPreviewModal(item)}>
									ดูวิดีโอ ▶
								</button>
								<a href={item.drive_url} target="_blank" rel="noopener noreferrer" class="drive-link">
									เปิดใน Drive →
								</a>
							</div>
						</div>
						<div class="card-actions">
							<Button variant="primary" onclick={() => openApproveModal(item)}>Approve</Button>
							<Button variant="danger" onclick={() => openChangesModal(item)}>Request Changes</Button>
						</div>
					</div>
				{/each}
			</div>
		{/if}

		<!-- History -->
		{#if historyItems.length > 0}
			<section class="history-section">
				<h2 class="history-title">ประวัติ</h2>
				<div class="history-list">
					{#each historyItems as item (item.id)}
						<button class="history-row" onclick={() => openDetailModal(item)}>
							<div class="history-info">
								<span class="history-title-text">{item.title}</span>
								<span class="history-by">โดย {item.submitted_by}</span>
								{#if item.reviewed_by}
									<span class="history-by">· อนุมัติโดย {item.reviewed_by}</span>
								{/if}
							</div>
							<span class="status-badge status-{item.status}">
								{statusLabel[item.status]}
							</span>
							<span class="detail-arrow">›</span>
						</button>
					{/each}
				</div>
			</section>
		{/if}

	<!-- ── Tab: ส่งคอนเทนต์ ────────────────────────────────────────────────── -->
	{:else if activeTab === 'submit'}
		<div class="submit-form">
			<div class="form-field">
				<label for="f-title">ชื่อคอนเทนต์ <span class="required">*</span></label>
				<input id="f-title" type="text" bind:value={formTitle} placeholder="เช่น: รีวิว BigLot สาขาใหม่ EP.5" />
			</div>
			<div class="form-field">
				<label for="f-by">ผู้ส่ง <span class="required">*</span></label>
				<select id="f-by" bind:value={formSubmittedBy}>
					{#each TEAM_MEMBERS as member}
						<option value={member}>{member}</option>
					{/each}
				</select>
			</div>
			<div class="form-field">
				<label for="f-drive">Google Drive URL <span class="required">*</span></label>
				<input id="f-drive" type="url" bind:value={formDriveUrl} placeholder="https://drive.google.com/file/d/..." />
				<p class="field-hint">อัพโหลดวิดีโอขึ้น Google Drive แล้ว copy link มาวาง</p>
			</div>
			<div class="form-field">
				<label for="f-notes">หมายเหตุ (ถ้ามี)</label>
				<textarea id="f-notes" rows="3" bind:value={formNotes} placeholder="เช่น: ยังไม่ใส่ subtitle..."></textarea>
			</div>
			<div class="form-actions">
				<Button variant="primary" onclick={submitForApproval} loading={submitting}>ส่งรออนุมัติ</Button>
			</div>
		</div>
	{/if}
</main>

<!-- Preview Modal -->
<Modal
	bind:open={previewModalOpen}
	title={previewModalItem?.title ?? 'Preview'}
	size="lg"
	onclose={() => { previewModalOpen = false; previewModalItem = null; }}
>
	<div class="preview-modal-body">
		{#if previewModalItem}
			{@const embedUrl = getDriveEmbedUrl(previewModalItem.drive_url)}
			{#if embedUrl}
				<iframe src={embedUrl} title="Video preview" class="drive-iframe" allow="autoplay" allowfullscreen></iframe>
			{:else}
				<p class="preview-error">ไม่สามารถแสดง preview ได้</p>
				<a href={previewModalItem.drive_url} target="_blank" rel="noopener noreferrer" class="drive-link">เปิดใน Google Drive →</a>
			{/if}
			<div class="preview-actions">
				<Button variant="primary" onclick={() => { previewModalOpen = false; openApproveModal(previewModalItem!); }}>Approve</Button>
				<Button variant="danger" onclick={() => { previewModalOpen = false; openChangesModal(previewModalItem!); }}>Request Changes</Button>
			</div>
		{/if}
	</div>
</Modal>

<!-- Approve Modal -->
<Modal
	bind:open={approveModalOpen}
	title="Approve คอนเทนต์"
	size="sm"
	onclose={() => { approveModalOpen = false; approveModalItem = null; }}
>
	<div class="modal-body">
		{#if approveModalItem}
			<p class="modal-content-title">{approveModalItem.title}</p>
		{/if}
		<div class="form-field">
			<label for="approve-by">ผู้อนุมัติ</label>
			<select id="approve-by" bind:value={approveReviewedBy}>
				{#each TEAM_MEMBERS as member}
					<option value={member}>{member}</option>
				{/each}
			</select>
		</div>
	</div>
	{#snippet footer()}
		<Button variant="primary" onclick={confirmApprove} loading={approvingItem}>ยืนยัน Approve</Button>
		<Button variant="ghost" onclick={() => { approveModalOpen = false; approveModalItem = null; }}>ยกเลิก</Button>
	{/snippet}
</Modal>

<!-- Request Changes Modal -->
<Modal
	bind:open={changesModalOpen}
	title="Request Changes"
	size="sm"
	onclose={() => { changesModalOpen = false; changesModalItem = null; }}
>
	<div class="modal-body">
		{#if changesModalItem}
			<p class="modal-content-title">{changesModalItem.title}</p>
		{/if}
		<div class="form-field">
			<label for="changes-notes">Feedback <span class="required">*</span></label>
			<textarea id="changes-notes" rows="4" bind:value={changesNotes} placeholder="บอกทีมว่าต้องแก้ไขอะไร..."></textarea>
		</div>
		<div class="form-field">
			<label for="changes-by">ผู้รีวิว</label>
			<select id="changes-by" bind:value={changesReviewedBy}>
				{#each TEAM_MEMBERS as member}
					<option value={member}>{member}</option>
				{/each}
			</select>
		</div>
	</div>
	{#snippet footer()}
		<Button variant="danger" onclick={submitChangesRequest} loading={submittingChanges}>ส่ง Request Changes</Button>
		<Button variant="ghost" onclick={() => { changesModalOpen = false; changesModalItem = null; }}>ยกเลิก</Button>
	{/snippet}
</Modal>

<!-- Detail / Edit Modal (history) -->
<Modal
	bind:open={detailModalOpen}
	title="รายละเอียด"
	size="md"
	onclose={() => { detailModalOpen = false; detailItem = null; }}
>
	<div class="modal-body">
		{#if detailItem}
			<!-- Preview link -->
			<div class="detail-preview-row">
				<button class="drive-preview-btn" onclick={() => { detailModalOpen = false; openPreviewModal(detailItem!); }}>
					ดูวิดีโอ ▶
				</button>
				<a href={detailItem.drive_url} target="_blank" rel="noopener noreferrer" class="drive-link">เปิดใน Drive →</a>
			</div>

			<!-- Editable fields -->
			<div class="form-field">
				<label for="d-title">ชื่อคอนเทนต์</label>
				<input id="d-title" type="text" bind:value={editTitle} />
			</div>
			<div class="form-field">
				<label for="d-drive">Google Drive URL</label>
				<input id="d-drive" type="url" bind:value={editDriveUrl} />
			</div>
			<div class="form-field">
				<label for="d-notes">หมายเหตุ</label>
				<textarea id="d-notes" rows="2" bind:value={editNotes}></textarea>
			</div>
			<div class="form-field">
				<label for="d-status">สถานะ</label>
				<select id="d-status" bind:value={editStatus}>
					<option value="pending">รออนุมัติ</option>
					<option value="approved">อนุมัติแล้ว</option>
					<option value="changes_requested">ขอแก้ไข</option>
				</select>
			</div>
			<div class="form-field">
				<label for="d-reviewed-by">ผู้รีวิว</label>
				<input id="d-reviewed-by" type="text" bind:value={editReviewedBy} placeholder="ชื่อผู้รีวิว" />
			</div>
			{#if editStatus === 'changes_requested'}
				<div class="form-field">
					<label for="d-reviewer-notes">Feedback</label>
					<textarea id="d-reviewer-notes" rows="3" bind:value={editReviewerNotes}></textarea>
				</div>
			{/if}
		{/if}
	</div>
	{#snippet footer()}
		<Button variant="primary" onclick={saveDetail} loading={savingDetail}>บันทึก</Button>
		<Button variant="danger" onclick={deleteItem} loading={deletingDetail}>ลบ</Button>
		<Button variant="ghost" onclick={() => { detailModalOpen = false; detailItem = null; }}>ยกเลิก</Button>
	{/snippet}
</Modal>

<style>
	h1, h2, h3 { font-family: var(--font-heading); }

	.page { display: grid; gap: var(--space-5); }

	.hero { display: grid; gap: var(--space-1); }
	.hero {
		padding: var(--space-4);
		border: 1px solid var(--color-border);
		border-radius: var(--radius-xl);
		background: var(--color-bg-elevated);
	}
	.kicker {
		margin: 0;
		font-size: var(--text-xs);
		font-weight: var(--fw-bold);
		letter-spacing: 0.12em;
		text-transform: uppercase;
		color: var(--color-slate-500);
	}
	h1 { margin: 0; font-size: var(--text-2xl); }

	/* ── Tabs ── */
	.tabs { display: flex; gap: var(--space-1); border-bottom: 1px solid var(--color-border); }
	.tab-btn {
		display: flex;
		align-items: center;
		gap: var(--space-2);
		padding: var(--space-2) var(--space-4);
		border: none;
		border-bottom: 2px solid transparent;
		background: none;
		font-size: var(--text-sm);
		font-weight: var(--fw-semibold);
		color: var(--color-slate-500);
		cursor: pointer;
		margin-bottom: -1px;
		transition: color var(--transition-fast), border-color var(--transition-fast);
	}
	.tab-btn.active { color: var(--color-primary); border-bottom-color: var(--color-primary); }
	.badge {
		display: inline-flex;
		align-items: center;
		justify-content: center;
		min-width: 1.25rem;
		height: 1.25rem;
		padding: 0 0.35rem;
		background: var(--color-primary);
		color: #fff;
		border-radius: var(--radius-full);
		font-size: 0.7rem;
		font-weight: var(--fw-bold);
	}

	/* ── Pending cards ── */
	.spinner-wrap { display: flex; justify-content: center; padding: var(--space-8) 0; }
	.card-list { display: grid; gap: var(--space-4); }

	.submission-card {
		display: flex;
		align-items: flex-start;
		gap: var(--space-5);
		padding: var(--space-5);
		background: var(--color-bg-elevated);
		border: 1px solid var(--color-border);
		border-radius: var(--radius-lg);
	}
	.card-info { flex: 1; min-width: 0; display: grid; gap: var(--space-2); }
	.card-header { display: flex; align-items: center; gap: var(--space-2); flex-wrap: wrap; }
	.submitted-by { font-size: var(--text-sm); font-weight: var(--fw-semibold); color: var(--color-slate-700); }
	.submitted-date { font-size: var(--text-sm); color: var(--color-slate-400); }
	.card-title { margin: 0; font-size: var(--text-lg); line-height: var(--leading-tight); }
	.card-notes { margin: 0; font-size: var(--text-sm); color: var(--color-slate-500); }
	.drive-actions { display: flex; align-items: center; gap: var(--space-3); flex-wrap: wrap; }
	.card-actions { display: flex; flex-direction: column; gap: var(--space-2); flex-shrink: 0; }

	/* ── History ── */
	.history-section { margin-top: var(--space-4); }
	.history-title { margin: 0 0 var(--space-3); font-size: var(--text-md); color: var(--color-slate-500); }
	.history-list { display: grid; gap: var(--space-2); }

	.history-row {
		display: flex;
		align-items: center;
		gap: var(--space-3);
		padding: var(--space-3) var(--space-4);
		background: var(--color-bg-elevated);
		border: 1px solid var(--color-border);
		border-radius: var(--radius-md);
		width: 100%;
		text-align: left;
		cursor: pointer;
		transition: background var(--transition-fast);
	}
	.history-row:hover { background: var(--color-slate-50); }
	.history-info { flex: 1; display: flex; align-items: center; gap: var(--space-2); flex-wrap: wrap; min-width: 0; }
	.history-title-text { font-size: var(--text-sm); font-weight: var(--fw-semibold); }
	.history-by { font-size: var(--text-sm); color: var(--color-slate-400); }
	.detail-arrow { font-size: 1.2rem; color: var(--color-slate-400); flex-shrink: 0; }

	.status-badge {
		padding: 0.15rem 0.65rem;
		border-radius: var(--radius-full);
		font-size: var(--text-xs);
		font-weight: var(--fw-bold);
		flex-shrink: 0;
	}
	.status-approved { background: rgba(22, 163, 74, 0.12); color: var(--color-green-700); }
	.status-changes_requested { background: rgba(249, 115, 22, 0.14); color: var(--color-orange-600); }
	.status-pending { background: var(--color-slate-100); color: var(--color-slate-600); }

	/* ── Drive buttons ── */
	.drive-preview-btn {
		padding: 0.3rem 0.8rem;
		background: var(--color-primary-bg);
		border: 1px solid var(--color-primary-border);
		border-radius: var(--radius-md);
		font-size: var(--text-sm);
		font-weight: var(--fw-semibold);
		color: var(--color-primary);
		cursor: pointer;
	}
	.drive-preview-btn:hover { background: var(--color-primary); color: #fff; }
	.drive-link { display: inline-block; font-size: var(--text-sm); font-weight: var(--fw-semibold); color: var(--color-primary); }

	/* ── Preview modal ── */
	.preview-modal-body { display: grid; gap: var(--space-4); }
	.drive-iframe { width: 100%; aspect-ratio: 16 / 9; border: none; border-radius: var(--radius-md); background: #000; }
	.preview-error { margin: 0; font-size: var(--text-sm); color: var(--color-slate-500); }
	.preview-actions { display: flex; gap: var(--space-2); padding-top: var(--space-2); border-top: 1px solid var(--color-border); }

	/* ── Submit form ── */
	.submit-form { display: grid; gap: var(--space-4); max-width: 560px; }

	/* ── Detail modal ── */
	.detail-preview-row { display: flex; align-items: center; gap: var(--space-3); padding-bottom: var(--space-3); border-bottom: 1px solid var(--color-border); }

	/* ── Shared form ── */
	.modal-body { display: grid; gap: var(--space-3); }
	.modal-content-title { margin: 0; font-weight: var(--fw-semibold); font-size: var(--text-md); }
	.form-field { display: grid; gap: var(--space-1); }
	.form-field label { font-size: var(--text-sm); font-weight: var(--fw-semibold); }
	.required { color: #ef4444; }
	.field-hint { margin: 0; font-size: var(--text-xs); color: var(--color-slate-400); }
	.form-field input,
	.form-field select,
	.form-field textarea {
		width: 100%;
		padding: var(--space-2) var(--space-3);
		border: 1px solid var(--color-border-strong);
		border-radius: var(--radius-md);
		font-size: var(--text-sm);
		font-family: inherit;
		background: var(--color-bg-elevated);
	}
	.form-field textarea { resize: vertical; }
	.form-field input:focus,
	.form-field select:focus,
	.form-field textarea:focus {
		outline: 0;
		border-color: rgba(15, 23, 42, 0.34);
		box-shadow: 0 0 0 2px rgba(15, 23, 42, 0.08);
	}
	.form-actions { display: flex; }

	@media (max-width: 600px) {
		.submission-card { flex-direction: column; }
		.card-actions { flex-direction: row; width: 100%; }
	}
</style>
