<script lang="ts">
	import { goto } from '$app/navigation';
	import { Badge, Button, PageHeader, Spinner, toast } from '$lib';
	import { carouselStatusLabel } from '$lib/carousel';
	import { CONTENT_CATEGORY_OPTIONS } from '$lib/media-plan';
	import { hasSupabaseConfig } from '$lib/supabase';
	import type { PageData } from './$types';
	import type {
		AIIdeaSuggestion,
		BacklogContentCategory,
		CarouselContentMode,
		CarouselProjectRow,
		ContentJourneyStage
	} from '$lib/types';

	const PROJECT_MODE_OPTIONS: Array<{
		value: CarouselContentMode;
		label: string;
		description: string;
	}> = [
		{
			value: 'standard',
			label: 'Standard',
			description: 'knowledge / trading content พร้อม asset-led workflow'
		},
		{
			value: 'quote',
			label: 'Quote',
			description: 'text-first workflow พร้อม account header สำหรับ non-CTA slides'
		}
	];

	const AI_IDEA_FOCUS_PRESETS = [
		{
			id: 'beginner-mistakes',
			label: 'มือใหม่พลาดอะไร',
			prompt: 'โฟกัสปัญหาของมือใหม่เทรดทอง เช่น เข้าออเดอร์มั่ว, ขยับ SL, หรือรีบสวนเทรนด์'
		},
		{
			id: 'risk-management',
			label: 'Risk management',
			prompt: 'เน้นไอเดียที่สอนเรื่อง risk management, lot size, stop loss และการรักษาทุนสำหรับ XAUUSD'
		},
		{
			id: 'trading-psychology',
			label: 'Trader psychology',
			prompt: 'เน้น pain point ด้านอารมณ์ เช่น revenge trade, FOMO, overtrade และถือ order เพราะไม่กล้าตัดขาดทุน'
		},
		{
			id: 'gold-news',
			label: 'ข่าวกระทบทอง',
			prompt: 'เน้นข่าวและ macro ที่กระทบ XAUUSD เช่น CPI, NFP, ดอกเบี้ย, DXY และวิธีอ่านผลกระทบแบบเข้าใจง่าย'
		},
		{
			id: 'ib-conversion',
			label: 'ชวนเข้า community',
			prompt: 'เน้นไอเดียที่พาคนจาก content ไปสู่การ follow, join community และ conversion สำหรับ IB business'
		}
	] as const;

	const journeyStageLabel: Record<ContentJourneyStage, string> = {
		awareness: 'Awareness',
		trust: 'Trust',
		conversion: 'Conversion'
	};

	let { data }: { data: PageData } = $props();

	let projects = $state<CarouselProjectRow[]>([]);
	let loadingProjects = $state(false);
	let search = $state('');
	let creatingStandalone = $state(false);
	let deletingProjectId = $state<string | null>(null);
	let duplicatingProjectId = $state<string | null>(null);
	let contentMode = $state<CarouselContentMode>('standard');
	let newIdeaTitle = $state('');
	let newIdeaDescription = $state('');
	let newIdeaNotes = $state('');
	let newIdeaCategory = $state<BacklogContentCategory | ''>('');
	let aiSuggestLoading = $state(false);
	let aiSuggestError = $state('');
	let aiSuggestions = $state<AIIdeaSuggestion[]>([]);
	let aiCustomPrompt = $state('');
	let activeAiPreset = $state('');
	let initialLoadError = $state('');
	let initializedFromData = false;

	const carouselCategoryOptions = CONTENT_CATEGORY_OPTIONS.filter((option) => option.value !== 'pin');
	const activeAiPresetPrompt = $derived(
		AI_IDEA_FOCUS_PRESETS.find((preset) => preset.id === activeAiPreset)?.prompt ?? ''
	);
	const titlePlaceholder = $derived(
		contentMode === 'quote'
			? 'เช่น 5 quote ที่พูดแทน mindset ของคนเทรดทอง'
			: 'เช่น 5 ความผิดพลาดเวลาเข้าเทรดทอง'
	);
	const descriptionPlaceholder = $derived(
		contentMode === 'quote'
			? 'สรุปธีมคำคม มุมมอง และอารมณ์หลักของ quote carousel แบบสั้นๆ'
			: 'สรุป angle ของ carousel แบบสั้นๆ'
	);
	const studioBriefPlaceholder = $derived(
		contentMode === 'quote'
			? 'ใส่ quote mood, audience, slide flow, CTA หรือใช้ AI ช่วยเติมให้'
			: 'ใส่ hook, audience, slide flow, CTA หรือใช้ AI ช่วยเติมให้'
	);
	const aiPromptPlaceholder = $derived(
		contentMode === 'quote'
			? 'เช่น อยากได้ quote carousel สำหรับคนที่กำลังกลัวเข้าออเดอร์ตอนทองวิ่งแรง'
			: 'เช่น อยากได้ content สำหรับมือใหม่ที่ชอบ overtrade ตอนทองวิ่งแรง'
	);

	const filteredProjects = $derived.by(() => {
		const query = search.trim().toLowerCase();
		if (!query) return projects;

		return projects.filter((project) => {
			const projectTitle = (project.title ?? '').toLowerCase();
			const caption = (project.caption ?? '').toLowerCase();
			const visualDirection = (project.visual_direction ?? '').toLowerCase();
			const status = project.status.toLowerCase();
			const mode = (project.content_mode ?? 'standard').toLowerCase();

			return (
				projectTitle.includes(query) ||
				caption.includes(query) ||
				visualDirection.includes(query) ||
				status.includes(query) ||
				mode.includes(query)
			);
		});
	});

	function badgeVariant(status: CarouselProjectRow['status']): 'warning' | 'success' | 'info' | 'neutral' {
		if (status === 'ready') return 'success';
		if (status === 'exported') return 'info';
		if (status === 'draft') return 'warning';
		return 'neutral';
	}

	function formatCompactDate(value: string | null): string {
		if (!value) return 'ยังไม่มี';
		return new Date(value).toLocaleString('th-TH', {
			dateStyle: 'medium'
		});
	}

	function latestActivityLabel(project: CarouselProjectRow): string {
		if (project.last_exported_at) return `Exported ${formatCompactDate(project.last_exported_at)}`;
		if (project.last_generated_at) return `Generated ${formatCompactDate(project.last_generated_at)}`;
		return 'ยังไม่เคย generate';
	}

	$effect(() => {
		if (initializedFromData) return;
		projects = data.projects ?? [];
		initialLoadError = data.loadError ?? '';
		initializedFromData = true;
	});

	function focusIdeaTitleInput() {
		requestAnimationFrame(() => {
			const input = document.getElementById('carousel-idea-title') as HTMLInputElement | null;
			input?.focus();
			input?.select();
		});
	}

	function setContentMode(mode: CarouselContentMode) {
		if (contentMode === mode) return;
		contentMode = mode;
		aiSuggestError = '';
		aiSuggestions = [];
	}

	function buildSuggestionNotes(suggestion: AIIdeaSuggestion): string {
		const lines = [
			contentMode === 'quote' ? 'AI Quote Carousel Brief' : 'AI Carousel Brief',
			contentMode === 'quote'
				? 'Mode: quote-first carousel with account header on every non-CTA slide'
				: null,
			suggestion.audience ? `Audience: ${suggestion.audience}` : null,
			suggestion.journey_stage ? `Journey stage: ${journeyStageLabel[suggestion.journey_stage]}` : null,
			suggestion.hook ? `Hook: ${suggestion.hook}` : null,
			suggestion.slide_outline.length > 0 ? 'Slide flow:' : null,
			...suggestion.slide_outline.map((item, index) => `${index + 1}. ${item}`),
			suggestion.cta ? `CTA: ${suggestion.cta}` : null,
			`Why this can work: ${suggestion.reason}`
		];

		return lines.filter((line): line is string => Boolean(line)).join('\n');
	}

	function applySuggestionToDraft(suggestion: AIIdeaSuggestion) {
		newIdeaTitle = suggestion.title;
		newIdeaDescription = suggestion.description;
		newIdeaCategory = suggestion.content_category;
		newIdeaNotes = buildSuggestionNotes(suggestion);
		focusIdeaTitleInput();
		toast.success(`เติม draft จาก AI แล้ว: ${suggestion.title}`);
	}

	function resetIdeaDraft() {
		newIdeaTitle = '';
		newIdeaDescription = '';
		newIdeaNotes = '';
		newIdeaCategory = '';
	}

	async function suggestTradingIdeas() {
		aiSuggestLoading = true;
		aiSuggestError = '';
		aiSuggestions = [];

		try {
			const prompt = [activeAiPresetPrompt, aiCustomPrompt.trim()].filter(Boolean).join('\n');
			const requestBody: Record<string, unknown> = {
				useCase: 'carousel_studio',
				prompt: prompt || undefined,
				count: 4
			};

			if (contentMode === 'quote') {
				requestBody.content_mode = 'quote';
			}

			const response = await fetch('/api/openclaw/ai/suggest-ideas', {
				method: 'POST',
				headers: { 'Content-Type': 'application/json' },
				body: JSON.stringify(requestBody)
			});
			const body = await response.json();
			if (!response.ok) {
				aiSuggestError = body.error ?? 'สร้าง AI ideas ไม่สำเร็จ';
				return;
			}

			aiSuggestions = Array.isArray(body.suggestions) ? (body.suggestions as AIIdeaSuggestion[]) : [];
			if (aiSuggestions.length === 0) {
				aiSuggestError = 'AI ยังไม่ส่ง idea กลับมา ลองใหม่อีกครั้ง';
			}
		} catch {
			aiSuggestError = 'เชื่อมต่อ AI ไม่ได้ กรุณาลองใหม่';
		} finally {
			aiSuggestLoading = false;
		}
	}

	async function loadProjects() {
		loadingProjects = true;
		initialLoadError = '';
		try {
			const response = await fetch('/api/openclaw/carousels');
			const body = await response.json();
			if (!response.ok) {
				const message = body.error ?? 'โหลด carousel projects ไม่สำเร็จ';
				initialLoadError = message;
				toast.error(message);
				return;
			}
			projects = body as CarouselProjectRow[];
		} catch {
			initialLoadError = 'โหลด carousel projects ไม่สำเร็จ';
			toast.error('โหลด carousel projects ไม่สำเร็จ');
		} finally {
			loadingProjects = false;
		}
	}

	async function createStandaloneProject() {
		const title = newIdeaTitle.trim();
		if (!title) {
			toast.error('ใส่ชื่อ project ก่อนสร้าง Carousel');
			return;
		}

		creatingStandalone = true;
		try {
			const response = await fetch('/api/openclaw/carousels', {
				method: 'POST',
				headers: { 'Content-Type': 'application/json' },
				body: JSON.stringify({
					title,
					description: newIdeaDescription.trim() || null,
					content_category: newIdeaCategory || null,
					content_mode: contentMode,
					notes: ['Created from Carousel Studio', newIdeaNotes.trim()].filter(Boolean).join('\n\n')
				})
			});
			const body = await response.json();
			if (!response.ok) {
				toast.error(body.error ?? 'สร้าง Carousel project ไม่สำเร็จ');
				return;
			}

			newIdeaTitle = '';
			newIdeaDescription = '';
			newIdeaNotes = '';
			newIdeaCategory = '';
			await goto(`/carousel/${body.id}`);
		} catch {
			toast.error('สร้าง Carousel project ไม่สำเร็จ');
		} finally {
			creatingStandalone = false;
		}
	}

	async function duplicateProject(project: CarouselProjectRow) {
		duplicatingProjectId = project.id;
		try {
			const response = await fetch(`/api/openclaw/carousels/${project.id}/duplicate`, {
				method: 'POST'
			});
			const body = await response.json();
			if (!response.ok) {
				toast.error(body.error ?? 'Duplicate project ไม่สำเร็จ');
				return;
			}
			await goto(`/carousel/${body.project.id}`);
		} catch {
			toast.error('Duplicate project ไม่สำเร็จ');
		} finally {
			duplicatingProjectId = null;
		}
	}

	async function deleteProject(project: CarouselProjectRow) {
		const confirmed = window.confirm(
			`ลบ carousel project นี้ใช่ไหม?\n${project.title ?? project.id}\n\nระบบจะลบเฉพาะ project และ slides`
		);
		if (!confirmed) return;

		deletingProjectId = project.id;
		try {
			const response = await fetch(`/api/openclaw/carousels/${project.id}`, {
				method: 'DELETE'
			});

			if (!response.ok) {
				let message = 'ลบ carousel project ไม่สำเร็จ';
				try {
					const body = await response.json();
					message = body.error ?? message;
				} catch {
					// ignore invalid json
				}
				toast.error(message);
				return;
			}

			projects = projects.filter((item) => item.id !== project.id);
			toast.success('ลบ carousel project แล้ว');
		} catch {
			toast.error('ลบ carousel project ไม่สำเร็จ');
		} finally {
			deletingProjectId = null;
		}
	}

</script>

<main class="page">
	{#if !hasSupabaseConfig}
		<p class="alert">ตั้งค่า env ก่อนใช้งาน: <code>PUBLIC_SUPABASE_URL</code> และ <code>PUBLIC_SUPABASE_ANON_KEY</code></p>
	{:else}
		{#if initialLoadError}
			<p class="alert">{initialLoadError}</p>
		{/if}

		<!-- ── Create section ── -->
		<section class="create-section">
			<div class="mode-tabs">
				{#each PROJECT_MODE_OPTIONS as option}
					<button
						type="button"
						class="mode-tab"
						class:mode-tab--active={contentMode === option.value}
						onclick={() => setContentMode(option.value)}
					>{option.label}</button>
				{/each}
			</div>

			<div class="command-bar">
				<input
					id="carousel-idea-title"
					class="command-input"
					bind:value={newIdeaTitle}
					placeholder={titlePlaceholder}
					onkeydown={(e) => { if (e.key === 'Enter' && !creatingStandalone) void createStandaloneProject(); }}
				/>
				<button
					class="command-btn"
					disabled={creatingStandalone}
					onclick={() => void createStandaloneProject()}
				>
					{creatingStandalone ? 'Creating…' : 'Create'}
				</button>
			</div>

			<details class="adv-panel">
				<summary class="adv-summary">
					<span>Advanced</span>
					<small>description · category · brief · AI assist</small>
				</summary>

				<div class="adv-body">
					<div class="advanced-grid">
						<label class="field">
							<span>Description</span>
							<textarea bind:value={newIdeaDescription} rows={4} placeholder={descriptionPlaceholder}></textarea>
						</label>

						<label class="field">
							<span>Category</span>
							<select bind:value={newIdeaCategory}>
								{#each carouselCategoryOptions as option}
									<option value={option.value}>{option.label}</option>
								{/each}
							</select>
						</label>

						<label class="field field--full">
							<span>Studio brief</span>
							<textarea bind:value={newIdeaNotes} rows={6} placeholder={studioBriefPlaceholder}></textarea>
							<small>brief นี้จะถูกเก็บใน backlog notes และส่งต่อให้ AI ตอน generate carousel</small>
						</label>
					</div>

					<section class="ai-panel">
						<div class="ai-panel-head">
							<div>
								<p class="section-kicker">{contentMode === 'quote' ? 'Quote AI Assist' : 'Trading AI Assist'}</p>
								<h3>{contentMode === 'quote' ? 'ให้ AI ช่วยตั้งต้น quote-first brief' : 'ให้ AI ช่วยตั้งต้นหัวข้อ carousel'}</h3>
							</div>
							<Button variant="secondary" onclick={() => { void suggestTradingIdeas(); }} loading={aiSuggestLoading}>
								{aiSuggestLoading ? 'กำลังคิด...' : contentMode === 'quote' ? 'AI คิด quote ให้' : 'AI คิดให้'}
							</Button>
						</div>

						<div class="preset-row">
							{#each AI_IDEA_FOCUS_PRESETS as preset}
								<button
									type="button"
									class:selected={activeAiPreset === preset.id}
									onclick={() => { activeAiPreset = activeAiPreset === preset.id ? '' : preset.id; }}
								>{preset.label}</button>
							{/each}
						</div>

						<label class="field field--full">
							<span>โจทย์เพิ่ม</span>
							<textarea bind:value={aiCustomPrompt} rows={3} placeholder={aiPromptPlaceholder}></textarea>
						</label>

						{#if aiSuggestError}
							<p class="ai-error">{aiSuggestError}</p>
						{/if}

						{#if aiSuggestLoading}
							<div class="loading-state">
								<Spinner label="AI กำลังร่าง ideas..." />
							</div>
						{:else if aiSuggestions.length > 0}
							<div class="ai-suggestion-list">
								{#each aiSuggestions as suggestion}
									<article class="ai-suggestion-card">
										<div class="ai-suggestion-top">
											<div class="ai-chip-row">
												<Badge variant="category" value={suggestion.content_category} size="sm" />
												<Badge variant="platform" value={suggestion.platform} size="sm" />
												{#if suggestion.journey_stage}
													<span class="journey-pill journey-pill--{suggestion.journey_stage}">
														{journeyStageLabel[suggestion.journey_stage]}
													</span>
												{/if}
											</div>
											<button type="button" class="suggestion-apply" onclick={() => applySuggestionToDraft(suggestion)}>
												ใช้เป็น draft
											</button>
										</div>

										<h4>{suggestion.title}</h4>
										<p class="ai-suggestion-desc">{suggestion.description}</p>

										<div class="ai-suggestion-meta">
											{#if suggestion.audience}
												<p><strong>Audience</strong> {suggestion.audience}</p>
											{/if}
											{#if suggestion.hook}
												<p><strong>Hook</strong> {suggestion.hook}</p>
											{/if}
										</div>

										{#if suggestion.slide_outline.length > 0}
											<div class="ai-outline">
												<strong>Slide flow</strong>
												<ol>
													{#each suggestion.slide_outline as item}
														<li>{item}</li>
													{/each}
												</ol>
											</div>
										{/if}

										{#if suggestion.cta}
											<p class="ai-cta"><strong>CTA</strong> {suggestion.cta}</p>
										{/if}

										<p class="ai-reason">{suggestion.reason}</p>
									</article>
								{/each}
							</div>
						{/if}
					</section>
				</div>
			</details>
		</section>

		<!-- ── Projects section ── -->
		<section class="projects-section">
			<div class="projects-head">
				<h2 class="projects-title">งานล่าสุด</h2>
				<div class="projects-controls">
					<input class="search-input" bind:value={search} placeholder="ค้นหา…" />
					<button
						class="refresh-btn"
						title="Refresh"
						disabled={loadingProjects}
						onclick={() => void loadProjects()}
					>↺</button>
				</div>
			</div>

			{#if loadingProjects}
				<div class="loading-state">
					<Spinner label="Loading carousel projects..." />
				</div>
			{:else if filteredProjects.length === 0}
				<div class="empty-state">
					<p>ยังไม่มี project — พิมพ์ชื่อด้านบนแล้วกด Create ได้เลย</p>
				</div>
			{:else}
				<ul class="project-list">
					{#each filteredProjects as project}
						<li class="project-item">
							<a class="project-link" href={`/carousel/${project.id}`}>
								<div class="project-thumb" class:project-thumb--empty={!project.cover_thumbnail_url}>
									{#if project.cover_thumbnail_url}
										<img src={project.cover_thumbnail_url} alt="" loading="lazy" />
									{:else}
										<span>{(project.title ?? 'C')[0].toUpperCase()}</span>
									{/if}
								</div>
								<div class="project-info">
									<div class="project-name">{project.title ?? 'Untitled carousel'}</div>
									<div class="project-meta">
										<Badge variant={badgeVariant(project.status)} label={carouselStatusLabel[project.status]} />
										<Badge variant="neutral" label={project.content_mode === 'quote' ? 'Quote' : 'Standard'} />
										<span class="project-stats">{project.slide_count} slides · {latestActivityLabel(project)}</span>
									</div>
								</div>
							</a>
							<div class="project-actions">
								<button
									class="project-action-btn"
									title="Duplicate"
									disabled={duplicatingProjectId === project.id}
									onclick={() => void duplicateProject(project)}
								>{duplicatingProjectId === project.id ? '…' : 'Copy'}</button>
								<button
									class="project-action-btn project-action-btn--danger"
									title="Delete"
									disabled={deletingProjectId === project.id}
									onclick={() => void deleteProject(project)}
								>{deletingProjectId === project.id ? '…' : 'Delete'}</button>
							</div>
						</li>
					{/each}
				</ul>
			{/if}
		</section>
	{/if}
</main>

<style>
	.page {
		display: grid;
		gap: var(--space-5);
	}

	.alert {
		margin: 0;
		padding: var(--space-4);
		border-radius: var(--radius-xl);
		background: var(--color-red-50);
		color: var(--color-red-700);
		border: 1px solid rgba(220, 38, 38, 0.14);
	}

	/* ── Create section ── */
	.create-section {
		display: grid;
		gap: var(--space-3);
		padding: var(--space-5);
		border-radius: var(--radius-xl);
		border: 1px solid var(--color-border);
		background: var(--color-bg-elevated);
		box-shadow: var(--shadow-xs);
	}

	.mode-tabs {
		display: flex;
		gap: 2px;
		background: var(--color-slate-100);
		border-radius: var(--radius-md);
		padding: 3px;
		width: fit-content;
	}

	.mode-tab {
		padding: 0.38rem 1rem;
		border-radius: calc(var(--radius-md) - 1px);
		border: none;
		background: transparent;
		font: inherit;
		font-size: var(--text-sm);
		font-weight: var(--fw-semibold);
		color: var(--color-slate-500);
		cursor: pointer;
		transition: background 100ms ease, color 100ms ease, box-shadow 100ms ease;
	}

	.mode-tab--active {
		background: #fff;
		color: var(--color-slate-900);
		box-shadow: 0 1px 3px rgba(15, 23, 42, 0.1);
	}

	.command-bar {
		display: flex;
		gap: var(--space-2);
	}

	.command-input {
		flex: 1;
		padding: 0.75rem 1rem;
		border-radius: var(--radius-lg);
		border: 1.5px solid var(--color-border-strong);
		background: var(--color-bg);
		font: inherit;
		font-size: var(--text-base);
		color: var(--color-text);
		transition: border-color 120ms ease, box-shadow 120ms ease;
	}

	.command-input:focus {
		outline: none;
		border-color: var(--color-primary);
		box-shadow: 0 0 0 3px var(--color-primary-bg);
	}

	.command-btn {
		padding: 0.75rem 1.5rem;
		border-radius: var(--radius-lg);
		border: none;
		background: var(--color-primary);
		color: #fff;
		font: inherit;
		font-size: var(--text-sm);
		font-weight: var(--fw-semibold);
		cursor: pointer;
		white-space: nowrap;
		transition: background 120ms ease, opacity 120ms ease;
	}

	.command-btn:hover:not(:disabled) {
		background: var(--color-primary-hover);
	}

	.command-btn:disabled {
		opacity: 0.55;
		cursor: not-allowed;
	}

	/* ── Advanced panel ── */
	.adv-panel {
		border-radius: var(--radius-md);
		border: 1px solid var(--color-border);
		background: var(--color-bg-subtle);
	}

	.adv-summary {
		list-style: none;
		display: flex;
		align-items: center;
		gap: var(--space-3);
		padding: 0.65rem var(--space-4);
		cursor: pointer;
		user-select: none;
	}

	.adv-summary::-webkit-details-marker { display: none; }

	.adv-summary span {
		font-size: var(--text-sm);
		font-weight: var(--fw-semibold);
		color: var(--color-slate-700);
	}

	.adv-summary small {
		font-size: var(--text-xs);
		color: var(--color-slate-400);
	}

	.adv-body {
		display: grid;
		gap: var(--space-4);
		padding: 0 var(--space-4) var(--space-4);
	}

	/* ── Projects section ── */
	.projects-section {
		display: grid;
		gap: var(--space-3);
	}

	.projects-head {
		display: flex;
		align-items: center;
		justify-content: space-between;
		gap: var(--space-3);
	}

	.projects-title {
		margin: 0;
		font-family: var(--font-heading);
		font-size: var(--text-lg);
		color: var(--color-slate-900);
	}

	.projects-controls {
		display: flex;
		align-items: center;
		gap: var(--space-2);
	}

	.search-input {
		width: 200px;
		padding: 0.45rem 0.75rem;
		border-radius: var(--radius-md);
		border: 1px solid var(--color-border-strong);
		background: var(--color-bg-elevated);
		font: inherit;
		font-size: var(--text-sm);
		color: var(--color-text);
	}

	.search-input:focus {
		outline: none;
		border-color: rgba(15, 23, 42, 0.3);
		box-shadow: 0 0 0 3px rgba(15, 23, 42, 0.06);
	}

	.refresh-btn {
		width: 2rem;
		height: 2rem;
		display: grid;
		place-items: center;
		border: 1px solid var(--color-border-strong);
		border-radius: var(--radius-md);
		background: var(--color-bg-elevated);
		color: var(--color-slate-500);
		cursor: pointer;
		font-size: 1rem;
		line-height: 1;
		transition: background 100ms ease, color 100ms ease;
	}

	.refresh-btn:hover:not(:disabled) {
		background: var(--color-slate-100);
		color: var(--color-slate-700);
	}

	/* ── Project list ── */
	.project-list {
		list-style: none;
		margin: 0;
		padding: 0;
		display: grid;
		gap: var(--space-2);
	}

	.project-item {
		display: flex;
		align-items: center;
		border-radius: var(--radius-lg);
		border: 1px solid var(--color-border);
		background: var(--color-bg-elevated);
		overflow: hidden;
		transition: border-color 120ms ease, box-shadow 120ms ease;
	}

	.project-item:hover {
		border-color: var(--color-border-strong);
		box-shadow: var(--shadow-sm);
	}

	.project-item:hover .project-actions {
		opacity: 1;
	}

	.project-link {
		flex: 1;
		display: flex;
		align-items: center;
		gap: var(--space-4);
		padding: var(--space-3) var(--space-4);
		min-width: 0;
		color: inherit;
		text-decoration: none;
	}

	.project-thumb {
		width: 68px;
		height: 68px;
		border-radius: var(--radius-md);
		overflow: hidden;
		flex-shrink: 0;
		background: var(--color-slate-100);
	}

	.project-thumb img {
		width: 100%;
		height: 100%;
		object-fit: cover;
		display: block;
	}

	.project-thumb--empty {
		display: flex;
		align-items: center;
		justify-content: center;
		font-size: 1.5rem;
		font-weight: 700;
		color: var(--color-slate-400);
	}

	.project-info {
		flex: 1;
		display: grid;
		gap: 0.4rem;
		min-width: 0;
	}

	.project-name {
		font-family: var(--font-heading);
		font-weight: var(--fw-semibold);
		font-size: var(--text-base);
		color: var(--color-slate-900);
		white-space: nowrap;
		overflow: hidden;
		text-overflow: ellipsis;
	}

	.project-meta {
		display: flex;
		flex-wrap: wrap;
		align-items: center;
		gap: 0.4rem;
	}

	.project-stats {
		font-size: var(--text-xs);
		color: var(--color-slate-400);
	}

	.project-actions {
		display: flex;
		align-items: center;
		gap: var(--space-1);
		padding-right: var(--space-3);
		opacity: 0;
		transition: opacity 120ms ease;
	}

	.project-action-btn {
		padding: 0.32rem 0.65rem;
		border-radius: var(--radius-md);
		border: 1px solid var(--color-border);
		background: var(--color-bg-elevated);
		font: inherit;
		font-size: var(--text-xs);
		font-weight: var(--fw-semibold);
		color: var(--color-slate-600);
		cursor: pointer;
		transition: background 100ms ease, border-color 100ms ease;
	}

	.project-action-btn:hover:not(:disabled) {
		background: var(--color-slate-50);
		border-color: var(--color-slate-300);
	}

	.project-action-btn--danger { color: var(--color-red-600); }

	.project-action-btn--danger:hover:not(:disabled) {
		background: var(--color-red-50);
		border-color: rgba(220, 38, 38, 0.2);
	}

	.empty-state {
		padding: var(--space-8);
		text-align: center;
		color: var(--color-slate-400);
		border-radius: var(--radius-lg);
		border: 1px dashed var(--color-border-strong);
	}

	.empty-state p { margin: 0; }

	.loading-state {
		padding: var(--space-5);
		display: grid;
		place-items: center;
	}

	/* ── Fields shared in adv panel ── */
	.advanced-grid {
		display: grid;
		grid-template-columns: minmax(0, 1.2fr) minmax(0, 1fr);
		gap: var(--space-4);
	}

	.field {
		display: grid;
		gap: 0.55rem;
	}

	.field--full { grid-column: 1 / -1; }

	.field span {
		font-size: 0.82rem;
		font-weight: 700;
		color: var(--color-slate-500);
	}

	.field input,
	.field textarea,
	.field select {
		width: 100%;
		padding: 0.68rem 0.8rem;
		border-radius: var(--radius-md);
		border: 1px solid var(--color-border-strong);
		background: #fff;
		font: inherit;
		color: var(--color-text);
	}

	.field input:focus,
	.field textarea:focus,
	.field select:focus {
		outline: 0;
		border-color: rgba(15, 23, 42, 0.36);
		box-shadow: 0 0 0 3px rgba(15, 23, 42, 0.08);
	}

	.field small {
		font-size: var(--text-xs);
		color: var(--color-slate-400);
		line-height: 1.6;
	}

	/* ── AI panel ── */
	.ai-panel {
		display: grid;
		gap: var(--space-4);
		padding-top: var(--space-4);
		border-top: 1px solid rgba(148, 163, 184, 0.18);
	}

	.ai-panel-head,
	.ai-suggestion-top {
		display: flex;
		justify-content: space-between;
		gap: var(--space-3);
		align-items: start;
	}

	.section-kicker,
	.ai-panel-head p {
		margin: 0;
		font-size: 0.78rem;
		font-weight: 800;
		text-transform: uppercase;
		letter-spacing: 0.12em;
		color: var(--color-slate-500);
	}

	.ai-panel-head h3 {
		margin: 0;
		font-family: var(--font-heading);
	}

	.preset-row {
		display: flex;
		flex-wrap: wrap;
		gap: 0.6rem;
	}

	.preset-row button,
	.suggestion-apply {
		border: 0;
		cursor: pointer;
		font: inherit;
	}

	.preset-row button {
		padding: 0.45rem 0.85rem;
		border-radius: 999px;
		background: rgba(226, 232, 240, 0.8);
		color: var(--color-slate-600);
		font-size: var(--text-sm);
	}

	.preset-row button.selected {
		background: var(--color-primary);
		color: #fff;
	}

	.ai-error {
		margin: 0;
		padding: 0.9rem 1rem;
		border-radius: var(--radius-lg);
		background: rgba(254, 242, 242, 0.96);
		color: var(--color-red-700);
		border: 1px solid rgba(248, 113, 113, 0.22);
	}

	.ai-suggestion-list {
		display: grid;
		gap: var(--space-3);
	}

	.ai-suggestion-card {
		padding: var(--space-4);
		border-radius: var(--radius-lg);
		border: 1px solid var(--color-border);
		background: #fff;
		display: grid;
		gap: 0.85rem;
	}

	.ai-suggestion-card p,
	.ai-suggestion-card h4 { margin: 0; }

	.ai-suggestion-card h4 { font-family: var(--font-heading); }

	.ai-suggestion-desc { color: var(--color-slate-600); }

	.ai-chip-row {
		display: flex;
		flex-wrap: wrap;
		gap: 0.5rem;
	}

	.journey-pill {
		display: inline-flex;
		align-items: center;
		padding: 0.3rem 0.65rem;
		border-radius: 999px;
		font-size: 0.72rem;
		font-weight: 700;
	}

	.journey-pill--awareness { background: rgba(253, 230, 138, 0.35); color: #92400e; }
	.journey-pill--trust     { background: rgba(147, 197, 253, 0.24); color: #1d4ed8; }
	.journey-pill--conversion{ background: rgba(167, 243, 208, 0.32); color: #047857; }

	.suggestion-apply {
		padding: 0.4rem 0.8rem;
		border-radius: 999px;
		background: rgba(37, 99, 235, 0.1);
		color: var(--color-blue-700);
		font-size: var(--text-sm);
		font-weight: var(--fw-semibold);
	}

	.ai-suggestion-meta,
	.ai-outline,
	.ai-cta { display: grid; gap: 0.4rem; }

	.ai-suggestion-meta p,
	.ai-cta { margin: 0; color: var(--color-slate-600); }

	.ai-suggestion-meta strong,
	.ai-outline strong,
	.ai-cta strong {
		display: block;
		margin-bottom: 0.2rem;
		color: var(--color-text);
	}

	.ai-outline ol {
		margin: 0;
		padding-left: 1.2rem;
		display: grid;
		gap: 0.35rem;
		color: var(--color-slate-600);
	}

	.ai-reason {
		margin: 0;
		color: var(--color-slate-500);
		font-size: var(--text-sm);
	}

	/* ── Responsive ── */
	@media (max-width: 768px) {
		.advanced-grid {
			grid-template-columns: 1fr;
		}

		.ai-panel-head,
		.ai-suggestion-top {
			flex-direction: column;
			align-items: stretch;
		}

		.project-thumb {
			width: 52px;
			height: 52px;
		}

		.project-actions {
			opacity: 1;
			padding: var(--space-2);
			flex-direction: column;
		}

		.search-input { width: 140px; }
	}

	@media (max-width: 560px) {
		.command-bar { flex-direction: column; }
		.command-btn { width: 100%; }
		.projects-controls { gap: var(--space-1); }

		.ai-panel-head :global(button) { width: 100%; }
	}
</style>
