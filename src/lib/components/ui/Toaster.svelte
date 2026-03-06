<script lang="ts">
  import { toast } from '$lib/stores/toast';

  const icons = {
    success: `<svg width="16" height="16" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2.5" stroke-linecap="round" stroke-linejoin="round"><polyline points="20 6 9 17 4 12"/></svg>`,
    error:   `<svg width="16" height="16" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2.5" stroke-linecap="round"><circle cx="12" cy="12" r="10"/><line x1="15" y1="9" x2="9" y2="15"/><line x1="9" y1="9" x2="15" y2="15"/></svg>`,
    warning: `<svg width="16" height="16" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2.5" stroke-linecap="round" stroke-linejoin="round"><path d="m21.73 18-8-14a2 2 0 0 0-3.48 0l-8 14A2 2 0 0 0 4 21h16a2 2 0 0 0 1.73-3Z"/><line x1="12" y1="9" x2="12" y2="13"/><line x1="12" y1="17" x2="12.01" y2="17"/></svg>`,
    info:    `<svg width="16" height="16" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2.5" stroke-linecap="round" stroke-linejoin="round"><circle cx="12" cy="12" r="10"/><line x1="12" y1="16" x2="12" y2="12"/><line x1="12" y1="8" x2="12.01" y2="8"/></svg>`,
  };
</script>

<div class="toaster" role="region" aria-label="Notifications" aria-live="polite">
  {#each $toast as item (item.id)}
    <div class="toast toast--{item.type}" role="alert">
      <span class="toast-icon" aria-hidden="true">{@html icons[item.type]}</span>
      <span class="toast-message">{item.message}</span>
      <button
        class="toast-close"
        onclick={() => toast.dismiss(item.id)}
        aria-label="Dismiss notification"
      >
        <svg width="14" height="14" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2.5" stroke-linecap="round">
          <line x1="18" y1="6" x2="6" y2="18"/>
          <line x1="6" y1="6" x2="18" y2="18"/>
        </svg>
      </button>
    </div>
  {/each}
</div>

<style>
  .toaster {
    position: fixed;
    bottom: calc(var(--bottom-nav-height, 0px) + var(--space-4));
    right: var(--space-4);
    z-index: var(--z-toast);
    display: flex;
    flex-direction: column;
    gap: var(--space-2);
    max-width: 360px;
    width: calc(100vw - 2rem);
    pointer-events: none;
  }

  .toast {
    display: flex;
    align-items: flex-start;
    gap: var(--space-3);
    padding: var(--space-3) var(--space-4);
    border-radius: var(--radius-lg);
    border: 1px solid transparent;
    box-shadow: var(--shadow-lg);
    font-size: var(--text-sm);
    font-weight: var(--fw-medium);
    line-height: var(--leading-snug);
    pointer-events: all;
    animation: toast-in 0.25s ease;
    backdrop-filter: blur(8px);
  }

  @keyframes toast-in {
    from {
      opacity: 0;
      transform: translateY(8px) scale(0.96);
    }
    to {
      opacity: 1;
      transform: translateY(0) scale(1);
    }
  }

  .toast--success {
    background: rgba(240, 253, 244, 0.97);
    border-color: rgba(22, 163, 74, 0.25);
    color: var(--color-green-700);
  }

  .toast--error {
    background: rgba(254, 242, 242, 0.97);
    border-color: rgba(220, 38, 38, 0.25);
    color: var(--color-red-700);
  }

  .toast--warning {
    background: rgba(254, 252, 232, 0.97);
    border-color: rgba(202, 138, 4, 0.25);
    color: var(--color-yellow-700);
  }

  .toast--info {
    background: rgba(239, 246, 255, 0.97);
    border-color: rgba(29, 78, 216, 0.2);
    color: var(--color-blue-700);
  }

  .toast-icon {
    display: flex;
    flex-shrink: 0;
    margin-top: 1px;
  }

  .toast-message {
    flex: 1;
  }

  .toast-close {
    display: flex;
    align-items: center;
    justify-content: center;
    flex-shrink: 0;
    opacity: 0.55;
    padding: var(--space-1);
    border-radius: var(--radius-sm);
    transition: opacity var(--transition-fast);
    margin: -4px -4px -4px 0;
  }

  .toast-close:hover {
    opacity: 1;
  }

  @media (max-width: 640px) {
    .toaster {
      left: var(--space-4);
      right: var(--space-4);
      max-width: none;
      bottom: calc(var(--bottom-nav-height, 5rem) + var(--space-2));
    }
  }
</style>
