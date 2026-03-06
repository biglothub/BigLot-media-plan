<script lang="ts">
  import type { Snippet } from 'svelte';

  interface Props {
    value?: string;
    label?: string;
    hint?: string;
    error?: string;
    required?: boolean;
    disabled?: boolean;
    id?: string;
    name?: string;
    placeholder?: string;
    class?: string;
    onchange?: (e: Event & { currentTarget: HTMLSelectElement }) => void;
    children: Snippet;
  }

  let {
    value = $bindable(''),
    label,
    hint,
    error,
    required = false,
    disabled = false,
    id,
    name,
    placeholder,
    class: extraClass = '',
    onchange,
    children
  }: Props = $props();

  const uid = id ?? `select-${Math.random().toString(36).slice(2, 8)}`;
</script>

<div class="field {extraClass}" class:field--error={!!error} class:field--disabled={disabled}>
  {#if label}
    <label class="field-label" for={uid}>
      {label}
      {#if required}<span class="field-required" aria-hidden="true">*</span>{/if}
    </label>
  {/if}

  <div class="select-wrapper">
    <select
      id={uid}
      {name}
      {required}
      {disabled}
      bind:value
      class="field-select"
      aria-describedby={error ? `${uid}-error` : hint ? `${uid}-hint` : undefined}
      aria-invalid={!!error}
      {onchange}
    >
      {#if placeholder}
        <option value="" disabled hidden>{placeholder}</option>
      {/if}
      {@render children()}
    </select>
    <span class="select-arrow" aria-hidden="true">
      <svg width="14" height="14" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2.5" stroke-linecap="round" stroke-linejoin="round">
        <polyline points="6 9 12 15 18 9"/>
      </svg>
    </span>
  </div>

  {#if error}
    <p id="{uid}-error" class="field-error" role="alert">{error}</p>
  {:else if hint}
    <p id="{uid}-hint" class="field-hint">{hint}</p>
  {/if}
</div>

<style>
  .field {
    display: flex;
    flex-direction: column;
    gap: var(--space-1);
  }

  .field-label {
    font-size: var(--text-sm);
    font-weight: var(--fw-medium);
    color: var(--color-slate-700);
    display: flex;
    align-items: center;
    gap: var(--space-1);
  }

  .field-required {
    color: var(--color-red-500);
  }

  .select-wrapper {
    position: relative;
  }

  .field-select {
    width: 100%;
    padding: 0.48rem var(--space-8) 0.48rem var(--space-3);
    background: var(--color-bg-elevated);
    border: 1px solid var(--color-border-strong);
    border-radius: var(--radius-md);
    font-size: var(--text-sm);
    color: var(--color-text);
    cursor: pointer;
    transition:
      border-color var(--transition-fast),
      box-shadow var(--transition-fast);
    outline: none;
    appearance: none;
    -webkit-appearance: none;
  }

  .field-select:hover:not(:disabled) {
    border-color: var(--color-slate-300);
  }

  .field-select:focus {
    border-color: var(--color-blue-500);
    box-shadow: 0 0 0 3px rgba(59, 130, 246, 0.15);
  }

  .field--error .field-select {
    border-color: var(--color-red-500);
  }

  .field--disabled .field-select {
    opacity: 0.55;
    cursor: not-allowed;
    background: var(--color-slate-100);
  }

  .select-arrow {
    position: absolute;
    right: var(--space-3);
    top: 50%;
    transform: translateY(-50%);
    pointer-events: none;
    color: var(--color-slate-400);
    display: flex;
  }

  .field-hint {
    font-size: var(--text-xs);
    color: var(--color-slate-400);
    margin: 0;
  }

  .field-error {
    font-size: var(--text-xs);
    color: var(--color-red-600);
    margin: 0;
  }
</style>
