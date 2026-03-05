<script lang="ts">
	import { onMount } from "svelte";
	import { hasSupabaseConfig, supabase } from "$lib/supabase";
	import type {
		BacklogContentType,
		EnrichResult,
		IdeaBacklogRow,
		SupportedPlatform,
	} from "$lib/types";
	import {
		contentTypeLabel,
		formatCount,
		getInstagramEmbedUrl,
		getTikTokEmbedUrl,
		platformLabel,
		platformOrder,
	} from "$lib/media-plan";

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
	let scheduledBacklogIds = $state<Set<string>>(new Set());
	let selectedContentType = $state<BacklogContentType>("video");

	// Context menu state
	let contextMenuIdea = $state<IdeaBacklogRow | null>(null);
	let contextMenuX = $state(0);
	let contextMenuY = $state(0);
	let contextMenuVisible = $state(false);
	let scheduleDate = $state("");
	let scheduling = $state(false);

	let manualExpanded = $state(false);
	let manualUrl = $state("");
	let manualPlatform = $state<SupportedPlatform>("youtube");
	let manualContentType = $state<BacklogContentType>("video");
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
		title: '',
		description: '',
		author_name: '',
		thumbnail_url: '',
		published_at: '',
		notes: '',
		views: null as number | null,
		likes: null as number | null,
		comments: null as number | null,
		shares: null as number | null,
		saves: null as number | null,
	});
	let savingEdit = $state(false);

	const groupedIdeas = $derived.by(() => {
		const grouped = new Map<string, IdeaBacklogRow[]>();

		for (const idea of ideas) {
			const bucket = grouped.get(idea.platform) ?? [];
			bucket.push(idea);
			grouped.set(idea.platform, bucket);
		}

		const orderedGroups: Array<{
			key: string;
			label: string;
			items: IdeaBacklogRow[];
		}> = platformOrder
			.map((platform) => ({
				key: platform,
				label: platformLabel[platform],
				items: grouped.get(platform) ?? [],
			}))
			.filter((group) => group.items.length > 0);

		const knownPlatforms = new Set<string>(platformOrder);
		for (const [platform, items] of grouped.entries()) {
			if (!knownPlatforms.has(platform)) {
				orderedGroups.push({
					key: platform,
					label: platform.toUpperCase(),
					items,
				});
			}
		}

		return orderedGroups;
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
	const contentTypeOptions = ["video", "post", "image"] as const;
	const platformOptions = platformOrder as readonly SupportedPlatform[];

	function backlogCode(
		idea: Pick<IdeaBacklogRow, "id" | "idea_code">,
	): string {
		const code = idea.idea_code?.trim();
		return code ? code : `BL-${idea.id.slice(0, 8).toUpperCase()}`;
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
			.select("backlog_id");
		if (error) {
			errorMessage = `โหลดสถานะ schedule ไม่ได้: ${error.message}`;
			return;
		}

		scheduledBacklogIds = new Set(
			(data ?? []).map((item) => item.backlog_id as string),
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
		scrollToTop();
		await Promise.all([loadIdeas(), loadScheduledBacklogIds()]);
	}

	function openContextMenu(event: MouseEvent, idea: IdeaBacklogRow) {
		event.preventDefault();
		contextMenuIdea = idea;
		contextMenuX = event.clientX;
		contextMenuY = event.clientY;
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
		scrollToTop();
		await loadScheduledBacklogIds();
	}

	function openEditModal(idea: IdeaBacklogRow) {
		editingIdea = idea;
		editForm = {
			url: idea.url ?? '',
			platform: idea.platform,
			content_type: idea.content_type ?? 'video',
			title: idea.title ?? '',
			description: idea.description ?? '',
			author_name: idea.author_name ?? '',
			thumbnail_url: idea.thumbnail_url ?? '',
			published_at: idea.published_at
				? new Date(idea.published_at).toISOString().slice(0, 16)
				: '',
			notes: idea.notes ?? '',
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

		savingEdit = false;

		if (error) {
			errorMessage = `แก้ไขไม่สำเร็จ: ${error.message}`;
			return;
		}

		message = 'แก้ไข backlog เรียบร้อยแล้ว';
		closeEditModal();
		await loadIdeas();
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

	<section class="panel">
		<div class="row">
			<label for="content-link">Content Link</label>
			<input
				id="content-link"
				bind:value={linkInput}
				placeholder="https://www.instagram.com/p/... หรือ https://www.youtube.com/watch?v=..."
			/>
		</div>
		<button class="primary" onclick={analyzeLink} disabled={enriching}>
			{enriching ? "Analyzing..." : "Analyze Link"}
		</button>
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
				{:else if draftInstagramEmbedUrl}
					<iframe
						class="preview-media instagram-frame"
						src={draftInstagramEmbedUrl}
						title="Instagram Preview"
						loading="lazy"
						allow="encrypted-media; picture-in-picture"
						allowfullscreen
					></iframe>
				{:else if draft.thumbnailUrl}
					<img
						class="preview-media"
						src={draft.thumbnailUrl}
						alt={draft.title ?? "thumbnail"}
					/>
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

			<div class="metrics">
				<div class="metric-item">
					<label for="views">Views</label>
					<input
						id="views"
						type="number"
						min="0"
						bind:value={metrics.views}
					/>
				</div>
				<div class="metric-item">
					<label for="likes">Likes</label>
					<input
						id="likes"
						type="number"
						min="0"
						bind:value={metrics.likes}
					/>
				</div>
				<div class="metric-item">
					<label for="comments">Comments</label>
					<input
						id="comments"
						type="number"
						min="0"
						bind:value={metrics.comments}
					/>
				</div>
				<div class="metric-item">
					<label for="shares">Shares</label>
					<input
						id="shares"
						type="number"
						min="0"
						bind:value={metrics.shares}
					/>
				</div>
				<div class="metric-item">
					<label for="saves">Saves</label>
					<input
						id="saves"
						type="number"
						min="0"
						bind:value={metrics.saves}
					/>
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

				<div class="metrics">
					<div class="metric-item">
						<label for="manual-views">Views</label>
						<input
							id="manual-views"
							type="number"
							min="0"
							bind:value={manualMetrics.views}
						/>
					</div>
					<div class="metric-item">
						<label for="manual-likes">Likes</label>
						<input
							id="manual-likes"
							type="number"
							min="0"
							bind:value={manualMetrics.likes}
						/>
					</div>
					<div class="metric-item">
						<label for="manual-comments">Comments</label>
						<input
							id="manual-comments"
							type="number"
							min="0"
							bind:value={manualMetrics.comments}
						/>
					</div>
					<div class="metric-item">
						<label for="manual-shares">Shares</label>
						<input
							id="manual-shares"
							type="number"
							min="0"
							bind:value={manualMetrics.shares}
						/>
					</div>
					<div class="metric-item">
						<label for="manual-saves">Saves</label>
						<input
							id="manual-saves"
							type="number"
							min="0"
							bind:value={manualMetrics.saves}
						/>
					</div>
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
			<h2>Backlog ({ideas.length})</h2>
			{#if loadingIdeas}
				<span>Loading...</span>
			{/if}
		</div>

		{#if ideas.length === 0}
			<p class="empty">ยังไม่มีรายการไอเดียในระบบ</p>
		{:else}
			<div class="platform-groups">
				{#each groupedIdeas as group}
					<section class="platform-group">
						<div class="platform-group-head">
							<h3>{group.label}</h3>
							<span class="group-count">{group.items.length}</span
							>
						</div>

						<div class="grid">
							{#each group.items as idea}
								{@const tiktokEmbedUrl =
									idea.platform === "tiktok" && idea.url
										? getTikTokEmbedUrl(idea.url)
										: null}
								{@const instagramEmbedUrl =
									idea.platform === "instagram" && idea.url
										? getInstagramEmbedUrl(idea.url)
										: null}
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
										<div class="stats">
											<div class="stat-badge">
												<span>Views</span><span
													>{formatCount(
														idea.view_count,
													)}</span
												>
											</div>
											<div class="stat-badge">
												<span>Likes</span><span
													>{formatCount(
														idea.like_count,
													)}</span
												>
											</div>
											<div class="stat-badge">
												<span>Comments</span><span
													>{formatCount(
														idea.comment_count,
													)}</span
												>
											</div>
											<div class="stat-badge">
												<span>Shares</span><span
													>{formatCount(
														idea.share_count,
													)}</span
												>
											</div>
										</div>

										{#if idea.notes}
											<p class="notes">{idea.notes}</p>
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
					</section>
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
				<label for="edit-title">Title</label>
				<input id="edit-title" bind:value={editForm.title} placeholder="ชื่อคอนเทนต์" />
			</div>

			<div class="edit-row">
				<label for="edit-url">Content Link</label>
				<input id="edit-url" bind:value={editForm.url} placeholder="https://..." />
			</div>

			<div class="edit-row-inline">
				<div class="edit-row">
					<label for="edit-author">Creator / Account</label>
					<input id="edit-author" bind:value={editForm.author_name} placeholder="@username" />
				</div>
				<div class="edit-row">
					<label for="edit-published">Published At</label>
					<input id="edit-published" type="datetime-local" bind:value={editForm.published_at} />
				</div>
			</div>

			<div class="edit-row">
				<label for="edit-thumbnail">Thumbnail URL</label>
				<input id="edit-thumbnail" bind:value={editForm.thumbnail_url} placeholder="https://..." />
			</div>

			<div class="edit-row">
				<label for="edit-description">Description</label>
				<textarea id="edit-description" bind:value={editForm.description} rows={3} placeholder="คำอธิบาย (ถ้ามี)"></textarea>
			</div>

			<div class="edit-metrics">
				<div class="edit-metric">
					<label for="edit-views">Views</label>
					<input id="edit-views" type="number" min="0" bind:value={editForm.views} />
				</div>
				<div class="edit-metric">
					<label for="edit-likes">Likes</label>
					<input id="edit-likes" type="number" min="0" bind:value={editForm.likes} />
				</div>
				<div class="edit-metric">
					<label for="edit-comments">Comments</label>
					<input id="edit-comments" type="number" min="0" bind:value={editForm.comments} />
				</div>
				<div class="edit-metric">
					<label for="edit-shares">Shares</label>
					<input id="edit-shares" type="number" min="0" bind:value={editForm.shares} />
				</div>
				<div class="edit-metric">
					<label for="edit-saves">Saves</label>
					<input id="edit-saves" type="number" min="0" bind:value={editForm.saves} />
				</div>
			</div>

			<div class="edit-row">
				<label for="edit-notes">Idea Notes</label>
				<textarea id="edit-notes" bind:value={editForm.notes} rows={4} placeholder="ไอเดียจากคอนเทนต์นี้..."></textarea>
			</div>

			<div class="modal-footer">
				<button class="primary" onclick={saveEdit} disabled={savingEdit || !hasSupabaseConfig}>
					{savingEdit ? 'Saving...' : 'Save Changes'}
				</button>
				<button class="modal-cancel" onclick={closeEditModal}>Cancel</button>
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

	.platform-groups {
		display: grid;
		gap: 1rem;
	}

	.platform-group-head {
		display: flex;
		justify-content: space-between;
		align-items: center;
		padding-bottom: 0.55rem;
		border-bottom: 1px solid rgba(15, 23, 42, 0.08);
		margin-bottom: 0.8rem;
	}

	.platform-group-head h3 {
		margin: 0;
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
	}

	.stats {
		display: grid;
		grid-template-columns: repeat(2, minmax(0, 1fr));
		gap: 0.4rem;
	}

	.stat-badge {
		display: flex;
		justify-content: space-between;
		font-size: 0.78rem;
		padding: 0.42rem 0.5rem;
		border-radius: 0.55rem;
		background: rgba(15, 23, 42, 0.05);
	}

	.notes {
		margin: 0;
		font-size: 0.85rem;
		color: #475569;
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
		inset: 0;
		z-index: 1000;
		margin: auto;
		width: 100%;
		max-width: 560px;
		max-height: 90vh;
		overflow-y: auto;
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

		.edit-row-inline {
			grid-template-columns: 1fr;
		}

		.edit-metrics {
			grid-template-columns: repeat(2, minmax(0, 1fr));
		}

		.modal-box {
			max-height: 95vh;
			border-radius: 0.75rem;
		}
	}
</style>
