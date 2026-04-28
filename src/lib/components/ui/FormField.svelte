<script lang="ts">
  import type { Snippet } from 'svelte';

  interface Props {
    label?: string;
    for?: string;
    hint?: string;
    error?: string;
    required?: boolean;
    children: Snippet;
    class?: string;
  }

  let {
    label,
    for: htmlFor,
    hint,
    error,
    required = false,
    children,
    class: extraClass = ''
  }: Props = $props();
</script>

<div class="form-field {extraClass}" class:form-field--error={!!error}>
  {#if label}
    <label class="form-label" for={htmlFor}>
      {label}
      {#if required}<span class="form-required" aria-hidden="true">*</span>{/if}
    </label>
  {/if}

  {@render children()}

  {#if error}
    <p class="form-error" role="alert">{error}</p>
  {:else if hint}
    <p class="form-hint">{hint}</p>
  {/if}
</div>

<style>
  .form-field {
    display: flex;
    flex-direction: column;
    gap: var(--space-1);
    min-width: 0;
  }

  .form-label {
    font-size: var(--text-xs);
    font-weight: var(--fw-semibold);
    color: var(--color-slate-700);
    display: flex;
    align-items: center;
    gap: var(--space-1);
  }

  .form-required {
    color: var(--color-red-500);
  }

  .form-hint {
    font-size: var(--text-xs);
    color: var(--color-slate-400);
    margin: 0;
  }

  .form-error {
    font-size: var(--text-xs);
    color: var(--color-red-600);
    margin: 0;
  }

  /* Style native inputs/selects/textareas inside form-field */
  .form-field :global(input),
  .form-field :global(select),
  .form-field :global(textarea) {
    width: 100%;
    padding: 0.58rem var(--space-3);
    background: var(--color-bg-elevated);
    border: 1px solid var(--color-border-strong);
    border-radius: var(--radius-md);
    font-size: var(--text-sm);
    font-family: var(--font-sans);
    color: var(--color-text);
    transition: border-color var(--transition-fast), box-shadow var(--transition-fast);
    outline: none;
  }

  .form-field :global(input:focus),
  .form-field :global(select:focus),
  .form-field :global(textarea:focus) {
    border-color: rgba(15, 23, 42, 0.34);
    box-shadow: 0 0 0 3px rgba(15, 23, 42, 0.08);
  }

  .form-field :global(input::placeholder),
  .form-field :global(textarea::placeholder) {
    color: var(--color-slate-400);
  }

  .form-field--error :global(input),
  .form-field--error :global(select),
  .form-field--error :global(textarea) {
    border-color: var(--color-red-500);
  }

  .form-field--error :global(input:focus),
  .form-field--error :global(select:focus),
  .form-field--error :global(textarea:focus) {
    box-shadow: 0 0 0 3px rgba(239, 68, 68, 0.15);
  }
</style>
