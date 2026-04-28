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
	<PageHeader
		eyebrow="Instagram automation"
		title="Carousel"
		subtitle="สร้างโปรเจกต์เร็ว แล้วค่อยไปจัดรายละเอียดต่อใน Studio"
	>
		{#snippet actions()}
			<Button variant="secondary" onclick={() => { void loadProjects(); }} loading={loadingProjects}>
				Refresh
			</Button>
		{/snippet}
	</PageHeader>

	{#if !hasSupabaseConfig}
		<p class="alert">ตั้งค่า env ก่อนใช้งาน: <code>PUBLIC_SUPABASE_URL</code> และ <code>PUBLIC_SUPABASE_ANON_KEY</code></p>
	{:else}
		{#if initialLoadError}
			<p class="alert">{initialLoadError}</p>
		{/if}

		<section class="quick-create-card">
			<div class="section-head">
				<p class="section-kicker">Quick Create</p>
				<h2>เริ่มจาก title แล้วเข้า Studio เลย</h2>
				<p class="section-copy">ฟอร์มหลักเหลือแค่ชื่อกับโหมด ส่วน brief, category และ AI assist ถูกย้ายไปไว้ใน Advanced</p>
			</div>

			<div class="quick-create-grid">
				<label class="field field--title">
					<span>Project title</span>
					<input id="carousel-idea-title" bind:value={newIdeaTitle} placeholder={titlePlaceholder} />
				</label>

				<div class="field">
					<span>Mode</span>
					<div class="mode-row">
						{#each PROJECT_MODE_OPTIONS as option}
							<button
								type="button"
								class:selected={contentMode === option.value}
								onclick={() => {
									setContentMode(option.value);
								}}
							>
								<strong>{option.label}</strong>
								<small>{option.description}</small>
							</button>
						{/each}
					</div>
				</div>
			</div>

			<div class="quick-create-actions">
				<Button variant="primary" onclick={() => { void createStandaloneProject(); }} loading={creatingStandalone}>
					{creatingStandalone ? 'Creating...' : contentMode === 'quote' ? 'Create Quote Project' : 'Create Carousel Project'}
				</Button>
				<Button variant="ghost" onclick={resetIdeaDraft}>Clear</Button>
			</div>

			<details class="advanced-panel">
				<summary>
					<div>
						<strong>Advanced</strong>
						<span>description, category, studio brief และ AI assist</span>
					</div>
				</summary>

				<div class="advanced-body">
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
									onclick={() => {
										activeAiPreset = activeAiPreset === preset.id ? '' : preset.id;
									}}
								>
									{preset.label}
								</button>
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
												<p><strong>Audience</strong>{suggestion.audience}</p>
											{/if}
											{#if suggestion.hook}
												<p><strong>Hook</strong>{suggestion.hook}</p>
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
											<p class="ai-cta"><strong>CTA</strong>{suggestion.cta}</p>
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

		<section class="projects-panel">
			<div class="section-head section-head--inline">
				<div>
					<p class="section-kicker">Recent Projects</p>
					<h2>เปิดงานเก่าต่อได้ทันที</h2>
				</div>
				<input bind:value={search} placeholder="ค้นหา project, status หรือ mode..." />
			</div>

			{#if loadingProjects}
				<div class="loading-state">
					<Spinner label="Loading carousel projects..." />
				</div>
			{:else if filteredProjects.length === 0}
				<div class="empty-card">
					<h4>ยังไม่มี carousel project</h4>
					<p>เริ่มจากสร้าง project ใหม่ด้านบน แล้วระบบจะพาเข้า Studio ทันที</p>
				</div>
			{:else}
				<div class="project-list">
					{#each filteredProjects as project}
						<article class="project-row">
							{#if project.cover_thumbnail_url}
								<div class="project-thumb">
									<img src={project.cover_thumbnail_url} alt={project.title ?? 'Carousel cover'} loading="lazy" />
								</div>
							{:else}
								<div class="project-thumb project-thumb--empty">
									<span>{(project.title ?? 'C')[0].toUpperCase()}</span>
								</div>
							{/if}
							<div class="project-main">
								<div class="project-title-row">
									<h3>{project.title ?? 'Untitled carousel'}</h3>
									<div class="project-badges">
										<Badge variant={badgeVariant(project.status)} label={carouselStatusLabel[project.status]} />
										<Badge variant="neutral" label={project.content_mode === 'quote' ? 'Quote' : 'Standard'} />
									</div>
								</div>

								<p class="project-secondary">{project.caption ?? project.visual_direction ?? 'ยังไม่มี caption หรือ visual direction'}</p>

								<div class="project-meta">
									<span>{project.slide_count} slides</span>
									<span>{latestActivityLabel(project)}</span>
								</div>
							</div>

							<div class="project-actions">
								<Button variant="primary" href={`/carousel/${project.id}`}>Open</Button>
								<Button
									variant="secondary"
									size="sm"
									onclick={() => { void duplicateProject(project); }}
									loading={duplicatingProjectId === project.id}
								>
									{duplicatingProjectId === project.id ? 'Duplicating...' : 'Duplicate'}
								</Button>
								<Button
									variant="danger"
									size="sm"
									onclick={() => { void deleteProject(project); }}
									loading={deletingProjectId === project.id}
								>
									{deletingProjectId === project.id ? 'Deleting...' : 'Delete'}
								</Button>
							</div>
						</article>
					{/each}
				</div>
			{/if}
		</section>
	{/if}
</main>

<style>
	.page {
		display: grid;
		gap: var(--space-6);
	}

	.alert {
		margin: 0;
		padding: var(--space-4);
		border-radius: var(--radius-xl);
		background: var(--color-red-50);
		color: var(--color-red-700);
		border: 1px solid rgba(220, 38, 38, 0.14);
	}

	.quick-create-card,
	.projects-panel {
		display: grid;
		gap: var(--space-4);
		padding: var(--space-5);
		border-radius: 1.5rem;
		border: 1px solid var(--color-border);
		background: var(--color-bg-elevated);
		box-shadow: var(--shadow-sm);
	}

	.quick-create-card {
		background:
			radial-gradient(circle at top left, rgba(249, 115, 22, 0.08), transparent 32%),
			linear-gradient(180deg, rgba(255, 255, 255, 0.98), rgba(248, 250, 252, 0.98));
	}

	.section-head {
		display: grid;
		gap: 0.45rem;
	}

	.section-head--inline {
		grid-template-columns: minmax(0, 1fr) minmax(260px, 320px);
		align-items: end;
		gap: var(--space-4);
	}

	.section-kicker {
		margin: 0;
		font-size: 0.78rem;
		font-weight: 800;
		text-transform: uppercase;
		letter-spacing: 0.12em;
		color: var(--color-text-soft);
	}

	.section-head h2,
	.ai-panel-head h3,
	.project-title-row h3,
	.empty-card h4,
	.ai-suggestion-card h4 {
		margin: 0;
		font-family: var(--font-heading);
	}

	.section-copy {
		margin: 0;
		max-width: 62ch;
		color: var(--color-text-soft);
		line-height: 1.6;
	}

	.quick-create-grid,
	.advanced-grid {
		display: grid;
		grid-template-columns: minmax(0, 1.2fr) minmax(0, 1fr);
		gap: var(--space-4);
	}

	.field {
		display: grid;
		gap: 0.55rem;
	}

	.field--title {
		min-width: 0;
	}

	.field--full {
		grid-column: 1 / -1;
	}

	.field span {
		font-size: 0.82rem;
		font-weight: 700;
		color: var(--color-text-soft);
	}

	.field input,
	.field textarea,
	.field select,
	.projects-panel input {
		width: 100%;
		padding: 0.85rem 1rem;
		border-radius: 0.95rem;
		border: 1px solid rgba(148, 163, 184, 0.28);
		background: #fff;
		font: inherit;
		color: var(--color-text);
	}

	.field input:focus,
	.field textarea:focus,
	.field select:focus,
	.projects-panel input:focus {
		outline: 0;
		border-color: rgba(37, 99, 235, 0.48);
		box-shadow: 0 0 0 3px rgba(59, 130, 246, 0.14);
	}

	.field small {
		color: var(--color-text-soft);
		line-height: 1.6;
	}

	.mode-row {
		display: grid;
		grid-template-columns: repeat(2, minmax(0, 1fr));
		gap: var(--space-3);
	}

	.mode-row button {
		display: grid;
		gap: 0.35rem;
		padding: var(--space-4);
		border-radius: 1rem;
		border: 1px solid rgba(148, 163, 184, 0.3);
		background: rgba(255, 255, 255, 0.88);
		text-align: left;
		cursor: pointer;
		transition:
			border-color 160ms ease,
			transform 160ms ease,
			box-shadow 160ms ease;
	}

	.mode-row button:hover,
	.project-row:hover,
	.preset-row button:hover {
		transform: translateY(-1px);
	}

	.mode-row button.selected {
		border-color: rgba(37, 99, 235, 0.45);
		background: rgba(219, 234, 254, 0.95);
		box-shadow: 0 0 0 3px rgba(59, 130, 246, 0.16);
	}

	.mode-row strong {
		font-family: var(--font-heading);
	}

	.mode-row strong,
	.mode-row small {
		margin: 0;
	}

	.mode-row small,
	.project-secondary,
	.project-meta,
	.ai-suggestion-card p {
		color: var(--color-text-soft);
		line-height: 1.6;
	}

	.quick-create-actions,
	.project-actions {
		display: flex;
		gap: var(--space-3);
		flex-wrap: wrap;
	}

	.advanced-panel {
		border-radius: 1.2rem;
		border: 1px solid rgba(148, 163, 184, 0.22);
		background: rgba(255, 255, 255, 0.88);
	}

	.advanced-panel summary {
		list-style: none;
		padding: var(--space-4);
		cursor: pointer;
	}

	.advanced-panel summary::-webkit-details-marker {
		display: none;
	}

	.advanced-panel summary div {
		display: grid;
		gap: 0.2rem;
	}

	.advanced-panel summary strong {
		font-family: var(--font-heading);
	}

	.advanced-panel summary span {
		color: var(--color-text-soft);
	}

	.advanced-body {
		display: grid;
		gap: var(--space-4);
		padding: 0 var(--space-4) var(--space-4);
	}

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

	.ai-panel-head p,
	.ai-panel-head h3,
	.project-secondary,
	.empty-card p,
	.ai-reason {
		margin: 0;
	}

	.preset-row {
		display: flex;
		flex-wrap: wrap;
		gap: 0.7rem;
	}

	.preset-row button,
	.suggestion-apply {
		border: 0;
		cursor: pointer;
		font: inherit;
	}

	.preset-row button {
		padding: 0.55rem 0.9rem;
		border-radius: 999px;
		background: rgba(226, 232, 240, 0.8);
		color: var(--color-text-soft);
	}

	.preset-row button.selected {
		background: rgba(37, 99, 235, 0.92);
		color: #fff;
	}

	.ai-error {
		margin: 0;
		padding: 0.9rem 1rem;
		border-radius: 0.9rem;
		background: rgba(254, 242, 242, 0.96);
		color: var(--color-red-700);
		border: 1px solid rgba(248, 113, 113, 0.22);
	}

	.loading-state {
		padding: var(--space-5);
		display: grid;
		place-items: center;
	}

	.ai-suggestion-list,
	.project-list {
		display: grid;
		gap: var(--space-3);
	}

	.ai-suggestion-card,
	.project-row,
	.empty-card {
		padding: var(--space-4);
		border-radius: 1rem;
		border: 1px solid rgba(148, 163, 184, 0.18);
		background: rgba(255, 255, 255, 0.95);
		box-shadow: var(--shadow-sm);
	}

	.ai-suggestion-card {
		display: grid;
		gap: 0.85rem;
	}

	.ai-chip-row,
	.project-badges {
		display: flex;
		flex-wrap: wrap;
		gap: 0.55rem;
	}

	.journey-pill {
		display: inline-flex;
		align-items: center;
		padding: 0.35rem 0.7rem;
		border-radius: 999px;
		font-size: 0.72rem;
		font-weight: 700;
	}

	.journey-pill--awareness {
		background: rgba(253, 230, 138, 0.35);
		color: #92400e;
	}

	.journey-pill--trust {
		background: rgba(147, 197, 253, 0.24);
		color: #1d4ed8;
	}

	.journey-pill--conversion {
		background: rgba(167, 243, 208, 0.32);
		color: #047857;
	}

	.suggestion-apply {
		padding: 0.45rem 0.8rem;
		border-radius: 999px;
		background: rgba(37, 99, 235, 0.1);
		color: var(--color-blue-700);
		font-weight: 700;
	}

	.ai-suggestion-meta,
	.ai-outline,
	.ai-cta {
		display: grid;
		gap: 0.4rem;
	}

	.ai-suggestion-meta p,
	.ai-cta {
		margin: 0;
	}

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
		color: var(--color-text-soft);
	}

	.project-row {
		display: grid;
		grid-template-columns: 56px minmax(0, 1fr) auto;
		gap: var(--space-4);
		align-items: center;
		transition: transform 160ms ease;
	}

	.project-thumb {
		width: 56px;
		height: 56px;
		border-radius: var(--radius-lg, 0.75rem);
		overflow: hidden;
		flex-shrink: 0;
		background: var(--color-slate-100, #f1f5f9);
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
		font-size: 1.25rem;
		font-weight: 700;
		color: var(--color-slate-400, #94a3b8);
	}

	.project-main {
		display: grid;
		gap: 0.5rem;
		min-width: 0;
	}

	.project-title-row {
		display: flex;
		justify-content: space-between;
		gap: var(--space-3);
		align-items: center;
		flex-wrap: wrap;
	}

	.project-secondary {
		line-clamp: 2;
		display: -webkit-box;
		overflow: hidden;
		-webkit-line-clamp: 2;
		-webkit-box-orient: vertical;
	}

	.project-meta {
		display: flex;
		flex-wrap: wrap;
		gap: 0.85rem;
		font-size: 0.85rem;
	}

	.empty-card p {
		margin-top: 0.35rem;
	}

	@media (max-width: 900px) {
		.section-head--inline,
		.quick-create-grid,
		.advanced-grid {
			grid-template-columns: 1fr;
		}

		.project-row {
			grid-template-columns: 56px minmax(0, 1fr);
		}

		.project-row .project-actions {
			grid-column: 1 / -1;
		}

		.ai-panel-head,
		.ai-suggestion-top,
		.project-actions {
			flex-direction: column;
			align-items: stretch;
		}
	}

	@media (max-width: 640px) {
		.mode-row {
			grid-template-columns: 1fr;
		}

		.quick-create-actions,
		.project-actions {
			flex-direction: column;
		}

		.quick-create-actions :global(button),
		.project-actions :global(a),
		.project-actions :global(button),
		.ai-panel-head :global(button) {
			width: 100%;
		}
	}
</style>
