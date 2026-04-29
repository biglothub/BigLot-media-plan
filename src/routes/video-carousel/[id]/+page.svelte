<script lang="ts">
	import { goto } from '$app/navigation';
	import { Button, PageHeader, Spinner, toast } from '$lib';
	import type { PageData } from './$types';
	import type {
		VideoCarouselSlide,
		VideoCarouselProject,
		VideoTextPosition,
		VideoFilterType
	} from '$lib/video-carousel';
	import {
		VIDEO_FONT_MAP,
		FONT_PRESET_LABELS,
		VIDEO_CAROUSEL_TEMPLATE_LABELS,
		VIDEO_CAROUSEL_CANVAS_WIDTH,
		VIDEO_CAROUSEL_CANVAS_HEIGHT,
		VIDEO_FILTER_LABELS,
		OPTION_LETTERS,
		ACCENT_COLOR,
		videoCarouselTotalDuration
	} from '$lib/video-carousel';
	import type { CarouselFontPreset } from '$lib/types';

	let { data }: { data: PageData } = $props();

	type EditableField = 'text' | 'accent' | 'subtext' | number;
	type EditSurface = 'panel' | 'preview';
	type PreviewEditTone = 'primary' | 'accent' | 'option';
	interface PreviewEditSpec {
		key: string;
		field: EditableField;
		label: string;
		value: string;
		emptyLabel: string;
		multiline: boolean;
		tone: PreviewEditTone;
		targetStyle: string;
		controlStyle: string;
	}
	interface LayoutTransformSpec {
		left: number;
		top: number;
		width: number;
		height: number;
		style: string;
	}
	interface TransformDragState {
		slideId: string;
		mode: 'move' | 'resize';
		startClientX: number;
		startClientY: number;
		startOffsetX: number;
		startOffsetY: number;
		startScalePercent: number;
		startDistance: number;
		originClientX: number;
		originClientY: number;
		canvasRect: DOMRect;
	}

	let project = $state<VideoCarouselProject | null>(data.project);
	let slides = $state<VideoCarouselSlide[]>(data.slides ?? []);

	let activeIdx = $state(0);
	let activeSlide = $derived(slides[activeIdx] ?? null);

	let videoEl = $state<HTMLVideoElement | null>(null);
	let canvasEl = $state<HTMLCanvasElement | null>(null);
	let uploadVideoInputEl = $state<HTMLInputElement | null>(null);

	// ── Edit state ────────────────────────────────────────────────────────────
	let editingField = $state<EditableField | null>(null);
	let editingSlideId = $state<string | null>(null);
	let editingSurface = $state<EditSurface | null>(null);
	let draftValue = $state('');

	// ── Swap panel ────────────────────────────────────────────────────────────
	let showSwapPanel = $state(false);
	let swapCandidates = $state<Array<{ id: number; thumbnail_url: string; video_url: string | null; duration: number; user_name: string }>>([]);
	let loadingSwap = $state(false);
	let uploadingVideo = $state(false);

	// ── Export ────────────────────────────────────────────────────────────────
	let exporting = $state(false);
	let exportProgress = $state(0);
	let exportStatus = $state('');

	// ── Settings ──────────────────────────────────────────────────────────────
	let showSettings = $state(false);
	let fontPreset = $state<CarouselFontPreset>((data.project?.font_preset ?? 'biglot') as CarouselFontPreset);

	const fontOptions: Array<{ value: CarouselFontPreset; label: string }> = [
		{ value: 'biglot', label: FONT_PRESET_LABELS.biglot },
		{ value: 'apple_clean', label: FONT_PRESET_LABELS.apple_clean },
		{ value: 'mitr_friendly', label: FONT_PRESET_LABELS.mitr_friendly },
		{ value: 'ibm_plex_thai', label: FONT_PRESET_LABELS.ibm_plex_thai },
		{ value: 'editorial_serif', label: FONT_PRESET_LABELS.editorial_serif }
	];

	const MAX_UPLOAD_VIDEO_BYTES = 100 * 1024 * 1024;
	const SUPPORTED_UPLOAD_VIDEO_TYPES = new Set(['video/mp4', 'video/webm']);
	const MIN_TEXT_SCALE_PERCENT = 50;
	const MAX_TEXT_SCALE_PERCENT = 180;

	let offsetSaveTimer: ReturnType<typeof setTimeout> | null = null;
	let transformDrag = $state<TransformDragState | null>(null);
	let selectedTransformSlideId = $state<string | null>(null);

	// ── Canvas draw ───────────────────────────────────────────────────────────
	let animFrameId: number | null = null;

	function isEditingSlideField(slide: VideoCarouselSlide, field: EditableField): boolean {
		return editingSlideId === slide.id && editingField === field;
	}

	function drawVideoFrame(
		ctx: CanvasRenderingContext2D,
		video: HTMLVideoElement,
		slide: VideoCarouselSlide,
		w: number,
		h: number
	) {
		ctx.save();
		ctx.filter = slide.video_filter === 'grayscale' ? 'grayscale(1)' : 'none';
		ctx.drawImage(video, 0, 0, w, h);
		ctx.restore();
	}

	function clamp(value: number, min: number, max: number): number {
		return Math.min(max, Math.max(min, value));
	}

	function getTextScalePercent(slide: VideoCarouselSlide): number {
		return clamp(slide.text_scale_percent ?? 100, MIN_TEXT_SCALE_PERCENT, MAX_TEXT_SCALE_PERCENT);
	}

	function getTextScale(slide: VideoCarouselSlide): number {
		return getTextScalePercent(slide) / 100;
	}

	function getTextTransformOriginPercent(slide: VideoCarouselSlide): { x: number; y: number } {
		if (slide.layout_type === 'quiz') return { x: 50, y: 56 };
		if (slide.layout_type === 'listicle' || slide.layout_type === 'stat') return { x: 50, y: 50 };
		return { x: 50, y: textPositionPercent(slide) };
	}

	function applyTextCanvasTransform(
		ctx: CanvasRenderingContext2D,
		slide: VideoCarouselSlide,
		w: number,
		h: number
	) {
		const origin = getTextTransformOriginPercent(slide);
		const originX = (origin.x / 100) * w;
		const originY = (origin.y / 100) * h;
		ctx.translate(originX + (slide.text_offset_x_px ?? 0), originY + (slide.text_offset_y_px ?? 0));
		ctx.scale(getTextScale(slide), getTextScale(slide));
		ctx.translate(-originX, -originY);
	}

	function drawQuizLayout(ctx: CanvasRenderingContext2D, slide: VideoCarouselSlide, w: number, h: number) {
		const font = VIDEO_FONT_MAP[fontPreset] ?? VIDEO_FONT_MAP.biglot;

		// Full dark overlay for readability
		ctx.fillStyle = 'rgba(0,0,0,0.62)';
		ctx.fillRect(0, 0, w, h);

		const padX = w * 0.08;
		const titleY = h * 0.22;
		const optionsStartY = h * 0.42;
		const optionLineH = h * 0.083;

		ctx.save();
		applyTextCanvasTransform(ctx, slide, w, h);

		// ── Title (text) ─────────────────────────────────────────────────────
		ctx.save();
		ctx.textAlign = 'center';
		ctx.textBaseline = 'middle';
		ctx.fillStyle = '#ffffff';
		ctx.font = `bold ${Math.round(w * 0.082)}px ${font}`;
		ctx.shadowColor = 'rgba(0,0,0,0.8)';
		ctx.shadowBlur = 14;
		const titleText = isEditingSlideField(slide, 'text') ? draftValue : slide.text;
		wrapTextCentered(ctx, titleText, w / 2, titleY, w - padX * 2, Math.round(w * 0.095));
		ctx.restore();

		// ── Accent text (gold) ───────────────────────────────────────────────
		const accentText = isEditingSlideField(slide, 'accent') ? draftValue : (slide.accent_text ?? '');
		if (accentText) {
			ctx.save();
			ctx.textAlign = 'center';
			ctx.textBaseline = 'middle';
			ctx.fillStyle = ACCENT_COLOR;
			ctx.font = `bold ${Math.round(w * 0.072)}px ${font}`;
			ctx.shadowColor = 'rgba(0,0,0,0.6)';
			ctx.shadowBlur = 10;
			ctx.fillText(accentText, w / 2, titleY + Math.round(w * 0.12));
			ctx.restore();
		}

		// ── Options ──────────────────────────────────────────────────────────
		const options = editingSlideId === slide.id && editingField !== null && typeof editingField === 'number'
			? slide.options.map((o, i) => (i === editingField ? draftValue : o))
			: slide.options;

		options.forEach((opt, i) => {
			const y = optionsStartY + i * optionLineH;
			const letter = OPTION_LETTERS[i] ?? String(i + 1);

			// Option row background (subtle)
			ctx.save();
			ctx.fillStyle = 'rgba(255,255,255,0.08)';
			roundRect(ctx, padX * 0.6, y - optionLineH * 0.42, w - padX * 1.2, optionLineH * 0.84, 12);
			ctx.fill();
			ctx.restore();

			// Letter label
			ctx.save();
			ctx.textAlign = 'left';
			ctx.textBaseline = 'middle';
			ctx.fillStyle = ACCENT_COLOR;
			ctx.font = `bold ${Math.round(w * 0.048)}px ${font}`;
			ctx.fillText(`${letter}.`, padX, y);
			ctx.restore();

			// Option text
			ctx.save();
			ctx.textAlign = 'left';
			ctx.textBaseline = 'middle';
			ctx.fillStyle = '#ffffff';
			ctx.font = `${Math.round(w * 0.044)}px ${font}`;
			ctx.shadowColor = 'rgba(0,0,0,0.5)';
			ctx.shadowBlur = 6;
			ctx.fillText(opt, padX + w * 0.1, y);
			ctx.restore();
		});

		ctx.restore();
	}

	function drawStandardLayout(ctx: CanvasRenderingContext2D, slide: VideoCarouselSlide, w: number, h: number) {
		const font = VIDEO_FONT_MAP[fontPreset] ?? VIDEO_FONT_MAP.biglot;
		const posX = w / 2;
		const posY = slide.text_position === 'top' ? h * 0.18 : slide.text_position === 'bottom' ? h * 0.8 : h * 0.5;
		const isTop = slide.text_position === 'top';

		const grad = ctx.createLinearGradient(0, isTop ? 0 : h * 0.55, 0, isTop ? h * 0.45 : h);
		grad.addColorStop(0, 'rgba(0,0,0,0.6)');
		grad.addColorStop(1, 'rgba(0,0,0,0)');
		ctx.fillStyle = grad;
		ctx.fillRect(0, isTop ? 0 : h * 0.55, w, h * 0.45);

		const text = isEditingSlideField(slide, 'text') ? draftValue : slide.text;
		ctx.save();
		applyTextCanvasTransform(ctx, slide, w, h);
		ctx.save();
		ctx.textAlign = 'center';
		ctx.textBaseline = 'middle';
		ctx.fillStyle = '#ffffff';
		ctx.shadowColor = 'rgba(0,0,0,0.7)';
		ctx.shadowBlur = 12;
		ctx.font = `bold ${Math.round(w * 0.072)}px ${font}`;
		wrapTextCentered(ctx, text, posX, posY, w * 0.85, Math.round(w * 0.09));
		ctx.restore();

		const sub = isEditingSlideField(slide, 'subtext') ? draftValue : (slide.subtext ?? '');
		if (sub) {
			ctx.save();
			ctx.textAlign = 'center';
			ctx.textBaseline = 'middle';
			ctx.fillStyle = 'rgba(255,255,255,0.85)';
			ctx.font = `${Math.round(w * 0.038)}px ${font}`;
			ctx.fillText(sub, posX, posY + Math.round(w * 0.12));
			ctx.restore();
		}
		ctx.restore();
	}

	function drawQuoteLayout(ctx: CanvasRenderingContext2D, slide: VideoCarouselSlide, w: number, h: number) {
		const font = VIDEO_FONT_MAP[fontPreset] ?? VIDEO_FONT_MAP.biglot;
		const posX = w / 2;
		const posY = slide.text_position === 'top' ? h * 0.28 : slide.text_position === 'bottom' ? h * 0.72 : h * 0.5;
		const text = isEditingSlideField(slide, 'text') ? draftValue : slide.text;
		const sub = isEditingSlideField(slide, 'subtext') ? draftValue : (slide.subtext ?? '');

		ctx.fillStyle = 'rgba(2, 6, 23, 0.56)';
		ctx.fillRect(0, 0, w, h);

		ctx.save();
		applyTextCanvasTransform(ctx, slide, w, h);
		ctx.save();
		ctx.textAlign = 'center';
		ctx.textBaseline = 'middle';
		ctx.fillStyle = '#ffffff';
		ctx.shadowColor = 'rgba(0,0,0,0.75)';
		ctx.shadowBlur = 14;
		ctx.font = `bold ${Math.round(w * 0.07)}px ${font}`;
		wrapTextCentered(ctx, text, posX, posY, w * 0.78, Math.round(w * 0.09));
		ctx.restore();

		if (sub) {
			ctx.save();
			ctx.textAlign = 'center';
			ctx.textBaseline = 'middle';
			ctx.fillStyle = ACCENT_COLOR;
			ctx.font = `bold ${Math.round(w * 0.033)}px ${font}`;
			ctx.fillText(sub, posX, posY + Math.round(w * 0.17));
			ctx.restore();
		}
		ctx.restore();
	}

	function drawFrame() {
		if (!canvasEl || !videoEl || !activeSlide) return;
		const ctx = canvasEl.getContext('2d');
		if (!ctx) return;
		const w = canvasEl.width;
		const h = canvasEl.height;

		drawVideoFrame(ctx, videoEl, activeSlide, w, h);

		if (activeSlide.layout_type === 'quiz') {
			drawQuizLayout(ctx, activeSlide, w, h);
		} else if (activeSlide.layout_type === 'quote') {
			drawQuoteLayout(ctx, activeSlide, w, h);
		} else if (activeSlide.layout_type === 'listicle') {
			drawListicleLayout(ctx, activeSlide, w, h);
		} else if (activeSlide.layout_type === 'stat') {
			drawStatLayout(ctx, activeSlide, w, h);
		} else {
			drawStandardLayout(ctx, activeSlide, w, h);
		}

		animFrameId = requestAnimationFrame(drawFrame);
	}

	function drawListicleLayout(ctx: CanvasRenderingContext2D, slide: VideoCarouselSlide, w: number, h: number) {
		const font = VIDEO_FONT_MAP[fontPreset] ?? VIDEO_FONT_MAP.biglot;

		const grad = ctx.createLinearGradient(0, 0, 0, h);
		grad.addColorStop(0, 'rgba(0,0,0,0.55)');
		grad.addColorStop(0.5, 'rgba(0,0,0,0.45)');
		grad.addColorStop(1, 'rgba(0,0,0,0.7)');
		ctx.fillStyle = grad;
		ctx.fillRect(0, 0, w, h);

		const centerX = w / 2;
		const centerY = h * 0.5;

		ctx.save();
		applyTextCanvasTransform(ctx, slide, w, h);

		const rankRaw = isEditingSlideField(slide, 'accent') ? draftValue : (slide.accent_text ?? '');
		const rankText = rankRaw.trim();
		if (rankText) {
			ctx.save();
			ctx.textAlign = 'center';
			ctx.textBaseline = 'middle';
			ctx.fillStyle = ACCENT_COLOR;
			ctx.shadowColor = 'rgba(0,0,0,0.7)';
			ctx.shadowBlur = 16;
			ctx.font = `900 ${Math.round(w * 0.24)}px ${font}`;
			ctx.fillText(rankText, centerX, centerY - Math.round(h * 0.16));
			ctx.restore();
		}

		const titleText = isEditingSlideField(slide, 'text') ? draftValue : slide.text;
		if (titleText) {
			ctx.save();
			ctx.textAlign = 'center';
			ctx.textBaseline = 'middle';
			ctx.fillStyle = '#ffffff';
			ctx.shadowColor = 'rgba(0,0,0,0.8)';
			ctx.shadowBlur = 14;
			ctx.font = `bold ${Math.round(w * 0.085)}px ${font}`;
			wrapTextCentered(ctx, titleText, centerX, centerY + Math.round(h * 0.02), w * 0.82, Math.round(w * 0.105));
			ctx.restore();
		}

		const sub = isEditingSlideField(slide, 'subtext') ? draftValue : (slide.subtext ?? '');
		if (sub) {
			ctx.save();
			ctx.textAlign = 'center';
			ctx.textBaseline = 'middle';
			ctx.fillStyle = 'rgba(255,255,255,0.88)';
			ctx.shadowColor = 'rgba(0,0,0,0.7)';
			ctx.shadowBlur = 10;
			ctx.font = `${Math.round(w * 0.038)}px ${font}`;
			wrapTextCentered(ctx, sub, centerX, centerY + Math.round(h * 0.16), w * 0.78, Math.round(w * 0.05));
			ctx.restore();
		}

		ctx.restore();
	}

	function drawStatLayout(ctx: CanvasRenderingContext2D, slide: VideoCarouselSlide, w: number, h: number) {
		const font = VIDEO_FONT_MAP[fontPreset] ?? VIDEO_FONT_MAP.biglot;

		ctx.fillStyle = 'rgba(0,0,0,0.6)';
		ctx.fillRect(0, 0, w, h);

		const centerX = w / 2;
		const centerY = h * 0.5;

		ctx.save();
		applyTextCanvasTransform(ctx, slide, w, h);

		const numberText = (isEditingSlideField(slide, 'text') ? draftValue : slide.text).trim();
		const unitText = (isEditingSlideField(slide, 'accent') ? draftValue : (slide.accent_text ?? '')).trim();

		if (numberText) {
			ctx.save();
			ctx.fillStyle = '#ffffff';
			ctx.shadowColor = 'rgba(0,0,0,0.8)';
			ctx.shadowBlur = 18;
			const numberFontSize = Math.round(w * 0.32);
			const unitFontSize = Math.round(w * 0.13);

			ctx.font = `900 ${numberFontSize}px ${font}`;
			const numberWidth = ctx.measureText(numberText).width;
			ctx.font = `900 ${unitFontSize}px ${font}`;
			const unitWidth = unitText ? ctx.measureText(unitText).width : 0;
			const gap = unitText ? Math.round(w * 0.018) : 0;
			const totalWidth = numberWidth + gap + unitWidth;
			const startX = centerX - totalWidth / 2;
			const baselineY = centerY - Math.round(h * 0.04);

			ctx.font = `900 ${numberFontSize}px ${font}`;
			ctx.textBaseline = 'alphabetic';
			ctx.textAlign = 'left';
			ctx.fillText(numberText, startX, baselineY + numberFontSize * 0.35);

			if (unitText) {
				ctx.fillStyle = ACCENT_COLOR;
				ctx.font = `900 ${unitFontSize}px ${font}`;
				ctx.fillText(unitText, startX + numberWidth + gap, baselineY + numberFontSize * 0.35);
			}
			ctx.restore();
		}

		const claim = isEditingSlideField(slide, 'subtext') ? draftValue : (slide.subtext ?? '');
		if (claim) {
			ctx.save();
			ctx.textAlign = 'center';
			ctx.textBaseline = 'middle';
			ctx.fillStyle = '#ffffff';
			ctx.shadowColor = 'rgba(0,0,0,0.75)';
			ctx.shadowBlur = 12;
			ctx.font = `bold ${Math.round(w * 0.055)}px ${font}`;
			wrapTextCentered(ctx, claim, centerX, centerY + Math.round(h * 0.16), w * 0.84, Math.round(w * 0.07));
			ctx.restore();
		}

		const sourceRaw = editingSlideId === slide.id && editingField === 0
			? draftValue
			: (slide.options[0] ?? '');
		const sourceText = sourceRaw.trim();
		if (sourceText) {
			ctx.save();
			ctx.textAlign = 'center';
			ctx.textBaseline = 'middle';
			ctx.fillStyle = 'rgba(255,255,255,0.7)';
			ctx.font = `${Math.round(w * 0.028)}px ${font}`;
			ctx.fillText(sourceText, centerX, h * 0.92);
			ctx.restore();
		}

		ctx.restore();
	}

	function wrapTextCentered(ctx: CanvasRenderingContext2D, text: string, x: number, y: number, maxWidth: number, lineH: number) {
		const words = text.split(' ');
		let line = '';
		const lines: string[] = [];
		for (const word of words) {
			const test = line ? `${line} ${word}` : word;
			if (ctx.measureText(test).width > maxWidth && line) { lines.push(line); line = word; }
			else line = test;
		}
		if (line) lines.push(line);
		lines.forEach((l, i) => ctx.fillText(l, x, y - ((lines.length - 1) * lineH) / 2 + i * lineH));
	}

	function roundRect(ctx: CanvasRenderingContext2D, x: number, y: number, w: number, h: number, r: number) {
		ctx.beginPath();
		ctx.moveTo(x + r, y);
		ctx.lineTo(x + w - r, y);
		ctx.arcTo(x + w, y, x + w, y + r, r);
		ctx.lineTo(x + w, y + h - r);
		ctx.arcTo(x + w, y + h, x + w - r, y + h, r);
		ctx.lineTo(x + r, y + h);
		ctx.arcTo(x, y + h, x, y + h - r, r);
		ctx.lineTo(x, y + r);
		ctx.arcTo(x, y, x + r, y, r);
		ctx.closePath();
	}

	$effect(() => {
		if (videoEl && canvasEl) {
			if (animFrameId) cancelAnimationFrame(animFrameId);
			drawFrame();
		}
		return () => { if (animFrameId) cancelAnimationFrame(animFrameId); };
	});

	$effect(() => {
		if (!videoEl || !activeSlide?.video_url) return;
		videoEl.src = activeSlide.video_url;
		videoEl.load();
		videoEl.play().catch(() => {});
	});

	$effect(() => {
		return () => {
			if (offsetSaveTimer) clearTimeout(offsetSaveTimer);
		};
	});

	// ── Edit helpers ──────────────────────────────────────────────────────────
	function focusOnMount(node: HTMLInputElement | HTMLTextAreaElement) {
		queueMicrotask(() => {
			node.focus();
			node.select();
		});
	}

	function previewBoxStyle(left: number, top: number, width: number, height: number): string {
		return `left:${left}%; top:${top}%; width:${width}%; height:${height}%;`;
	}

	function getTransformedPreviewBox(
		slide: VideoCarouselSlide,
		left: number,
		top: number,
		width: number,
		height: number
	): LayoutTransformSpec {
		const origin = getTextTransformOriginPercent(slide);
		const scale = getTextScale(slide);
		const transformedLeft = origin.x + getOffsetXPercent(slide) + (left - origin.x) * scale;
		const transformedTop = origin.y + getOffsetYPercent(slide) + (top - origin.y) * scale;
		const transformedWidth = width * scale;
		const transformedHeight = height * scale;

		return {
			left: transformedLeft,
			top: transformedTop,
			width: transformedWidth,
			height: transformedHeight,
			style: previewBoxStyle(transformedLeft, transformedTop, transformedWidth, transformedHeight)
		};
	}

	function getLayoutTransformSpec(slide: VideoCarouselSlide): LayoutTransformSpec {
		if (slide.layout_type === 'quiz') {
			return getTransformedPreviewBox(slide, 50, 56, 92, 72);
		}
		if (slide.layout_type === 'listicle') {
			return getTransformedPreviewBox(slide, 50, 50, 88, 60);
		}
		if (slide.layout_type === 'stat') {
			return getTransformedPreviewBox(slide, 50, 50, 88, 56);
		}
		return getTransformedPreviewBox(
			slide,
			50,
			textPositionPercent(slide),
			slide.layout_type === 'quote' ? 84 : 90,
			slide.layout_type === 'quote' ? 28 : 24
		);
	}

	function textPositionPercent(slide: VideoCarouselSlide): number {
		if (slide.layout_type === 'quote') {
			if (slide.text_position === 'top') return 28;
			if (slide.text_position === 'bottom') return 72;
			return 50;
		}
		if (slide.text_position === 'top') return 18;
		if (slide.text_position === 'bottom') return 80;
		return 50;
	}

	function getOffsetXPercent(slide: VideoCarouselSlide): number {
		return ((slide.text_offset_x_px ?? 0) / VIDEO_CAROUSEL_CANVAS_WIDTH) * 100;
	}

	function getOffsetYPercent(slide: VideoCarouselSlide): number {
		return ((slide.text_offset_y_px ?? 0) / VIDEO_CAROUSEL_CANVAS_HEIGHT) * 100;
	}

	function getPreviewEditSpecs(slide: VideoCarouselSlide): PreviewEditSpec[] {
		if (slide.layout_type === 'quiz') {
			return [
				{
					key: 'text',
					field: 'text',
					label: 'หัวข้อหลัก',
					value: slide.text,
					emptyLabel: 'เพิ่มหัวข้อหลัก',
					multiline: true,
					tone: 'primary',
					targetStyle: getTransformedPreviewBox(slide, 50, 22, 84, 13).style,
					controlStyle: getTransformedPreviewBox(slide, 50, 22, 84, 13).style
				},
				{
					key: 'accent',
					field: 'accent',
					label: 'ข้อความเน้นสีทอง',
					value: slide.accent_text ?? '',
					emptyLabel: 'เพิ่มข้อความเน้น',
					multiline: false,
					tone: 'accent',
					targetStyle: getTransformedPreviewBox(slide, 50, 28.75, 78, 8).style,
					controlStyle: getTransformedPreviewBox(slide, 50, 28.75, 78, 8).style
				},
				...slide.options.map((option, i) => ({
					key: `option-${i}`,
					field: i,
					label: `ตัวเลือก ${OPTION_LETTERS[i] ?? i + 1}`,
					value: option,
					emptyLabel: `เพิ่มตัวเลือก ${OPTION_LETTERS[i] ?? i + 1}`,
					multiline: false,
					tone: 'option' as const,
					targetStyle: getTransformedPreviewBox(slide, 50, 42 + i * 8.3, 90, 7).style,
					controlStyle: getTransformedPreviewBox(slide, 55, 42 + i * 8.3, 70, 6.2).style
				}))
			];
		}

		if (slide.layout_type === 'listicle') {
			return [
				{
					key: 'accent',
					field: 'accent',
					label: 'อันดับ',
					value: slide.accent_text ?? '',
					emptyLabel: 'เช่น #5',
					multiline: false,
					tone: 'accent',
					targetStyle: getTransformedPreviewBox(slide, 50, 34, 50, 16).style,
					controlStyle: getTransformedPreviewBox(slide, 50, 34, 50, 16).style
				},
				{
					key: 'text',
					field: 'text',
					label: 'หัวข้อย่อย',
					value: slide.text,
					emptyLabel: 'เพิ่มหัวข้อย่อย',
					multiline: true,
					tone: 'primary',
					targetStyle: getTransformedPreviewBox(slide, 50, 52, 82, 14).style,
					controlStyle: getTransformedPreviewBox(slide, 50, 52, 82, 14).style
				},
				{
					key: 'subtext',
					field: 'subtext',
					label: 'Caption',
					value: slide.subtext ?? '',
					emptyLabel: 'เพิ่ม caption',
					multiline: false,
					tone: 'option',
					targetStyle: getTransformedPreviewBox(slide, 50, 66, 78, 7).style,
					controlStyle: getTransformedPreviewBox(slide, 50, 66, 78, 7).style
				}
			];
		}

		if (slide.layout_type === 'stat') {
			return [
				{
					key: 'text',
					field: 'text',
					label: 'ตัวเลขใหญ่',
					value: slide.text,
					emptyLabel: 'เช่น 90',
					multiline: false,
					tone: 'primary',
					targetStyle: getTransformedPreviewBox(slide, 50, 46, 60, 22).style,
					controlStyle: getTransformedPreviewBox(slide, 50, 46, 60, 22).style
				},
				{
					key: 'accent',
					field: 'accent',
					label: 'หน่วย',
					value: slide.accent_text ?? '',
					emptyLabel: 'เช่น %',
					multiline: false,
					tone: 'accent',
					targetStyle: getTransformedPreviewBox(slide, 78, 46, 18, 14).style,
					controlStyle: getTransformedPreviewBox(slide, 78, 46, 18, 14).style
				},
				{
					key: 'subtext',
					field: 'subtext',
					label: 'Claim',
					value: slide.subtext ?? '',
					emptyLabel: 'เพิ่มคำอธิบาย',
					multiline: true,
					tone: 'primary',
					targetStyle: getTransformedPreviewBox(slide, 50, 66, 84, 10).style,
					controlStyle: getTransformedPreviewBox(slide, 50, 66, 84, 10).style
				},
				{
					key: 'option-0',
					field: 0,
					label: 'Source / อ้างอิง',
					value: slide.options[0] ?? '',
					emptyLabel: 'เพิ่ม source (ไม่บังคับ)',
					multiline: false,
					tone: 'option',
					targetStyle: getTransformedPreviewBox(slide, 50, 92, 70, 5).style,
					controlStyle: getTransformedPreviewBox(slide, 50, 92, 70, 5).style
				}
			];
		}

		const subOffset = slide.layout_type === 'quote' ? 9.6 : 6.75;
		return [
			{
				key: 'text',
				field: 'text',
				label: 'ข้อความหลัก',
				value: slide.text,
				emptyLabel: 'เพิ่มข้อความหลัก',
				multiline: true,
				tone: 'primary',
				targetStyle: getTransformedPreviewBox(slide, 50, textPositionPercent(slide), slide.layout_type === 'quote' ? 78 : 85, 16).style,
				controlStyle: getTransformedPreviewBox(slide, 50, textPositionPercent(slide), slide.layout_type === 'quote' ? 78 : 85, 16).style
			},
			{
				key: 'subtext',
				field: 'subtext',
				label: 'ข้อความรอง',
				value: slide.subtext ?? '',
				emptyLabel: 'เพิ่มข้อความรอง',
				multiline: false,
				tone: 'accent',
				targetStyle: getTransformedPreviewBox(slide, 50, textPositionPercent(slide) + subOffset, 70, 6).style,
				controlStyle: getTransformedPreviewBox(slide, 50, textPositionPercent(slide) + subOffset, 70, 6).style
			}
		];
	}

	function isPanelEditing(field: EditableField): boolean {
		return !!activeSlide && editingSurface === 'panel' && isEditingSlideField(activeSlide, field);
	}

	function isPreviewEditing(field: EditableField): boolean {
		return !!activeSlide && editingSurface === 'preview' && isEditingSlideField(activeSlide, field);
	}

	function startEdit(field: EditableField, surface: EditSurface = 'panel') {
		if (!activeSlide) return;
		if (field === 'text') draftValue = activeSlide.text;
		else if (field === 'accent') draftValue = activeSlide.accent_text ?? '';
		else if (field === 'subtext') draftValue = activeSlide.subtext ?? '';
		else draftValue = activeSlide.options[field as number] ?? '';
		editingField = field;
		editingSlideId = activeSlide.id;
		editingSurface = surface;
		selectedTransformSlideId = activeSlide.id;
	}

	function cancelEdit() {
		editingField = null;
		editingSlideId = null;
		editingSurface = null;
		draftValue = '';
	}

	async function commitEdit() {
		if (editingField === null || !editingSlideId) return;
		const field = editingField;
		const slideId = editingSlideId;
		const slide = slides.find((item) => item.id === slideId);
		if (!slide) {
			cancelEdit();
			return;
		}
		editingField = null;
		editingSlideId = null;
		editingSurface = null;

		if (field === 'text') {
			if (draftValue.trim() === slide.text) return;
			await patchSlide(slideId, { text: draftValue.trim() });
		} else if (field === 'accent') {
			const val = draftValue.trim() || null;
			if (val === slide.accent_text) return;
			await patchSlide(slideId, { accent_text: val });
		} else if (field === 'subtext') {
			const val = draftValue.trim() || null;
			if (val === slide.subtext) return;
			await patchSlide(slideId, { subtext: val });
		} else {
			const idx = field as number;
			const newOptions = [...slide.options];
			newOptions[idx] = draftValue.trim();
			await patchSlide(slideId, { options_json: newOptions });
		}
	}

	function handlePreviewEditKeydown(event: KeyboardEvent, multiline: boolean) {
		if (event.key === 'Escape') {
			event.preventDefault();
			cancelEdit();
			return;
		}
		if (event.key === 'Enter' && (!multiline || event.metaKey || event.ctrlKey)) {
			event.preventDefault();
			void commitEdit();
		}
	}

	async function setTextPosition(position: VideoTextPosition) {
		if (!activeSlide || activeSlide.text_position === position) return;
		await patchSlide(activeSlide.id, { text_position: position });
	}

	async function setVideoFilter(filter: VideoFilterType) {
		if (!activeSlide || activeSlide.video_filter === filter) return;
		await patchSlide(activeSlide.id, { video_filter: filter });
	}

	function updateSlideLocal(slideId: string, patch: Partial<VideoCarouselSlide>) {
		slides = slides.map((slide) => (slide.id === slideId ? { ...slide, ...patch } : slide));
	}

	function setTextOffset(axis: 'x' | 'y', value: number) {
		if (!activeSlide) return;
		const slideId = activeSlide.id;
		const field = axis === 'x' ? 'text_offset_x_px' : 'text_offset_y_px';
		const limit = axis === 'x' ? VIDEO_CAROUSEL_CANVAS_WIDTH * 0.55 : VIDEO_CAROUSEL_CANVAS_HEIGHT * 0.55;
		const normalized = Math.round(clamp(value, -limit, limit));
		updateSlideLocal(slideId, { [field]: normalized } as Partial<VideoCarouselSlide>);

		if (offsetSaveTimer) clearTimeout(offsetSaveTimer);
		offsetSaveTimer = setTimeout(() => {
			void patchSlide(slideId, { [field]: normalized });
			offsetSaveTimer = null;
		}, 350);
	}

	function setTextScale(value: number) {
		if (!activeSlide) return;
		const slideId = activeSlide.id;
		const normalized = Math.round(clamp(value, MIN_TEXT_SCALE_PERCENT, MAX_TEXT_SCALE_PERCENT));
		updateSlideLocal(slideId, { text_scale_percent: normalized });

		if (offsetSaveTimer) clearTimeout(offsetSaveTimer);
		offsetSaveTimer = setTimeout(() => {
			void patchSlide(slideId, { text_scale_percent: normalized });
			offsetSaveTimer = null;
		}, 350);
	}

	async function resetLayoutTransform() {
		if (!activeSlide) return;
		if (offsetSaveTimer) {
			clearTimeout(offsetSaveTimer);
			offsetSaveTimer = null;
		}
		const slideId = activeSlide.id;
		updateSlideLocal(slideId, { text_offset_x_px: 0, text_offset_y_px: 0, text_scale_percent: 100 });
		await patchSlide(slideId, { text_offset_x_px: 0, text_offset_y_px: 0, text_scale_percent: 100 });
	}

	function startLayoutTransform(event: PointerEvent, mode: 'move' | 'resize') {
		if (!activeSlide || !canvasEl || editingField !== null) return;
		event.preventDefault();
		event.stopPropagation();
		if (offsetSaveTimer) {
			clearTimeout(offsetSaveTimer);
			offsetSaveTimer = null;
		}

		const rect = canvasEl.getBoundingClientRect();
		const spec = getLayoutTransformSpec(activeSlide);
		const originClientX = rect.left + (spec.left / 100) * rect.width;
		const originClientY = rect.top + (spec.top / 100) * rect.height;
		const startDistance = Math.max(
			8,
			Math.hypot(event.clientX - originClientX, event.clientY - originClientY)
		);

		selectedTransformSlideId = activeSlide.id;
		transformDrag = {
			slideId: activeSlide.id,
			mode,
			startClientX: event.clientX,
			startClientY: event.clientY,
			startOffsetX: activeSlide.text_offset_x_px ?? 0,
			startOffsetY: activeSlide.text_offset_y_px ?? 0,
			startScalePercent: getTextScalePercent(activeSlide),
			startDistance,
			originClientX,
			originClientY,
			canvasRect: rect
		};
	}

	function handleLayoutTransformPointerMove(event: PointerEvent) {
		if (!transformDrag) return;
		const slide = slides.find((item) => item.id === transformDrag?.slideId);
		if (!slide) return;

		if (transformDrag.mode === 'move') {
			const dx = (event.clientX - transformDrag.startClientX) * (VIDEO_CAROUSEL_CANVAS_WIDTH / transformDrag.canvasRect.width);
			const dy = (event.clientY - transformDrag.startClientY) * (VIDEO_CAROUSEL_CANVAS_HEIGHT / transformDrag.canvasRect.height);
			updateSlideLocal(slide.id, {
				text_offset_x_px: Math.round(clamp(transformDrag.startOffsetX + dx, -VIDEO_CAROUSEL_CANVAS_WIDTH * 0.55, VIDEO_CAROUSEL_CANVAS_WIDTH * 0.55)),
				text_offset_y_px: Math.round(clamp(transformDrag.startOffsetY + dy, -VIDEO_CAROUSEL_CANVAS_HEIGHT * 0.55, VIDEO_CAROUSEL_CANVAS_HEIGHT * 0.55))
			});
			return;
		}

		const distance = Math.max(
			8,
			Math.hypot(event.clientX - transformDrag.originClientX, event.clientY - transformDrag.originClientY)
		);
		const nextScale = Math.round(
			clamp(
				transformDrag.startScalePercent * (distance / transformDrag.startDistance),
				MIN_TEXT_SCALE_PERCENT,
				MAX_TEXT_SCALE_PERCENT
			)
		);
		updateSlideLocal(slide.id, { text_scale_percent: nextScale });
	}

	function handleLayoutTransformPointerUp() {
		if (!transformDrag) return;
		const slide = slides.find((item) => item.id === transformDrag?.slideId);
		const slideId = transformDrag.slideId;
		transformDrag = null;
		if (!slide) return;
		void patchSlide(slideId, {
			text_offset_x_px: slide.text_offset_x_px,
			text_offset_y_px: slide.text_offset_y_px,
			text_scale_percent: slide.text_scale_percent
		});
	}

	function addOption() {
		if (!activeSlide || activeSlide.options.length >= 6) return;
		const newOptions = [...activeSlide.options, ''];
		patchSlide(activeSlide.id, { options_json: newOptions });
	}

	function removeOption(idx: number) {
		if (!activeSlide || activeSlide.options.length <= 2) return;
		const newOptions = activeSlide.options.filter((_, i) => i !== idx);
		patchSlide(activeSlide.id, { options_json: newOptions });
	}

	async function patchSlide(slideId: string, patch: Record<string, unknown>) {
		try {
			const res = await fetch(`/api/video-carousel/slides/${slideId}`, {
				method: 'PATCH',
				headers: { 'Content-Type': 'application/json' },
				body: JSON.stringify(patch)
			});
			if (!res.ok) throw new Error('Patch failed');
			const updated: VideoCarouselSlide = await res.json();
			slides = slides.map((s) => (s.id === slideId ? updated : s));
		} catch {
			toast.error('บันทึกไม่สำเร็จ');
		}
	}

	// ── Swap ──────────────────────────────────────────────────────────────────
	async function openSwapPanel() {
		if (!activeSlide?.search_query) return;
		showSwapPanel = true;
		loadingSwap = true;
		swapCandidates = [];
		try {
			const res = await fetch(`/api/video-carousel/search-videos?q=${encodeURIComponent(activeSlide.search_query)}`);
			if (!res.ok) throw new Error();
			const d = await res.json();
			swapCandidates = d.videos ?? [];
		} catch {
			toast.error('ค้นหา video ไม่สำเร็จ');
		} finally {
			loadingSwap = false;
		}
	}

	async function swapVideo(c: typeof swapCandidates[number]) {
		if (!activeSlide) return;
		showSwapPanel = false;
		await patchSlide(activeSlide.id, { pexels_video_id: c.id, video_url: c.video_url, thumbnail_url: c.thumbnail_url });
	}

	function openUploadVideoPicker() {
		if (!activeSlide || uploadingVideo) return;
		if (!uploadVideoInputEl) return;
		uploadVideoInputEl.value = '';
		uploadVideoInputEl.click();
	}

	function validateUploadVideo(file: File): string | null {
		if (!SUPPORTED_UPLOAD_VIDEO_TYPES.has(file.type)) return 'รองรับเฉพาะไฟล์วิดีโอ MP4 หรือ WEBM';
		if (file.size <= 0) return 'ไฟล์วิดีโอว่างเปล่า';
		if (file.size > MAX_UPLOAD_VIDEO_BYTES) return 'ไฟล์วิดีโอใหญ่เกิน 100MB';
		return null;
	}

	async function handleUploadVideoChange(event: Event) {
		if (!project || !activeSlide) return;
		const input = event.currentTarget as HTMLInputElement;
		const file = input.files?.[0];
		if (!file) return;

		const validationError = validateUploadVideo(file);
		if (validationError) {
			toast.error(validationError);
			input.value = '';
			return;
		}

		uploadingVideo = true;
		try {
			const formData = new FormData();
			formData.append('file', file);
			const res = await fetch(`/api/video-carousel/projects/${project.id}/slides/${activeSlide.id}/upload-video`, {
				method: 'POST',
				body: formData
			});
			const data = await res.json();
			if (!res.ok) throw new Error(data.error ?? 'Upload failed');
			const updated = data.slide as VideoCarouselSlide;
			slides = slides.map((slide) => (slide.id === updated.id ? updated : slide));
			showSwapPanel = false;
			toast.success('อัปโหลด video สำเร็จ');
		} catch (error) {
			toast.error(error instanceof Error ? error.message : 'อัปโหลด video ไม่สำเร็จ');
		} finally {
			uploadingVideo = false;
			input.value = '';
		}
	}

	// ── Font save ─────────────────────────────────────────────────────────────
	async function saveFontPreset() {
		if (!project) return;
		try {
			const res = await fetch(`/api/video-carousel/projects/${project.id}`, {
				method: 'PATCH',
				headers: { 'Content-Type': 'application/json' },
				body: JSON.stringify({ font_preset: fontPreset })
			});
			if (!res.ok) throw new Error();
			project = await res.json();
			showSettings = false;
			toast.success('บันทึก font สำเร็จ');
		} catch {
			toast.error('บันทึกไม่สำเร็จ');
		}
	}

	function formatExportError(error: unknown): string {
		if (error instanceof Error && error.message) return error.message;
		if (typeof error === 'string' && error.trim()) return error;
		return 'Export ล้มเหลว';
	}

	function getMediaErrorMessage(video: HTMLVideoElement, fallback: string): string {
		const error = video.error;
		if (!error) return fallback;
		const labels: Record<number, string> = {
			1: 'การโหลด video ถูกยกเลิก',
			2: 'โหลด video จากเครือข่ายไม่สำเร็จ',
			3: 'ถอดรหัส video ไม่สำเร็จ',
			4: 'browser ไม่รองรับไฟล์ video นี้'
		};
		const label = labels[error.code] ?? fallback;
		return error.message ? `${label}: ${error.message}` : label;
	}

	function waitForVideoReady(video: HTMLVideoElement, clipLabel: string): Promise<void> {
		if (video.readyState >= 2) return Promise.resolve();
		return new Promise((resolve, reject) => {
			const timeout = window.setTimeout(() => {
				cleanup();
				reject(new Error(`${clipLabel}: โหลด video นานเกินไป`));
			}, 15000);

			function cleanup() {
				window.clearTimeout(timeout);
				video.removeEventListener('loadeddata', onReady);
				video.removeEventListener('canplay', onReady);
				video.removeEventListener('error', onError);
			}

			function onReady() {
				if (video.readyState < 2) return;
				cleanup();
				resolve();
			}

			function onError() {
				cleanup();
				reject(new Error(`${clipLabel}: ${getMediaErrorMessage(video, 'โหลด video ไม่สำเร็จ')}`));
			}

			video.addEventListener('loadeddata', onReady);
			video.addEventListener('canplay', onReady);
			video.addEventListener('error', onError);
		});
	}

	function loadExportVideo(src: string, clipLabel: string): Promise<HTMLVideoElement> {
		const video = document.createElement('video');
		video.crossOrigin = 'anonymous';
		video.preload = 'auto';
		video.muted = true;
		video.playsInline = true;
		video.src = src;
		video.load();
		return waitForVideoReady(video, clipLabel).then(() => video);
	}

	function seekVideo(video: HTMLVideoElement, time: number, clipLabel: string): Promise<void> {
		const duration = Number.isFinite(video.duration) && video.duration > 0 ? video.duration : time;
		const safeTime = Math.min(Math.max(time, 0), Math.max(duration - 0.05, 0));
		if (Math.abs(video.currentTime - safeTime) < 0.001 && video.readyState >= 2) return Promise.resolve();

		return new Promise((resolve, reject) => {
			const timeout = window.setTimeout(() => {
				cleanup();
				reject(new Error(`${clipLabel}: seek video นานเกินไป`));
			}, 10000);

			function cleanup() {
				window.clearTimeout(timeout);
				video.removeEventListener('seeked', onSeeked);
				video.removeEventListener('error', onError);
			}

			function onSeeked() {
				cleanup();
				resolve();
			}

			function onError() {
				cleanup();
				reject(new Error(`${clipLabel}: ${getMediaErrorMessage(video, 'seek video ไม่สำเร็จ')}`));
			}

			video.addEventListener('seeked', onSeeked);
			video.addEventListener('error', onError);
			video.currentTime = safeTime;
		});
	}

	const RECORDING_MIME_TYPES = [
		'video/mp4;codecs=avc1.42E01E',
		'video/mp4',
		'video/webm;codecs=vp9',
		'video/webm;codecs=vp8',
		'video/webm'
	] as const;

	function getSupportedRecordingMimeType(): string {
		const mimeType = RECORDING_MIME_TYPES.find((type) => MediaRecorder.isTypeSupported(type));
		if (!mimeType) throw new Error('browser ไม่รองรับการบันทึก video จาก canvas');
		return mimeType;
	}

	function getRecordingExtension(mimeType: string): 'mp4' | 'webm' {
		return mimeType.includes('mp4') ? 'mp4' : 'webm';
	}

	function createRecording(stream: MediaStream, mimeType: string): {
		recorder: MediaRecorder;
		done: Promise<Blob>;
	} {
		const chunks: Blob[] = [];
		const recorder = new MediaRecorder(stream, {
			mimeType,
			videoBitsPerSecond: 10_000_000
		});
		const done = new Promise<Blob>((resolve, reject) => {
			recorder.ondataavailable = (event) => {
				if (event.data.size > 0) chunks.push(event.data);
			};
			recorder.onerror = () => reject(new Error('บันทึก video stream ไม่สำเร็จ'));
			recorder.onstop = () => {
				if (!chunks.length) {
					reject(new Error('ไม่ได้รับข้อมูล video จาก recorder'));
					return;
				}
				resolve(new Blob(chunks, { type: mimeType }));
			};
		});
		return { recorder, done };
	}

	function drawExportFrame(
		ctx: CanvasRenderingContext2D,
		canvas: HTMLCanvasElement,
		video: HTMLVideoElement,
		slide: VideoCarouselSlide
	) {
		drawVideoFrame(ctx, video, slide, canvas.width, canvas.height);
		if (slide.layout_type === 'quiz') {
			drawQuizLayout(ctx, slide, canvas.width, canvas.height);
		} else if (slide.layout_type === 'quote') {
			drawQuoteLayout(ctx, slide, canvas.width, canvas.height);
		} else if (slide.layout_type === 'listicle') {
			drawListicleLayout(ctx, slide, canvas.width, canvas.height);
		} else if (slide.layout_type === 'stat') {
			drawStatLayout(ctx, slide, canvas.width, canvas.height);
		} else {
			drawStandardLayout(ctx, slide, canvas.width, canvas.height);
		}
	}

	async function renderRecordedSlide(
		ctx: CanvasRenderingContext2D,
		canvas: HTMLCanvasElement,
		video: HTMLVideoElement,
		slide: VideoCarouselSlide,
		clipLabel: string,
		progressStart: number,
		progressEnd: number
	): Promise<void> {
		const durationSeconds = Math.max(0.1, slide.duration_seconds);
		await seekVideo(video, 0, clipLabel);
		video.loop = true;
		await video.play().catch((error: unknown) => {
			throw new Error(`${clipLabel}: เล่น video เพื่อ export ไม่สำเร็จ (${formatExportError(error)})`);
		});

		await new Promise<void>((resolve, reject) => {
			let frameId = 0;
			const startedAt = performance.now();

			function finish() {
				if (frameId) cancelAnimationFrame(frameId);
				video.pause();
			}

			function draw(now: number) {
				const elapsed = Math.min((now - startedAt) / 1000, durationSeconds);
				try {
					drawExportFrame(ctx, canvas, video, slide);
					exportProgress = Math.round(progressStart + (elapsed / durationSeconds) * (progressEnd - progressStart));
				} catch (error) {
					finish();
					reject(error instanceof Error ? error : new Error(formatExportError(error)));
					return;
				}

				if (elapsed >= durationSeconds) {
					finish();
					resolve();
					return;
				}
				frameId = requestAnimationFrame(draw);
			}

			frameId = requestAnimationFrame(draw);
		});
	}

	function downloadBlob(blob: Blob, filename: string) {
		const url = URL.createObjectURL(blob);
		const a = document.createElement('a');
		a.href = url;
		a.download = filename;
		a.click();
		URL.revokeObjectURL(url);
	}

	async function transcodeRecordingToMp4(blob: Blob, inputExtension: 'webm' | 'mp4'): Promise<Blob> {
		exportStatus = 'กำลังแปลงไฟล์เป็น MP4…';
		exportProgress = 90;

		const { FFmpeg } = await import('@ffmpeg/ffmpeg');
		const { fetchFile, toBlobURL } = await import('@ffmpeg/util');
		const ffmpeg = new FFmpeg();
		let lastFfmpegLog = '';
		ffmpeg.on('log', ({ message }) => { lastFfmpegLog = message; });
		ffmpeg.on('progress', ({ progress }) => {
			if (Number.isFinite(progress)) exportProgress = 90 + Math.round(Math.max(0, Math.min(progress, 1)) * 5);
		});

		const baseURL = 'https://unpkg.com/@ffmpeg/core@0.12.6/dist/esm';
		await ffmpeg.load({
			coreURL: await toBlobURL(`${baseURL}/ffmpeg-core.js`, 'text/javascript'),
			wasmURL: await toBlobURL(`${baseURL}/ffmpeg-core.wasm`, 'application/wasm')
		});

		const inputName = `recording.${inputExtension}`;
		await ffmpeg.writeFile(inputName, await fetchFile(blob));
		const exitCode = await ffmpeg.exec([
			'-i', inputName,
			'-c:v', 'libx264',
			'-preset', 'veryfast',
			'-crf', '23',
			'-pix_fmt', 'yuv420p',
			'-movflags', '+faststart',
			'output.mp4'
		]);
		if (exitCode !== 0) {
			throw new Error(`แปลงไฟล์เป็น MP4 ไม่สำเร็จ${lastFfmpegLog ? ` (${lastFfmpegLog})` : ''}`);
		}

		const rawData = await ffmpeg.readFile('output.mp4');
		return new Blob([rawData as unknown as BlobPart], { type: 'video/mp4' });
	}

	// ── Export ────────────────────────────────────────────────────────────────
	async function handleExport() {
		if (!slides.length) return;
		exporting = true;
		exportProgress = 0;
		exportStatus = 'กำลังเตรียม export…';

		let recorder: MediaRecorder | null = null;
		let stream: MediaStream | null = null;
		const preparedVideos: HTMLVideoElement[] = [];

		try {
			const offCanvas = document.createElement('canvas');
			offCanvas.width = VIDEO_CAROUSEL_CANVAS_WIDTH;
			offCanvas.height = VIDEO_CAROUSEL_CANVAS_HEIGHT;
			const offCtx = offCanvas.getContext('2d')!;
			const mimeType = getSupportedRecordingMimeType();

			exportStatus = 'กำลังโหลด video…';
			for (let i = 0; i < slides.length; i++) {
				const slide = slides[i];
				if (!slide.video_url) throw new Error(`Clip ${i + 1}: ไม่มี video URL`);
				const clipLabel = `Clip ${i + 1}/${slides.length}`;
				exportStatus = `${clipLabel}: กำลังโหลด video…`;
				const video = await loadExportVideo(slide.video_url, clipLabel);
				preparedVideos.push(video);
				exportProgress = Math.round(((i + 1) / slides.length) * 10);
			}

			stream = offCanvas.captureStream(24);
			const recording = createRecording(stream, mimeType);
			recorder = recording.recorder;

			drawExportFrame(offCtx, offCanvas, preparedVideos[0], slides[0]);
			recorder.start(1000);

			for (let i = 0; i < slides.length; i++) {
				const slide = slides[i];
				const clipLabel = `Clip ${i + 1}/${slides.length}`;
				exportStatus = `${clipLabel}: กำลัง render…`;
				await renderRecordedSlide(
					offCtx,
					offCanvas,
					preparedVideos[i],
					slide,
					clipLabel,
					10 + (i / slides.length) * 80,
					10 + ((i + 1) / slides.length) * 80
				);
			}

			exportStatus = 'กำลัง finalize video…';
			exportProgress = 90;
			recorder.stop();
			const recordedBlob = await recording.done;
			stream.getTracks().forEach((track) => track.stop());
			stream = null;

			exportProgress = 95;
			exportStatus = 'กำลัง download…';
			const extension = getRecordingExtension(mimeType);
			const outputBlob = extension === 'mp4'
				? recordedBlob
				: await transcodeRecordingToMp4(recordedBlob, extension);
			downloadBlob(outputBlob, `${project?.title ?? 'video-carousel'}.mp4`);

			exportProgress = 100;
			exportStatus = 'เสร็จสิ้น!';
			toast.success('Export สำเร็จ!');
			if (project) {
				await fetch(`/api/video-carousel/projects/${project.id}`, {
					method: 'PATCH',
					headers: { 'Content-Type': 'application/json' },
					body: JSON.stringify({ status: 'exported' })
				});
			}
		} catch (err) {
			const message = formatExportError(err);
			toast.error(message);
			exportStatus = message;
		} finally {
			if (recorder && recorder.state !== 'inactive') recorder.stop();
			if (stream) stream.getTracks().forEach((track) => track.stop());
			for (const video of preparedVideos) {
				video.pause();
				video.removeAttribute('src');
				video.load();
			}
			exporting = false;
		}
	}

	function onKeydown(e: KeyboardEvent) {
		if (transformDrag) return;
		if (editingField !== null) return;
		if (e.key === 'ArrowRight' || e.key === 'ArrowDown') activeIdx = Math.min(activeIdx + 1, slides.length - 1);
		else if (e.key === 'ArrowLeft' || e.key === 'ArrowUp') activeIdx = Math.max(activeIdx - 1, 0);
	}
</script>

<svelte:window
	onkeydown={onKeydown}
	onpointermove={handleLayoutTransformPointerMove}
	onpointerup={handleLayoutTransformPointerUp}
	onpointercancel={handleLayoutTransformPointerUp}
/>

{#if !project}
	<div class="not-found">
		<p>ไม่พบโปรเจกต์</p>
		<Button variant="ghost" onclick={() => goto('/video-carousel')}>← กลับ</Button>
	</div>
{:else}
	<div class="editor-layout">
		<!-- Header -->
		<div class="editor-header">
			<button class="back-btn" onclick={() => goto('/video-carousel')}>←</button>
			<div class="title-stack">
				<h1 class="editor-title">{project.title}</h1>
				<span class="template-pill">{VIDEO_CAROUSEL_TEMPLATE_LABELS[project.template_type]}</span>
			</div>
			<div class="header-actions">
				<Button variant="ghost" onclick={() => (showSettings = !showSettings)}>Font</Button>
				<Button variant="ghost" onclick={openSwapPanel} disabled={!activeSlide}>เปลี่ยน Video</Button>
				<Button
					variant="ghost"
					onclick={openUploadVideoPicker}
					loading={uploadingVideo}
					disabled={!activeSlide || exporting}
				>
					อัปโหลด Video
				</Button>
				<input
					bind:this={uploadVideoInputEl}
					class="upload-video-input"
					type="file"
					accept="video/mp4,video/webm"
					onchange={handleUploadVideoChange}
				/>
				<Button variant="primary" onclick={handleExport} disabled={exporting || uploadingVideo || slides.length === 0}>
					{#if exporting}<Spinner size="sm" />{exportProgress}%{:else}Export MP4{/if}
				</Button>
			</div>
		</div>

		{#if exporting}
			<div class="export-progress-wrap">
				<div class="export-progress-bar" style="width:{exportProgress}%"></div>
				<span class="export-status">{exportStatus}</span>
			</div>
		{/if}

		{#if showSettings}
			<div class="settings-panel">
				<span class="field-label">Font</span>
				<select class="field-select" bind:value={fontPreset}>
					{#each fontOptions as opt}<option value={opt.value}>{opt.label}</option>{/each}
				</select>
				<Button variant="primary" onclick={saveFontPreset}>บันทึก</Button>
				<Button variant="ghost" onclick={() => (showSettings = false)}>ยกเลิก</Button>
			</div>
		{/if}

		<div class="editor-body">
			<!-- Preview -->
			<div class="preview-pane">
				<div class="canvas-wrap">
					<video bind:this={videoEl} class="hidden-video" autoplay loop muted playsinline crossorigin="anonymous"></video>
					<canvas bind:this={canvasEl} width={VIDEO_CAROUSEL_CANVAS_WIDTH} height={VIDEO_CAROUSEL_CANVAS_HEIGHT} class="preview-canvas"></canvas>
					{#if activeSlide}
						<div class="preview-edit-layer" aria-label="แก้ไขข้อความบน video preview">
							{#if editingSurface !== 'preview'}
								<button
									type="button"
									class="layout-transform-frame"
									class:selected={selectedTransformSlideId === activeSlide.id || transformDrag?.slideId === activeSlide.id}
									class:dragging={transformDrag?.slideId === activeSlide.id}
									style={getLayoutTransformSpec(activeSlide).style}
									aria-label="ลากเพื่อย้าย layout ข้อความ"
									onpointerdown={(event) => startLayoutTransform(event, 'move')}
								>
									<span class="layout-transform-label">Layout</span>
									<span class="layout-transform-size">{getTextScalePercent(activeSlide)}%</span>
									<span
										class="layout-resize-handle"
										aria-hidden="true"
										onpointerdown={(event) => startLayoutTransform(event, 'resize')}
									></span>
								</button>
							{/if}
							{#each getPreviewEditSpecs(activeSlide) as item (item.key)}
								{#if isPreviewEditing(item.field)}
									{#if item.multiline}
										<textarea
											class="preview-edit-control tone-{item.tone}"
											style={item.controlStyle}
											aria-label={item.label}
											bind:value={draftValue}
											onblur={commitEdit}
											onkeydown={(event) => handlePreviewEditKeydown(event, item.multiline)}
											use:focusOnMount
										></textarea>
									{:else}
										<input
											class="preview-edit-control tone-{item.tone}"
											style={item.controlStyle}
											aria-label={item.label}
											bind:value={draftValue}
											onblur={commitEdit}
											onkeydown={(event) => handlePreviewEditKeydown(event, item.multiline)}
											use:focusOnMount
										/>
									{/if}
								{:else}
									<button
										type="button"
										class="preview-edit-target tone-{item.tone}"
										class:empty-value={!item.value}
										style={item.targetStyle}
										aria-label="แก้ไข {item.label}"
										onpointerdown={(event) => startLayoutTransform(event, 'move')}
										ondblclick={() => startEdit(item.field, 'preview')}
									>
										<span>{item.value || item.emptyLabel}</span>
									</button>
								{/if}
							{/each}
						</div>
					{/if}
				</div>
			</div>

			<!-- Edit panel -->
			{#if activeSlide}
				<div class="edit-panel">
					<div class="edit-section">
						<span class="edit-label">
							{#if activeSlide.layout_type === 'quiz'}หัวข้อหลัก
							{:else if activeSlide.layout_type === 'listicle'}หัวข้อย่อย
							{:else if activeSlide.layout_type === 'stat'}ตัวเลขใหญ่
							{:else}ข้อความหลัก{/if}
						</span>
						{#if isPanelEditing('text')}
							<textarea
								class="edit-input"
								bind:value={draftValue}
								onblur={commitEdit}
								use:focusOnMount
								rows="2"
							></textarea>
						{:else}
							<button class="edit-value-btn" ondblclick={() => startEdit('text')}>
								{activeSlide.text || '—'}
								<span class="edit-hint">double-click แก้ไข</span>
							</button>
						{/if}
					</div>

					{#if activeSlide.layout_type === 'listicle'}
						<div class="edit-section">
							<span class="edit-label" style="color:{ACCENT_COLOR}">อันดับ</span>
							{#if isPanelEditing('accent')}
								<input
									class="edit-input-line"
									bind:value={draftValue}
									onblur={commitEdit}
									use:focusOnMount
									placeholder="เช่น #5"
								/>
							{:else}
								<button class="edit-value-btn accent" ondblclick={() => startEdit('accent')}>
									{activeSlide.accent_text || '+ เพิ่มอันดับ (เช่น #5)'}
									<span class="edit-hint">double-click แก้ไข</span>
								</button>
							{/if}
						</div>

						<div class="edit-section">
							<span class="edit-label">Caption</span>
							{#if isPanelEditing('subtext')}
								<input
									class="edit-input-line"
									bind:value={draftValue}
									onblur={commitEdit}
									use:focusOnMount
									placeholder="เช่น ปล่อยให้ไม้เดียวลากพอร์ตกลับไม่ได้"
								/>
							{:else}
								<button class="edit-value-btn" ondblclick={() => startEdit('subtext')}>
									{activeSlide.subtext || '+ เพิ่ม caption'}
									<span class="edit-hint">double-click แก้ไข</span>
								</button>
							{/if}
						</div>
					{:else if activeSlide.layout_type === 'stat'}
						<div class="edit-section">
							<span class="edit-label" style="color:{ACCENT_COLOR}">หน่วย</span>
							{#if isPanelEditing('accent')}
								<input
									class="edit-input-line"
									bind:value={draftValue}
									onblur={commitEdit}
									use:focusOnMount
									placeholder="เช่น %, บาท, X"
								/>
							{:else}
								<button class="edit-value-btn accent" ondblclick={() => startEdit('accent')}>
									{activeSlide.accent_text || '+ เพิ่มหน่วย'}
									<span class="edit-hint">double-click แก้ไข</span>
								</button>
							{/if}
						</div>

						<div class="edit-section">
							<span class="edit-label">Claim / คำอธิบาย</span>
							{#if isPanelEditing('subtext')}
								<textarea
									class="edit-input"
									bind:value={draftValue}
									onblur={commitEdit}
									use:focusOnMount
									rows="2"
								></textarea>
							{:else}
								<button class="edit-value-btn" ondblclick={() => startEdit('subtext')}>
									{activeSlide.subtext || '+ เพิ่มคำอธิบาย'}
									<span class="edit-hint">double-click แก้ไข</span>
								</button>
							{/if}
						</div>

						<div class="edit-section">
							<span class="edit-label">Source / อ้างอิง</span>
							{#if isPanelEditing(0)}
								<input
									class="edit-input-line"
									bind:value={draftValue}
									onblur={commitEdit}
									use:focusOnMount
									placeholder="เช่น ที่มา: SEC Thailand"
								/>
							{:else}
								<button class="edit-value-btn" ondblclick={() => startEdit(0)}>
									{activeSlide.options[0] || '+ เพิ่ม source (ไม่บังคับ)'}
									<span class="edit-hint">double-click แก้ไข</span>
								</button>
							{/if}
						</div>
					{:else if activeSlide.layout_type === 'quiz'}
						<div class="edit-section">
							<span class="edit-label" style="color:{ACCENT_COLOR}">ข้อความเน้นสีทอง</span>
							{#if isPanelEditing('accent')}
								<input
									class="edit-input-line"
									bind:value={draftValue}
									onblur={commitEdit}
									use:focusOnMount
									placeholder="เช่น คุณจะเลือกอะไร?"
								/>
							{:else}
								<button class="edit-value-btn accent" ondblclick={() => startEdit('accent')}>
									{activeSlide.accent_text || '+ เพิ่มข้อความเน้น'}
									<span class="edit-hint">double-click แก้ไข</span>
								</button>
							{/if}
						</div>

						<div class="edit-section">
							<div class="options-header">
								<span class="edit-label">ตัวเลือก ({activeSlide.options.length})</span>
								{#if activeSlide.options.length < 6}
									<button class="add-opt-btn" onclick={addOption}>+ เพิ่ม</button>
								{/if}
							</div>
							<div class="options-list">
								{#each activeSlide.options as opt, i}
									<div class="option-row">
										<span class="option-letter" style="color:{ACCENT_COLOR}">{OPTION_LETTERS[i]}.</span>
										{#if isPanelEditing(i)}
											<input
												class="option-input"
												bind:value={draftValue}
												onblur={commitEdit}
												use:focusOnMount
											/>
										{:else}
											<button class="option-text-btn" ondblclick={() => startEdit(i)}>
												{opt || '—'}
											</button>
										{/if}
										<button class="remove-opt-btn" onclick={() => removeOption(i)} title="ลบ">×</button>
									</div>
								{/each}
							</div>
						</div>
					{:else}
						<div class="edit-section">
							<span class="edit-label" style="color:{ACCENT_COLOR}">ข้อความรอง</span>
							{#if isPanelEditing('subtext')}
								<input
									class="edit-input-line"
									bind:value={draftValue}
									onblur={commitEdit}
									use:focusOnMount
									placeholder="เช่น BigLot Gold Insight"
								/>
							{:else}
								<button class="edit-value-btn accent" ondblclick={() => startEdit('subtext')}>
									{activeSlide.subtext || '+ เพิ่มข้อความรอง'}
									<span class="edit-hint">double-click แก้ไข</span>
								</button>
							{/if}
						</div>

						<div class="edit-section">
							<span class="edit-label">ตำแหน่งข้อความ</span>
							<select
								class="field-select"
								value={activeSlide.text_position}
								onchange={(event) => setTextPosition((event.currentTarget as HTMLSelectElement).value as VideoTextPosition)}
							>
								<option value="top">Top</option>
								<option value="center">Center</option>
								<option value="bottom">Bottom</option>
							</select>
						</div>

					{/if}

					<div class="edit-section">
						<div class="position-header">
							<span class="edit-label">จัด Layout</span>
							<button class="reset-position-btn" type="button" onclick={resetLayoutTransform}>Reset</button>
						</div>
						<div class="offset-controls">
							<label class="offset-row">
								<span>ซ้าย / ขวา</span>
								<input
									type="range"
									min="-594"
									max="594"
									step="5"
									value={activeSlide.text_offset_x_px}
									oninput={(event) => setTextOffset('x', Number((event.currentTarget as HTMLInputElement).value))}
								/>
								<strong>{activeSlide.text_offset_x_px}px</strong>
							</label>
							<label class="offset-row">
								<span>บน / ล่าง</span>
								<input
									type="range"
									min="-1056"
									max="1056"
									step="5"
									value={activeSlide.text_offset_y_px}
									oninput={(event) => setTextOffset('y', Number((event.currentTarget as HTMLInputElement).value))}
								/>
								<strong>{activeSlide.text_offset_y_px}px</strong>
							</label>
							<label class="offset-row">
								<span>ขนาด</span>
								<input
									type="range"
									min={MIN_TEXT_SCALE_PERCENT}
									max={MAX_TEXT_SCALE_PERCENT}
									step="5"
									value={activeSlide.text_scale_percent}
									oninput={(event) => setTextScale(Number((event.currentTarget as HTMLInputElement).value))}
								/>
								<strong>{getTextScalePercent(activeSlide)}%</strong>
							</label>
						</div>
					</div>

					<div class="edit-section">
						<span class="edit-label">Video filter</span>
						<div class="video-filter-toggle" role="group" aria-label="Video filter">
							<button
								type="button"
								class:active={activeSlide.video_filter === 'none'}
								onclick={() => setVideoFilter('none')}
							>
								{VIDEO_FILTER_LABELS.none}
							</button>
							<button
								type="button"
								class:active={activeSlide.video_filter === 'grayscale'}
								onclick={() => setVideoFilter('grayscale')}
							>
								{VIDEO_FILTER_LABELS.grayscale}
							</button>
						</div>
					</div>

					<div class="edit-section">
						<span class="edit-label">Search query (Pexels)</span>
						<span class="search-query-text">{activeSlide.search_query ?? '—'}</span>
					</div>
				</div>
			{/if}

			<!-- Slide strip -->
			<div class="slide-strip">
				{#each slides as slide, i}
					<button class="strip-item" class:active={i === activeIdx} onclick={() => (activeIdx = i)}>
						{#if slide.thumbnail_url}
							<img src={slide.thumbnail_url} alt="clip {i+1}" class="strip-thumb" />
						{:else}
							<div class="strip-placeholder">▶</div>
						{/if}
						<div class="strip-meta">
							<span class="strip-num">{i + 1}</span>
							<span class="strip-text">{slide.text}</span>
							<span class="strip-dur">{slide.duration_seconds}s</span>
						</div>
					</button>
				{/each}
				<div class="total-dur">รวม {videoCarouselTotalDuration(slides)}s</div>
			</div>
		</div>

		<!-- Swap overlay -->
		{#if showSwapPanel}
			<div class="swap-overlay" role="dialog">
				<div class="swap-panel">
					<div class="swap-header">
						<h3>เลือก Video ใหม่</h3>
						<button class="close-btn" onclick={() => (showSwapPanel = false)}>×</button>
					</div>
					{#if loadingSwap}
						<div class="swap-loading"><Spinner size="md" /></div>
					{:else}
						<div class="swap-grid">
							{#each swapCandidates as c}
								<button class="swap-card" onclick={() => swapVideo(c)}>
									<img src={c.thumbnail_url} alt={c.user_name} class="swap-thumb" />
									<span class="swap-dur">{c.duration}s</span>
									<span class="swap-author">{c.user_name}</span>
								</button>
							{/each}
						</div>
					{/if}
				</div>
			</div>
		{/if}
	</div>
{/if}

<style>
	.not-found { text-align: center; padding: var(--space-8); color: var(--color-slate-400); }

	.editor-layout { display: flex; flex-direction: column; gap: 0; }

	/* Header */
	.editor-header {
		display: flex; align-items: center; gap: var(--space-3);
		padding-bottom: var(--space-4); border-bottom: 1px solid var(--color-border);
		margin-bottom: var(--space-4);
	}
	.back-btn {
		background: none; border: none; font-size: 1.3rem; cursor: pointer;
		color: var(--color-slate-600); padding: 0.25rem 0.5rem; border-radius: var(--radius-sm);
	}
	.back-btn:hover { background: var(--color-slate-100); }
	.title-stack {
		flex: 1;
		min-width: 0;
		display: flex;
		align-items: center;
		gap: var(--space-2);
	}
	.editor-title {
		min-width: 0; font-family: var(--font-heading); font-size: var(--text-md);
		font-weight: var(--fw-bold); color: var(--color-slate-900); margin: 0;
		white-space: nowrap; overflow: hidden; text-overflow: ellipsis;
	}
	.template-pill {
		flex-shrink: 0;
		font-size: var(--text-xs);
		font-weight: var(--fw-bold);
		color: var(--color-primary);
		background: var(--color-primary-bg);
		border: 1px solid var(--color-primary-border);
		border-radius: 999px;
		padding: 0.18rem 0.5rem;
		white-space: nowrap;
	}
	.header-actions { display: flex; align-items: center; gap: var(--space-2); flex-shrink: 0; }
	.upload-video-input { display: none; }

	/* Export progress */
	.export-progress-wrap {
		position: relative; height: 6px; background: var(--color-slate-100);
		border-radius: 999px; overflow: hidden; margin-bottom: var(--space-3);
	}
	.export-progress-bar { height: 100%; background: var(--color-primary); transition: width 0.3s; }
	.export-status { position: absolute; top: 8px; left: 0; font-size: var(--text-xs); color: var(--color-slate-500); }

	/* Settings */
	.settings-panel {
		display: flex; align-items: center; gap: var(--space-3);
		background: var(--color-bg-elevated); border: 1px solid var(--color-border);
		border-radius: var(--radius-md); padding: var(--space-3) var(--space-4);
		margin-bottom: var(--space-4);
	}
	.field-label { font-size: var(--text-sm); font-weight: var(--fw-semibold); color: var(--color-slate-700); white-space: nowrap; }
	.field-select {
		padding: 0.4rem 0.6rem; border: 1px solid var(--color-border);
		border-radius: var(--radius-md); font-size: var(--text-sm); font-family: inherit;
		color: var(--color-slate-900); background: var(--color-bg);
	}

	/* Body layout */
	.editor-body {
		display: grid;
		grid-template-columns: 270px 1fr 220px;
		gap: var(--space-5);
		align-items: start;
	}

	/* Canvas */
	.preview-pane { display: flex; flex-direction: column; align-items: center; }
	.canvas-wrap {
		position: relative; width: 270px; height: 480px;
		border-radius: 16px; overflow: hidden;
		box-shadow: 0 12px 40px rgba(0,0,0,0.25); background: #000; flex-shrink: 0;
	}
	.hidden-video { display: none; }
	.preview-canvas { width: 100%; height: 100%; display: block; }
	.preview-edit-layer {
		position: absolute;
		inset: 0;
		z-index: 2;
		pointer-events: none;
	}
	.layout-transform-frame {
		position: absolute;
		z-index: 1;
		transform: translate(-50%, -50%);
		pointer-events: auto;
		border: 1px solid rgba(147, 197, 253, 0.9);
		border-radius: 10px;
		background: rgba(37, 99, 235, 0.05);
		box-shadow:
			0 0 0 1px rgba(37, 99, 235, 0.14),
			inset 0 0 0 1px rgba(255, 255, 255, 0.12);
		cursor: move;
		padding: 0;
		touch-action: none;
		opacity: 0;
		transition:
			opacity var(--transition-fast),
			background var(--transition-fast),
			border-color var(--transition-fast);
	}
	.preview-edit-layer:hover .layout-transform-frame,
	.layout-transform-frame.selected,
	.layout-transform-frame.dragging {
		opacity: 1;
	}
	.layout-transform-frame.dragging {
		background: rgba(37, 99, 235, 0.12);
		border-color: #93c5fd;
	}
	.layout-transform-label,
	.layout-transform-size {
		position: absolute;
		top: -1.55rem;
		padding: 0.12rem 0.38rem;
		border-radius: 999px;
		background: rgba(15, 23, 42, 0.86);
		color: #ffffff;
		font-size: 10px;
		font-weight: var(--fw-bold);
		line-height: 1.2;
		white-space: nowrap;
	}
	.layout-transform-label {
		left: 0;
	}
	.layout-transform-size {
		right: 0;
	}
	.layout-resize-handle {
		position: absolute;
		right: -7px;
		bottom: -7px;
		width: 14px;
		height: 14px;
		border: 2px solid #ffffff;
		border-radius: 50%;
		background: var(--color-primary);
		box-shadow: 0 3px 10px rgba(15, 23, 42, 0.32);
		cursor: nwse-resize;
		pointer-events: auto;
		touch-action: none;
	}
	.preview-edit-target,
	.preview-edit-control {
		position: absolute;
		transform: translate(-50%, -50%);
		pointer-events: auto;
		border-radius: 8px;
		font-family: inherit;
	}
	.preview-edit-target {
		z-index: 2;
		border: 1px solid transparent;
		background: transparent;
		color: transparent;
		cursor: move;
		padding: 0;
		touch-action: none;
		transition:
			background var(--transition-fast),
			border-color var(--transition-fast),
			box-shadow var(--transition-fast);
	}
	.preview-edit-target span {
		display: block;
		width: 100%;
		overflow: hidden;
		text-overflow: ellipsis;
		white-space: nowrap;
	}
	.preview-edit-target.empty-value {
		color: rgba(255, 255, 255, 0.82);
		background: rgba(15, 23, 42, 0.42);
		border-color: rgba(255, 255, 255, 0.22);
		font-size: var(--text-xs);
		font-weight: var(--fw-semibold);
	}
	.preview-edit-target.empty-value.tone-accent {
		color: #facc15;
		border-color: rgba(245, 197, 24, 0.42);
	}
	.preview-edit-target:hover,
	.preview-edit-target:focus-visible {
		background: rgba(37, 99, 235, 0.14);
		border-color: rgba(147, 197, 253, 0.9);
		box-shadow: 0 0 0 2px rgba(37, 99, 235, 0.12);
		outline: none;
	}
	.preview-edit-target:hover::after,
	.preview-edit-target:focus-visible::after {
		content: 'ลาก / double-click แก้ไข';
		position: absolute;
		right: 0;
		top: -1.45rem;
		padding: 0.12rem 0.38rem;
		border-radius: 999px;
		background: rgba(15, 23, 42, 0.84);
		color: #ffffff;
		font-size: 10px;
		font-weight: var(--fw-semibold);
		white-space: nowrap;
	}
	.preview-edit-control {
		z-index: 4;
		border: 1px solid rgba(147, 197, 253, 0.95);
		background: rgba(15, 23, 42, 0.86);
		box-shadow: 0 10px 28px rgba(0, 0, 0, 0.34);
		color: #ffffff;
		font-size: var(--text-sm);
		font-weight: var(--fw-semibold);
		line-height: 1.35;
		outline: none;
		padding: 0.4rem 0.5rem;
		resize: none;
		text-align: center;
	}
	.preview-edit-control.tone-accent {
		color: #facc15;
		border-color: rgba(245, 197, 24, 0.9);
	}
	.preview-edit-control.tone-option {
		text-align: left;
	}

	/* Edit panel */
	.edit-panel {
		display: flex; flex-direction: column; gap: var(--space-4);
		background: var(--color-bg-elevated); border: 1px solid var(--color-border);
		border-radius: var(--radius-lg); padding: var(--space-4);
		max-height: 520px; overflow-y: auto;
	}
	.edit-section { display: flex; flex-direction: column; gap: var(--space-2); }
	.edit-label { font-size: var(--text-xs); font-weight: var(--fw-bold); text-transform: uppercase; letter-spacing: 0.06em; color: var(--color-slate-500); }
	.edit-value-btn {
		background: var(--color-slate-50); border: 1px dashed var(--color-border);
		border-radius: var(--radius-md); padding: var(--space-2) var(--space-3);
		text-align: left; font-family: inherit; font-size: var(--text-sm);
		font-weight: var(--fw-semibold); color: var(--color-slate-900); cursor: pointer;
		position: relative; transition: border-color var(--transition-fast);
	}
	.edit-value-btn:hover { border-color: var(--color-primary-border); background: var(--color-primary-bg); }
	.edit-value-btn.accent { color: #b45309; border-color: #fcd34d; background: #fffbeb; }
	.edit-hint { display: block; font-size: var(--text-xs); color: var(--color-slate-400); font-weight: normal; margin-top: 2px; }
	.edit-input {
		width: 100%; padding: var(--space-2); border: 1px solid var(--color-primary-border);
		border-radius: var(--radius-md); font-family: inherit; font-size: var(--text-sm);
		resize: none; outline: none; background: var(--color-bg);
	}
	.edit-input-line {
		width: 100%; padding: var(--space-2); border: 1px solid var(--color-primary-border);
		border-radius: var(--radius-md); font-family: inherit; font-size: var(--text-sm);
		outline: none; background: var(--color-bg);
	}

	/* Options */
	.options-header { display: flex; align-items: center; justify-content: space-between; }
	.add-opt-btn {
		font-size: var(--text-xs); font-weight: var(--fw-semibold); color: var(--color-primary);
		background: none; border: 1px solid var(--color-primary-border); border-radius: var(--radius-sm);
		padding: 0.15rem 0.5rem; cursor: pointer;
	}
	.options-list { display: flex; flex-direction: column; gap: var(--space-1); }
	.option-row { display: flex; align-items: center; gap: var(--space-2); }
	.option-letter { font-size: var(--text-sm); font-weight: var(--fw-bold); flex-shrink: 0; width: 20px; }
	.option-text-btn {
		flex: 1; text-align: left; background: var(--color-slate-50); border: 1px dashed var(--color-border);
		border-radius: var(--radius-sm); padding: 0.3rem 0.5rem; font-family: inherit;
		font-size: var(--text-sm); color: var(--color-slate-800); cursor: pointer;
		transition: border-color var(--transition-fast);
	}
	.option-text-btn:hover { border-color: var(--color-primary-border); }
	.option-input {
		flex: 1; padding: 0.3rem 0.5rem; border: 1px solid var(--color-primary-border);
		border-radius: var(--radius-sm); font-family: inherit; font-size: var(--text-sm); outline: none;
	}
	.remove-opt-btn {
		width: 22px; height: 22px; border: none; background: none; color: var(--color-slate-400);
		cursor: pointer; font-size: 1rem; border-radius: var(--radius-sm); flex-shrink: 0;
		display: flex; align-items: center; justify-content: center;
	}
	.remove-opt-btn:hover { background: #fee2e2; color: #dc2626; }

	.position-header {
		display: flex;
		align-items: center;
		justify-content: space-between;
		gap: var(--space-2);
	}

	.reset-position-btn {
		border: 1px solid var(--color-border);
		background: var(--color-bg);
		border-radius: var(--radius-sm);
		color: var(--color-slate-600);
		cursor: pointer;
		font-family: inherit;
		font-size: var(--text-xs);
		font-weight: var(--fw-semibold);
		padding: 0.15rem 0.45rem;
	}

	.reset-position-btn:hover {
		background: var(--color-slate-100);
		color: var(--color-slate-900);
	}

	.offset-controls {
		display: flex;
		flex-direction: column;
		gap: var(--space-2);
		padding: var(--space-2);
		border: 1px solid var(--color-border);
		border-radius: var(--radius-md);
		background: var(--color-slate-50);
	}

	.offset-row {
		display: grid;
		grid-template-columns: 72px minmax(0, 1fr) 48px;
		align-items: center;
		gap: var(--space-2);
		font-size: var(--text-xs);
		color: var(--color-slate-600);
	}

	.offset-row input {
		width: 100%;
		accent-color: var(--color-primary);
	}

	.offset-row strong {
		text-align: right;
		color: var(--color-slate-800);
		font-variant-numeric: tabular-nums;
	}

	.video-filter-toggle {
		display: grid;
		grid-template-columns: repeat(2, minmax(0, 1fr));
		gap: var(--space-1);
		padding: 0.2rem;
		border: 1px solid var(--color-border);
		border-radius: var(--radius-md);
		background: var(--color-slate-50);
	}

	.video-filter-toggle button {
		border: none;
		border-radius: var(--radius-sm);
		background: transparent;
		color: var(--color-slate-500);
		cursor: pointer;
		font-family: inherit;
		font-size: var(--text-xs);
		font-weight: var(--fw-bold);
		padding: 0.38rem 0.5rem;
		transition:
			background var(--transition-fast),
			color var(--transition-fast),
			box-shadow var(--transition-fast);
	}

	.video-filter-toggle button:hover {
		color: var(--color-slate-900);
	}

	.video-filter-toggle button.active {
		background: var(--color-bg);
		color: var(--color-primary);
		box-shadow: 0 1px 4px rgba(15, 23, 42, 0.12);
	}

	.search-query-text { font-size: var(--text-xs); color: var(--color-slate-400); font-style: italic; }

	/* Slide strip */
	.slide-strip {
		display: flex; flex-direction: column; gap: var(--space-2);
		max-height: 520px; overflow-y: auto;
	}
	.strip-item {
		display: flex; align-items: center; gap: var(--space-2);
		padding: var(--space-2); border: 1px solid var(--color-border);
		border-radius: var(--radius-md); background: var(--color-bg-elevated);
		cursor: pointer; text-align: left; transition: all var(--transition-fast); width: 100%;
	}
	.strip-item.active { border-color: var(--color-primary-border); background: var(--color-primary-bg); }
	.strip-item:hover:not(.active) { border-color: var(--color-slate-300); }
	.strip-thumb { width: 40px; height: 60px; object-fit: cover; border-radius: var(--radius-sm); flex-shrink: 0; }
	.strip-placeholder {
		width: 40px; height: 60px; background: var(--color-slate-200); border-radius: var(--radius-sm);
		display: flex; align-items: center; justify-content: center; color: var(--color-slate-400); flex-shrink: 0;
	}
	.strip-meta { flex: 1; min-width: 0; display: flex; flex-direction: column; gap: 1px; }
	.strip-num { font-size: 10px; color: var(--color-slate-400); }
	.strip-text { font-size: var(--text-xs); font-weight: var(--fw-semibold); color: var(--color-slate-900); white-space: nowrap; overflow: hidden; text-overflow: ellipsis; }
	.strip-dur { font-size: 10px; color: var(--color-slate-400); }
	.total-dur { font-size: var(--text-xs); color: var(--color-slate-400); text-align: right; padding: var(--space-1) 0; }

	/* Swap */
	.swap-overlay {
		position: fixed; inset: 0; background: rgba(0,0,0,0.5); z-index: 200;
		display: flex; align-items: center; justify-content: center; padding: var(--space-4);
	}
	.swap-panel {
		background: var(--color-bg); border-radius: var(--radius-lg); padding: var(--space-5);
		width: min(480px, 100%); max-height: 80vh; overflow-y: auto;
	}
	.swap-header { display: flex; align-items: center; justify-content: space-between; margin-bottom: var(--space-4); }
	.swap-header h3 { font-family: var(--font-heading); font-weight: var(--fw-bold); margin: 0; }
	.close-btn {
		border: none; background: none; font-size: 1.3rem; cursor: pointer;
		color: var(--color-slate-400); width: 32px; height: 32px; border-radius: var(--radius-sm);
		display: flex; align-items: center; justify-content: center;
	}
	.close-btn:hover { background: var(--color-slate-100); }
	.swap-loading { display: flex; justify-content: center; padding: var(--space-6); }
	.swap-grid { display: grid; grid-template-columns: repeat(2, 1fr); gap: var(--space-3); }
	.swap-card {
		border: 1px solid var(--color-border); border-radius: var(--radius-md); overflow: hidden;
		cursor: pointer; background: none; padding: 0; display: flex; flex-direction: column;
		transition: border-color var(--transition-fast);
	}
	.swap-card:hover { border-color: var(--color-primary-border); }
	.swap-thumb { width: 100%; aspect-ratio: 9/16; object-fit: cover; }
	.swap-dur { font-size: var(--text-xs); font-weight: var(--fw-semibold); color: var(--color-slate-600); padding: 0.2rem 0.4rem; }
	.swap-author { font-size: var(--text-xs); color: var(--color-slate-400); padding: 0 0.4rem 0.3rem; }

	@media (max-width: 860px) {
		.editor-body { grid-template-columns: 1fr; }
		.preview-pane { order: 1; }
		.edit-panel { order: 2; }
		.slide-strip { order: 3; flex-direction: row; max-height: none; overflow-x: auto; overflow-y: visible; }
		.strip-item { flex-direction: column; width: 70px; min-width: 70px; }
		.strip-meta { display: none; }
	}
</style>
