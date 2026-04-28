<script lang="ts">
	import { page } from '$app/state';
	import { Badge, Button, PageHeader, Spinner, toast } from '$lib';
	import CarouselSlidePreview from '$lib/components/domain/CarouselSlidePreview.svelte';
	import {
		CAROUSEL_QUOTE_TEXT_OFFSET_MAX_PX,
		CAROUSEL_QUOTE_TEXT_OFFSET_MIN_PX,
		CAROUSEL_QUOTE_TEXT_OFFSET_STEP_PX,
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
		normalizeCarouselQuoteTextOffsetPx,
		normalizeCarouselTextLetterSpacingEm,
		normalizeHashtags,
		carouselStatusLabel
	} from '$lib/carousel';
	import { buildCarouselExportEntries, buildCarouselExportManifest, buildPostingChecklist } from '$lib/carousel-export';
	import { hasSupabaseConfig } from '$lib/supabase';
	import type { PageData } from './$types';
	import type {
		CarouselAsset,
		CarouselContentMode,
		CarouselQuoteIdentityRow,
		CarouselProjectRow,
		CarouselProjectStatus,
		CarouselReviewStatus,
		CarouselSlideRow,
		ProducedVideoRow,
		ProductionCalendarRow
	} from '$lib/types';

	type ProjectResponse = CarouselProjectRow & {
		carousel_slides?: CarouselSlideRow[];
		linked_schedule?: ProductionCalendarRow | null;
		published_record?: ProducedVideoRow | null;
	};
	type CarouselExportMode = 'full_package' | 'slides_only' | 'copy_bundle';

	const EXPORT_MODE_OPTIONS: Array<{ value: CarouselExportMode; label: string; description: string }> = [
		{
			value: 'full_package',
			label: 'Full Package',
			description: 'PNG slides + caption + hashtags + manifest + checklist'
		},
		{
			value: 'slides_only',
			label: 'Slides Only',
			description: 'Export only PNG slides as a zip'
		},
		{
			value: 'copy_bundle',
			label: 'Copy Only',
			description: 'Export caption, hashtags, and posting checklist only'
		}
	];

	const CAROUSEL_REVIEW_STATUS_LABEL: Record<CarouselReviewStatus, string> = {
		draft: 'Draft',
		pending_review: 'Pending Review',
		approved: 'Approved',
		changes_requested: 'Changes Requested'
	};

	const CAROUSEL_REVIEW_STATUS_HINT: Record<CarouselReviewStatus, string> = {
		draft: 'ยังเป็น working draft อยู่ใน Studio',
		pending_review: 'พร้อมให้หัวหน้าหรือ owner ตรวจงานก่อน publish',
		approved: 'carousel ชุดนี้ผ่าน review แล้ว พร้อมส่งต่อไป publish workflow',
		changes_requested: 'มี feedback ให้กลับไปแก้ก่อน export หรือ publish'
	};

	let { data }: { data: PageData } = $props();

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
	let regeneratingSlideId = $state<string | null>(null);
	let rerollingSlideId = $state<string | null>(null);
	let draggingSlideId = $state<string | null>(null);
	let dragOverSlideId = $state<string | null>(null);
	let reordering = $state(false);
	let undoingSlideId = $state<string | null>(null);
	let regeneratingAllSlides = $state(false);
	let regenerateAllProgress = $state<{ done: number; total: number } | null>(null);
	let selectingAssetSlideId = $state<string | null>(null);
	let uploadingAssetSlideId = $state<string | null>(null);
	let projectError = $state('');
	let hashtagsInput = $state('');
	let exportMode = $state<CarouselExportMode>('full_package');
	let quoteIdentities = $state<CarouselQuoteIdentityRow[]>([]);
	let loadingQuoteIdentities = $state(false);
	let savingQuoteIdentity = $state(false);
	let applyingQuoteIdentityId = $state<string | null>(null);
	let deletingQuoteIdentityId = $state<string | null>(null);
	let selectedQuoteIdentityId = $state('');
	let quoteIdentityName = $state('');
	let linkedSchedule = $state<ProductionCalendarRow | null>(null);
	let publishedRecord = $state<ProducedVideoRow | null>(null);
	let savingReview = $state(false);
	let publishSaving = $state(false);
	let reviewNotes = $state('');
	let reviewOwner = $state('');
	let publishUrl = $state('');
	let publishTitle = $state('');
	let publishThumbnailUrl = $state('');
	let publishAt = $state('');
	let publishNotes = $state('');
	let publishViews = $state<number | null>(null);
	let publishLikes = $state<number | null>(null);
	let publishComments = $state<number | null>(null);
	let publishShares = $state<number | null>(null);
	let publishSaves = $state<number | null>(null);
	let selectedSlideId = $state<string | null>(null);
	let initializedFromData = false;

	const projectId = $derived(page.params.id);
	const contentMode = $derived(project?.content_mode ?? 'standard');
	const isQuoteMode = $derived(contentMode === 'quote');
	const computedStatus = $derived(deriveCarouselProjectStatus(project, slides));
	const projectBlockers = $derived(getCarouselProjectBlockers(project, slides));
	const readyToExport = $derived(computedStatus === 'ready' || project?.status === 'exported');
	const readySlidesCount = $derived(slides.filter((slide) => getCarouselSlideReadiness(slide, contentMode).isReady).length);
	const selectedSlide = $derived.by(() => slides.find((slide) => slide.id === selectedSlideId) ?? slides[0] ?? null);
	const selectedSlideState = $derived(selectedSlide ? slideReadiness(selectedSlide) : null);
	const selectedExportMode = $derived(EXPORT_MODE_OPTIONS.find((option) => option.value === exportMode) ?? EXPORT_MODE_OPTIONS[0]);
	const canExportSelectedMode = $derived(exportMode === 'copy_bundle' ? Boolean(project) : readyToExport);
	const reviewStatus = $derived(project?.review_status ?? 'draft');
	const reviewStatusLabel = $derived(CAROUSEL_REVIEW_STATUS_LABEL[reviewStatus]);
	const reviewStatusHint = $derived(CAROUSEL_REVIEW_STATUS_HINT[reviewStatus]);
	const hasPublishedRecord = $derived(Boolean(publishedRecord?.id));
	const canSavePublishRecord = $derived(Boolean(linkedSchedule?.id));

	const INSTAGRAM_CAPTION_LIMIT = 2200;
	const captionCharCount = $derived((project?.caption ?? '').length);
	const hashtagsParsed = $derived(parseHashtagsInput(hashtagsInput));
	const hashtagsText = $derived(hashtagsParsed.join(' '));
	const hashtagsCharCount = $derived(hashtagsText.length);
	const combinedCharCount = $derived(captionCharCount + (hashtagsCharCount > 0 ? 1 + hashtagsCharCount : 0));
	const captionCountState = $derived(
		combinedCharCount >= INSTAGRAM_CAPTION_LIMIT ? 'over' :
		combinedCharCount >= INSTAGRAM_CAPTION_LIMIT * 0.9 ? 'warning' : 'ok'
	);

	function statusVariant(status: CarouselProjectStatus | undefined): 'warning' | 'success' | 'info' | 'neutral' {
		if (status === 'ready') return 'success';
		if (status === 'exported') return 'info';
		if (status === 'draft') return 'warning';
		return 'neutral';
	}

	function reviewStatusVariant(status: CarouselReviewStatus): 'warning' | 'success' | 'info' | 'neutral' {
		if (status === 'approved') return 'success';
		if (status === 'pending_review') return 'info';
		if (status === 'changes_requested') return 'warning';
		return 'neutral';
	}

	function isoToDateInput(value: string | null | undefined): string {
		if (!value) return '';
		return value.slice(0, 10);
	}

	function isoToDateTimeInput(value: string | null | undefined): string {
		if (!value) return '';
		return new Date(value).toISOString().slice(0, 16);
	}

	function normalizeScheduleResponse(value: ProductionCalendarRow | null | undefined): ProductionCalendarRow | null {
		if (!value) return null;
		return {
			...value,
			carousel_project_id: value.carousel_project_id ?? null,
			handoff_source: value.handoff_source ?? 'manual',
			publish_deadline: value.publish_deadline ?? null,
			revision_count: value.revision_count ?? 0,
			approval_status: value.approval_status ?? 'draft',
			submitted_at: value.submitted_at ?? null,
			notes: value.notes ?? null,
			calendar_assignments: value.calendar_assignments ?? []
		};
	}

	function normalizePublishedRecord(value: ProducedVideoRow | null | undefined): ProducedVideoRow | null {
		if (!value) return null;
		return {
			...value,
			carousel_project_id: value.carousel_project_id ?? null,
			content_kind: value.content_kind ?? 'carousel',
			title: value.title ?? null,
			thumbnail_url: value.thumbnail_url ?? null,
			published_at: value.published_at ?? null,
			view_count: value.view_count ?? null,
			like_count: value.like_count ?? null,
			comment_count: value.comment_count ?? null,
			share_count: value.share_count ?? null,
			save_count: value.save_count ?? null,
			notes: value.notes ?? null
		};
	}

	function applyScheduleDraft(value: ProductionCalendarRow | null) {
		linkedSchedule = value;
	}

	function applyPublishDraft(value: ProducedVideoRow | null) {
		publishedRecord = value;
		publishUrl = value?.url ?? '';
		publishTitle = value?.title ?? project?.title ?? '';
		publishThumbnailUrl = value?.thumbnail_url ?? '';
		publishAt = isoToDateTimeInput(value?.published_at);
		publishNotes = value?.notes ?? '';
		publishViews = value?.view_count ?? null;
		publishLikes = value?.like_count ?? null;
		publishComments = value?.comment_count ?? null;
		publishShares = value?.share_count ?? null;
		publishSaves = value?.save_count ?? null;
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
			review_status: body.review_status ?? 'draft',
			review_notes: body.review_notes ?? '',
			reviewed_by: body.reviewed_by ?? '',
			reviewed_at: body.reviewed_at ?? null,
			account_display_name: body.account_display_name ?? '',
			account_handle: normalizeAccountHandle(body.account_handle),
			account_avatar_url: body.account_avatar_url ?? '',
			account_avatar_storage_path: body.account_avatar_storage_path ?? '',
			account_is_verified: Boolean(body.account_is_verified),
			linked_schedule: undefined,
			published_record: undefined
		};
		slides = (body.carousel_slides ?? []).map(normalizeSlideResponse).sort((a, b) => a.position - b.position);
		hashtagsInput = (body.hashtags_json ?? []).join(' ');
		reviewNotes = body.review_notes ?? '';
		reviewOwner = body.reviewed_by ?? '';
		applyScheduleDraft(normalizeScheduleResponse(body.linked_schedule));
		applyPublishDraft(normalizePublishedRecord(body.published_record));
	}

	function normalizeSlideResponse(slide: CarouselSlideRow): CarouselSlideRow {
		return {
			...slide,
			headline: slide.headline ?? '',
			body: slide.body ?? '',
			cta: slide.cta ?? '',
			visual_brief: slide.visual_brief ?? '',
			freepik_query: slide.freepik_query ?? '',
			quote_font_scale_override:
				slide.quote_font_scale_override === null || slide.quote_font_scale_override === undefined
					? null
					: normalizeCarouselQuoteFontScale(slide.quote_font_scale_override),
			quote_text_offset_x_px: normalizeCarouselQuoteTextOffsetPx(slide.quote_text_offset_x_px),
			quote_text_offset_y_px: normalizeCarouselQuoteTextOffsetPx(slide.quote_text_offset_y_px),
			candidate_assets_json: slide.candidate_assets_json ?? [],
			history_json: Array.isArray(slide.history_json) ? slide.history_json : []
		};
	}

	function replaceSlide(updatedSlide: CarouselSlideRow) {
		const normalized = normalizeSlideResponse(updatedSlide);
		slides = slides
			.map((slide) => (slide.id === normalized.id ? normalized : slide))
			.sort((a, b) => a.position - b.position);
	}

	$effect(() => {
		if (initializedFromData) return;
		quoteIdentities = data.quoteIdentities ?? [];
		projectError = data.projectError ?? '';
		if (data.project) {
			normalizeProjectResponse(data.project as ProjectResponse);
		}
		selectedQuoteIdentityId = quoteIdentities[0]?.id ?? '';
		initializedFromData = true;
	});

	$effect(() => {
		const firstSlideId = slides[0]?.id ?? null;
		if (!firstSlideId) {
			selectedSlideId = null;
			return;
		}

		if (!selectedSlideId || !slides.some((slide) => slide.id === selectedSlideId)) {
			selectedSlideId = firstSlideId;
		}
	});

	function formatTimestamp(value: string | null): string {
		if (!value) return 'ยังไม่มี';
		return new Date(value).toLocaleString('th-TH', {
			dateStyle: 'medium',
			timeStyle: 'short'
		});
	}

	function previewAssetForSlide(slide: CarouselSlideRow): string | null {
		return slide.selected_asset_json?.storage_url ?? slide.candidate_assets_json?.[0]?.preview_url ?? null;
	}

	function parseHashtagsInput(value: string): string[] {
		return normalizeHashtags(value.split(/[\s,\n]+/g));
	}

	function slideReadiness(slide: CarouselSlideRow) {
		return getCarouselSlideReadiness(slide, contentMode);
	}

	function resolvedSlideQuoteFontScale(slide: CarouselSlideRow): number {
		return normalizeCarouselQuoteFontScale(
			slide.quote_font_scale_override ?? project?.quote_font_scale ?? DEFAULT_CAROUSEL_QUOTE_FONT_SCALE
		);
	}

	function updateSlideQuoteFontScale(slide: CarouselSlideRow, value: unknown) {
		slide.quote_font_scale_override = normalizeCarouselQuoteFontScale(value);
	}

	function clearSlideQuoteFontScale(slide: CarouselSlideRow) {
		slide.quote_font_scale_override = null;
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

	async function loadQuoteIdentities() {
		loadingQuoteIdentities = true;
		try {
			const response = await fetch('/api/openclaw/carousels/quote-identities');
			const body = await response.json();
			if (!response.ok) {
				toast.error(body.error ?? 'โหลด Quote identities ไม่สำเร็จ');
				return;
			}

			quoteIdentities = Array.isArray(body.identities) ? body.identities : [];
			if (!selectedQuoteIdentityId && quoteIdentities.length > 0) {
				selectedQuoteIdentityId = quoteIdentities[0].id;
			}
		} catch {
			toast.error('โหลด Quote identities ไม่สำเร็จ');
		} finally {
			loadingQuoteIdentities = false;
		}
	}

	async function saveCurrentQuoteIdentity() {
		if (!project) return;
		const accountDisplayName = project.account_display_name?.trim() ?? '';
		if (!accountDisplayName) {
			toast.error('ใส่ Account display name ก่อนบันทึก Quote identity');
			return;
		}

		savingQuoteIdentity = true;
		try {
			const response = await fetch('/api/openclaw/carousels/quote-identities', {
				method: 'POST',
				headers: { 'Content-Type': 'application/json' },
				body: JSON.stringify({
					name: quoteIdentityName.trim() || accountDisplayName,
					account_display_name: accountDisplayName,
					account_handle: project.account_handle,
					account_avatar_url: project.account_avatar_url,
					account_avatar_storage_path: project.account_avatar_storage_path,
					account_is_verified: project.account_is_verified
				})
			});
			const body = await response.json();
			if (!response.ok) {
				toast.error(body.error ?? 'บันทึก Quote identity ไม่สำเร็จ');
				return;
			}

			quoteIdentityName = '';
			await loadQuoteIdentities();
			if (body.identity?.id) {
				selectedQuoteIdentityId = body.identity.id;
			}
			toast.success('บันทึก Quote identity แล้ว');
		} catch {
			toast.error('บันทึก Quote identity ไม่สำเร็จ');
		} finally {
			savingQuoteIdentity = false;
		}
	}

	async function applySelectedQuoteIdentity() {
		if (!project) return;
		const identity = quoteIdentities.find((item) => item.id === selectedQuoteIdentityId);
		if (!identity) {
			toast.error('เลือก Quote identity ก่อน');
			return;
		}

		applyingQuoteIdentityId = identity.id;
		try {
			const response = await fetch(`/api/openclaw/carousels/${projectId}`, {
				method: 'PATCH',
				headers: { 'Content-Type': 'application/json' },
				body: JSON.stringify({
					account_display_name: identity.account_display_name,
					account_handle: identity.account_handle,
					account_avatar_url: identity.account_avatar_url,
					account_avatar_storage_path: identity.account_avatar_storage_path,
					account_is_verified: identity.account_is_verified
				})
			});
			const body = await response.json();
			if (!response.ok) {
				toast.error(body.error ?? 'ใช้ Quote identity ไม่สำเร็จ');
				return;
			}

			normalizeProjectResponse(body as ProjectResponse);
			toast.success('ใช้ Quote identity แล้ว');
		} catch {
			toast.error('ใช้ Quote identity ไม่สำเร็จ');
		} finally {
			applyingQuoteIdentityId = null;
		}
	}

	async function deleteSelectedQuoteIdentity() {
		if (!selectedQuoteIdentityId) return;
		const identity = quoteIdentities.find((item) => item.id === selectedQuoteIdentityId);
		if (!identity) return;

		const confirmed = window.confirm(`ลบ Quote identity "${identity.name}" ใช่ไหม?`);
		if (!confirmed) return;

		deletingQuoteIdentityId = identity.id;
		try {
			const response = await fetch(`/api/openclaw/carousels/quote-identities/${identity.id}`, {
				method: 'DELETE'
			});
			if (!response.ok) {
				const body = await response.json().catch(() => ({}));
				toast.error(body.error ?? 'ลบ Quote identity ไม่สำเร็จ');
				return;
			}

			await loadQuoteIdentities();
			selectedQuoteIdentityId = quoteIdentities[0]?.id ?? '';
			toast.success('ลบ Quote identity แล้ว');
		} catch {
			toast.error('ลบ Quote identity ไม่สำเร็จ');
		} finally {
			deletingQuoteIdentityId = null;
		}
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

	async function saveReviewStatus(nextStatus?: CarouselReviewStatus) {
		if (!project) return;

		savingReview = true;
		try {
			const resolvedStatus = nextStatus ?? project.review_status ?? 'draft';
			const response = await fetch(`/api/openclaw/carousels/${projectId}`, {
				method: 'PATCH',
				headers: { 'Content-Type': 'application/json' },
				body: JSON.stringify({
					review_status: resolvedStatus,
					review_notes: reviewNotes,
					reviewed_by: reviewOwner,
					reviewed_at: resolvedStatus === 'draft' ? null : new Date().toISOString()
				})
			});
			const body = await response.json();
			if (!response.ok) {
				toast.error(body.error ?? 'บันทึก review state ไม่สำเร็จ');
				return;
			}

			normalizeProjectResponse(body as ProjectResponse);
			toast.success(`อัปเดต review เป็น ${CAROUSEL_REVIEW_STATUS_LABEL[resolvedStatus]} แล้ว`);
		} catch {
			toast.error('บันทึก review state ไม่สำเร็จ');
		} finally {
			savingReview = false;
		}
	}

	async function savePublishedRecord() {
		if (!project) return;
		if (!linkedSchedule) {
			toast.error('ต้องมีรายการใน Calendar ที่เชื่อมกับ carousel นี้ก่อนบันทึก publish metrics');
			return;
		}

		publishSaving = true;
		try {
			const response = await fetch(`/api/openclaw/carousels/${projectId}/publish`, {
				method: 'POST',
				headers: { 'Content-Type': 'application/json' },
				body: JSON.stringify({
					url: publishUrl,
					title: publishTitle,
					thumbnail_url: publishThumbnailUrl,
					published_at: publishAt ? new Date(publishAt).toISOString() : null,
					view_count: publishViews,
					like_count: publishLikes,
					comment_count: publishComments,
					share_count: publishShares,
					save_count: publishSaves,
					notes: publishNotes
				})
			});
			const body = await response.json();
			if (!response.ok) {
				toast.error(body.error ?? 'บันทึก publish record ไม่สำเร็จ');
				return;
			}

			applyScheduleDraft(normalizeScheduleResponse(body.schedule));
			applyPublishDraft(normalizePublishedRecord(body.published_record));
			toast.success('บันทึก publish record แล้ว');
			await loadProject();
		} catch {
			toast.error('บันทึก publish record ไม่สำเร็จ');
		} finally {
			publishSaving = false;
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
					quote_font_scale_override: slide.quote_font_scale_override,
					quote_text_offset_x_px: slide.quote_text_offset_x_px,
					quote_text_offset_y_px: slide.quote_text_offset_y_px,
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

	async function regenerateSlide(slide: CarouselSlideRow) {
		regeneratingSlideId = slide.id;
		try {
			const response = await fetch(`/api/openclaw/carousels/${projectId}/slides/${slide.id}/regenerate`, {
				method: 'POST'
			});
			const body = await response.json();
			if (!response.ok) {
				toast.error(body.error ?? 'Regenerate slide ไม่สำเร็จ');
				return;
			}

			if (body.slide) {
				replaceSlide(body.slide as CarouselSlideRow);
			}
			if (project && typeof body.project_status === 'string') {
				project.status = body.project_status as CarouselProjectStatus;
			}
			toast.success(`Regenerate slide ${slide.position} แล้ว`);
		} catch {
			toast.error('Regenerate slide ไม่สำเร็จ');
		} finally {
			regeneratingSlideId = null;
		}
	}

	async function undoSlideRegenerate(slide: CarouselSlideRow) {
		const lastVersion = slide.history_json?.[0];
		if (!lastVersion) {
			toast.error('ไม่มี version ก่อนหน้า');
			return;
		}
		undoingSlideId = slide.id;
		try {
			const response = await fetch(`/api/openclaw/carousels/${projectId}/slides/${slide.id}`, {
				method: 'PATCH',
				headers: { 'Content-Type': 'application/json' },
				body: JSON.stringify({
					headline: lastVersion.headline,
					body: lastVersion.body,
					cta: lastVersion.cta,
					visual_brief: lastVersion.visual_brief,
					freepik_query: lastVersion.freepik_query
				})
			});
			const body = await response.json();
			if (!response.ok) {
				toast.error(body.error ?? 'Undo ไม่สำเร็จ');
				return;
			}
			if (body.slide) replaceSlide(body.slide as CarouselSlideRow);
			if (project && typeof body.project_status === 'string') {
				project.status = body.project_status as CarouselProjectStatus;
			}
			toast.success(`Undo slide ${slide.position} แล้ว`);
		} catch {
			toast.error('Undo ไม่สำเร็จ');
		} finally {
			undoingSlideId = null;
		}
	}

	async function rerollAssets(slide: CarouselSlideRow) {
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

	function handleSlidesDragStart(event: DragEvent, slideId: string) {
		draggingSlideId = slideId;
		if (event.dataTransfer) {
			event.dataTransfer.effectAllowed = 'move';
			event.dataTransfer.setData('text/plain', slideId);
		}
	}

	function handleSlidesDragOver(event: DragEvent, slideId: string) {
		event.preventDefault();
		if (event.dataTransfer) event.dataTransfer.dropEffect = 'move';
		if (slideId !== draggingSlideId) dragOverSlideId = slideId;
	}

	function handleSlidesDragEnd() {
		draggingSlideId = null;
		dragOverSlideId = null;
	}

	async function handleSlidesDrop(event: DragEvent, targetSlideId: string) {
		event.preventDefault();
		dragOverSlideId = null;

		const sourceId = draggingSlideId;
		draggingSlideId = null;

		if (!sourceId || sourceId === targetSlideId) return;

		const sourceIndex = slides.findIndex((s) => s.id === sourceId);
		const targetIndex = slides.findIndex((s) => s.id === targetSlideId);
		if (sourceIndex === -1 || targetIndex === -1) return;

		// Build new order by moving source to target position
		const reordered = [...slides];
		const [moved] = reordered.splice(sourceIndex, 1);
		reordered.splice(targetIndex, 0, moved);

		// Assign new positions (1-indexed)
		const newPositions = reordered.map((slide, index) => ({ ...slide, position: index + 1 }));

		// Optimistic update
		slides = newPositions;

		await reorderSlides(newPositions.map((s) => ({ id: s.id, position: s.position })));
	}

	async function reorderSlides(positions: { id: string; position: number }[]) {
		reordering = true;
		try {
			const response = await fetch(`/api/openclaw/carousels/${projectId}/slides/reorder`, {
				method: 'PATCH',
				headers: { 'Content-Type': 'application/json' },
				body: JSON.stringify({ positions })
			});
			const body = await response.json();
			if (!response.ok) {
				toast.error(body.error ?? 'เรียงลำดับ slide ไม่สำเร็จ');
				await loadProject();
				return;
			}
			toast.success('เรียงลำดับ slides แล้ว');
		} catch {
			toast.error('เรียงลำดับ slide ไม่สำเร็จ');
			await loadProject();
		} finally {
			reordering = false;
		}
	}

	async function regenerateAllCopy() {
		if (slides.length === 0) return;
		regeneratingAllSlides = true;
		regenerateAllProgress = { done: 0, total: slides.length };
		try {
			for (const slide of slides) {
				const response = await fetch(`/api/openclaw/carousels/${projectId}/slides/${slide.id}/regenerate`, {
					method: 'POST'
				});
				const body = await response.json();
				if (!response.ok) {
					toast.error(body.error ?? `Regenerate slide ${slide.position} ไม่สำเร็จ`);
					return;
				}
				if (body.slide) replaceSlide(body.slide as CarouselSlideRow);
				if (project && typeof body.project_status === 'string') {
					project.status = body.project_status as CarouselProjectStatus;
				}
				regenerateAllProgress = { done: regenerateAllProgress!.done + 1, total: slides.length };
			}
			toast.success(`Regenerate copy ครบ ${slides.length} slides แล้ว`);
		} catch {
			toast.error('Regenerate all copy ไม่สำเร็จ');
		} finally {
			regeneratingAllSlides = false;
			regenerateAllProgress = null;
		}
	}

	async function exportPackage() {
		if (!project) return;
		if (exportMode !== 'copy_bundle' && !readyToExport) {
			toast.error(projectBlockers[0] ?? 'ยัง export ไม่ได้');
			return;
		}

		exporting = true;
		try {
			const [{ default: JSZip }, htmlToImageModule] = await Promise.all([
				import('jszip'),
				exportMode === 'copy_bundle' ? Promise.resolve(null) : import('html-to-image')
			]);
			const toBlob = htmlToImageModule?.toBlob;

			const exportProject = {
				...project,
				hashtags_json: parseHashtagsInput(hashtagsInput)
			};

			const zip = new JSZip();
			const entries = buildCarouselExportEntries(slides);

			if (exportMode === 'full_package' || exportMode === 'slides_only') {
				if (!toBlob) {
					throw new Error('Export image renderer is not available');
				}

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
			}

			const exportedAt = new Date().toISOString();
			if (exportMode === 'full_package' || exportMode === 'copy_bundle') {
				zip.file('caption.txt', exportProject.caption ?? '');
				zip.file('hashtags.txt', exportProject.hashtags_json.join(' '));
				zip.file('posting-checklist.txt', buildPostingChecklist(exportProject, slides));
			}
			if (exportMode === 'full_package') {
				zip.file('manifest.json', JSON.stringify(buildCarouselExportManifest(exportProject, slides, exportedAt), null, 2));
			}

			const blob = await zip.generateAsync({ type: 'blob' });
			const url = URL.createObjectURL(blob);
			const link = document.createElement('a');
			link.href = url;
			const suffix = exportMode === 'slides_only' ? 'slides' : exportMode === 'copy_bundle' ? 'copy' : 'package';
			link.download = `carousel-${project.id.slice(0, 8)}-${suffix}.zip`;
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

			toast.success(`${selectedExportMode.label} พร้อมดาวน์โหลดแล้ว`);
		} catch (error) {
			toast.error(error instanceof Error ? error.message : 'Export ไม่สำเร็จ');
		} finally {
			exporting = false;
		}
	}

</script>

<main class="page">
	<PageHeader
		eyebrow="Carousel Studio"
		title={project?.title ?? 'Carousel project'}
	>
		{#snippet actions()}
			<Button variant="secondary" href="/carousel">All Projects</Button>
			<Button variant="ai" onclick={generateDraft} loading={generating} disabled={!hasSupabaseConfig}>
				{generating ? 'Generating...' : slides.length > 0 ? 'Regenerate Draft' : 'Generate Draft'}
			</Button>
			<Button variant="primary" onclick={exportPackage} loading={exporting} disabled={!canExportSelectedMode}>
				{exporting ? 'Exporting...' : `Export ${selectedExportMode.label}`}
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
		<section class="summary-strip">
			<div class="summary-strip-top">
				<div class="hero-badges">
					<Badge variant={statusVariant(project.status)} label={carouselStatusLabel[project.status]} />
					<Badge variant={reviewStatusVariant(reviewStatus)} label={`Review ${reviewStatusLabel}`} />
					<Badge variant="platform" value="instagram" />
					<Badge variant="neutral" label={isQuoteMode ? 'Quote Mode' : 'Standard Mode'} />
					<Badge variant="neutral" label={`${slides.length || DEFAULT_CAROUSEL_SLIDE_COUNT} slides`} />
					{#if linkedSchedule}
						<Badge variant="neutral" label="Scheduled" />
					{/if}
					{#if publishedRecord}
						<Badge variant="success" label="Published" />
					{/if}
				</div>
			</div>

			<div class="summary-toolbar">
				<label class="summary-select">
					<span>Export mode</span>
					<select bind:value={exportMode}>
						{#each EXPORT_MODE_OPTIONS as option}
							<option value={option.value}>{option.label}</option>
						{/each}
					</select>
				</label>
				<div class="summary-toolbar-actions">
					<Button
						variant="ghost"
						onclick={() => { void regenerateAllCopy(); }}
						loading={regeneratingAllSlides}
						disabled={slides.length === 0 || autoPickingAssets}
					>
						{regeneratingAllSlides && regenerateAllProgress
							? `Regenerating ${regenerateAllProgress.done}/${regenerateAllProgress.total}...`
							: 'Regenerate All Copy'}
					</Button>
					<Button
						variant="secondary"
						onclick={autoPickMissingAssets}
						loading={autoPickingAssets}
						disabled={slides.length === 0 || regeneratingAllSlides}
					>
						{autoPickingAssets ? 'Auto-picking...' : 'Auto-pick missing assets'}
					</Button>
				</div>
			</div>

			{#if projectBlockers.length > 0}
				<div class="summary-blockers">
					<strong>ยัง export ไม่ได้</strong>
					<ul class="blocker-list">
						{#each projectBlockers as blocker}
							<li>{blocker}</li>
						{/each}
					</ul>
				</div>
			{:else}
				<p class="summary-ready">พร้อม export</p>
			{/if}
		</section>

		<section class="workbench-card">
			<div class="workbench-head">
				<h3>Slides</h3>
				<span class="section-summary-meta">{readySlidesCount}/{slides.length || DEFAULT_CAROUSEL_SLIDE_COUNT} ready</span>
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
				<div class="workbench-grid">
					<aside class="slide-rail" aria-label="Carousel slides">
						{#each slides as slide}
							{@const state = slideReadiness(slide)}
							<button
								type="button"
								class="rail-slide"
								class:rail-slide--active={selectedSlideId === slide.id}
								class:rail-slide--dragging={draggingSlideId === slide.id}
								class:rail-slide--drag-over={dragOverSlideId === slide.id}
								draggable="true"
								onclick={() => { selectedSlideId = slide.id; }}
								ondragstart={(e) => handleSlidesDragStart(e, slide.id)}
								ondragover={(e) => handleSlidesDragOver(e, slide.id)}
								ondrop={(e) => void handleSlidesDrop(e, slide.id)}
								ondragend={handleSlidesDragEnd}
							>
								<span class="rail-drag" aria-hidden="true">::</span>
								<span class="rail-thumb">
									{#if previewAssetForSlide(slide)}
										<img src={previewAssetForSlide(slide)} alt="" loading="lazy" />
									{:else}
										<span>{slide.position}</span>
									{/if}
								</span>
								<span class="rail-copy">
									<strong>Slide {slide.position}</strong>
									<small>{slide.role}</small>
								</span>
								<span class="rail-state" class:rail-state--ready={state.isReady}>
									{state.isReady ? 'Ready' : 'Fix'}
								</span>
							</button>
						{/each}
					</aside>

					{#each slides as slide}
						{#if selectedSlideId === slide.id}
							<section class="selected-preview-panel" aria-label="Selected slide preview">
								<div class="canvas-edit-hint">
									<span>✎ Click text to edit directly</span>
									<kbd>⌘S</kbd>
									<span>to save</span>
								</div>
								<CarouselSlidePreview
									slide={slide}
									fontPreset={project.font_preset}
									textLetterSpacingEm={project.text_letter_spacing_em}
									fallbackAssetUrl={previewAssetForSlide(slide)}
									contentMode={contentMode}
									quoteFontScale={resolvedSlideQuoteFontScale(slide)}
									accountDisplayName={project.account_display_name}
									accountHandle={project.account_handle}
									accountAvatarUrl={project.account_avatar_url}
									accountIsVerified={project.account_is_verified}
									quoteTextOffsetXPx={slide.quote_text_offset_x_px}
									quoteTextOffsetYPx={slide.quote_text_offset_y_px}
									exportId={null}
									editable={true}
									onheadlinechange={(v) => { slide.headline = v; }}
									onbodychange={(v) => { slide.body = v; }}
									onctachange={(v) => { slide.cta = v; }}
									onslideSave={() => { void saveSlide(slide); }}
								/>
								<div class="preview-meta-card">
									<div>
										<span>Slide {slide.position} · {slide.role}</span>
									</div>
									{#if selectedSlideState?.isReady}
										<span class="slide-state slide-state--ready">Ready</span>
									{:else}
										<span class="slide-state slide-state--warn">Needs work</span>
									{/if}
								</div>
							</section>

							<aside class="slide-inspector" aria-label="Slide inspector">
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
									<div class="slide-actions">
										{#if slide.history_json && slide.history_json.length > 0}
											<Button
												variant="ghost"
												size="sm"
												onclick={() => { void undoSlideRegenerate(slide); }}
												loading={undoingSlideId === slide.id}
												disabled={regeneratingSlideId === slide.id || savingSlideId === slide.id}
											>
												Undo
											</Button>
										{/if}
										<Button
											variant="ghost"
											size="sm"
											onclick={() => { void regenerateSlide(slide); }}
											loading={regeneratingSlideId === slide.id}
											disabled={savingSlideId === slide.id || undoingSlideId === slide.id}
										>
											Regenerate
										</Button>
										<Button
											variant="primary"
											size="sm"
											onclick={() => { void saveSlide(slide); }}
											loading={savingSlideId === slide.id}
											disabled={regeneratingSlideId === slide.id || undoingSlideId === slide.id}
										>
											Save
										</Button>
									</div>
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
										<span>ใช้ headline เป็นข้อความหลัก และเลือก background image ได้ถ้าต้องการ</span>
									</div>

									<div class="quote-position-grid">
										<label>
											<span>Slide font size</span>
											<div class="letter-spacing-field">
												<input
													type="range"
													min={CAROUSEL_QUOTE_FONT_SCALE_MIN}
													max={CAROUSEL_QUOTE_FONT_SCALE_MAX}
													step={CAROUSEL_QUOTE_FONT_SCALE_STEP}
													value={resolvedSlideQuoteFontScale(slide)}
													oninput={(event) => {
														updateSlideQuoteFontScale(slide, (event.currentTarget as HTMLInputElement).value);
													}}
												/>
												<div class="letter-spacing-input">
													<input
														type="number"
														min={CAROUSEL_QUOTE_FONT_SCALE_MIN}
														max={CAROUSEL_QUOTE_FONT_SCALE_MAX}
														step={CAROUSEL_QUOTE_FONT_SCALE_STEP}
														value={resolvedSlideQuoteFontScale(slide)}
														oninput={(event) => {
															updateSlideQuoteFontScale(slide, (event.currentTarget as HTMLInputElement).value);
														}}
													/>
													<span>x</span>
												</div>
											</div>
											<small>
												{#if slide.quote_font_scale_override === null}
													Using project default: {selectedQuoteFontScaleLabel}
												{:else}
													Override: {resolvedSlideQuoteFontScale(slide).toFixed(2)}x
												{/if}
											</small>
										</label>

										<label>
											<span>Quote X position</span>
											<div class="letter-spacing-field">
												<input type="range" min={CAROUSEL_QUOTE_TEXT_OFFSET_MIN_PX} max={CAROUSEL_QUOTE_TEXT_OFFSET_MAX_PX} step={CAROUSEL_QUOTE_TEXT_OFFSET_STEP_PX} bind:value={slide.quote_text_offset_x_px} />
												<div class="letter-spacing-input">
													<input type="number" min={CAROUSEL_QUOTE_TEXT_OFFSET_MIN_PX} max={CAROUSEL_QUOTE_TEXT_OFFSET_MAX_PX} step={CAROUSEL_QUOTE_TEXT_OFFSET_STEP_PX} bind:value={slide.quote_text_offset_x_px} />
													<span>px</span>
												</div>
											</div>
										</label>

										<label>
											<span>Quote Y position</span>
											<div class="letter-spacing-field">
												<input type="range" min={CAROUSEL_QUOTE_TEXT_OFFSET_MIN_PX} max={CAROUSEL_QUOTE_TEXT_OFFSET_MAX_PX} step={CAROUSEL_QUOTE_TEXT_OFFSET_STEP_PX} bind:value={slide.quote_text_offset_y_px} />
												<div class="letter-spacing-input">
													<input type="number" min={CAROUSEL_QUOTE_TEXT_OFFSET_MIN_PX} max={CAROUSEL_QUOTE_TEXT_OFFSET_MAX_PX} step={CAROUSEL_QUOTE_TEXT_OFFSET_STEP_PX} bind:value={slide.quote_text_offset_y_px} />
													<span>px</span>
												</div>
											</div>
										</label>
									</div>
									<div class="quote-position-actions">
										<Button variant="ghost" size="sm" onclick={() => { clearSlideQuoteFontScale(slide); }} disabled={slide.quote_font_scale_override === null}>
											Use Project Font Size
										</Button>
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

								{#if !isQuoteNonCtaSlide(slide) || isQuoteMode}
									<div class="field-grid field-grid--query">
										<label>
											<span>{isQuoteNonCtaSlide(slide) ? 'Background image query' : 'Pexels query'}</span>
											<input bind:value={slide.freepik_query} placeholder={isQuoteNonCtaSlide(slide) ? 'english background image query' : 'english pexels photo query'} />
										</label>
										<Button variant="ghost" size="sm" onclick={() => { void rerollAssets(slide); }} loading={rerollingSlideId === slide.id}>
											{isQuoteNonCtaSlide(slide) ? 'Search Backgrounds' : 'Reroll Assets'}
										</Button>
									</div>

									<div class="asset-grid" class:asset-grid--optional={isQuoteNonCtaSlide(slide)}>
										<div class="asset-toolbar">
											<div class="asset-toolbar-copy">
												<strong>{isQuoteNonCtaSlide(slide) ? 'Background image' : 'Asset'}</strong>
												<span>{isQuoteNonCtaSlide(slide) ? 'เลือกจาก Pexels หรืออัปโหลดเองได้' : 'อัปโหลดภาพแทนหรือเลือกรูปจาก candidates'}</span>
											</div>
											<label class="asset-upload-button" class:loading={uploadingAssetSlideId === slide.id}>
												<input
													type="file"
													accept="image/jpeg,image/png,image/webp,image/gif,image/avif"
													onchange={(event) => { void uploadReplacementAsset(slide, event); }}
													disabled={uploadingAssetSlideId === slide.id}
												/>
												<span>{uploadingAssetSlideId === slide.id ? 'Uploading...' : isQuoteNonCtaSlide(slide) ? 'Upload Background' : 'Upload Image'}</span>
											</label>
										</div>
										{#if !isQuoteNonCtaSlide(slide) && !slideReadiness(slide).hasAsset}
											<div class="asset-warning"><strong>Missing asset</strong><span>เลือกรูปด้านล่างหรือใช้ Auto-pick missing assets</span></div>
										{:else if isQuoteNonCtaSlide(slide) && !slideReadiness(slide).hasAsset}
											<div class="asset-optional-note"><strong>Optional</strong><span>ปล่อยว่างได้ถ้าต้องการพื้นหลัง text-first</span></div>
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
											<div class="asset-empty"><p>{isQuoteNonCtaSlide(slide) ? 'ยังไม่มี background candidates' : 'ยังไม่มี candidate assets'}</p><span>ใส่ query แล้วกด search/reroll</span></div>
										{/if}
									</div>
								{/if}
							</aside>
						{/if}
					{/each}
				</div>

				<div class="export-renderer" aria-hidden="true">
					{#each slides as slide}
						<CarouselSlidePreview
							slide={slide}
							fontPreset={project.font_preset}
							textLetterSpacingEm={project.text_letter_spacing_em}
							fallbackAssetUrl={previewAssetForSlide(slide)}
							contentMode={contentMode}
							quoteFontScale={resolvedSlideQuoteFontScale(slide)}
							accountDisplayName={project.account_display_name}
							accountHandle={project.account_handle}
							accountAvatarUrl={project.account_avatar_url}
							accountIsVerified={project.account_is_verified}
							quoteTextOffsetXPx={slide.quote_text_offset_x_px}
							quoteTextOffsetYPx={slide.quote_text_offset_y_px}
							exportId={slide.id}
						/>
					{/each}
				</div>
			{/if}
		</section>

		<details class="section-card">
			<summary class="section-summary">
				<div class="section-summary-copy">
					<p class="panel-kicker">Setup</p>
					<h3>Basic setup</h3>
				</div>
				<span class="section-summary-meta">title, caption, fonts, account header</span>
			</summary>

			<div class="section-body">
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
					<div class="caption-counter" class:caption-counter--warn={captionCountState === 'warning'} class:caption-counter--over={captionCountState === 'over'}>
						<span class="caption-counter-total">{combinedCharCount} / {INSTAGRAM_CAPTION_LIMIT}</span>
						<span class="caption-counter-breakdown">Caption {captionCharCount} + Hashtags {hashtagsCharCount}</span>
					</div>

					<label>
						<span>Hashtags</span>
						<textarea bind:value={hashtagsInput} rows={3} placeholder="#xauusd #biglot #tradingtips"></textarea>
					</label>
					<div class="hashtag-counter">{hashtagsParsed.length} hashtags · {hashtagsCharCount} chars</div>

					{#if isQuoteMode}
						<section class="account-panel">
							<div class="panel-headline">
								<div>
									<p class="panel-kicker">Account header</p>
									<h3>Quote identity</h3>
								</div>
								<span class="account-panel-note">Shown on every non-CTA slide</span>
							</div>

							<div class="quote-identity-presets">
								<label>
									<span>Saved identities</span>
									<select bind:value={selectedQuoteIdentityId} disabled={loadingQuoteIdentities || quoteIdentities.length === 0}>
										<option value="">Select saved identity</option>
										{#each quoteIdentities as identity}
											<option value={identity.id}>
												{identity.name}{identity.account_handle ? ` · @${identity.account_handle}` : ''}
											</option>
										{/each}
									</select>
									<small>
										{#if loadingQuoteIdentities}
											Loading saved identities...
										{:else if quoteIdentities.length === 0}
											ยังไม่มี saved identity
										{:else}
											เลือก preset ที่เคยบันทึกไว้แล้ว apply เข้า project นี้ได้ทันที
										{/if}
									</small>
								</label>

								<div class="quote-identity-actions">
									<Button
										variant="secondary"
										size="sm"
										onclick={applySelectedQuoteIdentity}
										disabled={!selectedQuoteIdentityId || applyingQuoteIdentityId !== null}
									>
										{applyingQuoteIdentityId ? 'Applying...' : 'Apply Saved Identity'}
									</Button>
									<Button
										variant="ghost"
										size="sm"
										onclick={deleteSelectedQuoteIdentity}
										disabled={!selectedQuoteIdentityId || deletingQuoteIdentityId !== null}
									>
										{deletingQuoteIdentityId ? 'Deleting...' : 'Delete Saved Identity'}
									</Button>
								</div>

								<div class="quote-identity-save">
									<label>
										<span>Save current as</span>
										<input bind:value={quoteIdentityName} placeholder="เช่น BigLot Trader Verified" />
									</label>
									<Button
										variant="secondary"
										size="sm"
										onclick={saveCurrentQuoteIdentity}
										loading={savingQuoteIdentity}
									>
										{savingQuoteIdentity ? 'Saving...' : 'Save Current Identity'}
									</Button>
								</div>
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
			</div>
		</details>

		<details class="section-card">
			<summary class="section-summary">
				<div class="section-summary-copy">
					<p class="panel-kicker">Workflow</p>
					<h3>Review and publish</h3>
				</div>
				<span class="section-summary-meta">review state and performance tracking</span>
			</summary>

			<div class="section-body workflow-stack">
				<section class="workflow-panel">
					<div class="panel-headline">
						<div>
							<p class="panel-kicker">Review</p>
							<h3>Approval gate</h3>
						</div>
						<Button variant="secondary" size="sm" onclick={() => { void saveReviewStatus(); }} loading={savingReview}>
							Save Review
						</Button>
					</div>

					<div class="workflow-summary">
						<Badge variant={reviewStatusVariant(reviewStatus)} label={reviewStatusLabel} />
						<p>{reviewStatusHint}</p>
					</div>

					<label>
						<span>Reviewer / owner</span>
						<input bind:value={reviewOwner} placeholder="เช่น โฟน หรือ Head of Content" />
					</label>

					<label>
						<span>Review notes</span>
						<textarea bind:value={reviewNotes} rows={4} placeholder="สรุป feedback, positioning, หรือเหตุผลที่ approve/reject"></textarea>
					</label>

					<div class="workflow-actions">
						<Button variant="ghost" size="sm" onclick={() => { void saveReviewStatus('draft'); }} disabled={savingReview}>
							Back to Draft
						</Button>
						<Button variant="secondary" size="sm" onclick={() => { void saveReviewStatus('pending_review'); }} disabled={savingReview}>
							Send for Review
						</Button>
						<Button variant="primary" size="sm" onclick={() => { void saveReviewStatus('approved'); }} disabled={savingReview}>
							Approve
						</Button>
						<Button variant="danger" size="sm" onclick={() => { void saveReviewStatus('changes_requested'); }} disabled={savingReview}>
							Request Changes
						</Button>
					</div>
				</section>

				<section class="workflow-panel">
					<div class="panel-headline">
						<div>
							<p class="panel-kicker">Publish</p>
							<h3>Performance tracking</h3>
						</div>
						<Button
							variant="primary"
							size="sm"
							onclick={savePublishedRecord}
							loading={publishSaving}
							disabled={!canSavePublishRecord}
						>
							{publishedRecord ? 'Update Publish Record' : 'Mark as Published'}
						</Button>
					</div>

					<div class="workflow-summary">
						<Badge variant={hasPublishedRecord ? 'success' : 'warning'} label={hasPublishedRecord ? 'Published' : 'Awaiting Publish'} />
						<p>
							{#if publishedRecord?.published_at}
								โพสต์ล่าสุดเมื่อ {formatTimestamp(publishedRecord.published_at)}
							{:else if !linkedSchedule}
								ต้องมีรายการใน Calendar ที่เชื่อมกับ carousel นี้ก่อนบันทึก publish metrics
							{:else}
								เก็บลิงก์โพสต์และ metrics ของ Instagram carousel เพื่อปิด feedback loop
							{/if}
						</p>
					</div>

					<label>
						<span>Instagram URL</span>
						<input bind:value={publishUrl} type="url" placeholder="https://www.instagram.com/p/..." />
					</label>

					<div class="field-grid">
						<label>
							<span>Published at</span>
							<input bind:value={publishAt} type="datetime-local" />
						</label>

						<label>
							<span>Published title</span>
							<input bind:value={publishTitle} placeholder="ชื่อที่ใช้ตอนโพสต์จริง" />
						</label>
					</div>

					<label>
						<span>Thumbnail URL</span>
						<input bind:value={publishThumbnailUrl} type="url" placeholder="https://..." />
					</label>

					<div class="publish-metrics-grid">
						<label>
							<span>Views</span>
							<input bind:value={publishViews} type="number" min="0" placeholder="0" />
						</label>
						<label>
							<span>Likes</span>
							<input bind:value={publishLikes} type="number" min="0" placeholder="0" />
						</label>
						<label>
							<span>Comments</span>
							<input bind:value={publishComments} type="number" min="0" placeholder="0" />
						</label>
						<label>
							<span>Shares</span>
							<input bind:value={publishShares} type="number" min="0" placeholder="0" />
						</label>
						<label>
							<span>Saves</span>
							<input bind:value={publishSaves} type="number" min="0" placeholder="0" />
						</label>
					</div>

					<label>
						<span>Publish notes</span>
						<textarea bind:value={publishNotes} rows={3} placeholder="เช่น observation หลังโพสต์, creative note, audience reaction"></textarea>
					</label>
				</section>
			</div>
		</details>
	{/if}
</main>

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

	.summary-strip,
	.section-card,
	.workbench-card {
		border-radius: var(--radius-xl);
		border: 1px solid var(--color-border);
		background: var(--color-bg-elevated);
		box-shadow: var(--shadow-xs);
	}

	.summary-strip {
		position: sticky;
		top: calc(3.35rem + env(safe-area-inset-top, 0px));
		z-index: 20;
		display: grid;
		gap: var(--space-4);
		padding: var(--space-5);
		background:
			radial-gradient(circle at top right, rgba(37, 99, 235, 0.1), transparent 32%),
			radial-gradient(circle at bottom left, rgba(249, 115, 22, 0.08), transparent 30%),
			rgba(255, 255, 255, 0.96);
		backdrop-filter: blur(14px);
	}

	.summary-strip-top {
		display: grid;
		gap: var(--space-3);
	}

	.summary-ready {
		margin: 0;
		line-height: 1.6;
		color: var(--color-slate-600);
	}

	.summary-select span,
	.section-summary-meta {
		display: block;
		font-size: 0.76rem;
		font-weight: 800;
		text-transform: uppercase;
		letter-spacing: 0.12em;
		color: var(--color-slate-500);
	}

	.caption-counter {
		display: flex;
		align-items: baseline;
		gap: var(--space-3);
		font-size: var(--text-xs);
		color: var(--color-slate-500);
		margin-top: -0.5rem;
	}
	.caption-counter--warn { color: var(--color-yellow-600); }
	.caption-counter--over { color: var(--color-red-600); }
	.caption-counter--over .caption-counter-total { font-weight: var(--fw-semibold); }
	.caption-counter-breakdown { opacity: 0.75; }
	.hashtag-counter {
		font-size: var(--text-xs);
		color: var(--color-slate-500);
		margin-top: -0.5rem;
	}

	.summary-toolbar {
		display: flex;
		justify-content: space-between;
		align-items: end;
		gap: var(--space-3);
		flex-wrap: wrap;
	}

	.summary-toolbar-actions {
		display: flex;
		gap: var(--space-3);
		flex-wrap: wrap;
	}

	.summary-select {
		display: grid;
		gap: 0.4rem;
		min-width: 240px;
	}

	.summary-blockers {
		display: grid;
		gap: 0.75rem;
		padding: 1rem 1.1rem;
		border-radius: 1rem;
		border: 1px solid rgba(234, 88, 12, 0.16);
		background: rgba(255, 247, 237, 0.9);
	}

	.section-card {
		overflow: hidden;
	}

	.workbench-card {
		display: grid;
		gap: var(--space-4);
		padding: var(--space-5);
	}

	.workbench-head {
		display: flex;
		align-items: flex-start;
		justify-content: space-between;
		gap: var(--space-4);
		flex-wrap: wrap;
	}

	.workbench-head h3 {
		margin: 0;
		font-family: var(--font-heading);
	}

	.workbench-grid {
		display: grid;
		grid-template-columns: minmax(210px, 250px) minmax(280px, 390px) minmax(0, 1fr);
		gap: var(--space-4);
		align-items: start;
	}

	.slide-rail {
		position: sticky;
		top: 16rem;
		display: grid;
		gap: var(--space-2);
		max-height: calc(100vh - 18rem);
		overflow: auto;
		padding-right: 0.15rem;
	}

	.rail-slide {
		width: 100%;
		display: grid;
		grid-template-columns: auto 42px minmax(0, 1fr) auto;
		align-items: center;
		gap: var(--space-2);
		padding: 0.55rem;
		border-radius: var(--radius-lg);
		border: 1px solid var(--color-border);
		background: #fff;
		text-align: left;
		color: var(--color-slate-700);
		transition:
			background var(--transition-fast),
			border-color var(--transition-fast);
	}

	.rail-slide:hover,
	.rail-slide--active {
		border-color: rgba(15, 23, 42, 0.22);
		background: var(--color-slate-50);
	}

	.rail-slide--active {
		box-shadow: inset 3px 0 0 var(--color-primary);
	}

	.rail-slide--dragging {
		opacity: 0.45;
	}

	.rail-slide--drag-over {
		border-color: rgba(15, 23, 42, 0.38);
	}

	.rail-drag {
		color: var(--color-slate-400);
		font-size: var(--text-xs);
		letter-spacing: -0.08em;
	}

	.rail-thumb {
		width: 42px;
		aspect-ratio: 4 / 5;
		border-radius: var(--radius-md);
		overflow: hidden;
		display: grid;
		place-items: center;
		background: var(--color-slate-100);
		color: var(--color-slate-500);
		font-weight: 800;
	}

	.rail-thumb img {
		width: 100%;
		height: 100%;
		object-fit: cover;
	}

	.rail-copy {
		display: grid;
		gap: 0.08rem;
		min-width: 0;
	}

	.rail-copy strong,
	.rail-copy small {
		overflow: hidden;
		text-overflow: ellipsis;
		white-space: nowrap;
	}

	.rail-copy small {
		color: var(--color-slate-500);
		text-transform: capitalize;
	}

	.rail-state {
		font-size: 0.68rem;
		font-weight: 800;
		color: var(--color-orange-600);
	}

	.rail-state--ready {
		color: var(--color-green-700);
	}

	.selected-preview-panel {
		position: sticky;
		top: 16rem;
		display: grid;
		gap: var(--space-3);
	}

	.canvas-edit-hint {
		display: flex;
		align-items: center;
		gap: 0.4rem;
		font-size: var(--text-xs);
		color: var(--color-slate-400);
	}

	.canvas-edit-hint kbd {
		display: inline-flex;
		align-items: center;
		padding: 0.1rem 0.35rem;
		border-radius: 4px;
		border: 1px solid var(--color-border-strong);
		background: var(--color-bg-subtle);
		font-family: inherit;
		font-size: var(--text-xs);
		color: var(--color-slate-600);
	}

	.preview-meta-card {
		display: flex;
		justify-content: space-between;
		gap: var(--space-3);
		align-items: center;
		padding: var(--space-2) var(--space-3);
		border-radius: var(--radius-lg);
		border: 1px solid var(--color-border);
		background: var(--color-bg-subtle);
	}

	.preview-meta-card div {
		display: grid;
		gap: 0.15rem;
	}

	.preview-meta-card span:first-child {
		font-size: var(--text-xs);
		font-weight: var(--fw-semibold);
		color: var(--color-slate-500);
		text-transform: uppercase;
		letter-spacing: 0.08em;
	}

	.slide-inspector {
		display: grid;
		gap: var(--space-4);
		min-width: 0;
		padding: var(--space-4);
		border-radius: var(--radius-lg);
		border: 1px solid var(--color-border);
		background: var(--color-bg-elevated);
	}

	.export-renderer {
		position: fixed;
		left: -10000px;
		top: 0;
		width: 390px;
		pointer-events: none;
	}

	.section-summary {
		display: flex;
		align-items: center;
		justify-content: space-between;
		gap: var(--space-3);
		padding: var(--space-4) var(--space-5);
		cursor: pointer;
		list-style: none;
	}

	.section-summary::-webkit-details-marker {
		display: none;
	}

	.section-summary-copy {
		display: grid;
		gap: 0.25rem;
	}

	.section-summary-copy h3 {
		margin: 0;
		font-family: var(--font-heading);
	}

	.section-body {
		padding: 0 var(--space-5) var(--space-5);
		display: grid;
		gap: var(--space-4);
	}

	.workflow-stack {
		grid-template-columns: 1fr;
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
	.slide-topline h4 {
		margin: 0;
		font-family: var(--font-heading);
	}

	.error-card,
	.loading-state {
		display: grid;
		justify-items: start;
		gap: var(--space-3);
	}

	.hero-badges {
		display: flex;
		flex-wrap: wrap;
		gap: var(--space-2);
	}

	.meta-panel {
		display: grid;
		gap: var(--space-4);
		padding: var(--space-5);
		border-radius: var(--radius-xl);
		background: var(--color-bg-elevated);
		border: 1px solid var(--color-border);
		box-shadow: none;
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
		padding: 0.68rem 0.8rem;
		border-radius: var(--radius-md);
		border: 1px solid var(--color-border-strong);
		background: var(--color-bg-elevated);
		font: inherit;
		color: var(--color-slate-900);
	}

	input:focus,
	textarea:focus,
	select:focus {
		outline: 0;
		border-color: rgba(15, 23, 42, 0.36);
		box-shadow: 0 0 0 3px rgba(15, 23, 42, 0.08);
	}

	.workflow-panel {
		display: grid;
		gap: var(--space-3);
		padding: var(--space-4);
		border-radius: var(--radius-lg);
		background: #fff;
		border: 1px solid var(--color-border);
	}

	.workflow-summary {
		display: grid;
		gap: 0.45rem;
		padding: 0.9rem 1rem;
		border-radius: var(--radius-md);
		background: var(--color-slate-50);
		border: 1px solid var(--color-border);
	}

	.workflow-summary p {
		margin: 0;
		font-size: 0.78rem;
		line-height: 1.55;
		color: var(--color-slate-600);
	}

	.workflow-actions {
		display: flex;
		flex-wrap: wrap;
		gap: var(--space-2);
		align-items: center;
	}

	.publish-metrics-grid {
		display: grid;
		grid-template-columns: repeat(auto-fit, minmax(120px, 1fr));
		gap: var(--space-3);
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
		border-radius: var(--radius-lg);
		background: var(--color-bg-subtle);
		border: 1px solid var(--color-border);
	}

	.account-panel-note {
		font-size: 0.74rem;
		line-height: 1.35;
		color: var(--color-slate-500);
	}

	.quote-identity-presets {
		display: grid;
		gap: var(--space-3);
		padding: var(--space-4);
		border-radius: var(--radius-lg);
		background: #fff;
		border: 1px solid var(--color-border);
	}

	.quote-identity-actions,
	.quote-identity-save {
		display: flex;
		flex-wrap: wrap;
		gap: var(--space-2);
		align-items: end;
	}

	.quote-identity-save label {
		flex: 1 1 260px;
	}

	.account-card {
		display: grid;
		grid-template-columns: auto minmax(0, 1fr) auto;
		gap: var(--space-4);
		align-items: start;
		padding: var(--space-4);
		border-radius: var(--radius-lg);
		background: #fff;
		border: 1px solid var(--color-border);
		box-shadow: none;
	}

	.account-avatar {
		width: 4.5rem;
		height: 4.5rem;
		border-radius: 999px;
		overflow: hidden;
		display: grid;
		place-items: center;
		background: var(--color-slate-100);
		border: 1px solid var(--color-border);
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

	.slide-topline {
		display: flex;
		align-items: flex-start;
		justify-content: space-between;
		gap: var(--space-3);
		flex-wrap: wrap;
	}

	.slide-actions {
		display: inline-flex;
		flex-wrap: wrap;
		gap: 0.65rem;
		align-items: center;
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

	.quote-position-grid {
		display: grid;
		gap: var(--space-3);
	}

	.quote-position-actions {
		display: flex;
		flex-wrap: wrap;
		gap: var(--space-2);
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

	.asset-grid--optional {
		margin-top: -0.1rem;
	}

	.asset-toolbar {
		grid-column: 1 / -1;
		display: flex;
		align-items: center;
		justify-content: space-between;
		gap: var(--space-3);
		flex-wrap: wrap;
		padding: 0.9rem 1rem;
		border-radius: var(--radius-lg);
		background: var(--color-bg-subtle);
		border: 1px solid var(--color-border);
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
		border-radius: var(--radius-md);
		background: #fff;
		border: 1px solid var(--color-border-strong);
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

	.asset-optional-note {
		grid-column: 1 / -1;
		display: grid;
		gap: 0.2rem;
		padding: 0.85rem 1rem;
		border-radius: 0.95rem;
		background: var(--color-bg-subtle);
		border: 1px solid var(--color-border);
	}

	.asset-optional-note strong,
	.asset-optional-note span {
		margin: 0;
	}

	.asset-optional-note strong {
		font-size: 0.82rem;
		color: var(--color-slate-900);
	}

	.asset-optional-note span {
		font-size: 0.75rem;
		line-height: 1.5;
		color: var(--color-slate-600);
	}

	.asset-card,
	.asset-empty {
		display: grid;
		gap: 0.65rem;
		padding: 0.65rem;
		border-radius: var(--radius-lg);
		border: 1px solid var(--color-border);
		background: #fff;
	}

	.asset-card {
		cursor: pointer;
		text-align: left;
		transition:
			border-color var(--transition-fast),
			background var(--transition-fast);
	}

	.asset-card:hover:not(:disabled),
	.asset-card.selected {
		border-color: rgba(15, 23, 42, 0.26);
		background: var(--color-slate-50);
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
		.workbench-grid {
			grid-template-columns: 1fr;
		}

		.summary-strip,
		.slide-rail,
		.selected-preview-panel {
			position: static;
		}

		.slide-rail {
			display: flex;
			overflow-x: auto;
			max-height: none;
			padding: 0 0 var(--space-1);
		}

		.rail-slide {
			min-width: 210px;
		}

		.selected-preview-panel {
			max-width: 420px;
			margin: 0 auto;
			width: 100%;
		}
	}

	@media (max-width: 720px) {
		.summary-toolbar,
		.section-summary {
			flex-direction: column;
			align-items: stretch;
		}

		.summary-select {
			min-width: 0;
		}

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

		.summary-toolbar :global(button) {
			width: 100%;
		}
	}
</style>
