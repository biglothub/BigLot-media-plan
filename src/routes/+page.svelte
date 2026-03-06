<script lang="ts">
	import { onMount } from "svelte";
	import { marked } from "marked";
	import { hasSupabaseConfig, supabase } from "$lib/supabase";
	import type {
		BacklogContentCategory,
		BacklogContentType,
		EnrichResult,
		IdeaBacklogRow,
		SupportedPlatform,
	} from "$lib/types";
	import {
		contentCategoryLabel,
		contentTypeLabel,
		getInstagramEmbedUrl,
		getTikTokEmbedUrl,
		getYouTubeEmbedUrl,
		numberFormatter,
		platformLabel,
		platformOrder,
		PRODUCTION_STAGES,
		stageLabel,
	} from "$lib/media-plan";

	const CONTENT_CATEGORY_ORDER = ["pin", "hero", "hub", "help"] as const satisfies readonly BacklogContentCategory[];
	const CONTENT_CATEGORY_OPTIONS = [
		{ value: "", label: "ไม่ระบุ" },
		...CONTENT_CATEGORY_ORDER.map((category) => ({
			value: category,
			label: contentCategoryLabel[category],
		})),
	] as const;
	type SuggestedContentCategory = Exclude<BacklogContentCategory, "pin">;
	type IdeaGroup = {
		key: string;
		label: string;
		items: IdeaBacklogRow[];
	};

	function toCategorySelectValue(
		value: BacklogContentCategory | null | undefined,
	): BacklogContentCategory | "" {
		return value ?? "";
	}

	function fromCategorySelectValue(
		value: BacklogContentCategory | "",
	): BacklogContentCategory | null {
		return value || null;
	}

	let linkInput = $state("");
	let notes = $state("");
	let loadingIdeas = $state(false);
	let enriching = $state(false);
	let saving = $state(false);
	let deletingId = $state<string | null>(null);
	let message = $state("");
	let errorMessage = $state("");
	let draft = $state<EnrichResult | null>(null);
	let ideas = $state<IdeaBacklogRow[]>([]);
	let scheduledCalendarMap = $state<Map<string, { id: string; shoot_date: string; status: string }>>(new Map());
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

	// AI Suggest Ideas modal state
	type IdeaSuggestion = {
		title: string;
		description: string;
		platform: string;
		content_category: SuggestedContentCategory;
		reason: string;
	};
	let showSuggestModeModal = $state(false);
	let showCustomPromptModal = $state(false);
	let showSuggestModal = $state(false);
	let suggestLoading = $state(false);
	let suggestions = $state<IdeaSuggestion[]>([]);
	let suggestError = $state('');
	let acceptingIndex = $state<number | null>(null);
	let customPrompt = $state('');
	let customPromptError = $state('');

	// AI Content Plan state (used in Edit modal)
	let generatingPlan = $state(false);
	let planContext = $state('');
	let planError = $state('');
	let showPlanExpanded = $state(false);

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
	let editForm = $state({
		url: '',
		platform: 'youtube' as SupportedPlatform,
		content_type: 'video' as BacklogContentType,
		content_category: '' as BacklogContentCategory | '',
		title: '',
		description: '',
		author_name: '',
		thumbnail_url: '',
		published_at: '',
		notes: '',
		shoot_date: '',
		views: null as number | null,
		likes: null as number | null,
		comments: null as number | null,
		shares: null as number | null,
		saves: null as number | null,
	});
	let notesViewMode = $state<'edit' | 'preview'>('edit');
	const notesRendered = $derived(editForm.notes ? marked.parse(editForm.notes) as string : '');
	let savingEdit = $state(false);

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

	function backlogCode(
		idea: Pick<IdeaBacklogRow, "id" | "idea_code">,
	): string {
		const code = idea.idea_code?.trim();
		return code ? code : `BL-${idea.id.slice(0, 8).toUpperCase()}`;
	}

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

	async function loadIdeas() {
		if (!supabase) return;
		loadingIdeas = true;
		errorMessage = "";

		const { data, error } = await supabase
			.from("idea_backlog")
			.select("*")
			.order("created_at", { ascending: false });

		loadingIdeas = false;

		if (error) {
			errorMessage = `โหลด backlog ไม่ได้: ${error.message}`;
			return;
		}

		ideas = (data ?? []) as IdeaBacklogRow[];
	}

	async function loadScheduledBacklogIds() {
		if (!supabase) return;

		const { data, error } = await supabase
			.from("production_calendar")
			.select("id, backlog_id, shoot_date, status");
		if (error) {
			errorMessage = `โหลดสถานะ schedule ไม่ได้: ${error.message}`;
			return;
		}

		scheduledCalendarMap = new Map(
			(data ?? []).map((item) => [
				item.backlog_id as string,
				{ id: item.id as string, shoot_date: item.shoot_date as string, status: item.status as string },
			]),
		);
	}

	async function analyzeLink() {
		message = "";
		errorMessage = "";
		clearState();

		if (!linkInput.trim()) {
			errorMessage = "กรุณาวางลิงก์ก่อน";
			return;
		}

		enriching = true;
		try {
			const response = await fetch(
				`/api/enrich?url=${encodeURIComponent(linkInput.trim())}`,
			);
			const body = await response.json();

			if (!response.ok) {
				errorMessage = body.error ?? "อ่านข้อมูลจากลิงก์ไม่สำเร็จ";
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
			message = "ดึงข้อมูลสำเร็จแล้ว ตรวจค่า engagement ก่อนบันทึกได้เลย";
			setTimeout(() => { message = ""; }, 4000);

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
			errorMessage =
				error instanceof Error
					? error.message
					: "เกิดข้อผิดพลาดระหว่าง analyze link";
		} finally {
			enriching = false;
		}
	}

	async function saveIdea() {
		if (!supabase) {
			errorMessage = "ยังไม่ได้ตั้งค่า Supabase";
			return;
		}

		if (!draft) {
			errorMessage = "ยังไม่มีข้อมูลจากการ analyze ลิงก์";
			return;
		}

		saving = true;
		errorMessage = "";
		message = "";

		const existingIdea = ideas.find((i) => i.url && i.url === draft?.url);
		if (existingIdea) {
			errorMessage = `ไอเดียลิงก์นี้มีอยู่ในระบบแล้ว (${backlogCode(existingIdea)})`;
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
			errorMessage = `บันทึกไม่สำเร็จ: ${error.message}`;
			scrollToTop();
			return;
		}

		message = "บันทึกเข้า backlog แล้ว";
		setTimeout(() => { message = ""; }, 4000);
		scrollToTop();
		linkInput = "";
		clearState();
		await loadIdeas();
	}

	async function saveManualIdea() {
		if (!supabase) {
			errorMessage = "ยังไม่ได้ตั้งค่า Supabase";
			return;
		}

		const rawUrl = manualUrl.trim();
		const normalizedUrl = rawUrl || null;

		if (normalizedUrl) {
			try {
				const parsed = new URL(normalizedUrl);
				if (!["http:", "https:"].includes(parsed.protocol)) {
					errorMessage = "ลิงก์ต้องเป็น http/https เท่านั้น";
					return;
				}
			} catch {
				errorMessage = "ลิงก์ไม่ถูกต้อง";
				return;
			}
		}

		saving = true;
		errorMessage = "";
		message = "";

		if (normalizedUrl) {
			const existingIdea = ideas.find(
				(i) => i.url && i.url === normalizedUrl,
			);
			if (existingIdea) {
				errorMessage = `ไอเดียลิงก์นี้มีอยู่ในระบบแล้ว (${backlogCode(existingIdea)})`;
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
			errorMessage = `บันทึกไม่สำเร็จ: ${error.message}`;
			scrollToTop();
			return;
		}

		message = "บันทึกไอเดียที่สร้างเองเข้า backlog แล้ว";
		setTimeout(() => { message = ""; }, 4000);
		scrollToTop();
		clearManualState();
		manualExpanded = false;
		await loadIdeas();
	}

	async function deleteIdea(idea: IdeaBacklogRow) {
		if (!supabase) {
			errorMessage = "ยังไม่ได้ตั้งค่า Supabase";
			return;
		}

		const confirmed = window.confirm(
			`ลบ backlog นี้ใช่ไหม?\n${backlogCode(idea)} • ${idea.title ?? idea.url ?? "No link"}`,
		);
		if (!confirmed) return;

		deletingId = idea.id;
		errorMessage = "";
		message = "";

		const { data, error } = await supabase
			.from("idea_backlog")
			.delete()
			.eq("id", idea.id)
			.select("id");
		deletingId = null;

		if (error) {
			errorMessage = `ลบไม่สำเร็จ: ${error.message}`;
			scrollToTop();
			return;
		}

		if (!data || data.length === 0) {
			errorMessage = `ลบไม่สำเร็จ: ระบบไม่ได้รับอนุญาตให้ลบรายการนี้ (RLS policy blocked)`;
			scrollToTop();
			await loadIdeas();
			return;
		}

		message = "ลบออกจาก backlog แล้ว";
		setTimeout(() => { message = ""; }, 4000);
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
		errorMessage = "";

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
			errorMessage = `วางแผนใน calendar ไม่สำเร็จ: ${error.message}`;
			scrollToTop();
			return;
		}

		message = `${backlogCode(contextMenuIdea)} ถูกจัดลงตาราง ${scheduleDate} แล้ว`;
		setTimeout(() => { message = ''; }, 4000);
		scrollToTop();
		await loadScheduledBacklogIds();
	}

	async function togglePinnedState(idea: IdeaBacklogRow) {
		if (!supabase) {
			errorMessage = "ยังไม่ได้ตั้งค่า Supabase";
			return;
		}

		errorMessage = "";
		message = "";
		const nextCategory = idea.content_category === "pin" ? null : "pin";
		const { error } = await supabase
			.from("idea_backlog")
			.update({ content_category: nextCategory })
			.eq("id", idea.id);

		if (error) {
			errorMessage = `อัปเดต category ไม่สำเร็จ: ${error.message}`;
			scrollToTop();
			return;
		}

		message = nextCategory === "pin"
			? `${backlogCode(idea)} ถูก pin แล้ว`
			: `${backlogCode(idea)} ถูกเอาออกจาก pin แล้ว`;
		setTimeout(() => { message = ""; }, 4000);
		if (contextMenuIdea?.id === idea.id) closeContextMenu();
		await loadIdeas();
	}

	function openEditModal(idea: IdeaBacklogRow) {
		editingIdea = idea;
		const calEntry = scheduledCalendarMap.get(idea.id);
		editForm = {
			url: idea.url ?? '',
			platform: idea.platform,
			content_type: idea.content_type ?? 'video',
			content_category: toCategorySelectValue(idea.content_category),
			title: idea.title ?? '',
			description: idea.description ?? '',
			author_name: idea.author_name ?? '',
			thumbnail_url: idea.thumbnail_url ?? '',
			published_at: idea.published_at
				? new Date(idea.published_at).toISOString().slice(0, 16)
				: '',
			notes: idea.notes ?? '',
			shoot_date: calEntry?.shoot_date ?? '',
			views: idea.view_count,
			likes: idea.like_count,
			comments: idea.comment_count,
			shares: idea.share_count,
			saves: idea.save_count,
		};
	}

	function closeEditModal() {
		editingIdea = null;
	}

	async function saveEdit() {
		if (!supabase || !editingIdea) return;
		savingEdit = true;
		errorMessage = '';
		message = '';

		const rawUrl = editForm.url.trim();
		if (rawUrl) {
			try {
				const parsed = new URL(rawUrl);
				if (!['http:', 'https:'].includes(parsed.protocol)) {
					errorMessage = 'ลิงก์ต้องเป็น http/https เท่านั้น';
					savingEdit = false;
					return;
				}
			} catch {
				errorMessage = 'ลิงก์ไม่ถูกต้อง';
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
			published_at: editForm.published_at
				? new Date(editForm.published_at).toISOString()
				: null,
			view_count: editForm.views,
			like_count: editForm.likes,
			comment_count: editForm.comments,
			share_count: editForm.shares,
			save_count: editForm.saves,
			notes: editForm.notes.trim() || null,
		};

		const { error } = await supabase
			.from('idea_backlog')
			.update(payload)
			.eq('id', editingIdea.id);

		if (error) {
			savingEdit = false;
			errorMessage = `แก้ไขไม่สำเร็จ: ${error.message}`;
			return;
		}

		if (editForm.shoot_date) {
			const { error: calError } = await supabase
				.from('production_calendar')
				.upsert(
					{ backlog_id: editingIdea.id, shoot_date: editForm.shoot_date, status: 'planned' },
					{ onConflict: 'backlog_id' },
				);
			if (calError) {
				savingEdit = false;
				errorMessage = `แก้ไข backlog สำเร็จ แต่บันทึก shoot date ไม่ได้: ${calError.message}`;
				return;
			}
		}

		savingEdit = false;
		message = 'แก้ไข backlog เรียบร้อยแล้ว';
		setTimeout(() => { message = ''; }, 4000);
		closeEditModal();
		await Promise.all([loadIdeas(), loadScheduledBacklogIds()]);
	}

	async function generateContentPlan() {
		if (!editingIdea) return;

		// ถ้า Notes มีข้อมูลอยู่แล้ว ให้ถามก่อน
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
					title: editForm.title || editingIdea.title,
					description: editForm.description || editingIdea.description,
					platform: editForm.platform,
					content_category: fromCategorySelectValue(editForm.content_category),
					context: planContext.trim() || undefined,
				}),
			});
			const data = await res.json();
			if (res.ok && data.plan) {
				editForm.notes = data.plan;
				notesViewMode = 'preview';
				// Auto-save notes to Supabase without closing modal
				if (supabase && editingIdea) {
					await supabase
						.from('idea_backlog')
						.update({ notes: data.plan.trim() || null })
						.eq('id', editingIdea.id);
				}
			} else {
				planError = data.error ?? 'Generate plan ไม่สำเร็จ';
			}
		} catch {
			planError = 'เชื่อมต่อ AI ไม่ได้';
		}
		generatingPlan = false;
	}

	async function suggestIdeas() {
		showSuggestModal = true;
		suggestLoading = true;
		suggestError = '';
		suggestions = [];
		try {
			const res = await fetch('/api/openclaw/ai/suggest-ideas', { method: 'POST' });
			const body = await res.json();
			if (!res.ok) {
				suggestError = body.error ?? 'เกิดข้อผิดพลาด';
			} else {
				suggestions = body.suggestions ?? [];
			}
		} catch {
			suggestError = 'เชื่อมต่อ AI ไม่ได้ กรุณาลองใหม่';
		}
		suggestLoading = false;
	}

	async function suggestIdeasWithPrompt(prompt: string) {
		showSuggestModal = true;
		suggestLoading = true;
		suggestError = '';
		suggestions = [];
		try {
			const res = await fetch('/api/openclaw/ai/suggest-ideas', {
				method: 'POST',
				headers: { 'Content-Type': 'application/json' },
				body: JSON.stringify({ prompt })
			});
			const body = await res.json();
			if (!res.ok) {
				suggestError = body.error ?? 'เกิดข้อผิดพลาด';
			} else {
				suggestions = body.suggestions ?? [];
			}
		} catch {
			suggestError = 'เชื่อมต่อ AI ไม่ได้ กรุณาลองใหม่';
		}
		suggestLoading = false;
	}

	async function acceptSuggestion(s: IdeaSuggestion, index: number) {
		acceptingIndex = index;
		try {
			const res = await fetch('/api/openclaw/ideas', {
				method: 'POST',
				headers: { 'Content-Type': 'application/json' },
				body: JSON.stringify({
					platform: s.platform,
					content_type: 'video',
					content_category: s.content_category,
					title: s.title,
					description: s.description,
				}),
			});
			if (res.ok) {
				suggestions = suggestions.filter((_, i) => i !== index);
				await loadIdeas();
				message = `เพิ่ม "${s.title}" เข้า Backlog แล้ว`;
				setTimeout(() => { message = ''; }, 4000);
			}
		} finally {
			acceptingIndex = null;
		}
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
</script>

<main class="page">
	<section class="hero">
		<p class="kicker">BigLot Media Plan</p>
		<h1>Idea Backlog</h1>
		<p class="subtitle">
			วางลิงก์แล้ว Analyze อัตโนมัติ หรือกรอกเองแบบ Manual ก็ได้ รองรับ
			YouTube / Facebook / Instagram / TikTok และเก็บได้ทั้ง Video, Post,
			Image
		</p>
	</section>

	{#if !hasSupabaseConfig}
		<p class="alert">
			ตั้งค่า env ก่อนใช้งาน: <code>PUBLIC_SUPABASE_URL</code> และ
			<code>PUBLIC_SUPABASE_ANON_KEY</code>
		</p>
	{/if}

	{#if ideas.length > 0}
	<section class="dashboard">
		<div class="dash-cards">
			<div class="dash-card">
				<p class="dash-value">{dashboardStats.totalIdeas}</p>
				<p class="dash-label">Ideas ในคลัง</p>
			</div>
			<div class="dash-card">
				<p class="dash-value">{scheduledCalendarMap.size}</p>
				<p class="dash-label">Scheduled</p>
			</div>
			<div class="dash-card">
				<p class="dash-value">{numberFormatter.format(dashboardStats.totalViews)}</p>
				<p class="dash-label">Total Views (backlog)</p>
			</div>
		</div>
		<div class="dash-row">
			<div class="dash-group">
				<p class="dash-group-label">Platform</p>
				<div class="dash-pills">
					{#each platformOrder as p}
						{#if (dashboardStats.platformCount[p] ?? 0) > 0}
							<span class="dash-pill platform-frame--{p}">{platformLabel[p]} <strong>{dashboardStats.platformCount[p]}</strong></span>
						{/if}
					{/each}
				</div>
			</div>
			<div class="dash-group">
				<p class="dash-group-label">Production Stage</p>
				<div class="dash-pills">
					{#each PRODUCTION_STAGES as stage}
						{#if (dashboardStats.stageCount[stage] ?? 0) > 0}
							<span class="dash-pill stage--{stage}">{stageLabel[stage]} <strong>{dashboardStats.stageCount[stage]}</strong></span>
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
			<button class="primary" onclick={analyzeLink} disabled={enriching}>
				{enriching ? "Analyzing..." : "Analyze Link"}
			</button>
			<button class="ai-suggest-btn" onclick={() => { showSuggestModeModal = true; customPrompt = ''; }} disabled={suggestLoading}>
				✦ ช่วยคิด idea
			</button>
		</div>
	</section>

	{#if message}
		<p class="notice success">{message}</p>
	{/if}

	{#if errorMessage}
		<p class="notice error">{errorMessage}</p>
	{/if}

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

			<button
				class="primary"
				onclick={saveIdea}
				disabled={saving || !hasSupabaseConfig}
			>
				{saving ? "Saving..." : "Save To Backlog"}
			</button>
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

				<button
					class="primary"
					onclick={saveManualIdea}
					disabled={saving || !hasSupabaseConfig}
				>
					{saving ? "Saving..." : "Save Manual Idea"}
				</button>
			</div>
		</details>
	</section>

	<section class="panel">
		<div class="list-head">
			<h2>Backlog ({ideas.length - publishedBacklogIds.size} active{publishedBacklogIds.size > 0 ? ` · ${publishedBacklogIds.size} published` : ''})</h2>
			<div style="display:flex;gap:0.5rem;align-items:center">
				{#if loadingIdeas}<span>Loading...</span>{/if}
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

	{#if showSuggestModeModal}
		<!-- svelte-ignore a11y_no_static_element_interactions -->
		<div class="modal-overlay" onclick={() => { showSuggestModeModal = false; }} onkeydown={(e) => { if (e.key === 'Escape') showSuggestModeModal = false; }}></div>
		<!-- svelte-ignore a11y_no_static_element_interactions -->
		<div class="modal-box" onclick={(e) => e.stopPropagation()} onkeydown={() => {}} style="max-width: 480px;">
			<div class="modal-header">
				<div class="modal-title">
					<p class="modal-code">ช่วยคิด IDEA</p>
					<h3>เลือกวิธีการ</h3>
				</div>
				<button class="modal-close" onclick={() => { showSuggestModeModal = false; }}>✕</button>
			</div>

			<div style="display: grid; gap: 0.8rem;">
				<button
					class="primary"
					onclick={() => {
						showSuggestModeModal = false;
						suggestIdeas();
					}}
				>
					✦ ให้ AI เสนอแนะ (Suggest Ideas)
				</button>
				<button
					class="modal-cancel"
					onclick={() => {
						showSuggestModeModal = false;
						showCustomPromptModal = true;
						customPrompt = '';
						customPromptError = '';
					}}
					style="background: rgba(99, 102, 241, 0.08); color: #4f46e5; border: 1px solid rgba(99, 102, 241, 0.2);"
				>
					✏️ พิมพ์ prompt เอง (Manual)
				</button>
			</div>
		</div>
	{/if}

	{#if showCustomPromptModal}
		<!-- svelte-ignore a11y_no_static_element_interactions -->
		<div class="modal-overlay" onclick={() => { showCustomPromptModal = false; }} onkeydown={(e) => { if (e.key === 'Escape') showCustomPromptModal = false; }}></div>
		<!-- svelte-ignore a11y_no_static_element_interactions -->
		<div class="modal-box" onclick={(e) => e.stopPropagation()} onkeydown={() => {}} style="max-width: 520px;">
			<div class="modal-header">
				<div class="modal-title">
					<p class="modal-code">CUSTOM PROMPT</p>
					<h3>พิมพ์ได้ตามใจ</h3>
				</div>
				<button class="modal-close" onclick={() => { showCustomPromptModal = false; }}>✕</button>
			</div>

			<div style="display: grid; gap: 0.6rem;">
				<label style="font-size: 0.9rem; color: #475569;">
					ป้อน prompt เพื่อให้ AI เสนอ idea ตามที่ต้องการ
				</label>
				<textarea
					bind:value={customPrompt}
					placeholder="เช่น 'ช่วยคิด idea สำหรับ TikTok เกี่ยวกับ forex trading tips' หรือ 'idea สำหรับ YouTube Shorts เรื่องการ์ตูน'"
					rows={5}
					style="max-height: 200px; overflow-y: auto;"
				></textarea>
				{#if customPromptError}
					<p class="notice error" style="margin: 0;">{customPromptError}</p>
				{/if}
			</div>

			<div style="display: grid; grid-template-columns: 1fr 1fr; gap: 0.6rem; margin-top: 0.8rem;">
				<button class="modal-cancel" onclick={() => { showCustomPromptModal = false; }}>
					Cancel
				</button>
				<button
					class="primary"
					onclick={async () => {
						if (!customPrompt.trim()) {
							customPromptError = 'กรุณากรอก prompt';
							return;
						}
						showCustomPromptModal = false;
						await suggestIdeasWithPrompt(customPrompt.trim());
					}}
				>
					ส่ง Prompt
				</button>
			</div>
		</div>
	{/if}

	{#if showSuggestModal}
		<!-- svelte-ignore a11y_no_static_element_interactions -->
		<div class="modal-overlay" onclick={() => { showSuggestModal = false; }} onkeydown={(e) => { if (e.key === 'Escape') showSuggestModal = false; }}></div>
		<!-- svelte-ignore a11y_no_static_element_interactions -->
		<div class="modal-box suggest-modal" onclick={(e) => e.stopPropagation()} onkeydown={() => {}}>
			<div class="modal-header">
				<div class="modal-title">
					<p class="modal-code">AI SUGGEST</p>
					<h3>ช่วยคิด Content Idea</h3>
				</div>
				<button class="modal-close" onclick={() => { showSuggestModal = false; }}>✕</button>
			</div>

			{#if suggestLoading}
				<div class="suggest-loading">
					<p class="suggest-loading-label">✦ AI กำลังคิด idea...</p>
					<div class="suggest-progress-track">
						<div class="suggest-progress-bar"></div>
					</div>
					<p class="suggest-loading-sub">กำลังวิเคราะห์ backlog และสร้าง ideas ที่เหมาะกับธุรกิจ IB</p>
				</div>
			{:else if suggestError}
				<p class="notice error">{suggestError}</p>
				<button class="primary" onclick={suggestIdeas}>ลองใหม่</button>
			{:else if suggestions.length === 0}
				<p class="suggest-empty">ไม่มี idea ที่แนะนำ ลองกด ช่วยคิด ใหม่อีกครั้ง</p>
				<button class="primary" onclick={suggestIdeas}>สร้าง idea ใหม่</button>
			{:else}
				<div class="suggest-list">
					{#each suggestions as s, i}
						<div class="suggest-card">
							<div class="suggest-card-header">
								<div class="chip-row">
									<span class="platform">{s.platform.toUpperCase()}</span>
									<span class="category-chip category--{s.content_category}">{s.content_category}</span>
								</div>
							</div>
							<p class="suggest-title">{s.title}</p>
							<p class="suggest-desc">{s.description}</p>
							<p class="suggest-reason">💡 {s.reason}</p>
							<div class="suggest-actions">
								<button
									class="suggest-accept"
									onclick={() => acceptSuggestion(s, i)}
									disabled={acceptingIndex === i}
								>
									{acceptingIndex === i ? 'กำลังเพิ่ม...' : '+ เพิ่มเข้า Backlog'}
								</button>
							</div>
						</div>
					{/each}
				</div>
				<button class="suggest-regenerate" onclick={suggestIdeas}>สร้าง idea ใหม่อีกชุด</button>
			{/if}
		</div>
	{/if}

	{#if editingIdea}
		<!-- svelte-ignore a11y_no_static_element_interactions -->
		<div class="modal-overlay" onclick={closeEditModal} onkeydown={(e) => { if (e.key === 'Escape') closeEditModal(); }}></div>
		<!-- svelte-ignore a11y_no_static_element_interactions -->
		<div class="modal-box" onclick={(e) => e.stopPropagation()} onkeydown={() => {}}>
			<div class="modal-header">
				<div class="modal-title">
					<p class="modal-code">{backlogCode(editingIdea)}</p>
					<h3>{editingIdea.title ?? 'Untitled idea'}</h3>
				</div>
				<button class="modal-close" onclick={closeEditModal}>✕</button>
			</div>

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
						{#each contentTypeOptions as option}
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
					<div class="suggest-progress-track" style="margin-bottom: 0.4rem;">
						<div class="suggest-progress-bar"></div>
					</div>
				{/if}
				{#if planError}
					<p class="plan-error">{planError}</p>
				{/if}
				{#if notesViewMode === 'preview' && editForm.notes}
					<div class="notes-preview-wrap">
						<!-- svelte-ignore a11y_click_events_have_key_events a11y_no_static_element_interactions -->
						<div class="notes-preview" onclick={() => { notesViewMode = 'edit'; }}>
							{@html notesRendered}
						</div>
						<button class="notes-expand-btn" onclick={() => { showPlanExpanded = true; }} title="ขยายเพื่ออ่าน">⤢</button>
					</div>
				{:else}
					<textarea id="edit-notes" bind:value={editForm.notes} rows={6} placeholder="กด Generate Plan เพื่อให้ AI วางแผนการถ่าย หรือกรอกเอง..."></textarea>
				{/if}
			</div>

			<div class="modal-footer">
				<button class="primary" onclick={saveEdit} disabled={savingEdit || !hasSupabaseConfig}>
					{savingEdit ? 'Saving...' : 'Save Changes'}
				</button>
				<button class="modal-cancel" onclick={closeEditModal}>Cancel</button>
			</div>
		</div>
	{/if}

{#if showPlanExpanded}
	<!-- svelte-ignore a11y_click_events_have_key_events a11y_no_static_element_interactions -->
	<div class="modal-overlay plan-expand-overlay" onclick={() => { showPlanExpanded = false; }}></div>
	<div class="modal-box plan-expand-box" onclick={(e) => e.stopPropagation()} onkeydown={(e) => { if (e.key === 'Escape') showPlanExpanded = false; }}>
		<div class="plan-expand-header">
			<span class="plan-expand-title">✦ Content Plan</span>
			<button class="modal-close" onclick={() => { showPlanExpanded = false; }}>✕</button>
		</div>
		<div class="plan-expand-body notes-preview">
			{@html notesRendered}
		</div>
	</div>
{/if}
</main>

<style>
	.page {
		display: grid;
		gap: 1rem;
	}

	.hero {
		text-align: center;
		padding: 1.5rem 0 0.5rem;
	}

	.kicker {
		font-size: 0.78rem;
		text-transform: uppercase;
		letter-spacing: 0.16em;
		color: #b45309;
		font-weight: 700;
		margin: 0;
	}

	h1,
	h2,
	h3 {
		font-family: "Space Grotesk", "Noto Sans Thai", sans-serif;
	}

	h1 {
		margin: 0.45rem 0;
		font-size: clamp(2rem, 5vw, 3rem);
	}

	.subtitle {
		margin: 0;
		color: #475569;
	}

	.panel {
		padding: 1.25rem;
		border-radius: 1rem;
		background: rgba(255, 255, 255, 0.85);
		border: 1px solid rgba(15, 23, 42, 0.08);
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
		border: 1px solid rgba(15, 23, 42, 0.08);
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
		color: #64748b;
	}

	.manual-body {
		padding-top: 0.8rem;
	}

	label {
		font-size: 0.86rem;
		color: #475569;
	}

	input,
	select,
	textarea {
		width: 100%;
		box-sizing: border-box;
		font: inherit;
		padding: 0.72rem 0.85rem;
		border-radius: 0.7rem;
		border: 1px solid rgba(15, 23, 42, 0.14);
		background: #fff;
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

	.notice.success {
		background: rgba(22, 163, 74, 0.12);
		color: #166534;
		border: 1px solid rgba(22, 163, 74, 0.22);
	}

	.notice.error,
	.alert {
		background: rgba(220, 38, 38, 0.1);
		color: #991b1b;
		border: 1px solid rgba(220, 38, 38, 0.2);
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
		background: #fff;
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
		border-radius: 999px;
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
		border-radius: 999px;
		font-size: 0.7rem;
		font-weight: 700;
		background: rgba(15, 118, 110, 0.12);
		color: #115e59;
	}

	.meta {
		margin: 0.25rem 0 0;
		color: #64748b;
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
		border: 1px solid rgba(15, 23, 42, 0.08);
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
		color: #64748b;
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
		border: 1px solid rgba(15, 23, 42, 0.08);
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
		color: #64748b;
		transition: transform 0.18s ease;
	}

	.group-count {
		padding: 0.18rem 0.6rem;
		border-radius: 999px;
		font-size: 0.75rem;
		font-weight: 700;
		color: #1d4ed8;
		background: rgba(37, 99, 235, 0.12);
	}

	.grid {
		display: grid;
		grid-template-columns: repeat(auto-fill, minmax(280px, 1fr));
		gap: 0.9rem;
	}

	.card {
		--platform-frame-color: rgba(15, 23, 42, 0.1);
		background: #fff;
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
		color: #94a3b8;
		transition: background 0.15s, color 0.15s;
	}

	.dot-menu-btn:hover {
		background: rgba(15, 23, 42, 0.07);
		color: #334155;
	}

	.chip {
		padding: 0.12rem 0.48rem;
		border-radius: 999px;
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
		color: #475569;
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
		border-radius: 999px;
	}

	.notes {
		margin: 0;
		font-size: 0.85rem;
		color: #475569;
		line-height: 1.55;
	}

	.link {
		font-size: 0.8rem;
		color: #2563eb;
		white-space: nowrap;
		overflow: hidden;
		text-overflow: ellipsis;
		text-decoration: none;
	}

	.link-muted {
		margin: 0;
		color: #94a3b8;
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
		color: #1d4ed8;
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
		background: #fff;
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
		color: #475569;
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
		color: #64748b;
		font-weight: 600;
	}

	.ctx-date-input {
		width: 100%;
		box-sizing: border-box;
		font: inherit;
		padding: 0.55rem 0.7rem;
		border-radius: 0.6rem;
		border: 1px solid rgba(15, 23, 42, 0.14);
		background: #fff;
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
		background: #fff;
		color: #475569;
		font-weight: 700;
		font-size: 0.82rem;
		cursor: pointer;
	}

	/* Edit Modal */
	.modal-overlay {
		position: fixed;
		inset: 0;
		z-index: 999;
		background: rgba(0, 0, 0, 0.45);
	}

	.modal-box {
		position: fixed;
		top: 1rem;
		left: 50%;
		transform: translateX(-50%);
		z-index: 1000;
		width: min(560px, calc(100vw - 2rem));
		max-height: calc(100vh - 2rem);
		overflow-y: auto;
		overscroll-behavior: contain;
		-webkit-overflow-scrolling: touch;
		background: #fff;
		border-radius: 1rem;
		padding: 1.5rem;
		display: grid;
		gap: 0.85rem;
		align-content: start;
	}

	.modal-header {
		display: flex;
		justify-content: space-between;
		align-items: flex-start;
		gap: 0.5rem;
	}

	.modal-title {
		display: grid;
		gap: 0.15rem;
		min-width: 0;
	}

	.modal-code {
		margin: 0;
		font-size: 0.72rem;
		font-weight: 700;
		color: #b45309;
		text-transform: uppercase;
		letter-spacing: 0.05em;
	}

	.modal-header h3 {
		margin: 0;
		font-size: 1.05rem;
		font-family: 'Space Grotesk', 'Noto Sans Thai', sans-serif;
		white-space: nowrap;
		overflow: hidden;
		text-overflow: ellipsis;
	}

	.modal-close {
		border: 0;
		background: transparent;
		font-size: 1rem;
		color: #64748b;
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

	.edit-row-inline {
		display: grid;
		grid-template-columns: repeat(2, minmax(0, 1fr));
		gap: 0.75rem;
	}

	.edit-metrics {
		display: grid;
		grid-template-columns: repeat(5, minmax(0, 1fr));
		gap: 0.5rem;
	}

	.edit-metric {
		padding: 0.55rem;
		border-radius: 0.7rem;
		background: rgba(15, 23, 42, 0.04);
		border: 1px solid rgba(15, 23, 42, 0.08);
	}

	.edit-metric input {
		border: 0;
		background: transparent;
		padding: 0;
		font-weight: 700;
		width: 100%;
		font-size: 0.95rem;
		font-family: inherit;
	}

	.edit-metric label {
		font-size: 0.73rem;
	}

	.modal-footer {
		display: flex;
		gap: 0.5rem;
		justify-content: flex-end;
		padding-top: 0.3rem;
	}

	.modal-cancel {
		border: 1px solid rgba(15, 23, 42, 0.14);
		background: #fff;
		color: #475569;
		padding: 0.6rem 1rem;
		border-radius: 0.68rem;
		font-weight: 700;
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

	.dash-card {
		background: rgba(255, 255, 255, 0.85);
		border: 1px solid rgba(15, 23, 42, 0.08);
		border-radius: 0.9rem;
		padding: 0.85rem 1rem;
		text-align: center;
	}

	.dash-value {
		margin: 0;
		font-size: 1.7rem;
		font-weight: 800;
		color: #0f172a;
		font-family: 'Space Grotesk', sans-serif;
		line-height: 1.1;
	}

	.dash-label {
		margin: 0.2rem 0 0;
		font-size: 0.72rem;
		color: #64748b;
		font-weight: 600;
		text-transform: uppercase;
		letter-spacing: 0.06em;
	}

	.dash-row {
		display: grid;
		grid-template-columns: 1fr 1fr;
		gap: 0.6rem;
	}

	.dash-group {
		background: rgba(255, 255, 255, 0.85);
		border: 1px solid rgba(15, 23, 42, 0.08);
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
		color: #94a3b8;
	}

	.dash-pills {
		display: flex;
		flex-wrap: wrap;
		gap: 0.35rem;
	}

	.dash-pill {
		padding: 0.22rem 0.6rem;
		border-radius: 999px;
		font-size: 0.72rem;
		background: rgba(15, 23, 42, 0.06);
		color: #475569;
		border: 1px solid rgba(15, 23, 42, 0.1);
	}

	.dash-pill.platform-frame--youtube { background: rgba(220, 38, 38, 0.1); color: #991b1b; border-color: rgba(220, 38, 38, 0.2); }
	.dash-pill.platform-frame--facebook { background: rgba(24, 119, 242, 0.1); color: #1d4ed8; border-color: rgba(24, 119, 242, 0.2); }
	.dash-pill.platform-frame--instagram { background: rgba(236, 72, 153, 0.1); color: #9d174d; border-color: rgba(236, 72, 153, 0.2); }
	.dash-pill.platform-frame--tiktok { background: rgba(17, 17, 17, 0.08); color: #334155; border-color: rgba(17, 17, 17, 0.15); }

	.dash-pill.stage--planned   { background: rgba(71, 85, 105, 0.1); color: #334155; border-color: rgba(71, 85, 105, 0.2); }
	.dash-pill.stage--scripting { background: rgba(109, 40, 217, 0.1); color: #5b21b6; border-color: rgba(109, 40, 217, 0.2); }
	.dash-pill.stage--shooting  { background: rgba(180, 83, 9, 0.1); color: #92400e; border-color: rgba(180, 83, 9, 0.2); }
	.dash-pill.stage--editing   { background: rgba(29, 78, 216, 0.1); color: #1e3a8a; border-color: rgba(29, 78, 216, 0.2); }
	.dash-pill.stage--published { background: rgba(22, 101, 52, 0.1); color: #14532d; border-color: rgba(22, 101, 52, 0.2); }

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

		.edit-row-inline {
			grid-template-columns: 1fr;
		}

		.edit-metrics {
			grid-template-columns: repeat(2, minmax(0, 1fr));
		}

		.modal-box {
			top: 0.75rem;
			width: min(560px, calc(100vw - 1.5rem));
			max-height: calc(100vh - 1.5rem);
			border-radius: 0.75rem;
		}
	}

	@media (max-width: 640px) {
		.list-head,
		.panel-actions,
		.card-actions,
		.modal-footer {
			flex-direction: column;
			align-items: stretch;
		}

		.grid {
			grid-template-columns: 1fr;
		}

		.dash-cards {
			grid-template-columns: 1fr;
		}

		.metrics,
		.edit-metrics {
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

		.modal-overlay {
			display: grid;
			place-items: end stretch;
		}

		.modal-box {
			top: auto;
			left: 0;
			right: 0;
			transform: none;
			max-width: none;
			max-height: 92vh;
			width: 100%;
			border-radius: 1rem 1rem 0 0;
			padding-bottom: calc(1.4rem + env(safe-area-inset-bottom, 0px));
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
		border: 1px solid rgba(15, 23, 42, 0.14);
		background: rgba(15, 23, 42, 0.04);
		color: #475569;
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

	/* AI Suggest */
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

	.ai-suggest-btn:hover:not(:disabled) {
		opacity: 0.88;
	}

	.ai-suggest-btn:disabled {
		opacity: 0.55;
		cursor: not-allowed;
	}

	.suggest-modal {
		max-width: 620px;
	}

	.suggest-loading {
		display: flex;
		flex-direction: column;
		align-items: center;
		gap: 0.6rem;
		padding: 2rem 0;
	}

	.suggest-loading-label {
		margin: 0;
		font-size: 0.95rem;
		font-weight: 600;
		color: #6366f1;
	}

	.suggest-loading-sub {
		margin: 0;
		font-size: 0.78rem;
		color: #94a3b8;
	}

	.suggest-progress-track {
		width: 100%;
		height: 6px;
		background: #e2e8f0;
		border-radius: 999px;
		overflow: hidden;
	}

	.suggest-progress-bar {
		height: 100%;
		border-radius: 999px;
		background: linear-gradient(90deg, #6366f1, #8b5cf6, #6366f1);
		background-size: 200% 100%;
		animation: progress-slide 1.4s ease-in-out infinite;
		width: 50%;
	}

	@keyframes progress-slide {
		0% { background-position: 200% 0; transform: translateX(-100%); }
		100% { background-position: -200% 0; transform: translateX(300%); }
	}

	@keyframes spin {
		to { transform: rotate(360deg); }
	}

	.suggest-empty {
		color: #94a3b8;
		font-size: 0.9rem;
		text-align: center;
		padding: 1rem 0;
	}

	.suggest-list {
		display: grid;
		gap: 0.75rem;
	}

	.suggest-card {
		border: 1px solid #e2e8f0;
		border-radius: 0.75rem;
		padding: 0.9rem 1rem;
		display: grid;
		gap: 0.4rem;
		background: #fafafa;
	}

	.suggest-card-header {
		display: flex;
		align-items: center;
		gap: 0.5rem;
	}

	.category-chip {
		font-size: 0.7rem;
		font-weight: 700;
		padding: 0.18rem 0.5rem;
		border-radius: 0.35rem;
		text-transform: uppercase;
		letter-spacing: 0.04em;
	}

	.category--hero {
		background: rgba(220, 38, 38, 0.1);
		color: #b91c1c;
	}

	.category--hub {
		background: rgba(37, 99, 235, 0.1);
		color: #1d4ed8;
	}

	.category--help {
		background: rgba(22, 163, 74, 0.1);
		color: #15803d;
	}

	.category--pin {
		background: rgba(180, 83, 9, 0.12);
		color: #92400e;
	}

	.suggest-title {
		margin: 0;
		font-size: 0.95rem;
		font-weight: 600;
		color: #0f172a;
		line-height: 1.35;
	}

	.suggest-desc {
		margin: 0;
		font-size: 0.83rem;
		color: #475569;
		line-height: 1.5;
	}

	.suggest-reason {
		margin: 0;
		font-size: 0.8rem;
		color: #7c3aed;
		line-height: 1.4;
	}

	.suggest-actions {
		display: flex;
		justify-content: flex-end;
		margin-top: 0.25rem;
	}

	.suggest-accept {
		background: #0f172a;
		color: #fff;
		border: none;
		padding: 0.4rem 0.9rem;
		border-radius: 0.5rem;
		font-size: 0.82rem;
		font-weight: 600;
		cursor: pointer;
		transition: opacity 0.15s;
	}

	.suggest-accept:hover:not(:disabled) {
		opacity: 0.8;
	}

	.suggest-accept:disabled {
		opacity: 0.5;
		cursor: not-allowed;
	}

	.suggest-regenerate {
		background: transparent;
		border: 1px solid #c4b5fd;
		color: #6d28d9;
		padding: 0.45rem 1rem;
		border-radius: 0.55rem;
		font-size: 0.83rem;
		font-weight: 600;
		cursor: pointer;
		width: 100%;
		margin-top: 0.25rem;
	}

	.suggest-regenerate:hover {
		background: rgba(109, 40, 217, 0.05);
	}

	/* Content Plan */
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
		color: #64748b;
		padding: 0.28rem 0.65rem;
		border-radius: 0.45rem;
		font-size: 0.75rem;
		font-weight: 600;
		cursor: pointer;
		transition: background 0.15s;
	}

	.notes-toggle-btn:hover,
	.notes-toggle-btn.active {
		background: #f1f5f9;
		border-color: #cbd5e1;
		color: #334155;
	}

	.notes-preview-wrap {
		position: relative;
	}

	.notes-expand-btn {
		position: absolute;
		top: 0.5rem;
		right: 0.5rem;
		background: rgba(255, 255, 255, 0.9);
		border: 1px solid #e2e8f0;
		border-radius: 0.4rem;
		width: 1.75rem;
		height: 1.75rem;
		font-size: 1rem;
		line-height: 1;
		cursor: pointer;
		color: #64748b;
		display: flex;
		align-items: center;
		justify-content: center;
		transition: background 0.15s, color 0.15s;
		z-index: 2;
	}

	.notes-expand-btn:hover {
		background: #f1f5f9;
		color: #0f172a;
	}

	.plan-expand-overlay {
		z-index: 1100;
	}

	.plan-expand-box {
		z-index: 1101;
		width: min(780px, calc(100vw - 2rem));
		max-height: calc(100vh - 3rem);
		display: flex;
		flex-direction: column;
	}

	.plan-expand-header {
		display: flex;
		align-items: center;
		justify-content: space-between;
		padding: 1rem 1.25rem 0.75rem;
		border-bottom: 1px solid #e2e8f0;
		flex-shrink: 0;
	}

	.plan-expand-title {
		font-weight: 700;
		font-size: 1rem;
		color: #0f172a;
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
		background: #fafafa;
		cursor: text;
		font-size: 0.875rem;
		line-height: 1.7;
		color: #1e293b;
		overflow-y: auto;
		max-height: 420px;
	}

	/* Markdown rendered styles */
	.notes-preview :global(h1),
	.notes-preview :global(h2),
	.notes-preview :global(h3) {
		margin: 1rem 0 0.4rem;
		font-family: 'Space Grotesk', 'Noto Sans Thai', sans-serif;
		font-size: 0.95rem;
		color: #0f172a;
	}
	.notes-preview :global(h1) { font-size: 1rem; border-bottom: 1px solid #e2e8f0; padding-bottom: 0.3rem; }
	.notes-preview :global(p) { margin: 0.3rem 0; }
	.notes-preview :global(ul), .notes-preview :global(ol) { padding-left: 1.4rem; margin: 0.3rem 0; }
	.notes-preview :global(li) { margin: 0.15rem 0; }
	.notes-preview :global(strong) { font-weight: 700; color: #0f172a; }
	.notes-preview :global(blockquote) {
		border-left: 3px solid #6366f1;
		margin: 0.5rem 0;
		padding: 0.3rem 0.75rem;
		background: rgba(99, 102, 241, 0.05);
		border-radius: 0 0.4rem 0.4rem 0;
		color: #334155;
		font-style: italic;
	}
	.notes-preview :global(table) {
		width: 100%;
		border-collapse: collapse;
		font-size: 0.82rem;
		margin: 0.5rem 0;
	}
	.notes-preview :global(th) {
		background: #f1f5f9;
		padding: 0.4rem 0.6rem;
		text-align: left;
		font-weight: 600;
		border: 1px solid #e2e8f0;
	}
	.notes-preview :global(td) {
		padding: 0.35rem 0.6rem;
		border: 1px solid #e2e8f0;
		vertical-align: top;
	}
	.notes-preview :global(hr) { border: none; border-top: 1px solid #e2e8f0; margin: 0.75rem 0; }
	.notes-preview :global(code) {
		background: #f1f5f9;
		padding: 0.1rem 0.35rem;
		border-radius: 0.3rem;
		font-size: 0.8rem;
	}

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

	.ai-plan-btn:hover:not(:disabled) {
		opacity: 0.85;
	}

	.ai-plan-btn:disabled {
		opacity: 0.55;
		cursor: not-allowed;
	}

	.plan-context-input {
		width: 100%;
		padding: 0.45rem 0.7rem;
		border: 1px solid #e2e8f0;
		border-radius: 0.5rem;
		font-size: 0.8rem;
		color: #475569;
		background: #f8fafc;
		box-sizing: border-box;
	}

	.plan-context-input:focus {
		outline: none;
		border-color: #a5b4fc;
		background: #fff;
	}

	.plan-context-input:disabled {
		opacity: 0.5;
	}

	/* Auto-categorize */
	.category-suggest-label {
		font-size: 0.78rem;
		font-weight: 600;
		color: #92400e;
		white-space: nowrap;
	}
</style>
