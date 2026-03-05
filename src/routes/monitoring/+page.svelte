<script lang="ts">
	import { onMount } from 'svelte';
	import { hasSupabaseConfig, supabase } from '$lib/supabase';
	import type {
		MonitoringChannelVideoRow,
		MonitoringContentPlatformRow,
		MonitoringContentRow,
		MonitoringMetricSnapshotRow,
		MonitoringPriority,
		SupportedPlatform
	} from '$lib/types';
	import { formatCount, platformLabel, platformOrder } from '$lib/media-plan';

	type ContentListRow = {
		content: MonitoringContentRow;
		linkCount: number;
		dueCount: number;
		lastCheckedAt: string | null;
	};

	const availablePlatforms = platformOrder as readonly SupportedPlatform[];
	const priorityOptions: MonitoringPriority[] = ['low', 'normal', 'high', 'urgent'];
	const priorityLabel: Record<MonitoringPriority, string> = {
		low: 'Low',
		normal: 'Normal',
		high: 'High',
		urgent: 'Urgent'
	};
	const priorityRank: Record<MonitoringPriority, number> = {
		low: 0,
		normal: 1,
		high: 2,
		urgent: 3
	};
	const platformRank = new Map<SupportedPlatform, number>(
		availablePlatforms.map((platform, index) => [platform, index])
	);
	const platformPlaceholder: Record<SupportedPlatform, string> = {
		youtube: 'https://www.youtube.com/@channel',
		facebook: 'https://www.facebook.com/page',
		instagram: 'https://www.instagram.com/account',
		tiktok: 'https://www.tiktok.com/@account'
	};

	let contents = $state<MonitoringContentRow[]>([]);
	let platformLinks = $state<MonitoringContentPlatformRow[]>([]);
	let snapshots = $state<MonitoringMetricSnapshotRow[]>([]);
	let channelVideos = $state<MonitoringChannelVideoRow[]>([]);

	let loading = $state(false);
	let loadingChannelVideos = $state(false);
	let syncingChannelVideos = $state(false);
	let channelVideoLoadToken = 0;
	let message = $state('');
	let errorMessage = $state('');

	let selectedContentId = $state<string | null>(null);
	let selectedPlatform = $state<SupportedPlatform>('youtube');

	let contentTitleInput = $state('');
	let contentDescriptionInput = $state('');
	let contentOwnerInput = $state('');
	let contentPriorityInput = $state<MonitoringPriority>('normal');
	let creatingContent = $state(false);
	let deletingContent = $state(false);

	let searchInput = $state('');
	let ownerFilter = $state('all');
	let priorityFilter = $state<'all' | MonitoringPriority>('all');
	let dueOnly = $state(false);

	let linkInput = $state('');
	let linkIsChannel = $state(true);
	let savingLink = $state(false);
	let removingLink = $state(false);
	let markingChecked = $state(false);

	let snapshotDate = $state(todayIso());
	let snapshotFollowers = $state<number | null>(null);
	let snapshotViews = $state<number | null>(null);
	let snapshotPosts = $state<number | null>(null);
	let snapshotLikes = $state<number | null>(null);
	let snapshotComments = $state<number | null>(null);
	let snapshotShares = $state<number | null>(null);
	let snapshotSaves = $state<number | null>(null);
	let snapshotNotes = $state('');
	let savingSnapshot = $state(false);

	const contentMap = $derived.by(() => new Map(contents.map((item) => [item.id, item])));

	const linksByContentId = $derived.by(() => {
		const map = new Map<string, MonitoringContentPlatformRow[]>();
		for (const row of platformLinks) {
			const bucket = map.get(row.content_id) ?? [];
			bucket.push(row);
			map.set(row.content_id, bucket);
		}
		for (const bucket of map.values()) {
			bucket.sort((a, b) => (platformRank.get(a.platform) ?? 99) - (platformRank.get(b.platform) ?? 99));
		}
		return map;
	});

	const snapshotsByPlatformId = $derived.by(() => {
		const map = new Map<string, MonitoringMetricSnapshotRow[]>();
		for (const row of snapshots) {
			const bucket = map.get(row.platform_id) ?? [];
			bucket.push(row);
			map.set(row.platform_id, bucket);
		}
		for (const bucket of map.values()) {
			bucket.sort((a, b) => {
				if (a.snapshot_date !== b.snapshot_date) {
					return b.snapshot_date.localeCompare(a.snapshot_date);
				}
				return b.created_at.localeCompare(a.created_at);
			});
		}
		return map;
	});

	const owners = $derived.by(() => {
		const unique = Array.from(new Set(contents.map((item) => item.owner?.trim()).filter(Boolean) as string[]));
		return unique.sort((a, b) => a.localeCompare(b));
	});

	const selectedContent = $derived.by(() => {
		if (!selectedContentId) return null;
		return contentMap.get(selectedContentId) ?? null;
	});

	const selectedContentLinks = $derived.by(() => {
		if (!selectedContentId) return [];
		return linksByContentId.get(selectedContentId) ?? [];
	});

	const selectedLinkByPlatform = $derived.by(() => {
		const map = new Map<SupportedPlatform, MonitoringContentPlatformRow>();
		for (const row of selectedContentLinks) map.set(row.platform, row);
		return map;
	});

	const selectedPlatformLink = $derived.by(() => selectedLinkByPlatform.get(selectedPlatform) ?? null);
	const selectedPlatformSnapshots = $derived.by(() => {
		if (!selectedPlatformLink) return [];
		return snapshotsByPlatformId.get(selectedPlatformLink.id) ?? [];
	});
	const latestSnapshot = $derived.by(() => selectedPlatformSnapshots[0] ?? null);
	const previousSnapshot = $derived.by(() => selectedPlatformSnapshots[1] ?? null);

	const contentRows = $derived.by((): ContentListRow[] => {
		return contents
			.map((content) => {
				const links = linksByContentId.get(content.id) ?? [];
				const dueCount = links.filter((row) => isDue(row.last_checked_at)).length;
				const lastCheckedAt =
					links
						.filter((row) => row.last_checked_at)
						.map((row) => row.last_checked_at as string)
						.sort((a, b) => b.localeCompare(a))[0] ?? null;
				return {
					content,
					linkCount: links.length,
					dueCount,
					lastCheckedAt
				};
			})
			.sort((a, b) => {
				if (b.dueCount !== a.dueCount) return b.dueCount - a.dueCount;
				const priorityDiff = priorityRank[b.content.priority] - priorityRank[a.content.priority];
				if (priorityDiff !== 0) return priorityDiff;
				return b.content.created_at.localeCompare(a.content.created_at);
			});
	});

	const filteredRows = $derived.by(() => {
		const q = searchInput.trim().toLowerCase();
		return contentRows.filter((row) => {
			if (ownerFilter !== 'all' && (row.content.owner ?? '') !== ownerFilter) return false;
			if (priorityFilter !== 'all' && row.content.priority !== priorityFilter) return false;
			if (dueOnly && row.dueCount === 0) return false;
			if (!q) return true;
			const code = contentCode(row.content).toLowerCase();
			const title = row.content.title.toLowerCase();
			const owner = (row.content.owner ?? '').toLowerCase();
			return code.includes(q) || title.includes(q) || owner.includes(q);
		});
	});

	const queueRows = $derived.by(() => {
		const rows: Array<{
			content: MonitoringContentRow;
			link: MonitoringContentPlatformRow;
			days: number;
		}> = [];
		for (const link of platformLinks) {
			if (!isDue(link.last_checked_at)) continue;
			const content = contentMap.get(link.content_id);
			if (!content) continue;
			rows.push({
				content,
				link,
				days: daysSince(link.last_checked_at)
			});
		}
		return rows.sort((a, b) => {
			const p = priorityRank[b.content.priority] - priorityRank[a.content.priority];
			if (p !== 0) return p;
			return b.days - a.days;
		});
	});

	const dashboard = $derived.by(() => {
		const dueLinks = platformLinks.filter((row) => isDue(row.last_checked_at)).length;
		const checkedToday = platformLinks.filter((row) => sameDate(row.last_checked_at, todayIso())).length;
		const highPriorityDue = queueRows.filter((row) => row.content.priority === 'high' || row.content.priority === 'urgent').length;
		return {
			totalContents: contents.length,
			totalLinks: platformLinks.length,
			dueLinks,
			checkedToday,
			highPriorityDue
		};
	});

	function todayIso() {
		return new Date().toISOString().slice(0, 10);
	}

	function toNullableInt(value: unknown): number | null {
		if (value === null || value === undefined || value === '') return null;
		const n = Number(value);
		return Number.isFinite(n) ? Math.round(n) : null;
	}

	function sameDate(input: string | null | undefined, dateIso: string): boolean {
		if (!input) return false;
		return input.slice(0, 10) === dateIso;
	}

	function isDue(lastCheckedAt: string | null | undefined): boolean {
		if (!lastCheckedAt) return true;
		return lastCheckedAt.slice(0, 10) !== todayIso();
	}

	function daysSince(lastCheckedAt: string | null | undefined): number {
		if (!lastCheckedAt) return 999;
		const last = new Date(lastCheckedAt);
		const now = new Date();
		const diff = now.getTime() - last.getTime();
		return Math.max(0, Math.floor(diff / 86400000));
	}

	function contentCode(content: Pick<MonitoringContentRow, 'id' | 'content_code'>): string {
		const code = content.content_code?.trim();
		return code ? code : `MC-${content.id.slice(0, 8).toUpperCase()}`;
	}

	function formatDate(dateIso: string): string {
		const parsed = new Date(`${dateIso}T00:00:00`);
		return parsed.toLocaleDateString('en-US', { month: 'short', day: 'numeric' });
	}

	function formatDateTime(value: string | null | undefined): string {
		if (!value) return 'Never';
		const parsed = new Date(value);
		return parsed.toLocaleString('en-US', { month: 'short', day: 'numeric', hour: '2-digit', minute: '2-digit' });
	}

	function priorityClass(priority: MonitoringPriority): string {
		return `priority--${priority}`;
	}

	function snapshotDelta(
		latest: MonitoringMetricSnapshotRow | null,
		prev: MonitoringMetricSnapshotRow | null,
		key: keyof Pick<MonitoringMetricSnapshotRow, 'followers_count' | 'view_count' | 'post_count' | 'like_count' | 'comment_count' | 'share_count' | 'save_count'>
	): number | null {
		if (!latest || !prev) return null;
		const a = latest[key];
		const b = prev[key];
		if (a === null || a === undefined || b === null || b === undefined) return null;
		return a - b;
	}

	function formatDelta(value: number | null): string {
		if (value === null) return '-';
		if (value === 0) return '0';
		if (value > 0) return `+${formatCount(value)}`;
		return formatCount(value);
	}

	function hydrateSelectedForms() {
		const selected = selectedLinkByPlatform.get(selectedPlatform) ?? null;
		linkInput = selected?.url ?? '';
		linkIsChannel = selected?.is_channel ?? true;

		snapshotDate = todayIso();
		const latest = selected ? (snapshotsByPlatformId.get(selected.id) ?? [])[0] : null;
		snapshotFollowers = latest?.followers_count ?? null;
		snapshotViews = latest?.view_count ?? null;
		snapshotPosts = latest?.post_count ?? null;
		snapshotLikes = latest?.like_count ?? null;
		snapshotComments = latest?.comment_count ?? null;
		snapshotShares = latest?.share_count ?? null;
		snapshotSaves = latest?.save_count ?? null;
		snapshotNotes = '';
		void loadChannelVideosForSelected();
	}

	function selectContent(contentId: string) {
		selectedContentId = contentId;
		const links = linksByContentId.get(contentId) ?? [];
		selectedPlatform = links[0]?.platform ?? 'youtube';
		hydrateSelectedForms();
	}

	function selectPlatform(platform: SupportedPlatform) {
		selectedPlatform = platform;
		hydrateSelectedForms();
	}

	function dismissMessageSoon() {
		setTimeout(() => {
			message = '';
		}, 4000);
	}

	async function loadChannelVideosForSelected() {
		const selected = selectedLinkByPlatform.get(selectedPlatform) ?? null;
		if (!selected || selected.platform !== 'youtube' || !selected.is_channel) {
			channelVideos = [];
			loadingChannelVideos = false;
			return;
		}

		const token = ++channelVideoLoadToken;
		loadingChannelVideos = true;
		try {
			const resp = await fetch(`/api/openclaw/monitoring/platforms/${selected.id}/videos?limit=120`);
			const body = await resp.json();
			if (token !== channelVideoLoadToken) return;
			if (!resp.ok) {
				errorMessage = body.error ?? 'โหลดวิดีโอช่องไม่สำเร็จ';
				channelVideos = [];
				return;
			}
			channelVideos = (body.videos ?? []) as MonitoringChannelVideoRow[];
		} catch (error) {
			if (token !== channelVideoLoadToken) return;
			errorMessage = error instanceof Error ? error.message : 'โหลดวิดีโอช่องไม่สำเร็จ';
			channelVideos = [];
		} finally {
			if (token === channelVideoLoadToken) loadingChannelVideos = false;
		}
	}

	async function syncYoutubeChannelVideos() {
		const selected = selectedLinkByPlatform.get(selectedPlatform) ?? null;
		if (!selected || selected.platform !== 'youtube' || !selected.is_channel) {
			errorMessage = 'ต้องเลือก YouTube channel link ก่อน';
			return;
		}

		syncingChannelVideos = true;
		errorMessage = '';
		message = '';
		try {
			const resp = await fetch(`/api/openclaw/monitoring/platforms/${selected.id}/videos`, {
				method: 'POST'
			});
			const body = await resp.json();
			if (!resp.ok) {
				errorMessage = body.error ?? 'Sync วิดีโอช่องไม่สำเร็จ';
				return;
			}

			channelVideos = (body.videos ?? []) as MonitoringChannelVideoRow[];
			await loadPlatformLinks();
			message = `Sync YouTube สำเร็จ (${body.video_count ?? channelVideos.length} videos)`;
			dismissMessageSoon();
		} catch (error) {
			errorMessage = error instanceof Error ? error.message : 'Sync วิดีโอช่องไม่สำเร็จ';
		} finally {
			syncingChannelVideos = false;
			hydrateSelectedForms();
		}
	}

	async function loadContents() {
		if (!supabase) return;
		const { data, error } = await supabase.from('monitoring_content').select('*').order('created_at', { ascending: false });
		if (error) {
			errorMessage = `โหลด content ไม่สำเร็จ: ${error.message}`;
			return;
		}
		contents = (data ?? []) as MonitoringContentRow[];
	}

	async function loadPlatformLinks() {
		if (!supabase) return;
		const { data, error } = await supabase.from('monitoring_content_platform').select('*').order('created_at', { ascending: false });
		if (error) {
			errorMessage = `โหลด platform links ไม่สำเร็จ: ${error.message}`;
			return;
		}
		platformLinks = (data ?? []) as MonitoringContentPlatformRow[];
	}

	async function loadSnapshots() {
		if (!supabase) return;
		const { data, error } = await supabase
			.from('monitoring_metric_snapshots')
			.select('*')
			.order('snapshot_date', { ascending: false })
			.order('created_at', { ascending: false });
		if (error) {
			errorMessage = `โหลด snapshots ไม่สำเร็จ: ${error.message}`;
			return;
		}
		snapshots = (data ?? []) as MonitoringMetricSnapshotRow[];
	}

	async function loadAll() {
		if (!supabase) return;
		loading = true;
		errorMessage = '';
		await Promise.all([loadContents(), loadPlatformLinks(), loadSnapshots()]);
		loading = false;

		if (!selectedContentId && contents.length > 0) {
			selectContent(contents[0].id);
		} else if (selectedContentId) {
			hydrateSelectedForms();
		}
	}

	async function createContent() {
		if (!supabase) return;
		if (!contentTitleInput.trim()) {
			errorMessage = 'กรุณาใส่ชื่อ content';
			return;
		}

		creatingContent = true;
		errorMessage = '';
		message = '';
		const payload = {
			title: contentTitleInput.trim(),
			description: contentDescriptionInput.trim() || null,
			owner: contentOwnerInput.trim() || null,
			priority: contentPriorityInput,
			notes: null,
			status: 'active'
		};

		const { data, error } = await supabase.from('monitoring_content').insert(payload).select('*').single();
		creatingContent = false;

		if (error || !data) {
			errorMessage = `สร้าง content ไม่สำเร็จ: ${error?.message ?? 'unknown error'}`;
			return;
		}

		contentTitleInput = '';
		contentDescriptionInput = '';
		contentOwnerInput = '';
		contentPriorityInput = 'normal';
		await loadContents();
		selectContent((data as MonitoringContentRow).id);
		message = 'เพิ่ม monitoring content แล้ว';
		dismissMessageSoon();
	}

	async function deleteSelectedContent() {
		if (!supabase || !selectedContent) return;

		const confirmed = window.confirm(`ลบ content นี้ใช่ไหม?\n${contentCode(selectedContent)} • ${selectedContent.title}`);
		if (!confirmed) return;

		deletingContent = true;
		errorMessage = '';
		message = '';

		const { data, error } = await supabase.from('monitoring_content').delete().eq('id', selectedContent.id).select('id');
		deletingContent = false;

		if (error) {
			errorMessage = `ลบ content ไม่สำเร็จ: ${error.message}`;
			return;
		}
		if (!data || data.length === 0) {
			errorMessage = 'ลบ content ไม่สำเร็จ: ไม่มีสิทธิ์หรือไม่พบข้อมูล';
			return;
		}

		selectedContentId = null;
		await loadAll();
		message = 'ลบ content แล้ว';
		dismissMessageSoon();
	}

	async function savePlatformLink() {
		if (!supabase || !selectedContentId) return;
		if (!linkInput.trim()) {
			errorMessage = 'กรุณาใส่ลิงก์ช่อง/โปรไฟล์';
			return;
		}

		savingLink = true;
		errorMessage = '';
		message = '';

		const payload = {
			content_id: selectedContentId,
			platform: selectedPlatform,
			url: linkInput.trim(),
			is_channel: linkIsChannel,
			last_checked_at: selectedPlatformLink?.last_checked_at ?? null
		};

		const { error } = await supabase
			.from('monitoring_content_platform')
			.upsert(payload, { onConflict: 'content_id,platform' });

		savingLink = false;

		if (error) {
			errorMessage = `บันทึกลิงก์ไม่สำเร็จ: ${error.message}`;
			return;
		}

		await loadPlatformLinks();
		hydrateSelectedForms();
		message = `บันทึกลิงก์ ${platformLabel[selectedPlatform]} แล้ว`;
		dismissMessageSoon();
	}

	async function removePlatformLink() {
		if (!supabase || !selectedPlatformLink) return;
		const confirmed = window.confirm(`ลบลิงก์ ${platformLabel[selectedPlatform]} ใช่ไหม?`);
		if (!confirmed) return;

		removingLink = true;
		errorMessage = '';
		message = '';

		const { error } = await supabase.from('monitoring_content_platform').delete().eq('id', selectedPlatformLink.id);
		removingLink = false;

		if (error) {
			errorMessage = `ลบลิงก์ไม่สำเร็จ: ${error.message}`;
			return;
		}

		await Promise.all([loadPlatformLinks(), loadSnapshots()]);
		hydrateSelectedForms();
		message = `ลบลิงก์ ${platformLabel[selectedPlatform]} แล้ว`;
		dismissMessageSoon();
	}

	async function markCheckedNow() {
		if (!supabase || !selectedPlatformLink) return;
		markingChecked = true;
		errorMessage = '';
		message = '';

		const { error } = await supabase
			.from('monitoring_content_platform')
			.update({ last_checked_at: new Date().toISOString() })
			.eq('id', selectedPlatformLink.id);

		markingChecked = false;

		if (error) {
			errorMessage = `อัปเดตเวลาเช็กไม่สำเร็จ: ${error.message}`;
			return;
		}

		await loadPlatformLinks();
		hydrateSelectedForms();
		message = `อัปเดตสถานะเช็ก ${platformLabel[selectedPlatform]} แล้ว`;
		dismissMessageSoon();
	}

	async function saveSnapshot() {
		if (!supabase || !selectedContentId || !selectedPlatformLink) {
			errorMessage = 'ต้องบันทึกลิงก์แพลตฟอร์มก่อน';
			return;
		}
		if (!snapshotDate) {
			errorMessage = 'กรุณาเลือกวันที่ snapshot';
			return;
		}

		savingSnapshot = true;
		errorMessage = '';
		message = '';

		const payload = {
			content_id: selectedContentId,
			platform_id: selectedPlatformLink.id,
			snapshot_date: snapshotDate,
			followers_count: toNullableInt(snapshotFollowers),
			view_count: toNullableInt(snapshotViews),
			post_count: toNullableInt(snapshotPosts),
			like_count: toNullableInt(snapshotLikes),
			comment_count: toNullableInt(snapshotComments),
			share_count: toNullableInt(snapshotShares),
			save_count: toNullableInt(snapshotSaves),
			notes: snapshotNotes.trim() || null
		};

		const { error } = await supabase
			.from('monitoring_metric_snapshots')
			.upsert(payload, { onConflict: 'platform_id,snapshot_date' });

		if (!error) {
			await supabase
				.from('monitoring_content_platform')
				.update({ last_checked_at: new Date().toISOString() })
				.eq('id', selectedPlatformLink.id);
		}

		savingSnapshot = false;

		if (error) {
			errorMessage = `บันทึก snapshot ไม่สำเร็จ: ${error.message}`;
			return;
		}

		await Promise.all([loadSnapshots(), loadPlatformLinks()]);
		hydrateSelectedForms();
		message = `บันทึก snapshot ${platformLabel[selectedPlatform]} วันที่ ${snapshotDate} แล้ว`;
		dismissMessageSoon();
	}

	function exportCSV() {
		const headers = [
			'Content Code',
			'Title',
			'Owner',
			'Priority',
			'Platform',
			'URL',
			'Is Channel',
			'Last Checked At',
			'Latest Date',
			'Followers',
			'Views',
			'Posts',
			'Likes',
			'Comments',
			'Shares',
			'Saves',
			'Delta Followers',
			'Delta Views',
			'Due'
		];

		const escape = (value: unknown) => `"${String(value ?? '').replace(/"/g, '""')}"`;

		const rows = platformLinks.map((link) => {
			const content = contentMap.get(link.content_id);
			const bucket = snapshotsByPlatformId.get(link.id) ?? [];
			const latest = bucket[0] ?? null;
			const prev = bucket[1] ?? null;
			const deltaFollowers = latest && prev && latest.followers_count !== null && prev.followers_count !== null
				? latest.followers_count - prev.followers_count
				: null;
			const deltaViews = latest && prev && latest.view_count !== null && prev.view_count !== null
				? latest.view_count - prev.view_count
				: null;
			return [
				content ? contentCode(content) : 'Unknown',
				content?.title ?? '',
				content?.owner ?? '',
				content ? priorityLabel[content.priority] : '',
				platformLabel[link.platform],
				link.url,
				link.is_channel ? 'yes' : 'no',
				link.last_checked_at ?? '',
				latest?.snapshot_date ?? '',
				latest?.followers_count ?? '',
				latest?.view_count ?? '',
				latest?.post_count ?? '',
				latest?.like_count ?? '',
				latest?.comment_count ?? '',
				latest?.share_count ?? '',
				latest?.save_count ?? '',
				deltaFollowers ?? '',
				deltaViews ?? '',
				isDue(link.last_checked_at) ? 'yes' : 'no'
			]
				.map(escape)
				.join(',');
		});

		const csv = [headers.join(','), ...rows].join('\n');
		const blob = new Blob(['\uFEFF' + csv], { type: 'text/csv;charset=utf-8' });
		const url = URL.createObjectURL(blob);
		const a = document.createElement('a');
		a.href = url;
		a.download = `monitoring-${todayIso()}.csv`;
		a.click();
		URL.revokeObjectURL(url);
	}

	onMount(async () => {
		await loadAll();
	});
</script>

<main class="page">
	<section class="hero">
		<p class="kicker">Monitoring</p>
		<h1>BigLot Content Monitoring</h1>
		<p>เก็บลิงก์ช่องทุก platform และบันทึกตัวเลขรายวันแบบ manual</p>
	</section>

	{#if !hasSupabaseConfig}
		<p class="alert">ตั้งค่า env ก่อนใช้งาน: <code>PUBLIC_SUPABASE_URL</code> และ <code>PUBLIC_SUPABASE_ANON_KEY</code></p>
	{/if}

	{#if message}
		<p class="notice success">{message}</p>
	{/if}
	{#if errorMessage}
		<p class="notice error">{errorMessage}</p>
	{/if}

	<section class="panel dashboard-panel">
		<div class="summary-grid">
			<article class="summary-card">
				<p>Total Contents</p>
				<strong>{dashboard.totalContents}</strong>
			</article>
			<article class="summary-card">
				<p>Platform Links</p>
				<strong>{dashboard.totalLinks}</strong>
			</article>
			<article class="summary-card">
				<p>Due Today</p>
				<strong>{dashboard.dueLinks}</strong>
			</article>
			<article class="summary-card">
				<p>Checked Today</p>
				<strong>{dashboard.checkedToday}</strong>
			</article>
			<article class="summary-card warning">
				<p>High Priority Due</p>
				<strong>{dashboard.highPriorityDue}</strong>
			</article>
		</div>
	</section>

	<section class="panel">
		<div class="monitor-layout">
			<div class="monitor-left">
				<div class="create-content-box">
					<h2>Add Monitoring Content</h2>
					<div class="row">
						<label for="mc-title">Title</label>
						<input id="mc-title" bind:value={contentTitleInput} placeholder="เช่น คู่แข่ง A - โปรเจกต์เดือนนี้" />
					</div>
					<div class="row two-col">
						<div>
							<label for="mc-owner">Owner</label>
							<input id="mc-owner" bind:value={contentOwnerInput} placeholder="ชื่อผู้รับผิดชอบ" />
						</div>
						<div>
							<label for="mc-priority">Priority</label>
							<select id="mc-priority" bind:value={contentPriorityInput}>
								{#each priorityOptions as p}
									<option value={p}>{priorityLabel[p]}</option>
								{/each}
							</select>
						</div>
					</div>
					<div class="row">
						<label for="mc-description">Description</label>
						<textarea id="mc-description" rows={2} bind:value={contentDescriptionInput} placeholder="บริบทที่ต้อง monitor"></textarea>
					</div>
					<button class="primary full" onclick={createContent} disabled={creatingContent}>
						{creatingContent ? 'Creating...' : 'Create Content'}
					</button>
				</div>

				<div class="filters-box">
					<div class="row">
						<label for="filter-search">Search</label>
						<input id="filter-search" bind:value={searchInput} placeholder="ค้นหา code / title / owner" />
					</div>
					<div class="row two-col">
						<div>
							<label for="filter-owner">Owner</label>
							<select id="filter-owner" bind:value={ownerFilter}>
								<option value="all">All</option>
								{#each owners as owner}
									<option value={owner}>{owner}</option>
								{/each}
							</select>
						</div>
						<div>
							<label for="filter-priority">Priority</label>
							<select id="filter-priority" bind:value={priorityFilter}>
								<option value="all">All</option>
								{#each priorityOptions as p}
									<option value={p}>{priorityLabel[p]}</option>
								{/each}
							</select>
						</div>
					</div>
					<label class="check-row">
						<input type="checkbox" bind:checked={dueOnly} />
						<span>Show only due items</span>
					</label>
				</div>

				<div class="list-head">
					<h2>Contents ({filteredRows.length})</h2>
					<button class="ghost small" onclick={exportCSV} disabled={platformLinks.length === 0}>Export CSV</button>
				</div>

				{#if loading}
					<p class="empty">Loading...</p>
				{:else if filteredRows.length === 0}
					<p class="empty">ไม่พบรายการ</p>
				{:else}
					<div class="content-list">
						{#each filteredRows as row}
							<button
								type="button"
								class={`content-btn ${selectedContentId === row.content.id ? 'active' : ''}`}
								onclick={() => selectContent(row.content.id)}
							>
								<div>
									<strong>{contentCode(row.content)}</strong>
									<p class="content-title">{row.content.title}</p>
									<p class="muted">{row.content.owner ?? 'No owner'}</p>
								</div>
								<div class="content-meta">
									<span class={`badge ${priorityClass(row.content.priority)}`}>{priorityLabel[row.content.priority]}</span>
									<span class="chip">{row.linkCount} links</span>
									<span class={`chip ${row.dueCount > 0 ? 'chip-due' : ''}`}>{row.dueCount} due</span>
								</div>
							</button>
						{/each}
					</div>
				{/if}
			</div>

			<div class="monitor-right">
				{#if !selectedContent}
					<p class="empty">เลือก content จากฝั่งซ้ายเพื่อเริ่ม monitor</p>
				{:else}
					<div class="source-head">
						<p class="kicker small">Selected Content</p>
						<h3>{contentCode(selectedContent)}</h3>
						<p class="meta"><strong>{selectedContent.title}</strong></p>
						<p class="meta">Owner: {selectedContent.owner ?? 'No owner'} · Priority: {priorityLabel[selectedContent.priority]}</p>
						{#if selectedContent.description}
							<p class="meta">{selectedContent.description}</p>
						{/if}
						<div class="head-actions">
							<button class="danger" onclick={deleteSelectedContent} disabled={deletingContent}>
								{deletingContent ? 'Deleting...' : 'Delete Content'}
							</button>
						</div>
					</div>

					<div class="platform-switcher">
						{#each availablePlatforms as platform}
							{@const link = selectedLinkByPlatform.get(platform) ?? null}
							<button type="button" class={`platform-btn ${selectedPlatform === platform ? 'active' : ''}`} onclick={() => selectPlatform(platform)}>
								<span>{platformLabel[platform]}</span>
								{#if link}
									<span class={`dot ${isDue(link.last_checked_at) ? 'due' : ''}`} title={isDue(link.last_checked_at) ? 'Due' : 'Checked'}></span>
								{/if}
							</button>
						{/each}
					</div>

					<div class="editor-block">
						<h4>Platform Link ({platformLabel[selectedPlatform]})</h4>
						<div class="row">
							<label for="platform-link">Channel / Profile URL</label>
							<input id="platform-link" bind:value={linkInput} placeholder={platformPlaceholder[selectedPlatform]} />
						</div>
						<label class="check-row">
							<input type="checkbox" bind:checked={linkIsChannel} />
							<span>Link นี้เป็นหน้า Channel/Profile</span>
						</label>
						<p class="meta">Last checked: {formatDateTime(selectedPlatformLink?.last_checked_at)}</p>
						<div class="action-row">
							<button class="primary" onclick={savePlatformLink} disabled={savingLink}>{savingLink ? 'Saving...' : 'Save Link'}</button>
							<button class="ghost" onclick={markCheckedNow} disabled={!selectedPlatformLink || markingChecked}>{markingChecked ? 'Updating...' : 'Mark Checked Now'}</button>
							<button class="danger" onclick={removePlatformLink} disabled={!selectedPlatformLink || removingLink}>{removingLink ? 'Removing...' : 'Remove Link'}</button>
						</div>
					</div>

					{#if selectedPlatform === 'youtube' && selectedPlatformLink?.is_channel}
						<div class="editor-block">
							<div class="editor-head">
								<h4>YouTube Channel Videos</h4>
								<button class="ghost small" onclick={syncYoutubeChannelVideos} disabled={syncingChannelVideos}>
									{syncingChannelVideos ? 'Syncing...' : 'Sync Channel'}
								</button>
							</div>
							<p class="meta">อ่านรายการวิดีโอจากหน้า <code>/videos</code> ของช่อง และเก็บไว้ในระบบ monitoring</p>
							{#if loadingChannelVideos}
								<p class="empty">กำลังโหลดวิดีโอ...</p>
							{:else if channelVideos.length === 0}
								<p class="empty">ยังไม่มีข้อมูลวิดีโอ กด <strong>Sync Channel</strong> เพื่อดึงล่าสุด</p>
							{:else}
								<p class="meta">พบ {channelVideos.length} videos</p>
								<div class="video-list">
									{#each channelVideos.slice(0, 40) as video}
										<a class="video-row" href={video.video_url} target="_blank" rel="noopener noreferrer">
											{#if video.thumbnail_url}
												<img src={video.thumbnail_url} alt={video.title} />
											{:else}
												<div class="video-thumb-empty">No thumb</div>
											{/if}
											<div class="video-main">
												<p class="video-title">{video.title}</p>
												<p class="video-meta">
													{video.published_label ?? 'Published n/a'}
													·
													{video.view_label ?? (video.view_count !== null ? `${formatCount(video.view_count)} views` : 'views n/a')}
												</p>
											</div>
											{#if video.duration_label}
												<span class="video-duration">{video.duration_label}</span>
											{/if}
										</a>
									{/each}
								</div>
							{/if}
						</div>
					{/if}

					<div class="editor-block">
						<h4>Daily Snapshot ({platformLabel[selectedPlatform]})</h4>
						<div class="row two-col">
							<div>
								<label for="snap-date">Date</label>
								<input id="snap-date" type="date" bind:value={snapshotDate} />
							</div>
						</div>
						<div class="metrics-grid">
							<div class="metric-item">
								<label for="snap-followers">Followers/Subscribers</label>
								<input id="snap-followers" type="number" min="0" bind:value={snapshotFollowers} />
							</div>
							<div class="metric-item">
								<label for="snap-views">Views</label>
								<input id="snap-views" type="number" min="0" bind:value={snapshotViews} />
							</div>
							<div class="metric-item">
								<label for="snap-posts">Posts</label>
								<input id="snap-posts" type="number" min="0" bind:value={snapshotPosts} />
							</div>
							<div class="metric-item">
								<label for="snap-likes">Likes</label>
								<input id="snap-likes" type="number" min="0" bind:value={snapshotLikes} />
							</div>
							<div class="metric-item">
								<label for="snap-comments">Comments</label>
								<input id="snap-comments" type="number" min="0" bind:value={snapshotComments} />
							</div>
							<div class="metric-item">
								<label for="snap-shares">Shares</label>
								<input id="snap-shares" type="number" min="0" bind:value={snapshotShares} />
							</div>
							<div class="metric-item">
								<label for="snap-saves">Saves</label>
								<input id="snap-saves" type="number" min="0" bind:value={snapshotSaves} />
							</div>
						</div>
						<div class="row">
							<label for="snap-notes">Notes</label>
							<textarea id="snap-notes" rows={2} bind:value={snapshotNotes} placeholder="ข้อสังเกตของวันนี้"></textarea>
						</div>
						<button class="primary" onclick={saveSnapshot} disabled={savingSnapshot || !selectedPlatformLink}>
							{savingSnapshot ? 'Saving...' : 'Save Snapshot'}
						</button>
					</div>

					<div class="editor-block">
						<h4>Latest Trend</h4>
						{#if latestSnapshot}
							<div class="trend-grid">
								<div class="trend-item">
									<p>Followers</p>
									<strong>{formatCount(latestSnapshot.followers_count)}</strong>
									<small>{formatDelta(snapshotDelta(latestSnapshot, previousSnapshot, 'followers_count'))}</small>
								</div>
								<div class="trend-item">
									<p>Views</p>
									<strong>{formatCount(latestSnapshot.view_count)}</strong>
									<small>{formatDelta(snapshotDelta(latestSnapshot, previousSnapshot, 'view_count'))}</small>
								</div>
								<div class="trend-item">
									<p>Posts</p>
									<strong>{formatCount(latestSnapshot.post_count)}</strong>
									<small>{formatDelta(snapshotDelta(latestSnapshot, previousSnapshot, 'post_count'))}</small>
								</div>
							</div>
						{:else}
							<p class="empty">ยังไม่มี snapshot ของแพลตฟอร์มนี้</p>
						{/if}
					</div>

					<div class="editor-block">
						<h4>Snapshot History ({selectedPlatformSnapshots.length})</h4>
						{#if selectedPlatformSnapshots.length === 0}
							<p class="empty">ยังไม่มีประวัติ</p>
						{:else}
							<div class="table-wrap">
								<table class="history-table">
									<thead>
										<tr>
											<th>Date</th>
											<th>Followers</th>
											<th>Views</th>
											<th>Posts</th>
											<th>Likes</th>
											<th>Comments</th>
											<th>Shares</th>
											<th>Saves</th>
										</tr>
									</thead>
									<tbody>
										{#each selectedPlatformSnapshots as row}
											<tr>
												<td>{formatDate(row.snapshot_date)}</td>
												<td>{formatCount(row.followers_count)}</td>
												<td>{formatCount(row.view_count)}</td>
												<td>{formatCount(row.post_count)}</td>
												<td>{formatCount(row.like_count)}</td>
												<td>{formatCount(row.comment_count)}</td>
												<td>{formatCount(row.share_count)}</td>
												<td>{formatCount(row.save_count)}</td>
											</tr>
										{/each}
									</tbody>
								</table>
							</div>
						{/if}
					</div>
				{/if}
			</div>
		</div>
	</section>

	<section class="panel">
		<div class="list-head">
			<h2>Monitoring Queue (Due)</h2>
			<span>{queueRows.length} items</span>
		</div>
		{#if queueRows.length === 0}
			<p class="empty">ทุกลิงก์ถูกเช็กวันนี้แล้ว</p>
		{:else}
			<div class="queue-list">
				{#each queueRows as row}
					<article class="queue-item">
						<div>
							<p class="kicker tiny">{contentCode(row.content)}</p>
							<strong>{row.content.title}</strong>
							<p class="meta">{platformLabel[row.link.platform]} · {row.link.url}</p>
						</div>
						<div class="queue-meta">
							<span class={`badge ${priorityClass(row.content.priority)}`}>{priorityLabel[row.content.priority]}</span>
							<span class="chip chip-due">{row.days === 999 ? 'never checked' : `${row.days} day(s)`}</span>
						</div>
					</article>
				{/each}
			</div>
		{/if}
	</section>
</main>

<style>
	.page {
		display: grid;
		gap: 1rem;
	}

	h1, h2, h3, h4 {
		font-family: 'Space Grotesk', 'Noto Sans Thai', sans-serif;
	}

	.hero {
		text-align: center;
		padding: 1.1rem 0 0.2rem;
	}

	.hero h1 {
		margin: 0.35rem 0;
		font-size: clamp(1.8rem, 4.4vw, 2.7rem);
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

	.kicker.tiny {
		font-size: 0.62rem;
		color: #64748b;
	}

	.panel {
		padding: 1rem;
		border-radius: 1rem;
		border: 1px solid rgba(15, 23, 42, 0.08);
		background: rgba(255, 255, 255, 0.9);
	}

	.dashboard-panel {
		padding-top: 0.85rem;
	}

	.summary-grid {
		display: grid;
		grid-template-columns: repeat(5, minmax(0, 1fr));
		gap: 0.55rem;
	}

	.summary-card {
		border: 1px solid rgba(15, 23, 42, 0.08);
		border-radius: 0.78rem;
		background: #fff;
		padding: 0.7rem;
	}

	.summary-card p {
		margin: 0;
		font-size: 0.72rem;
		text-transform: uppercase;
		letter-spacing: 0.05em;
		color: #64748b;
	}

	.summary-card strong {
		display: block;
		margin-top: 0.2rem;
		font-size: 1.25rem;
	}

	.summary-card.warning {
		background: rgba(220, 38, 38, 0.04);
		border-color: rgba(220, 38, 38, 0.2);
	}

	.monitor-layout {
		display: grid;
		grid-template-columns: 340px 1fr;
		gap: 0.9rem;
	}

	.monitor-left,
	.monitor-right {
		border: 1px solid rgba(15, 23, 42, 0.08);
		border-radius: 0.86rem;
		background: #fff;
		padding: 0.82rem;
	}

	.create-content-box,
	.filters-box,
	.editor-block {
		display: grid;
		gap: 0.52rem;
		padding: 0.72rem;
		border: 1px solid rgba(15, 23, 42, 0.1);
		border-radius: 0.75rem;
		background: rgba(248, 250, 252, 0.65);
	}

	.create-content-box {
		border-color: rgba(37, 99, 235, 0.2);
		background: rgba(37, 99, 235, 0.03);
		margin-bottom: 0.7rem;
	}

	.filters-box {
		margin-bottom: 0.7rem;
	}

	.editor-block + .editor-block {
		margin-top: 0.7rem;
	}

	.editor-head {
		display: flex;
		align-items: center;
		justify-content: space-between;
		gap: 0.5rem;
	}

	.editor-head h4 {
		margin: 0;
	}

	.list-head {
		display: flex;
		align-items: center;
		justify-content: space-between;
		gap: 0.5rem;
		margin-bottom: 0.65rem;
	}

	.list-head h2 {
		margin: 0;
		font-size: 1.05rem;
	}

	.row {
		display: grid;
		gap: 0.4rem;
	}

	.row.two-col {
		grid-template-columns: 1fr 1fr;
		gap: 0.5rem;
	}

	label {
		font-size: 0.79rem;
		color: #475569;
	}

	input,
	textarea,
	select {
		width: 100%;
		box-sizing: border-box;
		font: inherit;
		padding: 0.64rem 0.74rem;
		border-radius: 0.68rem;
		border: 1px solid rgba(15, 23, 42, 0.15);
		background: #fff;
	}

	textarea {
		resize: vertical;
	}

	.check-row {
		display: inline-flex;
		align-items: center;
		gap: 0.45rem;
		font-size: 0.78rem;
		color: #475569;
	}

	.check-row input {
		width: auto;
		padding: 0;
	}

	.content-list {
		display: grid;
		gap: 0.42rem;
		max-height: 620px;
		overflow: auto;
	}

	.content-btn {
		text-align: left;
		border: 1px solid rgba(15, 23, 42, 0.1);
		border-radius: 0.74rem;
		padding: 0.62rem;
		background: #fff;
		display: flex;
		justify-content: space-between;
		gap: 0.45rem;
		cursor: pointer;
	}

	.content-btn.active {
		background: rgba(248, 250, 252, 0.98);
		box-shadow: inset 0 0 0 1px rgba(37, 99, 235, 0.22);
	}

	.content-btn strong {
		display: block;
		font-size: 0.84rem;
	}

	.content-title {
		margin: 0.18rem 0 0;
		font-size: 0.8rem;
		color: #334155;
	}

	.content-meta {
		display: grid;
		justify-items: end;
		gap: 0.16rem;
	}

	.muted,
	.meta {
		margin: 0.12rem 0 0;
		font-size: 0.74rem;
		color: #64748b;
	}

	.badge {
		display: inline-block;
		padding: 0.1rem 0.44rem;
		border-radius: 999px;
		font-size: 0.64rem;
		font-weight: 700;
	}

	.priority--low {
		background: rgba(100, 116, 139, 0.14);
		color: #475569;
	}

	.priority--normal {
		background: rgba(37, 99, 235, 0.14);
		color: #1d4ed8;
	}

	.priority--high {
		background: rgba(217, 119, 6, 0.14);
		color: #b45309;
	}

	.priority--urgent {
		background: rgba(220, 38, 38, 0.14);
		color: #b91c1c;
	}

	.chip {
		display: inline-block;
		padding: 0.1rem 0.44rem;
		border-radius: 999px;
		font-size: 0.66rem;
		font-weight: 700;
		background: rgba(15, 23, 42, 0.08);
		color: #334155;
	}

	.chip-due {
		background: rgba(220, 38, 38, 0.12);
		color: #b91c1c;
	}

	.source-head h3 {
		margin: 0.2rem 0;
	}

	.head-actions {
		margin-top: 0.5rem;
	}

	.platform-switcher {
		display: flex;
		flex-wrap: wrap;
		gap: 0.42rem;
		margin: 0.7rem 0;
	}

	.platform-btn {
		border: 1px solid rgba(15, 23, 42, 0.14);
		background: #fff;
		border-radius: 999px;
		padding: 0.34rem 0.6rem;
		font-size: 0.75rem;
		display: inline-flex;
		align-items: center;
		gap: 0.32rem;
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

	.dot.due {
		background: #dc2626;
	}

	.action-row {
		display: flex;
		gap: 0.48rem;
		flex-wrap: wrap;
	}

	.primary,
	.ghost,
	.danger {
		border-radius: 0.68rem;
		font-weight: 700;
		padding: 0.56rem 0.8rem;
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

	.ghost.small {
		font-size: 0.76rem;
		padding: 0.4rem 0.6rem;
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

	.full {
		width: 100%;
	}

	.metrics-grid {
		display: grid;
		grid-template-columns: repeat(4, minmax(0, 1fr));
		gap: 0.45rem;
	}

	.video-list {
		display: grid;
		gap: 0.45rem;
		max-height: 520px;
		overflow: auto;
	}

	.video-row {
		display: grid;
		grid-template-columns: 96px 1fr auto;
		gap: 0.5rem;
		align-items: center;
		border: 1px solid rgba(15, 23, 42, 0.1);
		border-radius: 0.7rem;
		padding: 0.38rem;
		background: #fff;
		text-decoration: none;
		color: inherit;
	}

	.video-row img,
	.video-thumb-empty {
		width: 96px;
		height: 54px;
		border-radius: 0.5rem;
		border: 1px solid rgba(15, 23, 42, 0.1);
		object-fit: cover;
	}

	.video-thumb-empty {
		display: grid;
		place-items: center;
		font-size: 0.65rem;
		color: #64748b;
		background: rgba(148, 163, 184, 0.15);
	}

	.video-main {
		min-width: 0;
	}

	.video-title {
		margin: 0;
		font-size: 0.78rem;
		font-weight: 700;
		color: #334155;
		display: -webkit-box;
		line-clamp: 2;
		-webkit-line-clamp: 2;
		-webkit-box-orient: vertical;
		overflow: hidden;
	}

	.video-meta {
		margin: 0.18rem 0 0;
		font-size: 0.7rem;
		color: #64748b;
	}

	.video-duration {
		font-size: 0.68rem;
		font-weight: 700;
		padding: 0.14rem 0.44rem;
		border-radius: 999px;
		background: rgba(15, 23, 42, 0.1);
		color: #334155;
	}

	.metric-item {
		padding: 0.48rem;
		border-radius: 0.68rem;
		background: rgba(15, 23, 42, 0.04);
		border: 1px solid rgba(15, 23, 42, 0.08);
	}

	.metric-item input {
		margin-top: 0.2rem;
	}

	.trend-grid {
		display: grid;
		grid-template-columns: repeat(3, minmax(0, 1fr));
		gap: 0.45rem;
	}

	.trend-item {
		border: 1px solid rgba(15, 23, 42, 0.08);
		border-radius: 0.7rem;
		padding: 0.56rem;
		background: #fff;
	}

	.trend-item p {
		margin: 0;
		font-size: 0.72rem;
		color: #64748b;
	}

	.trend-item strong {
		display: block;
		margin-top: 0.16rem;
		font-size: 1rem;
	}

	.trend-item small {
		font-size: 0.7rem;
		color: #2563eb;
	}

	.table-wrap {
		overflow-x: auto;
	}

	.history-table {
		width: 100%;
		min-width: 720px;
		border-collapse: collapse;
		font-size: 0.8rem;
	}

	.history-table th,
	.history-table td {
		padding: 0.42rem 0.36rem;
		border-bottom: 1px solid rgba(15, 23, 42, 0.08);
		text-align: left;
	}

	.history-table th {
		font-size: 0.7rem;
		text-transform: uppercase;
		color: #64748b;
	}

	.queue-list {
		display: grid;
		gap: 0.45rem;
	}

	.queue-item {
		display: flex;
		justify-content: space-between;
		gap: 0.5rem;
		padding: 0.58rem;
		border-radius: 0.72rem;
		border: 1px solid rgba(15, 23, 42, 0.09);
		background: #fff;
	}

	.queue-meta {
		display: grid;
		justify-items: end;
		gap: 0.2rem;
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

	.empty {
		margin: 0;
		color: #64748b;
		font-size: 0.86rem;
	}

	@media (max-width: 1220px) {
		.summary-grid {
			grid-template-columns: repeat(3, minmax(0, 1fr));
		}
		.monitor-layout {
			grid-template-columns: 1fr;
		}
	}

	@media (max-width: 860px) {
		.summary-grid {
			grid-template-columns: repeat(2, minmax(0, 1fr));
		}
		.row.two-col,
		.metrics-grid,
		.trend-grid {
			grid-template-columns: 1fr;
		}
		.action-row {
			display: grid;
			grid-template-columns: 1fr;
		}
		.video-row {
			grid-template-columns: 1fr;
		}
		.video-row img,
		.video-thumb-empty {
			width: 100%;
			height: auto;
			aspect-ratio: 16 / 9;
		}
		.video-duration {
			justify-self: start;
		}
	}

	@media (max-width: 560px) {
		.summary-grid {
			grid-template-columns: 1fr;
		}
		.queue-item {
			grid-template-columns: 1fr;
			display: grid;
		}
		.queue-meta {
			justify-items: start;
		}
	}
</style>
