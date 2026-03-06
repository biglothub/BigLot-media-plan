<script lang="ts">
  import type { SupportedPlatform, BacklogContentCategory, ProductionStage } from '$lib/types';

  type BadgeVariant =
    | 'platform'
    | 'category'
    | 'stage'
    | 'content-type'
    | 'neutral'
    | 'success'
    | 'warning'
    | 'danger'
    | 'info';

  interface Props {
    variant?: BadgeVariant;
    value?: string;
    label?: string;
    size?: 'sm' | 'md';
    class?: string;
  }

  let { variant = 'neutral', value = '', label, size = 'md', class: extraClass = '' }: Props = $props();

  // Platform display
  const platformLabels: Record<string, string> = {
    youtube: 'YouTube',
    facebook: 'Facebook',
    instagram: 'Instagram',
    tiktok: 'TikTok'
  };

  // Category display
  const categoryLabels: Record<string, string> = {
    hero: 'Hero',
    hub: 'Hub',
    help: 'Help',
    pin: 'Pin'
  };

  // Stage display
  const stageLabels: Record<string, string> = {
    planned: 'Planned',
    scripting: 'Scripting',
    shooting: 'Shooting',
    editing: 'Editing',
    review: 'Review',
    published: 'Published'
  };

  const displayLabel = $derived(
    label ??
    (variant === 'platform' ? platformLabels[value] ?? value :
     variant === 'category' ? categoryLabels[value] ?? value :
     variant === 'stage' ? stageLabels[value] ?? value :
     value)
  );
</script>

<span
  class="badge badge--{variant} badge--{size} badge--val-{value} {extraClass}"
  data-value={value}
>
  {displayLabel}
</span>

<style>
  .badge {
    display: inline-flex;
    align-items: center;
    font-weight: var(--fw-semibold);
    letter-spacing: 0.01em;
    white-space: nowrap;
    border-radius: var(--radius-full);
    border: 1px solid transparent;
    line-height: 1;
  }

  /* ── Sizes ── */
  .badge--sm {
    font-size: var(--text-xs);
    padding: 0.2rem 0.5rem;
  }

  .badge--md {
    font-size: var(--text-xs);
    padding: 0.28rem 0.6rem;
  }

  /* ── Semantic variants ── */
  .badge--neutral {
    background: var(--color-slate-100);
    color: var(--color-slate-600);
    border-color: var(--color-border);
  }

  .badge--success {
    background: var(--color-green-50);
    color: var(--color-green-700);
    border-color: rgba(22, 163, 74, 0.2);
  }

  .badge--warning {
    background: var(--color-yellow-50);
    color: var(--color-yellow-700);
    border-color: rgba(202, 138, 4, 0.2);
  }

  .badge--danger {
    background: var(--color-red-50);
    color: var(--color-red-700);
    border-color: rgba(220, 38, 38, 0.2);
  }

  .badge--info {
    background: var(--color-blue-50);
    color: var(--color-blue-700);
    border-color: rgba(29, 78, 216, 0.2);
  }

  /* ── Platform ── */
  .badge--platform {
    background: var(--color-slate-100);
    color: var(--color-slate-700);
    border-color: var(--color-border);
  }

  .badge--platform.badge--val-youtube {
    background: rgba(255, 0, 0, 0.08);
    color: #cc0000;
    border-color: rgba(255, 0, 0, 0.18);
  }

  .badge--platform.badge--val-facebook {
    background: rgba(24, 119, 242, 0.1);
    color: #1565c0;
    border-color: rgba(24, 119, 242, 0.2);
  }

  .badge--platform.badge--val-instagram {
    background: rgba(225, 48, 108, 0.09);
    color: #c2185b;
    border-color: rgba(225, 48, 108, 0.2);
  }

  .badge--platform.badge--val-tiktok {
    background: rgba(1, 1, 1, 0.07);
    color: #1a1a1a;
    border-color: rgba(1, 1, 1, 0.15);
  }

  /* ── Category ── */
  .badge--category {
    background: var(--color-indigo-50);
    color: var(--color-indigo-700);
    border-color: rgba(79, 70, 229, 0.18);
    text-transform: uppercase;
    letter-spacing: 0.07em;
    font-size: 0.65rem;
  }

  .badge--category.badge--val-hero {
    background: rgba(234, 179, 8, 0.1);
    color: var(--color-yellow-700);
    border-color: rgba(202, 138, 4, 0.2);
  }

  .badge--category.badge--val-hub {
    background: rgba(99, 102, 241, 0.1);
    color: var(--color-indigo-700);
    border-color: rgba(79, 70, 229, 0.2);
  }

  .badge--category.badge--val-help {
    background: var(--color-green-50);
    color: var(--color-green-700);
    border-color: rgba(22, 163, 74, 0.2);
  }

  .badge--category.badge--val-pin {
    background: rgba(244, 63, 94, 0.08);
    color: #be123c;
    border-color: rgba(244, 63, 94, 0.2);
  }

  /* ── Stage ── */
  .badge--stage {
    background: var(--color-slate-100);
    color: var(--color-slate-600);
    border-color: var(--color-border);
  }

  .badge--stage.badge--val-planned {
    background: var(--color-blue-50);
    color: var(--color-blue-700);
    border-color: rgba(29, 78, 216, 0.2);
  }

  .badge--stage.badge--val-scripting {
    background: rgba(249, 115, 22, 0.1);
    color: var(--color-orange-600);
    border-color: rgba(249, 115, 22, 0.2);
  }

  .badge--stage.badge--val-shooting {
    background: rgba(234, 179, 8, 0.1);
    color: var(--color-yellow-700);
    border-color: rgba(202, 138, 4, 0.2);
  }

  .badge--stage.badge--val-editing {
    background: rgba(168, 85, 247, 0.1);
    color: var(--color-purple-700);
    border-color: rgba(147, 51, 234, 0.2);
  }

  .badge--stage.badge--val-review {
    background: rgba(139, 92, 246, 0.08);
    color: #6d28d9;
    border-color: rgba(109, 40, 217, 0.2);
  }

  .badge--stage.badge--val-published {
    background: var(--color-green-50);
    color: var(--color-green-700);
    border-color: rgba(22, 163, 74, 0.2);
  }

  /* ── Content type ── */
  .badge--content-type {
    background: var(--color-slate-100);
    color: var(--color-slate-600);
    border-color: var(--color-border);
  }
</style>
