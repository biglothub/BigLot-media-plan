<script lang="ts">
	import { goto } from '$app/navigation';
	import { onMount } from 'svelte';
	import { Badge, Button, PageHeader, Spinner, toast } from '$lib';
	import { carouselStatusLabel } from '$lib/carousel';
	import { CONTENT_CATEGORY_OPTIONS } from '$lib/media-plan';
	import { hasSupabaseConfig } from '$lib/supabase';
	import type {
		AIIdeaSuggestion,
		BacklogContentCategory,
		CarouselProjectRow,
		ContentJourneyStage
	} from '$lib/types';

	let projects = $state<CarouselProjectRow[]>([]);
	let loadingProjects = $state(false);
	let search = $state('');
	let creatingStandalone = $state(false);
	let deletingProjectId = $state<string | null>(null);
	let newIdeaTitle = $state('');
	let newIdeaDescription = $state('');
	let newIdeaNotes = $state('');
	let newIdeaCategory = $state<BacklogContentCategory | ''>('');
	let aiSuggestLoading = $state(false);
	let aiSuggestError = $state('');
	let aiSuggestions = $state<AIIdeaSuggestion[]>([]);
	let aiCustomPrompt = $state('');
	let activeAiPreset = $state('');

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

	const carouselCategoryOptions = CONTENT_CATEGORY_OPTIONS.filter((option) => option.value !== 'pin');
	const activeAiPresetPrompt = $derived(AI_IDEA_FOCUS_PRESETS.find((preset) => preset.id === activeAiPreset)?.prompt ?? '');

	const filteredProjects = $derived.by(() => {
		const query = search.trim().toLowerCase();
		if (!query) return projects;
		return projects.filter((project) => {
			const projectTitle = (project.title ?? '').toLowerCase();
			const caption = (project.caption ?? '').toLowerCase();
			const visualDirection = (project.visual_direction ?? '').toLowerCase();
			const status = project.status.toLowerCase();
			return (
				projectTitle.includes(query) ||
				caption.includes(query) ||
				visualDirection.includes(query) ||
				status.includes(query)
			);
		});
	});

	const stats = $derived({
		total: projects.length,
		ready: projects.filter((project) => project.status === 'ready').length,
		exported: projects.filter((project) => project.status === 'exported').length,
		draft: projects.filter((project) => project.status === 'draft').length
	});

	function badgeVariant(status: CarouselProjectRow['status']): 'warning' | 'success' | 'info' | 'neutral' {
		if (status === 'ready') return 'success';
		if (status === 'exported') return 'info';
		if (status === 'draft') return 'warning';
		return 'neutral';
	}

	function formatDate(value: string | null): string {
		if (!value) return 'ยังไม่เคย generate';
		return new Date(value).toLocaleString('th-TH', {
			dateStyle: 'medium',
			timeStyle: 'short'
		});
	}

	function focusIdeaTitleInput() {
		requestAnimationFrame(() => {
			const input = document.getElementById('carousel-idea-title') as HTMLInputElement | null;
			input?.focus();
			input?.select();
		});
	}

	function buildSuggestionNotes(suggestion: AIIdeaSuggestion): string {
		const lines = [
			'AI Carousel Brief',
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
			const response = await fetch('/api/openclaw/ai/suggest-ideas', {
				method: 'POST',
				headers: { 'Content-Type': 'application/json' },
				body: JSON.stringify({
					useCase: 'carousel_studio',
					prompt: prompt || undefined,
					count: 4
				})
			});
			const body = await response.json();
			if (!response.ok) {
				aiSuggestError = body.error ?? 'สร้าง trading ideas ไม่สำเร็จ';
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
		try {
			const response = await fetch('/api/openclaw/carousels');
			const body = await response.json();
			if (!response.ok) {
				toast.error(body.error ?? 'โหลด carousel projects ไม่สำเร็จ');
				return;
			}
			projects = body as CarouselProjectRow[];
		} catch {
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

	onMount(async () => {
		await loadProjects();
	});
</script>

<main class="page">
	<PageHeader
		eyebrow="Instagram automation"
		title="Carousel Studio"
		subtitle="สร้าง Instagram carousel project พร้อม asset, caption และ export package"
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
		<section class="hero">
			<div class="hero-copy">
				<p class="hero-kicker">Instagram-first workflow</p>
				<h2>AI draft, Pexels asset search, แล้วค่อย export เป็น package พร้อมโพสต์</h2>
				<p>
					หน้านี้เป็น entry point สำหรับ <strong>Carousel Studio</strong> โดยตรง สร้าง project ใหม่ได้เลยแล้วค่อยเข้า
					studio ไปจัดการ draft, asset และ export ต่อใน workflow ของ carousel เอง
				</p>
			</div>

			<div class="hero-stats">
				<div class="stat-card">
					<span>Total</span>
					<strong>{stats.total}</strong>
				</div>
				<div class="stat-card">
					<span>Ready</span>
					<strong>{stats.ready}</strong>
				</div>
				<div class="stat-card">
					<span>Exported</span>
					<strong>{stats.exported}</strong>
				</div>
				<div class="stat-card">
					<span>Draft</span>
					<strong>{stats.draft}</strong>
				</div>
			</div>
		</section>

		<div class="workspace">
			<section class="projects-panel">
				<div class="panel-head">
					<div>
						<p class="panel-kicker">Projects</p>
						<h3>Carousel projects</h3>
					</div>
					<input bind:value={search} placeholder="ค้นหา project หรือ status..." />
				</div>

				{#if loadingProjects}
					<div class="loading-state">
						<Spinner label="Loading carousel projects..." />
					</div>
				{:else if filteredProjects.length === 0}
					<div class="empty-card">
						<h4>ยังไม่มี carousel project</h4>
						<p>เริ่มจากสร้าง project ใหม่ด้านขวา แล้วกด Create Carousel Project เพื่อเปิด Studio ครั้งแรก</p>
					</div>
				{:else}
					<div class="project-grid">
						{#each filteredProjects as project}
							<article class="project-card">
								<div class="project-top">
									<Badge variant={badgeVariant(project.status)} label={carouselStatusLabel[project.status]} />
									<Badge variant="platform" value="instagram" />
								</div>
								<h4>{project.title ?? 'Untitled carousel'}</h4>
								<p class="project-caption">{project.caption ?? project.visual_direction ?? 'ยังไม่มี caption หรือ visual direction'}</p>
								<div class="project-meta">
									<span>{project.slide_count} slides</span>
									<span>Generated {formatDate(project.last_generated_at)}</span>
								</div>
								<div class="project-actions">
									<Button variant="primary" href={`/carousel/${project.id}`}>Open Studio</Button>
									<Button
										variant="danger"
										size="sm"
										onclick={() => { void deleteProject(project); }}
										loading={deletingProjectId === project.id}
									>
										{deletingProjectId === project.id ? 'Deleting...' : 'Delete Project'}
									</Button>
								</div>
							</article>
						{/each}
					</div>
				{/if}
			</section>

			<aside class="ideas-panel">
				<div class="panel-head">
					<div>
						<p class="panel-kicker">Studio entry point</p>
						<h3>Create idea here</h3>
						<p class="panel-copy">ให้ AI ช่วยตั้งต้นไอเดียที่เกี่ยวกับการเทรด แล้วค่อยแตกต่อเป็น carousel brief ก่อนเข้า Studio</p>
					</div>
				</div>

				<div class="create-card">
					<section class="ai-assist">
						<div class="ai-assist-head">
							<div class="ai-assist-copy">
								<p class="create-kicker">Trading AI Assist</p>
								<h4>กดครั้งเดียวแล้วได้ idea แบบ carousel-ready</h4>
								<p>ระบบจะคิดหัวข้อให้พร้อม hook, audience, slide flow และ CTA ที่เหมาะกับ XAUUSD / IB funnel</p>
							</div>

							<Button
								variant="secondary"
								class="ai-trigger"
								onclick={() => { void suggestTradingIdeas(); }}
								loading={aiSuggestLoading}
							>
								{aiSuggestLoading ? 'กำลังคิด...' : 'AI คิดให้'}
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

						<label class="ai-prompt">
							<span>โจทย์เพิ่ม (optional)</span>
							<textarea
								bind:value={aiCustomPrompt}
								rows={3}
								placeholder="เช่น อยากได้ content สำหรับมือใหม่ที่ชอบ overtrade ตอนทองวิ่งแรง"
							></textarea>
						</label>

						{#if aiSuggestError}
							<p class="ai-error">{aiSuggestError}</p>
						{/if}

						{#if aiSuggestLoading}
							<div class="ai-loading">
								<Spinner label="AI กำลังร่าง trading ideas..." />
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

					<div class="create-divider"></div>

					<label>
						<span>Idea title</span>
						<input
							id="carousel-idea-title"
							bind:value={newIdeaTitle}
							placeholder="เช่น 5 ความผิดพลาดเวลาเข้าเทรดทอง"
						/>
					</label>

					<label>
						<span>Description</span>
						<textarea bind:value={newIdeaDescription} rows={4} placeholder="สรุป angle ของ carousel แบบสั้นๆ"></textarea>
					</label>

					<label>
						<span>Category</span>
						<select bind:value={newIdeaCategory}>
							{#each carouselCategoryOptions as option}
								<option value={option.value}>{option.label}</option>
							{/each}
						</select>
					</label>

					<label>
						<span>Studio brief</span>
						<textarea
							bind:value={newIdeaNotes}
							rows={7}
							placeholder="ใส่ hook, audience, slide flow, CTA หรือใช้ AI ช่วยเติมให้"
						></textarea>
						<small>brief นี้จะถูกเก็บใน backlog notes และส่งต่อให้ AI ตอน generate carousel</small>
					</label>

					<div class="create-actions">
						<Button variant="primary" onclick={() => { void createStandaloneProject(); }} loading={creatingStandalone}>
							{creatingStandalone ? 'Creating...' : 'Create Carousel Project'}
						</Button>
						<Button variant="ghost" onclick={resetIdeaDraft}>Clear</Button>
					</div>
				</div>
			</aside>
		</div>
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

	.hero {
		display: grid;
		grid-template-columns: minmax(0, 1.4fr) minmax(280px, 0.9fr);
		gap: var(--space-5);
		padding: var(--space-6);
		border-radius: 1.75rem;
		background:
			radial-gradient(circle at top left, rgba(249, 115, 22, 0.18), transparent 38%),
			radial-gradient(circle at bottom right, rgba(225, 48, 108, 0.16), transparent 28%),
			linear-gradient(145deg, #0f172a 0%, #1d4ed8 100%);
		color: #fff;
		box-shadow: var(--shadow-lg);
	}

	.hero-copy {
		display: grid;
		gap: 0.9rem;
	}

	.hero-kicker,
	.panel-kicker {
		margin: 0;
		font-size: 0.78rem;
		font-weight: 800;
		text-transform: uppercase;
		letter-spacing: 0.12em;
	}

	.hero h2,
	.panel-head h3 {
		margin: 0;
		font-family: var(--font-heading);
	}

	.hero h2 {
		font-size: clamp(1.8rem, 4vw, 2.7rem);
		line-height: 1.05;
		max-width: 14ch;
	}

	.hero p {
		margin: 0;
		color: rgba(255, 255, 255, 0.86);
		line-height: 1.65;
		max-width: 62ch;
	}

	.hero-stats {
		display: grid;
		grid-template-columns: repeat(2, minmax(0, 1fr));
		gap: var(--space-3);
		align-content: start;
	}

	.stat-card {
		display: grid;
		gap: 0.35rem;
		padding: var(--space-4);
		border-radius: 1.2rem;
		background: rgba(255, 255, 255, 0.12);
		backdrop-filter: blur(12px);
		border: 1px solid rgba(255, 255, 255, 0.14);
	}

	.stat-card span {
		font-size: 0.76rem;
		text-transform: uppercase;
		letter-spacing: 0.12em;
		color: rgba(255, 255, 255, 0.72);
	}

	.stat-card strong {
		font-family: var(--font-heading);
		font-size: 1.6rem;
	}

	.workspace {
		display: grid;
		grid-template-columns: minmax(0, 1.35fr) minmax(320px, 0.85fr);
		gap: var(--space-5);
		align-items: start;
	}

	.projects-panel,
	.ideas-panel {
		display: grid;
		gap: var(--space-4);
		padding: var(--space-5);
		border-radius: 1.5rem;
		border: 1px solid var(--color-border);
		background: var(--color-bg-elevated);
		box-shadow: var(--shadow-sm);
	}

	.create-card {
		display: grid;
		gap: var(--space-3);
		padding: var(--space-4);
		border-radius: 1.2rem;
		border: 1px solid rgba(79, 70, 229, 0.14);
		background:
			radial-gradient(circle at top left, rgba(249, 115, 22, 0.08), transparent 38%),
			linear-gradient(180deg, rgba(238, 242, 255, 0.88), rgba(255, 255, 255, 0.96));
	}

	.panel-head {
		display: grid;
		gap: var(--space-3);
	}

	.panel-copy {
		margin: 0.55rem 0 0;
		color: var(--color-slate-600);
		line-height: 1.6;
		max-width: 34ch;
	}

	.panel-head input {
		width: 100%;
		box-sizing: border-box;
		padding: 0.8rem 0.95rem;
		border-radius: 0.95rem;
		border: 1px solid var(--color-border-strong);
		font: inherit;
	}

	.create-card label {
		display: grid;
		gap: 0.45rem;
	}

	.create-card label > span,
	.ai-prompt > span {
		font-size: 0.76rem;
		font-weight: 800;
		text-transform: uppercase;
		letter-spacing: 0.12em;
		color: var(--color-slate-500);
	}

	.create-card textarea,
	.create-card select,
	.create-card input {
		width: 100%;
		box-sizing: border-box;
		padding: 0.82rem 0.95rem;
		border-radius: 0.95rem;
		border: 1px solid var(--color-border-strong);
		background: var(--color-bg-elevated);
		font: inherit;
	}

	.ai-assist {
		display: grid;
		gap: var(--space-3);
		padding: var(--space-4);
		border-radius: 1rem;
		background:
			radial-gradient(circle at top left, rgba(249, 115, 22, 0.12), transparent 32%),
			linear-gradient(180deg, rgba(255, 255, 255, 0.84), rgba(255, 255, 255, 0.68));
		border: 1px solid rgba(251, 146, 60, 0.18);
	}

	.ai-assist-head {
		display: grid;
		grid-template-columns: minmax(0, 1fr) auto;
		gap: var(--space-3);
		align-items: end;
	}

	.ai-assist-copy {
		display: grid;
		gap: 0.45rem;
	}

	.create-kicker {
		margin: 0;
		font-size: 0.72rem;
		font-weight: 900;
		text-transform: uppercase;
		letter-spacing: 0.16em;
		color: var(--color-orange-600);
	}

	.ai-assist-copy h4,
	.ai-suggestion-card h4 {
		margin: 0;
		font-family: var(--font-heading);
	}

	.ai-assist-copy p {
		margin: 0;
		color: var(--color-slate-600);
		line-height: 1.6;
	}

	:global(.ai-trigger) {
		background: linear-gradient(135deg, #0f172a, #1d4ed8);
		color: #fff;
		border-color: transparent;
		box-shadow: 0 14px 28px rgba(15, 23, 42, 0.14);
	}

	:global(.ai-trigger:hover:not(:disabled)) {
		background: linear-gradient(135deg, #111827, #1e40af);
		border-color: transparent;
	}

	.preset-row {
		display: flex;
		flex-wrap: wrap;
		gap: 0.55rem;
	}

	.preset-row button {
		border: 1px solid rgba(148, 163, 184, 0.28);
		background: rgba(255, 255, 255, 0.84);
		color: var(--color-slate-700);
		padding: 0.48rem 0.8rem;
		border-radius: 999px;
		font: inherit;
		font-size: 0.82rem;
		font-weight: 700;
		cursor: pointer;
		transition:
			background var(--transition-fast),
			border-color var(--transition-fast),
			color var(--transition-fast),
			transform var(--transition-fast);
	}

	.preset-row button:hover,
	.preset-row button.selected {
		background: rgba(29, 78, 216, 0.08);
		border-color: rgba(29, 78, 216, 0.24);
		color: var(--color-blue-700);
		transform: translateY(-1px);
	}

	.ai-error {
		margin: 0;
		padding: 0.8rem 0.95rem;
		border-radius: 0.9rem;
		background: #fff1f2;
		border: 1px solid rgba(225, 29, 72, 0.14);
		color: #be123c;
		font-size: 0.92rem;
	}

	.ai-loading {
		display: flex;
		justify-content: center;
		padding: var(--space-3) 0;
	}

	.ai-suggestion-list {
		display: grid;
		gap: 0.9rem;
	}

	.ai-suggestion-card {
		display: grid;
		gap: 0.8rem;
		padding: 1rem;
		border-radius: 1rem;
		background: rgba(255, 255, 255, 0.92);
		border: 1px solid rgba(148, 163, 184, 0.18);
		box-shadow: 0 14px 30px rgba(15, 23, 42, 0.05);
	}

	.ai-suggestion-top {
		display: flex;
		gap: var(--space-2);
		align-items: flex-start;
		justify-content: space-between;
		flex-wrap: wrap;
	}

	.ai-chip-row {
		display: flex;
		gap: 0.45rem;
		flex-wrap: wrap;
	}

	.journey-pill {
		display: inline-flex;
		align-items: center;
		padding: 0.28rem 0.62rem;
		border-radius: 999px;
		font-size: 0.7rem;
		font-weight: 800;
		letter-spacing: 0.08em;
		text-transform: uppercase;
		border: 1px solid transparent;
	}

	.journey-pill--awareness {
		background: rgba(249, 115, 22, 0.12);
		color: #c2410c;
		border-color: rgba(249, 115, 22, 0.18);
	}

	.journey-pill--trust {
		background: rgba(22, 163, 74, 0.12);
		color: #15803d;
		border-color: rgba(22, 163, 74, 0.18);
	}

	.journey-pill--conversion {
		background: rgba(29, 78, 216, 0.1);
		color: #1d4ed8;
		border-color: rgba(29, 78, 216, 0.18);
	}

	.suggestion-apply {
		border: 0;
		border-radius: 999px;
		padding: 0.5rem 0.8rem;
		background: #0f172a;
		color: #fff;
		font: inherit;
		font-size: 0.82rem;
		font-weight: 800;
		cursor: pointer;
	}

	.ai-suggestion-desc,
	.ai-reason,
	.ai-cta,
	.ai-outline ol,
	.ai-suggestion-meta p {
		margin: 0;
		color: var(--color-slate-600);
		line-height: 1.6;
	}

	.ai-suggestion-meta {
		display: grid;
		gap: 0.45rem;
	}

	.ai-suggestion-meta p {
		display: grid;
		gap: 0.18rem;
	}

	.ai-suggestion-meta strong,
	.ai-outline strong,
	.ai-cta strong {
		font-size: 0.78rem;
		text-transform: uppercase;
		letter-spacing: 0.12em;
		color: var(--color-slate-500);
	}

	.ai-outline {
		display: grid;
		gap: 0.45rem;
		padding: 0.85rem 0.95rem;
		border-radius: 0.9rem;
		background: rgba(241, 245, 249, 0.78);
	}

	.ai-outline ol {
		padding-left: 1.1rem;
	}

	.ai-outline li + li {
		margin-top: 0.25rem;
	}

	.ai-reason {
		padding-top: 0.75rem;
		border-top: 1px solid rgba(148, 163, 184, 0.18);
	}

	.create-divider {
		height: 1px;
		background: linear-gradient(90deg, rgba(148, 163, 184, 0.1), rgba(148, 163, 184, 0.48), rgba(148, 163, 184, 0.1));
	}

	.create-card small {
		color: var(--color-slate-500);
		line-height: 1.55;
	}

	.create-actions {
		display: flex;
		gap: var(--space-2);
		flex-wrap: wrap;
	}

	.project-grid {
		display: grid;
		gap: var(--space-3);
	}

	.project-card,
	.empty-card {
		border-radius: 1.2rem;
		border: 1px solid var(--color-border);
		background: var(--color-bg);
	}

	.project-card {
		display: grid;
		gap: 0.8rem;
		padding: var(--space-4);
	}

	.project-top,
	.project-meta,
	.project-actions {
		display: flex;
		gap: var(--space-2);
		align-items: center;
		justify-content: space-between;
		flex-wrap: wrap;
	}

	.project-card h4,
	.empty-card h4 {
		margin: 0;
		font-size: 1.15rem;
		font-family: var(--font-heading);
	}

	.project-caption,
	.empty-card p {
		margin: 0;
		color: var(--color-slate-600);
		line-height: 1.55;
	}

	.project-caption {
		display: -webkit-box;
		line-clamp: 3;
		-webkit-line-clamp: 3;
		-webkit-box-orient: vertical;
		overflow: hidden;
	}

	.project-meta {
		font-size: 0.8rem;
		color: var(--color-slate-500);
	}

	.empty-card {
		padding: var(--space-5);
	}

	.loading-state {
		display: flex;
		justify-content: center;
		padding: var(--space-8) 0;
	}

	@media (max-width: 960px) {
		.hero,
		.workspace {
			grid-template-columns: 1fr;
		}

		.ai-assist-head {
			grid-template-columns: 1fr;
		}

		.ai-suggestion-top {
			flex-direction: column;
		}
	}
</style>
