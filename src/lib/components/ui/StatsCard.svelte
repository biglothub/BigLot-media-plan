<script lang="ts">
  interface Props {
    label: string;
    value: string | number;
    sub?: string;
    icon?: string;
    trend?: 'up' | 'down' | 'neutral';
    trendValue?: string;
    variant?: 'default' | 'primary' | 'success' | 'warning';
  }

  let { label, value, sub, icon, trend, trendValue, variant = 'default' }: Props = $props();

  const trendIcon = $derived(
    trend === 'up' ? '↑' : trend === 'down' ? '↓' : '–'
  );
</script>

<div class="stats-card stats-card--{variant}">
  <div class="stats-card-header">
    <span class="stats-label">{label}</span>
    {#if icon}
      <span class="stats-icon" aria-hidden="true">{icon}</span>
    {/if}
  </div>
  <div class="stats-value" aria-label="{label}: {value}">
    {value}
  </div>
  {#if sub || (trend && trendValue)}
    <div class="stats-footer">
      {#if trend && trendValue}
        <span class="stats-trend stats-trend--{trend}">
          {trendIcon} {trendValue}
        </span>
      {/if}
      {#if sub}
        <span class="stats-sub">{sub}</span>
      {/if}
    </div>
  {/if}
</div>

<style>
  .stats-card {
    background: var(--color-bg-elevated);
    border: 1px solid var(--color-border);
    border-radius: var(--radius-lg);
    padding: var(--space-4);
    display: flex;
    flex-direction: column;
    gap: var(--space-2);
    box-shadow: var(--shadow-xs);
    transition: border-color var(--transition-fast);
  }

  .stats-card--primary {
    background: var(--color-bg-elevated);
    border-color: var(--color-primary-border);
  }

  .stats-card--success {
    background: var(--color-bg-elevated);
    border-color: rgba(22, 163, 74, 0.2);
  }

  .stats-card--warning {
    background: var(--color-bg-elevated);
    border-color: rgba(202, 138, 4, 0.2);
  }

  .stats-card-header {
    display: flex;
    align-items: center;
    justify-content: space-between;
    gap: var(--space-2);
  }

  .stats-label {
    font-size: var(--text-xs);
    font-weight: var(--fw-semibold);
    color: var(--color-slate-500);
    text-transform: uppercase;
    letter-spacing: 0.06em;
  }

  .stats-icon {
    font-size: 1.2rem;
    line-height: 1;
  }

  .stats-value {
    font-family: var(--font-heading);
    font-size: var(--text-xl);
    font-weight: var(--fw-bold);
    color: var(--color-slate-900);
    line-height: 1;
  }

  .stats-footer {
    display: flex;
    align-items: center;
    gap: var(--space-2);
    flex-wrap: wrap;
  }

  .stats-trend {
    font-size: var(--text-xs);
    font-weight: var(--fw-semibold);
    padding: 0.15rem 0.45rem;
    border-radius: var(--radius-full);
  }

  .stats-trend--up {
    background: var(--color-green-50);
    color: var(--color-green-700);
  }

  .stats-trend--down {
    background: var(--color-red-50);
    color: var(--color-red-700);
  }

  .stats-trend--neutral {
    background: var(--color-slate-100);
    color: var(--color-slate-500);
  }

  .stats-sub {
    font-size: var(--text-xs);
    color: var(--color-slate-400);
  }
</style>
