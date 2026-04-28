<script lang="ts">
  import type { Snippet } from 'svelte';

  interface Props {
    title: string;
    subtitle?: string;
    eyebrow?: string;
    actions?: Snippet;
    class?: string;
  }

  let { title, subtitle, eyebrow, actions, class: extraClass = '' }: Props = $props();
</script>

<div class="page-header {extraClass}">
  <div class="page-header-text">
    {#if eyebrow}
      <p class="page-eyebrow">{eyebrow}</p>
    {/if}
    <h1 class="page-title">{title}</h1>
    {#if subtitle}
      <p class="page-subtitle">{subtitle}</p>
    {/if}
  </div>

  {#if actions}
    <div class="page-actions">
      {@render actions()}
    </div>
  {/if}
</div>

<style>
  .page-header {
    display: flex;
    align-items: flex-start;
    justify-content: space-between;
    gap: var(--space-3);
    padding-bottom: var(--space-4);
    flex-wrap: wrap;
  }

  .page-header-text {
    display: flex;
    flex-direction: column;
    gap: var(--space-1);
    min-width: 0;
  }

  .page-eyebrow {
    font-size: var(--text-xs);
    font-weight: var(--fw-bold);
    letter-spacing: 0.1em;
    text-transform: uppercase;
    color: var(--color-slate-500);
    margin: 0;
  }

  .page-title {
    font-family: var(--font-heading);
    font-size: clamp(1.65rem, 3vw, 2.35rem);
    font-weight: var(--fw-bold);
    color: var(--color-slate-900);
    line-height: var(--leading-tight);
    margin: 0;
  }

  .page-subtitle {
    font-size: var(--text-sm);
    color: var(--color-slate-500);
    margin: 0;
    line-height: var(--leading-relaxed);
  }

  .page-actions {
    display: flex;
    align-items: center;
    gap: var(--space-2);
    flex-wrap: wrap;
    flex-shrink: 0;
    padding-top: var(--space-1);
  }

  @media (max-width: 640px) {
    .page-header {
      flex-direction: column;
    }

    .page-actions {
      width: 100%;
    }
  }
</style>
