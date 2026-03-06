<script lang="ts">
  interface Props {
    value?: string;
    label?: string;
    placeholder?: string;
    hint?: string;
    error?: string;
    required?: boolean;
    disabled?: boolean;
    readonly?: boolean;
    rows?: number;
    id?: string;
    name?: string;
    autoresize?: boolean;
    class?: string;
    oninput?: (e: Event & { currentTarget: HTMLTextAreaElement }) => void;
    onchange?: (e: Event & { currentTarget: HTMLTextAreaElement }) => void;
  }

  let {
    value = $bindable(''),
    label,
    placeholder,
    hint,
    error,
    required = false,
    disabled = false,
    readonly = false,
    rows = 3,
    id,
    name,
    autoresize = false,
    class: extraClass = '',
    oninput,
    onchange
  }: Props = $props();

  const uid = id ?? `textarea-${Math.random().toString(36).slice(2, 8)}`;

  let el: HTMLTextAreaElement | null = $state(null);

  function resize() {
    if (!autoresize || !el) return;
    el.style.height = 'auto';
    el.style.height = `${el.scrollHeight}px`;
  }

  $effect(() => {
    if (autoresize) resize();
  });
</script>

<div class="field {extraClass}" class:field--error={!!error} class:field--disabled={disabled}>
  {#if label}
    <label class="field-label" for={uid}>
      {label}
      {#if required}<span class="field-required" aria-hidden="true">*</span>{/if}
    </label>
  {/if}

  <textarea
    bind:this={el}
    id={uid}
    {name}
    {placeholder}
    {required}
    {disabled}
    {readonly}
    {rows}
    bind:value
    class="field-textarea"
    class:autoresize
    aria-describedby={error ? `${uid}-error` : hint ? `${uid}-hint` : undefined}
    aria-invalid={!!error}
    oninput={(e) => { resize(); oninput?.(e); }}
    {onchange}
  ></textarea>

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

  .field-textarea {
    width: 100%;
    padding: 0.5rem var(--space-3);
    background: var(--color-bg-elevated);
    border: 1px solid var(--color-border-strong);
    border-radius: var(--radius-md);
    font-size: var(--text-sm);
    color: var(--color-text);
    line-height: var(--leading-relaxed);
    resize: vertical;
    transition:
      border-color var(--transition-fast),
      box-shadow var(--transition-fast);
    outline: none;
    min-width: 0;
  }

  .field-textarea.autoresize {
    resize: none;
    overflow: hidden;
  }

  .field-textarea::placeholder {
    color: var(--color-slate-400);
  }

  .field-textarea:hover:not(:disabled):not([readonly]) {
    border-color: var(--color-slate-300);
  }

  .field-textarea:focus {
    border-color: var(--color-blue-500);
    box-shadow: 0 0 0 3px rgba(59, 130, 246, 0.15);
  }

  .field--error .field-textarea {
    border-color: var(--color-red-500);
  }

  .field--disabled .field-textarea {
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
  }
</style>
