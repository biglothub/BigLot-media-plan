<script lang="ts">
  import type { Snippet } from 'svelte';

  interface Props {
    icon?: string;
    title: string;
    description?: string;
    action?: Snippet;
  }

  let { icon = '📭', title, description, action }: Props = $props();
</script>

<div class="empty-state">
  {#if icon}
    <span class="empty-icon" aria-hidden="true">{icon}</span>
  {/if}
  <h3 class="empty-title">{title}</h3>
  {#if description}
    <p class="empty-desc">{description}</p>
  {/if}
  {#if action}
    <div class="empty-action">
      {@render action()}
    </div>
  {/if}
</div>

<style>
  .empty-state {
    display: flex;
    flex-direction: column;
    align-items: center;
    justify-content: center;
    text-align: center;
    gap: var(--space-3);
    padding: var(--space-12) var(--space-6);
    color: var(--color-slate-500);
  }

  .empty-icon {
    font-size: 2.5rem;
    line-height: 1;
    display: block;
    margin-bottom: var(--space-1);
    filter: grayscale(0.3);
  }

  .empty-title {
    font-family: var(--font-heading);
    font-size: var(--text-lg);
    font-weight: var(--fw-semibold);
    color: var(--color-slate-700);
    margin: 0;
  }

  .empty-desc {
    font-size: var(--text-sm);
    line-height: var(--leading-relaxed);
    color: var(--color-slate-400);
    max-width: 320px;
    margin: 0;
  }

  .empty-action {
    margin-top: var(--space-2);
  }
</style>
