<script lang="ts">
	import { goto } from '$app/navigation';
	import { Button, PageHeader, Spinner, toast } from '$lib';
	import type { VideoCarouselProject, VideoCarouselTemplateType } from '$lib/video-carousel';
	import {
		VIDEO_CAROUSEL_STATUS_LABELS,
		VIDEO_CAROUSEL_TEMPLATE_DESCRIPTIONS,
		VIDEO_CAROUSEL_TEMPLATE_LABELS,
		FONT_PRESET_LABELS,
		videoCarouselTotalDuration
	} from '$lib/video-carousel';
	import type { CarouselFontPreset } from '$lib/types';

	// ── Setup form state ──────────────────────────────────────────────────────
	let topic = $state('');
	let templateType = $state<VideoCarouselTemplateType>('quiz');
	let clipCount = $state(1);
	let durationSeconds = $state(10);
	let fontPreset = $state<CarouselFontPreset>('biglot');
	let generating = $state(false);

	// ── Project list ──────────────────────────────────────────────────────────
	let projects = $state<VideoCarouselProject[]>([]);
	let loadingProjects = $state(false);
	let deletingId = $state<string | null>(null);

	const fontOptions: Array<{ value: CarouselFontPreset; label: string }> = [
		{ value: 'biglot', label: FONT_PRESET_LABELS.biglot },
		{ value: 'apple_clean', label: FONT_PRESET_LABELS.apple_clean },
		{ value: 'mitr_friendly', label: FONT_PRESET_LABELS.mitr_friendly },
		{ value: 'ibm_plex_thai', label: FONT_PRESET_LABELS.ibm_plex_thai },
		{ value: 'editorial_serif', label: FONT_PRESET_LABELS.editorial_serif }
	];

	const templateOptions: Array<{ value: VideoCarouselTemplateType; label: string; description: string }> = [
		{
			value: 'quiz',
			label: VIDEO_CAROUSEL_TEMPLATE_LABELS.quiz,
			description: VIDEO_CAROUSEL_TEMPLATE_DESCRIPTIONS.quiz
		},
		{
			value: 'quote',
			label: VIDEO_CAROUSEL_TEMPLATE_LABELS.quote,
			description: VIDEO_CAROUSEL_TEMPLATE_DESCRIPTIONS.quote
		}
	];

	async function loadProjects() {
		loadingProjects = true;
		try {
			const res = await fetch('/api/video-carousel/projects');
			if (!res.ok) throw new Error('Failed to load');
			projects = await res.json();
		} catch {
			toast.error('โหลดโปรเจกต์ไม่สำเร็จ');
		} finally {
			loadingProjects = false;
		}
	}

	async function handleGenerate() {
		if (!topic.trim()) {
			toast.error('กรุณาใส่หัวข้อก่อน');
			return;
		}
		generating = true;
		try {
			const res = await fetch('/api/video-carousel/generate', {
				method: 'POST',
				headers: { 'Content-Type': 'application/json' },
				body: JSON.stringify({
					topic: topic.trim(),
					template_type: templateType,
					clip_count: clipCount,
					duration_seconds: durationSeconds,
					font_preset: fontPreset
				})
			});
			const data = await res.json();
			if (!res.ok) throw new Error(data.error ?? 'Generate failed');
			toast.success('สร้าง video script สำเร็จ!');
			await goto(`/video-carousel/${data.project.id}`);
		} catch (err) {
			toast.error(err instanceof Error ? err.message : 'เกิดข้อผิดพลาด');
		} finally {
			generating = false;
		}
	}

	async function handleDelete(id: string, title: string) {
		if (!confirm(`ลบ "${title}" ?`)) return;
		deletingId = id;
		try {
			const res = await fetch(`/api/video-carousel/projects/${id}`, { method: 'DELETE' });
			if (!res.ok) throw new Error('Delete failed');
			projects = projects.filter((p) => p.id !== id);
			toast.success('ลบสำเร็จ');
		} catch {
			toast.error('ลบไม่สำเร็จ');
		} finally {
			deletingId = null;
		}
	}

	$effect(() => {
		loadProjects();
	});
</script>

<PageHeader title="Video Carousel" subtitle="สร้าง Reels/Shorts จาก Pexels + AI" />

<!-- ── Setup card ─────────────────────────────────────────────────────────── -->
<section class="setup-card">
	<h2 class="section-title">สร้างใหม่</h2>

	<div class="template-picker" role="radiogroup" aria-label="Video template">
		{#each templateOptions as template}
			<button
				type="button"
				class="template-card"
				class:active={templateType === template.value}
				aria-pressed={templateType === template.value}
				onclick={() => (templateType = template.value)}
				disabled={generating}
			>
				<span class="template-preview template-{template.value}" aria-hidden="true">
					<span class="preview-line main"></span>
					<span class="preview-line accent"></span>
					{#if template.value === 'quiz'}
						<span class="preview-option"></span>
						<span class="preview-option short"></span>
					{:else}
						<span class="preview-quote"></span>
					{/if}
				</span>
				<span class="template-copy">
					<span class="template-name">{template.label}</span>
					<span class="template-description">{template.description}</span>
				</span>
			</button>
		{/each}
	</div>

	<div class="form-grid">
		<div class="form-field full-width">
			<label for="vc-topic" class="field-label">หัวข้อ / Topic</label>
			<input
				id="vc-topic"
				type="text"
				class="field-input"
				placeholder="เช่น 5 ข้อผิดพลาดของมือใหม่เทรดทอง"
				bind:value={topic}
				disabled={generating}
			/>
		</div>

		<div class="form-field">
			<label for="vc-clips" class="field-label">จำนวน Video Clips</label>
			<div class="range-row">
				<input
					id="vc-clips"
					type="range"
					min="1"
					max="10"
					step="1"
					bind:value={clipCount}
					disabled={generating}
					class="range-input"
				/>
				<span class="range-value">{clipCount} clips</span>
			</div>
		</div>

		<div class="form-field">
			<label for="vc-duration" class="field-label">ความยาวต่อ Clip</label>
			<div class="range-row">
				<input
					id="vc-duration"
					type="range"
					min="5"
					max="30"
					step="5"
					bind:value={durationSeconds}
					disabled={generating}
					class="range-input"
				/>
				<span class="range-value">{durationSeconds}s</span>
			</div>
		</div>

		<div class="form-field">
			<label for="vc-font" class="field-label">Font</label>
			<select id="vc-font" class="field-select" bind:value={fontPreset} disabled={generating}>
				{#each fontOptions as opt}
					<option value={opt.value}>{opt.label}</option>
				{/each}
			</select>
		</div>
	</div>

	<div class="summary-row">
		<span class="summary-text">
			{VIDEO_CAROUSEL_TEMPLATE_LABELS[templateType]} · รวม {clipCount} clips × {durationSeconds}s =
			<strong>{clipCount * durationSeconds}s ({Math.ceil((clipCount * durationSeconds) / 60)}m)</strong>
		</span>
	</div>

	<Button
		variant="primary"
		onclick={handleGenerate}
		disabled={generating || !topic.trim()}
		class="generate-btn"
	>
		{#if generating}
			<Spinner size="sm" />
			กำลังสร้าง…
		{:else}
			สร้าง Video Carousel
		{/if}
	</Button>
</section>

<!-- ── Project list ───────────────────────────────────────────────────────── -->
<section class="projects-section">
	<h2 class="section-title">โปรเจกต์ทั้งหมด</h2>

	{#if loadingProjects}
		<div class="loading-row"><Spinner size="md" /></div>
	{:else if projects.length === 0}
		<p class="empty-hint">ยังไม่มีโปรเจกต์ สร้างอันแรกด้านบนได้เลย</p>
	{:else}
		<ul class="project-list">
			{#each projects as project}
				<li class="project-row">
					<a class="project-info" href="/video-carousel/{project.id}">
						<span class="project-title">{project.title}</span>
						<span class="project-meta">
							<span class="status-badge status-{project.status}">
								{VIDEO_CAROUSEL_STATUS_LABELS[project.status]}
							</span>
							<span class="template-badge">
								{VIDEO_CAROUSEL_TEMPLATE_LABELS[project.template_type]}
							</span>
							<span class="meta-text">{new Date(project.updated_at).toLocaleDateString('th-TH')}</span>
						</span>
					</a>
					<button
						class="delete-btn"
						onclick={() => handleDelete(project.id, project.title)}
						disabled={deletingId === project.id}
						aria-label="ลบ"
					>
						{#if deletingId === project.id}
							<Spinner size="sm" />
						{:else}
							×
						{/if}
					</button>
				</li>
			{/each}
		</ul>
	{/if}
</section>

<style>
	.setup-card {
		background: var(--color-bg-elevated);
		border: 1px solid var(--color-border);
		border-radius: var(--radius-lg);
		padding: var(--space-5);
		margin-bottom: var(--space-6);
	}

	.section-title {
		font-family: var(--font-heading);
		font-size: var(--text-md);
		font-weight: var(--fw-bold);
		margin: 0 0 var(--space-4);
		color: var(--color-slate-900);
	}

	.template-picker {
		display: grid;
		grid-template-columns: repeat(2, minmax(0, 1fr));
		gap: var(--space-3);
		margin-bottom: var(--space-5);
	}

	.template-card {
		display: grid;
		grid-template-columns: 72px minmax(0, 1fr);
		align-items: center;
		gap: var(--space-3);
		width: 100%;
		padding: var(--space-3);
		border: 1px solid var(--color-border);
		border-radius: var(--radius-md);
		background: var(--color-bg);
		text-align: left;
		font-family: inherit;
		cursor: pointer;
		transition:
			border-color var(--transition-fast),
			background var(--transition-fast),
			box-shadow var(--transition-fast);
	}

	.template-card:hover:not(:disabled) {
		border-color: var(--color-primary-border);
		background: var(--color-primary-bg);
	}

	.template-card.active {
		border-color: var(--color-primary-border);
		background: var(--color-primary-bg);
		box-shadow: 0 0 0 1px var(--color-primary-border);
	}

	.template-card:disabled {
		cursor: not-allowed;
		opacity: 0.65;
	}

	.template-preview {
		position: relative;
		display: flex;
		flex-direction: column;
		justify-content: center;
		gap: 5px;
		width: 58px;
		height: 82px;
		padding: 10px 8px;
		border-radius: 10px;
		overflow: hidden;
		background:
			linear-gradient(rgba(15, 23, 42, 0.62), rgba(15, 23, 42, 0.72)),
			linear-gradient(135deg, #0f172a, #334155);
	}

	.template-quote {
		align-items: center;
	}

	.preview-line,
	.preview-option,
	.preview-quote {
		display: block;
		border-radius: 999px;
		background: rgba(255, 255, 255, 0.86);
	}

	.preview-line.main {
		width: 100%;
		height: 7px;
	}

	.preview-line.accent {
		width: 70%;
		height: 6px;
		background: #f5c518;
	}

	.preview-option {
		width: 100%;
		height: 9px;
		margin-top: 4px;
		background: rgba(255, 255, 255, 0.2);
		border-radius: 3px;
	}

	.preview-option.short {
		width: 82%;
		margin-top: 0;
	}

	.preview-quote {
		width: 70%;
		height: 26px;
		border-radius: 5px;
		background:
			linear-gradient(#ffffff, #ffffff) center 8px / 76% 4px no-repeat,
			linear-gradient(#f5c518, #f5c518) center 17px / 52% 4px no-repeat,
			rgba(255, 255, 255, 0.12);
	}

	.template-copy {
		min-width: 0;
		display: flex;
		flex-direction: column;
		gap: 0.2rem;
	}

	.template-name {
		font-size: var(--text-sm);
		font-weight: var(--fw-bold);
		color: var(--color-slate-900);
	}

	.template-description {
		font-size: var(--text-xs);
		line-height: 1.45;
		color: var(--color-slate-500);
	}

	.form-grid {
		display: grid;
		grid-template-columns: 1fr 1fr;
		gap: var(--space-4);
	}

	.form-field {
		display: flex;
		flex-direction: column;
		gap: var(--space-1);
	}

	.full-width {
		grid-column: 1 / -1;
	}

	.field-label {
		font-size: var(--text-sm);
		font-weight: var(--fw-semibold);
		color: var(--color-slate-700);
	}

	.field-input,
	.field-select {
		padding: 0.5rem 0.75rem;
		border: 1px solid var(--color-border);
		border-radius: var(--radius-md);
		font-size: var(--text-sm);
		font-family: inherit;
		color: var(--color-slate-900);
		background: var(--color-bg);
		transition: border-color var(--transition-fast);
	}

	.field-input:focus,
	.field-select:focus {
		outline: none;
		border-color: var(--color-primary);
	}

	.range-row {
		display: flex;
		align-items: center;
		gap: var(--space-3);
	}

	.range-input {
		flex: 1;
		accent-color: var(--color-primary);
	}

	.range-value {
		font-size: var(--text-sm);
		font-weight: var(--fw-bold);
		color: var(--color-primary);
		min-width: 3.5rem;
		text-align: right;
	}

	.summary-row {
		margin: var(--space-4) 0 var(--space-4);
		font-size: var(--text-sm);
		color: var(--color-slate-500);
	}

	.summary-text strong {
		color: var(--color-slate-900);
	}

	.projects-section {
		margin-top: var(--space-2);
	}

	.loading-row {
		display: flex;
		justify-content: center;
		padding: var(--space-6);
	}

	.empty-hint {
		color: var(--color-slate-400);
		font-size: var(--text-sm);
		padding: var(--space-4) 0;
	}

	.project-list {
		list-style: none;
		padding: 0;
		margin: 0;
		display: flex;
		flex-direction: column;
		gap: var(--space-2);
	}

	.project-row {
		display: flex;
		align-items: center;
		gap: var(--space-2);
		background: var(--color-bg-elevated);
		border: 1px solid var(--color-border);
		border-radius: var(--radius-md);
		padding: var(--space-3) var(--space-4);
		transition: border-color var(--transition-fast);
	}

	.project-row:hover {
		border-color: var(--color-primary-border);
	}

	.project-info {
		flex: 1;
		min-width: 0;
		display: flex;
		align-items: center;
		gap: var(--space-3);
		text-decoration: none;
	}

	.project-title {
		font-weight: var(--fw-semibold);
		color: var(--color-slate-900);
		font-size: var(--text-sm);
		flex: 1;
		white-space: nowrap;
		overflow: hidden;
		text-overflow: ellipsis;
	}

	.project-meta {
		display: flex;
		align-items: center;
		gap: var(--space-2);
		flex-shrink: 0;
	}

	.status-badge {
		font-size: 0.7rem;
		font-weight: var(--fw-bold);
		padding: 0.15rem 0.45rem;
		border-radius: 999px;
		text-transform: uppercase;
		letter-spacing: 0.05em;
	}

	.status-draft { background: var(--color-slate-100); color: var(--color-slate-600); }
	.status-composing { background: #fef3c7; color: #92400e; }
	.status-ready { background: #d1fae5; color: #065f46; }
	.status-exported { background: var(--color-primary-bg); color: var(--color-primary); }

	.template-badge {
		font-size: 0.7rem;
		font-weight: var(--fw-semibold);
		color: var(--color-slate-500);
		background: var(--color-slate-50);
		border: 1px solid var(--color-border);
		border-radius: 999px;
		padding: 0.15rem 0.45rem;
		white-space: nowrap;
	}

	.meta-text {
		font-size: var(--text-xs);
		color: var(--color-slate-400);
	}

	.delete-btn {
		width: 28px;
		height: 28px;
		border: none;
		background: transparent;
		border-radius: var(--radius-sm);
		color: var(--color-slate-400);
		font-size: 1.1rem;
		cursor: pointer;
		display: flex;
		align-items: center;
		justify-content: center;
		transition: background var(--transition-fast), color var(--transition-fast);
		flex-shrink: 0;
	}

	.delete-btn:hover:not(:disabled) {
		background: #fee2e2;
		color: #dc2626;
	}

	@media (max-width: 600px) {
		.template-picker {
			grid-template-columns: 1fr;
		}

		.form-grid {
			grid-template-columns: 1fr;
		}
	}
</style>
