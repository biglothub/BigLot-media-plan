<script lang="ts">
	import { carouselRoleLabel, getCarouselSelectedAssetUrl } from '$lib/carousel';
	import type { CarouselSlideRow } from '$lib/types';

	interface Props {
		slide: CarouselSlideRow;
		fallbackAssetUrl?: string | null;
		exportId?: string;
	}

	let { slide, fallbackAssetUrl = null, exportId = '' }: Props = $props();

	const backgroundUrl = $derived(getCarouselSelectedAssetUrl(slide) ?? fallbackAssetUrl);
	const isCover = $derived(slide.layout_variant === 'cover');
	const isCta = $derived(slide.layout_variant === 'cta');
</script>

<article class="slide-preview slide-preview--{slide.layout_variant}" data-export-slide-id={exportId || slide.id}>
	<div class="slide-preview-bg" style:background-image={backgroundUrl ? `url("${backgroundUrl}")` : 'none'}></div>
	<div class="slide-preview-noise"></div>
	<div class="slide-preview-content">
		<div class="slide-preview-top">
			<span class="slide-preview-kicker">BigLot Carousel</span>
			<span class="slide-preview-step">{String(slide.position).padStart(2, '0')} · {carouselRoleLabel[slide.role]}</span>
		</div>

		<div class="slide-preview-main">
			{#if isCover}
				<p class="slide-preview-eyebrow">Instagram-first storyboard</p>
			{/if}
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

		<div class="slide-preview-footer">
			<p>{slide.visual_brief ?? 'Add a visual brief for this slide'}</p>
			<span>{slide.freepik_query ?? 'No Pexels query yet'}</span>
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
		flex-direction: column;
		justify-content: space-between;
		gap: 1rem;
	}

	.slide-preview-top {
		display: flex;
		align-items: center;
		justify-content: space-between;
		gap: 0.75rem;
		font-size: 0.72rem;
		font-weight: 700;
		text-transform: uppercase;
		letter-spacing: 0.09em;
	}

	.slide-preview-kicker {
		padding: 0.28rem 0.65rem;
		border-radius: 999px;
		background: rgba(255, 255, 255, 0.12);
		backdrop-filter: blur(8px);
	}

	.slide-preview-step {
		color: rgba(255, 255, 255, 0.82);
	}

	.slide-preview-main {
		display: grid;
		gap: 0.8rem;
		align-content: center;
	}

	.slide-preview-eyebrow {
		margin: 0;
		font-size: 0.78rem;
		text-transform: uppercase;
		letter-spacing: 0.12em;
		color: rgba(255, 255, 255, 0.72);
	}

	h3 {
		margin: 0;
		font-family: var(--font-heading);
		font-size: clamp(1.45rem, 2.7vw, 2.4rem);
		line-height: 1.02;
		text-wrap: balance;
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
		font-weight: 800;
		font-size: 0.94rem;
		max-width: fit-content;
	}

	.slide-preview-cta-note {
		font-size: 0.84rem;
		font-weight: 700;
		color: rgba(255, 255, 255, 0.88);
	}

	.slide-preview-footer {
		display: grid;
		gap: 0.45rem;
		padding: 0.85rem;
		border-radius: 1rem;
		background: rgba(15, 23, 42, 0.34);
		backdrop-filter: blur(10px);
	}

	.slide-preview-footer p,
	.slide-preview-footer span {
		margin: 0;
	}

	.slide-preview-footer p {
		font-size: 0.78rem;
		line-height: 1.45;
		color: rgba(255, 255, 255, 0.9);
	}

	.slide-preview-footer span {
		font-size: 0.72rem;
		color: rgba(255, 255, 255, 0.68);
		letter-spacing: 0.05em;
		text-transform: uppercase;
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
