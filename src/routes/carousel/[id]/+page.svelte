<script lang="ts">
	import { page } from '$app/state';
	import { onMount } from 'svelte';
	import { Badge, Button, Modal, PageHeader, Spinner, toast } from '$lib';
	import CarouselSlidePreview from '$lib/components/domain/CarouselSlidePreview.svelte';
	import {
		CAROUSEL_FONT_PRESETS,
		CAROUSEL_QUOTE_FONT_SCALE_MAX,
		CAROUSEL_QUOTE_FONT_SCALE_MIN,
		CAROUSEL_QUOTE_FONT_SCALE_STEP,
		CAROUSEL_TEXT_LETTER_SPACING_MAX_EM,
		CAROUSEL_TEXT_LETTER_SPACING_MIN_EM,
		CAROUSEL_TEXT_LETTER_SPACING_STEP_EM,
		DEFAULT_CAROUSEL_QUOTE_FONT_SCALE,
		DEFAULT_CAROUSEL_SLIDE_COUNT,
		DEFAULT_CAROUSEL_TEXT_LETTER_SPACING_EM,
		deriveCarouselProjectStatus,
		getCarouselFontPresetDefinition,
		getCarouselProjectBlockers,
		getCarouselSlideReadiness,
		INSTAGRAM_CAROUSEL_HEIGHT,
		INSTAGRAM_CAROUSEL_WIDTH,
		normalizeCarouselQuoteFontScale,
		normalizeCarouselTextLetterSpacingEm,
		normalizeHashtags,
		carouselRoleLabel,
		carouselStatusLabel
	} from '$lib/carousel';
	import { buildCarouselExportEntries, buildCarouselExportManifest, buildPostingChecklist } from '$lib/carousel-export';
	import { hasSupabaseConfig } from '$lib/supabase';
	import type {
		CarouselAsset,
		CarouselContentMode,
		CarouselProjectRow,
		CarouselProjectStatus,
		CarouselSlideRow
	} from '$lib/types';

	type ProjectResponse = CarouselProjectRow & { carousel_slides?: CarouselSlideRow[] };

	let project = $state<CarouselProjectRow | null>(null);
	let slides = $state<CarouselSlideRow[]>([]);
	let loading = $state(false);
	let generating = $state(false);
	let savingProject = $state(false);
	let updatingAccountAvatar = $state(false);
	let removingAccountAvatar = $state(false);
	let exporting = $state(false);
	let autoPickingAssets = $state(false);
	let savingSlideId = $state<string | null>(null);
	let rerollingSlideId = $state<string | null>(null);
	let selectingAssetSlideId = $state<string | null>(null);
	let uploadingAssetSlideId = $state<string | null>(null);
	let previewOpen = $state(false);
	let projectError = $state('');
	let hashtagsInput = $state('');

	const projectId = $derived(page.params.id);
	const contentMode = $derived(project?.content_mode ?? 'standard');
	const isQuoteMode = $derived(contentMode === 'quote');
	const computedStatus = $derived(deriveCarouselProjectStatus(project, slides));
	const projectBlockers = $derived(getCarouselProjectBlockers(project, slides));
	const previewBlockers = $derived(projectBlockers.slice(0, 4));
	const readyToExport = $derived(computedStatus === 'ready' || project?.status === 'exported');
	const readySlidesCount = $derived(slides.filter((slide) => getCarouselSlideReadiness(slide, contentMode).isReady).length);

	function statusVariant(status: CarouselProjectStatus | undefined): 'warning' | 'success' | 'info' | 'neutral' {
		if (status === 'ready') return 'success';
		if (status === 'exported') return 'info';
		if (status === 'draft') return 'warning';
		return 'neutral';
	}

	function normalizeProjectResponse(body: ProjectResponse) {
		project = {
			...body,
			carousel_slides: undefined,
			content_mode: normalizeContentMode(body.content_mode),
			font_preset: body.font_preset ?? 'biglot',
			text_letter_spacing_em: normalizeCarouselTextLetterSpacingEm(body.text_letter_spacing_em),
			quote_font_scale: normalizeCarouselQuoteFontScale(body.quote_font_scale),
			title: body.title ?? '',
			visual_direction: body.visual_direction ?? '',
			caption: body.caption ?? '',
			hashtags_json: body.hashtags_json ?? [],
			account_display_name: body.account_display_name ?? '',
			account_handle: normalizeAccountHandle(body.account_handle),
			account_avatar_url: body.account_avatar_url ?? '',
			account_avatar_storage_path: body.account_avatar_storage_path ?? '',
			account_is_verified: Boolean(body.account_is_verified)
		};
		slides = (body.carousel_slides ?? [])
			.map((slide) => ({
				...slide,
				headline: slide.headline ?? '',
				body: slide.body ?? '',
				cta: slide.cta ?? '',
				visual_brief: slide.visual_brief ?? '',
				freepik_query: slide.freepik_query ?? '',
				candidate_assets_json: slide.candidate_assets_json ?? []
			}))
			.sort((a, b) => a.position - b.position);
		hashtagsInput = (body.hashtags_json ?? []).join(' ');
	}

	function formatTimestamp(value: string | null): string {
		if (!value) return 'ยังไม่มี';
		return new Date(value).toLocaleString('th-TH', {
			dateStyle: 'medium',
			timeStyle: 'short'
		});
	}

	function previewAssetForSlide(slide: CarouselSlideRow): string | null {
		if (project?.content_mode === 'quote' && slide.role !== 'cta') return null;
		return slide.selected_asset_json?.storage_url ?? slide.candidate_assets_json?.[0]?.preview_url ?? null;
	}

	function parseHashtagsInput(value: string): string[] {
		return normalizeHashtags(value.split(/[\s,\n]+/g));
	}

	function slideReadiness(slide: CarouselSlideRow) {
		return getCarouselSlideReadiness(slide, contentMode);
	}

	const selectedFontPreset = $derived(getCarouselFontPresetDefinition(project?.font_preset ?? 'biglot'));
	const selectedLetterSpacingLabel = $derived(
		`${normalizeCarouselTextLetterSpacingEm(project?.text_letter_spacing_em ?? DEFAULT_CAROUSEL_TEXT_LETTER_SPACING_EM).toFixed(2)}em`
	);
	const selectedQuoteFontScaleLabel = $derived(
		`${normalizeCarouselQuoteFontScale(project?.quote_font_scale ?? DEFAULT_CAROUSEL_QUOTE_FONT_SCALE).toFixed(2)}x`
	);

	function normalizeContentMode(value: unknown): CarouselContentMode {
		return value === 'quote' ? 'quote' : 'standard';
	}

	function normalizeAccountHandle(value: unknown): string {
		if (typeof value !== 'string') return '';
		return value.trim().replace(/^@+/, '').replace(/\s+/g, '');
	}

	function formatAccountHandle(value: string | null | undefined): string {
		const normalized = normalizeAccountHandle(value);
		return normalized ? `@${normalized}` : '';
	}

	function getAccountInitials(value: string | null | undefined): string {
		const cleaned = value?.trim() ?? '';
		if (!cleaned) return 'Q';
		const parts = cleaned.split(/\s+/).filter(Boolean);
		const initials = parts
			.slice(0, 2)
			.map((part) => part[0] ?? '')
			.join('')
			.trim();
		return (initials || cleaned[0] || 'Q').toUpperCase();
	}

	function isQuoteNonCtaSlide(slide: CarouselSlideRow): boolean {
		return project?.content_mode === 'quote' && slide.role !== 'cta';
	}

	function closePreview() {
		previewOpen = false;
	}

	function previewSlideLabel(slide: CarouselSlideRow): string {
		return `Slide ${slide.position} · ${carouselRoleLabel[slide.role]}`;
	}

	async function loadProject() {
		loading = true;
		projectError = '';
		try {
			const response = await fetch(`/api/openclaw/carousels/${projectId}`);
			const body = await response.json();
			if (!response.ok) {
				projectError = body.error ?? 'โหลด carousel project ไม่สำเร็จ';
				return;
			}

			normalizeProjectResponse(body as ProjectResponse);
		} catch {
			projectError = 'โหลด carousel project ไม่สำเร็จ';
		} finally {
			loading = false;
		}
	}

	async function generateDraft() {
		generating = true;
		try {
			const response = await fetch(`/api/openclaw/carousels/${projectId}/generate`, {
				method: 'POST'
			});
			const body = await response.json();
			if (!response.ok) {
				toast.error(body.error ?? 'Generate carousel ไม่สำเร็จ');
				return;
			}

			normalizeProjectResponse(body as ProjectResponse);
			toast.success('สร้าง carousel draft แล้ว');
		} catch {
			toast.error('Generate carousel ไม่สำเร็จ');
		} finally {
			generating = false;
		}
	}

	async function saveProjectMeta() {
		if (!project) return;
		savingProject = true;
		try {
			const response = await fetch(`/api/openclaw/carousels/${projectId}`, {
				method: 'PATCH',
				headers: { 'Content-Type': 'application/json' },
				body: JSON.stringify({
					content_mode: project.content_mode ?? 'standard',
					title: project.title,
					font_preset: project.font_preset,
					text_letter_spacing_em: project.text_letter_spacing_em,
					quote_font_scale: project.quote_font_scale,
					visual_direction: project.visual_direction,
					caption: project.caption,
					hashtags_json: parseHashtagsInput(hashtagsInput),
					account_display_name: project.account_display_name?.trim() || null,
					account_handle: normalizeAccountHandle(project.account_handle) || null,
					account_is_verified: Boolean(project.account_is_verified)
				})
			});
			const body = await response.json();
			if (!response.ok) {
				toast.error(body.error ?? 'บันทึก project ไม่สำเร็จ');
				return;
			}

			normalizeProjectResponse(body as ProjectResponse);
			toast.success('บันทึก project แล้ว');
		} catch {
			toast.error('บันทึก project ไม่สำเร็จ');
		} finally {
			savingProject = false;
		}
	}

	async function uploadAccountAvatar(event: Event) {
		if (!project) return;

		const input = event.currentTarget as HTMLInputElement | null;
		const file = input?.files?.[0];
		if (!file) return;

		updatingAccountAvatar = true;
		try {
			const formData = new FormData();
			formData.set('file', file);

			const response = await fetch(`/api/openclaw/carousels/${projectId}/account-avatar`, {
				method: 'POST',
				body: formData
			});
			const body = await response.json();
			if (!response.ok) {
				toast.error(body.error ?? 'อัปโหลด account avatar ไม่สำเร็จ');
				return;
			}

			await loadProject();
			toast.success('อัปโหลด account avatar แล้ว');
		} catch {
			toast.error('อัปโหลด account avatar ไม่สำเร็จ');
		} finally {
			if (input) input.value = '';
			updatingAccountAvatar = false;
		}
	}

	async function removeAccountAvatar() {
		if (!project || !project.account_avatar_url) return;

		const confirmed = window.confirm('ลบ account avatar นี้ใช่ไหม?');
		if (!confirmed) return;

		removingAccountAvatar = true;
		try {
			const response = await fetch(`/api/openclaw/carousels/${projectId}/account-avatar`, {
				method: 'DELETE'
			});
			const body = await response.json().catch(() => ({}));
			if (!response.ok) {
				toast.error(body.error ?? 'ลบ account avatar ไม่สำเร็จ');
				return;
			}

			await loadProject();
			toast.success('ลบ account avatar แล้ว');
		} catch {
			toast.error('ลบ account avatar ไม่สำเร็จ');
		} finally {
			removingAccountAvatar = false;
		}
	}

	async function saveSlide(slide: CarouselSlideRow) {
		savingSlideId = slide.id;
		try {
			const response = await fetch(`/api/openclaw/carousels/${projectId}/slides/${slide.id}`, {
				method: 'PATCH',
				headers: { 'Content-Type': 'application/json' },
				body: JSON.stringify({
					headline: slide.headline,
					body: slide.body,
					cta: slide.cta,
					visual_brief: slide.visual_brief,
					freepik_query: slide.freepik_query,
					layout_variant: slide.layout_variant
				})
			});
			const body = await response.json();
			if (!response.ok) {
				toast.error(body.error ?? 'บันทึก slide ไม่สำเร็จ');
				return;
			}

			await loadProject();
			toast.success(`บันทึก slide ${slide.position} แล้ว`);
		} catch {
			toast.error('บันทึก slide ไม่สำเร็จ');
		} finally {
			savingSlideId = null;
		}
	}

	async function rerollAssets(slide: CarouselSlideRow) {
		if (isQuoteNonCtaSlide(slide)) return;

		rerollingSlideId = slide.id;
		try {
			const response = await fetch(`/api/openclaw/carousels/${projectId}/slides/${slide.id}/search-assets`, {
				method: 'POST',
				headers: { 'Content-Type': 'application/json' },
				body: JSON.stringify({
					query: slide.freepik_query
				})
			});
			const body = await response.json();
			if (!response.ok) {
				toast.error(body.error ?? 'ค้นหา asset ไม่สำเร็จ');
				return;
			}

			await loadProject();
			toast.success(`อัปเดต candidate assets สำหรับ slide ${slide.position}`);
		} catch {
			toast.error('ค้นหา asset ไม่สำเร็จ');
		} finally {
			rerollingSlideId = null;
		}
	}

	async function selectAsset(slide: CarouselSlideRow, asset: CarouselAsset) {
		selectingAssetSlideId = slide.id;
		try {
			const response = await fetch(`/api/openclaw/carousels/${projectId}/slides/${slide.id}/select-asset`, {
				method: 'POST',
				headers: { 'Content-Type': 'application/json' },
				body: JSON.stringify({ asset })
			});
			const body = await response.json();
			if (!response.ok) {
				toast.error(body.error ?? 'เลือก asset ไม่สำเร็จ');
				return;
			}

			await loadProject();
			toast.success(`เลือก asset สำหรับ slide ${slide.position} แล้ว`);
		} catch {
			toast.error('เลือก asset ไม่สำเร็จ');
		} finally {
			selectingAssetSlideId = null;
		}
	}

	async function uploadReplacementAsset(slide: CarouselSlideRow, event: Event) {
		const input = event.currentTarget as HTMLInputElement | null;
		const file = input?.files?.[0];
		if (!file) return;

		uploadingAssetSlideId = slide.id;
		try {
			const formData = new FormData();
			formData.set('file', file);

			const response = await fetch(`/api/openclaw/carousels/${projectId}/slides/${slide.id}/upload-asset`, {
				method: 'POST',
				body: formData
			});
			const body = await response.json();
			if (!response.ok) {
				toast.error(body.error ?? 'อัปโหลดรูปไม่สำเร็จ');
				return;
			}

			await loadProject();
			toast.success(`อัปโหลดรูปใหม่สำหรับ slide ${slide.position} แล้ว`);
		} catch {
			toast.error('อัปโหลดรูปไม่สำเร็จ');
		} finally {
			if (input) input.value = '';
			uploadingAssetSlideId = null;
		}
	}

	async function autoPickMissingAssets() {
		if (!project) return;

		autoPickingAssets = true;
		let pickedCount = 0;
		const unresolvedSlides: number[] = [];

		try {
			for (const slide of slides) {
				if (isQuoteNonCtaSlide(slide)) continue;
				if (slideReadiness(slide).hasAsset) continue;

				let candidates = slide.candidate_assets_json ?? [];
				if (candidates.length === 0 && slide.freepik_query?.trim()) {
					const searchResponse = await fetch(`/api/openclaw/carousels/${projectId}/slides/${slide.id}/search-assets`, {
						method: 'POST',
						headers: { 'Content-Type': 'application/json' },
						body: JSON.stringify({ query: slide.freepik_query })
					});

					if (searchResponse.ok) {
						const searchBody = await searchResponse.json();
						candidates = Array.isArray(searchBody.slide?.candidate_assets_json) ? searchBody.slide.candidate_assets_json : [];
					}
				}

				const firstAsset = candidates[0];
				if (!firstAsset) {
					unresolvedSlides.push(slide.position);
					continue;
				}

				const selectResponse = await fetch(`/api/openclaw/carousels/${projectId}/slides/${slide.id}/select-asset`, {
					method: 'POST',
					headers: { 'Content-Type': 'application/json' },
					body: JSON.stringify({ asset: firstAsset })
				});

				if (selectResponse.ok) {
					pickedCount += 1;
				} else {
					unresolvedSlides.push(slide.position);
				}
			}

			await loadProject();

			if (pickedCount > 0 && unresolvedSlides.length === 0) {
				toast.success(`Auto-picked assets ให้ครบ ${pickedCount} slides แล้ว`);
				return;
			}

			if (pickedCount > 0) {
				toast.success(`Auto-picked assets ให้ ${pickedCount} slides แล้ว แต่ยังเหลือ slide ${unresolvedSlides.join(', ')}`);
				return;
			}

			if (unresolvedSlides.length === 0) {
				toast.success('ไม่มี slide ที่ต้อง auto-pick asset เพิ่ม');
				return;
			}

			toast.error('ยัง auto-pick asset ไม่ได้ ลองกด Reroll Assets หรือเลือกเอง');
		} catch {
			toast.error('Auto-pick assets ไม่สำเร็จ');
		} finally {
			autoPickingAssets = false;
		}
	}

	async function exportPackage() {
		if (!project) return;
		if (!readyToExport) {
			toast.error(projectBlockers[0] ?? 'ยัง export ไม่ได้');
			return;
		}

		exporting = true;
		try {
			const [{ toBlob }, { default: JSZip }] = await Promise.all([
				import('html-to-image'),
				import('jszip')
			]);

			const exportProject = {
				...project,
				hashtags_json: parseHashtagsInput(hashtagsInput)
			};

			const zip = new JSZip();
			const entries = buildCarouselExportEntries(slides);
			for (const entry of entries) {
				const node = document.querySelector<HTMLElement>(`[data-export-slide-id="${entry.slideId}"]`);
				if (!node) {
					throw new Error(`Missing DOM node for slide ${entry.position}`);
				}

				const blob = await toBlob(node, {
					backgroundColor: '#0f172a',
					canvasWidth: INSTAGRAM_CAROUSEL_WIDTH,
					canvasHeight: INSTAGRAM_CAROUSEL_HEIGHT,
					pixelRatio: 1,
					cacheBust: true,
					skipFonts: true
				});

				if (!blob) {
					throw new Error(`Failed to export slide ${entry.position}`);
				}
				zip.file(entry.filename, blob);
			}

			const exportedAt = new Date().toISOString();
			zip.file('caption.txt', exportProject.caption ?? '');
			zip.file('hashtags.txt', exportProject.hashtags_json.join(' '));
			zip.file('manifest.json', JSON.stringify(buildCarouselExportManifest(exportProject, slides, exportedAt), null, 2));
			zip.file('posting-checklist.txt', buildPostingChecklist(exportProject, slides));

			const blob = await zip.generateAsync({ type: 'blob' });
			const url = URL.createObjectURL(blob);
			const link = document.createElement('a');
			link.href = url;
			link.download = `carousel-${project.id.slice(0, 8)}.zip`;
			document.body.appendChild(link);
			link.click();
			link.remove();
			URL.revokeObjectURL(url);

			const response = await fetch(`/api/openclaw/carousels/${projectId}`, {
				method: 'PATCH',
				headers: { 'Content-Type': 'application/json' },
				body: JSON.stringify({
					status: 'exported',
					last_exported_at: exportedAt
				})
			});
			const body = await response.json();
			if (response.ok) {
				normalizeProjectResponse(body as ProjectResponse);
			}

			toast.success('Export package พร้อมดาวน์โหลดแล้ว');
		} catch (error) {
			toast.error(error instanceof Error ? error.message : 'Export package ไม่สำเร็จ');
		} finally {
			exporting = false;
		}
	}

	onMount(async () => {
		await loadProject();
	});
</script>

<main class="page">
		<PageHeader
		eyebrow="Carousel Studio"
		title={project?.title ?? 'Carousel project'}
		subtitle={
			isQuoteMode
				? 'ออกแบบ quote-first carousel พร้อม account header, avatar workflow และ export package'
				: 'ออกแบบ copy, ค้น asset ด้วย Pexels, แล้ว export เป็นชุดไฟล์พร้อมโพสต์บน Instagram'
		}
	>
		{#snippet actions()}
			<Button variant="secondary" href="/carousel">All Projects</Button>
			<Button variant="ai" onclick={generateDraft} loading={generating} disabled={!hasSupabaseConfig}>
				{generating ? 'Generating...' : slides.length > 0 ? 'Regenerate Draft' : 'Generate Draft'}
			</Button>
			<Button variant="secondary" onclick={() => { previewOpen = true; }} disabled={slides.length === 0}>
				Preview
			</Button>
			<Button variant="primary" onclick={exportPackage} loading={exporting} disabled={!readyToExport}>
				{exporting ? 'Exporting...' : 'Export Package'}
			</Button>
		{/snippet}
	</PageHeader>

	{#if !hasSupabaseConfig}
		<p class="alert">ตั้งค่า env ก่อนใช้งาน: <code>PUBLIC_SUPABASE_URL</code> และ <code>PUBLIC_SUPABASE_ANON_KEY</code></p>
	{:else if loading}
		<div class="loading-state">
			<Spinner label="Loading carousel studio..." />
		</div>
	{:else if projectError}
		<div class="error-card">
			<h2>โหลด project ไม่สำเร็จ</h2>
			<p>{projectError}</p>
			<Button variant="primary" onclick={() => { void loadProject(); }}>Try Again</Button>
		</div>
	{:else if project}
			<section class="studio-hero">
			<div class="studio-title-block">
				<div class="hero-badges">
					<Badge variant={statusVariant(project.status)} label={carouselStatusLabel[project.status]} />
					<Badge variant="platform" value="instagram" />
					<Badge variant="neutral" label={isQuoteMode ? 'Quote Mode' : 'Standard Mode'} />
					<Badge variant="neutral" label={`${slides.length || DEFAULT_CAROUSEL_SLIDE_COUNT} slides`} />
				</div>
				<h2>{project.title ?? 'Untitled carousel'}</h2>
				<p>{project.caption?.trim() || project.visual_direction?.trim() || 'ยังไม่มี caption หรือ visual direction'}</p>
			</div>

			<div class="studio-metrics">
				<div class="metric-card">
					<span>Last generated</span>
					<strong>{formatTimestamp(project.last_generated_at)}</strong>
				</div>
				<div class="metric-card">
					<span>Last exported</span>
					<strong>{formatTimestamp(project.last_exported_at)}</strong>
				</div>
			</div>
			</section>

			{#if projectBlockers.length > 0}
				<section class="blocker-card">
					<div class="blocker-copy">
						<p class="panel-kicker">Export blockers</p>
						<h3>ยัง export ไม่ได้</h3>
						<p>
							{#if isQuoteMode}
								Quote mode พร้อมแล้ว {readySlidesCount}/{slides.length} slides แต่ยังต้องเติม account header หรือเคลียร์ blocker ด้านล่างก่อน
							{:else}
								ตอนนี้พร้อมแล้ว {readySlidesCount}/{slides.length} slides ต้องเคลียร์รายการด้านล่างให้ครบก่อน
							{/if}
						</p>
					</div>
					<div class="blocker-actions">
						<Button
							variant="secondary"
							onclick={autoPickMissingAssets}
							loading={autoPickingAssets}
							disabled={slides.length === 0}
						>
							{autoPickingAssets ? 'Auto-picking...' : 'Auto-pick missing assets'}
						</Button>
					</div>
					<ul class="blocker-list">
						{#each projectBlockers as blocker}
							<li>{blocker}</li>
						{/each}
					</ul>
				</section>
			{:else}
				<section class="blocker-card blocker-card--ready">
					<div class="blocker-copy">
						<p class="panel-kicker">Export ready</p>
						<h3>พร้อม export แล้ว</h3>
						<p>
							{isQuoteMode
								? 'quote slides พร้อม copy และ CTA slide มี asset ครบ รวมถึง account header พร้อม export แล้ว'
								: 'ทุก slide มี copy และ asset ครบ สามารถกด Export Package ได้ทันที'}
						</p>
					</div>
				</section>
			{/if}

			<div class="studio-grid">
				<section class="meta-panel">
				<div class="panel-headline">
					<div>
						<p class="panel-kicker">Project meta</p>
						<h3>Caption package</h3>
					</div>
					<Button variant="secondary" onclick={saveProjectMeta} loading={savingProject}>Save Meta</Button>
				</div>

				<label>
					<span>Content mode</span>
					<select bind:value={project.content_mode}>
						<option value="standard">standard</option>
						<option value="quote">quote</option>
					</select>
					<small>Quote mode uses a text-first layout with an account header on every non-CTA slide.</small>
				</label>

				<label>
					<span>Carousel title</span>
					<input bind:value={project.title} placeholder="ชื่อ carousel" />
				</label>

				<label>
					<span>Font preset</span>
					<select bind:value={project.font_preset}>
						{#each CAROUSEL_FONT_PRESETS as preset}
							<option value={preset.value}>{preset.label} · {preset.description}</option>
						{/each}
					</select>
				</label>

				<div class="font-preview-card">
					<p class="context-label">Active font</p>
					<strong
						style:font-family={selectedFontPreset.headingFont}
						style:letter-spacing={selectedLetterSpacingLabel}
					>
						{selectedFontPreset.label}
					</strong>
					<p
						style:font-family={selectedFontPreset.bodyFont}
						style:letter-spacing={selectedLetterSpacingLabel}
					>
						{selectedFontPreset.description}
					</p>
				</div>

				<label>
					<span>Letter spacing</span>
					<div class="letter-spacing-field">
						<input
							type="range"
							min={CAROUSEL_TEXT_LETTER_SPACING_MIN_EM}
							max={CAROUSEL_TEXT_LETTER_SPACING_MAX_EM}
							step={CAROUSEL_TEXT_LETTER_SPACING_STEP_EM}
							bind:value={project.text_letter_spacing_em}
						/>
						<div class="letter-spacing-input">
							<input
								type="number"
								min={CAROUSEL_TEXT_LETTER_SPACING_MIN_EM}
								max={CAROUSEL_TEXT_LETTER_SPACING_MAX_EM}
								step={CAROUSEL_TEXT_LETTER_SPACING_STEP_EM}
								bind:value={project.text_letter_spacing_em}
							/>
							<span>em</span>
						</div>
					</div>
					<small>ค่าลบทำให้ตัวอักษรชิดขึ้น ค่าบวกทำให้ช่องไฟกว้างขึ้น</small>
				</label>

				{#if isQuoteMode}
					<label>
						<span>Quote font size</span>
						<div class="letter-spacing-field">
							<input
								type="range"
								min={CAROUSEL_QUOTE_FONT_SCALE_MIN}
								max={CAROUSEL_QUOTE_FONT_SCALE_MAX}
								step={CAROUSEL_QUOTE_FONT_SCALE_STEP}
								bind:value={project.quote_font_scale}
							/>
							<div class="letter-spacing-input">
								<input
									type="number"
									min={CAROUSEL_QUOTE_FONT_SCALE_MIN}
									max={CAROUSEL_QUOTE_FONT_SCALE_MAX}
									step={CAROUSEL_QUOTE_FONT_SCALE_STEP}
									bind:value={project.quote_font_scale}
								/>
								<span>x</span>
							</div>
						</div>
						<small>ปรับขนาดชื่อ account, handle และข้อความคำคมใน Quote Mode ตอนนี้: {selectedQuoteFontScaleLabel}</small>
					</label>
				{/if}

				<label>
					<span>Visual direction</span>
					<textarea bind:value={project.visual_direction} rows={4} placeholder="กำหนด mood, color, framing, text overlay direction"></textarea>
				</label>

				<label>
					<span>Caption</span>
					<textarea bind:value={project.caption} rows={7} placeholder="Caption พร้อมโพสต์จริง"></textarea>
				</label>

				<label>
					<span>Hashtags</span>
					<textarea bind:value={hashtagsInput} rows={3} placeholder="#xauusd #biglot #tradingtips"></textarea>
				</label>

				{#if isQuoteMode}
					<section class="account-panel">
						<div class="panel-headline">
							<div>
								<p class="panel-kicker">Account header</p>
								<h3>Quote identity</h3>
							</div>
							<span class="account-panel-note">Shown on every non-CTA slide</span>
						</div>

						<div class="account-card">
							<div class="account-avatar">
								{#if project.account_avatar_url}
									<img src={project.account_avatar_url} alt={project.account_display_name?.trim() || 'Account avatar'} loading="lazy" />
								{:else}
									<span>{getAccountInitials(project.account_display_name)}</span>
								{/if}
							</div>

							<div class="account-fields">
								<label>
									<span>Account display name</span>
									<input bind:value={project.account_display_name} placeholder="BigLot Trader" />
								</label>

								<label>
									<span>Account handle</span>
									<input bind:value={project.account_handle} placeholder="biglot.ai" />
									<small>
										พิมพ์ได้ทั้งแบบมีหรือไม่มี `@` ระบบจะเก็บแบบไม่มี `@`
										{#if formatAccountHandle(project.account_handle)}
											Current: {formatAccountHandle(project.account_handle)}
										{/if}
									</small>
								</label>

								<label class="verified-toggle">
									<input type="checkbox" bind:checked={project.account_is_verified} />
									<span>Show verified badge</span>
								</label>
							</div>

							<div class="account-actions">
								<label class="account-upload-button" class:loading={updatingAccountAvatar}>
									<input
										type="file"
										accept="image/jpeg,image/png,image/webp"
										onchange={(event) => {
											void uploadAccountAvatar(event);
										}}
										disabled={updatingAccountAvatar}
									/>
									<span>{updatingAccountAvatar ? 'Uploading...' : project.account_avatar_url ? 'Replace avatar' : 'Upload avatar'}</span>
								</label>

								<Button
									variant="secondary"
									size="sm"
									onclick={removeAccountAvatar}
									disabled={!project.account_avatar_url || removingAccountAvatar}
								>
									{removingAccountAvatar ? 'Removing...' : 'Remove avatar'}
								</Button>
							</div>
						</div>
					</section>
				{/if}
			</section>

			<aside class="context-panel">
				<div class="panel-headline">
					<div>
						<p class="panel-kicker">Project context</p>
						<h3>Studio status</h3>
					</div>
				</div>

				<div class="context-card">
					<p class="context-label">Project ref</p>
					<strong>{project.id.slice(0, 8)}</strong>
				</div>
				<div class="context-card">
					<p class="context-label">Visual direction</p>
					<p>{project.visual_direction?.trim() || 'ยังไม่มี visual direction'}</p>
				</div>
				<div class="context-card">
					<p class="context-label">Readiness</p>
					<p>
						{isQuoteMode
							? 'Quote projects ต้องมี account name + avatar, quote slides ต้องมี copy และ CTA slide ต้องมี asset ก่อน export'
							: 'Ready จะเกิดเมื่อทุก slide มี copy ครบ และมี asset ที่ cache เข้า Storage แล้ว'}
					</p>
				</div>
			</aside>
		</div>

		<section class="slides-panel">
			<div class="panel-headline">
				<div>
					<p class="panel-kicker">Slides</p>
					<h3>Storyboard + asset picker</h3>
				</div>
			</div>

			{#if slides.length === 0}
				<div class="empty-card">
					<h4>ยังไม่มี slide draft</h4>
					<p>
						{isQuoteMode
							? 'กด Generate Draft เพื่อให้ AI สร้าง quote-first storyboard แบบ 5 quote slides + 1 CTA'
							: 'กด Generate Draft เพื่อให้ AI สร้างโครง carousel และค้น candidate asset จาก Pexels'}
					</p>
				</div>
			{:else}
				<div class="slide-list">
					{#each slides as slide}
						<article class="slide-row">
							<div class="slide-preview-col">
								<CarouselSlidePreview
									slide={slide}
									fontPreset={project.font_preset}
									textLetterSpacingEm={project.text_letter_spacing_em}
									fallbackAssetUrl={previewAssetForSlide(slide)}
									contentMode={contentMode}
									quoteFontScale={project.quote_font_scale}
									accountDisplayName={project.account_display_name}
									accountHandle={project.account_handle}
									accountAvatarUrl={project.account_avatar_url}
									accountIsVerified={project.account_is_verified}
									exportId={slide.id}
								/>
							</div>

							<div class="slide-editor-col">
								<div class="slide-topline">
									<div>
										<p class="slide-kicker">Slide {slide.position}</p>
										<h4>{slide.role}</h4>
										<div class="slide-state-row">
											{#if slideReadiness(slide).isReady}
												<span class="slide-state slide-state--ready">Ready</span>
											{:else}
												{#if !isQuoteNonCtaSlide(slide) && !slideReadiness(slide).hasAsset}
													<span class="slide-state slide-state--warn">Missing asset</span>
												{/if}
												{#if !slideReadiness(slide).hasCopy}
													<span class="slide-state slide-state--muted">Incomplete copy</span>
												{/if}
											{/if}
										</div>
									</div>
									<Button
										variant="secondary"
										size="sm"
										onclick={() => { void saveSlide(slide); }}
										loading={savingSlideId === slide.id}
									>
										Save Slide
									</Button>
								</div>

								<div class="field-grid" class:field-grid--headline-only={isQuoteNonCtaSlide(slide)}>
									<label>
										<span>Headline</span>
										<textarea bind:value={slide.headline} rows={3} placeholder="ข้อความหลักบน slide"></textarea>
									</label>

									{#if !isQuoteNonCtaSlide(slide)}
										<label>
											<span>Layout</span>
											<select bind:value={slide.layout_variant}>
												<option value="cover">cover</option>
												<option value="content">content</option>
												<option value="cta">cta</option>
											</select>
										</label>
									{/if}
								</div>

								{#if isQuoteNonCtaSlide(slide)}
									<div class="quote-mode-note">
										<strong>Quote Mode</strong>
										<span>สไลด์นี้จะใช้ headline เป็นข้อความหลักและไม่ต้องมี body copy, Pexels query, asset picker หรือ layout selector</span>
									</div>
								{/if}

								{#if slide.role === 'cta'}
									<label>
										<span>CTA</span>
										<textarea bind:value={slide.cta} rows={2} placeholder="ข้อความปิดท้าย"></textarea>
									</label>
								{:else if !isQuoteNonCtaSlide(slide)}
									<label>
										<span>Body copy</span>
										<textarea bind:value={slide.body} rows={4} placeholder="ข้อความเสริมของ slide"></textarea>
									</label>
								{/if}

								<label>
									<span>Visual brief</span>
									<textarea bind:value={slide.visual_brief} rows={3} placeholder="Mood, subject, composition, text overlay direction"></textarea>
								</label>

								{#if !isQuoteNonCtaSlide(slide)}
									<div class="field-grid field-grid--query">
										<label>
											<span>Pexels query</span>
											<input bind:value={slide.freepik_query} placeholder="english pexels photo query" />
										</label>
										<Button
											variant="ghost"
											size="sm"
											onclick={() => { void rerollAssets(slide); }}
											loading={rerollingSlideId === slide.id}
										>
											Reroll Assets
										</Button>
									</div>

									<div class="asset-grid">
										<div class="asset-toolbar">
											<div class="asset-toolbar-copy">
												<strong>ไม่ชอบรูปนี้?</strong>
												<span>อัปโหลดภาพจากเครื่องเพื่อใช้แทน asset เดิมของ slide นี้ได้ทันที</span>
											</div>
											<label class="asset-upload-button" class:loading={uploadingAssetSlideId === slide.id}>
												<input
													type="file"
													accept="image/jpeg,image/png,image/webp,image/gif,image/avif"
													onchange={(event) => {
														void uploadReplacementAsset(slide, event);
													}}
													disabled={uploadingAssetSlideId === slide.id}
												/>
												<span>{uploadingAssetSlideId === slide.id ? 'Uploading...' : 'Upload New Image'}</span>
											</label>
										</div>
										{#if !slideReadiness(slide).hasAsset}
											<div class="asset-warning">
												<strong>ยังไม่ได้เลือก asset สำหรับ slide นี้</strong>
												<span>กดเลือกรูปด้านล่าง หรือใช้ Auto-pick missing assets เพื่อเติมให้เร็วขึ้น</span>
											</div>
										{/if}
										{#if slide.candidate_assets_json && slide.candidate_assets_json.length > 0}
											{#each slide.candidate_assets_json as asset}
												<button
													type="button"
													class="asset-card"
													class:selected={slide.selected_asset_json?.id === asset.id}
													onclick={() => { void selectAsset(slide, asset); }}
													disabled={selectingAssetSlideId === slide.id || uploadingAssetSlideId === slide.id}
												>
													{#if asset.preview_url}
														<img src={asset.preview_url} alt={asset.title} loading="lazy" />
													{/if}
													<div class="asset-copy">
														<strong>{asset.title}</strong>
														<span>{asset.author_name ?? (asset.source_query === 'uploaded' ? 'Uploaded image' : 'Pexels asset')}</span>
													</div>
												</button>
											{/each}
										{:else}
											<div class="asset-empty">
												<p>ยังไม่มี candidate assets</p>
												<span>กด Reroll Assets หลังจากแก้ Pexels query</span>
											</div>
										{/if}
									</div>
								{/if}
							</div>
						</article>
					{/each}
				</div>
			{/if}
		</section>
	{/if}
</main>

{#if project && slides.length > 0}
	<Modal bind:open={previewOpen} title="Carousel Preview" size="full" onclose={closePreview}>
		<div class="preview-modal">
			<section class="preview-modal-hero">
				<div class="preview-modal-copy">
					<div class="preview-modal-badges">
						<Badge variant={statusVariant(project.status)} label={carouselStatusLabel[project.status]} />
						<Badge variant="platform" value="instagram" />
						<Badge variant="neutral" label={isQuoteMode ? 'Quote Mode' : 'Standard Mode'} />
						<Badge variant="neutral" label={`${slides.length} slides`} />
					</div>
					<h3>{project.title ?? 'Untitled carousel'}</h3>
					<p>
						{project.caption?.trim() ||
							project.visual_direction?.trim() ||
							'ตรวจลำดับสไลด์ งานภาพ และข้อความก่อน export package'}
					</p>
				</div>

				<div class="preview-modal-stats">
					<div class="preview-stat-card">
						<span>Status</span>
						<strong>{carouselStatusLabel[computedStatus]}</strong>
					</div>
					<div class="preview-stat-card">
						<span>Ready slides</span>
						<strong>{readySlidesCount}/{slides.length}</strong>
					</div>
				</div>
			</section>

			{#if projectBlockers.length > 0}
				<section class="preview-modal-blockers">
					<div class="preview-modal-blockers-copy">
						<strong>Export blockers</strong>
						<span>ยังเปิด preview ได้ แต่ export จะถูกล็อกจนกว่าจะแก้ blocker ให้ครบ</span>
					</div>
					<ul>
						{#each previewBlockers as blocker}
							<li>{blocker}</li>
						{/each}
						{#if projectBlockers.length > previewBlockers.length}
							<li>และอีก {projectBlockers.length - previewBlockers.length} blocker</li>
						{/if}
					</ul>
				</section>
			{:else}
				<section class="preview-modal-blockers preview-modal-blockers--ready">
					<div class="preview-modal-blockers-copy">
						<strong>พร้อม export แล้ว</strong>
						<span>ทุกสไลด์ผ่าน readiness check และใช้ export flow เดิมได้ทันที</span>
					</div>
				</section>
			{/if}

			<div class="preview-modal-grid">
				{#each slides as slide}
					<article class="preview-modal-slide">
						<div class="preview-modal-slide-top">
							<div class="preview-modal-slide-copy">
								<span>{previewSlideLabel(slide)}</span>
								<strong>{slide.headline?.trim() || 'Untitled slide'}</strong>
							</div>
							<span class:preview-slide-state--ready={slideReadiness(slide).isReady} class="preview-slide-state">
								{slideReadiness(slide).isReady ? 'Ready' : 'Draft'}
							</span>
						</div>

						<CarouselSlidePreview
							slide={slide}
							fontPreset={project.font_preset}
							textLetterSpacingEm={project.text_letter_spacing_em}
							fallbackAssetUrl={previewAssetForSlide(slide)}
							contentMode={contentMode}
							accountDisplayName={project.account_display_name}
							accountHandle={project.account_handle}
							accountAvatarUrl={project.account_avatar_url}
							accountIsVerified={project.account_is_verified}
							quoteFontScale={project.quote_font_scale}
							exportId={null}
						/>
					</article>
				{/each}
			</div>
		</div>

		{#snippet footer()}
			<Button variant="secondary" onclick={closePreview}>Close</Button>
			<Button variant="primary" onclick={exportPackage} loading={exporting} disabled={!readyToExport}>
				{exporting ? 'Exporting...' : 'Export Package'}
			</Button>
		{/snippet}
	</Modal>
{/if}

<style>
	.page {
		display: grid;
		gap: var(--space-6);
	}

	.alert,
	.error-card,
	.empty-card {
		padding: var(--space-5);
		border-radius: 1.35rem;
		border: 1px solid var(--color-border);
		background: var(--color-bg-elevated);
	}

	.alert {
		background: var(--color-red-50);
		color: var(--color-red-700);
		border-color: rgba(220, 38, 38, 0.14);
	}

	.blocker-card {
		display: grid;
		gap: var(--space-4);
		padding: var(--space-5);
		border-radius: 1.35rem;
		border: 1px solid rgba(234, 88, 12, 0.18);
		background:
			radial-gradient(circle at top left, rgba(249, 115, 22, 0.12), transparent 30%),
			linear-gradient(180deg, rgba(255, 247, 237, 0.94), rgba(255, 255, 255, 1));
	}

	.blocker-card--ready {
		border-color: rgba(22, 163, 74, 0.16);
		background:
			radial-gradient(circle at top left, rgba(34, 197, 94, 0.12), transparent 30%),
			linear-gradient(180deg, rgba(240, 253, 244, 0.94), rgba(255, 255, 255, 1));
	}

	.blocker-copy {
		display: grid;
		gap: 0.4rem;
	}

	.blocker-copy h3,
	.blocker-copy p {
		margin: 0;
	}

	.blocker-copy h3 {
		font-family: var(--font-heading);
		font-size: 1.2rem;
	}

	.blocker-copy p {
		color: var(--color-slate-600);
		line-height: 1.55;
	}

	.blocker-actions {
		display: flex;
		flex-wrap: wrap;
		gap: var(--space-2);
	}

	.blocker-list {
		margin: 0;
		padding-left: 1.1rem;
		display: grid;
		gap: 0.42rem;
		color: var(--color-slate-700);
	}

	.error-card h2,
	.empty-card h4,
	.panel-headline h3,
	.slide-topline h4,
	.studio-title-block h2 {
		margin: 0;
		font-family: var(--font-heading);
	}

	.error-card,
	.loading-state {
		display: grid;
		justify-items: start;
		gap: var(--space-3);
	}

	.studio-hero {
		display: grid;
		grid-template-columns: minmax(0, 1.35fr) minmax(280px, 0.8fr);
		gap: var(--space-5);
		padding: var(--space-6);
		border-radius: 1.75rem;
		background:
			radial-gradient(circle at top left, rgba(245, 158, 11, 0.2), transparent 36%),
			radial-gradient(circle at right center, rgba(29, 78, 216, 0.18), transparent 33%),
			linear-gradient(150deg, #0f172a 0%, #1e40af 54%, #431407 100%);
		color: #fff;
	}

	.studio-title-block {
		display: grid;
		gap: var(--space-3);
	}

	.hero-badges {
		display: flex;
		flex-wrap: wrap;
		gap: var(--space-2);
	}

	.studio-title-block h2 {
		font-size: clamp(1.8rem, 4vw, 2.7rem);
		line-height: 1.05;
		max-width: 14ch;
	}

	.studio-title-block p,
	.context-card p {
		margin: 0;
		line-height: 1.6;
	}

	.studio-metrics {
		display: grid;
		gap: var(--space-3);
		align-content: start;
	}

	.metric-card {
		display: grid;
		gap: 0.4rem;
		padding: var(--space-4);
		border-radius: 1.2rem;
		background: rgba(255, 255, 255, 0.12);
		border: 1px solid rgba(255, 255, 255, 0.12);
		backdrop-filter: blur(12px);
	}

	.metric-card span {
		font-size: 0.74rem;
		text-transform: uppercase;
		letter-spacing: 0.12em;
		color: rgba(255, 255, 255, 0.7);
	}

	.metric-card strong {
		font-size: 1rem;
	}

	.studio-grid {
		display: grid;
		grid-template-columns: minmax(0, 1.2fr) minmax(280px, 0.8fr);
		gap: var(--space-5);
		align-items: start;
	}

	.meta-panel,
	.context-panel,
	.slides-panel {
		display: grid;
		gap: var(--space-4);
		padding: var(--space-5);
		border-radius: 1.45rem;
		background: var(--color-bg-elevated);
		border: 1px solid var(--color-border);
		box-shadow: var(--shadow-sm);
	}

	.panel-headline {
		display: flex;
		align-items: flex-start;
		justify-content: space-between;
		gap: var(--space-3);
		flex-wrap: wrap;
	}

	.panel-kicker,
	.slide-kicker,
	label span,
	.context-label {
		display: block;
		font-size: 0.76rem;
		font-weight: 800;
		text-transform: uppercase;
		letter-spacing: 0.12em;
		color: var(--color-slate-500);
	}

	label {
		display: grid;
		gap: 0.45rem;
	}

	small {
		font-size: 0.74rem;
		line-height: 1.5;
		color: var(--color-slate-500);
	}

	input,
	textarea,
	select {
		width: 100%;
		box-sizing: border-box;
		padding: 0.82rem 0.95rem;
		border-radius: 0.95rem;
		border: 1px solid var(--color-border-strong);
		background: var(--color-bg-elevated);
		font: inherit;
		color: var(--color-slate-900);
	}

	.context-panel {
		align-content: start;
	}

	.context-card {
		display: grid;
		gap: 0.35rem;
		padding: 1rem;
		border-radius: 1rem;
		background: var(--color-slate-50);
		border: 1px solid var(--color-border);
	}

	.context-card strong {
		font-size: 1rem;
		color: var(--color-slate-900);
	}

	.font-preview-card {
		display: grid;
		gap: 0.3rem;
		padding: 0.95rem 1rem;
		border-radius: 1rem;
		background: var(--color-slate-50);
		border: 1px solid var(--color-border);
	}

	.font-preview-card strong,
	.font-preview-card p {
		margin: 0;
	}

	.font-preview-card strong {
		font-size: 1.15rem;
		color: var(--color-slate-900);
	}

	.font-preview-card p {
		color: var(--color-slate-600);
		line-height: 1.5;
	}

	.account-panel {
		display: grid;
		gap: var(--space-4);
		padding: var(--space-4);
		border-radius: 1.2rem;
		background: linear-gradient(180deg, rgba(15, 23, 42, 0.03), rgba(15, 23, 42, 0.01));
		border: 1px solid rgba(15, 23, 42, 0.08);
	}

	.account-panel-note {
		font-size: 0.74rem;
		line-height: 1.35;
		color: var(--color-slate-500);
	}

	.account-card {
		display: grid;
		grid-template-columns: auto minmax(0, 1fr) auto;
		gap: var(--space-4);
		align-items: start;
		padding: var(--space-4);
		border-radius: 1rem;
		background: #fff;
		border: 1px solid var(--color-border);
		box-shadow: var(--shadow-sm);
	}

	.account-avatar {
		width: 4.5rem;
		height: 4.5rem;
		border-radius: 999px;
		overflow: hidden;
		display: grid;
		place-items: center;
		background: linear-gradient(135deg, rgba(29, 78, 216, 0.12), rgba(249, 115, 22, 0.14));
		border: 1px solid rgba(29, 78, 216, 0.16);
		color: var(--color-slate-900);
		font-family: var(--font-heading);
		font-size: 1.15rem;
		font-weight: 800;
	}

	.account-avatar img {
		width: 100%;
		height: 100%;
		object-fit: cover;
	}

	.account-fields {
		display: grid;
		gap: var(--space-3);
	}

	.account-fields small {
		margin-top: -0.15rem;
	}

	.verified-toggle {
		display: inline-flex;
		align-items: center;
		gap: 0.55rem;
		padding: 0.72rem 0.95rem;
		border-radius: 0.95rem;
		border: 1px solid var(--color-border-strong);
		background: var(--color-bg-elevated);
	}

	.verified-toggle input {
		width: 1rem;
		height: 1rem;
		margin: 0;
		accent-color: var(--color-primary);
	}

	.verified-toggle span {
		margin: 0;
		font-size: 0.82rem;
		font-weight: 700;
		color: var(--color-slate-700);
		text-transform: none;
		letter-spacing: 0;
	}

	.account-actions {
		display: grid;
		gap: 0.6rem;
		justify-items: start;
		align-content: start;
	}

	.account-upload-button {
		position: relative;
		display: inline-flex;
		align-items: center;
		justify-content: center;
		padding: 0.72rem 1rem;
		border-radius: 999px;
		background: var(--color-slate-900);
		border: 1px solid rgba(15, 23, 42, 0.1);
		color: #fff;
		font-size: 0.82rem;
		font-weight: 800;
		cursor: pointer;
	}

	.account-upload-button input {
		position: absolute;
		inset: 0;
		opacity: 0;
		cursor: pointer;
	}

	.account-upload-button.loading {
		opacity: 0.72;
		cursor: wait;
	}

	.letter-spacing-field {
		display: grid;
		grid-template-columns: minmax(0, 1fr) auto;
		gap: var(--space-3);
		align-items: center;
	}

	.letter-spacing-field input[type='range'] {
		padding: 0;
		border: none;
		background: transparent;
	}

	.letter-spacing-input {
		display: inline-flex;
		align-items: center;
		gap: 0.55rem;
		padding: 0.72rem 0.85rem;
		border-radius: 0.95rem;
		border: 1px solid var(--color-border-strong);
		background: var(--color-bg-elevated);
	}

	.letter-spacing-input input[type='number'] {
		width: 5.5rem;
		padding: 0;
		border: none;
		border-radius: 0;
	}

	.letter-spacing-input span {
		font-size: 0.82rem;
		font-weight: 700;
		color: var(--color-slate-500);
	}

	.slide-list {
		display: grid;
		gap: var(--space-5);
	}

	.preview-modal {
		display: grid;
		gap: var(--space-5);
	}

	.preview-modal-hero {
		display: grid;
		grid-template-columns: minmax(0, 1.4fr) minmax(220px, 0.8fr);
		gap: var(--space-4);
		padding: var(--space-5);
		border-radius: 1.4rem;
		background:
			radial-gradient(circle at top left, rgba(59, 130, 246, 0.16), transparent 34%),
			radial-gradient(circle at right center, rgba(249, 115, 22, 0.12), transparent 28%),
			linear-gradient(155deg, #0f172a 0%, #1d4ed8 52%, #111827 100%);
		color: #fff;
	}

	.preview-modal-copy {
		display: grid;
		gap: 0.75rem;
	}

	.preview-modal-copy h3,
	.preview-modal-copy p {
		margin: 0;
	}

	.preview-modal-copy h3 {
		font-family: var(--font-heading);
		font-size: clamp(1.6rem, 3vw, 2.2rem);
		line-height: 1.05;
		max-width: 16ch;
	}

	.preview-modal-copy p {
		line-height: 1.6;
		color: rgba(255, 255, 255, 0.82);
		max-width: 70ch;
	}

	.preview-modal-badges {
		display: flex;
		flex-wrap: wrap;
		gap: var(--space-2);
	}

	.preview-modal-stats {
		display: grid;
		gap: var(--space-3);
		align-content: start;
	}

	.preview-stat-card {
		display: grid;
		gap: 0.35rem;
		padding: 1rem 1.1rem;
		border-radius: 1rem;
		background: rgba(255, 255, 255, 0.12);
		border: 1px solid rgba(255, 255, 255, 0.12);
		backdrop-filter: blur(10px);
	}

	.preview-stat-card span {
		font-size: 0.74rem;
		text-transform: uppercase;
		letter-spacing: 0.1em;
		color: rgba(255, 255, 255, 0.68);
	}

	.preview-stat-card strong {
		font-size: 1rem;
		color: #fff;
	}

	.preview-modal-blockers {
		display: grid;
		gap: var(--space-3);
		padding: var(--space-4);
		border-radius: 1.15rem;
		background: rgba(234, 88, 12, 0.08);
		border: 1px solid rgba(234, 88, 12, 0.16);
	}

	.preview-modal-blockers--ready {
		background: rgba(22, 163, 74, 0.08);
		border-color: rgba(22, 163, 74, 0.16);
	}

	.preview-modal-blockers-copy {
		display: grid;
		gap: 0.2rem;
	}

	.preview-modal-blockers-copy strong,
	.preview-modal-blockers-copy span,
	.preview-modal-blockers li {
		margin: 0;
	}

	.preview-modal-blockers-copy strong {
		font-size: 0.92rem;
		color: var(--color-slate-900);
	}

	.preview-modal-blockers-copy span,
	.preview-modal-blockers li {
		font-size: 0.82rem;
		line-height: 1.5;
		color: var(--color-slate-600);
	}

	.preview-modal-blockers ul {
		margin: 0;
		padding-left: 1.1rem;
		display: grid;
		gap: 0.35rem;
	}

	.preview-modal-grid {
		display: grid;
		grid-template-columns: repeat(2, minmax(0, 1fr));
		gap: var(--space-4);
		align-items: start;
	}

	.preview-modal-slide {
		display: grid;
		gap: var(--space-3);
		padding: var(--space-4);
		border-radius: 1.2rem;
		background: var(--color-bg-elevated);
		border: 1px solid var(--color-border);
		box-shadow: var(--shadow-sm);
	}

	.preview-modal-slide-top {
		display: flex;
		align-items: flex-start;
		justify-content: space-between;
		gap: var(--space-3);
	}

	.preview-modal-slide-copy {
		display: grid;
		gap: 0.22rem;
	}

	.preview-modal-slide-copy span {
		font-size: 0.72rem;
		font-weight: 800;
		text-transform: uppercase;
		letter-spacing: 0.12em;
		color: var(--color-slate-500);
	}

	.preview-modal-slide-copy strong {
		font-size: 0.92rem;
		line-height: 1.45;
		color: var(--color-slate-900);
	}

	.preview-slide-state {
		display: inline-flex;
		align-items: center;
		padding: 0.32rem 0.72rem;
		border-radius: 999px;
		background: rgba(148, 163, 184, 0.14);
		color: var(--color-slate-600);
		font-size: 0.74rem;
		font-weight: 800;
		letter-spacing: 0.04em;
	}

	.preview-slide-state--ready {
		background: rgba(22, 163, 74, 0.12);
		color: var(--color-green-700);
	}

	.slide-row {
		display: grid;
		grid-template-columns: minmax(280px, 360px) minmax(0, 1fr);
		gap: var(--space-5);
		padding: var(--space-4);
		border-radius: 1.3rem;
		background: linear-gradient(180deg, rgba(248, 250, 252, 0.96), #fff);
		border: 1px solid var(--color-border);
	}

	.slide-preview-col {
		align-self: start;
	}

	.slide-editor-col {
		display: grid;
		gap: var(--space-4);
	}

	.slide-topline {
		display: flex;
		align-items: flex-start;
		justify-content: space-between;
		gap: var(--space-3);
		flex-wrap: wrap;
	}

	.slide-state-row {
		display: flex;
		flex-wrap: wrap;
		gap: 0.45rem;
		margin-top: 0.55rem;
	}

	.slide-state {
		display: inline-flex;
		align-items: center;
		padding: 0.28rem 0.65rem;
		border-radius: 999px;
		font-size: 0.74rem;
		font-weight: 800;
		letter-spacing: 0.04em;
	}

	.slide-state--ready {
		background: rgba(22, 163, 74, 0.12);
		color: var(--color-green-700);
	}

	.slide-state--warn {
		background: rgba(234, 88, 12, 0.12);
		color: var(--color-orange-600);
	}

	.slide-state--muted {
		background: rgba(148, 163, 184, 0.14);
		color: var(--color-slate-600);
	}

	.field-grid {
		display: grid;
		grid-template-columns: minmax(0, 1fr) 180px;
		gap: var(--space-3);
	}

	.field-grid--headline-only {
		grid-template-columns: minmax(0, 1fr);
	}

	.quote-mode-note {
		display: grid;
		gap: 0.2rem;
		padding: 0.85rem 1rem;
		border-radius: 0.95rem;
		background: rgba(15, 23, 42, 0.04);
		border: 1px solid rgba(15, 23, 42, 0.08);
	}

	.quote-mode-note strong,
	.quote-mode-note span {
		margin: 0;
	}

	.quote-mode-note strong {
		font-size: 0.82rem;
		color: var(--color-slate-900);
	}

	.quote-mode-note span {
		font-size: 0.75rem;
		line-height: 1.5;
		color: var(--color-slate-600);
	}

	.field-grid--query {
		grid-template-columns: minmax(0, 1fr) auto;
		align-items: end;
	}

	.asset-grid {
		display: grid;
		grid-template-columns: repeat(auto-fit, minmax(150px, 1fr));
		gap: var(--space-3);
	}

	.asset-toolbar {
		grid-column: 1 / -1;
		display: flex;
		align-items: center;
		justify-content: space-between;
		gap: var(--space-3);
		flex-wrap: wrap;
		padding: 0.9rem 1rem;
		border-radius: 1rem;
		background: rgba(29, 78, 216, 0.06);
		border: 1px solid rgba(29, 78, 216, 0.14);
	}

	.asset-toolbar-copy {
		display: grid;
		gap: 0.2rem;
	}

	.asset-toolbar-copy strong,
	.asset-toolbar-copy span {
		margin: 0;
	}

	.asset-toolbar-copy strong {
		font-size: 0.82rem;
		color: var(--color-slate-900);
	}

	.asset-toolbar-copy span {
		font-size: 0.75rem;
		line-height: 1.5;
		color: var(--color-slate-600);
	}

	.asset-upload-button {
		position: relative;
		display: inline-flex;
		align-items: center;
		justify-content: center;
		padding: 0.72rem 1rem;
		border-radius: 999px;
		background: #fff;
		border: 1px solid rgba(29, 78, 216, 0.18);
		color: var(--color-primary);
		font-size: 0.82rem;
		font-weight: 800;
		cursor: pointer;
	}

	.asset-upload-button input {
		position: absolute;
		inset: 0;
		opacity: 0;
		cursor: pointer;
	}

	.asset-upload-button.loading {
		opacity: 0.7;
		cursor: wait;
	}

	.asset-warning {
		grid-column: 1 / -1;
		display: grid;
		gap: 0.2rem;
		padding: 0.85rem 1rem;
		border-radius: 0.95rem;
		background: rgba(234, 88, 12, 0.08);
		border: 1px solid rgba(234, 88, 12, 0.16);
	}

	.asset-warning strong,
	.asset-warning span {
		margin: 0;
	}

	.asset-warning strong {
		font-size: 0.82rem;
		color: var(--color-orange-600);
	}

	.asset-warning span {
		font-size: 0.75rem;
		color: var(--color-slate-600);
		line-height: 1.5;
	}

	.asset-card,
	.asset-empty {
		display: grid;
		gap: 0.65rem;
		padding: 0.65rem;
		border-radius: 1rem;
		border: 1px solid var(--color-border);
		background: #fff;
	}

	.asset-card {
		cursor: pointer;
		text-align: left;
		transition:
			border-color var(--transition-fast),
			box-shadow var(--transition-fast),
			transform var(--transition-fast);
	}

	.asset-card:hover:not(:disabled),
	.asset-card.selected {
		border-color: rgba(29, 78, 216, 0.28);
		box-shadow: var(--shadow-sm);
		transform: translateY(-1px);
	}

	.asset-card:disabled {
		cursor: wait;
		opacity: 0.75;
	}

	.asset-card img {
		width: 100%;
		aspect-ratio: 1;
		object-fit: cover;
		border-radius: 0.8rem;
	}

	.asset-copy {
		display: grid;
		gap: 0.2rem;
	}

	.asset-copy strong {
		font-size: 0.82rem;
		line-height: 1.35;
		color: var(--color-slate-900);
	}

	.asset-copy span,
	.asset-empty span,
	.empty-card p,
	.error-card p {
		font-size: 0.76rem;
		line-height: 1.5;
		color: var(--color-slate-500);
	}

	.asset-empty {
		align-items: center;
		justify-items: center;
		text-align: center;
		padding: 1rem;
	}

	.asset-empty p {
		margin: 0;
		font-weight: 700;
		color: var(--color-slate-700);
	}

	@media (max-width: 1024px) {
		.preview-modal-hero,
		.preview-modal-grid,
		.studio-hero,
		.studio-grid,
		.slide-row {
			grid-template-columns: 1fr;
		}
	}

	@media (max-width: 720px) {
		.account-card {
			grid-template-columns: 1fr;
		}

		.account-actions {
			grid-template-columns: 1fr;
		}

		.field-grid,
		.field-grid--query,
		.letter-spacing-field {
			grid-template-columns: 1fr;
		}
	}
</style>
