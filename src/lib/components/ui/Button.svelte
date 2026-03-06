<script lang="ts">
  import type { Snippet } from 'svelte';

  type Variant = 'primary' | 'secondary' | 'ghost' | 'danger' | 'ai';
  type Size = 'sm' | 'md' | 'lg';

  interface Props {
    variant?: Variant;
    size?: Size;
    loading?: boolean;
    disabled?: boolean;
    type?: 'button' | 'submit' | 'reset';
    href?: string;
    class?: string;
    onclick?: (e: MouseEvent) => void;
    children: Snippet;
  }

  let {
    variant = 'secondary',
    size = 'md',
    loading = false,
    disabled = false,
    type = 'button',
    href,
    class: extraClass = '',
    onclick,
    children
  }: Props = $props();

  const isDisabled = $derived(disabled || loading);
</script>

{#if href}
  <a
    {href}
    class="btn btn--{variant} btn--{size} {extraClass}"
    class:loading
    aria-disabled={isDisabled}
    tabindex={isDisabled ? -1 : 0}
  >
    {#if loading}
      <span class="btn-spinner" aria-hidden="true"></span>
    {/if}
    {@render children()}
  </a>
{:else}
  <button
    {type}
    class="btn btn--{variant} btn--{size} {extraClass}"
    class:loading
    disabled={isDisabled}
    {onclick}
    aria-busy={loading}
  >
    {#if loading}
      <span class="btn-spinner" aria-hidden="true"></span>
    {/if}
    {@render children()}
  </button>
{/if}

<style>
  .btn {
    display: inline-flex;
    align-items: center;
    justify-content: center;
    gap: var(--space-2);
    font-family: var(--font-sans);
    font-weight: var(--fw-semibold);
    line-height: 1;
    text-decoration: none;
    white-space: nowrap;
    cursor: pointer;
    border: 1px solid transparent;
    border-radius: var(--radius-full);
    transition:
      background var(--transition-fast),
      border-color var(--transition-fast),
      color var(--transition-fast),
      box-shadow var(--transition-fast),
      transform var(--transition-fast);
    position: relative;
    -webkit-user-select: none;
    user-select: none;
  }

  .btn:active:not(:disabled) {
    transform: scale(0.97);
  }

  /* ── Sizes ── */
  .btn--sm {
    font-size: var(--text-xs);
    padding: 0.3rem 0.65rem;
    gap: var(--space-1);
  }

  .btn--md {
    font-size: var(--text-sm);
    padding: 0.44rem 0.85rem;
  }

  .btn--lg {
    font-size: var(--text-base);
    padding: 0.65rem 1.25rem;
  }

  /* ── Variants ── */
  .btn--primary {
    background: var(--color-blue-700);
    color: #fff;
    border-color: var(--color-blue-700);
    box-shadow: var(--shadow-xs);
  }
  .btn--primary:hover:not(:disabled) {
    background: var(--color-blue-800);
    border-color: var(--color-blue-800);
    box-shadow: var(--shadow-sm);
  }

  .btn--secondary {
    background: var(--color-bg-elevated);
    color: var(--color-slate-700);
    border-color: var(--color-border-strong);
    box-shadow: var(--shadow-xs);
  }
  .btn--secondary:hover:not(:disabled) {
    background: var(--color-slate-50);
    border-color: var(--color-slate-300);
  }

  .btn--ghost {
    background: transparent;
    color: var(--color-slate-600);
    border-color: transparent;
  }
  .btn--ghost:hover:not(:disabled) {
    background: var(--color-slate-100);
    color: var(--color-slate-800);
  }

  .btn--danger {
    background: var(--color-bg-elevated);
    color: var(--color-red-600);
    border-color: rgba(220, 38, 38, 0.2);
  }
  .btn--danger:hover:not(:disabled) {
    background: var(--color-red-50);
    border-color: rgba(220, 38, 38, 0.35);
  }

  .btn--ai {
    background: linear-gradient(135deg, var(--color-purple-600), var(--color-indigo-600));
    color: #fff;
    border-color: transparent;
    box-shadow: 0 2px 12px rgba(124, 58, 237, 0.3);
  }
  .btn--ai:hover:not(:disabled) {
    box-shadow: 0 4px 18px rgba(124, 58, 237, 0.4);
    filter: brightness(1.07);
  }

  /* ── Disabled & Loading ── */
  .btn:disabled,
  .btn.loading {
    opacity: 0.55;
    cursor: not-allowed;
    transform: none;
  }

  /* ── Spinner ── */
  .btn-spinner {
    display: block;
    width: 0.85em;
    height: 0.85em;
    border: 2px solid currentColor;
    border-right-color: transparent;
    border-radius: 50%;
    animation: btn-spin 0.65s linear infinite;
    flex-shrink: 0;
  }

  @keyframes btn-spin {
    to { transform: rotate(360deg); }
  }
</style>
