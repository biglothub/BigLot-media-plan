<script lang="ts">
  import type { IdeaBacklogRow } from '$lib/types';
  import { contentTypeLabel, getTikTokEmbedUrl, getInstagramEmbedUrl } from '$lib/media-plan';
  import { stripMarkdown } from '$lib/utils/text';
  import Badge from '$lib/components/ui/Badge.svelte';

  interface Props {
    idea: IdeaBacklogRow;
    code: string;
    isScheduled?: boolean;
    isDeleting?: boolean;
    oncontextmenu?: (e: MouseEvent, idea: IdeaBacklogRow) => void;
    onpin?: (idea: IdeaBacklogRow) => void;
    onedit?: (idea: IdeaBacklogRow) => void;
    ondelete?: (idea: IdeaBacklogRow) => void;
    onmenu?: (e: MouseEvent, idea: IdeaBacklogRow) => void;
  }

  let {
    idea,
    code,
    isScheduled = false,
    isDeleting = false,
    oncontextmenu,
    onpin,
    onedit,
    ondelete,
    onmenu
  }: Props = $props();

  const tiktokEmbedUrl = $derived(
    idea.platform === 'tiktok' && idea.url ? getTikTokEmbedUrl(idea.url) : null
  );
  const instagramEmbedUrl = $derived(
    idea.platform === 'instagram' && idea.url ? getInstagramEmbedUrl(idea.url) : null
  );

  function platformFrameClass(platform: IdeaBacklogRow['platform']): string {
    return `platform-frame--${platform}`;
  }

  const notesText = $derived(idea.notes ? stripMarkdown(idea.notes) : null);
</script>

<!-- svelte-ignore a11y_no_noninteractive_element_interactions -->
<article
  class="idea-card {platformFrameClass(idea.platform)}"
  oncontextmenu={oncontextmenu ? (e) => { e.preventDefault(); oncontextmenu(e, idea); } : undefined}
>
  <!-- Media preview -->
  {#if tiktokEmbedUrl}
    <iframe
      class="card-media tiktok-frame"
      src={tiktokEmbedUrl}
      title="TikTok preview"
      loading="lazy"
      allow="encrypted-media; picture-in-picture"
      allowfullscreen
    ></iframe>
  {:else if instagramEmbedUrl}
    <iframe
      class="card-media instagram-frame"
      src={instagramEmbedUrl}
      title="Instagram preview"
      loading="lazy"
      allow="encrypted-media; picture-in-picture"
      allowfullscreen
    ></iframe>
  {:else if idea.thumbnail_url}
    <img class="card-media" src={idea.thumbnail_url} alt={idea.title ?? 'thumbnail'} />
  {/if}

  <!-- Body -->
  <div class="card-body">
    <!-- Top row: chips + actions -->
    <div class="card-top">
      <div class="chip-row">
        {#if idea.content_category}
          <Badge variant="category" value={idea.content_category} />
        {/if}
        <Badge variant="platform" value={idea.platform} />
        <Badge variant="content-type" label={contentTypeLabel[idea.content_type ?? 'video']} />
      </div>
      <div class="card-top-right">
        {#if isScheduled}
          <span class="scheduled-chip">Scheduled</span>
        {/if}
        {#if onmenu}
          <button
            class="dot-menu"
            onclick={(e) => { e.stopPropagation(); onmenu(e, idea); }}
            aria-label="More options"
            title="More options"
          >
            <svg width="16" height="16" viewBox="0 0 24 24" fill="currentColor">
              <circle cx="12" cy="5" r="1.5"/><circle cx="12" cy="12" r="1.5"/><circle cx="12" cy="19" r="1.5"/>
            </svg>
          </button>
        {/if}
      </div>
    </div>

    <!-- Code + Title -->
    <p class="card-code">{code}</p>
    <h3 class="card-title">{idea.title ?? 'Untitled idea'}</h3>

    <!-- Notes snippet -->
    {#if notesText}
      <p class="card-notes" title={notesText}>{notesText}</p>
    {/if}

    <!-- Link -->
    {#if idea.url}
      <a class="card-link" href={idea.url} target="_blank" rel="noreferrer" tabindex="-1">
        {idea.url}
      </a>
    {:else}
      <p class="card-link card-link--muted">No content link</p>
    {/if}

    <!-- Actions -->
    {#if onpin || onedit || ondelete}
      <div class="card-actions">
        {#if onpin}
          <button class="btn-action" onclick={() => onpin(idea)}>
            {idea.content_category === 'pin' ? 'Unpin' : 'Pin'}
          </button>
        {/if}
        {#if onedit}
          <button class="btn-action btn-action--primary" onclick={() => onedit(idea)}>
            Edit
          </button>
        {/if}
        {#if ondelete}
          <button
            class="btn-action btn-action--danger"
            onclick={() => ondelete(idea)}
            disabled={isDeleting}
            aria-busy={isDeleting}
          >
            {isDeleting ? 'Deleting...' : 'Delete'}
          </button>
        {/if}
      </div>
    {/if}
  </div>
</article>

<style>
  /* ── Platform frame colors ── */
  .idea-card {
    background: var(--color-bg-elevated);
    border: 1px solid var(--color-border);
    border-radius: var(--radius-xl);
    overflow: hidden;
    display: flex;
    flex-direction: column;
    transition: box-shadow var(--transition-normal), transform var(--transition-normal);
  }

  .idea-card:hover {
    box-shadow: var(--shadow-md);
    transform: translateY(-1px);
  }

  .platform-frame--instagram {
    border-top: 3px solid var(--color-instagram);
  }
  .platform-frame--tiktok {
    border-top: 3px solid var(--color-tiktok);
  }
  .platform-frame--youtube {
    border-top: 3px solid var(--color-youtube);
  }
  .platform-frame--facebook {
    border-top: 3px solid var(--color-facebook);
  }

  /* ── Media ── */
  .card-media {
    width: 100%;
    aspect-ratio: 16/9;
    object-fit: cover;
    display: block;
    border: none;
  }

  .tiktok-frame {
    aspect-ratio: 9/16;
    max-height: 380px;
  }

  .instagram-frame {
    aspect-ratio: 1;
  }

  /* ── Body ── */
  .card-body {
    padding: var(--space-4);
    display: flex;
    flex-direction: column;
    gap: var(--space-2);
    flex: 1;
  }

  /* ── Top row ── */
  .card-top {
    display: flex;
    align-items: flex-start;
    justify-content: space-between;
    gap: var(--space-2);
  }

  .chip-row {
    display: flex;
    flex-wrap: wrap;
    gap: var(--space-1);
    min-width: 0;
  }

  .card-top-right {
    display: flex;
    align-items: center;
    gap: var(--space-1);
    flex-shrink: 0;
  }

  .scheduled-chip {
    font-size: var(--text-xs);
    font-weight: var(--fw-semibold);
    padding: 0.2rem 0.55rem;
    border-radius: var(--radius-full);
    background: var(--color-green-50);
    color: var(--color-green-700);
    border: 1px solid rgba(22, 163, 74, 0.2);
    white-space: nowrap;
  }

  .dot-menu {
    display: flex;
    align-items: center;
    justify-content: center;
    width: 1.75rem;
    height: 1.75rem;
    border-radius: var(--radius-md);
    color: var(--color-slate-400);
    transition: background var(--transition-fast), color var(--transition-fast);
  }

  .dot-menu:hover {
    background: var(--color-slate-100);
    color: var(--color-slate-700);
  }

  /* ── Text ── */
  .card-code {
    font-size: var(--text-xs);
    font-weight: var(--fw-bold);
    letter-spacing: 0.07em;
    color: var(--color-slate-400);
    text-transform: uppercase;
    margin: 0;
  }

  .card-title {
    font-family: var(--font-heading);
    font-size: var(--text-md);
    font-weight: var(--fw-semibold);
    color: var(--color-slate-900);
    line-height: var(--leading-snug);
    margin: 0;
    display: -webkit-box;
    line-clamp: 3;
    -webkit-line-clamp: 3;
    -webkit-box-orient: vertical;
    overflow: hidden;
  }

  .card-notes {
    font-size: var(--text-sm);
    color: var(--color-slate-500);
    line-height: var(--leading-relaxed);
    margin: 0;
    display: -webkit-box;
    line-clamp: 2;
    -webkit-line-clamp: 2;
    -webkit-box-orient: vertical;
    overflow: hidden;
  }

  .card-link {
    font-size: var(--text-xs);
    color: var(--color-blue-600);
    text-decoration: none;
    overflow: hidden;
    text-overflow: ellipsis;
    white-space: nowrap;
    display: block;
  }

  .card-link:hover {
    text-decoration: underline;
  }

  .card-link--muted {
    color: var(--color-slate-400);
    font-style: italic;
  }

  /* ── Actions ── */
  .card-actions {
    display: flex;
    gap: var(--space-2);
    flex-wrap: wrap;
    margin-top: var(--space-1);
  }

  .btn-action {
    font-family: var(--font-sans);
    font-size: var(--text-xs);
    font-weight: var(--fw-semibold);
    padding: 0.32rem 0.7rem;
    border-radius: var(--radius-full);
    border: 1px solid var(--color-border-strong);
    background: var(--color-bg-elevated);
    color: var(--color-slate-600);
    transition:
      background var(--transition-fast),
      border-color var(--transition-fast),
      color var(--transition-fast);
    cursor: pointer;
  }

  .btn-action:hover:not(:disabled) {
    background: var(--color-slate-100);
  }

  .btn-action--primary {
    background: var(--color-primary-bg);
    color: var(--color-primary);
    border-color: var(--color-primary-border);
  }

  .btn-action--primary:hover:not(:disabled) {
    background: rgba(37, 99, 235, 0.15);
  }

  .btn-action--danger {
    color: var(--color-red-600);
    border-color: rgba(220, 38, 38, 0.2);
  }

  .btn-action--danger:hover:not(:disabled) {
    background: var(--color-red-50);
    border-color: rgba(220, 38, 38, 0.35);
  }

  .btn-action:disabled {
    opacity: 0.5;
    cursor: not-allowed;
  }
</style>
