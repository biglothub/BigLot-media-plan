/**
 * Research module — fetches real-world stats / facts before AI content generation.
 *
 * Provider-agnostic interface so we can swap Tavily for Brave/Serper/Claude-web-search later
 * without touching the call sites.
 */

import { env } from '$env/dynamic/private';

export interface ResearchSnippet {
	title: string;
	url: string;
	content: string;
	published_date: string | null;
	score: number | null;
}

export interface ResearchResult {
	query: string;
	answer: string | null;
	snippets: ResearchSnippet[];
	provider: string;
	fetched_at: string;
}

export interface SearchProvider {
	readonly name: string;
	search(query: string, options: SearchOptions): Promise<ResearchResult>;
}

export interface SearchOptions {
	maxResults?: number;
	minPublishedYear?: number;
	languageHint?: 'th' | 'en' | 'auto';
	timeoutMs?: number;
}

const CACHE_TTL_MS = 60 * 60 * 1000;

interface CacheEntry {
	data: ResearchResult;
	timestamp: number;
}

const cache = new Map<string, CacheEntry>();

function cacheKey(provider: string, query: string, opts: SearchOptions): string {
	return `${provider}::${query}::${opts.maxResults ?? 5}::${opts.minPublishedYear ?? ''}::${opts.languageHint ?? 'auto'}`;
}

class TavilyProvider implements SearchProvider {
	readonly name = 'tavily';

	async search(query: string, options: SearchOptions): Promise<ResearchResult> {
		if (!env.TAVILY_API_KEY) {
			throw new Error('TAVILY_API_KEY is required for research');
		}

		const timeoutMs = options.timeoutMs ?? 8000;
		const controller = new AbortController();
		const timer = setTimeout(() => controller.abort(), timeoutMs);

		const body: Record<string, unknown> = {
			query,
			search_depth: 'advanced',
			include_answer: 'basic',
			max_results: options.maxResults ?? 5,
			topic: 'general'
		};

		if (options.minPublishedYear) {
			const days = Math.max(
				30,
				(new Date().getUTCFullYear() - options.minPublishedYear + 1) * 365
			);
			body.days = days;
		}

		try {
			const res = await fetch('https://api.tavily.com/search', {
				method: 'POST',
				headers: {
					'Content-Type': 'application/json',
					Authorization: `Bearer ${env.TAVILY_API_KEY}`
				},
				body: JSON.stringify(body),
				signal: controller.signal
			});

			if (!res.ok) {
				const err = await res.text();
				throw new Error(`Tavily API error ${res.status}: ${err}`);
			}

			const data = (await res.json()) as {
				answer?: string | null;
				results?: Array<{
					title?: string;
					url?: string;
					content?: string;
					published_date?: string | null;
					score?: number;
				}>;
			};

			const snippets: ResearchSnippet[] = (data.results ?? [])
				.filter((r) => r.url && r.content)
				.map((r) => ({
					title: (r.title ?? '').trim() || r.url!,
					url: r.url!,
					content: (r.content ?? '').trim(),
					published_date: r.published_date ?? null,
					score: typeof r.score === 'number' ? r.score : null
				}));

			return {
				query,
				answer: data.answer?.trim() || null,
				snippets,
				provider: this.name,
				fetched_at: new Date().toISOString()
			};
		} finally {
			clearTimeout(timer);
		}
	}
}

let activeProvider: SearchProvider = new TavilyProvider();

export function setSearchProvider(provider: SearchProvider): void {
	activeProvider = provider;
}

export function getSearchProvider(): SearchProvider {
	return activeProvider;
}

export async function research(
	query: string,
	options: SearchOptions = {}
): Promise<ResearchResult> {
	const provider = activeProvider;
	const key = cacheKey(provider.name, query, options);
	const cached = cache.get(key);
	if (cached && Date.now() - cached.timestamp < CACHE_TTL_MS) {
		return cached.data;
	}

	const result = await provider.search(query, options);
	cache.set(key, { data: result, timestamp: Date.now() });
	return result;
}

/**
 * Research stats relevant to a topic. Searches both Thai and English to maximize hit rate
 * for niche topics where Thai sources may be sparse.
 */
export async function researchStats(topic: string): Promise<ResearchResult | null> {
	if (!env.TAVILY_API_KEY) return null;

	const currentYear = new Date().getUTCFullYear();

	try {
		const result = await research(
			`${topic} statistics percentage data study research`,
			{
				maxResults: 6,
				minPublishedYear: currentYear - 3,
				timeoutMs: 8000
			}
		);
		return result.snippets.length > 0 ? result : null;
	} catch (err) {
		console.warn('[research] Tavily search failed:', err);
		return null;
	}
}

/**
 * Format a research result as a plain-text block for prompt injection.
 * Numbered list, capped length, source URLs preserved so the model can cite them.
 */
export function formatResearchForPrompt(result: ResearchResult): string {
	if (result.snippets.length === 0) return '';

	const lines = result.snippets.map((s, i) => {
		const date = s.published_date ? ` (${s.published_date.slice(0, 10)})` : '';
		const trimmed = s.content.length > 600 ? `${s.content.slice(0, 600)}...` : s.content;
		return `[S${i + 1}] ${s.title}${date}\n  URL: ${s.url}\n  ${trimmed}`;
	});

	const answerLine = result.answer ? `\nสรุปจาก ${result.provider}: ${result.answer}\n` : '';
	return `ข้อมูลค้นจาก web (${result.provider}, ${result.fetched_at}):${answerLine}\n${lines.join('\n\n')}`;
}
