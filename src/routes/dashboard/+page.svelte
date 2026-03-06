<script lang="ts">
	import { onMount } from 'svelte';
	import { hasSupabaseConfig, supabase } from '$lib/supabase';
	import type {
		ProductionCalendarRow,
		ProducedVideoRow,
		SupportedPlatform,
		MonitoringContentRow,
		MonitoringContentPlatformRow,
		MonitoringMetricSnapshotRow,
		MonitoringChannelVideoRow
	} from '$lib/types';
	import { formatCount, getMetricSource, platformLabel } from '$lib/media-plan';

	// ── Contract constants ────────────────────────────────────────────────────
	const PHASE1_START = '2026-02-01';
	const PHASE1_END   = '2026-04-30';
	const PHASE2_START = '2026-05-01';
	const PHASE2_END   = '2026-07-31';
	const PHASE3_START = '2026-08-01';
	const PHASE3_END   = '2026-11-30';

	const SHORT_FORM_TARGET   = 30;
	const LONGFORM_MIN        = 3;
	const LONGFORM_MAX        = 5;
	const REVISION_MAX        = 2;

	const PLATFORMS: SupportedPlatform[] = ['youtube', 'facebook', 'instagram', 'tiktok'];

	// ── State ────────────────────────────────────────────────────────────────
	let calendarItems = $state<ProductionCalendarRow[]>([]);
	let producedVideos = $state<ProducedVideoRow[]>([]);
	let loading = $state(false);
	let errorMessage = $state('');

	// ── Monitoring state (Zone B) ────────────────────────────────────────────
	let ownContents = $state<MonitoringContentRow[]>([]);
	let ownPlatforms = $state<MonitoringContentPlatformRow[]>([]);
	let ownSnapshots = $state<MonitoringMetricSnapshotRow[]>([]);
	let ownChannelVideos = $state<MonitoringChannelVideoRow[]>([]);
	let syncingAll = $state(false);
	let lastSyncedAt = $state<string | null>(null);
	let syncMessage = $state('');

	// ── Date helpers ─────────────────────────────────────────────────────────
	const todayIso = new Date().toISOString().slice(0, 10);

	function currentPhase(): 1 | 2 | 3 | null {
		if (todayIso >= PHASE1_START && todayIso <= PHASE1_END) return 1;
		if (todayIso >= PHASE2_START && todayIso <= PHASE2_END) return 2;
		if (todayIso >= PHASE3_START && todayIso <= PHASE3_END) return 3;
		return null;
	}

	function phaseProgress(start: string, end: string): number {
		const s = new Date(start).getTime();
		const e = new Date(end).getTime();
		const now = new Date(todayIso).getTime();
		if (now <= s) return 0;
		if (now >= e) return 100;
		return Math.round(((now - s) / (e - s)) * 100);
	}

	function daysBetween(a: string, b: string): number {
		return Math.round((new Date(b).getTime() - new Date(a).getTime()) / 86400000);
	}

	function monthKey(isoDate: string): string {
		return isoDate.slice(0, 7);
	}

	function monthLabel(key: string): string {
		const [year, month] = key.split('-').map(Number);
		return new Date(year, month - 1, 1).toLocaleDateString('th-TH', { month: 'long', year: 'numeric' });
	}

	function weekKey(isoDate: string): string {
		const d = new Date(isoDate);
		const jan1 = new Date(d.getFullYear(), 0, 1);
		const week = Math.ceil(((d.getTime() - jan1.getTime()) / 86400000 + jan1.getDay() + 1) / 7);
		return `${d.getFullYear()}-W${String(week).padStart(2, '0')}`;
	}

	function inPhase1(isoDate: string): boolean {
		return isoDate >= PHASE1_START && isoDate <= PHASE1_END;
	}

	// ── Zone A: Process KPIs ─────────────────────────────────────────────────

	const phase1Progress = $derived(phaseProgress(PHASE1_START, PHASE1_END));
	const phase1DaysLeft = $derived(Math.max(0, daysBetween(todayIso, PHASE1_END)));
	const phase1DaysTotal = $derived(daysBetween(PHASE1_START, PHASE1_END));

	// KPI 1 — Short-form output
	const shortFormByPlatformMonth = $derived.by(() => {
		const result: Record<SupportedPlatform, Record<string, number>> = {
			youtube: {}, facebook: {}, instagram: {}, tiktok: {}
		};
		for (const v of producedVideos) {
			const dateStr = v.published_at ? v.published_at.slice(0, 10) : v.created_at.slice(0, 10);
			if (!inPhase1(dateStr)) continue;
			const mk = monthKey(dateStr);
			result[v.platform][mk] = (result[v.platform][mk] ?? 0) + 1;
		}
		return result;
	});

	const phase1Months = $derived(['2026-02', '2026-03', '2026-04']);

	// KPI 2 — YouTube Long-form
	const ytByWeek = $derived.by(() => {
		const result: Record<string, number> = {};
		for (const v of producedVideos) {
			if (v.platform !== 'youtube') continue;
			const dateStr = v.published_at ? v.published_at.slice(0, 10) : v.created_at.slice(0, 10);
			if (!inPhase1(dateStr)) continue;
			const wk = weekKey(dateStr);
			result[wk] = (result[wk] ?? 0) + 1;
		}
		return result;
	});

	const ytWeekStats = $derived.by(() => {
		const weeks = Object.keys(ytByWeek).sort();
		if (weeks.length === 0) return { pass: 0, fail: 0, total: 0 };
		let pass = 0, fail = 0;
		for (const wk of weeks) {
			const count = ytByWeek[wk];
			if (count >= LONGFORM_MIN && count <= LONGFORM_MAX) pass++;
			else fail++;
		}
		return { pass, fail, total: weeks.length };
	});

	// KPI 3 — Revision
	const phase1Calendar = $derived(
		calendarItems.filter(item => item.shoot_date >= PHASE1_START && item.shoot_date <= PHASE1_END)
	);

	const revisionStats = $derived.by(() => {
		if (phase1Calendar.length === 0) return { avg: 0, overLimit: 0, total: 0 };
		const total = phase1Calendar.length;
		const sum = phase1Calendar.reduce((acc, item) => acc + (item.revision_count ?? 0), 0);
		const overLimit = phase1Calendar.filter(item => (item.revision_count ?? 0) > REVISION_MAX).length;
		return { avg: sum / total, overLimit, total };
	});

	// KPI 4 — Approval
	const approvalStats = $derived.by(() => {
		const total = phase1Calendar.length;
		if (total === 0) return { approved: 0, pending: 0, rejected: 0, draft: 0, total: 0 };
		const approved  = phase1Calendar.filter(i => i.approval_status === 'approved').length;
		const pending   = phase1Calendar.filter(i => i.approval_status === 'pending_review').length;
		const rejected  = phase1Calendar.filter(i => i.approval_status === 'rejected').length;
		const draft     = phase1Calendar.filter(i => i.approval_status === 'draft').length;
		return { approved, pending, rejected, draft, total };
	});

	// KPI 5 — Engagement from produced_videos (legacy)
	const engagementByPlatformMonth = $derived.by(() => {
		const result: Record<SupportedPlatform, Record<string, { views: number; count: number }>> = {
			youtube: {}, facebook: {}, instagram: {}, tiktok: {}
		};
		for (const v of producedVideos) {
			const dateStr = v.published_at ? v.published_at.slice(0, 10) : v.created_at.slice(0, 10);
			if (!inPhase1(dateStr)) continue;
			const mk = monthKey(dateStr);
			if (!result[v.platform][mk]) result[v.platform][mk] = { views: 0, count: 0 };
			result[v.platform][mk].views += v.view_count ?? 0;
			result[v.platform][mk].count++;
		}
		return result;
	});

	const totalProducedPhase1 = $derived(
		producedVideos.filter(v => {
			const d = v.published_at ? v.published_at.slice(0, 10) : v.created_at.slice(0, 10);
			return inPhase1(d);
		}).length
	);

	// ── Zone B: Performance KPIs (from monitoring) ───────────────────────────

	const ownPlatformsByType = $derived.by(() => {
		const map: Record<SupportedPlatform, MonitoringContentPlatformRow[]> = {
			youtube: [], facebook: [], instagram: [], tiktok: []
		};
		for (const p of ownPlatforms) map[p.platform].push(p);
		return map;
	});

	const latestSnapshotByPlatformId = $derived.by(() => {
		const map = new Map<string, MonitoringMetricSnapshotRow>();
		for (const s of ownSnapshots) {
			if (!map.has(s.platform_id)) map.set(s.platform_id, s);
		}
		return map;
	});

	const snapshot30dAgoByPlatformId = $derived.by(() => {
		const map = new Map<string, MonitoringMetricSnapshotRow>();
		const target = new Date();
		target.setDate(target.getDate() - 30);
		const targetIso = target.toISOString().slice(0, 10);

		for (const s of ownSnapshots) {
			if (s.snapshot_date > targetIso) continue;
			const existing = map.get(s.platform_id);
			if (!existing || s.snapshot_date > existing.snapshot_date) {
				map.set(s.platform_id, s);
			}
		}
		return map;
	});

	type PlatformMetric = { current: number; previous: number; growthPct: number | null };

	function aggregateMetric(field: 'followers_count' | 'view_count'): Record<SupportedPlatform, PlatformMetric> {
		const result = {} as Record<SupportedPlatform, PlatformMetric>;
		for (const platform of PLATFORMS) {
			let totalCurrent = 0, totalPrevious = 0, hasData = false;
			for (const p of ownPlatformsByType[platform]) {
				const latest = latestSnapshotByPlatformId.get(p.id);
				const prev = snapshot30dAgoByPlatformId.get(p.id);
				const lv = latest?.[field] ?? null;
				const pv = prev?.[field] ?? null;
				if (lv !== null) { totalCurrent += lv; hasData = true; }
				if (pv !== null) totalPrevious += pv;
			}
			result[platform] = {
				current: totalCurrent,
				previous: totalPrevious,
				growthPct: hasData && totalPrevious > 0 ? ((totalCurrent - totalPrevious) / totalPrevious) * 100 : null
			};
		}
		return result;
	}

	const followersByPlatform = $derived.by(() => aggregateMetric('followers_count'));
	const viewsByPlatform = $derived.by(() => aggregateMetric('view_count'));

	const engagementByPlatform = $derived.by(() => {
		const result: Record<SupportedPlatform, { likes: number; comments: number; shares: number; saves: number }> = {
			youtube: { likes: 0, comments: 0, shares: 0, saves: 0 },
			facebook: { likes: 0, comments: 0, shares: 0, saves: 0 },
			instagram: { likes: 0, comments: 0, shares: 0, saves: 0 },
			tiktok: { likes: 0, comments: 0, shares: 0, saves: 0 }
		};
		for (const platform of PLATFORMS) {
			for (const p of ownPlatformsByType[platform]) {
				const latest = latestSnapshotByPlatformId.get(p.id);
				if (!latest) continue;
				result[platform].likes += latest.like_count ?? 0;
				result[platform].comments += latest.comment_count ?? 0;
				result[platform].shares += latest.share_count ?? 0;
				result[platform].saves += latest.save_count ?? 0;
			}
		}
		return result;
	});

	const hasOwnData = $derived(ownContents.length > 0);

	// ── Data loading ─────────────────────────────────────────────────────────
	async function load() {
		if (!supabase) return;
		loading = true;

		const [calRes, vidRes, monRes] = await Promise.all([
			supabase
				.from('production_calendar')
				.select('id, backlog_id, shoot_date, status, revision_count, approval_status, submitted_at, created_at')
				.gte('shoot_date', PHASE1_START)
				.lte('shoot_date', PHASE1_END),
			supabase
				.from('produced_videos')
				.select('id, calendar_id, platform, published_at, view_count, like_count, comment_count, created_at'),
			supabase
				.from('monitoring_content')
				.select('*')
				.eq('is_own', true)
		]);

		if (calRes.error) { loading = false; errorMessage = calRes.error.message; return; }
		if (vidRes.error) { loading = false; errorMessage = vidRes.error.message; return; }

		calendarItems = (calRes.data ?? []) as ProductionCalendarRow[];
		producedVideos = (vidRes.data ?? []) as ProducedVideoRow[];
		ownContents = (monRes.data ?? []) as MonitoringContentRow[];

		// Load monitoring platforms + snapshots + videos for own channels
		const ownIds = ownContents.map(c => c.id);
		if (ownIds.length > 0) {
			const [platRes, snapRes] = await Promise.all([
				supabase.from('monitoring_content_platform').select('*').in('content_id', ownIds),
				supabase.from('monitoring_metric_snapshots').select('*').in('content_id', ownIds).order('snapshot_date', { ascending: false })
			]);
			ownPlatforms = (platRes.data ?? []) as MonitoringContentPlatformRow[];
			ownSnapshots = (snapRes.data ?? []) as MonitoringMetricSnapshotRow[];

			const ytChannelIds = ownPlatforms.filter(p => p.platform === 'youtube' && p.is_channel).map(p => p.id);
			if (ytChannelIds.length > 0) {
				const cvRes = await supabase
					.from('monitoring_channel_videos')
					.select('*')
					.in('platform_id', ytChannelIds)
					.order('view_count', { ascending: false, nullsFirst: false })
					.limit(10);
				ownChannelVideos = (cvRes.data ?? []) as MonitoringChannelVideoRow[];
			}
		}

		loading = false;
	}

	async function syncAll() {
		syncingAll = true;
		syncMessage = '';
		try {
			const resp = await fetch('/api/openclaw/monitoring/sync-all', { method: 'POST' });
			const body = await resp.json();
			if (!resp.ok) {
				syncMessage = `Sync ไม่สำเร็จ: ${body.error ?? 'unknown'}`;
				return;
			}
			lastSyncedAt = body.synced_at ?? new Date().toISOString();
			syncMessage = `Synced ${body.succeeded}/${body.total} channels`;
			// Reload monitoring data
			await load();
		} catch (err) {
			syncMessage = err instanceof Error ? err.message : 'Sync ไม่สำเร็จ';
		} finally {
			syncingAll = false;
		}
	}

	onMount(load);

	// ── UI helpers ────────────────────────────────────────────────────────────
	function pct(val: number, total: number): number {
		if (total === 0) return 0;
		return Math.min(100, Math.round((val / total) * 100));
	}

	function passColor(pass: boolean) {
		return pass ? '#16a34a' : '#dc2626';
	}

	function kpiStatus(pass: boolean): string {
		return pass ? 'pass' : 'fail';
	}

	function sourceBadgeClass(platform: SupportedPlatform, metric: 'followers' | 'views' | 'likes' | 'comments' | 'shares' | 'saves'): string {
		return getMetricSource(platform, metric);
	}

	function sourceBadgeLabel(platform: SupportedPlatform, metric: 'followers' | 'views' | 'likes' | 'comments' | 'shares' | 'saves'): string {
		return getMetricSource(platform, metric) === 'auto' ? 'Auto' : 'Manual';
	}
</script>

<main class="page">
	<section class="hero">
		<p class="kicker">KPI Tracker</p>
		<h1>Dashboard Phase 1</h1>
		<p>ก.พ. – เม.ย. 2569 · ติดตาม KPI ตามสัญญาจ้าง</p>
	</section>

	{#if !hasSupabaseConfig}
		<p class="alert">ตั้งค่า env ก่อนใช้งาน: <code>PUBLIC_SUPABASE_URL</code> และ <code>PUBLIC_SUPABASE_ANON_KEY</code></p>
	{/if}

	{#if errorMessage}
		<p class="alert">{errorMessage}</p>
	{/if}

	{#if loading}
		<p class="loading">กำลังโหลด...</p>
	{:else}

	<!-- Phase Progress -->
	<section class="panel phase-header">
		<div class="phase-info">
			<div>
				<p class="kicker small">สัญญา Phase 1 · 90 วัน</p>
				<h2>1 ก.พ. – 30 เม.ย. 2569</h2>
				<p class="phase-sub">เหลือ <strong>{phase1DaysLeft}</strong> วัน จากทั้งหมด {phase1DaysTotal} วัน</p>
			</div>
			<div class="phase-summary">
				<div class="summary-chip">
					<span class="summary-num">{totalProducedPhase1}</span>
					<span class="summary-label">คลิปทั้งหมด</span>
				</div>
				<div class="summary-chip">
					<span class="summary-num">{approvalStats.approved}</span>
					<span class="summary-label">อนุมัติแล้ว</span>
				</div>
				<div class="summary-chip {revisionStats.overLimit > 0 ? 'chip--warn' : ''}">
					<span class="summary-num">{revisionStats.overLimit}</span>
					<span class="summary-label">เกินเกณฑ์ Rev</span>
				</div>
			</div>
		</div>
		<div class="progress-wrap">
			<div class="progress-bar">
				<div class="progress-fill" style="width:{phase1Progress}%"></div>
			</div>
			<span class="progress-label">{phase1Progress}%</span>
		</div>
	</section>

	<!-- ════════════════════════════════════════════════════════════════════════ -->
	<!-- Zone A — Process KPIs                                                  -->
	<!-- ════════════════════════════════════════════════════════════════════════ -->
	<h2 class="zone-title">Zone A · Process KPIs</h2>
	<div class="kpi-grid">

		<!-- KPI 1: Content Output per platform -->
		<section class="panel kpi-card span-2">
			<p class="kicker small">KPI 1 · Content Output</p>
			<h3>คลิปสั้น ≥{SHORT_FORM_TARGET} ชิ้น/เดือน/แพลตฟอร์ม</h3>
			<div class="platform-kpi-grid">
				{#each PLATFORMS as platform}
					{@const monthData = shortFormByPlatformMonth[platform]}
					<div class="platform-kpi">
						<p class="platform-name">{platformLabel[platform]}</p>
						{#each phase1Months as mk}
							{@const count = monthData[mk] ?? 0}
							{@const pass = count >= SHORT_FORM_TARGET}
							<div class="month-row">
								<span class="month-label">{monthLabel(mk)}</span>
								<div class="mini-bar-wrap">
									<div class="mini-bar">
										<div class="mini-bar-fill" style="width:{pct(count, SHORT_FORM_TARGET)}%;background:{passColor(pass)}"></div>
									</div>
									<span class="mini-count {kpiStatus(pass)}">{count}/{SHORT_FORM_TARGET}</span>
								</div>
							</div>
						{/each}
					</div>
				{/each}
			</div>
		</section>

		<!-- KPI 2: YouTube Long-form -->
		<section class="panel kpi-card">
			<p class="kicker small">KPI 2 · YouTube Long-form</p>
			<h3>{LONGFORM_MIN}–{LONGFORM_MAX} คลิป/สัปดาห์</h3>
			{#if ytWeekStats.total === 0}
				<p class="empty-state">ยังไม่มีข้อมูล YouTube ใน Phase 1</p>
			{:else}
				<div class="week-stats">
					<div class="week-stat">
						<span class="stat-num pass">{ytWeekStats.pass}</span>
						<span class="stat-label">สัปดาห์ผ่าน</span>
					</div>
					<div class="week-stat">
						<span class="stat-num {ytWeekStats.fail > 0 ? 'fail' : 'pass'}">{ytWeekStats.fail}</span>
						<span class="stat-label">สัปดาห์ไม่ผ่าน</span>
					</div>
					<div class="week-stat">
						<span class="stat-num">{ytWeekStats.total}</span>
						<span class="stat-label">สัปดาห์ทั้งหมด</span>
					</div>
				</div>
				<div class="week-list">
					{#each Object.entries(ytByWeek).sort() as [wk, count]}
						{@const pass = count >= LONGFORM_MIN && count <= LONGFORM_MAX}
						<div class="week-row">
							<span class="week-label">{wk}</span>
							<span class="kpi-badge {kpiStatus(pass)}">{count} คลิป</span>
						</div>
					{/each}
				</div>
			{/if}
		</section>

		<!-- KPI 3: Revision Count -->
		<section class="panel kpi-card">
			<p class="kicker small">KPI 6 · Quality</p>
			<h3>Revision ≤{REVISION_MAX} ครั้ง/ชิ้น</h3>
			{#if revisionStats.total === 0}
				<p class="empty-state">ยังไม่มีรายการใน Phase 1</p>
			{:else}
				{@const pass = revisionStats.overLimit === 0}
				<div class="big-stat">
					<span class="big-num {kpiStatus(pass)}">{revisionStats.avg.toFixed(1)}</span>
					<span class="big-label">เฉลี่ย revision/ชิ้น</span>
				</div>
				<div class="stat-row">
					<span>เกินเกณฑ์ (&gt;{REVISION_MAX} ครั้ง)</span>
					<span class="kpi-badge {revisionStats.overLimit > 0 ? 'fail' : 'pass'}">{revisionStats.overLimit} ชิ้น</span>
				</div>
				<div class="stat-row">
					<span>รายการทั้งหมด</span>
					<span>{revisionStats.total} ชิ้น</span>
				</div>
			{/if}
		</section>

		<!-- KPI 4: Approval Rate -->
		<section class="panel kpi-card">
			<p class="kicker small">KPI 3 · Content Calendar</p>
			<h3>Approval Rate 100%</h3>
			{#if approvalStats.total === 0}
				<p class="empty-state">ยังไม่มีรายการใน Phase 1</p>
			{:else}
				{@const approvalRate = pct(approvalStats.approved, approvalStats.total)}
				{@const pass = approvalRate === 100}
				<div class="big-stat">
					<span class="big-num {kpiStatus(pass)}">{approvalRate}%</span>
					<span class="big-label">อนุมัติแล้ว</span>
				</div>
				<div class="approval-breakdown">
					<div class="approval-row">
						<span class="dot" style="background:#16a34a"></span>
						<span>อนุมัติแล้ว</span>
						<strong>{approvalStats.approved}</strong>
					</div>
					<div class="approval-row">
						<span class="dot" style="background:#ea580c"></span>
						<span>รออนุมัติ</span>
						<strong>{approvalStats.pending}</strong>
					</div>
					<div class="approval-row">
						<span class="dot" style="background:#dc2626"></span>
						<span>Rejected</span>
						<strong>{approvalStats.rejected}</strong>
					</div>
					<div class="approval-row">
						<span class="dot" style="background:#94a3b8"></span>
						<span>Draft</span>
						<strong>{approvalStats.draft}</strong>
					</div>
				</div>
			{/if}
		</section>

		<!-- KPI 5: Engagement Growth MoM (legacy from produced_videos) -->
		<section class="panel kpi-card span-2">
			<p class="kicker small">KPI 7 · Engagement Growth (produced_videos)</p>
			<h3>Views เพิ่มขึ้น MoM ทุกแพลตฟอร์ม</h3>
			<div class="platform-kpi-grid">
				{#each PLATFORMS as platform}
					{@const monthData = engagementByPlatformMonth[platform]}
					<div class="platform-kpi">
						<p class="platform-name">{platformLabel[platform]}</p>
						{#each phase1Months as mk, idx}
							{@const curr = monthData[mk]?.views ?? 0}
							{@const prev = idx > 0 ? (monthData[phase1Months[idx - 1]]?.views ?? 0) : null}
							{@const growth = prev !== null && prev > 0 ? ((curr - prev) / prev) * 100 : null}
							<div class="month-row">
								<span class="month-label">{monthLabel(mk)}</span>
								<div class="month-meta">
									<span class="view-count">{curr.toLocaleString()} views</span>
									{#if growth !== null}
										<span class="growth-badge {growth >= 0 ? 'pass' : 'fail'}">
											{growth >= 0 ? '+' : ''}{growth.toFixed(0)}%
										</span>
									{/if}
								</div>
							</div>
						{/each}
					</div>
				{/each}
			</div>
		</section>

	</div>

	<!-- ════════════════════════════════════════════════════════════════════════ -->
	<!-- Zone B — Performance KPIs (from Monitoring)                            -->
	<!-- ════════════════════════════════════════════════════════════════════════ -->
	<div class="zone-header">
		<h2 class="zone-title">Zone B · Performance KPIs <span class="zone-sub">(from Monitoring)</span></h2>
		<div class="zone-actions">
			{#if lastSyncedAt}
				<span class="sync-ts">อัปเดตล่าสุด {new Date(lastSyncedAt).toLocaleTimeString('th-TH', { hour: '2-digit', minute: '2-digit' })}</span>
			{/if}
			{#if syncMessage}
				<span class="sync-msg">{syncMessage}</span>
			{/if}
			<button class="sync-all-btn" onclick={syncAll} disabled={syncingAll || !hasOwnData}>
				{syncingAll ? '⏳ Syncing...' : '⚡ Refresh All'}
			</button>
		</div>
	</div>

	{#if !hasOwnData}
		<section class="panel">
			<p class="empty-state">ยังไม่มี channel ของเรา — ไปที่หน้า <a href="/monitoring">Content Monitoring</a> แล้วสร้าง content และ check "Channel ของเรา"</p>
		</section>
	{:else}

	<div class="kpi-grid">

		<!-- B1: Followers per Platform -->
		<section class="panel kpi-card span-2">
			<p class="kicker small">Followers</p>
			<h3>ผู้ติดตามแยกแพลตฟอร์ม <span class="source-badge manual">Manual</span></h3>
			<div class="platform-kpi-grid">
				{#each PLATFORMS as platform}
					{@const data = followersByPlatform[platform]}
					<div class="platform-kpi perf-card">
						<p class="platform-name">{platformLabel[platform]}</p>
						<span class="perf-num">{formatCount(data.current)}</span>
						{#if data.growthPct !== null}
							<span class="growth-badge {data.growthPct >= 0 ? 'pass' : 'fail'}">
								{data.growthPct >= 0 ? '+' : ''}{data.growthPct.toFixed(1)}%
							</span>
						{:else if data.current === 0}
							<span class="growth-badge na">ยังไม่มีข้อมูล</span>
						{/if}
						<span class="perf-label">vs 30 วันก่อน</span>
					</div>
				{/each}
			</div>
		</section>

		<!-- B2: Views per Platform -->
		<section class="panel kpi-card span-2">
			<p class="kicker small">Views</p>
			<h3>ยอดวิวรวมแยกแพลตฟอร์ม</h3>
			<div class="platform-kpi-grid">
				{#each PLATFORMS as platform}
					{@const data = viewsByPlatform[platform]}
					<div class="platform-kpi perf-card">
						<p class="platform-name">{platformLabel[platform]} <span class="source-badge {sourceBadgeClass(platform, 'views')}">{sourceBadgeLabel(platform, 'views')}</span></p>
						<span class="perf-num">{formatCount(data.current)}</span>
						{#if data.growthPct !== null}
							<span class="growth-badge {data.growthPct >= 0 ? 'pass' : 'fail'}">
								{data.growthPct >= 0 ? '+' : ''}{data.growthPct.toFixed(1)}%
							</span>
						{:else if data.current === 0}
							<span class="growth-badge na">ยังไม่มีข้อมูล</span>
						{/if}
						<span class="perf-label">vs 30 วันก่อน</span>
					</div>
				{/each}
			</div>
		</section>

		<!-- B3: Top 10 Videos -->
		<section class="panel kpi-card span-2">
			<p class="kicker small">Top Videos</p>
			<h3>วิดีโอยอดวิวสูงสุด <span class="source-badge auto">Auto</span></h3>
			{#if ownChannelVideos.length === 0}
				<p class="empty-state">ยังไม่มีข้อมูลวิดีโอ — sync จากหน้า <a href="/monitoring">Content Monitoring</a></p>
			{:else}
				<div class="top-videos-list">
					{#each ownChannelVideos.slice(0, 10) as video, idx}
						<div class="video-row">
							<span class="rank">#{idx + 1}</span>
							{#if video.thumbnail_url}
								<img src={video.thumbnail_url} alt="" class="video-thumb" />
							{:else}
								<div class="video-thumb-placeholder"></div>
							{/if}
							<div class="video-info">
								<a href={video.video_url} target="_blank" rel="noopener" class="video-title-link">{video.title}</a>
								<div class="video-meta">
									<span>{formatCount(video.view_count)} views</span>
									{#if video.published_label}
										<span class="meta-sep">·</span>
										<span>{video.published_label}</span>
									{/if}
									{#if video.duration_label}
										<span class="meta-sep">·</span>
										<span>{video.duration_label}</span>
									{/if}
								</div>
							</div>
						</div>
					{/each}
				</div>
			{/if}
		</section>

		<!-- B4: Engagement Summary -->
		<section class="panel kpi-card span-2">
			<p class="kicker small">Engagement</p>
			<h3>Engagement รวมแยกแพลตฟอร์ม (latest snapshot)</h3>
			<div class="table-scroll">
				<table class="engagement-table">
					<thead>
						<tr>
							<th>Platform</th>
							<th>Likes</th>
							<th>Comments</th>
							<th>Shares</th>
							<th>Saves</th>
						</tr>
					</thead>
					<tbody>
						{#each PLATFORMS as platform}
							{@const e = engagementByPlatform[platform]}
							<tr>
								<td class="platform-cell">{platformLabel[platform]}</td>
								<td>
									{formatCount(e.likes || null)}
									<span class="source-badge {sourceBadgeClass(platform, 'likes')}">{sourceBadgeLabel(platform, 'likes')}</span>
								</td>
								<td>
									{formatCount(e.comments || null)}
									<span class="source-badge {sourceBadgeClass(platform, 'comments')}">{sourceBadgeLabel(platform, 'comments')}</span>
								</td>
								<td>
									{formatCount(e.shares || null)}
									<span class="source-badge {sourceBadgeClass(platform, 'shares')}">{sourceBadgeLabel(platform, 'shares')}</span>
								</td>
								<td>
									{formatCount(e.saves || null)}
									<span class="source-badge {sourceBadgeClass(platform, 'saves')}">{sourceBadgeLabel(platform, 'saves')}</span>
								</td>
							</tr>
						{/each}
					</tbody>
				</table>
			</div>
		</section>

	</div>
	{/if}

	<!-- Contract KPI Checklist -->
	<section class="panel">
		<p class="kicker small">สรุป KPI Phase 1 ทั้งหมด</p>
		<h3>ตัวชี้วัดตามสัญญาจ้าง</h3>
		<table class="kpi-checklist">
			<thead>
				<tr>
					<th>#</th>
					<th>KPI</th>
					<th>เกณฑ์</th>
					<th>สถานะ</th>
				</tr>
			</thead>
			<tbody>
				<tr>
					<td>1</td>
					<td>Content Output (คลิปสั้น)</td>
					<td>≥30 ชิ้น/เดือน/platform</td>
					<td><span class="kpi-badge na">ดูตาราง KPI 1</span></td>
				</tr>
				<tr>
					<td>2</td>
					<td>YouTube Long-form</td>
					<td>3–5 คลิป/สัปดาห์</td>
					<td>
						{#if ytWeekStats.total === 0}
							<span class="kpi-badge na">ยังไม่มีข้อมูล</span>
						{:else}
							<span class="kpi-badge {kpiStatus(ytWeekStats.fail === 0)}">{ytWeekStats.pass}/{ytWeekStats.total} สัปดาห์ผ่าน</span>
						{/if}
					</td>
				</tr>
				<tr>
					<td>3</td>
					<td>Content Calendar ส่งอนุมัติตรงเวลา</td>
					<td>100%</td>
					<td>
						{#if approvalStats.total === 0}
							<span class="kpi-badge na">ยังไม่มีข้อมูล</span>
						{:else}
							<span class="kpi-badge {kpiStatus(pct(approvalStats.approved, approvalStats.total) === 100)}">{pct(approvalStats.approved, approvalStats.total)}%</span>
						{/if}
					</td>
				</tr>
				<tr>
					<td>4</td>
					<td>Onboarding Founding Members</td>
					<td>≥80% สำเร็จ</td>
					<td><span class="kpi-badge na">ยังไม่ได้ track</span></td>
				</tr>
				<tr>
					<td>5</td>
					<td>Quantity & Punctuality</td>
					<td>100%</td>
					<td><span class="kpi-badge na">ดู Kanban</span></td>
				</tr>
				<tr>
					<td>6</td>
					<td>Quality & Revision</td>
					<td>≤2 ครั้ง/ชิ้น</td>
					<td>
						{#if revisionStats.total === 0}
							<span class="kpi-badge na">ยังไม่มีข้อมูล</span>
						{:else}
							<span class="kpi-badge {kpiStatus(revisionStats.overLimit === 0)}">avg {revisionStats.avg.toFixed(1)} · เกิน {revisionStats.overLimit} ชิ้น</span>
						{/if}
					</td>
				</tr>
				<tr>
					<td>7</td>
					<td>Engagement Growth MoM</td>
					<td>เพิ่มขึ้นทุกเดือน</td>
					<td>
						{#if hasOwnData}
							{@const ytGrowth = viewsByPlatform.youtube.growthPct}
							{#if ytGrowth !== null}
								<span class="kpi-badge {kpiStatus(ytGrowth >= 0)}">{ytGrowth >= 0 ? '+' : ''}{ytGrowth.toFixed(1)}% (YT)</span>
							{:else}
								<span class="kpi-badge na">ข้อมูลยังไม่พอ</span>
							{/if}
						{:else}
							<span class="kpi-badge na">ดู Zone B</span>
						{/if}
					</td>
				</tr>
				<tr>
					<td>8</td>
					<td>Platform Optimization Log</td>
					<td>ครบทุกแพลตฟอร์ม</td>
					<td><span class="kpi-badge na">ยังไม่ได้ track</span></td>
				</tr>
				<tr>
					<td>9</td>
					<td>Digital Marketing & Media Plan</td>
					<td>ส่งภายใน 28 ก.พ. 2569</td>
					<td><span class="kpi-badge pass">ส่งแล้ว</span></td>
				</tr>
			</tbody>
		</table>
	</section>

	{/if}
</main>

<style>
	.page { display: grid; gap: 1rem; }

	h1, h2, h3 { font-family: 'Space Grotesk', 'Noto Sans Thai', sans-serif; }

	.hero { text-align: center; padding: 1.2rem 0 0.2rem; }
	.hero h1 { margin: 0.4rem 0; font-size: clamp(1.8rem, 4.4vw, 2.7rem); }
	.hero p { margin: 0; color: #475569; }

	.kicker {
		margin: 0; font-size: 0.78rem; text-transform: uppercase;
		letter-spacing: 0.16em; color: #b45309; font-weight: 700;
	}
	.kicker.small { color: #2563eb; font-size: 0.68rem; }

	.panel {
		padding: 1.1rem 1.2rem;
		border-radius: 1rem;
		border: 1px solid rgba(15,23,42,0.08);
		background: rgba(255,255,255,0.9);
	}

	.panel h3 { margin: 0.25rem 0 0.9rem; font-size: 1rem; }

	.alert {
		padding: 0.8rem 0.95rem; border-radius: 0.8rem; font-size: 0.9rem;
		background: rgba(220,38,38,0.1); color: #991b1b; border: 1px solid rgba(220,38,38,0.2);
	}

	.loading { text-align: center; color: #64748b; padding: 2rem; }
	.empty-state { color: #94a3b8; font-size: 0.88rem; margin: 0.5rem 0; }
	.empty-state a { color: #2563eb; text-decoration: underline; }

	/* Zone title */
	.zone-header { display: flex; align-items: center; justify-content: space-between; flex-wrap: wrap; gap: 0.5rem; margin: 1.2rem 0 0.3rem; }
	.zone-title { margin: 0; font-size: 1.1rem; color: #334155; }
	.zone-sub { font-size: 0.78rem; font-weight: 400; color: #94a3b8; }
	.zone-actions { display: flex; align-items: center; gap: 0.6rem; flex-wrap: wrap; }
	.sync-ts { font-size: 0.72rem; color: #94a3b8; }
	.sync-msg { font-size: 0.72rem; color: #16a34a; font-weight: 600; }
	.sync-all-btn {
		padding: 0.35rem 0.85rem; border-radius: 0.5rem; font-size: 0.8rem;
		font-weight: 700; background: #1d4ed8; color: #fff; border: none;
		cursor: pointer; transition: background 0.15s;
	}
	.sync-all-btn:hover:not(:disabled) { background: #1e40af; }
	.sync-all-btn:disabled { opacity: 0.5; cursor: not-allowed; }

	/* Phase header */
	.phase-header { display: grid; gap: 0.9rem; }
	.phase-info { display: flex; justify-content: space-between; align-items: flex-start; flex-wrap: wrap; gap: 0.8rem; }
	.phase-info h2 { margin: 0.2rem 0; font-size: 1.2rem; }
	.phase-sub { margin: 0; font-size: 0.88rem; color: #475569; }
	.phase-summary { display: flex; gap: 0.6rem; flex-wrap: wrap; }
	.summary-chip {
		background: rgba(15,23,42,0.04); border: 1px solid rgba(15,23,42,0.08);
		border-radius: 0.7rem; padding: 0.5rem 0.85rem; text-align: center; min-width: 72px;
	}
	.summary-chip.chip--warn { background: rgba(220,38,38,0.08); border-color: rgba(220,38,38,0.2); }
	.summary-num { display: block; font-size: 1.4rem; font-weight: 700; font-family: 'Space Grotesk', sans-serif; line-height: 1; }
	.summary-label { font-size: 0.68rem; color: #64748b; }

	.progress-wrap { display: flex; align-items: center; gap: 0.6rem; }
	.progress-bar { flex: 1; height: 8px; background: rgba(15,23,42,0.1); border-radius: 999px; overflow: hidden; }
	.progress-fill { height: 100%; background: #2563eb; border-radius: 999px; transition: width 0.4s; }
	.progress-label { font-size: 0.78rem; font-weight: 700; color: #2563eb; width: 3rem; text-align: right; }

	/* KPI grid */
	.kpi-grid {
		display: grid;
		grid-template-columns: repeat(2, 1fr);
		gap: 0.9rem;
	}
	.span-2 { grid-column: span 2; }

	.kpi-card { display: grid; align-content: start; gap: 0; }

	/* Platform KPI */
	.platform-kpi-grid { display: grid; grid-template-columns: repeat(4, 1fr); gap: 0.8rem; margin-top: 0.2rem; }
	.platform-kpi { display: grid; gap: 0.4rem; }
	.platform-name { margin: 0 0 0.2rem; font-size: 0.78rem; font-weight: 700; color: #475569; }

	.month-row { display: grid; gap: 0.2rem; }
	.month-label { font-size: 0.7rem; color: #94a3b8; }
	.mini-bar-wrap { display: flex; align-items: center; gap: 0.4rem; }
	.mini-bar { flex: 1; height: 5px; background: rgba(15,23,42,0.08); border-radius: 999px; overflow: hidden; }
	.mini-bar-fill { height: 100%; border-radius: 999px; transition: width 0.3s; }
	.mini-count { font-size: 0.7rem; font-weight: 700; white-space: nowrap; }

	.month-meta { display: flex; align-items: center; gap: 0.4rem; flex-wrap: wrap; }
	.view-count { font-size: 0.72rem; color: #475569; }
	.growth-badge { font-size: 0.68rem; font-weight: 700; padding: 0.08rem 0.36rem; border-radius: 999px; }

	/* Week stats */
	.week-stats { display: flex; gap: 1rem; margin-bottom: 0.8rem; }
	.week-stat { text-align: center; }
	.stat-num { display: block; font-size: 1.6rem; font-weight: 700; font-family: 'Space Grotesk', sans-serif; line-height: 1; }
	.stat-label { font-size: 0.7rem; color: #64748b; }
	.week-list { display: grid; gap: 0.3rem; }
	.week-row { display: flex; justify-content: space-between; align-items: center; font-size: 0.82rem; }
	.week-label { color: #64748b; }

	/* Big stat */
	.big-stat { text-align: center; padding: 0.5rem 0 0.7rem; }
	.big-num { display: block; font-size: 2.5rem; font-weight: 700; font-family: 'Space Grotesk', sans-serif; line-height: 1; }
	.big-label { font-size: 0.78rem; color: #64748b; }

	/* Stat row */
	.stat-row { display: flex; justify-content: space-between; align-items: center; font-size: 0.84rem; padding: 0.25rem 0; border-bottom: 1px solid rgba(15,23,42,0.06); }
	.stat-row:last-child { border-bottom: none; }

	/* Approval breakdown */
	.approval-breakdown { display: grid; gap: 0.35rem; margin-top: 0.5rem; }
	.approval-row { display: flex; align-items: center; gap: 0.5rem; font-size: 0.84rem; }
	.approval-row strong { margin-left: auto; }
	.dot { width: 0.55rem; height: 0.55rem; border-radius: 50%; flex-shrink: 0; }

	/* KPI badge */
	.kpi-badge {
		display: inline-block; padding: 0.14rem 0.55rem; border-radius: 999px;
		font-size: 0.72rem; font-weight: 700;
	}
	.kpi-badge.pass { background: rgba(22,163,74,0.12); color: #166534; }
	.kpi-badge.fail { background: rgba(220,38,38,0.12); color: #b91c1c; }
	.kpi-badge.na   { background: rgba(100,116,139,0.12); color: #475569; }
	.growth-badge.pass { background: rgba(22,163,74,0.12); color: #166534; }
	.growth-badge.fail { background: rgba(220,38,38,0.12); color: #b91c1c; }
	.growth-badge.na   { background: rgba(100,116,139,0.08); color: #94a3b8; font-weight: 400; font-size: 0.64rem; }
	.mini-count.pass { color: #166534; }
	.mini-count.fail { color: #b91c1c; }
	.stat-num.pass { color: #16a34a; }
	.stat-num.fail { color: #dc2626; }
	.big-num.pass { color: #16a34a; }
	.big-num.fail { color: #dc2626; }

	/* Source badges */
	.source-badge {
		font-size: 0.58rem; font-weight: 700; padding: 0.06rem 0.3rem;
		border-radius: 999px; vertical-align: middle; margin-left: 0.2rem;
	}
	.source-badge.auto { background: rgba(37,99,235,0.12); color: #1d4ed8; }
	.source-badge.manual { background: rgba(234,88,12,0.12); color: #c2410c; }

	/* Zone B — Performance cards */
	.perf-card {
		text-align: center;
		padding: 0.6rem 0.4rem;
		border: 1px solid rgba(15,23,42,0.06);
		border-radius: 0.7rem;
		background: rgba(15,23,42,0.02);
	}
	.perf-num {
		display: block; font-size: 1.8rem; font-weight: 700;
		font-family: 'Space Grotesk', sans-serif; line-height: 1; margin: 0.3rem 0 0.2rem;
	}
	.perf-label { font-size: 0.64rem; color: #94a3b8; }

	/* Top videos */
	.top-videos-list { display: grid; gap: 0.5rem; }
	.video-row {
		display: grid; grid-template-columns: 2rem 96px 1fr;
		gap: 0.6rem; align-items: center;
		padding: 0.3rem 0; border-bottom: 1px solid rgba(15,23,42,0.05);
	}
	.video-row:last-child { border-bottom: none; }
	.rank { font-size: 0.84rem; font-weight: 700; color: #94a3b8; text-align: center; }
	.video-thumb { width: 96px; height: 54px; object-fit: cover; border-radius: 0.4rem; }
	.video-thumb-placeholder { width: 96px; height: 54px; background: rgba(15,23,42,0.06); border-radius: 0.4rem; }
	.video-info { min-width: 0; }
	.video-title-link {
		display: block; font-size: 0.82rem; font-weight: 600; color: #0f172a;
		text-decoration: none; overflow: hidden; text-overflow: ellipsis; white-space: nowrap;
	}
	.video-title-link:hover { color: #2563eb; text-decoration: underline; }
	.video-meta { font-size: 0.7rem; color: #64748b; display: flex; gap: 0.3rem; flex-wrap: wrap; }
	.meta-sep { color: #cbd5e1; }

	/* Engagement table */
	.table-scroll { overflow-x: auto; }
	.engagement-table { width: 100%; border-collapse: collapse; font-size: 0.82rem; }
	.engagement-table th, .engagement-table td {
		padding: 0.5rem 0.6rem; text-align: left;
		border-bottom: 1px solid rgba(15,23,42,0.07);
	}
	.engagement-table th { font-size: 0.7rem; color: #64748b; text-transform: uppercase; font-weight: 600; }
	.platform-cell { font-weight: 700; color: #334155; }

	/* Checklist table */
	.kpi-checklist { width: 100%; border-collapse: collapse; font-size: 0.84rem; margin-top: 0.5rem; }
	.kpi-checklist th, .kpi-checklist td { border-bottom: 1px solid rgba(15,23,42,0.07); padding: 0.5rem 0.4rem; text-align: left; }
	.kpi-checklist th { font-size: 0.72rem; color: #64748b; text-transform: uppercase; }
	.kpi-checklist td:first-child { color: #94a3b8; font-size: 0.78rem; width: 2rem; }

	@media (max-width: 900px) {
		.kpi-grid { grid-template-columns: 1fr; }
		.span-2 { grid-column: span 1; }
		.platform-kpi-grid { grid-template-columns: repeat(2, 1fr); }
		.video-row { grid-template-columns: 2rem 64px 1fr; }
		.video-thumb { width: 64px; height: 36px; }
		.video-thumb-placeholder { width: 64px; height: 36px; }
	}

	@media (max-width: 600px) {
		.platform-kpi-grid { grid-template-columns: 1fr; }
		.phase-info { flex-direction: column; }
		.video-row { grid-template-columns: 2rem 1fr; }
		.video-thumb, .video-thumb-placeholder { display: none; }

		.table-scroll {
			overflow: visible;
		}

		.engagement-table,
		.kpi-checklist,
		.engagement-table thead,
		.kpi-checklist thead,
		.engagement-table tbody,
		.kpi-checklist tbody,
		.engagement-table tr,
		.kpi-checklist tr,
		.engagement-table td,
		.kpi-checklist td {
			display: block;
			width: 100%;
			box-sizing: border-box;
		}

		.engagement-table thead,
		.kpi-checklist thead {
			display: none;
		}

		.engagement-table tr,
		.kpi-checklist tr {
			margin-bottom: 0.75rem;
			padding: 0.75rem;
			border: 1px solid rgba(15,23,42,0.08);
			border-radius: 0.9rem;
			background: rgba(255,255,255,0.92);
		}

		.engagement-table td,
		.kpi-checklist td {
			border: none;
			padding: 0.22rem 0;
		}

		.engagement-table td::before,
		.kpi-checklist td::before {
			display: block;
			margin-bottom: 0.12rem;
			font-size: 0.68rem;
			font-weight: 700;
			text-transform: uppercase;
			letter-spacing: 0.05em;
			color: #94a3b8;
		}

		.engagement-table td:nth-child(1)::before { content: 'Platform'; }
		.engagement-table td:nth-child(2)::before { content: 'Likes'; }
		.engagement-table td:nth-child(3)::before { content: 'Comments'; }
		.engagement-table td:nth-child(4)::before { content: 'Shares'; }
		.engagement-table td:nth-child(5)::before { content: 'Saves'; }

		.kpi-checklist td:nth-child(1)::before { content: '#'; }
		.kpi-checklist td:nth-child(2)::before { content: 'KPI'; }
		.kpi-checklist td:nth-child(3)::before { content: 'เกณฑ์'; }
		.kpi-checklist td:nth-child(4)::before { content: 'สถานะ'; }

		.kpi-checklist td:first-child {
			width: 100%;
		}
	}
</style>
