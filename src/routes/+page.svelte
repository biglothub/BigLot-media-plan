<script lang="ts">
	import { onMount } from "svelte";
	import { hasSupabaseConfig, supabase } from "$lib/supabase";
	import type { EnrichResult, IdeaBacklogRow } from "$lib/types";

	const numberFormatter = new Intl.NumberFormat("en-US");

	let linkInput = $state("");
	let notes = $state("");
	let loadingIdeas = $state(false);
	let enriching = $state(false);
	let saving = $state(false);
	let message = $state("");
	let errorMessage = $state("");
	let draft = $state<EnrichResult | null>(null);
	let ideas = $state<IdeaBacklogRow[]>([]);
	let metrics = $state({
		views: null as number | null,
		likes: null as number | null,
		comments: null as number | null,
		shares: null as number | null,
		saves: null as number | null,
	});
	const platformOrder = ["youtube", "facebook", "instagram", "tiktok"] as const;
	const platformLabel: Record<(typeof platformOrder)[number], string> = {
		youtube: "YouTube",
		facebook: "Facebook",
		instagram: "Instagram",
		tiktok: "TikTok",
	};

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

		for (const [platform, items] of grouped.entries()) {
			if (!platformOrder.includes(platform as (typeof platformOrder)[number])) {
				orderedGroups.push({
					key: platform,
					label: platform.toUpperCase(),
					items,
				});
			}
		}

		return orderedGroups;
	});

	function clearState() {
		draft = null;
		notes = "";
		metrics = {
			views: null,
			likes: null,
			comments: null,
			shares: null,
			saves: null,
		};
	}

	function formatCount(value: number | null): string {
		return value === null ? "-" : numberFormatter.format(value);
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

		const payload = {
			url: draft.url,
			platform: draft.platform,
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
			return;
		}

		message = "บันทึกเข้า backlog แล้ว";
		linkInput = "";
		clearState();
		await loadIdeas();
	}

	onMount(loadIdeas);
</script>

<main class="page">
	<section class="hero">
		<p class="kicker">BigLot Media Plan</p>
		<h1>Idea Backlog</h1>
		<p class="subtitle">
			วางลิงก์ YouTube / Facebook / Instagram / TikTok แล้วดึง engagement
			มาเก็บเป็น backlog
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
			<label for="video-link">Video Link</label>
			<input
				id="video-link"
				bind:value={linkInput}
				placeholder="https://www.youtube.com/watch?v=..."
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
				{#if draft.thumbnailUrl}
					<img
						src={draft.thumbnailUrl}
						alt={draft.title ?? "thumbnail"}
					/>
				{/if}
				<div class="preview-content">
					<span class="platform">{draft.platform.toUpperCase()}</span>
					<h2>{draft.title ?? "Untitled video"}</h2>
					<p class="meta">
						{draft.authorName ?? "Unknown creator"}
						{#if draft.publishedAt}
							• {new Date(draft.publishedAt).toLocaleDateString()}
						{/if}
					</p>
					{#if draft.description}
						<p class="notes">{draft.description}</p>
					{/if}
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
				<label for="notes">Idea Notes</label>
				<textarea
					id="notes"
					bind:value={notes}
					rows={4}
					placeholder="ไอเดียที่ได้จากวิดีโอนี้ เช่น hook, visual style, CTA..."
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
		<div class="list-head">
			<h2>Backlog ({ideas.length})</h2>
			{#if loadingIdeas}
				<span class="loading-spinner">Loading...</span>
			{/if}
		</div>

		{#if ideas.length === 0}
			<p class="empty text-center">ยังไม่มีรายการไอเดียในระบบ</p>
		{:else}
			<div class="platform-groups">
				{#each groupedIdeas as group}
					<section class="platform-group">
						<div class="platform-group-head">
							<h3>{group.label}</h3>
							<span class="group-count">{group.items.length}</span>
						</div>

						<div class="grid">
							{#each group.items as idea}
								<article class="card">
									{#if idea.thumbnail_url}
										<img
											src={idea.thumbnail_url}
											alt={idea.title ?? "thumbnail"}
										/>
									{/if}
									<div class="card-body">
										<span class="platform"
											>{idea.platform.toUpperCase()}</span
										>
										<h3>{idea.title ?? "Untitled idea"}</h3>

										<div class="stats">
											<div class="stat-badge">
												<span>Views</span>
												<span>{formatCount(idea.view_count)}</span>
											</div>
											<div class="stat-badge">
												<span>Likes</span>
												<span>{formatCount(idea.like_count)}</span>
											</div>
											<div class="stat-badge">
												<span>Comments</span>
												<span
													>{formatCount(idea.comment_count)}</span
												>
											</div>
											<div class="stat-badge">
												<span>Shares</span>
												<span>{formatCount(idea.share_count)}</span>
											</div>
										</div>

										{#if idea.notes}
											<p class="notes">{idea.notes}</p>
										{/if}

										<div class="link">
											<a
												href={idea.url}
												target="_blank"
												rel="noreferrer">{idea.url}</a
											>
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
</main>

<style>
	:global(body) {
		margin: 0;
		font-family: "Inter", "Noto Sans Thai", sans-serif;
		background-color: #f8fafc;
		background-image: radial-gradient(
				at 0% 0%,
				hsla(210, 100%, 96%, 1) 0px,
				transparent 50%
			),
			radial-gradient(
				at 100% 0%,
				hsla(25, 100%, 95%, 1) 0px,
				transparent 50%
			),
			radial-gradient(
				at 100% 100%,
				hsla(210, 100%, 94%, 1) 0px,
				transparent 50%
			),
			radial-gradient(
				at 0% 100%,
				hsla(280, 100%, 96%, 1) 0px,
				transparent 50%
			);
		background-attachment: fixed;
		color: #1e293b;
		line-height: 1.6;
	}

	h1,
	h2,
	h3,
	.kicker {
		font-family: "Outfit", sans-serif;
	}

	.page {
		max-width: 1200px;
		margin: 0 auto;
		padding: 5rem 1.5rem;
	}

	.hero {
		text-align: center;
		margin-bottom: 5rem;
	}

	.hero h1 {
		margin: 0.75rem 0;
		font-size: clamp(2.5rem, 8vw, 4.2rem);
		font-weight: 700;
		background: linear-gradient(135deg, #0f172a 0%, #334155 100%);
		-webkit-background-clip: text;
		background-clip: text;
		-webkit-text-fill-color: transparent;
		letter-spacing: -0.04em;
	}

	.kicker {
		text-transform: uppercase;
		letter-spacing: 0.3em;
		margin: 0;
		color: #b45309;
		font-size: 0.8rem;
		font-weight: 600;
	}

	.subtitle {
		max-width: 50rem;
		margin: 1.5rem auto 0;
		color: #475569;
		font-size: 1.15rem;
	}

	.panel {
		margin-top: 2rem;
		padding: 2.5rem;
		border: 1px solid rgba(0, 0, 0, 0.05);
		border-radius: 1.5rem;
		backdrop-filter: blur(20px);
		background: rgba(255, 255, 255, 0.7);
		box-shadow: 0 10px 40px rgba(0, 0, 0, 0.05);
	}

	.row {
		display: grid;
		gap: 0.75rem;
		margin-bottom: 1.5rem;
	}

	label {
		font-size: 0.9rem;
		font-weight: 500;
		color: #64748b;
		padding-left: 0.5rem;
	}

	input,
	textarea {
		width: 100%;
		border-radius: 0.85rem;
		border: 1px solid rgba(0, 0, 0, 0.1);
		background: rgba(255, 255, 255, 0.8);
		padding: 1rem 1.25rem;
		color: #0f172a;
		font: inherit;
		transition: all 0.2s ease;
		box-sizing: border-box;
	}

	input:focus,
	textarea:focus {
		outline: none;
		border-color: #2563eb;
		background: #fff;
		box-shadow: 0 0 0 3px rgba(37, 99, 235, 0.1);
	}

	.primary {
		width: 100%;
		border: 0;
		border-radius: 0.85rem;
		background: linear-gradient(135deg, #2563eb 0%, #1d4ed8 100%);
		color: white;
		font-weight: 600;
		font-size: 1rem;
		padding: 1.1rem 1.5rem;
		cursor: pointer;
		transition: all 0.3s cubic-bezier(0.4, 0, 0.2, 1);
		box-shadow: 0 4px 12px rgba(37, 99, 235, 0.2);
	}

	.primary:hover:not(:disabled) {
		transform: translateY(-2px);
		filter: brightness(1.1);
		box-shadow: 0 8px 20px rgba(37, 99, 235, 0.3);
	}

	.notice {
		padding: 1rem 1.25rem;
		border-radius: 1rem;
		margin-top: 1.5rem;
		font-size: 0.95rem;
		display: flex;
		align-items: center;
		gap: 0.75rem;
	}

	.notice.success {
		background: rgba(22, 163, 74, 0.1);
		border: 1px solid rgba(22, 163, 74, 0.2);
		color: #166534;
	}

	.notice.error,
	.alert {
		background: rgba(220, 38, 38, 0.1);
		border: 1px solid rgba(220, 38, 38, 0.2);
		color: #991b1b;
		padding: 1rem 1.25rem;
		border-radius: 1rem;
	}

	.preview {
		display: grid;
		grid-template-columns: 320px 1fr;
		gap: 2.5rem;
	}

	.preview img {
		width: 100%;
		aspect-ratio: 16 / 9;
		object-fit: cover;
		border-radius: 1rem;
		box-shadow: 0 10px 30px rgba(0, 0, 0, 0.1);
	}

	.preview-content {
		display: flex;
		flex-direction: column;
		justify-content: center;
	}

	.preview-content h2 {
		margin: 0.75rem 0;
		font-size: 1.9rem;
		color: #0f172a;
		line-height: 1.2;
	}

	.platform {
		display: inline-block;
		padding: 0.2rem 0.75rem;
		border-radius: 2rem;
		font-size: 0.7rem;
		font-weight: 700;
		letter-spacing: 0.08em;
		background: rgba(180, 83, 9, 0.1);
		color: #92400e;
		margin-bottom: 0.5rem;
		width: fit-content;
	}

	.meta {
		color: #64748b;
		font-size: 1rem;
		margin-bottom: 1rem;
	}

	.metrics {
		display: grid;
		grid-template-columns: repeat(5, 1fr);
		gap: 1.25rem;
		margin: 2.5rem 0;
	}

	.metric-item {
		background: rgba(0, 0, 0, 0.03);
		padding: 1.25rem;
		border-radius: 1rem;
		border: 1px solid rgba(0, 0, 0, 0.05);
	}

	.metric-item label {
		margin: 0 0 0.5rem;
		display: block;
		font-size: 0.8rem;
		color: #64748b;
	}

	.metric-item input {
		padding: 0.5rem;
		font-size: 1.25rem;
		font-weight: 700;
		text-align: center;
		background: transparent;
		border: none;
		color: #0f172a;
	}

	.list-head {
		display: flex;
		justify-content: space-between;
		align-items: center;
		margin-bottom: 2.5rem;
	}

	.list-head h2 {
		margin: 0;
		font-size: 2.2rem;
		color: #0f172a;
	}

	.grid {
		display: grid;
		grid-template-columns: repeat(auto-fill, minmax(350px, 1fr));
		gap: 2.5rem;
	}

	.platform-groups {
		display: grid;
		gap: 2.5rem;
	}

	.platform-group-head {
		display: flex;
		justify-content: space-between;
		align-items: center;
		margin-bottom: 1.25rem;
		padding-bottom: 0.9rem;
		border-bottom: 1px solid rgba(0, 0, 0, 0.08);
	}

	.platform-group-head h3 {
		margin: 0;
		font-size: 1.3rem;
		color: #0f172a;
	}

	.group-count {
		background: rgba(37, 99, 235, 0.1);
		color: #1d4ed8;
		padding: 0.2rem 0.7rem;
		border-radius: 1rem;
		font-size: 0.8rem;
		font-weight: 700;
	}

	.card {
		background: #fff;
		border: 1px solid rgba(0, 0, 0, 0.06);
		border-radius: 1.5rem;
		overflow: hidden;
		transition: all 0.4s cubic-bezier(0.4, 0, 0.2, 1);
		display: flex;
		flex-direction: column;
		box-shadow: 0 4px 20px rgba(0, 0, 0, 0.03);
	}

	.card:hover {
		transform: translateY(-10px);
		border-color: rgba(37, 99, 235, 0.2);
		box-shadow: 0 25px 50px -12px rgba(0, 0, 0, 0.08);
	}

	.card img {
		width: 100%;
		aspect-ratio: 16 / 9;
		object-fit: cover;
		border-bottom: 1px solid rgba(0, 0, 0, 0.06);
	}

	.card-body {
		padding: 1.75rem;
		flex-grow: 1;
		display: flex;
		flex-direction: column;
	}

	.card h3 {
		margin: 1rem 0 1rem;
		font-size: 1.35rem;
		line-height: 1.3;
		color: #0f172a;
		font-weight: 600;
	}

	.stats {
		display: grid;
		grid-template-columns: repeat(2, 1fr);
		gap: 0.85rem;
		margin: 1.25rem 0;
	}

	.stat-badge {
		background: rgba(0, 0, 0, 0.03);
		padding: 0.65rem 1rem;
		border-radius: 0.85rem;
		font-size: 0.85rem;
		color: #0f172a;
		border: 1px solid rgba(0, 0, 0, 0.03);
		display: flex;
		justify-content: space-between;
	}

	.stat-badge span:first-child {
		color: #64748b;
		font-weight: 500;
	}

	.link {
		font-size: 0.85rem;
		margin-top: auto;
		padding-top: 1.25rem;
		border-top: 1px solid rgba(0, 0, 0, 0.06);
	}

	.link a {
		color: #2563eb;
		text-decoration: none;
		transition: color 0.3s;
		display: block;
		overflow: hidden;
		text-overflow: ellipsis;
		white-space: nowrap;
	}

	.link a:hover {
		color: #1d4ed8;
		text-decoration: underline;
	}

	.notes {
		font-size: 0.95rem;
		color: #475569;
		margin: 0.75rem 0 1.25rem;
		display: -webkit-box;
		-webkit-line-clamp: 3;
		line-clamp: 3;
		-webkit-box-orient: vertical;
		overflow: hidden;
		line-height: 1.6;
	}

	.empty {
		color: #64748b;
		padding: 4rem;
		text-align: center;
		font-size: 1.1rem;
	}

	.text-center {
		text-align: center;
	}

	@media (max-width: 900px) {
		.preview {
			grid-template-columns: 1fr;
			gap: 1.5rem;
		}

		.metrics {
			grid-template-columns: repeat(2, 1fr);
		}

		.page {
			padding: 3rem 1rem;
		}

		.hero h1 {
			font-size: 2.8rem;
		}
	}
</style>
