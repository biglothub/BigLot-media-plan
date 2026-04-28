<script lang="ts">
	import { onMount } from "svelte";
	import { goto } from '$app/navigation';
	import { hasSupabaseConfig, supabase } from "$lib/supabase";
	import { Button, Spinner, PageHeader, Badge, toast } from '$lib';
	import type { IdeaBacklogRow, ProductionCalendarRow, ProductionStage } from "$lib/types";
	import {
		addMonthsIso,
		buildMonthCells,
		formatCalendarDate,
		formatCalendarDayMeta,
		formatCalendarDayNumber,
		formatCount,
		formatMonthLabel,
		getInstagramEmbedUrl,
		getMonthStartIso,
		getTikTokEmbedUrl,
		platformLabel,
		PRODUCTION_STAGES,
		stageLabel,
	} from "$lib/media-plan";

	let ideas = $state<IdeaBacklogRow[]>([]);
	let calendarItems = $state<ProductionCalendarRow[]>([]);
	let loadingIdeas = $state(false);
	let loadingCalendar = $state(false);
	let isTouchUi = $state(false);
	let currentMonthStart = $state(getMonthStartIso(new Date()));
	let mobileScheduleDate = $state(getMonthStartIso(new Date()));
	let dragHoverDate = $state<string | null>(null);
	let draggingBacklogId = $state<string | null>(null);
	let ideaSearch = $state("");

	const monthLabel = $derived.by(() => formatMonthLabel(currentMonthStart));
	const monthCells = $derived.by(() => buildMonthCells(currentMonthStart));
	const scheduledBacklogIds = $derived.by(
		() => new Set(calendarItems.map((item) => item.backlog_id)),
	);
	const unscheduledIdeas = $derived.by(() =>
		ideas.filter((idea) => !scheduledBacklogIds.has(idea.id)),
	);
	const filteredUnscheduledIdeas = $derived.by(() => {
		const q = ideaSearch.trim().toLowerCase();
		if (!q) return unscheduledIdeas;
		return unscheduledIdeas.filter((idea) => {
			const code = backlogCode(idea).toLowerCase();
			const title = (idea.title ?? "").toLowerCase();
			return code.includes(q) || title.includes(q);
		});
	});
	const calendarByDate = $derived.by(() => {
		const grouped = new Map<string, ProductionCalendarRow[]>();
		for (const item of calendarItems) {
			const bucket = grouped.get(item.shoot_date) ?? [];
			bucket.push(item);
			grouped.set(item.shoot_date, bucket);
		}
		return grouped;
	});
	const mobileAgendaGroups = $derived.by(() => {
		const monthEnd = addMonthsIso(currentMonthStart, 1);
		const grouped = new Map<string, ProductionCalendarRow[]>();
		for (const item of calendarItems) {
			if (item.shoot_date < currentMonthStart || item.shoot_date >= monthEnd) continue;
			const bucket = grouped.get(item.shoot_date) ?? [];
			bucket.push(item);
			grouped.set(item.shoot_date, bucket);
		}

		return Array.from(grouped.entries())
			.sort(([a], [b]) => a.localeCompare(b))
			.map(([dateIso, items]) => ({
				dateIso,
				label: formatCalendarDate(dateIso),
				items: items.sort((a, b) => a.created_at.localeCompare(b.created_at)),
			}));
	});

	function backlogCode(
		idea: Pick<IdeaBacklogRow, "id" | "idea_code">,
	): string {
		const code = idea.idea_code?.trim();
		return code ? code : `BL-${idea.id.slice(0, 8).toUpperCase()}`;
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

	async function loadCalendar() {
		if (!supabase) return;
		loadingCalendar = true;

		const { data, error } = await supabase
			.from("production_calendar")
			.select(
				"id, backlog_id, carousel_project_id, handoff_source, shoot_date, publish_deadline, status, revision_count, approval_status, submitted_at, notes, created_at, idea_backlog(*), calendar_assignments(*)",
			)
			.order("shoot_date", { ascending: true })
			.order("created_at", { ascending: true });

		loadingCalendar = false;
		if (error) {
			toast.error(`โหลด calendar ไม่ได้: ${error.message}`);
			return;
		}

		const normalized = (data ?? []).map((item) => {
			const row = item as Record<string, unknown>;
			const linkedIdea = row.idea_backlog;
			const assignments = row.calendar_assignments;
			return {
				...row,
				idea_backlog: Array.isArray(linkedIdea)
					? (linkedIdea[0] ?? null)
					: (linkedIdea ?? null),
				calendar_assignments: Array.isArray(assignments) ? assignments : [],
			};
		});

		calendarItems = normalized as ProductionCalendarRow[];
	}

	function shiftMonth(months: number) {
		const nextMonthStart = addMonthsIso(currentMonthStart, months);
		currentMonthStart = nextMonthStart;
		if (mobileScheduleDate < nextMonthStart || mobileScheduleDate >= addMonthsIso(nextMonthStart, 1)) {
			mobileScheduleDate = nextMonthStart;
		}
	}

	function handleDragStart(event: DragEvent, backlogId: string) {
		draggingBacklogId = backlogId;
		event.dataTransfer?.setData("text/plain", backlogId);
		if (event.dataTransfer) {
			event.dataTransfer.effectAllowed = "move";
		}
	}

	function handleDragOver(event: DragEvent, dateIso: string) {
		event.preventDefault();
		dragHoverDate = dateIso;
		if (event.dataTransfer) {
			event.dataTransfer.dropEffect = "move";
		}
	}

	async function scheduleIdeaOnDate(backlogId: string, dateIso: string) {
		if (!supabase) return;

		const { error } = await supabase.from("production_calendar").upsert(
			{
				backlog_id: backlogId,
				shoot_date: dateIso,
				status: "planned",
			},
			{ onConflict: "backlog_id" },
		);

		if (error) {
			toast.error(`วางแผนใน calendar ไม่สำเร็จ: ${error.message}`);
			return;
		}

		toast.success("อัปเดตตารางถ่ายทำแล้ว");
		await loadCalendar();
	}

	async function handleDropOnDate(event: DragEvent, dateIso: string) {
		event.preventDefault();
		const backlogId =
			event.dataTransfer?.getData("text/plain") || draggingBacklogId;
		draggingBacklogId = null;
		dragHoverDate = null;
		if (!backlogId) return;
		await scheduleIdeaOnDate(backlogId, dateIso);
	}

	async function unscheduleIdea(backlogId: string) {
		if (!supabase) return;

		const { data, error } = await supabase
			.from("production_calendar")
			.delete()
			.eq("backlog_id", backlogId)
			.select("id");

		if (error) {
			toast.error(`ลบออกจาก calendar ไม่สำเร็จ: ${error.message}`);
			return;
		}

		if (!data || data.length === 0) {
			toast.error(`ลบออกจาก calendar ไม่สำเร็จ: ระบบไม่ได้รับอนุญาตให้ลบรายการนี้ (RLS policy blocked)`);
			await loadCalendar();
			return;
		}

		toast.success("นำออกจาก calendar แล้ว");
		await loadCalendar();
	}

	function openDetail(item: ProductionCalendarRow) {
		void goto(`/?edit=${item.backlog_id}`, { keepFocus: true, noScroll: false });
	}

	function getCarouselStudioHref(item: ProductionCalendarRow): string | null {
		return item.carousel_project_id ? `/carousel/${item.carousel_project_id}` : null;
	}

	async function updateStatus(calendarId: string, newStatus: ProductionStage) {
		if (!supabase) return;
		const { error } = await supabase
			.from("production_calendar")
			.update({ status: newStatus })
			.eq("id", calendarId);

		if (error) {
			toast.error(`อัปเดตสถานะไม่สำเร็จ: ${error.message}`);
			return;
		}
		await loadCalendar();
	}

	onMount(() => {
		const touchQuery = window.matchMedia('(max-width: 940px), (pointer: coarse)');
		const syncTouchUi = () => {
			isTouchUi = touchQuery.matches;
		};
		syncTouchUi();
		touchQuery.addEventListener('change', syncTouchUi);
		void Promise.all([loadIdeas(), loadCalendar()]);
		return () => {
			touchQuery.removeEventListener('change', syncTouchUi);
		};
	});
</script>

<main class="page">
	<PageHeader
		eyebrow="Planning"
		title="Shoot Calendar"
		subtitle={isTouchUi
			? 'จัดตารางถ่ายทำแบบ agenda และเลือกวันถ่ายจาก action บนการ์ด'
			: 'ลากไอเดียที่ยังไม่ schedule มาวางลงวันที่เพื่อวางแผนถ่ายทำรายเดือน'}
	/>

	{#if !hasSupabaseConfig}
		<p class="alert">
			ตั้งค่า env ก่อนใช้งาน: <code>PUBLIC_SUPABASE_URL</code> และ
			<code>PUBLIC_SUPABASE_ANON_KEY</code>
		</p>
	{/if}

	<section class="panel">
		<div class="list-head">
			<h2>Monthly Plan</h2>
			<div class="calendar-controls">
				<Button variant="ghost" size="sm" onclick={() => shiftMonth(-1)}>&larr; Prev</Button>
				<span>{monthLabel}</span>
				<Button variant="ghost" size="sm" onclick={() => shiftMonth(1)}>Next &rarr;</Button>
			</div>
		</div>

		{#if isTouchUi}
			<div class="mobile-calendar">
				<section class="mobile-panel">
					<div class="bank-head">
						<h3>Quick Schedule</h3>
						<span>{unscheduledIdeas.length}</span>
					</div>
					<div class="mobile-schedule-bar">
						<label for="mobile-schedule-date">Shoot date</label>
						<input id="mobile-schedule-date" type="date" bind:value={mobileScheduleDate} />
					</div>
					<input
						class="idea-search"
						type="text"
						placeholder="ค้นหาด้วยรหัสหรือชื่อ..."
						bind:value={ideaSearch}
					/>
					{#if loadingIdeas}
						<div class="loading-center"><Spinner size="sm" /></div>
					{:else if unscheduledIdeas.length === 0}
						<p class="empty">ยังไม่มีไอเดียค้างวางแผน</p>
					{:else if filteredUnscheduledIdeas.length === 0}
						<p class="empty">ไม่พบไอเดียที่ค้นหา</p>
					{:else}
						<div class="mobile-idea-list">
							{#each filteredUnscheduledIdeas as idea}
								<article class={`idea-card idea-card--mobile ${platformFrameClass(idea.platform)}`}>
									<div class="idea-mobile-head">
										<span class="platform">{platformLabel[idea.platform]}</span>
										<strong>{backlogCode(idea)}</strong>
									</div>
									<p>{idea.title ?? "Untitled idea"}</p>
									<p>Views: {formatCount(idea.view_count)}</p>
									<Button variant="ghost" size="sm" onclick={() => scheduleIdeaOnDate(idea.id, mobileScheduleDate)}>
										Schedule on {formatCalendarDate(mobileScheduleDate)}
									</Button>
								</article>
							{/each}
						</div>
					{/if}
				</section>

				<section class="mobile-panel">
					<div class="bank-head">
						<h3>Agenda</h3>
						<span>{mobileAgendaGroups.length}</span>
					</div>
					{#if loadingCalendar}
						<div class="loading-center"><Spinner size="sm" /></div>
					{:else if mobileAgendaGroups.length === 0}
						<p class="empty">ยังไม่มีรายการในเดือนนี้</p>
					{:else}
						<div class="agenda-list">
							{#each mobileAgendaGroups as group}
								<section class="agenda-group">
									<div class="agenda-date">{group.label}</div>
									<div class="agenda-items">
										{#each group.items as item}
											<article class={`calendar-item agenda-item stage--${item.status || 'planned'} ${platformFrameClass(item.idea_backlog?.platform)}`}>
												<div class="calendar-item-head">
													<span class="platform">{item.idea_backlog?.platform?.toUpperCase() ?? "IDEA"}</span>
													<strong class="calendar-code">{item.idea_backlog ? backlogCode(item.idea_backlog) : "Unknown code"}</strong>
												</div>
												<p class="calendar-title">{item.idea_backlog?.title ?? "Untitled idea"}</p>
												<div class="calendar-item-meta">
													{#if item.carousel_project_id}
														<span class="meta-chip carousel-chip">Carousel Studio</span>
													{/if}
													{#if item.publish_deadline}
														<span class={`meta-chip deadline-chip ${item.publish_deadline < new Date().toISOString().slice(0, 10) && item.status !== 'published' ? "overdue" : ""}`}>
															Deadline {formatCalendarDayMeta(item.publish_deadline)}
														</span>
													{/if}
													{#if (item.calendar_assignments ?? []).length > 0}
														<span class="meta-chip member-chip">ทีม {(item.calendar_assignments ?? []).length} คน</span>
													{/if}
												</div>
												<select
													class="stage-select stage-select--{item.status || 'planned'}"
													value={item.status || 'planned'}
													onchange={(e) => {
														const target = e.target as HTMLSelectElement;
														void updateStatus(item.id, target.value as ProductionStage);
													}}
												>
													{#each PRODUCTION_STAGES as stage}
														<option value={stage}>{stageLabel[stage]}</option>
													{/each}
												</select>
												<div class="calendar-item-actions">
													<button class="tiny-detail" onclick={() => openDetail(item)}>Detail</button>
													{#if getCarouselStudioHref(item)}
														<a class="tiny-link" href={getCarouselStudioHref(item) ?? '#'}>Carousel</a>
													{/if}
													<button class="tiny-danger" onclick={() => unscheduleIdea(item.backlog_id)}>Unschedule</button>
												</div>
											</article>
										{/each}
									</div>
								</section>
							{/each}
						</div>
					{/if}
				</section>
			</div>
		{:else}
			<div class="calendar-layout">
				<aside class="idea-bank">
					<div class="bank-head">
						<h3>Unscheduled Ideas</h3>
						<span>{unscheduledIdeas.length}</span>
					</div>
					<input
						class="idea-search"
						type="text"
						placeholder="ค้นหาด้วยรหัสหรือชื่อ..."
						bind:value={ideaSearch}
					/>
					{#if loadingIdeas}
						<div class="loading-center"><Spinner size="sm" /></div>
					{:else if unscheduledIdeas.length === 0}
						<p class="empty">ยังไม่มีไอเดียค้างวางแผน</p>
					{:else if filteredUnscheduledIdeas.length === 0}
						<p class="empty">ไม่พบไอเดียที่ค้นหา</p>
					{:else}
						<div class="idea-list">
							{#each filteredUnscheduledIdeas as idea}
								{@const tiktokEmbed = idea.platform === 'tiktok' && idea.url ? getTikTokEmbedUrl(idea.url) : null}
								{@const igEmbed = idea.platform === 'instagram' && idea.url ? getInstagramEmbedUrl(idea.url) : null}
								<article
									class={`idea-card ${platformFrameClass(idea.platform)}`}
									draggable="true"
									ondragstart={(event) =>
										handleDragStart(event, idea.id)}
									ondragend={() => {
										draggingBacklogId = null;
										dragHoverDate = null;
									}}
								>
									{#if tiktokEmbed}
										<iframe
											class="idea-preview tiktok-preview"
											src={tiktokEmbed}
											title="TikTok Preview"
											loading="lazy"
											allow="encrypted-media"
										></iframe>
									{:else if igEmbed}
										<iframe
											class="idea-preview ig-preview"
											src={igEmbed}
											title="Instagram Preview"
											loading="lazy"
											allow="encrypted-media"
										></iframe>
									{:else if idea.thumbnail_url}
										<img
											class="idea-preview"
											src={idea.thumbnail_url}
											alt={idea.title ?? 'thumbnail'}
										/>
									{/if}
									<span class="platform"
										>{platformLabel[idea.platform]}</span
									>
									<h4>{backlogCode(idea)}</h4>
									<p>{idea.title ?? "Untitled idea"}</p>
									<p>Views: {formatCount(idea.view_count)}</p>
								</article>
							{/each}
						</div>
					{/if}
				</aside>

				<div class="calendar-shell">
					{#if loadingCalendar}
						<div class="loading-center"><Spinner size="sm" /></div>
					{:else}
						<div class="calendar-weekdays">
							<span>Mon</span>
							<span>Tue</span>
							<span>Wed</span>
							<span>Thu</span>
							<span>Fri</span>
							<span>Sat</span>
							<span>Sun</span>
						</div>
						<div class="calendar-grid">
							{#each monthCells as cell}
								<div
									class={`calendar-day ${cell.inCurrentMonth ? "" : "outside-month"} ${dragHoverDate === cell.dateIso ? "drop-hover" : ""}`}
									role="region"
									aria-label={`Shoot day ${cell.dateIso}`}
									ondragover={(event) =>
										handleDragOver(event, cell.dateIso)}
									ondragleave={() => (dragHoverDate = null)}
									ondrop={(event) =>
										handleDropOnDate(event, cell.dateIso)}
								>
									<div class="calendar-day-head">
										<strong>{formatCalendarDayNumber(cell.dateIso)}</strong>
										<small>{formatCalendarDayMeta(cell.dateIso)}</small>
									</div>

									{#if (calendarByDate.get(cell.dateIso) ?? []).length === 0}
										<p class="drop-hint">Drop idea here</p>
									{/if}

									{#each calendarByDate.get(cell.dateIso) ?? [] as item}
										<article
											class={`calendar-item stage--${item.status || 'planned'} ${platformFrameClass(item.idea_backlog?.platform)}`}
											draggable="true"
											ondragstart={(event) =>
												handleDragStart(
													event,
													item.backlog_id,
												)}
										>
											<div class="calendar-item-head">
												<span class="platform">{item.idea_backlog?.platform?.toUpperCase() ?? "IDEA"}</span>
												<strong class="calendar-code">{item.idea_backlog ? backlogCode(item.idea_backlog) : "Unknown code"}</strong>
											</div>
											<a
												class="calendar-link"
												href={item.idea_backlog?.url ?? "#"}
												target="_blank"
												rel="noopener noreferrer"
												onclick={(event) => {
													if (!item.idea_backlog?.url?.trim()) {
														event.preventDefault();
														toast.error("ไม่พบลิงก์คลิปของไอเดียนี้");
													}
												}}
											>
												<p class="calendar-title">{item.idea_backlog?.title ?? "Untitled idea"}</p>
											</a>
											<div class="calendar-item-meta">
												{#if item.carousel_project_id}
													<span class="meta-chip carousel-chip">Carousel Studio</span>
												{/if}
												{#if item.publish_deadline}
													<span class={`meta-chip deadline-chip ${item.publish_deadline < new Date().toISOString().slice(0, 10) && item.status !== 'published' ? "overdue" : ""}`}>
														Deadline {formatCalendarDayMeta(item.publish_deadline)}
													</span>
												{/if}
												{#if (item.calendar_assignments ?? []).length > 0}
													<span class="meta-chip member-chip">
														ทีม {(item.calendar_assignments ?? []).length} คน
													</span>
												{/if}
											</div>
											<select
												class="stage-select stage-select--{item.status || 'planned'}"
												value={item.status || 'planned'}
												onclick={(e) => e.stopPropagation()}
												onchange={(e) => {
													e.stopPropagation();
													const target = e.target as HTMLSelectElement;
													void updateStatus(item.id, target.value as ProductionStage);
												}}
											>
												{#each PRODUCTION_STAGES as stage}
													<option value={stage}>{stageLabel[stage]}</option>
												{/each}
											</select>
											{#if (item.calendar_assignments ?? []).length > 0}
												<div class="assignment-badges">
													{#each item.calendar_assignments ?? [] as a}
														<span class="badge-member">{a.member_name}</span>
													{/each}
												</div>
											{/if}
											<div class="calendar-item-actions">
												<button
													class="tiny-detail"
													onclick={(event) => {
														event.stopPropagation();
														openDetail(item);
													}}
												>
													Detail
												</button>
												{#if getCarouselStudioHref(item)}
													<a
														class="tiny-link"
														href={getCarouselStudioHref(item) ?? '#'}
														onclick={(event) => event.stopPropagation()}
													>
														Carousel
													</a>
												{/if}
												<button
													class="tiny-danger"
													onclick={(event) => {
														event.stopPropagation();
														void unscheduleIdea(item.backlog_id);
													}}
												>
													Unschedule
												</button>
											</div>
										</article>
									{/each}
								</div>
							{/each}
						</div>
					{/if}
				</div>
			</div>
		{/if}
	</section>
</main>

<style>
	.loading-center {
		display: flex;
		justify-content: center;
		padding: var(--space-4);
	}

	.page {
		display: grid;
		gap: 1rem;
	}

	h2,
	h3,
	h4 {
		font-family: var(--font-heading);
	}

	.panel {
		padding: 1rem;
		border-radius: var(--radius-xl);
		border: 1px solid var(--color-border);
		background: var(--color-bg-elevated);
	}

	.list-head {
		display: flex;
		justify-content: space-between;
		align-items: center;
		gap: 0.8rem;
		margin-bottom: 0.85rem;
		flex-wrap: wrap;
	}

	.list-head h2 {
		margin: 0;
	}

	.calendar-controls {
		display: flex;
		align-items: center;
		gap: 0.5rem;
	}

	.calendar-layout {
		display: grid;
		grid-template-columns: 300px 1fr;
		gap: 0.8rem;
		align-items: start;
	}

	.mobile-calendar {
		display: grid;
		gap: 0.85rem;
	}

	.mobile-panel {
		border: 1px solid var(--color-border);
		border-radius: var(--radius-lg);
		background: var(--color-bg-elevated);
		padding: 0.8rem;
	}

	.mobile-schedule-bar {
		display: grid;
		gap: 0.35rem;
		margin-bottom: 0.65rem;
	}

	.mobile-schedule-bar label {
		font-size: 0.76rem;
		font-weight: 700;
		color: var(--color-slate-600);
	}

	.mobile-idea-list,
	.agenda-list,
	.agenda-items {
		display: grid;
		gap: 0.55rem;
	}

	.agenda-group {
		display: grid;
		gap: 0.5rem;
	}

	.agenda-date {
		position: sticky;
		top: 0;
		z-index: 1;
		background: var(--color-bg-elevated);
		padding: 0.2rem 0;
		font-size: 0.78rem;
		font-weight: 700;
		color: var(--color-primary);
	}

	.idea-card--mobile {
		cursor: default;
	}

	.idea-mobile-head {
		display: flex;
		align-items: center;
		justify-content: space-between;
		gap: 0.5rem;
	}

	.mobile-action-btn {
		width: 100%;
		margin-top: 0.2rem;
	}

	.agenda-item {
		cursor: default;
	}

	.idea-bank,
	.calendar-shell {
		border: 1px solid var(--color-border);
		border-radius: var(--radius-lg);
		background: var(--color-bg-elevated);
	}

	.idea-bank {
		padding: 0.75rem;
		position: sticky;
		top: 1rem;
		max-height: calc(100vh - 2rem);
		display: flex;
		flex-direction: column;
		overflow: hidden;
	}

	.bank-head {
		display: flex;
		justify-content: space-between;
		align-items: center;
		margin-bottom: 0.65rem;
	}

	.bank-head h3 {
		margin: 0;
		font-size: 1rem;
	}

	.bank-head span {
		padding: 0.1rem 0.55rem;
		border-radius: var(--radius-full);
		font-size: 0.75rem;
		font-weight: 700;
		background: var(--color-bg-subtle);
		color: var(--color-slate-700);
		border: 1px solid var(--color-border);
	}

	.idea-list {
		display: grid;
		gap: 0.5rem;
		flex: 1;
		overflow-y: auto;
	}

	.idea-card {
		--platform-frame-color: var(--color-border);
		border: 1px solid var(--color-border);
		border-top: 3px solid var(--platform-frame-color);
		padding: 0.55rem;
		border-radius: 0.7rem;
		cursor: grab;
		display: grid;
		gap: 0.25rem;
	}

	.idea-search {
		width: 100%;
		box-sizing: border-box;
		font: inherit;
		padding: 0.5rem 0.7rem;
		border-radius: 0.6rem;
		border: 1px solid var(--color-border-strong);
		background: var(--color-bg-elevated);
		font-size: 0.82rem;
		margin-bottom: 0.6rem;
	}

	.idea-search:focus {
		outline: none;
		border-color: rgba(15, 23, 42, 0.34);
		box-shadow: 0 0 0 2px rgba(15, 23, 42, 0.08);
	}

	.idea-preview {
		width: 100%;
		aspect-ratio: 16 / 9;
		object-fit: cover;
		border-radius: 0.55rem;
		border: 1px solid var(--color-border);
		pointer-events: none;
	}

	.tiktok-preview {
		border: 0;
		background: #000;
		aspect-ratio: 9 / 16;
		max-height: 180px;
	}

	.ig-preview {
		border: 0;
		background: var(--color-bg-elevated);
		aspect-ratio: 4 / 5;
		max-height: 180px;
	}

	.idea-card h4 {
		margin: 0;
		font-size: 0.86rem;
	}

	.idea-card p {
		margin: 0;
		font-size: 0.76rem;
		color: var(--color-slate-500);
	}

	.platform {
		display: inline-block;
		width: fit-content;
		padding: 0.14rem 0.5rem;
		border-radius: var(--radius-full);
		font-size: 0.67rem;
		font-weight: 700;
		background: var(--color-slate-100);
		color: var(--color-slate-700);
		border: 1px solid var(--color-border);
	}

	.calendar-shell {
		padding: 0.75rem;
		overflow-x: auto;
	}

	.calendar-weekdays,
	.calendar-grid {
		min-width: 900px;
	}

	.calendar-weekdays {
		display: grid;
		grid-template-columns: repeat(7, minmax(0, 1fr));
		gap: 0.55rem;
		margin-bottom: 0.55rem;
	}

	.calendar-weekdays span {
		text-align: center;
		font-size: 0.75rem;
		font-weight: 700;
		color: var(--color-slate-500);
	}

	.calendar-grid {
		display: grid;
		grid-template-columns: repeat(7, minmax(0, 1fr));
		gap: 0.55rem;
	}

	.calendar-day {
		min-height: 170px;
		max-height: 280px;
		border: 1px solid var(--color-border);
		border-radius: 0.8rem;
		padding: 0.6rem;
		display: grid;
		align-content: start;
		gap: 0.45rem;
		background: var(--color-bg-elevated);
		min-width: 0;
		overflow-y: auto;
	}

	.calendar-day.outside-month {
		opacity: 0.6;
	}

	.calendar-day.drop-hover {
		border-color: rgba(15, 23, 42, 0.34);
		box-shadow: inset 0 0 0 1px rgba(15, 23, 42, 0.18);
	}

	.calendar-day-head {
		display: grid;
		gap: 0.12rem;
	}

	.calendar-day-head strong {
		font-size: 0.9rem;
	}

	.calendar-day-head small {
		font-size: 0.7rem;
		color: var(--color-slate-500);
	}

	.drop-hint,
	.empty {
		margin: 0;
		color: var(--color-slate-500);
		font-size: 0.8rem;
	}

	.calendar-item {
		--platform-frame-color: var(--color-border-medium);
		display: grid;
		gap: 0.38rem;
		padding: 0.5rem;
		width: 100%;
		box-sizing: border-box;
		border-radius: 0.65rem;
		border: 1px solid var(--color-border);
		border-top: 3px solid var(--platform-frame-color);
		background: var(--color-bg-elevated);
		cursor: grab;
		min-width: 0;
	}

	.calendar-item-head {
		display: grid;
		justify-items: start;
		gap: 0.22rem;
	}

	.calendar-item-head .platform {
		font-size: 0.62rem;
		padding: 0.1rem 0.42rem;
	}

	.calendar-code {
		font-size: 0.67rem;
		letter-spacing: 0.02em;
		color: var(--color-slate-700);
		line-height: 1.2;
		word-break: break-word;
		overflow-wrap: anywhere;
	}

	.platform-frame--instagram {
		--platform-frame-color: var(--color-instagram);
	}

	.platform-frame--tiktok {
		--platform-frame-color: var(--color-tiktok);
	}

	.platform-frame--youtube {
		--platform-frame-color: var(--color-youtube);
	}

	.platform-frame--facebook {
		--platform-frame-color: var(--color-facebook);
	}

	.calendar-link {
		display: block;
		color: inherit;
		text-decoration: none;
		min-width: 0;
	}

	.calendar-title {
		margin: 0;
		font-size: 0.77rem;
		line-height: 1.35;
		color: var(--color-slate-700);
		display: -webkit-box;
		line-clamp: 2;
		-webkit-line-clamp: 2;
		-webkit-box-orient: vertical;
		overflow: hidden;
		overflow-wrap: anywhere;
	}

	.calendar-item-meta {
		display: flex;
		flex-wrap: wrap;
		gap: 0.25rem;
	}

	.meta-chip {
		display: inline-flex;
		align-items: center;
		padding: 0.1rem 0.4rem;
		border-radius: var(--radius-full);
		font-size: 0.62rem;
		font-weight: 700;
	}

	.deadline-chip {
		background: rgba(180, 83, 9, 0.12);
		color: #b45309;
	}

	.deadline-chip.overdue {
		background: rgba(220, 38, 38, 0.12);
		color: #b91c1c;
	}

	.member-chip {
		background: var(--color-slate-100);
		color: var(--color-slate-700);
	}

	.carousel-chip {
		background: rgba(15, 23, 42, 0.08);
		color: var(--color-slate-700);
	}

	.calendar-item p {
		margin: 0;
		font-size: 0.76rem;
		line-height: 1.3;
		color: var(--color-slate-600);
	}

	.tiny-danger {
		border: 0;
		background: rgba(220, 38, 38, 0.12);
		color: #b91c1c;
		border-radius: 0.5rem;
		font-size: 0.7rem;
		font-weight: 700;
		padding: 0.2rem 0.35rem;
		cursor: pointer;
		justify-self: end;
	}

	.assignment-badges {
		display: flex;
		flex-wrap: wrap;
		gap: 0.25rem;
	}

	.badge-member {
		display: inline-block;
		padding: 0.1rem 0.4rem;
		border-radius: var(--radius-full);
		font-size: 0.62rem;
		font-weight: 700;
		background: var(--color-slate-100);
		color: var(--color-slate-700);
	}

	.calendar-item-actions {
		display: grid;
		grid-template-columns: 1fr;
		gap: 0.28rem;
	}

	.tiny-detail {
		border: 1px solid var(--color-border);
		background: #fff;
		color: var(--color-slate-700);
		border-radius: 0.5rem;
		font-size: 0.7rem;
		font-weight: 700;
		padding: 0.2rem 0.35rem;
		cursor: pointer;
		width: 100%;
	}

	.tiny-link {
		display: inline-flex;
		align-items: center;
		justify-content: center;
		text-decoration: none;
		border-radius: 0.5rem;
		font-size: 0.7rem;
		font-weight: 700;
		padding: 0.2rem 0.35rem;
		background: rgba(15, 23, 42, 0.08);
		color: var(--color-slate-700);
		width: 100%;
		box-sizing: border-box;
	}

	.tiny-danger {
		width: 100%;
		justify-self: auto;
	}

	/* ── Production Stage Styles ── */
	.stage-select {
		appearance: none;
		-webkit-appearance: none;
		border: 0;
		border-radius: var(--radius-full);
		padding: 0.18rem 0.55rem;
		font-size: 0.65rem;
		font-weight: 700;
		cursor: pointer;
		width: 100%;
		max-width: 100%;
		box-sizing: border-box;
		background-image: url("data:image/svg+xml,%3Csvg xmlns='http://www.w3.org/2000/svg' width='10' height='6'%3E%3Cpath d='M0 0l5 6 5-6z' fill='%2364748b'/%3E%3C/svg%3E");
		background-repeat: no-repeat;
		background-position: right 0.35rem center;
		padding-right: 1.1rem;
	}

	.stage-select--planned {
		background-color: var(--color-slate-100);
		color: var(--color-slate-600);
	}

	.stage-select--scripting {
		background-color: rgba(147, 51, 234, 0.12);
		color: var(--color-purple-700);
	}

	.stage-select--shooting {
		background-color: rgba(249, 115, 22, 0.14);
		color: var(--color-orange-600);
	}

	.stage-select--editing {
		background-color: rgba(37, 99, 235, 0.12);
		color: var(--color-blue-700);
	}

	.stage-select--published {
		background-color: rgba(22, 163, 74, 0.14);
		color: #166534;
	}

	/* Stage left border accent on calendar items */
	.calendar-item.stage--planned {
		border-left: 3px solid var(--color-slate-300);
	}

	.calendar-item.stage--scripting {
		border-left: 3px solid var(--color-purple-500);
	}

	.calendar-item.stage--shooting {
		border-left: 3px solid var(--color-orange-500);
	}

	.calendar-item.stage--editing {
		border-left: 3px solid var(--color-blue-500);
	}

	.calendar-item.stage--published {
		border-left: 3px solid #16a34a;
	}

	@media (max-width: 940px) {
		.panel {
			padding: 0.85rem;
		}
	}
</style>
