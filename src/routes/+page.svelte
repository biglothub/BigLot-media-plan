<script lang="ts">
	import { onMount } from "svelte";
	import { Button, Spinner, Badge, toast, StatsCard, IdeaCard } from '$lib';
	import { goto } from '$app/navigation';
	import { page } from '$app/state';
	import { hasSupabaseConfig, supabase } from "$lib/supabase";
	import type {
		BacklogContentCategory,
		BacklogContentType,
		EnrichResult,
		IdeaBacklogRow,
		ProductionCalendarRow,
		SupportedPlatform,
	} from "$lib/types";
	import {
		backlogCode,
		CONTENT_CATEGORY_OPTIONS,
		CONTENT_CATEGORY_ORDER,
		CONTENT_TYPE_OPTIONS,
		contentCategoryLabel,
		contentTypeLabel,
		fromCategorySelectValue,
		getInstagramEmbedUrl,
		getTikTokEmbedUrl,
		getYouTubeEmbedUrl,
		platformLabel,
		platformOrder,
		PRODUCTION_STAGES,
		toCategorySelectValue,
	} from "$lib/media-plan";
	import IdeaEditModal from '$lib/components/domain/IdeaEditModal.svelte';
	import AISuggestModal from '$lib/components/domain/AISuggestModal.svelte';

	type SuggestedContentCategory = Exclude<BacklogContentCategory, "pin">;
	type IdeaGroup = {
		key: string;
		label: string;
		items: IdeaBacklogRow[];
	};

	let linkInput = $state("");
	let notes = $state("");
	let loadingIdeas = $state(false);
	let enriching = $state(false);
	let saving = $state(false);
	let deletingId = $state<string | null>(null);
	let draft = $state<EnrichResult | null>(null);
	let ideas = $state<IdeaBacklogRow[]>([]);
	let scheduledCalendarMap = $state<Map<string, ProductionCalendarRow>>(new Map());
	const scheduledBacklogIds = $derived(new Set(scheduledCalendarMap.keys()));
	const publishedBacklogIds = $derived(
		new Set([...scheduledCalendarMap.entries()]
			.filter(([, v]) => v.status === 'published')
			.map(([k]) => k))
	);

	const dashboardStats = $derived.by(() => {
		const platformCount: Record<string, number> = {};
		let uncategorizedIdeas = 0;
		let pinnedIdeas = 0;
		for (const idea of ideas) {
			platformCount[idea.platform] = (platformCount[idea.platform] ?? 0) + 1;
			if (!idea.content_category) uncategorizedIdeas += 1;
			if (idea.content_category === 'pin') pinnedIdeas += 1;
		}
		const stageCount: Record<string, number> = { planned: 0, scripting: 0, shooting: 0, editing: 0, review: 0, published: 0 };
		for (const { status } of scheduledCalendarMap.values()) {
			if (status in stageCount) stageCount[status]++;
		}
		const scheduledIdeas = scheduledBacklogIds.size;
		const publishedIdeas = publishedBacklogIds.size;
		const activeIdeas = Math.max(ideas.length - publishedIdeas, 0);
		return {
			platformCount,
			stageCount,
			totalIdeas: ideas.length,
			activeIdeas,
			publishedIdeas,
			scheduledIdeas,
			uncategorizedIdeas,
			pinnedIdeas,
		};
	});
	const scheduledPercent = $derived(
		dashboardStats.totalIdeas > 0
			? Math.round((dashboardStats.scheduledIdeas / dashboardStats.totalIdeas) * 100)
			: 0,
	);
	const platformBreakdown = $derived(
		platformOrder
			.map((platform) => ({
				platform,
				count: dashboardStats.platformCount[platform] ?? 0,
			}))
			.filter((item) => item.count > 0),
	);
	const maxPlatformCount = $derived(
		platformBreakdown.length > 0
			? Math.max(...platformBreakdown.map((item) => item.count))
			: 1,
	);
	let selectedContentType = $state<BacklogContentType>("video");
	let showPublished = $state(false);

	// Context menu state
	const CONTEXT_MENU_WIDTH = 260;
	const CONTEXT_MENU_ESTIMATED_HEIGHT = 240;
	const CONTEXT_MENU_VIEWPORT_PADDING = 12;
	let contextMenuIdea = $state<IdeaBacklogRow | null>(null);
	let contextMenuX = $state(0);
	let contextMenuY = $state(0);
	let contextMenuVisible = $state(false);
	let scheduleDate = $state("");
	let scheduling = $state(false);

	let showSuggestModeModal = $state(false);

	// AI Auto-categorize state
	let suggestedCategory = $state<SuggestedContentCategory | null>(null);
	let selectedCategory = $state<BacklogContentCategory | "">("");

	let manualExpanded = $state(false);
	let manualPlatform = $state<SupportedPlatform>("youtube");
	let manualContentType = $state<BacklogContentType>("video");
	let manualCategory = $state<BacklogContentCategory | "">("");
	let manualTitle = $state("");
	let manualDescription = $state("");
	let manualNotes = $state("");
	let metrics = $state({
		views: null as number | null,
		likes: null as number | null,
		comments: null as number | null,
		shares: null as number | null,
		saves: null as number | null,
	});
	let manualMetrics = $state({
		views: null as number | null,
		likes: null as number | null,
		comments: null as number | null,
		shares: null as number | null,
		saves: null as number | null,
	});

	// Edit modal state
	let editingIdea = $state<IdeaBacklogRow | null>(null);

	const groupedIdeas = $derived.by(() => {
		const categorizedGroups = new Map<BacklogContentCategory, IdeaBacklogRow[]>();
		const uncategorizedGroups = new Map<SupportedPlatform, IdeaBacklogRow[]>();

		for (const idea of ideas) {
			if (!showPublished && publishedBacklogIds.has(idea.id)) continue;

			if (idea.content_category) {
				const bucket = categorizedGroups.get(idea.content_category) ?? [];
				bucket.push(idea);
				categorizedGroups.set(idea.content_category, bucket);
				continue;
			}

			const bucket = uncategorizedGroups.get(idea.platform) ?? [];
			bucket.push(idea);
			uncategorizedGroups.set(idea.platform, bucket);
		}

		const groups: IdeaGroup[] = [
			...CONTENT_CATEGORY_ORDER.map((category) => ({
				key: category,
				label: contentCategoryLabel[category],
				items: categorizedGroups.get(category) ?? [],
			})),
			...platformOrder.map((platform) => ({
				key: `uncategorized-${platform}`,
				label: `Uncategorized - ${platformLabel[platform]}`,
				items: uncategorizedGroups.get(platform) ?? [],
			})),
		];

		return groups.filter((group) => group.items.length > 0);
	});

	const draftTikTokEmbedUrl = $derived(
		draft && draft.platform === "tiktok"
			? getTikTokEmbedUrl(draft.url)
			: null,
	);

	const draftInstagramEmbedUrl = $derived(
		draft && draft.platform === "instagram"
			? getInstagramEmbedUrl(draft.url)
			: null,
	);

	const draftYouTubeEmbedUrl = $derived(
		draft && draft.platform === "youtube"
			? getYouTubeEmbedUrl(draft.url)
			: null,
	);
	const platformOptions = platformOrder as readonly SupportedPlatform[];


	function scrollToTop() {
		window.scrollTo({ top: 0, behavior: "smooth" });
	}

	function focusAnalyzeInput() {
		scrollToTop();
		requestAnimationFrame(() => {
			const input = document.getElementById('content-link') as HTMLInputElement | null;
			input?.focus();
			input?.select();
		});
	}

	function clearState() {
		draft = null;
		notes = "";
		selectedContentType = "video";
		suggestedCategory = null;
		selectedCategory = "";
		metrics = {
			views: null,
			likes: null,
			comments: null,
			shares: null,
			saves: null,
		};
	}

	function clearManualState() {
		manualPlatform = "youtube";
		manualContentType = "video";
		manualCategory = "";
		manualTitle = "";
		manualDescription = "";
		manualNotes = "";
		manualMetrics = {
			views: null,
			likes: null,
			comments: null,
			shares: null,
			saves: null,
		};
	}

	function normalizeOptionalText(value: string): string | null {
		const normalized = value.trim();
		return normalized ? normalized : null;
	}

	function buildEditUrl(backlogId: string | null): URL {
		const nextUrl = new URL(page.url);
		if (backlogId) {
			nextUrl.searchParams.set('edit', backlogId);
		} else {
			nextUrl.searchParams.delete('edit');
		}
		return nextUrl;
	}

	async function loadIdeas() {
		if (!supabase) return;
		loadingIdeas = true;

		const { data, error } = await supabase
			.from("idea_backlog")
			.select("*")
			.order("created_at", { ascending: false });

		loadingIdeas = false;

		if (error) {
			toast.error(`โหลด backlog ไม่ได้: ${error.message}`);
			return;
		}

		ideas = (data ?? []) as IdeaBacklogRow[];
	}

	async function loadScheduledBacklogIds() {
		if (!supabase) return;

		const { data, error } = await supabase
			.from("production_calendar")
			.select("id, backlog_id, shoot_date, publish_deadline, status, revision_count, approval_status, submitted_at, notes, created_at, calendar_assignments(*)");
		if (error) {
			toast.error(`โหลดสถานะ schedule ไม่ได้: ${error.message}`);
			return;
		}

		scheduledCalendarMap = new Map(
			(data ?? []).map((item) => {
				const row = item as Record<string, unknown>;
				return [
					row.backlog_id as string,
					{
						...row,
						calendar_assignments: Array.isArray(row.calendar_assignments) ? row.calendar_assignments : [],
					} as ProductionCalendarRow,
				];
			}),
		);
	}

	async function analyzeLink() {
		clearState();

		if (!linkInput.trim()) {
			toast.error("กรุณาวางลิงก์ก่อน");
			return;
		}

		enriching = true;
		try {
			const response = await fetch(
				`/api/enrich?url=${encodeURIComponent(linkInput.trim())}`,
			);
			const body = await response.json();

			if (!response.ok) {
				toast.error(body.error ?? "อ่านข้อมูลจากลิงก์ไม่สำเร็จ");
				return;
			}

			draft = body as EnrichResult;
			selectedContentType = draft.contentType ?? "video";
			metrics = {
				views: draft.metrics.views,
				likes: draft.metrics.likes,
				comments: draft.metrics.comments,
				shares: draft.metrics.shares,
				saves: draft.metrics.saves,
			};
			toast.success("ดึงข้อมูลสำเร็จแล้ว ตรวจค่า engagement ก่อนบันทึกได้เลย");

			// Auto-categorize in background (fire-and-forget, ไม่ block UI)
			suggestedCategory = null;
			selectedCategory = "";
			fetch('/api/openclaw/ai/categorize', {
				method: 'POST',
				headers: { 'Content-Type': 'application/json' },
				body: JSON.stringify({
					title: draft.title,
					description: draft.description,
					platform: draft.platform,
				}),
			}).then(r => r.json()).then(data => {
				if (data.content_category) {
					suggestedCategory = data.content_category;
					selectedCategory = data.content_category;
				}
			}).catch(() => { /* silent fail */ });
		} catch (error) {
			toast.error(error instanceof Error ? error.message : "เกิดข้อผิดพลาดระหว่าง analyze link");
		} finally {
			enriching = false;
		}
	}

	async function saveIdea() {
		if (!supabase) {
			toast.error("ยังไม่ได้ตั้งค่า Supabase");
			return;
		}

		if (!draft) {
			toast.error("ยังไม่มีข้อมูลจากการ analyze ลิงก์");
			return;
		}

		saving = true;

		const existingIdea = ideas.find((i) => i.url && i.url === draft?.url);
		if (existingIdea) {
			toast.error(`ไอเดียลิงก์นี้มีอยู่ในระบบแล้ว (${backlogCode(existingIdea)})`);
			scrollToTop();
			saving = false;
			return;
		}

		const payload = {
			url: draft.url,
			platform: draft.platform,
			content_type: selectedContentType,
			title: draft.title,
			description: draft.description,
			author_name: draft.authorName,
			thumbnail_url: draft.thumbnailUrl,
			published_at: draft.publishedAt,
			view_count: metrics.views,
			like_count: metrics.likes,
			comment_count: metrics.comments,
			share_count: metrics.shares,
			save_count: metrics.saves,
			notes: notes.trim() || null,
			content_category: fromCategorySelectValue(selectedCategory),
			status: "new",
			engagement_json: {
				source: draft.source,
				extracted_at: new Date().toISOString(),
			},
		};

		const { error } = await supabase.from("idea_backlog").insert(payload);
		saving = false;

		if (error) {
			toast.error(`บันทึกไม่สำเร็จ: ${error.message}`);
			scrollToTop();
			return;
		}

		toast.success("บันทึกเข้า backlog แล้ว");
		scrollToTop();
		linkInput = "";
		clearState();
		await loadIdeas();
	}

	async function saveManualIdea() {
		if (!supabase) {
			toast.error("ยังไม่ได้ตั้งค่า Supabase");
			return;
		}

		saving = true;

		const payload = {
			url: null,
			platform: manualPlatform,
			content_type: manualContentType,
			title: normalizeOptionalText(manualTitle),
			description: normalizeOptionalText(manualDescription),
			author_name: null,
			thumbnail_url: null,
			published_at: null,
			view_count: manualMetrics.views,
			like_count: manualMetrics.likes,
			comment_count: manualMetrics.comments,
			share_count: manualMetrics.shares,
			save_count: manualMetrics.saves,
			notes: normalizeOptionalText(manualNotes),
			content_category: fromCategorySelectValue(manualCategory),
			status: "new",
			engagement_json: {
				source: ["manual-entry"],
				extracted_at: new Date().toISOString(),
			},
		};

		const { error } = await supabase.from("idea_backlog").insert(payload);
		saving = false;

		if (error) {
			toast.error(`บันทึกไม่สำเร็จ: ${error.message}`);
			scrollToTop();
			return;
		}

		toast.success("บันทึกไอเดียที่สร้างเองเข้า backlog แล้ว");
		scrollToTop();
		clearManualState();
		manualExpanded = false;
		await loadIdeas();
	}

	async function deleteIdea(idea: IdeaBacklogRow) {
		if (!supabase) {
			toast.error("ยังไม่ได้ตั้งค่า Supabase");
			return;
		}

		const confirmed = window.confirm(
			`ลบ backlog นี้ใช่ไหม?\n${backlogCode(idea)} • ${idea.title ?? idea.url ?? "No link"}`,
		);
		if (!confirmed) return;

		deletingId = idea.id;

		const { data, error } = await supabase
			.from("idea_backlog")
			.delete()
			.eq("id", idea.id)
			.select("id");
		deletingId = null;

		if (error) {
			toast.error(`ลบไม่สำเร็จ: ${error.message}`);
			scrollToTop();
			return;
		}

		if (!data || data.length === 0) {
			toast.error(`ลบไม่สำเร็จ: ระบบไม่ได้รับอนุญาตให้ลบรายการนี้ (RLS policy blocked)`);
			scrollToTop();
			await loadIdeas();
			return;
		}

		toast.success("ลบออกจาก backlog แล้ว");
		scrollToTop();
		await Promise.all([loadIdeas(), loadScheduledBacklogIds()]);
	}

	function openContextMenu(event: MouseEvent, idea: IdeaBacklogRow) {
		event.preventDefault();
		contextMenuIdea = idea;

		const viewportWidth = window.innerWidth;
		const viewportHeight = window.innerHeight;
		const shouldOpenLeft = event.clientX + CONTEXT_MENU_WIDTH + CONTEXT_MENU_VIEWPORT_PADDING > viewportWidth;
		const nextX = shouldOpenLeft
			? event.clientX - CONTEXT_MENU_WIDTH - CONTEXT_MENU_VIEWPORT_PADDING
			: event.clientX + CONTEXT_MENU_VIEWPORT_PADDING;
		const nextY = Math.min(
			event.clientY,
			viewportHeight - CONTEXT_MENU_ESTIMATED_HEIGHT - CONTEXT_MENU_VIEWPORT_PADDING
		);

		contextMenuX = Math.max(
			CONTEXT_MENU_VIEWPORT_PADDING,
			Math.min(nextX, viewportWidth - CONTEXT_MENU_WIDTH - CONTEXT_MENU_VIEWPORT_PADDING)
		);
		contextMenuY = Math.max(CONTEXT_MENU_VIEWPORT_PADDING, nextY);
		contextMenuVisible = true;
		scheduleDate = new Date().toISOString().slice(0, 10);
	}

	function closeContextMenu() {
		contextMenuVisible = false;
		contextMenuIdea = null;
		scheduleDate = "";
	}

	async function scheduleToCalendar() {
		if (!supabase || !contextMenuIdea || !scheduleDate) return;
		scheduling = true;

		const { error } = await supabase.from("production_calendar").upsert(
			{
				backlog_id: contextMenuIdea.id,
				shoot_date: scheduleDate,
				status: "planned",
			},
			{ onConflict: "backlog_id" },
		);

		scheduling = false;
		closeContextMenu();

		if (error) {
			toast.error(`วางแผนใน calendar ไม่สำเร็จ: ${error.message}`);
			scrollToTop();
			return;
		}

		toast.success(`${backlogCode(contextMenuIdea)} ถูกจัดลงตาราง ${scheduleDate} แล้ว`);
		scrollToTop();
		await loadScheduledBacklogIds();
	}

	async function togglePinnedState(idea: IdeaBacklogRow) {
		if (!supabase) {
			toast.error("ยังไม่ได้ตั้งค่า Supabase");
			return;
		}

		const nextCategory = idea.content_category === "pin" ? null : "pin";
		const { error } = await supabase
			.from("idea_backlog")
			.update({ content_category: nextCategory })
			.eq("id", idea.id);

		if (error) {
			toast.error(`อัปเดต category ไม่สำเร็จ: ${error.message}`);
			scrollToTop();
			return;
		}

		toast.success(nextCategory === "pin"
			? `${backlogCode(idea)} ถูก pin แล้ว`
			: `${backlogCode(idea)} ถูกเอาออกจาก pin แล้ว`);
		if (contextMenuIdea?.id === idea.id) closeContextMenu();
		await loadIdeas();
	}

	async function openEditModal(idea: IdeaBacklogRow, options?: { syncUrl?: boolean }) {
		const syncUrl = options?.syncUrl ?? true;
		editingIdea = idea;
		if (syncUrl) {
			await goto(buildEditUrl(idea.id), { replaceState: true, noScroll: true, keepFocus: true });
		}
	}

	async function closeEditModal() {
		editingIdea = null;
		await goto(buildEditUrl(null), { replaceState: true, noScroll: true, keepFocus: true });
	}

	function exportBacklogCSV() {
		const headers = ['Code','Platform','Content Type','Category','Title','URL','Views','Likes','Comments','Shares','Saves','Notes','Created'];
		const rows = ideas.map(idea => [
			backlogCode(idea),
			idea.platform,
			idea.content_type ?? '',
			idea.content_category ?? '',
			(idea.title ?? '').replace(/"/g, '""'),
			(idea.url ?? '').replace(/"/g, '""'),
			idea.view_count ?? '',
			idea.like_count ?? '',
			idea.comment_count ?? '',
			idea.share_count ?? '',
			idea.save_count ?? '',
			(idea.notes ?? '').replace(/"/g, '""'),
			new Date(idea.created_at).toLocaleDateString('th-TH'),
		].map(v => `"${v}"`).join(','));
		const csv = [headers.join(','), ...rows].join('\n');
		const blob = new Blob(['\uFEFF' + csv], { type: 'text/csv;charset=utf-8' });
		const url = URL.createObjectURL(blob);
		const a = document.createElement('a');
		a.href = url;
		a.download = `backlog-${new Date().toISOString().slice(0,10)}.csv`;
		a.click();
		URL.revokeObjectURL(url);
	}

	onMount(async () => {
		await Promise.all([loadIdeas(), loadScheduledBacklogIds()]);
	});

	$effect(() => {
		const editId = page.url.searchParams.get('edit');
		if (!editId || ideas.length === 0) return;
		if (editingIdea?.id === editId) return;
		const matchedIdea = ideas.find((idea) => idea.id === editId);
		if (matchedIdea) {
			void openEditModal(matchedIdea, { syncUrl: false });
		}
	});

	$effect(() => {
		if (page.url.searchParams.get('edit')) return;
		if (!editingIdea) return;
		editingIdea = null;
	});
</script>

<main class="page">
	<section class="hero-shell">
		<div class="hero-main">
			<div class="hero-copy">
				<p class="hero-eyebrow">BigLot Media Plan</p>
				<h1 class="hero-title">Idea Backlog</h1>
				<p class="hero-subtitle">
					วางลิงก์เพื่อดึง metadata อัตโนมัติ หรือสร้างไอเดียเองแบบ manual แล้วค่อยแตกต่อเป็น production ได้จากหน้าเดียว
				</p>
			</div>

			<div class="hero-actions">
				<Button variant="primary" size="lg" onclick={focusAnalyzeInput}>Analyze Link</Button>
				<Button variant="ai" size="lg" onclick={() => { showSuggestModeModal = true; }}>
					✦ ช่วยคิด idea
				</Button>
				{#if ideas.length > 0}
					<Button variant="secondary" size="lg" onclick={exportBacklogCSV}>Export CSV</Button>
				{/if}
			</div>

			<div class="hero-band">
				<div class="hero-band-card">
					<span class="hero-band-label">รองรับแพลตฟอร์ม</span>
					<div class="hero-platforms">
						{#each platformOrder as platform}
							<Badge variant="platform" value={platform} />
						{/each}
					</div>
				</div>
				<div class="hero-band-card">
					<span class="hero-band-label">Focus ตอนนี้</span>
					<p class="hero-band-value">
						{#if dashboardStats.uncategorizedIdeas > 0}
							{dashboardStats.uncategorizedIdeas} ideas ยังไม่จัดหมวด
						{:else}
							Backlog จัดหมวดครบแล้ว
						{/if}
					</p>
					<p class="hero-band-copy">คลิกขวาที่ card เพื่อ schedule ลง shoot calendar ได้ทันที</p>
				</div>
			</div>

			<div class="hero-stats">
				<StatsCard
					icon="💡"
					label="Ideas ในคลัง"
					value={dashboardStats.totalIdeas}
					sub="{dashboardStats.activeIdeas} active"
					variant="primary"
				/>
				<StatsCard
					icon="📅"
					label="Scheduled"
					value={dashboardStats.scheduledIdeas}
					sub="{scheduledPercent}% of total"
					variant="success"
				/>
				<StatsCard
					icon="🪄"
					label="Needs Category"
					value={dashboardStats.uncategorizedIdeas}
					sub={dashboardStats.pinnedIdeas > 0 ? `${dashboardStats.pinnedIdeas} pinned` : 'พร้อมจัดระบบ'}
					variant="warning"
				/>
			</div>
		</div>

		<aside class="hero-side">
			<div class="dash-group">
				<p class="dash-group-label">Platform Mix</p>
				{#if platformBreakdown.length === 0}
					<p class="dash-empty">เริ่มจากวางลิงก์หรือสร้าง idea ใหม่เพื่อให้เห็นภาพรวมแพลตฟอร์ม</p>
				{:else}
					<div class="mix-list">
						{#each platformBreakdown as item}
							<div class="mix-row">
								<div class="mix-label">
									<Badge variant="platform" value={item.platform} />
									<strong>{item.count}</strong>
								</div>
								<div class="mix-bar">
									<span style={`width:${(item.count / maxPlatformCount) * 100}%`}></span>
								</div>
							</div>
						{/each}
					</div>
				{/if}
			</div>
			<div class="dash-group">
				<p class="dash-group-label">Production Stage</p>
				{#if dashboardStats.scheduledIdeas === 0}
					<p class="dash-empty">ยังไม่มีรายการที่ถูก schedule จาก backlog</p>
				{:else}
					<div class="stage-pills">
						{#each PRODUCTION_STAGES as stage}
							{#if (dashboardStats.stageCount[stage] ?? 0) > 0}
								<div class="stage-pill">
									<Badge variant="stage" value={stage} />
									<strong>{dashboardStats.stageCount[stage]}</strong>
								</div>
							{/if}
						{/each}
					</div>
				{/if}
			</div>
		</aside>
	</section>

	{#if !hasSupabaseConfig}
		<p class="alert">
			ตั้งค่า env ก่อนใช้งาน: <code>PUBLIC_SUPABASE_URL</code> และ
			<code>PUBLIC_SUPABASE_ANON_KEY</code>
		</p>
	{/if}

	<section class="workspace-grid">
		<section class="panel panel--feature">
			<div class="panel-head panel-head--feature">
				<div>
					<p class="panel-eyebrow">Auto Intake</p>
					<h2>วางลิงก์ แล้วให้ระบบช่วยดึง metadata</h2>
					<p class="panel-subtitle">
						เหมาะกับการเก็บ reference จากคู่แข่งหรือคอนเทนต์ที่ทีมอยากแตกต่อเป็นไอเดียใหม่
					</p>
				</div>
				<span class="feature-chip">Fast capture</span>
			</div>

			<div class="analyzer-grid">
				<div class="analyzer-form">
					<div class="row no-margin">
						<label for="content-link">Content Link</label>
						<input
							id="content-link"
							bind:value={linkInput}
							placeholder="https://www.instagram.com/p/... หรือ https://www.youtube.com/watch?v=..."
						/>
					</div>
					<div class="panel-actions">
						<Button variant="primary" onclick={analyzeLink} loading={enriching}>
							{enriching ? "Analyzing..." : "Analyze Link"}
						</Button>
						{#if linkInput || draft}
							<Button variant="ghost" onclick={() => { linkInput = ""; clearState(); }}>
								Clear
							</Button>
						{/if}
					</div>
				</div>

				<div class="analyzer-hints">
					<div class="tip-card">
						<span class="tip-number">01</span>
						<strong>Paste reference</strong>
						<p>วางลิงก์จาก YouTube, Facebook, Instagram หรือ TikTok แล้วระบบจะ enrich ให้ทันที</p>
					</div>
					<div class="tip-card">
						<span class="tip-number">02</span>
						<strong>Review draft</strong>
						<p>เช็ก type, category และ note ให้พร้อมก่อนโยนเข้า backlog เพื่อให้ทีมเห็นภาพเดียวกัน</p>
					</div>
					<div class="tip-card">
						<span class="tip-number">03</span>
						<strong>Schedule faster</strong>
						<p>หลังบันทึกแล้ว คลิกขวาที่ card เพื่อ pin หรือ schedule ลงปฏิทินได้จากหน้าเดียว</p>
					</div>
				</div>
			</div>
		</section>

		<section class="panel panel--manual">
			<div class="panel-head">
				<div>
					<p class="panel-eyebrow">Manual Builder</p>
					<h2>สร้างไอเดียเองแบบย่อ</h2>
					<p class="panel-subtitle">
						ใช้เมื่อยังไม่มีลิงก์อ้างอิง แต่ต้องการโยนหัวข้อหรือ concept ใหม่เข้า backlog ให้ทีมเห็นก่อน
					</p>
				</div>
			</div>

			<details class="manual-dropdown" bind:open={manualExpanded}>
				<summary>
					<div class="manual-summary">
						<span>Create manually</span>
						<small>กรอกเฉพาะข้อมูลที่มี แล้วค่อยกลับมาเติมภายหลังได้</small>
					</div>
					<span class="manual-toggle">{manualExpanded ? '−' : '+'}</span>
				</summary>

				<div class="manual-body">
					<div class="row-inline">
						<div class="row">
							<label for="manual-platform">Platform</label>
							<select
								id="manual-platform"
								bind:value={manualPlatform}
							>
								{#each platformOptions as option}
									<option value={option}
										>{platformLabel[option]}</option
									>
								{/each}
							</select>
						</div>
						<div class="row">
							<label for="manual-content-type">Content Type</label>
							<select
								id="manual-content-type"
								bind:value={manualContentType}
							>
								{#each CONTENT_TYPE_OPTIONS as option}
									<option value={option}
										>{contentTypeLabel[option]}</option
									>
								{/each}
							</select>
						</div>
					</div>

					<div class="row">
						<label for="manual-category">Category</label>
						<select id="manual-category" bind:value={manualCategory}>
							{#each CONTENT_CATEGORY_OPTIONS as option}
								<option value={option.value}>{option.label}</option>
							{/each}
						</select>
					</div>

					<div class="row">
						<label for="manual-title">Title</label>
						<input
							id="manual-title"
							bind:value={manualTitle}
							placeholder="ชื่อไอเดีย/ชื่อโพสต์"
						/>
					</div>

					<div class="row">
						<label for="manual-description">Description</label>
						<textarea
							id="manual-description"
							bind:value={manualDescription}
							rows={3}
							placeholder="คำอธิบายเพิ่มเติม (ถ้ามี)"
						></textarea>
					</div>

					<div class="row">
						<label for="manual-notes">Idea Notes</label>
						<textarea
							id="manual-notes"
							bind:value={manualNotes}
							rows={4}
							placeholder="เขียนไอเดียที่ทีมอยากผลิตเองได้เลย"
						></textarea>
					</div>

					<Button variant="primary" onclick={saveManualIdea} loading={saving} disabled={!hasSupabaseConfig}>
						{saving ? "Saving..." : "Save Manual Idea"}
					</Button>
				</div>
			</details>
		</section>
	</section>

	{#if draft}
		<section class="panel panel--draft">
			<div class="panel-head">
				<div>
					<p class="panel-eyebrow">Draft Preview</p>
					<h2>พร้อมบันทึกเข้า backlog</h2>
					<p class="panel-subtitle">ตรวจ type, category และ idea note ก่อนบันทึกเข้า workflow หลัก</p>
				</div>
				{#if suggestedCategory}
					<Badge variant="warning" label={`AI แนะนำ: ${contentCategoryLabel[suggestedCategory]}`} />
				{/if}
			</div>

			<div class="draft-grid">
				<div class="preview-card">
					<div class="preview">
						{#if draftTikTokEmbedUrl}
							<iframe
								class="preview-media tiktok-frame"
								src={draftTikTokEmbedUrl}
								title="TikTok Preview"
								loading="lazy"
								allow="encrypted-media; picture-in-picture"
								allowfullscreen
							></iframe>
						{:else if draftYouTubeEmbedUrl}
							<iframe
								class="preview-media youtube-frame"
								src={draftYouTubeEmbedUrl}
								title="YouTube Preview"
								loading="lazy"
								allow="accelerometer; autoplay; clipboard-write; encrypted-media; gyroscope; picture-in-picture"
								allowfullscreen
							></iframe>
						{:else if draft.thumbnailUrl}
							<img
								class="preview-media"
								src={draft.thumbnailUrl}
								alt={draft.title ?? "thumbnail"}
							/>
						{:else if draftInstagramEmbedUrl}
							<iframe
								class="preview-media instagram-frame"
								src={draftInstagramEmbedUrl}
								title="Instagram Preview"
								loading="lazy"
								allow="encrypted-media; picture-in-picture"
								allowfullscreen
							></iframe>
						{/if}
						<div>
							<div class="chip-row">
								<span class="platform"
									>{draft.platform.toUpperCase()}</span
								>
								<span class="content-type"
									>{contentTypeLabel[selectedContentType]}</span
								>
							</div>
							<h2>{draft.title ?? "Untitled content"}</h2>
							<p class="meta">
								{draft.authorName ?? "Unknown creator"}
								{#if draft.publishedAt}
									• {new Date(draft.publishedAt).toLocaleDateString()}
								{/if}
							</p>
						</div>
					</div>
				</div>

				<div class="draft-fields">
					<div class="row">
						<label for="content-type">Content Type</label>
						<select id="content-type" bind:value={selectedContentType}>
							{#each CONTENT_TYPE_OPTIONS as option}
								<option value={option}
									>{contentTypeLabel[option]}</option
								>
							{/each}
						</select>
					</div>

					<div class="row">
						<div class="category-label-row">
							<label for="content-category">Category</label>
							{#if suggestedCategory}
								<span class="category-suggest-label">
									AI แนะนำ: {contentCategoryLabel[suggestedCategory]}
								</span>
							{/if}
						</div>
						<select id="content-category" bind:value={selectedCategory}>
							{#each CONTENT_CATEGORY_OPTIONS as option}
								<option value={option.value}>{option.label}</option>
							{/each}
						</select>
					</div>

					<div class="row">
						<label for="notes">Idea Notes</label>
						<textarea
							id="notes"
							bind:value={notes}
							rows={5}
							placeholder="ไอเดียที่ได้จากคอนเทนต์นี้ เช่น hook, visual style, CTA..."
						></textarea>
					</div>

					<div class="draft-actions">
						<Button variant="primary" onclick={saveIdea} loading={saving} disabled={!hasSupabaseConfig}>
							{saving ? "Saving..." : "Save To Backlog"}
						</Button>
						<Button variant="ghost" onclick={clearState}>ล้าง draft</Button>
					</div>
				</div>
			</div>
		</section>
	{/if}

	<section class="panel panel--backlog">
		<div class="backlog-head">
			<div>
				<p class="panel-eyebrow">Library</p>
				<h2>Backlog</h2>
				<p class="backlog-caption">
					{dashboardStats.activeIdeas} active ideas
					{#if dashboardStats.publishedIdeas > 0}
						· {dashboardStats.publishedIdeas} published
					{/if}
				</p>
			</div>
			<div class="backlog-toolbar">
				{#if loadingIdeas}<Spinner size="sm" />{/if}
				{#if publishedBacklogIds.size > 0}
					<button
						class="toggle-btn {showPublished ? 'active' : ''}"
						onclick={() => (showPublished = !showPublished)}
					>{showPublished ? 'ซ่อน Published' : 'แสดง Published'}</button>
				{/if}
			</div>
		</div>

		{#if ideas.length > 0}
			<div class="backlog-meta-strip">
				<div class="mini-stat">
					<span>Active</span>
					<strong>{dashboardStats.activeIdeas}</strong>
				</div>
				<div class="mini-stat">
					<span>Pinned</span>
					<strong>{dashboardStats.pinnedIdeas}</strong>
				</div>
				<div class="mini-stat">
					<span>Groups</span>
					<strong>{groupedIdeas.length}</strong>
				</div>
			</div>
		{/if}

		{#if ideas.length === 0}
			<p class="empty">ยังไม่มีรายการไอเดียในระบบ</p>
		{:else}
			<div class="category-groups">
				{#each groupedIdeas as group}
					<details class="category-group" open>
						<summary class="category-group-head">
							<div class="category-group-title">
								<h3>{group.label}</h3>
								<span class="group-count">{group.items.length}</span>
							</div>
							<span class="group-toggle">▼</span>
						</summary>

						<div class="grid category-group-grid">
							{#each group.items as idea}
								<IdeaCard
									{idea}
									code={backlogCode(idea)}
									isScheduled={scheduledBacklogIds.has(idea.id)}
									isDeleting={deletingId === idea.id}
									oncontextmenu={(e, idea) => openContextMenu(e, idea)}
									onpin={(idea) => togglePinnedState(idea)}
									onedit={(idea) => openEditModal(idea)}
									ondelete={(idea) => deleteIdea(idea)}
									onmenu={(e, idea) => openContextMenu(e, idea)}
								/>
							{/each}
						</div>
					</details>
				{/each}
			</div>
		{/if}
	</section>

	{#if contextMenuVisible && contextMenuIdea}
		<!-- svelte-ignore a11y_no_static_element_interactions -->
		<div class="ctx-overlay" onclick={closeContextMenu} onkeydown={(e) => { if (e.key === 'Escape') closeContextMenu(); }}></div>
		<div
			class="ctx-menu"
			style="left:{contextMenuX}px;top:{contextMenuY}px"
		>
			<div class="ctx-header">
				<span class="platform">{contextMenuIdea.platform.toUpperCase()}</span>
				<strong>{backlogCode(contextMenuIdea)}</strong>
			</div>
			<p class="ctx-title">{contextMenuIdea.title ?? 'Untitled idea'}</p>
			<button
				class="ctx-pin"
				onclick={() => {
					if (contextMenuIdea) void togglePinnedState(contextMenuIdea);
				}}
			>
				{contextMenuIdea.content_category === 'pin' ? 'Unpin จาก category pin' : 'Pin คลิปนี้'}
			</button>
			{#if scheduledBacklogIds.has(contextMenuIdea.id)}
				<p class="ctx-note">ไอเดียนี้ถูก schedule แล้ว (จะย้ายวัน)</p>
			{/if}
			<label class="ctx-label" for="ctx-date">Shoot Date</label>
			<input id="ctx-date" type="date" bind:value={scheduleDate} class="ctx-date-input" />
			<div class="ctx-actions">
				<button class="ctx-confirm" onclick={scheduleToCalendar} disabled={scheduling || !scheduleDate}>
					{scheduling ? 'Scheduling...' : 'Schedule'}
				</button>
				<button class="ctx-cancel" onclick={closeContextMenu}>Cancel</button>
			</div>
		</div>
	{/if}

	<AISuggestModal bind:open={showSuggestModeModal} onadded={loadIdeas} />

	{#if editingIdea}
		<IdeaEditModal
			idea={editingIdea}
			calEntry={scheduledCalendarMap.get(editingIdea.id)}
			onclose={closeEditModal}
			onsaved={async () => { await Promise.all([loadIdeas(), loadScheduledBacklogIds()]); }}
		/>
	{/if}
</main>

<style>
	.page {
		display: grid;
		gap: 1.15rem;
	}

	h2,
	h3 {
		font-family: var(--font-heading);
	}

	.hero-shell {
		display: grid;
		grid-template-columns: minmax(0, 1.6fr) minmax(300px, 0.95fr);
		gap: 1rem;
		align-items: stretch;
	}

	.hero-main {
		position: relative;
		overflow: hidden;
		display: grid;
		gap: 1.1rem;
		padding: 1.35rem;
		border-radius: 1.5rem;
		border: 1px solid rgba(37, 99, 235, 0.14);
		background:
			radial-gradient(circle at top right, rgba(249, 115, 22, 0.18), transparent 28%),
			radial-gradient(circle at 18% 18%, rgba(37, 99, 235, 0.16), transparent 24%),
			linear-gradient(135deg, #ffffff 0%, #f8fbff 54%, #fff7ed 100%);
		box-shadow: var(--shadow-sm);
	}

	.hero-main::before {
		content: '';
		position: absolute;
		inset: auto -4rem -5rem auto;
		width: 18rem;
		height: 18rem;
		border-radius: 999px;
		background: radial-gradient(circle, rgba(37, 99, 235, 0.12), transparent 68%);
		pointer-events: none;
	}

	.hero-main::after {
		content: '';
		position: absolute;
		inset: 0;
		background-image:
			linear-gradient(rgba(255, 255, 255, 0.45) 1px, transparent 1px),
			linear-gradient(90deg, rgba(255, 255, 255, 0.45) 1px, transparent 1px);
		background-size: 28px 28px;
		mask-image: linear-gradient(135deg, rgba(0, 0, 0, 0.35), transparent 75%);
		pointer-events: none;
	}

	.hero-main > * {
		position: relative;
		z-index: 1;
	}

	.hero-copy {
		display: grid;
		gap: 0.6rem;
		max-width: 42rem;
	}

	.hero-eyebrow {
		margin: 0;
		font-size: 0.75rem;
		font-weight: 700;
		letter-spacing: 0.18em;
		text-transform: uppercase;
		color: var(--color-blue-700);
	}

	.hero-title {
		margin: 0;
		font-family: var(--font-heading);
		font-size: clamp(2.4rem, 6vw, 4.1rem);
		line-height: 0.94;
		letter-spacing: -0.04em;
		color: var(--color-slate-900);
	}

	.hero-subtitle {
		margin: 0;
		max-width: 42rem;
		font-size: 1rem;
		line-height: 1.7;
		color: var(--color-slate-600);
	}

	.hero-actions {
		display: flex;
		flex-wrap: wrap;
		gap: 0.65rem;
	}

	.hero-band {
		display: grid;
		grid-template-columns: repeat(2, minmax(0, 1fr));
		gap: 0.75rem;
	}

	.hero-band-card {
		display: grid;
		gap: 0.5rem;
		padding: 0.95rem 1rem;
		border-radius: 1rem;
		background: rgba(255, 255, 255, 0.78);
		backdrop-filter: blur(10px);
		border: 1px solid rgba(15, 23, 42, 0.07);
	}

	.hero-band-label {
		font-size: 0.7rem;
		font-weight: 700;
		text-transform: uppercase;
		letter-spacing: 0.08em;
		color: var(--color-slate-500);
	}

	.hero-platforms {
		display: flex;
		flex-wrap: wrap;
		gap: 0.4rem;
	}

	.hero-band-value {
		margin: 0;
		font-family: var(--font-heading);
		font-size: 1.2rem;
		line-height: 1.2;
		color: var(--color-slate-900);
	}

	.hero-band-copy {
		margin: 0;
		font-size: 0.82rem;
		line-height: 1.55;
		color: var(--color-slate-500);
	}

	.hero-stats {
		display: grid;
		grid-template-columns: repeat(3, minmax(0, 1fr));
		gap: 0.75rem;
	}

	.hero-side {
		display: grid;
		gap: 0.85rem;
	}

	.dash-group {
		display: grid;
		gap: 0.75rem;
		padding: 1rem;
		border-radius: 1.15rem;
		background: linear-gradient(180deg, rgba(255, 255, 255, 0.96), rgba(248, 250, 252, 0.98));
		border: 1px solid var(--color-border);
		box-shadow: var(--shadow-xs);
	}

	.dash-group-label {
		margin: 0;
		font-size: 0.72rem;
		text-transform: uppercase;
		letter-spacing: 0.08em;
		font-weight: 700;
		color: var(--color-slate-400);
	}

	.dash-empty {
		margin: 0;
		font-size: 0.85rem;
		line-height: 1.6;
		color: var(--color-slate-500);
	}

	.mix-list {
		display: grid;
		gap: 0.7rem;
	}

	.mix-row {
		display: grid;
		gap: 0.4rem;
	}

	.mix-label {
		display: flex;
		align-items: center;
		justify-content: space-between;
		gap: 0.6rem;
	}

	.mix-label strong {
		font-family: var(--font-heading);
		font-size: 1rem;
		color: var(--color-slate-900);
	}

	.mix-bar {
		height: 0.42rem;
		border-radius: 999px;
		background: var(--color-slate-100);
		overflow: hidden;
	}

	.mix-bar span {
		display: block;
		height: 100%;
		border-radius: inherit;
		background: linear-gradient(90deg, var(--color-blue-600), var(--color-orange-500));
	}

	.stage-pills {
		display: flex;
		flex-wrap: wrap;
		gap: 0.55rem;
	}

	.stage-pill {
		display: inline-flex;
		align-items: center;
		gap: 0.4rem;
		padding: 0.28rem 0.34rem;
		border-radius: 999px;
		background: var(--color-bg-subtle);
		border: 1px solid var(--color-border);
	}

	.stage-pill strong {
		font-size: 0.82rem;
		color: var(--color-slate-700);
		padding-right: 0.2rem;
	}

	.workspace-grid {
		display: grid;
		grid-template-columns: minmax(0, 1.5fr) minmax(320px, 0.9fr);
		gap: 1rem;
		align-items: start;
	}

	.panel {
		padding: 1.25rem;
		border-radius: 1.2rem;
		background: var(--color-bg-elevated);
		border: 1px solid var(--color-border);
		box-shadow: var(--shadow-xs);
	}

	.panel--feature {
		background:
			linear-gradient(180deg, rgba(37, 99, 235, 0.035), transparent 38%),
			var(--color-bg-elevated);
	}

	.panel--draft {
		display: grid;
		gap: 1rem;
	}

	.panel-head {
		display: flex;
		justify-content: space-between;
		align-items: flex-start;
		gap: 0.9rem;
		margin-bottom: 1rem;
		flex-wrap: wrap;
	}

	.panel-head h2 {
		margin: 0;
		font-size: 1.32rem;
		line-height: 1.05;
	}

	.panel-eyebrow {
		margin: 0 0 0.3rem;
		font-size: 0.72rem;
		font-weight: 700;
		text-transform: uppercase;
		letter-spacing: 0.12em;
		color: var(--color-blue-700);
	}

	.panel-subtitle {
		margin: 0.35rem 0 0;
		max-width: 36rem;
		font-size: 0.88rem;
		line-height: 1.6;
		color: var(--color-slate-500);
	}

	.feature-chip {
		display: inline-flex;
		align-items: center;
		padding: 0.32rem 0.7rem;
		border-radius: 999px;
		background: rgba(37, 99, 235, 0.08);
		color: var(--color-blue-700);
		font-size: 0.76rem;
		font-weight: 700;
		border: 1px solid rgba(37, 99, 235, 0.14);
	}

	.row {
		display: grid;
		gap: 0.45rem;
		margin-bottom: 0.9rem;
	}

	.row-inline {
		display: grid;
		grid-template-columns: repeat(2, minmax(0, 1fr));
		gap: 0.75rem;
	}

	.no-margin {
		margin-bottom: 0;
	}

	label {
		font-size: 0.86rem;
		color: var(--color-slate-600);
	}

	input,
	select,
	textarea {
		width: 100%;
		box-sizing: border-box;
		font: inherit;
		padding: 0.72rem 0.85rem;
		border-radius: 0.8rem;
		border: 1px solid var(--color-border-strong);
		background: var(--color-bg-elevated);
		transition:
			border-color var(--transition-fast),
			box-shadow var(--transition-fast),
			background var(--transition-fast);
	}

	input:focus,
	select:focus,
	textarea:focus {
		outline: none;
		border-color: var(--color-blue-500);
		box-shadow: 0 0 0 4px rgba(37, 99, 235, 0.09);
	}

	.analyzer-grid {
		display: grid;
		grid-template-columns: minmax(0, 1.2fr) minmax(240px, 0.92fr);
		gap: 1rem;
		align-items: start;
	}

	.analyzer-form,
	.analyzer-hints {
		display: grid;
		gap: 0.85rem;
	}

	.tip-card {
		display: grid;
		gap: 0.35rem;
		padding: 0.95rem 1rem;
		border-radius: 1rem;
		border: 1px solid var(--color-border);
		background: var(--color-bg-subtle);
	}

	.tip-number {
		font-size: 0.72rem;
		font-weight: 700;
		letter-spacing: 0.1em;
		text-transform: uppercase;
		color: var(--color-blue-700);
	}

	.tip-card strong {
		font-size: 0.92rem;
		color: var(--color-slate-900);
	}

	.tip-card p {
		margin: 0;
		font-size: 0.82rem;
		line-height: 1.6;
		color: var(--color-slate-500);
	}

	.manual-dropdown {
		border: 1px solid var(--color-border);
		border-radius: 1rem;
		padding: 0.35rem 0.8rem;
		background: linear-gradient(180deg, rgba(248, 250, 252, 0.85), #fff);
	}

	.manual-dropdown summary {
		display: flex;
		justify-content: space-between;
		align-items: center;
		gap: 0.75rem;
		cursor: pointer;
		user-select: none;
		padding: 0.45rem 0;
		color: #1f2937;
	}

	.manual-summary {
		display: grid;
		gap: 0.2rem;
	}

	.manual-summary span {
		font-size: 0.95rem;
		font-weight: 700;
		color: var(--color-slate-900);
	}

	.manual-summary small {
		font-size: 0.75rem;
		font-weight: 600;
		color: var(--color-slate-500);
	}

	.manual-toggle {
		display: inline-flex;
		align-items: center;
		justify-content: center;
		width: 2rem;
		height: 2rem;
		border-radius: 999px;
		background: var(--color-bg-subtle);
		color: var(--color-slate-700);
		font-size: 1.1rem;
		font-weight: 700;
	}

	.manual-body {
		padding-top: 1rem;
	}

	.alert {
		padding: 0.8rem 0.95rem;
		border-radius: 1rem;
		font-size: 0.9rem;
		border: 1px solid rgba(202, 138, 4, 0.18);
		background: rgba(254, 249, 195, 0.55);
	}

	.preview-card {
		border-radius: 1rem;
		border: 1px solid var(--color-border);
		background: linear-gradient(180deg, rgba(248, 250, 252, 0.86), #fff);
		padding: 1rem;
	}

	.preview {
		display: grid;
		grid-template-columns: minmax(0, 280px) 1fr;
		gap: 1.1rem;
		align-items: start;
	}

	.preview-media {
		width: 100%;
		aspect-ratio: 16 / 9;
		object-fit: cover;
		border-radius: 0.75rem;
		border: 1px solid var(--color-border-medium);
	}

	.tiktok-frame {
		border: 0;
		background: #000;
		aspect-ratio: 9 / 16;
	}

	.instagram-frame {
		border: 0;
		background: var(--color-bg-elevated);
		aspect-ratio: 4 / 5;
	}

	.youtube-frame {
		border: 0;
		background: #000;
		aspect-ratio: 16 / 9;
	}

	.platform {
		display: inline-block;
		padding: 0.15rem 0.55rem;
		border-radius: var(--radius-full);
		font-size: 0.7rem;
		font-weight: 700;
		background: rgba(180, 83, 9, 0.14);
		color: #92400e;
	}

	.chip-row {
		display: flex;
		gap: 0.35rem;
		flex-wrap: wrap;
	}

	.content-type {
		display: inline-block;
		padding: 0.15rem 0.55rem;
		border-radius: var(--radius-full);
		font-size: 0.7rem;
		font-weight: 700;
		background: rgba(15, 118, 110, 0.12);
		color: #115e59;
	}

	.meta {
		margin: 0.25rem 0 0;
		color: var(--color-slate-500);
		font-size: 0.9rem;
	}

	.draft-grid {
		display: grid;
		grid-template-columns: minmax(0, 1.15fr) minmax(320px, 0.9fr);
		gap: 1rem;
		align-items: start;
	}

	.draft-fields {
		display: grid;
		gap: 0.2rem;
	}

	.draft-actions {
		display: flex;
		flex-wrap: wrap;
		gap: 0.55rem;
	}

	.category-label-row {
		display: flex;
		align-items: center;
		justify-content: space-between;
		gap: 0.75rem;
	}

	.backlog-head {
		display: flex;
		justify-content: space-between;
		align-items: flex-start;
		gap: 1rem;
		margin-bottom: 1rem;
		flex-wrap: wrap;
	}

	.backlog-caption {
		margin: 0.35rem 0 0;
		color: var(--color-slate-500);
		font-size: 0.9rem;
	}

	.backlog-toolbar {
		display: flex;
		align-items: center;
		gap: 0.55rem;
		flex-wrap: wrap;
	}

	.backlog-meta-strip {
		display: grid;
		grid-template-columns: repeat(3, minmax(0, 1fr));
		gap: 0.75rem;
		margin-bottom: 1rem;
	}

	.mini-stat {
		display: grid;
		gap: 0.35rem;
		padding: 0.9rem 1rem;
		border-radius: 1rem;
		border: 1px solid var(--color-border);
		background: var(--color-bg-subtle);
	}

	.mini-stat span {
		font-size: 0.72rem;
		font-weight: 700;
		letter-spacing: 0.08em;
		text-transform: uppercase;
		color: var(--color-slate-500);
	}

	.mini-stat strong {
		font-family: var(--font-heading);
		font-size: 1.45rem;
		line-height: 1;
		color: var(--color-slate-900);
	}

	.empty {
		text-align: center;
		color: var(--color-slate-500);
		padding: 1.6rem;
		border: 1px dashed var(--color-border-medium);
		border-radius: 1rem;
		background: var(--color-bg-subtle);
	}

	.category-groups {
		display: grid;
		gap: 1rem;
	}

	.category-group {
		border: 1px solid var(--color-border);
		border-radius: 0.9rem;
		background: var(--color-bg-elevated);
		overflow: hidden;
	}

	.category-group-head {
		list-style: none;
		display: flex;
		justify-content: space-between;
		align-items: center;
		padding: 0.9rem 1rem;
		cursor: pointer;
		user-select: none;
	}

	.category-group-head::-webkit-details-marker {
		display: none;
	}

	.category-group-title {
		display: flex;
		align-items: center;
		gap: 0.6rem;
	}

	.category-group-head h3 {
		margin: 0;
	}

	.category-group-grid {
		padding: 0 1rem 1rem;
	}

	.category-group[open] .group-toggle {
		transform: rotate(180deg);
	}

	.group-toggle {
		font-size: 0.76rem;
		color: var(--color-slate-500);
		transition: transform 0.18s ease;
	}

	.group-count {
		padding: 0.18rem 0.6rem;
		border-radius: var(--radius-full);
		font-size: 0.75rem;
		font-weight: 700;
		color: var(--color-primary);
		background: rgba(37, 99, 235, 0.12);
	}

	.grid {
		display: grid;
		grid-template-columns: repeat(auto-fill, minmax(280px, 1fr));
		gap: 0.9rem;
	}

	/* Context menu */
	.ctx-overlay {
		position: fixed;
		inset: 0;
		z-index: 999;
	}

	.ctx-menu {
		position: fixed;
		z-index: 1000;
		width: 260px;
		background: var(--color-bg-elevated);
		border: 1px solid var(--color-border-medium);
		border-radius: 0.85rem;
		box-shadow: 0 8px 30px rgba(0, 0, 0, 0.12);
		padding: 0.85rem;
		display: grid;
		gap: 0.5rem;
	}

	.ctx-header {
		display: flex;
		align-items: center;
		gap: 0.4rem;
	}

	.ctx-header strong {
		font-size: 0.86rem;
	}

	.ctx-title {
		margin: 0;
		font-size: 0.8rem;
		color: var(--color-slate-600);
	}

	.ctx-pin {
		border: 1px solid rgba(180, 83, 9, 0.24);
		background: rgba(180, 83, 9, 0.08);
		color: #92400e;
		padding: 0.5rem 0.6rem;
		border-radius: 0.6rem;
		font-weight: 700;
		font-size: 0.82rem;
		cursor: pointer;
	}

	.ctx-note {
		margin: 0;
		font-size: 0.75rem;
		color: #b45309;
		background: rgba(180, 83, 9, 0.08);
		padding: 0.3rem 0.5rem;
		border-radius: 0.5rem;
	}

	.ctx-label {
		font-size: 0.78rem;
		color: var(--color-slate-500);
		font-weight: 600;
	}

	.ctx-date-input {
		width: 100%;
		box-sizing: border-box;
		font: inherit;
		padding: 0.55rem 0.7rem;
		border-radius: 0.6rem;
		border: 1px solid var(--color-border-strong);
		background: var(--color-bg-elevated);
	}

	.ctx-actions {
		display: grid;
		grid-template-columns: 1fr 1fr;
		gap: 0.4rem;
	}

	.ctx-confirm {
		border: 0;
		padding: 0.55rem;
		border-radius: 0.6rem;
		background: #2563eb;
		color: #fff;
		font-weight: 700;
		font-size: 0.82rem;
		cursor: pointer;
	}

	.ctx-confirm:disabled {
		opacity: 0.5;
		cursor: not-allowed;
	}

	.ctx-cancel {
		border: 1px solid var(--color-border-medium);
		padding: 0.55rem;
		border-radius: 0.6rem;
		background: var(--color-bg-elevated);
		color: var(--color-slate-600);
		font-weight: 700;
		font-size: 0.82rem;
		cursor: pointer;
	}

	.panel-actions {
		display: flex;
		gap: 0.55rem;
		flex-wrap: wrap;
	}

	.toggle-btn {
		border: 1px solid rgba(22, 163, 74, 0.25);
		background: rgba(22, 163, 74, 0.07);
		color: #166534;
		padding: 0.45rem 0.8rem;
		border-radius: 999px;
		font-size: 0.75rem;
		font-weight: 700;
		cursor: pointer;
		white-space: nowrap;
	}

	.toggle-btn:hover {
		background: rgba(22, 163, 74, 0.14);
	}

	.toggle-btn.active {
		background: rgba(22, 163, 74, 0.18);
		border-color: rgba(22, 163, 74, 0.45);
	}

	@media (max-width: 900px) {
		.hero-shell,
		.workspace-grid,
		.analyzer-grid,
		.draft-grid,
		.hero-band,
		.hero-stats,
		.backlog-meta-strip,
		.preview {
			grid-template-columns: 1fr;
		}

		.row-inline {
			grid-template-columns: 1fr;
		}
	}

	@media (max-width: 640px) {
		.hero-main,
		.panel {
			padding: 1rem;
		}

		.hero-title {
			font-size: 2.4rem;
		}

		.hero-actions,
		.panel-actions {
			flex-direction: column;
			align-items: stretch;
		}

		.grid {
			grid-template-columns: 1fr;
		}

		.ctx-menu {
			left: 0 !important;
			right: 0;
			bottom: 0;
			top: auto !important;
			width: auto;
			border-radius: 1rem 1rem 0 0;
			padding-bottom: calc(1rem + env(safe-area-inset-bottom, 0px));
		}

		.hero-actions :global(.btn),
		.draft-actions :global(.btn),
		.toggle-btn {
			width: 100%;
		}
	}

	/* Auto-categorize */
	.category-suggest-label {
		font-size: 0.78rem;
		font-weight: 600;
		color: #92400e;
		white-space: nowrap;
	}
</style>
