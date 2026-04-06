import { json } from '@sveltejs/kit';
import type { RequestHandler } from './$types';
import { supabase } from '$lib/supabase';
import { chat } from '$lib/server/minimax';
import { CREATOR_SYSTEM_PROMPT } from '$lib/server/skills/creator';
import type { AIIdeaSuggestion, ContentJourneyStage, SuggestIdeasUseCase, SupportedPlatform } from '$lib/types';

const SUPPORTED_PLATFORMS = ['youtube', 'facebook', 'instagram', 'tiktok'] as const satisfies readonly SupportedPlatform[];
const SUPPORTED_CATEGORIES = ['hero', 'hub', 'help'] as const;
const SUPPORTED_JOURNEY_STAGES = ['awareness', 'trust', 'conversion'] as const satisfies readonly ContentJourneyStage[];
const DEFAULT_LINE_OA_CTA = 'แอด Line OA @biglot.ai เพื่อรับไอเดียเทรดและอัปเดตจากทีม BigLot';

type SuggestIdeasRequest = {
	prompt?: string;
	useCase?: SuggestIdeasUseCase;
	count?: number;
};

function cleanJsonResponse(raw: string): string {
	return raw.replace(/```(?:json)?\n?/gi, '').replace(/```/g, '').trim();
}

function asTrimmedString(value: unknown): string | null {
	if (typeof value !== 'string') return null;
	const normalized = value.trim();
	return normalized ? normalized : null;
}

function normalizeRequestBody(value: unknown): SuggestIdeasRequest {
	if (!value || typeof value !== 'object') return {};
	const body = value as Record<string, unknown>;
	return {
		prompt: asTrimmedString(body.prompt) ?? undefined,
		useCase: body.useCase === 'carousel_studio' ? 'carousel_studio' : body.useCase === 'backlog' ? 'backlog' : undefined,
		count: typeof body.count === 'number' && Number.isFinite(body.count) ? body.count : undefined
	};
}

function clampSuggestionCount(value: number | undefined, useCase: SuggestIdeasUseCase): number {
	const fallback = useCase === 'carousel_studio' ? 4 : 5;
	if (!value) return fallback;
	return Math.min(Math.max(Math.round(value), 1), 6);
}

function normalizePlatform(value: unknown, useCase: SuggestIdeasUseCase): SupportedPlatform {
	if (useCase === 'carousel_studio') return 'instagram';
	return SUPPORTED_PLATFORMS.includes(value as SupportedPlatform) ? (value as SupportedPlatform) : 'youtube';
}

function normalizeCategory(value: unknown): AIIdeaSuggestion['content_category'] {
	return SUPPORTED_CATEGORIES.includes(value as AIIdeaSuggestion['content_category'])
		? (value as AIIdeaSuggestion['content_category'])
		: 'help';
}

function normalizeJourneyStage(value: unknown): ContentJourneyStage | null {
	return SUPPORTED_JOURNEY_STAGES.includes(value as ContentJourneyStage) ? (value as ContentJourneyStage) : null;
}

function normalizeSlideOutline(value: unknown): string[] {
	if (Array.isArray(value)) {
		return value
			.map((item) => asTrimmedString(item))
			.filter((item): item is string => Boolean(item))
			.slice(0, 6);
	}

	const single = asTrimmedString(value);
	return single ? [single] : [];
}

function normalizeSuggestions(value: unknown, useCase: SuggestIdeasUseCase, count: number): AIIdeaSuggestion[] {
	if (!Array.isArray(value)) {
		throw new Error('AI response must be a JSON array');
	}

	const suggestions = value
		.map((item) => {
			if (!item || typeof item !== 'object') return null;
			const raw = item as Record<string, unknown>;
			const title = asTrimmedString(raw.title);
			const description = asTrimmedString(raw.description);
			const reason = asTrimmedString(raw.reason);

			if (!title || !description || !reason) {
				return null;
			}

			return {
				title,
				description,
				platform: normalizePlatform(raw.platform, useCase),
				content_category: normalizeCategory(raw.content_category),
				reason,
				audience: asTrimmedString(raw.audience),
				hook: asTrimmedString(raw.hook),
				journey_stage: normalizeJourneyStage(raw.journey_stage),
				slide_outline: normalizeSlideOutline(raw.slide_outline),
				cta: asTrimmedString(raw.cta) ?? DEFAULT_LINE_OA_CTA
			} satisfies AIIdeaSuggestion;
		})
		.filter((item): item is NonNullable<typeof item> => item !== null)
		.slice(0, count);

	if (suggestions.length === 0) {
		throw new Error('AI returned no valid suggestions');
	}

	return suggestions;
}

function buildSuggestionPrompt(input: {
	backlogSummary: string;
	categoryNote: string;
	useCase: SuggestIdeasUseCase;
	prompt?: string;
	count: number;
}): string {
	const customPromptBlock = input.prompt?.trim() ? `\nโจทย์เพิ่มเติมจากทีม:\n${input.prompt.trim()}\n` : '';

	if (input.useCase === 'carousel_studio') {
		return `Idea backlog ที่มีอยู่แล้ว (อย่าซ้ำ):
${input.backlogSummary}

${input.categoryNote}

กำลังออกแบบไอเดียสำหรับหน้า Create idea here ของ Carousel Studio

สร้าง Instagram carousel ideas ใหม่ ${input.count} รายการ ที่เกี่ยวข้องกับการเทรด XAUUSD, forex trading psychology, risk management, macro news ที่กระทบทอง หรือ IB business ของ BigLot โดยตรง

เกณฑ์สำคัญ:
- ทุกข้อเป็น platform "instagram"
- ต้องเป็น idea ที่เอาไปทำเป็น carousel 5-7 slides ได้จริง
- title = headline สำหรับหน้าปกหรือ slide 1 ที่หยุดสายตาได้
- description = อธิบาย promise และ angle ของโพสต์ 1-2 ประโยค
- audience = ระบุกลุ่มเป้าหมายให้ชัด เช่น มือใหม่เทรดทอง, คนที่ชอบ overtrade, คนที่ถือ order ข้ามข่าว
- content_category ใช้ได้เฉพาะ hero, hub, help
- journey_stage ต้องเป็น awareness, trust หรือ conversion
- hook = ข้อความเปิดที่ชัดกว่าหัวข้อหลัก
- slide_outline = array 4-6 ข้อ เรียง flow ของแต่ละ slide แบบใช้งานได้จริง
- cta = default ให้ชวนคนเข้า Line OA @biglot.ai ถ้าโจทย์ไม่ได้ระบุ CTA อื่นชัดเจน
- reason = อธิบายว่าทำไม idea นี้เหมาะกับ funnel และมีโอกาส perform
- ให้ mix ทั้งมุมให้ความรู้, emotional pain point และ community conversion
- หลีกเลี่ยงหัวข้อกว้างเกินไป เช่น "สอนเทรดทองเบื้องต้น" โดยไม่มีมุมเฉพาะ
${customPromptBlock}
ตอบเป็น JSON array format นี้:
[
  {
    "title": "มือใหม่ชอบพลาดตรงนี้ตอนเข้า Buy ทอง",
    "description": "สรุป pain point และ promise ของ carousel 1-2 ประโยค",
    "platform": "instagram",
    "content_category": "hero|hub|help",
    "reason": "เหตุผลเชิง performance และ funnel",
    "audience": "กลุ่มเป้าหมายหลัก",
    "hook": "ข้อความเปิด / cover hook",
    "journey_stage": "awareness|trust|conversion",
    "slide_outline": ["slide 1", "slide 2", "slide 3", "slide 4"],
    "cta": "แอด Line OA @biglot.ai เพื่อรับไอเดียเทรดและอัปเดตจากทีม BigLot"
  }
]`;
	}

	return `Idea backlog ที่มีอยู่แล้ว (อย่าซ้ำ):
${input.backlogSummary}

${input.categoryNote}

แนะนำ content ideas ใหม่ ${input.count} รายการ ทุก idea ต้องเชื่อมโยงกับการเทรด XAUUSD หรือ IB Business โดยตรง

เกณฑ์สำคัญ:
- title ต้องเป็น hook ที่ใช้งานได้จริง
- content_category ใช้ได้เฉพาะ hero, hub, help
- journey_stage ต้องเป็น awareness, trust หรือ conversion
- audience ระบุกลุ่มเป้าหมายให้ชัด
- hook เป็นประโยคเปิด content
- slide_outline เป็น array สรุป flow 3-5 ข้อ เพื่อให้ทีมเอาไปแตกต่อได้
- cta ต้องบอกว่าจะปิด content ยังไง และ default ให้ชวนคนเข้า Line OA @biglot.ai ถ้าไม่มีเงื่อนไขอื่น
- reason ต้องบอกว่า idea นี้ช่วย Awareness/Trust/Conversion อย่างไร
${customPromptBlock}
ตอบเป็น JSON array format นี้:
[
  {
    "title": "ชื่อ content พร้อม Hook ที่ดึงดูด",
    "description": "อธิบายสั้นๆ ว่า content นี้เกี่ยวกับอะไร รูปแบบไหน 1-2 ประโยค",
    "platform": "youtube|facebook|instagram|tiktok",
    "content_category": "hero|hub|help",
    "reason": "เหตุผลว่า idea นี้จะช่วย funnel ไหนและทำไมน่าจะ perform ดี",
    "audience": "กลุ่มเป้าหมายหลัก",
    "hook": "ประโยคเปิด content",
    "journey_stage": "awareness|trust|conversion",
    "slide_outline": ["beat 1", "beat 2", "beat 3"],
    "cta": "แอด Line OA @biglot.ai เพื่อรับไอเดียเทรดและอัปเดตจากทีม BigLot"
  }
]`;
}

export const POST: RequestHandler = async ({ request }) => {
	if (!supabase) return json({ error: 'Supabase not configured' }, { status: 500 });

	let payload: SuggestIdeasRequest = {};
	try {
		const rawBody = await request.text();
		if (rawBody.trim()) {
			payload = normalizeRequestBody(JSON.parse(rawBody));
		}
	} catch {
		payload = {};
	}

	const useCase = payload.useCase === 'carousel_studio' ? 'carousel_studio' : 'backlog';
	const count = clampSuggestionCount(payload.count, useCase);

	const { data: backlog, error } = await supabase
		.from('idea_backlog')
		.select('title, platform, content_category, view_count')
		.order('created_at', { ascending: false })
		.limit(30);

	if (error) return json({ error: error.message }, { status: 500 });

	const backlogSummary =
		backlog && backlog.length > 0
			? backlog
					.map(
						(b) =>
							`- [${b.platform ?? 'unknown'}] ${b.title ?? 'Untitled'} (category: ${b.content_category ?? 'ไม่ระบุ'}, views: ${b.view_count ?? 0})`
					)
					.join('\n')
			: 'ยังไม่มี idea ในคลัง';

	const categoryCounts = { hero: 0, hub: 0, help: 0 };
	for (const item of backlog ?? []) {
		const category = item.content_category as keyof typeof categoryCounts;
		if (category in categoryCounts) categoryCounts[category]++;
	}

	const total = categoryCounts.hero + categoryCounts.hub + categoryCounts.help;
	const categoryNote =
		total > 0
			? `ปัจจุบัน hero: ${categoryCounts.hero}, hub: ${categoryCounts.hub}, help: ${categoryCounts.help} — แนะนำให้เน้น category ที่ยังน้อย`
			: 'ยังไม่มี category data';

	const systemPrompt = `${CREATOR_SYSTEM_PROMPT}\n\nตอบเป็น JSON array เท่านั้น ไม่มี markdown wrapper ไม่มี text อื่น`;
	const userPrompt = buildSuggestionPrompt({
		backlogSummary,
		categoryNote,
		useCase,
		prompt: payload.prompt,
		count
	});

	try {
		const raw = await chat(
			[
				{ role: 'system', content: systemPrompt },
				{ role: 'user', content: userPrompt }
			],
			{ temperature: 0.85, max_tokens: 4000 }
		);

		const suggestions = normalizeSuggestions(JSON.parse(cleanJsonResponse(raw)), useCase, count);
		return json({ suggestions });
	} catch (error) {
		return json({ error: `AI error: ${error instanceof Error ? error.message : String(error)}` }, { status: 500 });
	}
};
