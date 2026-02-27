<script lang="ts">
	import { onMount } from 'svelte';
	import { hasSupabaseConfig, supabase } from '$lib/supabase';
	import type { IdeaBacklogRow, ProductionCalendarRow } from '$lib/types';
	import {
		addMonthsIso,
		buildMonthCells,
		formatCalendarDayMeta,
		formatCalendarDayNumber,
		formatCount,
		formatMonthLabel,
		getMonthStartIso,
		platformLabel
	} from '$lib/media-plan';

	let ideas = $state<IdeaBacklogRow[]>([]);
	let calendarItems = $state<ProductionCalendarRow[]>([]);
	let loadingIdeas = $state(false);
	let loadingCalendar = $state(false);
	let message = $state('');
	let errorMessage = $state('');
	let currentMonthStart = $state(getMonthStartIso(new Date()));
	let dragHoverDate = $state<string | null>(null);
	let draggingBacklogId = $state<string | null>(null);

	const monthLabel = $derived.by(() => formatMonthLabel(currentMonthStart));
	const monthCells = $derived.by(() => buildMonthCells(currentMonthStart));
	const scheduledBacklogIds = $derived.by(() => new Set(calendarItems.map((item) => item.backlog_id)));
	const unscheduledIdeas = $derived.by(() => ideas.filter((idea) => !scheduledBacklogIds.has(idea.id)));
	const calendarByDate = $derived.by(() => {
		const grouped = new Map<string, ProductionCalendarRow[]>();
		for (const item of calendarItems) {
			const bucket = grouped.get(item.shoot_date) ?? [];
			bucket.push(item);
			grouped.set(item.shoot_date, bucket);
		}
		return grouped;
	});

	async function loadIdeas() {
		if (!supabase) return;
		loadingIdeas = true;

		const { data, error } = await supabase
			.from('idea_backlog')
			.select('*')
			.order('created_at', { ascending: false });

		loadingIdeas = false;
		if (error) {
			errorMessage = `โหลด backlog ไม่ได้: ${error.message}`;
			return;
		}
		ideas = (data ?? []) as IdeaBacklogRow[];
	}

	async function loadCalendar() {
		if (!supabase) return;
		loadingCalendar = true;

		const { data, error } = await supabase
			.from('production_calendar')
			.select('id, backlog_id, shoot_date, status, notes, created_at, idea_backlog(*)')
			.order('shoot_date', { ascending: true })
			.order('created_at', { ascending: true });

		loadingCalendar = false;
		if (error) {
			errorMessage = `โหลด calendar ไม่ได้: ${error.message}`;
			return;
		}

		const normalized = (data ?? []).map((item) => {
			const row = item as Record<string, unknown>;
			const linkedIdea = row.idea_backlog;
			return {
				...row,
				idea_backlog: Array.isArray(linkedIdea) ? (linkedIdea[0] ?? null) : (linkedIdea ?? null)
			};
		});

		calendarItems = normalized as ProductionCalendarRow[];
	}

	function shiftMonth(months: number) {
		currentMonthStart = addMonthsIso(currentMonthStart, months);
	}

	function handleDragStart(event: DragEvent, backlogId: string) {
		draggingBacklogId = backlogId;
		event.dataTransfer?.setData('text/plain', backlogId);
		if (event.dataTransfer) {
			event.dataTransfer.effectAllowed = 'move';
		}
	}

	function handleDragOver(event: DragEvent, dateIso: string) {
		event.preventDefault();
		dragHoverDate = dateIso;
		if (event.dataTransfer) {
			event.dataTransfer.dropEffect = 'move';
		}
	}

	async function scheduleIdeaOnDate(backlogId: string, dateIso: string) {
		if (!supabase) return;
		errorMessage = '';

		const { error } = await supabase.from('production_calendar').upsert(
			{
				backlog_id: backlogId,
				shoot_date: dateIso,
				status: 'planned'
			},
			{ onConflict: 'backlog_id' }
		);

		if (error) {
			errorMessage = `วางแผนใน calendar ไม่สำเร็จ: ${error.message}`;
			return;
		}

		message = 'อัปเดตตารางถ่ายทำแล้ว';
		await loadCalendar();
	}

	async function handleDropOnDate(event: DragEvent, dateIso: string) {
		event.preventDefault();
		const backlogId = event.dataTransfer?.getData('text/plain') || draggingBacklogId;
		draggingBacklogId = null;
		dragHoverDate = null;
		if (!backlogId) return;
		await scheduleIdeaOnDate(backlogId, dateIso);
	}

	async function unscheduleIdea(backlogId: string) {
		if (!supabase) return;
		errorMessage = '';

		const { error } = await supabase.from('production_calendar').delete().eq('backlog_id', backlogId);

		if (error) {
			errorMessage = `ลบออกจาก calendar ไม่สำเร็จ: ${error.message}`;
			return;
		}

		message = 'นำออกจาก calendar แล้ว';
		calendarItems = calendarItems.filter((item) => item.backlog_id !== backlogId);
	}

	onMount(async () => {
		await Promise.all([loadIdeas(), loadCalendar()]);
	});
</script>

<main class="page">
	<section class="hero">
		<p class="kicker">Planning</p>
		<h1>Shoot Calendar</h1>
		<p>ลากไอเดียที่ยังไม่ schedule มาวางลงวันที่เพื่อวางแผนถ่ายทำรายเดือน</p>
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
		<div class="list-head">
			<h2>Monthly Plan</h2>
			<div class="calendar-controls">
				<button class="ghost" onclick={() => shiftMonth(-1)}>&larr; Prev</button>
				<span>{monthLabel}</span>
				<button class="ghost" onclick={() => shiftMonth(1)}>Next &rarr;</button>
			</div>
		</div>

		<div class="calendar-layout">
			<aside class="idea-bank">
				<div class="bank-head">
					<h3>Unscheduled Ideas</h3>
					<span>{unscheduledIdeas.length}</span>
				</div>
				{#if loadingIdeas}
					<p class="empty">Loading ideas...</p>
				{:else if unscheduledIdeas.length === 0}
					<p class="empty">ยังไม่มีไอเดียค้างวางแผน</p>
				{:else}
					<div class="idea-list">
						{#each unscheduledIdeas as idea}
							<article
								class="idea-card"
								draggable="true"
								ondragstart={(event) => handleDragStart(event, idea.id)}
								ondragend={() => {
									draggingBacklogId = null;
									dragHoverDate = null;
								}}
							>
								<span class="platform">{platformLabel[idea.platform]}</span>
								<h4>{idea.title ?? 'Untitled idea'}</h4>
								<p>Views: {formatCount(idea.view_count)}</p>
							</article>
						{/each}
					</div>
				{/if}
			</aside>

			<div class="calendar-shell">
				{#if loadingCalendar}
					<p class="empty">Loading calendar...</p>
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
								class={`calendar-day ${cell.inCurrentMonth ? '' : 'outside-month'} ${dragHoverDate === cell.dateIso ? 'drop-hover' : ''}`}
								role="region"
								aria-label={`Shoot day ${cell.dateIso}`}
								ondragover={(event) => handleDragOver(event, cell.dateIso)}
								ondragleave={() => (dragHoverDate = null)}
								ondrop={(event) => handleDropOnDate(event, cell.dateIso)}
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
										class="calendar-item"
										draggable="true"
										ondragstart={(event) => handleDragStart(event, item.backlog_id)}
									>
										<a
											class="calendar-link"
											href={item.idea_backlog?.url ?? '#'}
											target="_blank"
											rel="noopener noreferrer"
											onclick={(event) => {
												if (!item.idea_backlog?.url?.trim()) {
													event.preventDefault();
													errorMessage = 'ไม่พบลิงก์คลิปของไอเดียนี้';
												}
											}}
										>
											<span class="platform">{item.idea_backlog?.platform?.toUpperCase() ?? 'IDEA'}</span>
											<p>{item.idea_backlog?.title ?? 'Untitled idea'}</p>
										</a>
										<button
											class="tiny-danger"
											onclick={(event) => {
												event.stopPropagation();
												void unscheduleIdea(item.backlog_id);
											}}
										>
											Remove
										</button>
									</article>
								{/each}
							</div>
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
		font-family: 'Space Grotesk', 'Noto Sans Thai', sans-serif;
	}

	.hero {
		text-align: center;
		padding: 1.2rem 0 0.2rem;
	}

	.hero h1 {
		margin: 0.4rem 0;
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
		color: #1d4ed8;
		font-weight: 700;
	}

	.panel {
		padding: 1rem;
		border-radius: 1rem;
		border: 1px solid rgba(15, 23, 42, 0.08);
		background: rgba(255, 255, 255, 0.86);
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

	.ghost {
		border: 1px solid rgba(37, 99, 235, 0.25);
		background: rgba(37, 99, 235, 0.08);
		color: #1d4ed8;
		padding: 0.42rem 0.75rem;
		border-radius: 0.65rem;
		font-weight: 700;
		cursor: pointer;
	}

	.calendar-layout {
		display: grid;
		grid-template-columns: 300px 1fr;
		gap: 0.8rem;
	}

	.idea-bank,
	.calendar-shell {
		border: 1px solid rgba(15, 23, 42, 0.09);
		border-radius: 0.85rem;
		background: #fff;
	}

	.idea-bank {
		padding: 0.75rem;
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
		border-radius: 999px;
		font-size: 0.75rem;
		font-weight: 700;
		background: rgba(37, 99, 235, 0.12);
		color: #1d4ed8;
	}

	.idea-list {
		display: grid;
		gap: 0.5rem;
		max-height: 560px;
		overflow: auto;
	}

	.idea-card {
		border: 1px solid rgba(15, 23, 42, 0.09);
		padding: 0.55rem;
		border-radius: 0.7rem;
		cursor: grab;
		display: grid;
		gap: 0.25rem;
	}

	.idea-card h4 {
		margin: 0;
		font-size: 0.86rem;
	}

	.idea-card p {
		margin: 0;
		font-size: 0.76rem;
		color: #64748b;
	}

	.platform {
		display: inline-block;
		width: fit-content;
		padding: 0.14rem 0.5rem;
		border-radius: 999px;
		font-size: 0.67rem;
		font-weight: 700;
		background: rgba(180, 83, 9, 0.14);
		color: #92400e;
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
		color: #64748b;
	}

	.calendar-grid {
		display: grid;
		grid-template-columns: repeat(7, minmax(0, 1fr));
		gap: 0.55rem;
	}

	.calendar-day {
		min-height: 145px;
		border: 1px solid rgba(15, 23, 42, 0.09);
		border-radius: 0.8rem;
		padding: 0.55rem;
		display: grid;
		align-content: start;
		gap: 0.45rem;
		background: rgba(255, 255, 255, 0.88);
	}

	.calendar-day.outside-month {
		opacity: 0.6;
	}

	.calendar-day.drop-hover {
		border-color: rgba(37, 99, 235, 0.45);
		box-shadow: inset 0 0 0 1px rgba(37, 99, 235, 0.3);
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
		color: #64748b;
	}

	.drop-hint,
	.empty {
		margin: 0;
		color: #64748b;
		font-size: 0.8rem;
	}

	.calendar-item {
		display: grid;
		gap: 0.35rem;
		padding: 0.45rem;
		border-radius: 0.65rem;
		border: 1px solid rgba(15, 23, 42, 0.1);
		background: #fff;
		cursor: grab;
	}

	.calendar-link {
		display: grid;
		gap: 0.35rem;
		color: inherit;
		text-decoration: none;
	}

	.calendar-item p {
		margin: 0;
		font-size: 0.78rem;
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

	@media (max-width: 940px) {
		.calendar-layout {
			grid-template-columns: 1fr;
		}
	}
</style>
