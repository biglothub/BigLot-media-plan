<script lang="ts">
	import favicon from '$lib/assets/favicon.svg';
	import { page } from '$app/state';

	let { children } = $props();

	const menus = [
		{ href: '/', label: 'Backlog', shortLabel: 'Ideas' },
		{ href: '/kanban', label: 'Kanban', shortLabel: 'Plan' },
		{ href: '/calendar', label: 'Shoot Calendar', shortLabel: 'Calendar' },
		{ href: '/dashboard', label: 'Dashboard', shortLabel: 'KPI' }
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
</script>

<svelte:head>
	<link rel="icon" href={favicon} />
	<link rel="preconnect" href="https://fonts.googleapis.com" />
	<link rel="preconnect" href="https://fonts.gstatic.com" crossorigin="anonymous" />
	<link
		href="https://fonts.googleapis.com/css2?family=Noto+Sans+Thai:wght@400;500;700&family=Space+Grotesk:wght@400;500;700&display=swap"
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
		</div>

		<nav class="desktop-nav" aria-label="Primary navigation">
			{#each menus as menu}
				<a class:active={isActive(menu.href)} href={menu.href}>{menu.label}</a>
			{/each}
		</nav>
	</header>

	<div class="content">
		{@render children()}
	</div>

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
		color-scheme: light;
		--shell-max-width: 1200px;
		--shell-side-padding: clamp(0.9rem, 3vw, 1.25rem);
		--shell-bottom-nav-height: 5rem;
	}

	:global(body) {
		margin: 0;
		font-family: 'Noto Sans Thai', sans-serif;
		background:
			radial-gradient(circle at top left, rgba(59, 130, 246, 0.14), transparent 28%),
			linear-gradient(180deg, #f8fafc 0%, #eef2ff 100%);
		color: #0f172a;
	}

	.app-shell {
		min-height: 100vh;
	}

	.top-bar {
		position: sticky;
		top: 0;
		z-index: 30;
		padding:
			calc(0.8rem + env(safe-area-inset-top, 0px))
			var(--shell-side-padding)
			0.75rem;
		background:
			linear-gradient(180deg, rgba(248, 250, 252, 0.96) 0%, rgba(248, 250, 252, 0.9) 100%);
		backdrop-filter: blur(16px);
		border-bottom: 1px solid rgba(15, 23, 42, 0.08);
	}

	.top-bar-inner {
		max-width: var(--shell-max-width);
		margin: 0 auto;
		display: flex;
		justify-content: space-between;
		align-items: flex-end;
		gap: 1rem;
	}

	.mobile-heading {
		display: none;
		min-width: 0;
	}

	.eyebrow {
		margin: 0;
		font-size: 0.68rem;
		font-weight: 700;
		letter-spacing: 0.12em;
		text-transform: uppercase;
		color: #64748b;
	}

	.mobile-heading strong {
		display: block;
		font-family: 'Space Grotesk', 'Noto Sans Thai', sans-serif;
		font-size: 1.02rem;
		line-height: 1.15;
	}

	.brand {
		font-family: 'Space Grotesk', 'Noto Sans Thai', sans-serif;
		font-weight: 700;
		text-decoration: none;
		color: #0f172a;
	}

	.desktop-nav {
		max-width: var(--shell-max-width);
		margin: 0.75rem auto 0;
		display: flex;
		align-items: center;
		gap: 0.55rem;
		flex-wrap: wrap;
	}

	.desktop-nav a,
	.bottom-nav a {
		text-decoration: none;
		color: #334155;
		padding: 0.42rem 0.8rem;
		border-radius: 999px;
		font-size: 0.88rem;
		font-weight: 600;
		border: 1px solid transparent;
	}

	.desktop-nav a.active,
	.bottom-nav a.active {
		background: rgba(37, 99, 235, 0.12);
		border-color: rgba(37, 99, 235, 0.2);
		color: #1d4ed8;
	}

	.content {
		max-width: var(--shell-max-width);
		margin: 0 auto;
		padding:
			1.25rem
			var(--shell-side-padding)
			calc(2rem + env(safe-area-inset-bottom, 0px));
	}

	.bottom-nav {
		display: none;
	}

	@media (max-width: 760px) {
		.top-bar {
			padding-bottom: 0.8rem;
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
			padding-bottom: calc(var(--shell-bottom-nav-height) + 1.25rem + env(safe-area-inset-bottom, 0px));
		}

		.bottom-nav {
			position: fixed;
			left: 0;
			right: 0;
			bottom: 0;
			z-index: 40;
			display: grid;
				grid-template-columns: repeat(4, minmax(0, 1fr));
			gap: 0.35rem;
			padding:
				0.6rem
				0.8rem
				calc(0.7rem + env(safe-area-inset-bottom, 0px));
			background: rgba(255, 255, 255, 0.96);
			backdrop-filter: blur(16px);
			border-top: 1px solid rgba(15, 23, 42, 0.08);
			box-shadow: 0 -8px 24px rgba(15, 23, 42, 0.08);
		}

		.bottom-nav a {
			padding: 0.55rem 0.2rem;
			text-align: center;
			font-size: 0.75rem;
			font-weight: 700;
		}
	}
</style>
