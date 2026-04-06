<script lang="ts">
	import { marked } from 'marked';
	import { Button, Modal, toast } from '$lib';
	import { supabase, hasSupabaseConfig } from '$lib/supabase';
	import { TEAM_MEMBERS } from '$lib/team';
	import type {
		ApprovalStatus,
		BacklogContentCategory,
		BacklogContentType,
		IdeaBacklogRow,
		ProductionCalendarRow,
		ProductionStage,
		SupportedPlatform,
		TeamMember,
	} from '$lib/types';
	import {
		backlogCode,
		CONTENT_CATEGORY_OPTIONS,
		CONTENT_TYPE_OPTIONS,
		contentTypeLabel,
		fromCategorySelectValue,
		platformLabel,
		platformOrder,
		PRODUCTION_STAGES,
		stageLabel,
		toCategorySelectValue,
		toIsoLocalDate,
	} from '$lib/media-plan';

	interface Props {
		open?: boolean;
		idea: IdeaBacklogRow;
		calEntry: ProductionCalendarRow | undefined;
		onclose: () => void;
		onsaved: () => void;
	}

	let { open = $bindable(true), idea, calEntry, onclose, onsaved }: Props = $props();

	type EditForm = {
		url: string;
		platform: SupportedPlatform;
		content_type: BacklogContentType;
		content_category: BacklogContentCategory | '';
		title: string;
		description: string;
		author_name: string;
		thumbnail_url: string;
		published_at: string;
		notes: string;
		shoot_date: string;
		publish_deadline: string;
		calendar_status: ProductionStage;
		approval_status: ApprovalStatus;
		revision_count: number;
		calendar_notes: string;
	};

	function createEmptyAssignmentDraft(): Record<TeamMember, { enabled: boolean; role_detail: string }> {
		return Object.fromEntries(
			TEAM_MEMBERS.map((m) => [m, { enabled: false, role_detail: '' }]),
		) as Record<TeamMember, { enabled: boolean; role_detail: string }>;
	}

	let editForm = $state<EditForm>({
		url: idea.url ?? '',
		platform: idea.platform,
		content_type: idea.content_type ?? 'video',
		content_category: toCategorySelectValue(idea.content_category),
		title: idea.title ?? '',
		description: idea.description ?? '',
		author_name: idea.author_name ?? '',
		thumbnail_url: idea.thumbnail_url ?? '',
		published_at: idea.published_at ? new Date(idea.published_at).toISOString().slice(0, 16) : '',
		notes: idea.notes ?? '',
		shoot_date: calEntry?.shoot_date ?? '',
		publish_deadline: calEntry?.publish_deadline ?? '',
		calendar_status: (calEntry?.status as ProductionStage) ?? 'planned',
		approval_status: (calEntry?.approval_status as ApprovalStatus) ?? 'draft',
		revision_count: calEntry?.revision_count ?? 0,
		calendar_notes: calEntry?.notes ?? '',
	});

	let assignmentDraft = $state<Record<TeamMember, { enabled: boolean; role_detail: string }>>(createEmptyAssignmentDraft());

	$effect.pre(() => {
		for (const assignment of calEntry?.calendar_assignments ?? []) {
			assignmentDraft[assignment.member_name] = {
				enabled: true,
				role_detail: assignment.role_detail ?? '',
			};
		}
	});

	let notesViewMode = $state<'edit' | 'preview'>('edit');
	const notesRendered = $derived(editForm.notes ? (marked.parse(editForm.notes) as string) : '');
	let savingEdit = $state(false);
	let showPlanExpanded = $state(false);

	// AI Content Plan
	let generatingPlan = $state(false);
	let planContext = $state('');
	let planError = $state('');

	async function saveEdit() {
		if (!supabase) return;
		savingEdit = true;
		const rawUrl = editForm.url.trim();
		if (rawUrl) {
			try {
				const parsed = new URL(rawUrl);
				if (!['http:', 'https:'].includes(parsed.protocol)) {
					toast.error('ลิงก์ต้องเป็น http/https เท่านั้น');
					savingEdit = false;
					return;
				}
			} catch {
				toast.error('ลิงก์ไม่ถูกต้อง');
				savingEdit = false;
				return;
			}
		}

		const payload = {
			url: rawUrl || null,
			platform: editForm.platform,
			content_type: editForm.content_type,
			content_category: fromCategorySelectValue(editForm.content_category),
			title: editForm.title.trim() || null,
			description: editForm.description.trim() || null,
			author_name: editForm.author_name.trim() || null,
			thumbnail_url: editForm.thumbnail_url.trim() || null,
			published_at: editForm.published_at ? new Date(editForm.published_at).toISOString() : null,
			notes: editForm.notes.trim() || null,
		};

		const { error } = await supabase.from('idea_backlog').update(payload).eq('id', idea.id);
		if (error) {
			savingEdit = false;
			toast.error(`แก้ไขไม่สำเร็จ: ${error.message}`);
			return;
		}

		const hasAssignments = TEAM_MEMBERS.some((m) => assignmentDraft[m].enabled);
		const shouldPersistCalendar =
			!!editForm.shoot_date ||
			!!editForm.publish_deadline ||
			!!editForm.calendar_notes.trim() ||
			hasAssignments ||
			editForm.calendar_status !== 'planned' ||
			editForm.approval_status !== 'draft' ||
			editForm.revision_count > 0 ||
			!!calEntry;

		let calendarId = calEntry?.id ?? null;
		if (shouldPersistCalendar) {
			const { data: calendarRow, error: calError } = await supabase
				.from('production_calendar')
				.upsert(
					{
						backlog_id: idea.id,
						shoot_date: editForm.shoot_date || calEntry?.shoot_date || toIsoLocalDate(new Date()),
						publish_deadline: editForm.publish_deadline || null,
						status: editForm.calendar_status,
						approval_status: editForm.approval_status,
						revision_count: editForm.revision_count,
						notes: editForm.calendar_notes.trim() || null,
					},
					{ onConflict: 'backlog_id' },
				)
				.select('id')
				.single();
			if (calError) {
				savingEdit = false;
				toast.error(`แก้ไข backlog สำเร็จ แต่บันทึก calendar ไม่ได้: ${calError.message}`);
				return;
			}
			calendarId = calendarRow.id;
		}

		if (calendarId) {
			const { error: deleteErr } = await supabase
				.from('calendar_assignments')
				.delete()
				.eq('calendar_id', calendarId);
			if (deleteErr) {
				savingEdit = false;
				toast.error(`บันทึก backlog สำเร็จ แต่ล้าง team assignments ไม่ได้: ${deleteErr.message}`);
				return;
			}

			const assignments = TEAM_MEMBERS.filter((m) => assignmentDraft[m].enabled).map((m) => ({
				calendar_id: calendarId,
				member_name: m,
				role_detail: assignmentDraft[m].role_detail.trim(),
			}));

			if (assignments.length > 0) {
				const { error: assignErr } = await supabase.from('calendar_assignments').insert(assignments);
				if (assignErr) {
					savingEdit = false;
					toast.error(`บันทึก backlog สำเร็จ แต่บันทึก team assignments ไม่ได้: ${assignErr.message}`);
					return;
				}
			}
		}

		savingEdit = false;
		toast.success('แก้ไข backlog เรียบร้อยแล้ว');
		onclose();
		onsaved();
	}

	async function generateContentPlan() {
		if (editForm.notes.trim()) {
			const confirmed = window.confirm('Notes มีข้อมูลอยู่แล้ว ต้องการแทนที่ด้วย Content Plan ใหม่ไหม?');
			if (!confirmed) return;
		}
		generatingPlan = true;
		planError = '';
		try {
			const res = await fetch('/api/openclaw/ai/content-plan', {
				method: 'POST',
				headers: { 'Content-Type': 'application/json' },
				body: JSON.stringify({
					title: editForm.title || idea.title,
					description: editForm.description || idea.description,
					platform: editForm.platform,
					content_category: fromCategorySelectValue(editForm.content_category),
					context: planContext.trim() || undefined,
				}),
			});
			const data = await res.json();
			if (res.ok && data.plan) {
				editForm.notes = data.plan;
				notesViewMode = 'preview';
				if (supabase) {
					await supabase
						.from('idea_backlog')
						.update({ notes: data.plan.trim() || null })
						.eq('id', idea.id);
				}
			} else {
				planError = data.error ?? 'Generate plan ไม่สำเร็จ';
			}
		} catch {
			planError = 'เชื่อมต่อ AI ไม่ได้';
		}
		generatingPlan = false;
	}
</script>

<Modal bind:open size="lg" {onclose}>
	{#snippet header()}
		<div class="modal-title-header">
			<div class="modal-title-block">
				<p class="modal-code">{backlogCode(idea)}</p>
				<h3>{idea.title ?? 'Untitled idea'}</h3>
			</div>
			<button class="modal-close" type="button" onclick={onclose} aria-label="Close dialog">✕</button>
		</div>
	{/snippet}

	<div class="edit-row-inline">
		<div class="edit-row">
			<label for="edit-platform">Platform</label>
			<select id="edit-platform" bind:value={editForm.platform}>
				{#each platformOrder as p}
					<option value={p}>{platformLabel[p]}</option>
				{/each}
			</select>
		</div>
		<div class="edit-row">
			<label for="edit-content-type">Content Type</label>
			<select id="edit-content-type" bind:value={editForm.content_type}>
				{#each CONTENT_TYPE_OPTIONS as option}
					<option value={option}>{contentTypeLabel[option]}</option>
				{/each}
			</select>
		</div>
	</div>

	<div class="edit-row">
		<label for="edit-content-category">Category</label>
		<select id="edit-content-category" bind:value={editForm.content_category}>
			{#each CONTENT_CATEGORY_OPTIONS as option}
				<option value={option.value}>{option.label}</option>
			{/each}
		</select>
	</div>

	<div class="edit-row">
		<label for="edit-title">Title</label>
		<input id="edit-title" bind:value={editForm.title} placeholder="ชื่อคอนเทนต์" />
	</div>

	<div class="edit-row">
		<label for="edit-url">Content Link</label>
		<input id="edit-url" bind:value={editForm.url} placeholder="https://..." />
	</div>

	<div class="edit-row-inline">
		<div class="edit-row">
			<label for="edit-shoot-date">Shoot Date</label>
			<input id="edit-shoot-date" type="date" bind:value={editForm.shoot_date} />
		</div>
		<div class="edit-row">
			<label for="edit-publish-deadline">Publish Deadline</label>
			<input id="edit-publish-deadline" type="date" bind:value={editForm.publish_deadline} />
		</div>
	</div>

	<div class="edit-row-inline">
		<div class="edit-row">
			<label for="edit-calendar-status">Production Stage</label>
			<select id="edit-calendar-status" bind:value={editForm.calendar_status}>
				{#each PRODUCTION_STAGES as stage}
					<option value={stage}>{stageLabel[stage]}</option>
				{/each}
			</select>
		</div>
		<div class="edit-row">
			<label for="edit-approval-status">Approval Status</label>
			<select id="edit-approval-status" bind:value={editForm.approval_status}>
				<option value="draft">Draft</option>
				<option value="pending_review">รออนุมัติ</option>
				<option value="approved">อนุมัติแล้ว</option>
				<option value="rejected">Rejected</option>
			</select>
		</div>
	</div>

	<div class="edit-row-inline">
		<div class="edit-row">
			<label for="edit-revision-count">Revision Count</label>
			<input id="edit-revision-count" type="number" min="0" max="99" bind:value={editForm.revision_count} />
		</div>
		<div class="edit-row">
			<label for="edit-published">Published At</label>
			<input id="edit-published" type="datetime-local" bind:value={editForm.published_at} />
		</div>
	</div>

	<div class="edit-row">
		<label for="edit-author">Creator / Account</label>
		<input id="edit-author" bind:value={editForm.author_name} placeholder="@username" />
	</div>

	<div class="edit-row">
		<label for="edit-thumbnail">Thumbnail URL</label>
		<input id="edit-thumbnail" bind:value={editForm.thumbnail_url} placeholder="https://..." />
	</div>

	<div class="edit-row">
		<label for="edit-description">Description</label>
		<textarea id="edit-description" bind:value={editForm.description} rows={3} placeholder="คำอธิบาย (ถ้ามี)"></textarea>
	</div>

	<div class="edit-row">
		<div class="notes-label-row">
			<p class="field-group-label">Team Assignments</p>
			<small class="section-helper">ข้อมูลจาก calendar ของไอเดียนี้</small>
		</div>
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
	</div>

	<div class="edit-row">
		<label for="edit-calendar-notes">Calendar Notes</label>
		<textarea
			id="edit-calendar-notes"
			bind:value={editForm.calendar_notes}
			rows={3}
			placeholder="รายละเอียดฝั่ง production / shoot / deadline"
		></textarea>
	</div>

	<div class="edit-row">
		<div class="notes-label-row">
			<label for="edit-notes">Idea Notes</label>
			<div class="notes-actions">
				{#if editForm.notes}
					<button
						class="notes-toggle-btn {notesViewMode === 'preview' ? 'active' : ''}"
						onclick={() => { notesViewMode = notesViewMode === 'preview' ? 'edit' : 'preview'; }}
					>{notesViewMode === 'preview' ? '✏️ แก้ไข' : '👁 ดูผล'}</button>
				{/if}
				<button class="ai-plan-btn" onclick={generateContentPlan} disabled={generatingPlan}>
					{generatingPlan ? '✦ กำลังวางแผน...' : '✦ Generate Plan'}
				</button>
			</div>
		</div>
		<input
			class="plan-context-input"
			bind:value={planContext}
			placeholder="Context เพิ่มเติม เช่น 'เน้น hook แบบ Skit' หรือ 'ถ่ายใน office' (ไม่บังคับ)"
			disabled={generatingPlan}
		/>
		{#if generatingPlan}
			<div class="progress-track" style="margin-bottom: 0.4rem;">
				<div class="progress-bar"></div>
			</div>
		{/if}
		{#if planError}
			<p class="plan-error">{planError}</p>
		{/if}
		{#if notesViewMode === 'preview' && editForm.notes}
			<div class="notes-preview-wrap">
				<div
					class="notes-preview"
					role="button"
					tabindex="0"
					onclick={() => { notesViewMode = 'edit'; }}
					onkeydown={(event) => {
						if (event.key === 'Enter' || event.key === ' ') {
							event.preventDefault();
							notesViewMode = 'edit';
						}
					}}
				>
					{@html notesRendered}
				</div>
				<button class="notes-expand-btn" type="button" onclick={() => { showPlanExpanded = true; }} title="ขยายเพื่ออ่าน">⤢</button>
			</div>
		{:else}
			<textarea id="edit-notes" bind:value={editForm.notes} rows={6} placeholder="กด Generate Plan เพื่อให้ AI วางแผนการถ่าย หรือกรอกเอง..."></textarea>
		{/if}
	</div>

	{#snippet footer()}
		<Button variant="primary" onclick={saveEdit} loading={savingEdit} disabled={!hasSupabaseConfig}>
			{savingEdit ? 'Saving...' : 'Save Changes'}
		</Button>
		<Button variant="ghost" onclick={onclose}>Cancel</Button>
	{/snippet}
</Modal>

<Modal bind:open={showPlanExpanded} title="✦ Content Plan" size="lg" onclose={() => { showPlanExpanded = false; }}>
	<div class="plan-expand-body notes-preview">
		{@html notesRendered}
	</div>
</Modal>

<style>
	label {
		font-size: 0.86rem;
		color: var(--color-slate-600);
	}

	input, select, textarea {
		width: 100%;
		box-sizing: border-box;
		font: inherit;
		padding: 0.72rem 0.85rem;
		border-radius: 0.7rem;
		border: 1px solid var(--color-border-strong);
		background: var(--color-bg-elevated);
	}

	#edit-notes {
		max-height: 420px;
		overflow-y: auto;
		resize: vertical;
	}

	.modal-title-block {
		display: grid;
		gap: 0.15rem;
		min-width: 0;
	}

	.modal-title-header {
		display: flex;
		justify-content: space-between;
		align-items: flex-start;
		gap: 0.75rem;
		width: 100%;
	}

	.modal-code {
		margin: 0;
		font-size: 0.72rem;
		font-weight: 700;
		color: #b45309;
		text-transform: uppercase;
		letter-spacing: 0.05em;
	}

	.modal-title-block h3 {
		margin: 0;
		font-size: 1.05rem;
		font-family: var(--font-heading);
		white-space: nowrap;
		overflow: hidden;
		text-overflow: ellipsis;
	}

	.modal-close {
		border: 0;
		background: transparent;
		font-size: 1rem;
		color: var(--color-slate-500);
		cursor: pointer;
		padding: 0.15rem 0.3rem;
		border-radius: 0.4rem;
	}

	.modal-close:hover {
		background: rgba(15, 23, 42, 0.08);
	}

	.edit-row {
		display: grid;
		gap: 0.4rem;
		min-height: 0;
	}

	.field-group-label {
		margin: 0;
		font-size: 0.86rem;
		color: var(--color-slate-600);
		font-weight: 600;
	}

	.edit-row-inline {
		display: grid;
		grid-template-columns: repeat(2, minmax(0, 1fr));
		gap: 0.75rem;
	}

	.section-helper {
		font-size: 0.74rem;
		color: var(--color-slate-500);
	}

	.assignment-list {
		display: grid;
		gap: 0.65rem;
	}

	.assignment-row {
		display: grid;
		gap: 0.35rem;
		padding: 0.55rem;
		border: 1px solid var(--color-border);
		border-radius: 0.7rem;
	}

	.member-toggle {
		display: flex;
		align-items: center;
		gap: 0.45rem;
		cursor: pointer;
	}

	.member-name {
		font-weight: 700;
		font-size: 0.9rem;
	}

	.role-input {
		width: 100%;
		padding: 0.4rem 0.6rem;
		border: 1px solid var(--color-border-strong);
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

	.notes-label-row {
		display: flex;
		align-items: center;
		justify-content: space-between;
		gap: 0.5rem;
	}

	.notes-actions {
		display: flex;
		gap: 0.4rem;
		align-items: center;
	}

	.notes-toggle-btn {
		background: transparent;
		border: 1px solid #e2e8f0;
		color: var(--color-slate-500);
		padding: 0.28rem 0.65rem;
		border-radius: 0.45rem;
		font-size: 0.75rem;
		font-weight: 600;
		cursor: pointer;
		transition: background var(--transition-fast);
	}

	.notes-toggle-btn:hover,
	.notes-toggle-btn.active {
		background: var(--color-slate-100);
		border-color: #cbd5e1;
		color: var(--color-slate-700);
	}

	.notes-preview-wrap {
		position: relative;
	}

	.notes-expand-btn {
		position: absolute;
		top: 0.5rem;
		right: 0.5rem;
		background: var(--color-bg-elevated);
		border: 1px solid #e2e8f0;
		border-radius: 0.4rem;
		width: 1.75rem;
		height: 1.75rem;
		font-size: 1rem;
		line-height: 1;
		cursor: pointer;
		color: var(--color-slate-500);
		display: flex;
		align-items: center;
		justify-content: center;
		transition: background var(--transition-fast), color 0.15s;
		z-index: 2;
	}

	.notes-expand-btn:hover {
		background: var(--color-slate-100);
		color: var(--color-slate-900);
	}

	.plan-expand-body {
		flex: 1;
		overflow-y: auto;
		max-height: none;
		border: none;
		border-radius: 0;
		padding: 1.25rem 1.5rem;
		font-size: 0.95rem;
		cursor: default;
	}

	.notes-preview {
		border: 1px solid #e2e8f0;
		border-radius: 0.6rem;
		padding: 1rem 1.1rem;
		background: var(--color-bg-elevated);
		cursor: text;
		font-size: 0.875rem;
		line-height: 1.7;
		color: #1e293b;
		overflow-y: auto;
		max-height: 420px;
	}

	.notes-preview :global(h1),
	.notes-preview :global(h2),
	.notes-preview :global(h3) {
		margin: 1rem 0 0.4rem;
		font-family: var(--font-heading);
		font-size: 0.95rem;
		color: var(--color-slate-900);
	}
	.notes-preview :global(h1) { font-size: 1rem; border-bottom: 1px solid #e2e8f0; padding-bottom: 0.3rem; }
	.notes-preview :global(p) { margin: 0.3rem 0; }
	.notes-preview :global(ul), .notes-preview :global(ol) { padding-left: 1.4rem; margin: 0.3rem 0; }
	.notes-preview :global(li) { margin: 0.15rem 0; }
	.notes-preview :global(strong) { font-weight: 700; color: var(--color-slate-900); }
	.notes-preview :global(blockquote) {
		border-left: 3px solid #6366f1;
		margin: 0.5rem 0;
		padding: 0.3rem 0.75rem;
		background: rgba(99, 102, 241, 0.05);
		border-radius: 0 0.4rem 0.4rem 0;
		color: var(--color-slate-700);
		font-style: italic;
	}
	.notes-preview :global(table) { width: 100%; border-collapse: collapse; font-size: 0.82rem; margin: 0.5rem 0; }
	.notes-preview :global(th) { background: var(--color-slate-100); padding: 0.4rem 0.6rem; text-align: left; font-weight: 600; border: 1px solid #e2e8f0; }
	.notes-preview :global(td) { padding: 0.35rem 0.6rem; border: 1px solid #e2e8f0; vertical-align: top; }
	.notes-preview :global(hr) { border: none; border-top: 1px solid #e2e8f0; margin: 0.75rem 0; }
	.notes-preview :global(code) { background: var(--color-slate-100); padding: 0.1rem 0.35rem; border-radius: 0.3rem; font-size: 0.8rem; }

	.plan-error {
		margin: 0.25rem 0 0;
		padding: 0.5rem 0.75rem;
		background: #fef2f2;
		border: 1px solid #fca5a5;
		border-radius: 0.45rem;
		font-size: 0.8rem;
		color: #b91c1c;
	}

	.ai-plan-btn {
		background: linear-gradient(135deg, #6366f1, #8b5cf6);
		color: #fff;
		border: none;
		padding: 0.3rem 0.75rem;
		border-radius: 0.45rem;
		font-size: 0.78rem;
		font-weight: 600;
		cursor: pointer;
		white-space: nowrap;
		transition: opacity 0.15s;
	}

	.ai-plan-btn:hover:not(:disabled) { opacity: 0.85; }
	.ai-plan-btn:disabled { opacity: 0.55; cursor: not-allowed; }

	.plan-context-input {
		width: 100%;
		padding: 0.45rem 0.7rem;
		border: 1px solid #e2e8f0;
		border-radius: 0.5rem;
		font-size: 0.8rem;
		color: var(--color-slate-600);
		background: var(--color-bg);
		box-sizing: border-box;
	}

	.plan-context-input:focus {
		outline: none;
		border-color: #a5b4fc;
		background: var(--color-bg-elevated);
	}

	.plan-context-input:disabled { opacity: 0.5; }

	.progress-track {
		width: 100%;
		height: 6px;
		background: #e2e8f0;
		border-radius: var(--radius-full);
		overflow: hidden;
	}

	.progress-bar {
		height: 100%;
		border-radius: var(--radius-full);
		background: linear-gradient(90deg, #6366f1, #8b5cf6, #6366f1);
		background-size: 200% 100%;
		animation: progress-slide 1.4s ease-in-out infinite;
		width: 50%;
	}

	@keyframes progress-slide {
		0% { background-position: 200% 0; transform: translateX(-100%); }
		100% { background-position: -200% 0; transform: translateX(300%); }
	}

	@media (max-width: 900px) {
		.edit-row-inline { grid-template-columns: 1fr; }
	}



</style>
