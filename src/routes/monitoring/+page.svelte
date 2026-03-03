<script lang="ts">
	import { onMount } from "svelte";
	import { hasSupabaseConfig, supabase } from "$lib/supabase";
	import type {
		EnrichResult,
		MonitoringContentPlatformRow,
		MonitoringContentRow,
		SupportedPlatform,
	} from "$lib/types";
	import {
		formatCount,
		getInstagramEmbedUrl,
		getPlatformFromUrl,
		getTikTokEmbedUrl,
		isYouTubeShort,
		normalizeMetricValue,
		platformLabel,
		platformOrder,
	} from "$lib/media-plan";

	type MetricsDraft = {
		views: number | null;
		likes: number | null;
		comments: number | null;
		shares: number | null;
		saves: number | null;
	};

	type PlatformStat = {
		platform: SupportedPlatform;
		clipCount: number;
		totalViews: number | null;
		totalEngagement: number | null;
		avgViews: number | null;
		engagementRate: number | null;
		hasAnyData: boolean;
	};

	const availablePlatforms = platformOrder as readonly SupportedPlatform[];
	const platformRank = new Map<SupportedPlatform, number>(
		availablePlatforms.map((platform, index) => [platform, index]),
	);
	const clipPlaceholderByPlatform: Record<SupportedPlatform, string> = {
		youtube: "https://www.youtube.com/watch?v=...",
		facebook: "https://www.facebook.com/.../videos/...",
		instagram: "https://www.instagram.com/reel/...",
		tiktok: "https://www.tiktok.com/@username/video/...",
	};

	let contents = $state<MonitoringContentRow[]>([]);
	let clips = $state<MonitoringContentPlatformRow[]>([]);
	let loadingContents = $state(false);
	let loadingClips = $state(false);

	let selectedContentId = $state<string | null>(null);
	let selectedPlatform = $state<SupportedPlatform>("youtube");
	let contentTitleInput = $state("");
	let contentDescriptionInput = $state("");
	let creatingContent = $state(false);
	let deletingContent = $state(false);

	let clipLinkInput = $state("");
	let clipNotes = $state("");
	let analyzing = $state(false);
	let savingClip = $state(false);
	let deletingClip = $state(false);
	let refreshingAll = $state(false);
	let refreshProgress = $state("");
	let refreshingSingle = $state<string | null>(null);
	let message = $state("");
	let errorMessage = $state("");
	let draft = $state<EnrichResult | null>(null);
	let metrics = $state<MetricsDraft>({
		views: null,
		likes: null,
		comments: null,
		shares: null,
		saves: null,
	});

	const contentMap = $derived.by(
		() => new Map(contents.map((item) => [item.id, item])),
	);

	const clipsByContentId = $derived.by(() => {
		const grouped = new Map<string, MonitoringContentPlatformRow[]>();
		for (const clip of clips) {
			const bucket = grouped.get(clip.content_id) ?? [];
			bucket.push(clip);
			grouped.set(clip.content_id, bucket);
		}

		for (const bucket of grouped.values()) {
			bucket.sort(
				(a, b) =>
					(platformRank.get(a.platform) ?? 99) -
					(platformRank.get(b.platform) ?? 99),
			);
		}

		return grouped;
	});

	const monitoredRows = $derived.by(() => {
		return contents
			.map((content) => {
				const contentClips = clipsByContentId.get(content.id) ?? [];
				const totalViews = contentClips.reduce(
					(sum, item) => sum + (item.view_count ?? 0),
					0,
				);
				return {
					content,
					clips: contentClips,
					clipCount: contentClips.length,
					totalViews,
					updatedAt:
						contentClips[0]?.created_at ?? content.created_at,
				};
			})
			.sort((a, b) => {
				if (b.clipCount !== a.clipCount)
					return b.clipCount - a.clipCount;
				return b.updatedAt.localeCompare(a.updatedAt);
			});
	});

	const selectedContent = $derived.by(() =>
		selectedContentId ? (contentMap.get(selectedContentId) ?? null) : null,
	);
	const selectedContentClips = $derived.by(() =>
		selectedContentId
			? (clipsByContentId.get(selectedContentId) ?? [])
			: [],
	);
	const selectedClipByPlatform = $derived.by(() => {
		const map = new Map<SupportedPlatform, MonitoringContentPlatformRow>();
		for (const clip of selectedContentClips) map.set(clip.platform, clip);
		return map;
	});
	const selectedPlatformClip = $derived.by(
		() => selectedClipByPlatform.get(selectedPlatform) ?? null,
	);
	const selectedPlatformSet = $derived.by(
		() => new Set(selectedContentClips.map((clip) => clip.platform)),
	);
	const clipPlaceholder = $derived.by(
		() => clipPlaceholderByPlatform[selectedPlatform],
	);

	const currentPreview = $derived.by(() => {
		if (draft && draft.platform === selectedPlatform) {
			return {
				platform: draft.platform,
				url: draft.url,
				title: draft.title,
				thumbnailUrl: draft.thumbnailUrl,
			};
		}
		if (!selectedPlatformClip) return null;
		return {
			platform: selectedPlatformClip.platform,
			url: selectedPlatformClip.url,
			title: selectedPlatformClip.title,
			thumbnailUrl: selectedPlatformClip.thumbnail_url,
		};
	});

	const currentTikTokEmbed = $derived(
		currentPreview && currentPreview.platform === "tiktok"
			? getTikTokEmbedUrl(currentPreview.url)
			: null,
	);
	const currentInstagramEmbed = $derived(
		currentPreview && currentPreview.platform === "instagram"
			? getInstagramEmbedUrl(currentPreview.url)
			: null,
	);

	const contentsWithClips = $derived.by(
		() => monitoredRows.filter((row) => row.clipCount > 0).length,
	);

	const biTotals = $derived.by(() => {
		let totalViews = 0;
		let totalEngagement = 0;
		for (const clip of clips) {
			totalViews += clip.view_count ?? 0;
			totalEngagement += engagementValue(clip);
		}
		const engagementRate =
			totalViews > 0 ? (totalEngagement / totalViews) * 100 : null;
		const coveredContents = new Set(clips.map((clip) => clip.content_id))
			.size;

		return {
			totalClips: clips.length,
			totalViews,
			totalEngagement,
			engagementRate,
			coveredContents,
		};
	});

	const platformStats = $derived.by(() => {
		type BiStatRow = {
			key: string;
			label: string;
			platformClass: string;
			clipCount: number;
			totalViews: number | null;
			totalEngagement: number | null;
			avgViews: number | null;
			engagementRate: number | null;
			hasAnyData: boolean;
		};

		const biKeys = [
			"youtube_short",
			"youtube_long",
			"facebook",
			"instagram",
			"tiktok",
		] as const;
		const statsMap = new Map<string, BiStatRow>();

		statsMap.set("youtube_short", {
			key: "youtube_short",
			label: "YT Short",
			platformClass: "platform-frame--youtube",
			clipCount: 0,
			totalViews: null,
			totalEngagement: null,
			avgViews: null,
			engagementRate: null,
			hasAnyData: false,
		});
		statsMap.set("youtube_long", {
			key: "youtube_long",
			label: "YT Long",
			platformClass: "platform-frame--youtube",
			clipCount: 0,
			totalViews: null,
			totalEngagement: null,
			avgViews: null,
			engagementRate: null,
			hasAnyData: false,
		});
		statsMap.set("facebook", {
			key: "facebook",
			label: "Facebook",
			platformClass: "platform-frame--facebook",
			clipCount: 0,
			totalViews: null,
			totalEngagement: null,
			avgViews: null,
			engagementRate: null,
			hasAnyData: false,
		});
		statsMap.set("instagram", {
			key: "instagram",
			label: "Instagram",
			platformClass: "platform-frame--instagram",
			clipCount: 0,
			totalViews: null,
			totalEngagement: null,
			avgViews: null,
			engagementRate: null,
			hasAnyData: false,
		});
		statsMap.set("tiktok", {
			key: "tiktok",
			label: "TikTok",
			platformClass: "platform-frame--tiktok",
			clipCount: 0,
			totalViews: null,
			totalEngagement: null,
			avgViews: null,
			engagementRate: null,
			hasAnyData: false,
		});

		for (const clip of clips) {
			let statKey: string = clip.platform;
			if (clip.platform === "youtube") {
				statKey = isYouTubeShort(clip.url)
					? "youtube_short"
					: "youtube_long";
			}
			const stat = statsMap.get(statKey);
			if (!stat) continue;
			stat.clipCount += 1;
			const hasViews =
				clip.view_count !== null && clip.view_count !== undefined;
			const eng = engagementValue(clip);
			const hasEng = eng > 0;
			if (hasViews || hasEng) {
				stat.hasAnyData = true;
				stat.totalViews =
					(stat.totalViews ?? 0) + (clip.view_count ?? 0);
				stat.totalEngagement = (stat.totalEngagement ?? 0) + eng;
			}
		}

		for (const stat of statsMap.values()) {
			stat.avgViews =
				stat.clipCount > 0 && stat.totalViews !== null
					? stat.totalViews / stat.clipCount
					: null;
			stat.engagementRate =
				stat.totalViews !== null && stat.totalViews > 0
					? ((stat.totalEngagement ?? 0) / stat.totalViews) * 100
					: null;
		}

		return biKeys
			.map((k) => statsMap.get(k)!)
			.filter(
				(s) =>
					s.clipCount > 0 ||
					s.key === "youtube_short" ||
					s.key === "youtube_long",
			);
	});

	const topClipRows = $derived.by(() => {
		return clips
			.map((clip) => ({
				clip,
				content: contentMap.get(clip.content_id) ?? null,
				engagement: engagementValue(clip),
			}))
			.sort((a, b) => {
				const viewsDiff =
					(b.clip.view_count ?? -1) - (a.clip.view_count ?? -1);
				if (viewsDiff !== 0) return viewsDiff;
				return b.engagement - a.engagement;
			})
			.slice(0, 8);
	});

	function scrollToTop() {
		window.scrollTo({ top: 0, behavior: "smooth" });
	}

	function contentCode(
		content: Pick<MonitoringContentRow, "id" | "content_code">,
	): string {
		const code = content.content_code?.trim();
		return code ? code : `MC-${content.id.slice(0, 8).toUpperCase()}`;
	}

	function platformFrameClass(
		platform: SupportedPlatform | null | undefined,
	): string {
		if (platform === "instagram") return "platform-frame--instagram";
		if (platform === "tiktok") return "platform-frame--tiktok";
		if (platform === "youtube") return "platform-frame--youtube";
		if (platform === "facebook") return "platform-frame--facebook";
		return "";
	}

	function engagementValue(
		clip: Pick<
			MonitoringContentPlatformRow,
			"like_count" | "comment_count" | "share_count" | "save_count"
		>,
	): number {
		return (
			(clip.like_count ?? 0) +
			(clip.comment_count ?? 0) +
			(clip.share_count ?? 0) +
			(clip.save_count ?? 0)
		);
	}

	function formatRate(value: number | null): string {
		if (value === null || !Number.isFinite(value)) return "-";
		return `${value.toFixed(2)}%`;
	}

	function formatAvg(value: number | null): string {
		if (value === null || !Number.isFinite(value)) return "-";
		return formatCount(Math.round(value));
	}

	function hasAnyMetricValue(input: MetricsDraft): boolean {
		return Object.values(input).some(
			(value) => typeof value === "number" && Number.isFinite(value),
		);
	}

	function resetClipForm() {
		clipLinkInput = "";
		clipNotes = "";
		draft = null;
		metrics = {
			views: null,
			likes: null,
			comments: null,
			shares: null,
			saves: null,
		};
	}

	function hydrateClipForm(
		contentId: string,
		platform: SupportedPlatform = selectedPlatform,
	) {
		const existing =
			(clipsByContentId.get(contentId) ?? []).find(
				(clip) => clip.platform === platform,
			) ?? null;
		if (!existing) {
			resetClipForm();
			return;
		}
		clipLinkInput = existing.url;
		clipNotes = existing.notes ?? "";
		draft = null;
		metrics = {
			views: existing.view_count,
			likes: existing.like_count,
			comments: existing.comment_count,
			shares: existing.share_count,
			saves: existing.save_count,
		};
	}

	function selectContent(contentId: string) {
		selectedContentId = contentId;
		const existing = clipsByContentId.get(contentId) ?? [];
		const nextPlatform = existing[0]?.platform ?? "youtube";
		selectPlatform(nextPlatform);
	}

	function selectPlatform(platform: SupportedPlatform) {
		selectedPlatform = platform;
		if (!selectedContentId) {
			resetClipForm();
			return;
		}
		hydrateClipForm(selectedContentId, platform);
	}

	async function fetchEnrichResult(targetUrl: string): Promise<EnrichResult> {
		const response = await fetch(
			`/api/enrich?url=${encodeURIComponent(targetUrl)}`,
		);
		const body = await response.json();
		if (!response.ok) {
			throw new Error(body.error ?? "Analyze link ไม่สำเร็จ");
		}
		return body as EnrichResult;
	}

	async function loadContents() {
		if (!supabase) return;
		loadingContents = true;
		const { data, error } = await supabase
			.from("monitoring_content")
			.select("*")
			.order("created_at", { ascending: false });
		loadingContents = false;

		if (error) {
			errorMessage = `โหลด monitoring content ไม่ได้: ${error.message}`;
			return;
		}

		contents = (data ?? []) as MonitoringContentRow[];
	}

	async function loadClips() {
		if (!supabase) return;
		loadingClips = true;
		const { data, error } = await supabase
			.from("monitoring_content_platform")
			.select("*")
			.order("created_at", { ascending: false });
		loadingClips = false;

		if (error) {
			errorMessage = `โหลด monitored clips ไม่ได้: ${error.message}`;
			return;
		}

		clips = (data ?? []) as MonitoringContentPlatformRow[];
	}

	async function createContent() {
		if (!supabase) {
			errorMessage = "ยังไม่ได้ตั้งค่า Supabase";
			return;
		}

		if (!contentTitleInput.trim()) {
			errorMessage = "กรุณาใส่ชื่อ content ที่ทำจริง";
			return;
		}

		creatingContent = true;
		errorMessage = "";
		message = "";

		const payload = {
			title: contentTitleInput.trim(),
			description: contentDescriptionInput.trim() || null,
			notes: null,
			status: "active",
		};

		const { data, error } = await supabase
			.from("monitoring_content")
			.insert(payload)
			.select("*")
			.single();
		creatingContent = false;

		if (error || !data) {
			errorMessage = `สร้าง content ไม่สำเร็จ: ${error?.message ?? "unknown error"}`;
			scrollToTop();
			return;
		}

		contents = [data as MonitoringContentRow, ...contents];
		contentTitleInput = "";
		contentDescriptionInput = "";
		selectContent((data as MonitoringContentRow).id);
		message = "เพิ่ม content สำหรับ monitoring แล้ว";
		scrollToTop();
	}

	async function deleteSelectedContent() {
		if (!supabase) {
			errorMessage = "ยังไม่ได้ตั้งค่า Supabase";
			return;
		}
		if (!selectedContent) {
			errorMessage = "ยังไม่ได้เลือก content";
			return;
		}

		const confirmed = window.confirm(
			`ลบ content นี้ทั้งหมดใช่ไหม?\n${contentCode(selectedContent)} • ${selectedContent.title}`,
		);
		if (!confirmed) return;

		deletingContent = true;
		errorMessage = "";
		message = "";

		const { error } = await supabase
			.from("monitoring_content")
			.delete()
			.eq("id", selectedContent.id);
		deletingContent = false;

		if (error) {
			errorMessage = `ลบ content ไม่สำเร็จ: ${error.message}`;
			scrollToTop();
			return;
		}

		const deletedId = selectedContent.id;
		contents = contents.filter((item) => item.id !== deletedId);
		clips = clips.filter((item) => item.content_id !== deletedId);
		selectedContentId = null;
		resetClipForm();
		if (contents.length > 0) {
			selectContent(contents[0].id);
		}
		message = "ลบ content และคลิปใน content นี้แล้ว";
		scrollToTop();
	}

	async function analyzeClipLink() {
		message = "";
		errorMessage = "";

		if (!selectedContentId) {
			errorMessage = "เลือก content ที่ต้องการ monitor ก่อน";
			return;
		}
		if (!clipLinkInput.trim()) {
			errorMessage = "กรุณาวางลิงก์คลิปก่อน";
			return;
		}

		analyzing = true;
		try {
			const result = await fetchEnrichResult(clipLinkInput.trim());
			draft = result;
			selectedPlatform = result.platform;
			clipLinkInput = result.url;
			metrics = {
				views: result.metrics.views,
				likes: result.metrics.likes,
				comments: result.metrics.comments,
				shares: result.metrics.shares,
				saves: result.metrics.saves,
			};
			if (hasAnyMetricValue(metrics)) {
				message = `Analyze สำเร็จแล้ว (${platformLabel[result.platform]})`;
			} else {
				message = `อ่าน metadata ได้แล้ว (${platformLabel[result.platform]}) แต่ยังไม่เจอ metrics อัตโนมัติ`;
			}
		} catch (error) {
			errorMessage =
				error instanceof Error
					? error.message
					: "เกิดข้อผิดพลาดระหว่าง analyze";
		} finally {
			analyzing = false;
			scrollToTop();
		}
	}

	function mergeMetrics(
		current: MetricsDraft,
		fallback: MetricsDraft,
	): MetricsDraft {
		return {
			views: current.views ?? fallback.views,
			likes: current.likes ?? fallback.likes,
			comments: current.comments ?? fallback.comments,
			shares: current.shares ?? fallback.shares,
			saves: current.saves ?? fallback.saves,
		};
	}

	async function saveClip() {
		if (!supabase) {
			errorMessage = "ยังไม่ได้ตั้งค่า Supabase";
			return;
		}
		if (!selectedContentId) {
			errorMessage = "เลือก content ก่อนบันทึกคลิป";
			return;
		}

		const finalUrl = clipLinkInput.trim() || draft?.url?.trim() || "";
		if (!finalUrl) {
			errorMessage = "กรุณาใส่ลิงก์คลิป";
			return;
		}

		errorMessage = "";
		message = "";
		savingClip = true;

		let effectiveDraft = draft;
		let autoAnalyzeFailed = false;
		if (!effectiveDraft || effectiveDraft.url !== finalUrl) {
			try {
				effectiveDraft = await fetchEnrichResult(finalUrl);
			} catch {
				autoAnalyzeFailed = true;
			}
		}

		const mergedMetrics = mergeMetrics(metrics, {
			views: effectiveDraft?.metrics.views ?? null,
			likes: effectiveDraft?.metrics.likes ?? null,
			comments: effectiveDraft?.metrics.comments ?? null,
			shares: effectiveDraft?.metrics.shares ?? null,
			saves: effectiveDraft?.metrics.saves ?? null,
		});

		const sourcePlatform =
			effectiveDraft?.platform ??
			getPlatformFromUrl(finalUrl) ??
			selectedPlatform ??
			"youtube";

		const payload = {
			content_id: selectedContentId,
			url: effectiveDraft?.url ?? finalUrl,
			platform: sourcePlatform,
			title: effectiveDraft?.title ?? selectedPlatformClip?.title ?? null,
			thumbnail_url:
				effectiveDraft?.thumbnailUrl ??
				selectedPlatformClip?.thumbnail_url ??
				null,
			published_at:
				effectiveDraft?.publishedAt ??
				selectedPlatformClip?.published_at ??
				null,
			view_count: normalizeMetricValue(mergedMetrics.views),
			like_count: normalizeMetricValue(mergedMetrics.likes),
			comment_count: normalizeMetricValue(mergedMetrics.comments),
			share_count: normalizeMetricValue(mergedMetrics.shares),
			save_count: normalizeMetricValue(mergedMetrics.saves),
			notes: clipNotes.trim() || null,
		};

		const { error } = await supabase
			.from("monitoring_content_platform")
			.upsert(payload, { onConflict: "content_id,platform" });
		savingClip = false;

		if (error) {
			errorMessage = `บันทึกคลิปไม่สำเร็จ: ${error.message}`;
			scrollToTop();
			return;
		}

		selectedPlatform = sourcePlatform;
		draft = effectiveDraft ?? draft;
		metrics = mergedMetrics;
		await loadClips();
		hydrateClipForm(selectedContentId, sourcePlatform);
		message = autoAnalyzeFailed
			? `บันทึกคลิปแล้ว (${platformLabel[sourcePlatform]}) โดยใช้ค่าที่กรอกเอง`
			: `บันทึกคลิปแล้ว (${platformLabel[sourcePlatform]})`;
		scrollToTop();
	}

	async function deleteSelectedClip() {
		if (!supabase) {
			errorMessage = "ยังไม่ได้ตั้งค่า Supabase";
			return;
		}
		if (!selectedPlatformClip || !selectedContentId) {
			errorMessage = "ยังไม่มีคลิปของแพลตฟอร์มนี้ให้ลบ";
			return;
		}

		const confirmed = window.confirm(
			`ลบคลิป ${platformLabel[selectedPlatform]} นี้ใช่ไหม?`,
		);
		if (!confirmed) return;

		deletingClip = true;
		errorMessage = "";
		message = "";

		const { error } = await supabase
			.from("monitoring_content_platform")
			.delete()
			.eq("id", selectedPlatformClip.id);
		deletingClip = false;

		if (error) {
			errorMessage = `ลบคลิปไม่สำเร็จ: ${error.message}`;
			scrollToTop();
			return;
		}

		clips = clips.filter((item) => item.id !== selectedPlatformClip.id);
		hydrateClipForm(selectedContentId, selectedPlatform);
		message = `ลบคลิป ${platformLabel[selectedPlatform]} แล้ว`;
		scrollToTop();
	}

	async function refreshSingleClip(clip: MonitoringContentPlatformRow) {
		if (!supabase) return;
		refreshingSingle = clip.id;
		errorMessage = "";
		message = "";

		try {
			const result = await fetchEnrichResult(clip.url);
			const updatedMetrics = {
				view_count: result.metrics.views ?? clip.view_count,
				like_count: result.metrics.likes ?? clip.like_count,
				comment_count: result.metrics.comments ?? clip.comment_count,
				share_count: result.metrics.shares ?? clip.share_count,
				save_count: result.metrics.saves ?? clip.save_count,
				title: result.title ?? clip.title,
				thumbnail_url: result.thumbnailUrl ?? clip.thumbnail_url,
			};

			await supabase
				.from("monitoring_content_platform")
				.update(updatedMetrics)
				.eq("id", clip.id);

			await loadClips();
			if (selectedContentId)
				hydrateClipForm(selectedContentId, selectedPlatform);
			message = `Refresh ${platformLabel[clip.platform]} สำเร็จ`;
		} catch (err) {
			errorMessage = `Refresh ไม่สำเร็จ: ${err instanceof Error ? err.message : "unknown"}`;
		} finally {
			refreshingSingle = null;
		}
	}

	async function refreshAllClips() {
		if (!supabase || clips.length === 0) return;
		refreshingAll = true;
		errorMessage = "";
		message = "";

		let successCount = 0;
		let failCount = 0;

		for (let i = 0; i < clips.length; i++) {
			const clip = clips[i];
			refreshProgress = `${i + 1}/${clips.length}`;

			try {
				const result = await fetchEnrichResult(clip.url);
				const updatedMetrics = {
					view_count: result.metrics.views ?? clip.view_count,
					like_count: result.metrics.likes ?? clip.like_count,
					comment_count:
						result.metrics.comments ?? clip.comment_count,
					share_count: result.metrics.shares ?? clip.share_count,
					save_count: result.metrics.saves ?? clip.save_count,
					title: result.title ?? clip.title,
					thumbnail_url: result.thumbnailUrl ?? clip.thumbnail_url,
				};

				await supabase
					.from("monitoring_content_platform")
					.update(updatedMetrics)
					.eq("id", clip.id);

				successCount++;
			} catch {
				failCount++;
			}
		}

		await loadClips();
		if (selectedContentId)
			hydrateClipForm(selectedContentId, selectedPlatform);
		refreshingAll = false;
		refreshProgress = "";
		message = `Refresh เสร็จแล้ว: ${successCount} สำเร็จ${failCount > 0 ? `, ${failCount} ไม่สำเร็จ` : ""}`;
	}

	onMount(async () => {
		await Promise.all([loadContents(), loadClips()]);
		if (contents.length > 0) {
			const target =
				monitoredRows.find((row) => row.clipCount > 0)?.content.id ??
				contents[0].id;
			selectContent(target);
		}
	});
</script>

<main class="page">
	<section class="hero">
		<p class="kicker">Monitoring</p>
		<h1>BigLot Content Monitoring</h1>
		<p>
			หน้านี้ใช้เฉพาะ content ที่ทีม BigLot ผลิตจริง ไม่อิง backlog ideas
		</p>
	</section>

	{#if !hasSupabaseConfig}
		<p class="alert">
			ตั้งค่า env ก่อนใช้งาน: <code>PUBLIC_SUPABASE_URL</code> และ
			<code>PUBLIC_SUPABASE_ANON_KEY</code>
		</p>
	{/if}

	{#if message}
		<p class="notice success">{message}</p>
	{/if}

	{#if errorMessage}
		<p class="notice error">{errorMessage}</p>
	{/if}

	<section class="panel">
		<div class="monitor-layout">
			<div class="monitor-left">
				<div class="create-content-box">
					<h2>Add New Content</h2>
					<div class="row small-gap">
						<label for="content-title">Content Title</label>
						<input
							id="content-title"
							bind:value={contentTitleInput}
							placeholder="เช่น BigLot โปรเปิดบ้านเดือนมีนาคม"
						/>
					</div>
					<div class="row small-gap">
						<label for="content-description"
							>Description (optional)</label
						>
						<textarea
							id="content-description"
							rows={2}
							bind:value={contentDescriptionInput}
							placeholder="บริบท content นี้ เช่น campaign, objective"
						></textarea>
					</div>
					<button
						class="primary full"
						onclick={createContent}
						disabled={creatingContent}
					>
						{creatingContent
							? "Creating..."
							: "Create Monitoring Content"}
					</button>
				</div>

				<div class="list-head">
					<h2>My Contents</h2>
					<span>{contentsWithClips}/{contents.length}</span>
				</div>

				{#if loadingContents || loadingClips}
					<p class="empty">Loading monitoring data...</p>
				{:else if monitoredRows.length === 0}
					<p class="empty">ยังไม่มี content ที่สร้างไว้</p>
				{:else}
					<div class="content-list">
						{#each monitoredRows as row}
							<button
								type="button"
								class={`content-btn ${selectedContentId === row.content.id ? "active" : ""}`}
								onclick={() => selectContent(row.content.id)}
							>
								<div>
									<strong>{contentCode(row.content)}</strong>
									<p class="content-title">
										{row.content.title}
									</p>
								</div>
								<div class="content-meta">
									<span class="chip"
										>{row.clipCount} Platform{row.clipCount ===
										1
											? ""
											: "s"}</span
									>
									<span
										>{formatCount(row.totalViews)} views</span
									>
								</div>
							</button>
						{/each}
					</div>
				{/if}
			</div>

			<div class="monitor-right">
				{#if !selectedContent}
					<p class="empty">
						เลือก content จากฝั่งซ้ายเพื่อเริ่ม monitor
					</p>
				{:else}
					<div class="source-head">
						<p class="kicker small">Monitored Content</p>
						<h3>{contentCode(selectedContent)}</h3>
						<p class="meta">{selectedContent.title}</p>
						{#if selectedContent.description}
							<p class="meta">{selectedContent.description}</p>
						{/if}
						<div class="head-actions">
							<button
								class="danger"
								onclick={deleteSelectedContent}
								disabled={deletingContent}
							>
								{deletingContent
									? "Deleting..."
									: "Delete Content"}
							</button>
						</div>
					</div>

					<div class="platform-switcher">
						{#each availablePlatforms as platform}
							<button
								type="button"
								class={`platform-btn ${selectedPlatform === platform ? "active" : ""}`}
								onclick={() => selectPlatform(platform)}
							>
								<span>{platformLabel[platform]}</span>
								{#if selectedPlatformSet.has(platform)}
									<span class="dot" aria-hidden="true"></span>
								{/if}
							</button>
						{/each}
					</div>

					<div class="row">
						<label for="clip-link"
							>Clip Link ({platformLabel[
								selectedPlatform
							]})</label
						>
						<input
							id="clip-link"
							bind:value={clipLinkInput}
							placeholder={clipPlaceholder}
						/>
					</div>

					<div class="action-row">
						<button
							class="ghost"
							onclick={analyzeClipLink}
							disabled={analyzing}
						>
							{analyzing ? "Analyzing..." : "Analyze Link"}
						</button>
						<button
							class="primary"
							onclick={saveClip}
							disabled={savingClip}
						>
							{savingClip ? "Saving..." : "Save Clip"}
						</button>
						<button
							class="danger"
							onclick={deleteSelectedClip}
							disabled={!selectedPlatformClip || deletingClip}
						>
							{deletingClip
								? "Deleting..."
								: "Delete Platform Clip"}
						</button>
					</div>

					<div class="metrics">
						<div class="metric-item">
							<label for="m-views">Views</label>
							<input
								id="m-views"
								type="number"
								min="0"
								bind:value={metrics.views}
							/>
						</div>
						<div class="metric-item">
							<label for="m-likes">Likes</label>
							<input
								id="m-likes"
								type="number"
								min="0"
								bind:value={metrics.likes}
							/>
						</div>
						<div class="metric-item">
							<label for="m-comments">Comments</label>
							<input
								id="m-comments"
								type="number"
								min="0"
								bind:value={metrics.comments}
							/>
						</div>
						<div class="metric-item">
							<label for="m-shares">Shares</label>
							<input
								id="m-shares"
								type="number"
								min="0"
								bind:value={metrics.shares}
							/>
						</div>
						<div class="metric-item">
							<label for="m-saves">Saves</label>
							<input
								id="m-saves"
								type="number"
								min="0"
								bind:value={metrics.saves}
							/>
						</div>
					</div>

					<div class="row">
						<label for="clip-notes">Monitoring Notes</label>
						<textarea
							id="clip-notes"
							rows={3}
							bind:value={clipNotes}
							placeholder="Insight จาก performance ของคลิปนี้"
						></textarea>
					</div>

					{#if currentPreview}
						<div class="preview-card">
							{#if currentTikTokEmbed}
								<iframe
									class="preview-media tiktok-frame"
									src={currentTikTokEmbed}
									title="TikTok preview"
									loading="lazy"
									allow="encrypted-media; picture-in-picture"
									allowfullscreen
								></iframe>
							{:else if currentInstagramEmbed}
								<iframe
									class="preview-media instagram-frame"
									src={currentInstagramEmbed}
									title="Instagram preview"
									loading="lazy"
									allow="encrypted-media; picture-in-picture"
									allowfullscreen
								></iframe>
							{:else if currentPreview.thumbnailUrl}
								<img
									class="preview-media"
									src={currentPreview.thumbnailUrl}
									alt={currentPreview.title ?? "thumbnail"}
								/>
							{/if}
							<div>
								<span class="platform"
									>{currentPreview.platform.toUpperCase()}</span
								>
								<h4>
									{currentPreview.title ?? "Untitled clip"}
								</h4>
								<p class="meta">{currentPreview.url}</p>
							</div>
						</div>
					{/if}

					<div class="platform-grid">
						{#each availablePlatforms as platform}
							{@const clip =
								selectedClipByPlatform.get(platform) ?? null}
							{@const clipTikTokEmbed =
								clip && clip.platform === "tiktok"
									? getTikTokEmbedUrl(clip.url)
									: null}
							{@const clipInstagramEmbed =
								clip && clip.platform === "instagram"
									? getInstagramEmbedUrl(clip.url)
									: null}
							<button
								type="button"
								class={`platform-card ${selectedPlatform === platform ? "active" : ""} ${platformFrameClass(platform)}`}
								onclick={() => selectPlatform(platform)}
							>
								<div class="platform-card-head">
									<strong>{platformLabel[platform]}</strong>
									<span
										class={`status ${clip ? "ok" : "missing"}`}
										>{clip ? "Monitored" : "Missing"}</span
									>
								</div>

								{#if clipTikTokEmbed}
									<iframe
										class="card-media tiktok-frame"
										src={clipTikTokEmbed}
										title="TikTok card preview"
										loading="lazy"
										allow="encrypted-media; picture-in-picture"
										allowfullscreen
									></iframe>
								{:else if clipInstagramEmbed}
									<iframe
										class="card-media instagram-frame"
										src={clipInstagramEmbed}
										title="Instagram card preview"
										loading="lazy"
										allow="encrypted-media; picture-in-picture"
										allowfullscreen
									></iframe>
								{:else if clip?.thumbnail_url}
									<img
										class="card-media"
										src={clip.thumbnail_url}
										alt={clip.title ?? "thumbnail"}
									/>
								{:else}
									<div class="card-empty">No preview</div>
								{/if}

								{#if clip}
									<p class="card-title">
										{clip.title ?? "Untitled clip"}
									</p>
									<div class="card-bottom">
										<p class="card-metric">
											Views: {formatCount(
												clip.view_count,
											)}
										</p>
										<!-- svelte-ignore a11y_no_static_element_interactions -->
										<span
											class="refresh-icon"
											role="button"
											tabindex="0"
											title="Refresh metrics"
											onclick={(e: MouseEvent) => {
												e.stopPropagation();
												refreshSingleClip(clip);
											}}
											onkeydown={(e: KeyboardEvent) => {
												if (e.key === "Enter") {
													e.stopPropagation();
													refreshSingleClip(clip);
												}
											}}
										>
											{refreshingSingle === clip.id
												? "⏳"
												: "🔄"}
										</span>
									</div>
								{:else}
									<p class="card-title muted">
										ยังไม่มีคลิปในแพลตฟอร์มนี้
									</p>
								{/if}
							</button>
						{/each}
					</div>
				{/if}
			</div>
		</div>
	</section>

	<section class="panel bi-panel">
		<div class="list-head">
			<h2>BI: Creator Analysis</h2>
			<div class="bi-head-actions">
				<span>{biTotals.totalClips} clips tracked</span>
				<button
					class="ghost refresh-btn"
					onclick={refreshAllClips}
					disabled={refreshingAll || clips.length === 0}
				>
					{#if refreshingAll}
						🔄 Refreshing {refreshProgress}...
					{:else}
						🔄 Refresh All Metrics
					{/if}
				</button>
			</div>
		</div>

		<div class="summary-grid">
			<article class="summary-card">
				<p>Total Clips</p>
				<strong>{biTotals.totalClips}</strong>
			</article>
			<article class="summary-card">
				<p>Contents Covered</p>
				<strong>{biTotals.coveredContents}</strong>
			</article>
			<article class="summary-card">
				<p>Total Views</p>
				<strong>{formatCount(biTotals.totalViews)}</strong>
			</article>
			<article class="summary-card">
				<p>Engagement Rate</p>
				<strong>{formatRate(biTotals.engagementRate)}</strong>
			</article>
		</div>

		<div class="bi-grid">
			<div class="bi-table-wrap">
				<h3>Platform Breakdown</h3>
				<table class="bi-table">
					<thead>
						<tr>
							<th>Platform</th>
							<th>Clips</th>
							<th>Views</th>
							<th>Engagement</th>
							<th>Avg Views</th>
							<th>ER</th>
						</tr>
					</thead>
					<tbody>
						{#each platformStats as stat}
							<tr>
								<td
									><span
										class={`platform ${stat.platformClass}`}
										>{stat.label}</span
									></td
								>
								<td>{stat.clipCount}</td>
								<td>{formatCount(stat.totalViews)}</td>
								<td>{formatCount(stat.totalEngagement)}</td>
								<td>{formatAvg(stat.avgViews)}</td>
								<td>{formatRate(stat.engagementRate)}</td>
							</tr>
						{/each}
					</tbody>
				</table>
			</div>

			<div class="leaderboard">
				<h3>Top Performing Clips</h3>
				{#if topClipRows.length === 0}
					<p class="empty">ยังไม่มีคลิปที่ monitor แล้ว</p>
				{:else}
					<div class="leader-list">
						{#each topClipRows as row, index}
							<article class="leader-item">
								<div>
									<p class="rank">#{index + 1}</p>
									<strong
										>{row.content
											? contentCode(row.content)
											: "Unknown content"}</strong
									>
									<p class="muted">
										{row.clip.title ??
											row.content?.title ??
											"Untitled clip"}
									</p>
									<p class="muted">
										{platformLabel[row.clip.platform]}
									</p>
								</div>
								<div class="leader-metrics">
									<p>
										{formatCount(row.clip.view_count)} views
									</p>
									<p>
										{formatCount(row.engagement)} engagement
									</p>
								</div>
							</article>
						{/each}
					</div>
				{/if}
			</div>
		</div>
	</section>
</main>

<style>
	.page {
		display: grid;
		gap: 1rem;
	}

	h1,
	h2,
	h3,
	h4 {
		font-family: "Space Grotesk", "Noto Sans Thai", sans-serif;
	}

	.hero {
		text-align: center;
		padding: 1.2rem 0 0.2rem;
	}

	.hero h1 {
		margin: 0.4rem 0;
		font-size: clamp(1.8rem, 4.5vw, 2.8rem);
	}

	.hero p {
		margin: 0;
		color: #475569;
	}

	.kicker {
		margin: 0;
		font-size: 0.78rem;
		text-transform: uppercase;
		letter-spacing: 0.16em;
		color: #b45309;
		font-weight: 700;
	}

	.kicker.small {
		font-size: 0.68rem;
		color: #2563eb;
	}

	.panel {
		padding: 1rem;
		border-radius: 1rem;
		border: 1px solid rgba(15, 23, 42, 0.08);
		background: rgba(255, 255, 255, 0.88);
	}

	.alert,
	.notice {
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

	.monitor-layout {
		display: grid;
		grid-template-columns: 320px 1fr;
		gap: 0.85rem;
	}

	.monitor-left,
	.monitor-right {
		border: 1px solid rgba(15, 23, 42, 0.08);
		border-radius: 0.85rem;
		background: #fff;
		padding: 0.8rem;
	}

	.create-content-box {
		display: grid;
		gap: 0.55rem;
		padding: 0.7rem;
		margin-bottom: 0.7rem;
		border: 1px solid rgba(37, 99, 235, 0.18);
		border-radius: 0.75rem;
		background: rgba(37, 99, 235, 0.03);
	}

	.create-content-box h2 {
		margin: 0;
		font-size: 0.96rem;
	}

	.list-head {
		display: flex;
		align-items: center;
		justify-content: space-between;
		gap: 0.5rem;
		margin-bottom: 0.6rem;
	}

	.list-head h2 {
		margin: 0;
		font-size: 1.08rem;
	}

	.content-list {
		display: grid;
		gap: 0.45rem;
		max-height: 640px;
		overflow: auto;
	}

	.content-btn {
		text-align: left;
		border: 1px solid rgba(15, 23, 42, 0.1);
		border-radius: 0.75rem;
		padding: 0.62rem;
		background: #fff;
		display: flex;
		justify-content: space-between;
		gap: 0.4rem;
		cursor: pointer;
	}

	.content-btn.active {
		background: rgba(248, 250, 252, 0.95);
		box-shadow: inset 0 0 0 1px rgba(37, 99, 235, 0.2);
	}

	.content-btn strong {
		display: block;
		font-size: 0.86rem;
	}

	.content-title {
		margin: 0.18rem 0 0;
		font-size: 0.8rem;
		color: #475569;
	}

	.content-meta {
		display: grid;
		justify-items: end;
		font-size: 0.72rem;
		color: #64748b;
	}

	.source-head h3 {
		margin: 0.2rem 0;
	}

	.meta {
		margin: 0;
		font-size: 0.83rem;
		color: #64748b;
	}

	.head-actions {
		margin-top: 0.5rem;
	}

	.platform-switcher {
		display: flex;
		flex-wrap: wrap;
		gap: 0.45rem;
		margin: 0.75rem 0;
	}

	.platform-btn {
		border: 1px solid rgba(15, 23, 42, 0.14);
		background: #fff;
		border-radius: 999px;
		padding: 0.35rem 0.6rem;
		font-size: 0.75rem;
		display: inline-flex;
		align-items: center;
		gap: 0.33rem;
		cursor: pointer;
	}

	.platform-btn.active {
		border-color: rgba(37, 99, 235, 0.5);
		background: rgba(37, 99, 235, 0.08);
		color: #1d4ed8;
	}

	.dot {
		width: 0.42rem;
		height: 0.42rem;
		border-radius: 50%;
		background: #16a34a;
	}

	.row {
		display: grid;
		gap: 0.45rem;
		margin: 0.7rem 0;
	}

	.row.small-gap {
		margin: 0;
	}

	label {
		font-size: 0.82rem;
		color: #475569;
	}

	input,
	textarea {
		width: 100%;
		box-sizing: border-box;
		font: inherit;
		padding: 0.68rem 0.8rem;
		border-radius: 0.7rem;
		border: 1px solid rgba(15, 23, 42, 0.15);
		background: #fff;
	}

	.full {
		width: 100%;
	}

	.metrics {
		display: grid;
		grid-template-columns: repeat(5, minmax(0, 1fr));
		gap: 0.5rem;
	}

	.metric-item {
		padding: 0.55rem;
		border-radius: 0.7rem;
		background: rgba(15, 23, 42, 0.04);
		border: 1px solid rgba(15, 23, 42, 0.08);
	}

	.metric-item input {
		border: 0;
		background: transparent;
		padding: 0;
		font-weight: 700;
	}

	.metric-item label {
		font-size: 0.73rem;
	}

	.action-row {
		display: flex;
		gap: 0.55rem;
		flex-wrap: wrap;
		margin: 0.6rem 0;
	}

	.primary,
	.ghost,
	.danger {
		border-radius: 0.68rem;
		font-weight: 700;
		padding: 0.58rem 0.8rem;
		cursor: pointer;
	}

	.primary {
		border: 0;
		background: #2563eb;
		color: #fff;
	}

	.ghost {
		border: 1px solid rgba(37, 99, 235, 0.25);
		background: rgba(37, 99, 235, 0.08);
		color: #1d4ed8;
	}

	.danger {
		border: 1px solid rgba(220, 38, 38, 0.2);
		background: rgba(220, 38, 38, 0.08);
		color: #b91c1c;
	}

	.primary:disabled,
	.ghost:disabled,
	.danger:disabled {
		opacity: 0.55;
		cursor: not-allowed;
	}

	.preview-card {
		display: grid;
		grid-template-columns: 180px 1fr;
		gap: 0.8rem;
		align-items: center;
		margin-bottom: 0.75rem;
	}

	.preview-media,
	.card-media {
		width: 100%;
		aspect-ratio: 16 / 9;
		object-fit: cover;
		border-radius: 0.72rem;
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

	.platform-grid {
		display: grid;
		grid-template-columns: repeat(4, minmax(0, 1fr));
		gap: 0.55rem;
	}

	.platform-card {
		--platform-frame-color: rgba(15, 23, 42, 0.1);
		border: 1px solid var(--platform-frame-color);
		background: #fff;
		border-radius: 0.75rem;
		padding: 0.55rem;
		display: grid;
		gap: 0.4rem;
		text-align: left;
		cursor: pointer;
	}

	.platform-card.active {
		box-shadow: inset 0 0 0 1px rgba(37, 99, 235, 0.2);
		background: rgba(248, 250, 252, 0.95);
	}

	.platform-card-head {
		display: flex;
		justify-content: space-between;
		align-items: center;
		gap: 0.3rem;
	}

	.platform-card-head strong {
		font-size: 0.74rem;
	}

	.status {
		font-size: 0.64rem;
		font-weight: 700;
		border-radius: 999px;
		padding: 0.1rem 0.42rem;
	}

	.status.ok {
		background: rgba(22, 163, 74, 0.12);
		color: #166534;
	}

	.status.missing {
		background: rgba(100, 116, 139, 0.14);
		color: #475569;
	}

	.card-title {
		margin: 0;
		font-size: 0.75rem;
		line-height: 1.3;
		color: #334155;
	}

	.card-metric {
		margin: 0;
		font-size: 0.72rem;
		color: #64748b;
	}

	.card-empty {
		display: grid;
		place-items: center;
		aspect-ratio: 16 / 9;
		border-radius: 0.7rem;
		border: 1px dashed rgba(148, 163, 184, 0.6);
		color: #64748b;
		font-size: 0.72rem;
	}

	.chip {
		display: inline-block;
		padding: 0.12rem 0.48rem;
		border-radius: 999px;
		font-size: 0.68rem;
		font-weight: 700;
		background: rgba(22, 163, 74, 0.12);
		color: #166534;
	}

	.platform {
		display: inline-block;
		padding: 0.14rem 0.5rem;
		border-radius: 999px;
		font-size: 0.67rem;
		font-weight: 700;
		background: rgba(180, 83, 9, 0.14);
		color: #92400e;
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

	.bi-panel {
		display: grid;
		gap: 0.75rem;
	}

	.summary-grid {
		display: grid;
		grid-template-columns: repeat(4, minmax(0, 1fr));
		gap: 0.6rem;
	}

	.summary-card {
		border: 1px solid rgba(15, 23, 42, 0.08);
		border-radius: 0.8rem;
		background: #fff;
		padding: 0.8rem;
	}

	.summary-card p {
		margin: 0;
		font-size: 0.75rem;
		color: #64748b;
	}

	.summary-card strong {
		display: block;
		margin-top: 0.2rem;
		font-size: 1.35rem;
	}

	.bi-grid {
		display: grid;
		grid-template-columns: 1.1fr 0.9fr;
		gap: 0.7rem;
	}

	.bi-table-wrap,
	.leaderboard {
		border: 1px solid rgba(15, 23, 42, 0.08);
		border-radius: 0.8rem;
		background: #fff;
		padding: 0.75rem;
	}

	.bi-table-wrap h3,
	.leaderboard h3 {
		margin: 0 0 0.5rem;
		font-size: 1rem;
	}

	.bi-table-wrap {
		overflow-x: auto;
	}

	.bi-table {
		width: 100%;
		min-width: 560px;
		border-collapse: collapse;
		font-size: 0.82rem;
	}

	.bi-table th,
	.bi-table td {
		padding: 0.45rem 0.4rem;
		border-bottom: 1px solid rgba(15, 23, 42, 0.08);
		text-align: left;
	}

	.bi-table th {
		font-size: 0.73rem;
		text-transform: uppercase;
		color: #64748b;
	}

	.leader-list {
		display: grid;
		gap: 0.48rem;
	}

	.leader-item {
		display: flex;
		justify-content: space-between;
		gap: 0.5rem;
		padding: 0.55rem;
		border-radius: 0.68rem;
		background: rgba(15, 23, 42, 0.03);
		border: 1px solid rgba(15, 23, 42, 0.06);
	}

	.rank {
		margin: 0;
		font-size: 0.72rem;
		color: #64748b;
	}

	.muted {
		margin: 0.15rem 0 0;
		font-size: 0.74rem;
		color: #64748b;
	}

	.leader-metrics {
		text-align: right;
		font-size: 0.74rem;
		color: #475569;
	}

	.leader-metrics p {
		margin: 0.18rem 0 0;
	}

	.empty {
		margin: 0;
		color: #64748b;
		font-size: 0.88rem;
	}

	@media (max-width: 1120px) {
		.monitor-layout {
			grid-template-columns: 1fr;
		}

		.platform-grid {
			grid-template-columns: repeat(2, minmax(0, 1fr));
		}

		.summary-grid {
			grid-template-columns: repeat(2, minmax(0, 1fr));
		}

		.bi-grid {
			grid-template-columns: 1fr;
		}
	}

	@media (max-width: 780px) {
		.preview-card {
			grid-template-columns: 1fr;
		}

		.metrics {
			grid-template-columns: repeat(2, minmax(0, 1fr));
		}
	}

	.card-bottom {
		display: flex;
		align-items: center;
		justify-content: space-between;
		gap: 0.3rem;
	}

	.refresh-icon {
		background: none;
		border: none;
		cursor: pointer;
		font-size: 0.82rem;
		padding: 0.15rem;
		border-radius: 0.4rem;
		line-height: 1;
		opacity: 0.6;
		transition: opacity 0.15s;
	}

	.refresh-icon:hover:not(:disabled) {
		opacity: 1;
		background: rgba(37, 99, 235, 0.08);
	}

	.refresh-icon:disabled {
		cursor: not-allowed;
		opacity: 0.35;
	}

	.bi-head-actions {
		display: flex;
		align-items: center;
		gap: 0.7rem;
	}

	.refresh-btn {
		font-size: 0.78rem;
		padding: 0.4rem 0.65rem;
		white-space: nowrap;
	}

	@media (max-width: 560px) {
		.platform-grid {
			grid-template-columns: 1fr;
		}

		.summary-grid {
			grid-template-columns: 1fr;
		}
	}
</style>
