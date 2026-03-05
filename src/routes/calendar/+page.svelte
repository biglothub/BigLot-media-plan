<script lang="ts">
	import { onMount } from "svelte";
	import { hasSupabaseConfig, supabase } from "$lib/supabase";
	import type { IdeaBacklogRow, ProductionCalendarRow, CalendarAssignmentRow, TeamMember, ProductionStage, SupportedPlatform, BacklogContentType } from "$lib/types";
	import {
		addMonthsIso,
		buildMonthCells,
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
		contentTypeLabel,
	} from "$lib/media-plan";

	let ideas = $state<IdeaBacklogRow[]>([]);
	let calendarItems = $state<ProductionCalendarRow[]>([]);
	let loadingIdeas = $state(false);
	let loadingCalendar = $state(false);
	let message = $state("");
	let errorMessage = $state("");
	let currentMonthStart = $state(getMonthStartIso(new Date()));
	let dragHoverDate = $state<string | null>(null);
	let draggingBacklogId = $state<string | null>(null);
	let detailItem = $state<ProductionCalendarRow | null>(null);
	let assignmentDraft = $state<Record<TeamMember, { enabled: boolean; role_detail: string }>>({
		'โฟน': { enabled: false, role_detail: '' },
		'ฟิวส์': { enabled: false, role_detail: '' },
		'อิก': { enabled: false, role_detail: '' },
		'ต้า': { enabled: false, role_detail: '' },
	});
	let savingAssignments = $state(false);
	let detailNotes = $state("");
	let detailPlatform = $state<SupportedPlatform>('youtube');
	let detailContentType = $state<BacklogContentType>('video');
	let detailTitle = $state('');
	let detailUrl = $state('');
	let detailAuthorName = $state('');
	let detailDescription = $state('');
	let detailThumbnailUrl = $state('');
	let detailPublishedAt = $state('');
	let detailShootDate = $state('');
	let detailStatus = $state<ProductionStage>('planned');
	let detailViews = $state<number | null>(null);
	let detailLikes = $state<number | null>(null);
	let detailComments = $state<number | null>(null);
	let detailShares = $state<number | null>(null);
	let detailSaves = $state<number | null>(null);
	let ideaSearch = $state("");
	const TEAM_MEMBERS: TeamMember[] = ['โฟน', 'ฟิวส์', 'อิก', 'ต้า'];

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
			errorMessage = `โหลด backlog ไม่ได้: ${error.message}`;
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
				"id, backlog_id, shoot_date, status, notes, created_at, idea_backlog(*), calendar_assignments(*)",
			)
			.order("shoot_date", { ascending: true })
			.order("created_at", { ascending: true });

		loadingCalendar = false;
		if (error) {
			errorMessage = `โหลด calendar ไม่ได้: ${error.message}`;
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
		currentMonthStart = addMonthsIso(currentMonthStart, months);
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

	function scrollToTop() {
		window.scrollTo({ top: 0, behavior: "smooth" });
	}

	async function scheduleIdeaOnDate(backlogId: string, dateIso: string) {
		if (!supabase) return;
		errorMessage = "";

		const { error } = await supabase.from("production_calendar").upsert(
			{
				backlog_id: backlogId,
				shoot_date: dateIso,
				status: "planned",
			},
			{ onConflict: "backlog_id" },
		);

		if (error) {
			errorMessage = `วางแผนใน calendar ไม่สำเร็จ: ${error.message}`;
			scrollToTop();
			return;
		}

		message = "อัปเดตตารางถ่ายทำแล้ว";
		scrollToTop();
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
		errorMessage = "";

		const { data, error } = await supabase
			.from("production_calendar")
			.delete()
			.eq("backlog_id", backlogId)
			.select("id");

		if (error) {
			errorMessage = `ลบออกจาก calendar ไม่สำเร็จ: ${error.message}`;
			scrollToTop();
			return;
		}

		if (!data || data.length === 0) {
			errorMessage = `ลบออกจาก calendar ไม่สำเร็จ: ระบบไม่ได้รับอนุญาตให้ลบรายการนี้ (RLS policy blocked)`;
			scrollToTop();
			await loadCalendar();
			return;
		}

		message = "นำออกจาก calendar แล้ว";
		scrollToTop();
		await loadCalendar();
	}

	function openDetail(item: ProductionCalendarRow) {
		detailItem = item;
		detailNotes = item.notes ?? '';
		detailShootDate = item.shoot_date ?? '';
		detailStatus = (item.status as ProductionStage) ?? 'planned';

		const bl = item.idea_backlog;
		detailPlatform = (bl?.platform as SupportedPlatform) ?? 'youtube';
		detailContentType = (bl?.content_type as BacklogContentType) ?? 'video';
		detailTitle = bl?.title ?? '';
		detailUrl = bl?.url ?? '';
		detailAuthorName = bl?.author_name ?? '';
		detailDescription = bl?.description ?? '';
		detailThumbnailUrl = bl?.thumbnail_url ?? '';
		detailPublishedAt = bl?.published_at ? new Date(bl.published_at).toISOString().slice(0, 16) : '';
		detailViews = bl?.view_count ?? null;
		detailLikes = bl?.like_count ?? null;
		detailComments = bl?.comment_count ?? null;
		detailShares = bl?.share_count ?? null;
		detailSaves = bl?.save_count ?? null;

		const existing = item.calendar_assignments ?? [];
		assignmentDraft = {
			'โฟน': { enabled: false, role_detail: '' },
			'ฟิวส์': { enabled: false, role_detail: '' },
			'อิก': { enabled: false, role_detail: '' },
			'ต้า': { enabled: false, role_detail: '' },
		};
		for (const a of existing) {
			assignmentDraft[a.member_name] = { enabled: true, role_detail: a.role_detail };
		}
	}

	function closeDetail() {
		detailItem = null;
	}

	async function saveAssignments() {
		if (!supabase || !detailItem) return;
		savingAssignments = true;
		errorMessage = "";

		const calendarId = detailItem.id;
		const backlogId = detailItem.backlog_id;

		// 1. Update idea_backlog
		const { error: backlogError } = await supabase
			.from('idea_backlog')
			.update({
				platform: detailPlatform,
				content_type: detailContentType,
				title: detailTitle.trim() || null,
				url: detailUrl.trim() || null,
				author_name: detailAuthorName.trim() || null,
				description: detailDescription.trim() || null,
				thumbnail_url: detailThumbnailUrl.trim() || null,
				published_at: detailPublishedAt ? new Date(detailPublishedAt).toISOString() : null,
				view_count: detailViews,
				like_count: detailLikes,
				comment_count: detailComments,
				share_count: detailShares,
				save_count: detailSaves,
			})
			.eq('id', backlogId);

		if (backlogError) {
			errorMessage = `บันทึก content info ไม่สำเร็จ: ${backlogError.message}`;
			savingAssignments = false;
			return;
		}

		// 2. Update production_calendar (shoot_date, status, notes)
		const { error: calError } = await supabase
			.from('production_calendar')
			.update({
				shoot_date: detailShootDate,
				status: detailStatus,
				notes: detailNotes.trim() || null,
			})
			.eq('id', calendarId);

		if (calError) {
			errorMessage = `บันทึก calendar ไม่สำเร็จ: ${calError.message}`;
			savingAssignments = false;
			return;
		}

		// 3. Update assignments
		await supabase.from('calendar_assignments').delete().eq('calendar_id', calendarId);

		const toInsert = TEAM_MEMBERS
			.filter((m) => assignmentDraft[m].enabled)
			.map((m) => ({
				calendar_id: calendarId,
				member_name: m,
				role_detail: assignmentDraft[m].role_detail,
			}));

		if (toInsert.length > 0) {
			const { error } = await supabase.from('calendar_assignments').insert(toInsert);
			if (error) {
				errorMessage = `บันทึกหน้าที่ไม่สำเร็จ: ${error.message}`;
				savingAssignments = false;
				return;
			}
		}

		savingAssignments = false;
		message = 'บันทึกเรียบร้อยแล้ว';
		closeDetail();
		await Promise.all([loadIdeas(), loadCalendar()]);
	}

	async function updateStatus(calendarId: string, newStatus: ProductionStage) {
		if (!supabase) return;
		const { error } = await supabase
			.from("production_calendar")
			.update({ status: newStatus })
			.eq("id", calendarId);

		if (error) {
			errorMessage = `อัปเดตสถานะไม่สำเร็จ: ${error.message}`;
			scrollToTop();
			return;
		}
		await loadCalendar();
	}

	onMount(async () => {
		await Promise.all([loadIdeas(), loadCalendar()]);
	});
</script>

<main class="page">
	<section class="hero">
		<p class="kicker">Planning</p>
		<h1>Shoot Calendar</h1>
		<p>
			ลากไอเดียที่ยังไม่ schedule มาวางลงวันที่เพื่อวางแผนถ่ายทำรายเดือน
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
		<div class="list-head">
			<h2>Monthly Plan</h2>
			<div class="calendar-controls">
				<button class="ghost" onclick={() => shiftMonth(-1)}
					>&larr; Prev</button
				>
				<span>{monthLabel}</span>
				<button class="ghost" onclick={() => shiftMonth(1)}
					>Next &rarr;</button
				>
			</div>
		</div>

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
					<p class="empty">Loading ideas...</p>
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
									<strong
										>{formatCalendarDayNumber(
											cell.dateIso,
										)}</strong
									>
									<small
										>{formatCalendarDayMeta(
											cell.dateIso,
										)}</small
									>
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
										<a
											class="calendar-link"
											href={item.idea_backlog?.url ?? "#"}
											target="_blank"
											rel="noopener noreferrer"
											onclick={(event) => {
												if (
													!item.idea_backlog?.url?.trim()
												) {
													event.preventDefault();
													errorMessage =
														"ไม่พบลิงก์คลิปของไอเดียนี้";
												}
											}}
										>
											<span class="platform"
												>{item.idea_backlog?.platform?.toUpperCase() ??
													"IDEA"}</span
											>
											<strong
												>{item.idea_backlog
													? backlogCode(
															item.idea_backlog,
														)
													: "Unknown code"}</strong
											>
											<p>
												{item.idea_backlog?.title ??
													"Untitled idea"}
											</p>
										</a>
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
										<button
											class="tiny-danger"
											onclick={(event) => {
												event.stopPropagation();
												void unscheduleIdea(
													item.backlog_id,
												);
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
	</section>
	{#if detailItem}
		<!-- svelte-ignore a11y_no_static_element_interactions -->
		<div class="modal-overlay" onclick={closeDetail} onkeydown={(e) => e.key === 'Escape' && closeDetail()}>
			<!-- svelte-ignore a11y_no_static_element_interactions -->
			<div class="modal-box" onclick={(e) => e.stopPropagation()} onkeydown={() => {}}>
				<div class="modal-header">
					<div>
						<p class="modal-code">{detailItem.idea_backlog ? backlogCode(detailItem.idea_backlog) : 'Unknown'}</p>
						<h3>{detailTitle || 'Untitled'}</h3>
					</div>
					<button class="ghost" onclick={closeDetail}>✕</button>
				</div>

				<!-- Section 1: Content Info -->
				<section class="modal-section">
					<h4 class="section-title">Content Info</h4>
					<div class="form-row">
						<div class="form-field">
							<label>Platform</label>
							<select bind:value={detailPlatform}>
								<option value="youtube">YouTube</option>
								<option value="facebook">Facebook</option>
								<option value="instagram">Instagram</option>
								<option value="tiktok">TikTok</option>
							</select>
						</div>
						<div class="form-field">
							<label>Content Type</label>
							<select bind:value={detailContentType}>
								<option value="video">Video</option>
								<option value="post">Post</option>
								<option value="image">Image</option>
							</select>
						</div>
					</div>
					<div class="form-field">
						<label>Title</label>
						<input type="text" bind:value={detailTitle} placeholder="ชื่อคอนเทนต์..." />
					</div>
					<div class="form-field">
						<label>Content Link</label>
						<input type="url" bind:value={detailUrl} placeholder="https://..." />
					</div>
					<div class="form-row">
						<div class="form-field">
							<label>Creator / Account</label>
							<input type="text" bind:value={detailAuthorName} placeholder="ชื่อครีเอเตอร์..." />
						</div>
						<div class="form-field">
							<label>Thumbnail URL</label>
							<input type="url" bind:value={detailThumbnailUrl} placeholder="https://..." />
						</div>
					</div>
					<div class="form-field">
						<label>Description</label>
						<textarea rows="3" bind:value={detailDescription} placeholder="รายละเอียด..."></textarea>
					</div>
				</section>

				<!-- Section 2: Dates & Status -->
				<section class="modal-section">
					<h4 class="section-title">Schedule & Status</h4>
					<div class="form-row">
						<div class="form-field">
							<label>Shoot Date</label>
							<input type="date" bind:value={detailShootDate} />
						</div>
						<div class="form-field">
							<label>Published At</label>
							<input type="datetime-local" bind:value={detailPublishedAt} />
						</div>
					</div>
					<div class="form-field">
						<label>Production Stage</label>
						<select bind:value={detailStatus}>
							{#each PRODUCTION_STAGES as stage}
								<option value={stage}>{stageLabel[stage]}</option>
							{/each}
						</select>
					</div>
				</section>

				<!-- Section 3: Metrics -->
				<section class="modal-section">
					<h4 class="section-title">Metrics</h4>
					<div class="metrics-grid">
						<div class="form-field">
							<label>Views</label>
							<input type="number" min="0" bind:value={detailViews} placeholder="0" />
						</div>
						<div class="form-field">
							<label>Likes</label>
							<input type="number" min="0" bind:value={detailLikes} placeholder="0" />
						</div>
						<div class="form-field">
							<label>Comments</label>
							<input type="number" min="0" bind:value={detailComments} placeholder="0" />
						</div>
						<div class="form-field">
							<label>Shares</label>
							<input type="number" min="0" bind:value={detailShares} placeholder="0" />
						</div>
						<div class="form-field">
							<label>Saves</label>
							<input type="number" min="0" bind:value={detailSaves} placeholder="0" />
						</div>
					</div>
				</section>

				<!-- Section 4: Team Assignments -->
				<section class="modal-section">
					<h4 class="section-title">Team Assignments</h4>
					<div class="assignment-list">
						{#each TEAM_MEMBERS as member}
							<div class="assignment-row">
								<label class="member-toggle">
									<input type="checkbox" bind:checked={assignmentDraft[member].enabled} />
									<span class="member-name">{member}</span>
								</label>
								{#if assignmentDraft[member].enabled}
									<input
										type="text"
										class="role-input"
										placeholder="รายละเอียดหน้าที่..."
										bind:value={assignmentDraft[member].role_detail}
									/>
								{/if}
							</div>
						{/each}
					</div>
				</section>

				<!-- Section 5: Notes -->
				<section class="modal-section">
					<h4 class="section-title">Notes</h4>
					<textarea
						class="notes-input"
						placeholder="รายละเอียดเพิ่มเติม / โน้ตอื่นๆ..."
						rows="3"
						bind:value={detailNotes}
					></textarea>
				</section>

				<div class="modal-footer">
					<button class="btn-save" onclick={saveAssignments} disabled={savingAssignments}>
						{savingAssignments ? 'Saving...' : 'Save'}
					</button>
					<button class="ghost" onclick={closeDetail}>Cancel</button>
				</div>
			</div>
		</div>
	{/if}
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
		max-height: 680px;
		overflow: auto;
	}

	.idea-card {
		--platform-frame-color: rgba(15, 23, 42, 0.09);
		border: 1px solid var(--platform-frame-color);
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
		border: 1px solid rgba(15, 23, 42, 0.14);
		background: #fff;
		font-size: 0.82rem;
		margin-bottom: 0.6rem;
	}

	.idea-search:focus {
		outline: none;
		border-color: #2563eb;
		box-shadow: 0 0 0 2px rgba(37, 99, 235, 0.15);
	}

	.idea-preview {
		width: 100%;
		aspect-ratio: 16 / 9;
		object-fit: cover;
		border-radius: 0.55rem;
		border: 1px solid rgba(15, 23, 42, 0.08);
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
		background: #fff;
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
		--platform-frame-color: rgba(15, 23, 42, 0.1);
		display: grid;
		gap: 0.35rem;
		padding: 0.45rem;
		border-radius: 0.65rem;
		border: 1px solid var(--platform-frame-color);
		background: #fff;
		cursor: grab;
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

	.calendar-link {
		display: grid;
		gap: 0.35rem;
		color: inherit;
		text-decoration: none;
	}

	.calendar-link strong {
		font-size: 0.76rem;
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

	.assignment-badges {
		display: flex;
		flex-wrap: wrap;
		gap: 0.25rem;
	}

	.badge-member {
		display: inline-block;
		padding: 0.1rem 0.4rem;
		border-radius: 999px;
		font-size: 0.62rem;
		font-weight: 700;
		background: rgba(37, 99, 235, 0.12);
		color: #1d4ed8;
	}

	.calendar-item-actions {
		display: flex;
		gap: 0.3rem;
		justify-content: flex-end;
	}

	.tiny-detail {
		border: 0;
		background: rgba(37, 99, 235, 0.12);
		color: #1d4ed8;
		border-radius: 0.5rem;
		font-size: 0.7rem;
		font-weight: 700;
		padding: 0.2rem 0.35rem;
		cursor: pointer;
	}

	/* ── Production Stage Styles ── */
	.stage-select {
		appearance: none;
		-webkit-appearance: none;
		border: 0;
		border-radius: 999px;
		padding: 0.18rem 0.55rem;
		font-size: 0.65rem;
		font-weight: 700;
		cursor: pointer;
		width: fit-content;
		background-image: url("data:image/svg+xml,%3Csvg xmlns='http://www.w3.org/2000/svg' width='10' height='6'%3E%3Cpath d='M0 0l5 6 5-6z' fill='%2364748b'/%3E%3C/svg%3E");
		background-repeat: no-repeat;
		background-position: right 0.35rem center;
		padding-right: 1.1rem;
	}

	.stage-select--planned {
		background-color: rgba(100, 116, 139, 0.14);
		color: #475569;
	}

	.stage-select--scripting {
		background-color: rgba(139, 92, 246, 0.14);
		color: #6d28d9;
	}

	.stage-select--shooting {
		background-color: rgba(245, 158, 11, 0.14);
		color: #b45309;
	}

	.stage-select--editing {
		background-color: rgba(59, 130, 246, 0.14);
		color: #1d4ed8;
	}

	.stage-select--published {
		background-color: rgba(22, 163, 74, 0.14);
		color: #166534;
	}

	/* Stage left border accent on calendar items */
	.calendar-item.stage--planned {
		border-left: 3px solid #94a3b8;
	}

	.calendar-item.stage--scripting {
		border-left: 3px solid #8b5cf6;
	}

	.calendar-item.stage--shooting {
		border-left: 3px solid #f59e0b;
	}

	.calendar-item.stage--editing {
		border-left: 3px solid #3b82f6;
	}

	.calendar-item.stage--published {
		border-left: 3px solid #16a34a;
	}

	.modal-overlay {
		position: fixed;
		inset: 0;
		z-index: 1000;
		background: rgba(0, 0, 0, 0.45);
		display: grid;
		place-items: center;
		padding: 1rem;
	}

	.modal-box {
		background: #fff;
		border-radius: 1rem;
		padding: 1.5rem;
		width: 100%;
		max-width: 480px;
		max-height: 90vh;
		overflow-y: auto;
		display: grid;
		gap: 1rem;
	}

	.modal-header {
		display: flex;
		justify-content: space-between;
		align-items: flex-start;
		gap: 0.5rem;
	}

	.modal-header h3 {
		margin: 0;
		font-size: 1.05rem;
	}

	.modal-code {
		margin: 0 0 0.2rem;
		font-size: 0.75rem;
		font-weight: 700;
		color: #1d4ed8;
		text-transform: uppercase;
		letter-spacing: 0.06em;
	}

	.modal-section {
		display: grid;
		gap: 0.65rem;
		padding-bottom: 0.8rem;
		border-bottom: 1px solid rgba(15, 23, 42, 0.07);
	}

	.modal-section:last-of-type {
		border-bottom: none;
		padding-bottom: 0;
	}

	.section-title {
		margin: 0;
		font-size: 0.82rem;
		font-weight: 700;
		text-transform: uppercase;
		letter-spacing: 0.08em;
		color: #64748b;
	}

	.form-row {
		display: grid;
		grid-template-columns: 1fr 1fr;
		gap: 0.6rem;
	}

	.form-field {
		display: grid;
		gap: 0.3rem;
	}

	.form-field label {
		font-size: 0.78rem;
		font-weight: 600;
		color: #475569;
	}

	.form-field input,
	.form-field select,
	.form-field textarea {
		width: 100%;
		box-sizing: border-box;
		font: inherit;
		font-size: 0.85rem;
		padding: 0.42rem 0.6rem;
		border: 1px solid rgba(15, 23, 42, 0.15);
		border-radius: 0.55rem;
		background: #fff;
	}

	.form-field input:focus,
	.form-field select:focus,
	.form-field textarea:focus {
		outline: none;
		border-color: #2563eb;
		box-shadow: 0 0 0 2px rgba(37, 99, 235, 0.15);
	}

	.form-field textarea {
		resize: vertical;
	}

	.metrics-grid {
		display: grid;
		grid-template-columns: repeat(3, 1fr);
		gap: 0.6rem;
	}

	.assignment-list {
		display: grid;
		gap: 0.65rem;
	}

	.assignment-row {
		display: grid;
		gap: 0.35rem;
		padding: 0.55rem;
		border: 1px solid rgba(15, 23, 42, 0.09);
		border-radius: 0.7rem;
	}

	.member-toggle {
		display: flex;
		align-items: center;
		gap: 0.45rem;
		cursor: pointer;
	}

	.member-name {
		font-weight: 700;
		font-size: 0.9rem;
	}

	.role-input {
		width: 100%;
		padding: 0.4rem 0.6rem;
		border: 1px solid rgba(15, 23, 42, 0.15);
		border-radius: 0.55rem;
		font-size: 0.85rem;
		font-family: inherit;
		box-sizing: border-box;
	}

	.role-input:focus {
		outline: none;
		border-color: #2563eb;
		box-shadow: 0 0 0 2px rgba(37, 99, 235, 0.15);
	}

	.detail-notes {
		display: grid;
		gap: 0.4rem;
	}

	.detail-notes h4 {
		margin: 0;
		font-size: 0.95rem;
	}

	.notes-input {
		width: 100%;
		padding: 0.5rem 0.6rem;
		border: 1px solid rgba(15, 23, 42, 0.15);
		border-radius: 0.55rem;
		font-size: 0.85rem;
		font-family: inherit;
		box-sizing: border-box;
		resize: vertical;
	}

	.notes-input:focus {
		outline: none;
		border-color: #2563eb;
		box-shadow: 0 0 0 2px rgba(37, 99, 235, 0.15);
	}

	.modal-footer {
		display: flex;
		gap: 0.5rem;
		justify-content: flex-end;
	}

	.btn-save {
		border: 0;
		background: #1d4ed8;
		color: #fff;
		padding: 0.5rem 1.2rem;
		border-radius: 0.65rem;
		font-weight: 700;
		font-size: 0.85rem;
		cursor: pointer;
	}

	.btn-save:disabled {
		opacity: 0.6;
		cursor: not-allowed;
	}

	@media (max-width: 940px) {
		.calendar-layout {
			grid-template-columns: 1fr;
		}
	}
</style>
