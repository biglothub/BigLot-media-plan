<script lang="ts">
  interface Props {
    value?: string | number;
    type?: 'text' | 'number' | 'date' | 'url' | 'email' | 'search' | 'password';
    label?: string;
    placeholder?: string;
    hint?: string;
    error?: string;
    required?: boolean;
    disabled?: boolean;
    readonly?: boolean;
    id?: string;
    name?: string;
    min?: string | number;
    max?: string | number;
    step?: string | number;
    class?: string;
    oninput?: (e: Event & { currentTarget: HTMLInputElement }) => void;
    onchange?: (e: Event & { currentTarget: HTMLInputElement }) => void;
    onblur?: (e: FocusEvent) => void;
  }

  let {
    value = $bindable(''),
    type = 'text',
    label,
    placeholder,
    hint,
    error,
    required = false,
    disabled = false,
    readonly = false,
    id,
    name,
    min,
    max,
    step,
    class: extraClass = '',
    oninput,
    onchange,
    onblur
  }: Props = $props();

  const uid = id ?? `input-${Math.random().toString(36).slice(2, 8)}`;
</script>

<div class="field {extraClass}" class:field--error={!!error} class:field--disabled={disabled}>
  {#if label}
    <label class="field-label" for={uid}>
      {label}
      {#if required}<span class="field-required" aria-hidden="true">*</span>{/if}
    </label>
  {/if}

  <input
    {type}
    id={uid}
    {name}
    {placeholder}
    {required}
    {disabled}
    {readonly}
    {min}
    {max}
    {step}
    bind:value
    class="field-input"
    aria-describedby={error ? `${uid}-error` : hint ? `${uid}-hint` : undefined}
    aria-invalid={!!error}
    {oninput}
    {onchange}
    {onblur}
  />

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

  .field-input {
    width: 100%;
    padding: 0.48rem var(--space-3);
    background: var(--color-bg-elevated);
    border: 1px solid var(--color-border-strong);
    border-radius: var(--radius-md);
    font-size: var(--text-sm);
    color: var(--color-text);
    transition:
      border-color var(--transition-fast),
      box-shadow var(--transition-fast);
    outline: none;
    min-width: 0;
  }

  .field-input::placeholder {
    color: var(--color-slate-400);
  }

  .field-input:hover:not(:disabled):not([readonly]) {
    border-color: var(--color-slate-300);
  }

  .field-input:focus {
    border-color: var(--color-blue-500);
    box-shadow: 0 0 0 3px rgba(59, 130, 246, 0.15);
  }

  .field--error .field-input {
    border-color: var(--color-red-500);
  }

  .field--error .field-input:focus {
    box-shadow: 0 0 0 3px rgba(239, 68, 68, 0.15);
  }

  .field--disabled .field-input {
    opacity: 0.55;
    cursor: not-allowed;
    background: var(--color-slate-100);
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
    display: flex;
    align-items: center;
    gap: var(--space-1);
  }
</style>
