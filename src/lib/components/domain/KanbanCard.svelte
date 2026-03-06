<script lang="ts">
  import type { ProductionCalendarRow, IdeaBacklogRow, ApprovalStatus } from '$lib/types';
  import { contentCategoryLabel, contentTypeLabel, platformLabel, stageLabel, PRODUCTION_STAGES } from '$lib/media-plan';

  interface Props {
    item: ProductionCalendarRow;
    code: string;
    isActive?: boolean;
    isTouchUi?: boolean;
    draggable?: boolean;
    approvalStatusColor?: Record<string, string>;
    approvalStatusLabel?: Record<string, string>;
    formatCount?: (n: number) => string;
    formatDate?: (d: string) => string;
    onclick?: (e: MouseEvent) => void;
    ondetail?: (e: MouseEvent) => void;
    ondragstart?: (e: DragEvent) => void;
    ondragend?: (e: DragEvent) => void;
    onstagechange?: (id: string, stage: string) => void;
  }

  let {
    item,
    code,
    isActive = false,
    isTouchUi = false,
    draggable = true,
    approvalStatusColor = {},
    approvalStatusLabel = {},
    formatCount = (n) => n.toLocaleString(),
    formatDate = (d) => d,
    onclick,
    ondetail,
    ondragstart,
    ondragend,
    onstagechange
  }: Props = $props();

  const bl = $derived(item.idea_backlog);

  const isOverdue = $derived(
    !!item.publish_deadline &&
    item.publish_deadline < new Date().toISOString().slice(0, 10) &&
    item.status !== 'published'
  );

  const stageColors: Record<string, string> = {
    planned:   'var(--color-slate-400)',
    scripting: 'var(--color-purple-500)',
    shooting:  '#f59e0b',
    editing:   'var(--color-blue-500)',
    review:    'var(--color-orange-600)',
    published: 'var(--color-green-600)',
  };
</script>

<!-- svelte-ignore a11y_click_events_have_key_events -->
<div
  class="kanban-card stage--{item.status || 'planned'}"
  class:kanban-card--active={isActive}
  style="--stage-color: {stageColors[item.status ?? 'planned'] ?? 'var(--color-slate-400)'}"
  role="button"
  tabindex="0"
  {draggable}
  {onclick}
  onkeydown={(e) => {
    if ((e.key === 'Enter' || e.key === ' ') && onclick) {
      e.preventDefault();
      onclick(e as unknown as MouseEvent);
    }
  }}
  ondragstart={ondragstart}
  ondragend={ondragend}
>
  <!-- Thumbnail -->
  {#if bl?.thumbnail_url}
    <img class="card-thumb" src={bl.thumbnail_url} alt={bl.title ?? 'thumbnail'} />
  {/if}

  <div class="card-body">
    {#if bl}
      <!-- Badges -->
      <div class="card-meta">
        <span class="chip chip--platform">{platformLabel[bl.platform] ?? bl.platform}</span>
        <span class="chip chip--type">{contentTypeLabel[bl.content_type] ?? bl.content_type}</span>
        {#if bl.content_category}
          <span class="chip chip--category">{contentCategoryLabel[bl.content_category]}</span>
        {/if}
      </div>

      <!-- Code + Title -->
      <p class="card-code">{code}</p>
      <p class="card-title">{bl.title ?? 'Untitled'}</p>

      <!-- Metrics -->
      {#if bl.view_count != null}
        <p class="card-meta-text">{formatCount(bl.view_count)} views</p>
      {/if}

      <!-- Notes snippet -->
      {#if bl.notes}
        <p class="card-notes-snippet">
          {bl.notes.slice(0, 80)}{bl.notes.length > 80 ? '…' : ''}
        </p>
      {/if}
    {:else}
      <p class="card-code">Unknown</p>
    {/if}

    <!-- Dates -->
    {#if item.shoot_date}
      <p class="card-meta-text">Shoot: {formatDate(item.shoot_date)}</p>
    {/if}

    {#if item.publish_deadline}
      <p class="card-deadline" class:card-deadline--overdue={isOverdue}>
        Deadline: {formatDate(item.publish_deadline)}
      </p>
    {/if}

    <!-- Status row: revision + approval -->
    <div class="card-status-row">
      {#if (item.revision_count ?? 0) > 0}
        <span class="chip chip--revision" class:chip--revision-warn={(item.revision_count ?? 0) >= 2}>
          Rev {item.revision_count}
        </span>
      {/if}
      {#if item.approval_status && item.approval_status !== 'draft'}
        <span
          class="chip chip--approval"
          style="--approval-color:{approvalStatusColor[item.approval_status] ?? 'var(--color-slate-500)'}"
        >
          {approvalStatusLabel[item.approval_status as ApprovalStatus] ?? item.approval_status}
        </span>
      {/if}
    </div>

    <!-- Team members -->
    {#if (item.calendar_assignments ?? []).length > 0}
      <div class="card-members">
        {#each item.calendar_assignments ?? [] as a}
          <span class="chip chip--member">{a.member_name}</span>
        {/each}
      </div>
    {/if}
  </div>

  <!-- Card footer actions -->
  <div class="card-actions">
    {#if isTouchUi && onstagechange}
      <select
        class="quick-stage"
        value={item.status || 'planned'}
        onclick={(e) => e.stopPropagation()}
        onchange={(e) => {
          e.stopPropagation();
          onstagechange(item.id, (e.currentTarget as HTMLSelectElement).value);
        }}
      >
        {#each PRODUCTION_STAGES as s}
          <option value={s}>{stageLabel[s]}</option>
        {/each}
      </select>
    {/if}
    {#if ondetail}
      <button
        class="btn-detail"
        onclick={(e) => { e.stopPropagation(); ondetail(e); }}
        aria-label="View details"
      >
        Detail
      </button>
    {/if}
  </div>
</div>

<style>
  .kanban-card {
    background: var(--color-bg-elevated);
    border-radius: var(--radius-lg);
    border: 1px solid rgba(15, 23, 42, 0.09);
    border-left: 3px solid var(--stage-color, var(--color-slate-400));
    display: grid;
    cursor: grab;
    transition: box-shadow var(--transition-fast), transform var(--transition-fast);
    overflow: hidden;
    user-select: none;
  }

  .kanban-card:focus-visible {
    outline: 2px solid var(--color-blue-500);
    outline-offset: 1px;
  }

  .kanban-card:active {
    cursor: grabbing;
    transform: scale(0.98);
  }

  .kanban-card:hover {
    box-shadow: var(--shadow-md);
  }

  .kanban-card--active {
    outline: 2px solid var(--color-blue-500);
    outline-offset: 1px;
  }

  /* ── Thumbnail ── */
  .card-thumb {
    width: 100%;
    aspect-ratio: 16/9;
    object-fit: cover;
    display: block;
    border-bottom: 1px solid rgba(15, 23, 42, 0.06);
  }

  /* ── Body ── */
  .card-body {
    padding: var(--space-2) var(--space-3) var(--space-1);
    display: grid;
    gap: var(--space-1);
  }

  /* ── Meta chips ── */
  .card-meta {
    display: flex;
    flex-wrap: wrap;
    gap: var(--space-1);
    margin-bottom: 0.1rem;
  }

  .chip {
    display: inline-block;
    font-size: var(--text-xs);
    font-weight: var(--fw-bold);
    padding: 0.1rem 0.45rem;
    border-radius: var(--radius-full);
    line-height: 1.4;
  }

  .chip--platform {
    background: rgba(180, 83, 9, 0.12);
    color: #92400e;
  }

  .chip--type {
    background: rgba(100, 116, 139, 0.12);
    color: var(--color-slate-600);
  }

  .chip--category {
    background: rgba(99, 102, 241, 0.12);
    color: var(--color-indigo-600);
  }

  .chip--member {
    background: var(--color-primary-bg);
    color: var(--color-primary);
  }

  .chip--revision {
    background: rgba(251, 191, 36, 0.18);
    color: #92400e;
  }

  .chip--revision-warn {
    background: rgba(220, 38, 38, 0.14);
    color: var(--color-red-700);
  }

  .chip--approval {
    background: color-mix(in srgb, var(--approval-color, var(--color-slate-400)) 14%, transparent);
    color: var(--approval-color, var(--color-slate-500));
  }

  /* ── Text ── */
  .card-code {
    margin: 0;
    font-size: var(--text-xs);
    font-weight: var(--fw-bold);
    color: var(--color-primary);
    text-transform: uppercase;
    letter-spacing: 0.05em;
  }

  .card-title {
    margin: 0;
    font-size: var(--text-sm);
    font-weight: var(--fw-semibold);
    color: var(--color-slate-900);
    line-height: var(--leading-snug);
    display: -webkit-box;
    -webkit-line-clamp: 2;
    -webkit-box-orient: vertical;
    overflow: hidden;
  }

  .card-meta-text {
    margin: 0;
    font-size: var(--text-xs);
    color: var(--color-slate-500);
  }

  .card-notes-snippet {
    margin: 0.2rem 0 0;
    font-size: 0.7rem;
    color: var(--color-purple-600);
    line-height: var(--leading-snug);
    opacity: 0.85;
  }

  .card-deadline {
    margin: 0;
    font-size: var(--text-xs);
    color: #b45309;
  }

  .card-deadline--overdue {
    color: var(--color-red-700);
    font-weight: var(--fw-bold);
    background: rgba(220, 38, 38, 0.08);
    padding: 0.12rem var(--space-2);
    border-radius: var(--radius-sm);
  }

  .card-status-row {
    display: flex;
    flex-wrap: wrap;
    gap: var(--space-1);
    margin-top: 0.15rem;
  }

  .card-members {
    display: flex;
    flex-wrap: wrap;
    gap: var(--space-1);
    margin-top: 0.15rem;
  }

  /* ── Actions footer ── */
  .card-actions {
    padding: var(--space-1) var(--space-3) var(--space-2);
    display: flex;
    justify-content: flex-end;
    gap: var(--space-2);
    align-items: center;
  }

  .quick-stage {
    border: 1px solid var(--color-border-strong);
    background: var(--color-bg-elevated);
    border-radius: var(--radius-md);
    padding: 0.3rem var(--space-2);
    font: inherit;
    font-size: var(--text-xs);
    color: var(--color-slate-700);
    max-width: 100%;
    cursor: pointer;
  }

  .btn-detail {
    background: var(--color-primary-bg);
    color: var(--color-primary);
    border: none;
    border-radius: var(--radius-md);
    font-size: var(--text-xs);
    font-weight: var(--fw-bold);
    padding: 0.22rem var(--space-2);
    cursor: pointer;
    transition: background var(--transition-fast);
  }

  .btn-detail:hover {
    background: rgba(37, 99, 235, 0.18);
  }
</style>
