<script lang="ts">
	import { goto } from '$app/navigation';
	import { Button, PageHeader, Spinner, toast } from '$lib';
	import type { PageData } from './$types';
	import type { VideoCarouselSlide, VideoCarouselProject, VideoTextPosition } from '$lib/video-carousel';
	import {
		VIDEO_FONT_MAP,
		FONT_PRESET_LABELS,
		VIDEO_CAROUSEL_TEMPLATE_LABELS,
		VIDEO_CAROUSEL_CANVAS_WIDTH,
		VIDEO_CAROUSEL_CANVAS_HEIGHT,
		OPTION_LETTERS,
		ACCENT_COLOR,
		videoCarouselTotalDuration
	} from '$lib/video-carousel';
	import type { CarouselFontPreset } from '$lib/types';

	let { data }: { data: PageData } = $props();

	let project = $state<VideoCarouselProject | null>(data.project);
	let slides = $state<VideoCarouselSlide[]>(data.slides ?? []);

	let activeIdx = $state(0);
	let activeSlide = $derived(slides[activeIdx] ?? null);

	let videoEl = $state<HTMLVideoElement | null>(null);
	let canvasEl = $state<HTMLCanvasElement | null>(null);

	// ── Edit state ────────────────────────────────────────────────────────────
	let editingField = $state<'text' | 'accent' | 'subtext' | number | null>(null);
	let draftValue = $state('');

	// ── Swap panel ────────────────────────────────────────────────────────────
	let showSwapPanel = $state(false);
	let swapCandidates = $state<Array<{ id: number; thumbnail_url: string; video_url: string | null; duration: number; user_name: string }>>([]);
	let loadingSwap = $state(false);

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

	// ── Canvas draw ───────────────────────────────────────────────────────────
	let animFrameId: number | null = null;

	function drawQuizLayout(ctx: CanvasRenderingContext2D, slide: VideoCarouselSlide, w: number, h: number) {
		const font = VIDEO_FONT_MAP[fontPreset] ?? VIDEO_FONT_MAP.biglot;

		// Full dark overlay for readability
		ctx.fillStyle = 'rgba(0,0,0,0.62)';
		ctx.fillRect(0, 0, w, h);

		const padX = w * 0.08;
		const titleY = h * 0.22;
		const optionsStartY = h * 0.42;
		const optionLineH = h * 0.083;

		// ── Title (text) ─────────────────────────────────────────────────────
		ctx.save();
		ctx.textAlign = 'center';
		ctx.textBaseline = 'middle';
		ctx.fillStyle = '#ffffff';
		ctx.font = `bold ${Math.round(w * 0.082)}px ${font}`;
		ctx.shadowColor = 'rgba(0,0,0,0.8)';
		ctx.shadowBlur = 14;
		const titleText = editingField === 'text' ? draftValue : slide.text;
		wrapTextCentered(ctx, titleText, w / 2, titleY, w - padX * 2, Math.round(w * 0.095));
		ctx.restore();

		// ── Accent text (gold) ───────────────────────────────────────────────
		const accentText = editingField === 'accent' ? draftValue : (slide.accent_text ?? '');
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
		const options = editingField !== null && typeof editingField === 'number'
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
	}

	function drawStandardLayout(ctx: CanvasRenderingContext2D, slide: VideoCarouselSlide, w: number, h: number) {
		const font = VIDEO_FONT_MAP[fontPreset] ?? VIDEO_FONT_MAP.biglot;
		const posY = slide.text_position === 'top' ? h * 0.18 : slide.text_position === 'bottom' ? h * 0.8 : h * 0.5;
		const isTop = slide.text_position === 'top';

		const grad = ctx.createLinearGradient(0, isTop ? 0 : h * 0.55, 0, isTop ? h * 0.45 : h);
		grad.addColorStop(0, 'rgba(0,0,0,0.6)');
		grad.addColorStop(1, 'rgba(0,0,0,0)');
		ctx.fillStyle = grad;
		ctx.fillRect(0, isTop ? 0 : h * 0.55, w, h * 0.45);

		const text = editingField === 'text' ? draftValue : slide.text;
		ctx.save();
		ctx.textAlign = 'center';
		ctx.textBaseline = 'middle';
		ctx.fillStyle = '#ffffff';
		ctx.shadowColor = 'rgba(0,0,0,0.7)';
		ctx.shadowBlur = 12;
		ctx.font = `bold ${Math.round(w * 0.072)}px ${font}`;
		wrapTextCentered(ctx, text, w / 2, posY, w * 0.85, Math.round(w * 0.09));
		ctx.restore();

		const sub = slide.subtext ?? '';
		if (sub) {
			ctx.save();
			ctx.textAlign = 'center';
			ctx.textBaseline = 'middle';
			ctx.fillStyle = 'rgba(255,255,255,0.85)';
			ctx.font = `${Math.round(w * 0.038)}px ${font}`;
			ctx.fillText(sub, w / 2, posY + Math.round(w * 0.12));
			ctx.restore();
		}
	}

	function drawQuoteLayout(ctx: CanvasRenderingContext2D, slide: VideoCarouselSlide, w: number, h: number) {
		const font = VIDEO_FONT_MAP[fontPreset] ?? VIDEO_FONT_MAP.biglot;
		const posY = slide.text_position === 'top' ? h * 0.28 : slide.text_position === 'bottom' ? h * 0.72 : h * 0.5;
		const text = editingField === 'text' ? draftValue : slide.text;
		const sub = editingField === 'subtext' ? draftValue : (slide.subtext ?? '');

		ctx.fillStyle = 'rgba(2, 6, 23, 0.56)';
		ctx.fillRect(0, 0, w, h);

		ctx.save();
		ctx.textAlign = 'center';
		ctx.textBaseline = 'middle';
		ctx.fillStyle = 'rgba(255,255,255,0.22)';
		ctx.font = `bold ${Math.round(w * 0.22)}px ${font}`;
		ctx.fillText('"', w / 2, posY - w * 0.18);
		ctx.restore();

		ctx.save();
		ctx.textAlign = 'center';
		ctx.textBaseline = 'middle';
		ctx.fillStyle = '#ffffff';
		ctx.shadowColor = 'rgba(0,0,0,0.75)';
		ctx.shadowBlur = 14;
		ctx.font = `bold ${Math.round(w * 0.07)}px ${font}`;
		wrapTextCentered(ctx, text, w / 2, posY, w * 0.78, Math.round(w * 0.09));
		ctx.restore();

		if (sub) {
			ctx.save();
			ctx.textAlign = 'center';
			ctx.textBaseline = 'middle';
			ctx.fillStyle = ACCENT_COLOR;
			ctx.font = `bold ${Math.round(w * 0.033)}px ${font}`;
			ctx.fillText(sub, w / 2, posY + Math.round(w * 0.17));
			ctx.restore();
		}
	}

	function drawFrame() {
		if (!canvasEl || !videoEl || !activeSlide) return;
		const ctx = canvasEl.getContext('2d');
		if (!ctx) return;
		const w = canvasEl.width;
		const h = canvasEl.height;

		ctx.drawImage(videoEl, 0, 0, w, h);

		if (activeSlide.layout_type === 'quiz') {
			drawQuizLayout(ctx, activeSlide, w, h);
		} else if (activeSlide.layout_type === 'quote') {
			drawQuoteLayout(ctx, activeSlide, w, h);
		} else {
			drawStandardLayout(ctx, activeSlide, w, h);
		}

		animFrameId = requestAnimationFrame(drawFrame);
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

	// ── Edit helpers ──────────────────────────────────────────────────────────
	function startEdit(field: 'text' | 'accent' | 'subtext' | number) {
		if (!activeSlide) return;
		if (field === 'text') draftValue = activeSlide.text;
		else if (field === 'accent') draftValue = activeSlide.accent_text ?? '';
		else if (field === 'subtext') draftValue = activeSlide.subtext ?? '';
		else draftValue = activeSlide.options[field as number] ?? '';
		editingField = field;
	}

	async function commitEdit() {
		if (!activeSlide || editingField === null) return;
		const field = editingField;
		editingField = null;

		if (field === 'text') {
			if (draftValue.trim() === activeSlide.text) return;
			await patchSlide(activeSlide.id, { text: draftValue.trim() });
		} else if (field === 'accent') {
			const val = draftValue.trim() || null;
			if (val === activeSlide.accent_text) return;
			await patchSlide(activeSlide.id, { accent_text: val });
		} else if (field === 'subtext') {
			const val = draftValue.trim() || null;
			if (val === activeSlide.subtext) return;
			await patchSlide(activeSlide.id, { subtext: val });
		} else {
			const idx = field as number;
			const newOptions = [...activeSlide.options];
			newOptions[idx] = draftValue.trim();
			await patchSlide(activeSlide.id, { options_json: newOptions });
		}
	}

	async function setTextPosition(position: VideoTextPosition) {
		if (!activeSlide || activeSlide.text_position === position) return;
		await patchSlide(activeSlide.id, { text_position: position });
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
		ctx.drawImage(video, 0, 0, canvas.width, canvas.height);
		if (slide.layout_type === 'quiz') {
			drawQuizLayout(ctx, slide, canvas.width, canvas.height);
		} else if (slide.layout_type === 'quote') {
			drawQuoteLayout(ctx, slide, canvas.width, canvas.height);
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
		if (editingField !== null) return;
		if (e.key === 'ArrowRight' || e.key === 'ArrowDown') activeIdx = Math.min(activeIdx + 1, slides.length - 1);
		else if (e.key === 'ArrowLeft' || e.key === 'ArrowUp') activeIdx = Math.max(activeIdx - 1, 0);
	}
</script>

<svelte:window onkeydown={onKeydown} />

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
				<Button variant="primary" onclick={handleExport} disabled={exporting || slides.length === 0}>
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
				</div>
			</div>

			<!-- Edit panel -->
			{#if activeSlide}
				<div class="edit-panel">
					<div class="edit-section">
						<span class="edit-label">{activeSlide.layout_type === 'quiz' ? 'หัวข้อหลัก' : 'ข้อความหลัก'}</span>
						{#if editingField === 'text'}
							<textarea
								class="edit-input"
								bind:value={draftValue}
								onblur={commitEdit}
								autofocus
								rows="2"
							></textarea>
						{:else}
							<button class="edit-value-btn" ondblclick={() => startEdit('text')}>
								{activeSlide.text || '—'}
								<span class="edit-hint">double-click แก้ไข</span>
							</button>
						{/if}
					</div>

					{#if activeSlide.layout_type === 'quiz'}
						<div class="edit-section">
							<span class="edit-label" style="color:{ACCENT_COLOR}">ข้อความเน้นสีทอง</span>
							{#if editingField === 'accent'}
								<input
									class="edit-input-line"
									bind:value={draftValue}
									onblur={commitEdit}
									autofocus
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
										{#if editingField === i}
											<input
												class="option-input"
												bind:value={draftValue}
												onblur={commitEdit}
												autofocus
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
							{#if editingField === 'subtext'}
								<input
									class="edit-input-line"
									bind:value={draftValue}
									onblur={commitEdit}
									autofocus
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
