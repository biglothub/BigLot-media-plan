<script lang="ts">
	import {
		DEFAULT_CAROUSEL_TEXT_LETTER_SPACING_EM,
		getCarouselFontPresetDefinition,
		getCarouselSelectedAssetUrl,
		normalizeCarouselTextLetterSpacingEm
	} from '$lib/carousel';
	import type { CarouselFontPreset, CarouselSlideRow } from '$lib/types';

	interface Props {
		slide: CarouselSlideRow;
		fontPreset?: CarouselFontPreset;
		textLetterSpacingEm?: number;
		fallbackAssetUrl?: string | null;
		exportId?: string;
	}

	let {
		slide,
		fontPreset = 'biglot',
		textLetterSpacingEm = DEFAULT_CAROUSEL_TEXT_LETTER_SPACING_EM,
		fallbackAssetUrl = null,
		exportId = ''
	}: Props = $props();

	const backgroundUrl = $derived(getCarouselSelectedAssetUrl(slide) ?? fallbackAssetUrl);
	const isCta = $derived(slide.layout_variant === 'cta');
	const fontPresetDefinition = $derived(getCarouselFontPresetDefinition(fontPreset));
	const textLetterSpacingCss = $derived(`${normalizeCarouselTextLetterSpacingEm(textLetterSpacingEm)}em`);
</script>

<article
	class="slide-preview slide-preview--{slide.layout_variant}"
	data-export-slide-id={exportId || slide.id}
	style:--carousel-font-heading={fontPresetDefinition.headingFont}
	style:--carousel-font-body={fontPresetDefinition.bodyFont}
	style:--carousel-text-letter-spacing={textLetterSpacingCss}
>
	<div class="slide-preview-bg" style:background-image={backgroundUrl ? `url("${backgroundUrl}")` : 'none'}></div>
	<div class="slide-preview-noise"></div>
	<div class="slide-preview-content">
		<div class="slide-preview-main">
			<h3>{slide.headline ?? 'Untitled slide'}</h3>
			{#if slide.body}
				<p class="slide-preview-body">{slide.body}</p>
			{/if}
			{#if isCta && slide.cta}
				<div class="slide-preview-cta">{slide.cta}</div>
			{:else if slide.cta}
				<p class="slide-preview-cta-note">{slide.cta}</p>
			{/if}
		</div>
	</div>
</article>

<style>
	.slide-preview {
		position: relative;
		overflow: hidden;
		border-radius: 1.6rem;
		aspect-ratio: 4 / 5;
		background:
			radial-gradient(circle at top left, rgba(251, 146, 60, 0.24), transparent 42%),
			linear-gradient(160deg, #111827 0%, #172554 42%, #431407 100%);
		color: #fff;
		font-family: var(--carousel-font-body);
		letter-spacing: var(--carousel-text-letter-spacing, 0em);
		border: 1px solid rgba(255, 255, 255, 0.12);
		box-shadow: var(--shadow-lg);
	}

	.slide-preview-bg,
	.slide-preview-noise {
		position: absolute;
		inset: 0;
	}

	.slide-preview-bg {
		background-position: center;
		background-size: cover;
		filter: saturate(1.08) contrast(1.02);
		transform: scale(1.02);
	}

	.slide-preview-noise {
		background:
			linear-gradient(180deg, rgba(15, 23, 42, 0.22), rgba(15, 23, 42, 0.72)),
			linear-gradient(135deg, rgba(249, 115, 22, 0.35), transparent 50%),
			linear-gradient(320deg, rgba(59, 130, 246, 0.25), transparent 55%);
	}

	.slide-preview-content {
		position: relative;
		z-index: 1;
		height: 100%;
		padding: 1.15rem;
		display: flex;
		align-items: stretch;
	}

	.slide-preview-main {
		display: grid;
		gap: 0.8rem;
		align-content: center;
		margin: auto 0;
	}

	h3,
	.slide-preview-body,
	.slide-preview-cta,
	.slide-preview-cta-note {
		white-space: break-spaces;
		overflow-wrap: anywhere;
		text-wrap: wrap;
	}

	h3 {
		margin: 0;
		font-family: var(--carousel-font-heading);
		font-size: clamp(1.45rem, 2.7vw, 2.4rem);
		line-height: 1.02;
	}

	.slide-preview-body {
		margin: 0;
		font-size: 0.94rem;
		line-height: 1.55;
		max-width: 26ch;
		color: rgba(255, 255, 255, 0.92);
	}

	.slide-preview-cta,
	.slide-preview-cta-note {
		margin: 0;
	}

	.slide-preview-cta {
		display: inline-flex;
		align-items: center;
		justify-content: center;
		padding: 0.8rem 1rem;
		border-radius: 999px;
		background: #fff;
		color: #0f172a;
		font-family: var(--carousel-font-body);
		font-weight: 800;
		font-size: 0.94rem;
		max-width: fit-content;
	}

	.slide-preview-cta-note {
		font-size: 0.84rem;
		font-weight: 700;
		color: rgba(255, 255, 255, 0.88);
	}

	.slide-preview--content h3 {
		font-size: clamp(1.3rem, 2.3vw, 2rem);
	}

	.slide-preview--cta .slide-preview-main {
		align-content: end;
	}

	.slide-preview--cta h3 {
		max-width: 14ch;
	}
</style>
