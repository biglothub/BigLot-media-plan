<script lang="ts">
	import { onMount } from 'svelte';
	import favicon from '$lib/assets/favicon.svg';
	import { page } from '$app/state';
	import Toaster from '$lib/components/ui/Toaster.svelte';
	import '$lib/styles/tokens.css';
	import '$lib/styles/base.css';

	let { children } = $props();

	const menus = [
		{ href: '/', label: 'Backlog', shortLabel: 'Ideas' },
		{ href: '/kanban', label: 'Kanban', shortLabel: 'Plan' },
		{ href: '/calendar', label: 'Shoot Calendar', shortLabel: 'Calendar' },
		{ href: '/carousel', label: 'Carousel', shortLabel: 'Carousel' },
		{ href: '/video-carousel', label: 'Video Carousel', shortLabel: 'Video' },
		{ href: '/approve', label: 'Approve', shortLabel: 'Approve' }
	];

	const pageTitle = $derived.by(() => {
		const pathname = page.url.pathname;
		const activeMenu = menus.find((menu) => isActive(menu.href));
		if (activeMenu) return activeMenu.label;
		return pathname === '/' ? 'Backlog' : 'BigLot Media Plan';
	});

	function isActive(href: string): boolean {
		const pathname = page.url.pathname;
		if (href === '/') return pathname === '/';
		return pathname === href || pathname.startsWith(`${href}/`);
	}

	onMount(() => {
		if (!('serviceWorker' in navigator)) return;
		void navigator.serviceWorker.register('/service-worker.js');
	});
</script>

<svelte:head>
	<link rel="icon" href={favicon} />
	<link rel="preconnect" href="https://fonts.googleapis.com" />
	<link rel="preconnect" href="https://fonts.gstatic.com" crossorigin="anonymous" />
	<link
		href="https://fonts.googleapis.com/css2?family=IBM+Plex+Sans+Thai:wght@400;500;700&family=Mitr:wght@400;500;700&family=Noto+Sans+Thai:wght@400;500;700;800&family=Playfair+Display:wght@600;700&family=Sarabun:wght@400;500;700&family=Space+Grotesk:wght@400;500;700&display=swap"
		rel="stylesheet"
	/>
</svelte:head>

<div class="app-shell">
	<header class="top-bar">
		<div class="top-bar-inner">
			<div class="mobile-heading">
				<p class="eyebrow">BigLot Media Plan</p>
				<strong>{pageTitle}</strong>
			</div>
			<a class="brand" href="/">BigLot Media Plan</a>

			<nav class="desktop-nav" aria-label="Primary navigation">
				{#each menus as menu}
					<a class:active={isActive(menu.href)} href={menu.href}>{menu.label}</a>
				{/each}
			</nav>
		</div>
	</header>

	<div class="content">
		{@render children()}
	</div>

	<Toaster />

	<nav class="bottom-nav" aria-label="Mobile navigation">
		{#each menus as menu}
			<a class:active={isActive(menu.href)} href={menu.href}>
				<span>{menu.shortLabel}</span>
			</a>
		{/each}
	</nav>
</div>

<style>
	:global(:root) {
		/* legacy aliases kept for any existing page styles */
		--shell-max-width: var(--max-width);
		--shell-side-padding: var(--side-padding);
		--shell-bottom-nav-height: var(--bottom-nav-height);
	}

	.app-shell {
		min-height: 100vh;
		background: var(--color-bg);
	}

	.top-bar {
		position: sticky;
		top: 0;
		z-index: var(--z-sticky);
		padding:
			calc(0.7rem + env(safe-area-inset-top, 0px))
			var(--side-padding)
			var(--space-2);
		background: rgba(255, 255, 255, 0.92);
		backdrop-filter: blur(14px);
		border-bottom: 1px solid var(--color-border);
	}

	.top-bar-inner {
		max-width: var(--max-width);
		margin: 0 auto;
		display: flex;
		justify-content: space-between;
		align-items: center;
		gap: var(--space-4);
	}

	.mobile-heading {
		display: none;
		min-width: 0;
	}

	.eyebrow {
		margin: 0;
		font-size: var(--text-xs);
		font-weight: var(--fw-bold);
		letter-spacing: 0.12em;
		text-transform: uppercase;
		color: var(--color-slate-500);
	}

	.mobile-heading strong {
		display: block;
		font-family: var(--font-heading);
		font-size: var(--text-md);
		line-height: var(--leading-tight);
	}

	.brand {
		font-family: var(--font-heading);
		font-weight: var(--fw-bold);
		color: var(--color-slate-900);
		white-space: nowrap;
	}

	.desktop-nav {
		display: flex;
		align-items: center;
		gap: var(--space-1);
		flex-wrap: wrap;
		justify-content: flex-end;
	}

	.desktop-nav a,
	.bottom-nav a {
		color: var(--color-slate-700);
		padding: 0.42rem 0.68rem;
		border-radius: var(--radius-md);
		font-size: var(--text-sm);
		font-weight: var(--fw-semibold);
		border: 1px solid transparent;
		transition:
			background var(--transition-fast),
			color var(--transition-fast),
			border-color var(--transition-fast);
	}

	.desktop-nav a:hover:not(.active),
	.bottom-nav a:hover:not(.active) {
		background: var(--color-slate-100);
	}

	.desktop-nav a.active,
	.bottom-nav a.active {
		background: var(--color-primary-bg);
		border-color: var(--color-primary-border);
		color: var(--color-primary);
	}

	.content {
		max-width: var(--max-width);
		margin: 0 auto;
		padding:
			var(--space-5)
			var(--side-padding)
			calc(var(--space-8) + env(safe-area-inset-bottom, 0px));
	}

	.bottom-nav {
		display: none;
	}

	@media (max-width: 760px) {
		.top-bar {
			padding-bottom: var(--space-3);
		}

		.brand {
			display: none;
		}

		.mobile-heading {
			display: block;
		}

		.desktop-nav {
			display: none;
		}

		.content {
			padding-bottom: calc(var(--bottom-nav-height) + var(--space-5) + env(safe-area-inset-bottom, 0px));
		}

		.bottom-nav {
			position: fixed;
			left: 0;
			right: 0;
			bottom: 0;
			z-index: var(--z-sticky);
			display: grid;
			grid-template-columns: repeat(6, minmax(0, 1fr));
			gap: var(--space-1);
			padding:
				var(--space-2)
				var(--space-3)
				calc(0.7rem + env(safe-area-inset-bottom, 0px));
			background: var(--color-bg-elevated);
			backdrop-filter: blur(14px);
			border-top: 1px solid var(--color-border);
			box-shadow: 0 -6px 18px rgba(15, 23, 42, 0.06);
		}

		.bottom-nav a {
			padding: var(--space-2) var(--space-1);
			text-align: center;
			font-size: var(--text-xs);
			font-weight: var(--fw-bold);
		}
	}



</style>
