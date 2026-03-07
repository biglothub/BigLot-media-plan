<script lang="ts">
	import { toast } from '$lib';
	import type { BacklogContentCategory } from '$lib/types';

	interface Props {
		open: boolean;
		onadded: () => void;
	}

	type IdeaSuggestion = {
		title: string;
		description: string;
		platform: string;
		content_category: BacklogContentCategory;
		reason: string;
	};

	let { open = $bindable(), onadded }: Props = $props();

	let showCustomPromptModal = $state(false);
	let showSuggestModal = $state(false);
	let suggestLoading = $state(false);
	let suggestions = $state<IdeaSuggestion[]>([]);
	let suggestError = $state('');
	let acceptingIndex = $state<number | null>(null);
	let customPrompt = $state('');
	let customPromptError = $state('');

	async function suggestIdeas() {
		showSuggestModal = true;
		suggestLoading = true;
		suggestError = '';
		suggestions = [];
		try {
			const res = await fetch('/api/openclaw/ai/suggest-ideas', { method: 'POST' });
			const body = await res.json();
			if (!res.ok) {
				suggestError = body.error ?? 'เกิดข้อผิดพลาด';
			} else {
				suggestions = body.suggestions ?? [];
			}
		} catch {
			suggestError = 'เชื่อมต่อ AI ไม่ได้ กรุณาลองใหม่';
		}
		suggestLoading = false;
	}

	async function suggestIdeasWithPrompt(prompt: string) {
		showSuggestModal = true;
		suggestLoading = true;
		suggestError = '';
		suggestions = [];
		try {
			const res = await fetch('/api/openclaw/ai/suggest-ideas', {
				method: 'POST',
				headers: { 'Content-Type': 'application/json' },
				body: JSON.stringify({ prompt }),
			});
			const body = await res.json();
			if (!res.ok) {
				suggestError = body.error ?? 'เกิดข้อผิดพลาด';
			} else {
				suggestions = body.suggestions ?? [];
			}
		} catch {
			suggestError = 'เชื่อมต่อ AI ไม่ได้ กรุณาลองใหม่';
		}
		suggestLoading = false;
	}

	async function acceptSuggestion(s: IdeaSuggestion, index: number) {
		acceptingIndex = index;
		try {
			const res = await fetch('/api/openclaw/ideas', {
				method: 'POST',
				headers: { 'Content-Type': 'application/json' },
				body: JSON.stringify({
					platform: s.platform,
					content_type: 'video',
					content_category: s.content_category,
					title: s.title,
					description: s.description,
				}),
			});
			if (res.ok) {
				suggestions = suggestions.filter((_, i) => i !== index);
				onadded();
				toast.success(`เพิ่ม "${s.title}" เข้า Backlog แล้ว`);
			}
		} finally {
			acceptingIndex = null;
		}
	}
</script>

{#if open}
	<!-- svelte-ignore a11y_no_static_element_interactions -->
	<div class="modal-overlay" onclick={() => { open = false; }} onkeydown={(e) => { if (e.key === 'Escape') open = false; }}>
	<!-- svelte-ignore a11y_no_static_element_interactions -->
	<div class="modal-box mode-box" onclick={(e) => e.stopPropagation()} onkeydown={() => {}}>
		<div class="modal-header">
			<div class="modal-title">
				<p class="modal-code">ช่วยคิด IDEA</p>
				<h3>เลือกวิธีการ</h3>
			</div>
			<button class="modal-close" onclick={() => { open = false; }}>✕</button>
		</div>
		<button class="btn-primary" onclick={() => { open = false; suggestIdeas(); }}>
			✦ ให้ AI เสนอแนะ (Suggest Ideas)
		</button>
		<button
			class="btn-custom-prompt"
			onclick={() => {
				open = false;
				showCustomPromptModal = true;
				customPrompt = '';
				customPromptError = '';
			}}
		>
			✏️ พิมพ์ prompt เอง (Manual)
		</button>
	</div>
	</div>
{/if}

{#if showCustomPromptModal}
	<!-- svelte-ignore a11y_no_static_element_interactions -->
	<div class="modal-overlay" onclick={() => { showCustomPromptModal = false; }} onkeydown={(e) => { if (e.key === 'Escape') showCustomPromptModal = false; }}>
	<!-- svelte-ignore a11y_no_static_element_interactions -->
	<div class="modal-box prompt-box" onclick={(e) => e.stopPropagation()} onkeydown={() => {}}>
		<div class="modal-header">
			<div class="modal-title">
				<p class="modal-code">CUSTOM PROMPT</p>
				<h3>พิมพ์ได้ตามใจ</h3>
			</div>
			<button class="modal-close" onclick={() => { showCustomPromptModal = false; }}>✕</button>
		</div>
		<label class="prompt-label">ป้อน prompt เพื่อให้ AI เสนอ idea ตามที่ต้องการ</label>
		<textarea
			bind:value={customPrompt}
			placeholder="เช่น 'ช่วยคิด idea สำหรับ TikTok เกี่ยวกับ forex trading tips'"
			rows={5}
		></textarea>
		{#if customPromptError}
			<p class="prompt-error">{customPromptError}</p>
		{/if}
		<div class="prompt-actions">
			<button class="btn-cancel" onclick={() => { showCustomPromptModal = false; }}>Cancel</button>
			<button
				class="btn-primary"
				onclick={async () => {
					if (!customPrompt.trim()) { customPromptError = 'กรุณากรอก prompt'; return; }
					showCustomPromptModal = false;
					await suggestIdeasWithPrompt(customPrompt.trim());
				}}
			>
				ส่ง Prompt
			</button>
		</div>
	</div>
	</div>
{/if}

{#if showSuggestModal}
	<!-- svelte-ignore a11y_no_static_element_interactions -->
	<div class="modal-overlay" onclick={() => { showSuggestModal = false; }} onkeydown={(e) => { if (e.key === 'Escape') showSuggestModal = false; }}>
	<!-- svelte-ignore a11y_no_static_element_interactions -->
	<div class="modal-box suggest-modal" onclick={(e) => e.stopPropagation()} onkeydown={() => {}}>
		<div class="modal-header">
			<div class="modal-title">
				<p class="modal-code">AI SUGGEST</p>
				<h3>ช่วยคิด Content Idea</h3>
			</div>
			<button class="modal-close" onclick={() => { showSuggestModal = false; }}>✕</button>
		</div>

		{#if suggestLoading}
			<div class="suggest-loading">
				<p class="suggest-loading-label">✦ AI กำลังคิด idea...</p>
				<div class="progress-track">
					<div class="progress-bar"></div>
				</div>
				<p class="suggest-loading-sub">กำลังวิเคราะห์ backlog และสร้าง ideas ที่เหมาะกับธุรกิจ IB</p>
			</div>
		{:else if suggestError}
			<p class="notice-error">{suggestError}</p>
			<button class="btn-primary" onclick={suggestIdeas}>ลองใหม่</button>
		{:else if suggestions.length === 0}
			<p class="suggest-empty">ไม่มี idea ที่แนะนำ ลองกด ช่วยคิด ใหม่อีกครั้ง</p>
			<button class="btn-primary" onclick={suggestIdeas}>สร้าง idea ใหม่</button>
		{:else}
			<div class="suggest-list">
				{#each suggestions as s, i}
					<div class="suggest-card">
						<div class="chip-row">
							<span class="platform">{s.platform.toUpperCase()}</span>
							<span class="category-chip category--{s.content_category}">{s.content_category}</span>
						</div>
						<p class="suggest-title">{s.title}</p>
						<p class="suggest-desc">{s.description}</p>
						<p class="suggest-reason">💡 {s.reason}</p>
						<div class="suggest-actions">
							<button
								class="suggest-accept"
								onclick={() => acceptSuggestion(s, i)}
								disabled={acceptingIndex === i}
							>
								{acceptingIndex === i ? 'กำลังเพิ่ม...' : '+ เพิ่มเข้า Backlog'}
							</button>
						</div>
					</div>
				{/each}
			</div>
			<button class="suggest-regenerate" onclick={suggestIdeas}>สร้าง idea ใหม่อีกชุด</button>
		{/if}
	</div>
	</div>
{/if}

<style>
	textarea {
		width: 100%;
		box-sizing: border-box;
		font: inherit;
		padding: 0.72rem 0.85rem;
		border-radius: 0.7rem;
		border: 1px solid var(--color-border-strong);
		background: var(--color-bg-elevated);
		max-height: 200px;
		overflow-y: auto;
	}

	.modal-header {
		display: flex;
		justify-content: space-between;
		align-items: flex-start;
		gap: 0.5rem;
	}

	.modal-title { display: grid; gap: 0.15rem; min-width: 0; }

	.modal-code {
		margin: 0;
		font-size: 0.72rem;
		font-weight: 700;
		color: #b45309;
		text-transform: uppercase;
		letter-spacing: 0.05em;
	}

	.modal-header h3 {
		margin: 0;
		font-size: 1.05rem;
		font-family: var(--font-heading);
	}

	.modal-close {
		border: 0;
		background: transparent;
		font-size: 1rem;
		color: var(--color-slate-500);
		cursor: pointer;
		padding: 0.15rem 0.3rem;
		border-radius: 0.4rem;
	}

	.modal-close:hover { background: rgba(15, 23, 42, 0.08); }

	.mode-box { max-width: 480px; }
	.prompt-box { max-width: 520px; }
	.suggest-modal { max-width: 620px; }

	.btn-primary {
		width: 100%;
		border: 0;
		padding: 0.8rem;
		border-radius: 0.75rem;
		background: #2563eb;
		color: #fff;
		font-weight: 700;
		cursor: pointer;
	}

	.btn-primary:disabled { opacity: 0.6; cursor: not-allowed; }

	.btn-cancel {
		border: 1px solid var(--color-border-strong);
		background: var(--color-bg-elevated);
		color: var(--color-slate-600);
		padding: 0.6rem 1rem;
		border-radius: 0.68rem;
		font-weight: 700;
		cursor: pointer;
	}

	.btn-custom-prompt {
		width: 100%;
		padding: 0.8rem;
		border-radius: 0.75rem;
		background: rgba(99, 102, 241, 0.08);
		color: #4f46e5;
		border: 1px solid rgba(99, 102, 241, 0.2);
		font-weight: 700;
		cursor: pointer;
	}

	.prompt-label {
		font-size: 0.9rem;
		color: var(--color-slate-600);
	}

	.prompt-error {
		margin: 0;
		font-size: 0.82rem;
		color: #b91c1c;
	}

	.prompt-actions {
		display: grid;
		grid-template-columns: 1fr 1fr;
		gap: 0.6rem;
	}

	.notice-error {
		padding: 0.8rem 0.95rem;
		border-radius: 0.8rem;
		font-size: 0.9rem;
		background: #fef2f2;
		color: #b91c1c;
		border: 1px solid #fca5a5;
		margin: 0;
	}

	.suggest-loading {
		display: flex;
		flex-direction: column;
		align-items: center;
		gap: 0.6rem;
		padding: 2rem 0;
	}

	.suggest-loading-label {
		margin: 0;
		font-size: 0.95rem;
		font-weight: 600;
		color: #6366f1;
	}

	.suggest-loading-sub {
		margin: 0;
		font-size: 0.78rem;
		color: var(--color-slate-400);
	}

	.progress-track {
		width: 100%;
		height: 6px;
		background: #e2e8f0;
		border-radius: var(--radius-full);
		overflow: hidden;
	}

	.progress-bar {
		height: 100%;
		border-radius: var(--radius-full);
		background: linear-gradient(90deg, #6366f1, #8b5cf6, #6366f1);
		background-size: 200% 100%;
		animation: progress-slide 1.4s ease-in-out infinite;
		width: 50%;
	}

	@keyframes progress-slide {
		0% { background-position: 200% 0; transform: translateX(-100%); }
		100% { background-position: -200% 0; transform: translateX(300%); }
	}

	.suggest-empty {
		color: var(--color-slate-400);
		font-size: 0.9rem;
		text-align: center;
		padding: 1rem 0;
		margin: 0;
	}

	.suggest-list { display: grid; gap: 0.75rem; }

	.suggest-card {
		border: 1px solid #e2e8f0;
		border-radius: 0.75rem;
		padding: 0.9rem 1rem;
		display: grid;
		gap: 0.4rem;
		background: #fafafa;
	}

	.chip-row { display: flex; gap: 0.35rem; flex-wrap: wrap; }

	.platform {
		display: inline-block;
		padding: 0.15rem 0.55rem;
		border-radius: var(--radius-full);
		font-size: 0.7rem;
		font-weight: 700;
		background: rgba(180, 83, 9, 0.14);
		color: #92400e;
	}

	.category-chip {
		font-size: 0.7rem;
		font-weight: 700;
		padding: 0.18rem 0.5rem;
		border-radius: 0.35rem;
		text-transform: uppercase;
		letter-spacing: 0.04em;
	}

	.category--hero { background: rgba(220, 38, 38, 0.1); color: #b91c1c; }
	.category--hub { background: rgba(37, 99, 235, 0.1); color: var(--color-primary); }
	.category--help { background: rgba(22, 163, 74, 0.1); color: #15803d; }
	.category--pin { background: rgba(180, 83, 9, 0.12); color: #92400e; }

	.suggest-title { margin: 0; font-size: 0.95rem; font-weight: 600; color: var(--color-slate-900); line-height: 1.35; }
	.suggest-desc { margin: 0; font-size: 0.83rem; color: var(--color-slate-600); line-height: 1.5; }
	.suggest-reason { margin: 0; font-size: 0.8rem; color: #7c3aed; line-height: 1.4; }

	.suggest-actions { display: flex; justify-content: flex-end; margin-top: 0.25rem; }

	.suggest-accept {
		background: #0f172a;
		color: #fff;
		border: none;
		padding: 0.4rem 0.9rem;
		border-radius: 0.5rem;
		font-size: 0.82rem;
		font-weight: 600;
		cursor: pointer;
		transition: opacity 0.15s;
	}

	.suggest-accept:hover:not(:disabled) { opacity: 0.8; }
	.suggest-accept:disabled { opacity: 0.5; cursor: not-allowed; }

	.suggest-regenerate {
		background: transparent;
		border: 1px solid #c4b5fd;
		color: #6d28d9;
		padding: 0.45rem 1rem;
		border-radius: 0.55rem;
		font-size: 0.83rem;
		font-weight: 600;
		cursor: pointer;
		width: 100%;
		margin-top: 0.25rem;
	}

	.suggest-regenerate:hover { background: rgba(109, 40, 217, 0.05); }
</style>
