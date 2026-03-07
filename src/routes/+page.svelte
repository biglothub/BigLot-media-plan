<script lang="ts">
	import { onMount } from "svelte";
	import { Button, Spinner, PageHeader, Badge, toast, StatsCard } from '$lib';
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
		CONTENT_CATEGORY_ORDER,
		contentCategoryLabel,
		contentTypeLabel,
		fromCategorySelectValue,
		getInstagramEmbedUrl,
		getTikTokEmbedUrl,
		getYouTubeEmbedUrl,
		numberFormatter,
		platformLabel,
		platformOrder,
		PRODUCTION_STAGES,
		toCategorySelectValue,
	} from "$lib/media-plan";
	import IdeaEditModal from '$lib/components/domain/IdeaEditModal.svelte';
	import AISuggestModal from '$lib/components/domain/AISuggestModal.svelte';

	const CONTENT_CATEGORY_OPTIONS = [
		{ value: "" as const, label: "ไม่ระบุ" },
		...CONTENT_CATEGORY_ORDER.map((category) => ({
			value: category as BacklogContentCategory,
			label: contentCategoryLabel[category],
		})),
	];
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
		let totalViews = 0;
		for (const idea of ideas) {
			platformCount[idea.platform] = (platformCount[idea.platform] ?? 0) + 1;
			if (idea.view_count) totalViews += idea.view_count;
		}
		const stageCount: Record<string, number> = { planned: 0, scripting: 0, shooting: 0, editing: 0, published: 0 };
		for (const { status } of scheduledCalendarMap.values()) {
			if (status in stageCount) stageCount[status]++;
		}
		return { platformCount, stageCount, totalIdeas: ideas.length, totalViews };
	});
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
	let manualUrl = $state("");
	let manualPlatform = $state<SupportedPlatform>("youtube");
	let manualContentType = $state<BacklogContentType>("video");
	let manualCategory = $state<BacklogContentCategory | "">("");
	let manualTitle = $state("");
	let manualDescription = $state("");
	let manualAuthorName = $state("");
	let manualThumbnailUrl = $state("");
	let manualPublishedAt = $state("");
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
	const contentTypeOptions = ["video", "post", "image"] as const;
	const platformOptions = platformOrder as readonly SupportedPlatform[];


	function plainTextContent(value: string): string {
		return value
			.replace(/```[\s\S]*?```/g, " ")
			.replace(/`([^`]+)`/g, "$1")
			.replace(/!\[[^\]]*\]\([^)]+\)/g, " ")
			.replace(/\[([^\]]+)\]\(([^)]+)\)/g, "$1")
			.replace(/^#{1,6}\s+/gm, "")
			.replace(/^\s*>\s?/gm, "")
			.replace(/^\s*[-*+]\s+/gm, "")
			.replace(/^\s*\d+\.\s+/gm, "")
			.replace(/\*\*([^*]+)\*\*/g, "$1")
			.replace(/__([^_]+)__/g, "$1")
			.replace(/[*_~|]/g, " ")
			.replace(/\s+/g, " ")
			.trim();
	}

	function scrollToTop() {
		window.scrollTo({ top: 0, behavior: "smooth" });
	}

	function platformFrameClass(
		platform: IdeaBacklogRow["platform"] | null | undefined,
	): string {
		if (platform === "instagram") return "platform-frame--instagram";
		if (platform === "tiktok") return "platform-frame--tiktok";
		if (platform === "youtube") return "platform-frame--youtube";
		if (platform === "facebook") return "platform-frame--facebook";
		return "";
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
		manualUrl = "";
		manualPlatform = "youtube";
		manualContentType = "video";
		manualCategory = "";
		manualTitle = "";
		manualDescription = "";
		manualAuthorName = "";
		manualThumbnailUrl = "";
		manualPublishedAt = "";
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

	function normalizePublishedAt(value: string): string | null {
		const normalized = value.trim();
		if (!normalized) return null;

		const parsed = new Date(normalized);
		if (Number.isNaN(parsed.getTime())) return null;
		return parsed.toISOString();
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

		const rawUrl = manualUrl.trim();
		const normalizedUrl = rawUrl || null;

		if (normalizedUrl) {
			try {
				const parsed = new URL(normalizedUrl);
				if (!["http:", "https:"].includes(parsed.protocol)) {
					toast.error("ลิงก์ต้องเป็น http/https เท่านั้น");
					return;
				}
			} catch {
				toast.error("ลิงก์ไม่ถูกต้อง");
				return;
			}
		}

		saving = true;

		if (normalizedUrl) {
			const existingIdea = ideas.find(
				(i) => i.url && i.url === normalizedUrl,
			);
			if (existingIdea) {
				toast.error(`ไอเดียลิงก์นี้มีอยู่ในระบบแล้ว (${backlogCode(existingIdea)})`);
				scrollToTop();
				saving = false;
				return;
			}
		}

		const payload = {
			url: normalizedUrl,
			platform: manualPlatform,
			content_type: manualContentType,
			title: normalizeOptionalText(manualTitle),
			description: normalizeOptionalText(manualDescription),
			author_name: normalizeOptionalText(manualAuthorName),
			thumbnail_url: normalizeOptionalText(manualThumbnailUrl),
			published_at: normalizePublishedAt(manualPublishedAt),
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
	<PageHeader
		eyebrow="BigLot Media Plan"
		title="Idea Backlog"
		subtitle="วางลิงก์แล้ว Analyze อัตโนมัติ หรือกรอกเองแบบ Manual ก็ได้ รองรับ YouTube / Facebook / Instagram / TikTok และเก็บได้ทั้ง Video, Post, Image"
	/>

	{#if !hasSupabaseConfig}
		<p class="alert">
			ตั้งค่า env ก่อนใช้งาน: <code>PUBLIC_SUPABASE_URL</code> และ
			<code>PUBLIC_SUPABASE_ANON_KEY</code>
		</p>
	{/if}

	{#if ideas.length > 0}
	<section class="dashboard">
		<div class="dash-cards">
			<StatsCard
				icon="💡"
				label="Ideas ในคลัง"
				value={dashboardStats.totalIdeas}
				variant="primary"
			/>
			<StatsCard
				icon="📅"
				label="Scheduled"
				value={scheduledCalendarMap.size}
				sub="{Math.round((scheduledCalendarMap.size / Math.max(ideas.length, 1)) * 100)}% of total"
				variant="success"
			/>
			<StatsCard
				icon="👁"
				label="Total Views"
				value={numberFormatter.format(dashboardStats.totalViews)}
			/>
		</div>
		<div class="dash-row">
			<div class="dash-group">
				<p class="dash-group-label">Platform</p>
				<div class="dash-pills">
					{#each platformOrder as p}
						{#if (dashboardStats.platformCount[p] ?? 0) > 0}
							<Badge variant="platform" value={p} />
							<span class="dash-pill-count">{dashboardStats.platformCount[p]}</span>
						{/if}
					{/each}
				</div>
			</div>
			<div class="dash-group">
				<p class="dash-group-label">Production Stage</p>
				<div class="dash-pills">
					{#each PRODUCTION_STAGES as stage}
						{#if (dashboardStats.stageCount[stage] ?? 0) > 0}
							<Badge variant="stage" value={stage} />
							<span class="dash-pill-count">{dashboardStats.stageCount[stage]}</span>
						{/if}
					{/each}
				</div>
			</div>
		</div>
	</section>
	{/if}

	<section class="panel">
		<div class="row">
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
			<Button variant="ai" onclick={() => { showSuggestModeModal = true; }}>
				✦ ช่วยคิด idea
			</Button>
		</div>
	</section>



	{#if draft}
		<section class="panel">
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


			<div class="row">
				<label for="content-type">Content Type</label>
				<select id="content-type" bind:value={selectedContentType}>
					{#each contentTypeOptions as option}
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
					rows={4}
					placeholder="ไอเดียที่ได้จากคอนเทนต์นี้ เช่น hook, visual style, CTA..."
				></textarea>
			</div>

			<Button variant="primary" onclick={saveIdea} loading={saving} disabled={!hasSupabaseConfig}>
				{saving ? "Saving..." : "Save To Backlog"}
			</Button>
		</section>
	{/if}

	<section class="panel">
		<details class="manual-dropdown" bind:open={manualExpanded}>
			<summary>
				<span>Create Manually</span>
				<small>กรอกเองแบบย่อ</small>
			</summary>

			<div class="manual-body">
				<div class="row">
					<label for="manual-url">Content Link</label>
					<input
						id="manual-url"
						bind:value={manualUrl}
						placeholder="(ไม่บังคับ) https://www.facebook.com/... หรือ https://www.instagram.com/p/..."
					/>
				</div>

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
							{#each contentTypeOptions as option}
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

				<div class="row-inline">
					<div class="row">
						<label for="manual-author">Creator / Account</label>
						<input
							id="manual-author"
							bind:value={manualAuthorName}
							placeholder="เช่น @biglot"
						/>
					</div>
					<div class="row">
						<label for="manual-published-at">Published At</label>
						<input
							id="manual-published-at"
							type="datetime-local"
							bind:value={manualPublishedAt}
						/>
					</div>
				</div>

				<div class="row">
					<label for="manual-thumbnail">Thumbnail URL</label>
					<input
						id="manual-thumbnail"
						bind:value={manualThumbnailUrl}
						placeholder="https://..."
					/>
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

	<section class="panel">
		<div class="list-head">
			<h2>Backlog ({ideas.length - publishedBacklogIds.size} active{publishedBacklogIds.size > 0 ? ` · ${publishedBacklogIds.size} published` : ''})</h2>
			<div style="display:flex;gap:0.5rem;align-items:center">
				{#if loadingIdeas}<Spinner size="sm" />{/if}
				{#if publishedBacklogIds.size > 0}
					<button
						class="toggle-btn {showPublished ? 'active' : ''}"
						onclick={() => (showPublished = !showPublished)}
					>{showPublished ? 'ซ่อน Published' : 'แสดง Published'}</button>
				{/if}
				{#if ideas.length > 0}
					<button class="export-btn" onclick={exportBacklogCSV}>Export CSV</button>
				{/if}
			</div>
		</div>

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
								{@const tiktokEmbedUrl =
									idea.platform === "tiktok" && idea.url
										? getTikTokEmbedUrl(idea.url)
										: null}
								{@const instagramEmbedUrl =
									idea.platform === "instagram" && idea.url
										? getInstagramEmbedUrl(idea.url)
										: null}
								{@const notesText =
									idea.notes ? plainTextContent(idea.notes) : null}
								<article
									class={`card ${platformFrameClass(idea.platform)}`}
									oncontextmenu={(event) => openContextMenu(event, idea)}
								>
									{#if tiktokEmbedUrl}
										<iframe
											class="card-media tiktok-frame"
											src={tiktokEmbedUrl}
											title="TikTok Backlog Preview"
											loading="lazy"
											allow="encrypted-media; picture-in-picture"
											allowfullscreen
										></iframe>
									{:else if instagramEmbedUrl}
										<iframe
											class="card-media instagram-frame"
											src={instagramEmbedUrl}
											title="Instagram Backlog Preview"
											loading="lazy"
											allow="encrypted-media; picture-in-picture"
											allowfullscreen
										></iframe>
									{:else if idea.thumbnail_url}
										<img
											class="card-media"
											src={idea.thumbnail_url}
											alt={idea.title ?? "thumbnail"}
										/>
									{/if}

									<div class="card-body">
										<div class="head-row">
											<div class="chip-row">
												{#if idea.content_category}
													<span class="category-chip category--{idea.content_category}">
														{contentCategoryLabel[idea.content_category]}
													</span>
												{/if}
												<span class="platform"
													>{idea.platform.toUpperCase()}</span
												>
												<span class="content-type"
													>{contentTypeLabel[
														idea.content_type ??
															"video"
													]}</span
												>
											</div>
											<div class="head-row-right">
												{#if scheduledBacklogIds.has(idea.id)}
													<span class="chip"
														>Scheduled</span
													>
												{/if}
												<button
													class="dot-menu-btn"
													onclick={(e) => { e.stopPropagation(); openContextMenu(e, idea); }}
													title="More options"
												>⋮</button>
											</div>
										</div>
										<h3>{backlogCode(idea)}</h3>
										<p class="idea-title">
											{idea.title ?? "Untitled idea"}
										</p>
										{#if notesText}
											<div class="notes-wrap">
												<p class="notes" title={notesText}>{notesText}</p>
											</div>
										{/if}

										{#if idea.url}
											<a
												class="link"
												href={idea.url}
												target="_blank"
												rel="noreferrer">{idea.url}</a
											>
										{:else}
											<p class="link link-muted">
												No content link
											</p>
										{/if}
										<div class="card-actions">
											<button
												class="pin-btn"
												onclick={() => togglePinnedState(idea)}
											>
												{idea.content_category === "pin" ? "Unpin" : "Pin"}
											</button>
											<button
												class="edit-btn"
												onclick={() => openEditModal(idea)}
											>
												Edit
											</button>
											<button
												class="danger"
												onclick={() => deleteIdea(idea)}
												disabled={deletingId === idea.id}
											>
												{deletingId === idea.id
													? "Deleting..."
													: "Delete"}
											</button>
										</div>
									</div>
								</article>
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
		gap: 1rem;
	}

	h1,
	h2,
	h3 {
		font-family: var(--font-heading);
	}

	.panel {
		padding: 1.25rem;
		border-radius: 1rem;
		background: rgba(255, 255, 255, 0.85);
		border: 1px solid var(--color-border);
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

	.manual-dropdown {
		border: 1px solid var(--color-border);
		border-radius: 0.8rem;
		padding: 0.35rem 0.65rem;
		background: rgba(255, 255, 255, 0.72);
	}

	.manual-dropdown summary {
		display: flex;
		align-items: center;
		justify-content: space-between;
		gap: 0.65rem;
		cursor: pointer;
		user-select: none;
		padding: 0.28rem 0;
		font-weight: 700;
		color: #1f2937;
	}

	.manual-dropdown summary small {
		font-size: 0.72rem;
		font-weight: 600;
		color: var(--color-slate-500);
	}

	.manual-body {
		padding-top: 0.8rem;
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
		border-radius: 0.7rem;
		border: 1px solid var(--color-border-strong);
		background: var(--color-bg-elevated);
	}

	#edit-notes {
		max-height: 420px;
		overflow-y: auto;
		resize: vertical;
	}

	.primary {
		width: 100%;
		border: 0;
		padding: 0.8rem;
		border-radius: 0.75rem;
		background: #2563eb;
		color: #fff;
		font-weight: 700;
		cursor: pointer;
	}

	.primary:disabled {
		opacity: 0.6;
		cursor: not-allowed;
	}

	.notice,
	.alert {
		padding: 0.8rem 0.95rem;
		border-radius: 0.8rem;
		font-size: 0.9rem;
	}

	.preview {
		display: grid;
		grid-template-columns: minmax(0, 280px) 1fr;
		gap: 1rem;
		align-items: start;
	}

	.preview-media,
	.card-media {
		width: 100%;
		aspect-ratio: 16 / 9;
		object-fit: cover;
		border-radius: 0.75rem;
		border: 1px solid rgba(15, 23, 42, 0.1);
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

	.metrics {
		display: grid;
		grid-template-columns: repeat(5, minmax(0, 1fr));
		gap: 0.6rem;
		margin: 1rem 0;
	}

	.metric-item {
		padding: 0.65rem;
		border-radius: 0.75rem;
		background: rgba(15, 23, 42, 0.04);
		border: 1px solid var(--color-border);
	}

	.metric-item input {
		border: 0;
		background: transparent;
		padding: 0;
		font-weight: 700;
		font-size: 1.02rem;
	}

	.metric-item label {
		font-size: 0.74rem;
	}

	.list-head {
		display: flex;
		justify-content: space-between;
		align-items: center;
		margin-bottom: 1rem;
		gap: 0.7rem;
	}

	.empty {
		text-align: center;
		color: var(--color-slate-500);
		padding: 1.5rem;
	}

	.category-label-row {
		display: flex;
		align-items: center;
		justify-content: space-between;
		gap: 0.75rem;
	}

	.category-groups {
		display: grid;
		gap: 1rem;
	}

	.category-group {
		border: 1px solid var(--color-border);
		border-radius: 0.9rem;
		background: rgba(248, 250, 252, 0.72);
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

	.card {
		--platform-frame-color: rgba(15, 23, 42, 0.1);
		background: var(--color-bg-elevated);
		border-radius: 0.95rem;
		border: 1px solid var(--platform-frame-color);
		padding: 0.7rem;
		display: grid;
		gap: 0.7rem;
	}

	.platform-frame--instagram {
		--platform-frame-color: #ec4899;
	}

	.platform-frame--tiktok {
		--platform-frame-color: #111111;
	}

	.platform-frame--youtube {
		--platform-frame-color: #dc2626;
	}

	.platform-frame--facebook {
		--platform-frame-color: #1877f2;
	}

	.card-body {
		display: grid;
		gap: 0.55rem;
	}

	.head-row {
		display: flex;
		justify-content: space-between;
		align-items: center;
		gap: 0.35rem;
		flex-wrap: wrap;
	}

	.head-row-right {
		display: flex;
		align-items: center;
		gap: 0.3rem;
	}

	.dot-menu-btn {
		background: none;
		border: none;
		padding: 0.15rem 0.4rem;
		border-radius: 0.4rem;
		font-size: 1.1rem;
		line-height: 1;
		cursor: pointer;
		color: var(--color-slate-400);
		transition: background var(--transition-fast), color 0.15s;
	}

	.dot-menu-btn:hover {
		background: rgba(15, 23, 42, 0.07);
		color: var(--color-slate-700);
	}

	.chip {
		padding: 0.12rem 0.48rem;
		border-radius: var(--radius-full);
		font-size: 0.7rem;
		font-weight: 700;
		background: rgba(22, 163, 74, 0.12);
		color: #166534;
	}

	.card h3 {
		margin: 0;
		font-size: 1rem;
	}

	.idea-title {
		margin: 0;
		font-size: 0.84rem;
		color: var(--color-slate-600);
		line-height: 1.45;
		display: -webkit-box;
		-webkit-line-clamp: 2;
		line-clamp: 2;
		-webkit-box-orient: vertical;
		overflow: hidden;
	}

	.notes-wrap {
		max-height: 5.9rem;
		overflow-y: auto;
		padding-right: 0.25rem;
		scrollbar-width: thin;
		scrollbar-color: rgba(148, 163, 184, 0.7) transparent;
	}

	.notes-wrap::-webkit-scrollbar {
		width: 0.35rem;
	}

	.notes-wrap::-webkit-scrollbar-thumb {
		background: rgba(148, 163, 184, 0.7);
		border-radius: var(--radius-full);
	}

	.notes {
		margin: 0;
		font-size: 0.85rem;
		color: var(--color-slate-600);
		line-height: 1.55;
	}

	.link {
		font-size: 0.8rem;
		color: var(--color-blue-600);
		white-space: nowrap;
		overflow: hidden;
		text-overflow: ellipsis;
		text-decoration: none;
	}

	.link-muted {
		margin: 0;
		color: var(--color-slate-400);
	}

	.card-actions {
		display: flex;
		gap: 0.4rem;
	}

	.pin-btn {
		flex: 1;
		border: 1px solid rgba(180, 83, 9, 0.24);
		background: rgba(180, 83, 9, 0.08);
		color: #92400e;
		padding: 0.45rem 0.6rem;
		border-radius: 0.6rem;
		font-weight: 700;
		cursor: pointer;
	}

	.edit-btn {
		flex: 1;
		border: 1px solid rgba(37, 99, 235, 0.24);
		background: rgba(37, 99, 235, 0.08);
		color: var(--color-primary);
		padding: 0.45rem 0.6rem;
		border-radius: 0.6rem;
		font-weight: 700;
		cursor: pointer;
	}

	.danger {
		flex: 1;
		border: 1px solid rgba(220, 38, 38, 0.24);
		background: rgba(220, 38, 38, 0.08);
		color: #b91c1c;
		padding: 0.45rem 0.6rem;
		border-radius: 0.6rem;
		font-weight: 700;
		cursor: pointer;
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
		border: 1px solid rgba(15, 23, 42, 0.12);
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
		border: 1px solid rgba(15, 23, 42, 0.12);
		padding: 0.55rem;
		border-radius: 0.6rem;
		background: var(--color-bg-elevated);
		color: var(--color-slate-600);
		font-weight: 700;
		font-size: 0.82rem;
		cursor: pointer;
	}


	/* ── Dashboard ── */
	.dashboard {
		display: grid;
		gap: 0.65rem;
	}

	.dash-cards {
		display: grid;
		grid-template-columns: repeat(3, 1fr);
		gap: 0.6rem;
	}

	.dash-row {
		display: grid;
		grid-template-columns: 1fr 1fr;
		gap: 0.6rem;
	}

	.dash-group {
		background: rgba(255, 255, 255, 0.85);
		border: 1px solid var(--color-border);
		border-radius: 0.9rem;
		padding: 0.75rem 0.9rem;
		display: grid;
		gap: 0.45rem;
	}

	.dash-group-label {
		margin: 0;
		font-size: 0.7rem;
		text-transform: uppercase;
		letter-spacing: 0.08em;
		font-weight: 700;
		color: var(--color-slate-400);
	}

	.dash-pills {
		display: flex;
		flex-wrap: wrap;
		gap: 0.35rem;
	}

	.dash-pill-count {
		font-size: var(--text-sm);
		font-weight: var(--fw-bold);
		color: var(--color-slate-700);
		min-width: 1.2rem;
		text-align: center;
	}

	@media (max-width: 900px) {
		.preview {
			grid-template-columns: 1fr;
		}

		.metrics {
			grid-template-columns: repeat(2, minmax(0, 1fr));
		}

		.row-inline {
			grid-template-columns: 1fr;
		}

		.dash-cards {
			grid-template-columns: 1fr 1fr;
		}

		.dash-row {
			grid-template-columns: 1fr;
		}

	}

	@media (max-width: 640px) {
		.list-head,
		.panel-actions,
		.card-actions {
			flex-direction: column;
			align-items: stretch;
		}

		.grid {
			grid-template-columns: 1fr;
		}

		.dash-cards {
			grid-template-columns: 1fr;
		}

		.metrics {
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

		.primary,
		.ai-suggest-btn,
		.export-btn,
		.toggle-btn,
		.edit-btn,
		.danger,
		.modal-cancel {
			width: 100%;
		}
	}

	.export-btn {
		border: 1px solid var(--color-border-strong);
		background: rgba(15, 23, 42, 0.04);
		color: var(--color-slate-600);
		padding: 0.3rem 0.7rem;
		border-radius: 0.55rem;
		font-size: 0.75rem;
		font-weight: 700;
		cursor: pointer;
		white-space: nowrap;
	}

	.export-btn:hover {
		background: rgba(15, 23, 42, 0.08);
	}

	.toggle-btn {
		border: 1px solid rgba(22, 163, 74, 0.25);
		background: rgba(22, 163, 74, 0.07);
		color: #166534;
		padding: 0.3rem 0.7rem;
		border-radius: 0.55rem;
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

	.panel-actions {
		display: flex;
		gap: 0.5rem;
		flex-wrap: wrap;
	}

	.ai-suggest-btn {
		background: linear-gradient(135deg, #6366f1, #8b5cf6);
		color: #fff;
		border: none;
		padding: 0.55rem 1.1rem;
		border-radius: 0.6rem;
		font-size: 0.88rem;
		font-weight: 600;
		cursor: pointer;
		transition: opacity 0.15s;
	}

	.ai-suggest-btn:hover:not(:disabled) { opacity: 0.88; }
	.ai-suggest-btn:disabled { opacity: 0.55; cursor: not-allowed; }

	.category-chip {
		font-size: 0.7rem;
		font-weight: 700;
		padding: 0.18rem 0.5rem;
		border-radius: 0.35rem;
		text-transform: uppercase;
		letter-spacing: 0.04em;
	}

	.category--hero { background: rgba(220, 38, 38, 0.1); color: #b91c1c; }
	.category--hub { background: rgba(37, 99, 235, 0.1); color: var(--color-primary); }
	.category--help { background: rgba(22, 163, 74, 0.1); color: #15803d; }
	.category--pin { background: rgba(180, 83, 9, 0.12); color: #92400e; }

	/* Auto-categorize */
	.category-suggest-label {
		font-size: 0.78rem;
		font-weight: 600;
		color: #92400e;
		white-space: nowrap;
	}
</style>
