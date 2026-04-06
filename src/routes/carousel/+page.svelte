<script lang="ts">
	import { goto } from '$app/navigation';
	import { onMount } from 'svelte';
	import { Badge, Button, PageHeader, Spinner, toast } from '$lib';
	import { carouselStatusLabel } from '$lib/carousel';
	import { CONTENT_CATEGORY_OPTIONS } from '$lib/media-plan';
	import { hasSupabaseConfig } from '$lib/supabase';
	import type { BacklogContentCategory, CarouselProjectRow, IdeaBacklogRow } from '$lib/types';

	let projects = $state<CarouselProjectRow[]>([]);
	let ideas = $state<IdeaBacklogRow[]>([]);
	let loadingProjects = $state(false);
	let loadingIdeas = $state(false);
	let search = $state('');
	let backlogSearch = $state('');
	let creatingBacklogId = $state<string | null>(null);
	let creatingStandalone = $state(false);
	let deletingProjectId = $state<string | null>(null);
	let newIdeaTitle = $state('');
	let newIdeaDescription = $state('');
	let newIdeaCategory = $state<BacklogContentCategory | ''>('');

	const projectMap = $derived(new Map(projects.map((project) => [project.backlog_id, project])));

	const filteredProjects = $derived.by(() => {
		const query = search.trim().toLowerCase();
		if (!query) return projects;
		return projects.filter((project) => {
			const projectTitle = (project.title ?? '').toLowerCase();
			const ideaTitle = (project.idea_backlog?.title ?? '').toLowerCase();
			const status = project.status.toLowerCase();
			return projectTitle.includes(query) || ideaTitle.includes(query) || status.includes(query);
		});
	});

	const recentIdeas = $derived.by(() => {
		const query = backlogSearch.trim().toLowerCase();
		return ideas.filter((idea) => {
			if (!query) return true;
			return (idea.title ?? '').toLowerCase().includes(query) || (idea.idea_code ?? '').toLowerCase().includes(query);
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

	async function loadIdeas() {
		loadingIdeas = true;
		try {
			const response = await fetch('/api/openclaw/ideas?limit=100');
			const body = await response.json();
			if (!response.ok) {
				toast.error(body.error ?? 'โหลด backlog ไม่สำเร็จ');
				return;
			}
			ideas = body as IdeaBacklogRow[];
		} catch {
			toast.error('โหลด backlog ไม่สำเร็จ');
		} finally {
			loadingIdeas = false;
		}
	}

	async function createOrOpenProject(backlogId: string) {
		creatingBacklogId = backlogId;
		try {
			const response = await fetch('/api/openclaw/carousels', {
				method: 'POST',
				headers: { 'Content-Type': 'application/json' },
				body: JSON.stringify({ backlog_id: backlogId })
			});
			const body = await response.json();
			if (!response.ok) {
				toast.error(body.error ?? 'สร้าง carousel project ไม่สำเร็จ');
				return;
			}
			await goto(`/carousel/${body.id}`);
		} catch {
			toast.error('สร้าง carousel project ไม่สำเร็จ');
		} finally {
			creatingBacklogId = null;
		}
	}

	async function createStandaloneProject() {
		const title = newIdeaTitle.trim();
		if (!title) {
			toast.error('ใส่ชื่อ idea ก่อนสร้าง Carousel');
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
					notes: 'Created from Carousel Studio'
				})
			});
			const body = await response.json();
			if (!response.ok) {
				toast.error(body.error ?? 'สร้าง Carousel idea ไม่สำเร็จ');
				return;
			}

			newIdeaTitle = '';
			newIdeaDescription = '';
			newIdeaCategory = '';
			await goto(`/carousel/${body.id}`);
		} catch {
			toast.error('สร้าง Carousel idea ไม่สำเร็จ');
		} finally {
			creatingStandalone = false;
		}
	}

	async function deleteProject(project: CarouselProjectRow) {
		const confirmed = window.confirm(
			`ลบ carousel project นี้ใช่ไหม?\n${project.title ?? project.idea_backlog?.title ?? project.id}\n\nระบบจะลบเฉพาะ project และ slides แต่จะไม่ลบ backlog idea ต้นทาง`
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
		await Promise.all([loadProjects(), loadIdeas()]);
	});
</script>

<main class="page">
	<PageHeader
		eyebrow="Instagram automation"
		title="Carousel Studio"
		subtitle="เปลี่ยน idea backlog ให้กลายเป็น Instagram carousel พร้อม asset, caption และ export package"
	>
		{#snippet actions()}
			<Button variant="secondary" onclick={() => { void loadProjects(); }} loading={loadingProjects}>
				Refresh
			</Button>
			<Button variant="primary" href="/">Open Backlog</Button>
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
					v1 นี้ให้ <strong>Carousel Studio</strong> เป็น entry point ได้เลย สร้าง idea ใหม่จากหน้านี้ได้ทันที และยังผูกกับ
					<code>idea_backlog</code> เบื้องหลังเพื่อให้ระบบเดิมยังทำงานต่อได้
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
						<p>เริ่มจาก backlog ด้านขวา แล้วกด Create / Open เพื่อเปิด Studio ครั้งแรก</p>
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
								<p class="project-idea">{project.idea_backlog?.title ?? 'No linked backlog title'}</p>
								<p class="project-caption">{project.caption ?? 'ยังไม่มี caption'}</p>
								<div class="project-meta">
									<span>{project.slide_count} slides</span>
									<span>Generated {formatDate(project.last_generated_at)}</span>
								</div>
								<div class="project-actions">
									<Button variant="primary" href={`/carousel/${project.id}`}>Open Studio</Button>
									<Button variant="ghost" href={`/?edit=${project.backlog_id}`}>Open Idea</Button>
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
					</div>
				</div>

				<div class="create-card">
					<label>
						<span>Idea title</span>
						<input bind:value={newIdeaTitle} placeholder="เช่น 5 ความผิดพลาดเวลาเข้าเทรดทอง" />
					</label>

					<label>
						<span>Description</span>
						<textarea bind:value={newIdeaDescription} rows={4} placeholder="สรุป angle ของ carousel แบบสั้นๆ"></textarea>
					</label>

					<label>
						<span>Category</span>
						<select bind:value={newIdeaCategory}>
							{#each CONTENT_CATEGORY_OPTIONS as option}
								<option value={option.value}>{option.label}</option>
							{/each}
						</select>
					</label>

					<Button variant="primary" onclick={() => { void createStandaloneProject(); }} loading={creatingStandalone}>
						{creatingStandalone ? 'Creating...' : 'Create Carousel Idea'}
					</Button>
				</div>

				<div class="panel-head panel-head--sub">
					<div>
						<p class="panel-kicker">Import existing</p>
						<h3>Use backlog item</h3>
					</div>
					<input bind:value={backlogSearch} placeholder="ค้นหา idea..." />
				</div>

				{#if loadingIdeas}
					<div class="loading-state">
						<Spinner label="Loading backlog..." />
					</div>
				{:else}
					<div class="idea-list">
						{#each recentIdeas as idea}
							<div class="idea-row">
								<div class="idea-row-copy">
									<Badge variant="platform" value={idea.platform} size="sm" />
									<strong>{idea.title ?? 'Untitled idea'}</strong>
									<span>{idea.content_category ?? 'uncategorized'} · {idea.idea_code}</span>
								</div>
								<Button
									variant={projectMap.has(idea.id) ? 'secondary' : 'primary'}
									size="sm"
									onclick={() => { void createOrOpenProject(idea.id); }}
									loading={creatingBacklogId === idea.id}
								>
									{projectMap.has(idea.id) ? 'Open' : 'Import'}
								</Button>
							</div>
						{/each}
					</div>
				{/if}
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

	.panel-head--sub {
		padding-top: var(--space-2);
		border-top: 1px solid var(--color-border);
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

	.create-card span {
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

	.project-grid,
	.idea-list {
		display: grid;
		gap: var(--space-3);
	}

	.project-card,
	.empty-card,
	.idea-row {
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
	.project-actions,
	.idea-row {
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

	.project-idea,
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

	.idea-row {
		padding: 0.9rem 1rem;
	}

	.idea-row-copy {
		display: grid;
		gap: 0.2rem;
	}

	.idea-row-copy strong,
	.idea-row-copy span {
		display: block;
	}

	.idea-row-copy strong {
		font-size: 0.95rem;
		color: var(--color-slate-900);
	}

	.idea-row-copy span {
		font-size: 0.76rem;
		color: var(--color-slate-500);
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
	}
</style>
