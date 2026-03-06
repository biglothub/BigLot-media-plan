<script lang="ts">
  interface Props {
    size?: 'sm' | 'md' | 'lg';
    label?: string;
  }

  let { size = 'md', label = 'กำลังโหลด...' }: Props = $props();
</script>

<span class="spinner spinner--{size}" role="status" aria-label={label}>
  <span class="spinner-ring" aria-hidden="true"></span>
  <span class="sr-only">{label}</span>
</span>

<style>
  .spinner {
    display: inline-flex;
    align-items: center;
    justify-content: center;
  }

  .spinner--sm  { width: 1rem;    height: 1rem; }
  .spinner--md  { width: 1.5rem;  height: 1.5rem; }
  .spinner--lg  { width: 2.25rem; height: 2.25rem; }

  .spinner-ring {
    display: block;
    width: 100%;
    height: 100%;
    border: 2px solid var(--color-slate-200);
    border-top-color: var(--color-blue-600);
    border-radius: var(--radius-full);
    animation: spin 0.7s linear infinite;
  }

  .spinner--lg .spinner-ring {
    border-width: 3px;
  }

  @keyframes spin {
    to { transform: rotate(360deg); }
  }
</style>
