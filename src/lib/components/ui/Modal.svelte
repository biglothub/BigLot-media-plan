<script lang="ts">
  import type { Snippet } from 'svelte';

  type ModalSize = 'sm' | 'md' | 'lg' | 'xl' | 'full';

  interface Props {
    open: boolean;
    title?: string;
    size?: ModalSize;
    onclose?: () => void;
    header?: Snippet;
    children: Snippet;
    footer?: Snippet;
  }

  let {
    open = $bindable(),
    title,
    size = 'md',
    onclose,
    header,
    children,
    footer
  }: Props = $props();

  let dialogEl: HTMLDivElement | null = $state(null);

  function close() {
    open = false;
    onclose?.();
  }

  function handleOverlayClick(e: MouseEvent) {
    if (e.target === e.currentTarget) close();
  }

  function handleKeydown(e: KeyboardEvent) {
    if (e.key === 'Escape') close();
  }

  // Trap focus inside modal
  function trapFocus(e: FocusEvent) {
    if (!dialogEl || !open) return;
    if (!dialogEl.contains(e.target as Node)) {
      dialogEl.querySelector<HTMLElement>('[tabindex]:not([tabindex="-1"]), button, a, input, select, textarea')?.focus();
    }
  }

  $effect(() => {
    if (open) {
      document.body.style.overflow = 'hidden';
      // Move focus into modal after render
      setTimeout(() => {
        (dialogEl?.querySelector<HTMLElement>('button, [tabindex="0"], input, select, textarea, a[href]') ?? dialogEl)?.focus();
      }, 50);
    } else {
      document.body.style.overflow = '';
    }
    return () => { document.body.style.overflow = ''; };
  });
</script>

<svelte:window
  on:keydown={open ? handleKeydown : undefined}
  on:focusin={open ? trapFocus : undefined}
/>

{#if open}
  <!-- svelte-ignore a11y_click_events_have_key_events -->
  <!-- svelte-ignore a11y_no_static_element_interactions -->
  <div
    class="modal-overlay"
    onclick={handleOverlayClick}
  >
    <div
      bind:this={dialogEl}
      class="modal-box modal-box--{size}"
      role="dialog"
      aria-modal="true"
      aria-label={title ?? 'Dialog'}
      tabindex="-1"
    >
      <!-- Header -->
      {#if header}
        <div class="modal-header">
          {@render header()}
        </div>
      {:else if title}
        <div class="modal-header">
          <h2 class="modal-title">{title}</h2>
          <button class="modal-close" type="button" onclick={close} aria-label="Close dialog">
            <svg width="18" height="18" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2.5" stroke-linecap="round">
              <line x1="18" y1="6" x2="6" y2="18"/>
              <line x1="6" y1="6" x2="18" y2="18"/>
            </svg>
          </button>
        </div>
      {/if}

      <!-- Body -->
      <div class="modal-body">
        {@render children()}
      </div>

      <!-- Footer -->
      {#if footer}
        <div class="modal-footer">
          {@render footer()}
        </div>
      {/if}
    </div>
  </div>
{/if}

<style>
  .modal-overlay {
    position: fixed;
    inset: 0;
    z-index: var(--z-modal);
    background: rgba(15, 23, 42, 0.36);
    display: grid;
    place-items: center;
    padding: var(--space-4);
    animation: overlay-in var(--transition-normal) ease;
  }

  @keyframes overlay-in {
    from { opacity: 0; }
    to { opacity: 1; }
  }

  .modal-box {
    background: var(--color-bg-elevated);
    border: 1px solid var(--color-border);
    border-radius: var(--radius-lg);
    box-shadow: var(--shadow-lg);
    width: 100%;
    max-height: calc(100vh - 2rem);
    overflow-y: auto;
    overscroll-behavior: contain;
    -webkit-overflow-scrolling: touch;
    display: flex;
    flex-direction: column;
    gap: 0;
    animation: modal-in var(--transition-normal) ease;
  }

  @keyframes modal-in {
    from {
      opacity: 0;
      transform: translateY(12px) scale(0.98);
    }
    to {
      opacity: 1;
      transform: translateY(0) scale(1);
    }
  }

  /* ── Sizes ── */
  .modal-box--sm  { max-width: 400px; }
  .modal-box--md  { max-width: 560px; }
  .modal-box--lg  { max-width: 720px; }
  .modal-box--xl  { max-width: 920px; }
  .modal-box--full { max-width: calc(100vw - 2rem); max-height: calc(100vh - 2rem); }

  /* ── Header ── */
  .modal-header {
    display: flex;
    align-items: center;
    justify-content: space-between;
    gap: var(--space-3);
    padding: var(--space-4) var(--space-5);
    border-bottom: 1px solid var(--color-border);
    flex-shrink: 0;
  }

  .modal-title {
    font-family: var(--font-heading);
    font-size: var(--text-md);
    font-weight: var(--fw-bold);
    color: var(--color-slate-900);
    line-height: var(--leading-tight);
  }

  .modal-close {
    display: flex;
    align-items: center;
    justify-content: center;
    width: 2rem;
    height: 2rem;
    border-radius: var(--radius-md);
    color: var(--color-slate-400);
    transition: background var(--transition-fast), color var(--transition-fast);
    flex-shrink: 0;
  }

  .modal-close:hover {
    background: var(--color-slate-100);
    color: var(--color-slate-700);
  }

  /* ── Body ── */
  .modal-body {
    padding: var(--space-5) var(--space-6);
    flex: 1;
    min-height: 0;
  }

  /* ── Footer ── */
  .modal-footer {
    display: flex;
    align-items: center;
    justify-content: flex-end;
    gap: var(--space-2);
    padding: var(--space-4) var(--space-6);
    border-top: 1px solid var(--color-border);
    flex-shrink: 0;
  }

  /* ── Mobile: bottom sheet ── */
  @media (max-width: 640px) {
    .modal-overlay {
      padding: 0;
      place-items: end stretch;
    }

    .modal-box {
      max-width: 100%;
      max-height: 92vh;
      border-radius: var(--radius-2xl) var(--radius-2xl) 0 0;
      animation: sheet-in var(--transition-normal) ease;
    }

    @keyframes sheet-in {
      from {
        opacity: 0;
        transform: translateY(100%);
      }
      to {
        opacity: 1;
        transform: translateY(0);
      }
    }

    .modal-footer {
      padding-bottom: calc(var(--space-5) + env(safe-area-inset-bottom, 0px));
    }

    .modal-box--full {
      max-height: 100vh;
      border-radius: 0;
    }
  }
</style>
