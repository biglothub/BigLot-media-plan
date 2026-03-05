<script lang="ts">
	import favicon from '$lib/assets/favicon.svg';
	import { page } from '$app/state';

	let { children } = $props();

	const menus = [
		{ href: '/', label: 'Backlog' },
		{ href: '/kanban', label: 'Kanban' },
		{ href: '/calendar', label: 'Shoot Calendar' },
		{ href: '/kpi', label: 'KPI Compare' },
		{ href: '/monitoring', label: 'Content Monitoring' }
	];

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
	<header class="top-nav">
		<a class="brand" href="/">BigLot Media Plan</a>
		<nav>
			{#each menus as menu}
				<a class:active={isActive(menu.href)} href={menu.href}>{menu.label}</a>
			{/each}
		</nav>
	</header>

	<div class="content">
		{@render children()}
	</div>
</div>

<style>
	:global(body) {
		margin: 0;
		font-family: 'Noto Sans Thai', sans-serif;
		background: linear-gradient(180deg, #f8fafc 0%, #eef2ff 100%);
		color: #0f172a;
	}

	.app-shell {
		min-height: 100vh;
	}

	.top-nav {
		position: sticky;
		top: 0;
		z-index: 20;
		display: flex;
		justify-content: space-between;
		align-items: center;
		gap: 1rem;
		padding: 0.9rem 1.25rem;
		background: rgba(255, 255, 255, 0.88);
		backdrop-filter: blur(10px);
		border-bottom: 1px solid rgba(15, 23, 42, 0.08);
	}

	.brand {
		font-family: 'Space Grotesk', 'Noto Sans Thai', sans-serif;
		font-weight: 700;
		text-decoration: none;
		color: #0f172a;
	}

	nav {
		display: flex;
		align-items: center;
		gap: 0.55rem;
		flex-wrap: wrap;
	}

	nav a {
		text-decoration: none;
		color: #334155;
		padding: 0.42rem 0.8rem;
		border-radius: 999px;
		font-size: 0.88rem;
		font-weight: 600;
		border: 1px solid transparent;
	}

	nav a.active {
		background: rgba(37, 99, 235, 0.12);
		border-color: rgba(37, 99, 235, 0.2);
		color: #1d4ed8;
	}

	.content {
		max-width: 1200px;
		margin: 0 auto;
		padding: 1.5rem 1rem 3rem;
	}

	@media (max-width: 640px) {
		.top-nav {
			flex-direction: column;
			align-items: stretch;
		}
	}
</style>
