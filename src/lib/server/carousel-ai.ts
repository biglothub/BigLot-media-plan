import { DEFAULT_CAROUSEL_SLIDE_COUNT } from '$lib/carousel';
import type { BacklogContentCategory, CarouselLayoutVariant, CarouselSlideRole } from '$lib/types';
import { chat } from '$lib/server/minimax';
import { CREATOR_SYSTEM_PROMPT } from '$lib/server/skills/creator';

const DEFAULT_LINE_OA_CTA = 'แอด Line OA @biglot.ai เพื่อรับไอเดียเทรดและอัปเดตจากทีม BigLot';

export interface GeneratedCarouselSlide {
	position: number;
	role: CarouselSlideRole;
	layout_variant: CarouselLayoutVariant;
	headline: string;
	body: string | null;
	cta: string | null;
	visual_brief: string;
	freepik_query: string;
}

export interface GeneratedCarouselDraft {
	title: string;
	visual_direction: string;
	caption: string;
	hashtags: string[];
	slides: GeneratedCarouselSlide[];
}

function clampSlideCount(value: number | null | undefined): number {
	if (!value || !Number.isFinite(value)) return DEFAULT_CAROUSEL_SLIDE_COUNT;
	return Math.min(Math.max(Math.round(value), 4), 8);
}

function cleanJsonResponse(raw: string): string {
	return raw.replace(/```(?:json)?\n?/gi, '').replace(/```/g, '').trim();
}

function ensureNonEmptyString(value: unknown, field: string): string {
	if (typeof value !== 'string' || !value.trim()) {
		throw new Error(`AI response is missing ${field}`);
	}
	return value.trim();
}

function normalizeHashtags(value: unknown): string[] {
	if (!Array.isArray(value)) return [];
	return value
		.filter((item): item is string => typeof item === 'string')
		.map((item) => item.trim().replace(/\s+/g, ''))
		.filter(Boolean)
		.map((item) => (item.startsWith('#') ? item : `#${item}`))
		.slice(0, 12);
}

function normalizeRole(role: unknown, index: number, total: number): CarouselSlideRole {
	if (index === 0) return 'cover';
	if (index === total - 1) return 'cta';
	return role === 'cta' || role === 'cover' ? 'body' : 'body';
}

function normalizeLayout(role: CarouselSlideRole): CarouselLayoutVariant {
	if (role === 'cover') return 'cover';
	if (role === 'cta') return 'cta';
	return 'content';
}

function validateSlides(value: unknown, slideCount: number): GeneratedCarouselSlide[] {
	if (!Array.isArray(value)) {
		throw new Error('AI response is missing slides array');
	}
	if (value.length < 4 || value.length > 8) {
		throw new Error('AI response must include 4-8 slides');
	}

	return value.map((item, index) => {
		if (!item || typeof item !== 'object') {
			throw new Error(`AI slide ${index + 1} is invalid`);
		}
		const slide = item as Record<string, unknown>;
		const role = normalizeRole(slide.role, index, value.length);
		return {
			position: index + 1,
			role,
			layout_variant: normalizeLayout(role),
			headline: ensureNonEmptyString(slide.headline, `slides[${index}].headline`),
			body: typeof slide.body === 'string' && slide.body.trim() ? slide.body.trim() : null,
			cta:
				typeof slide.cta === 'string' && slide.cta.trim()
					? slide.cta.trim()
					: role === 'cta'
						? DEFAULT_LINE_OA_CTA
						: null,
			visual_brief: ensureNonEmptyString(slide.visual_brief, `slides[${index}].visual_brief`),
			freepik_query: ensureNonEmptyString(slide.freepik_query, `slides[${index}].freepik_query`)
		};
	}).slice(0, slideCount);
}

export async function generateCarouselDraft(input: {
	title: string;
	description?: string | null;
	notes?: string | null;
	contentCategory?: BacklogContentCategory | null;
	slideCount?: number;
}): Promise<GeneratedCarouselDraft> {
	const slideCount = clampSlideCount(input.slideCount);
	const systemPrompt = `${CREATOR_SYSTEM_PROMPT}

คุณกำลังออกแบบ Instagram carousel สำหรับทีม BigLot โดยต้องตอบเป็น JSON เท่านั้น ไม่มี markdown wrapper ไม่มีคำอธิบายเพิ่ม

กติกา:
- จำนวน slide = ${slideCount} หน้า
- หน้าแรกเป็น cover
- หน้าสุดท้ายเป็น CTA
- CTA default คือชวนคนเข้า Line OA @biglot.ai ถ้า notes ไม่ได้ระบุ CTA อื่นชัดเจน
- หน้ากลางเป็น body ทั้งหมด
- ภาษาไทยเป็นหลัก อ่านง่าย กระชับ และเหมาะกับโพสต์บน Instagram
- ทุก slide ต้องมี freepik_query ภาษาอังกฤษ 1 บรรทัด เพื่อใช้ค้น stock photo บน Pexels
- visual_brief ต้องบอก mood, subject, composition และ text overlay direction
- caption ต้องพร้อมโพสต์จริง
- hashtags เป็น array ที่เหมาะกับโพสต์นี้ ไม่เกิน 12 tags

ตอบในรูปแบบนี้เท่านั้น:
{
  "title": "ชื่อ carousel",
  "visual_direction": "แนวภาพรวมของงาน",
  "caption": "caption พร้อมโพสต์",
  "hashtags": ["#tag1", "#tag2"],
  "slides": [
    {
      "role": "cover|body|cta",
      "headline": "ข้อความหลักบน slide",
      "body": "ข้อความเสริมของ slide หรือ null",
      "cta": "ข้อความ CTA ถ้ามี หรือใช้ค่าเริ่มต้นชวนเข้า Line OA @biglot.ai",
      "visual_brief": "brief สำหรับ visual",
      "freepik_query": "english pexels photo search query"
    }
  ]
}`;

	const userPrompt = `สร้าง Instagram carousel จาก idea นี้:

Title: ${input.title}
Description: ${input.description?.trim() || 'ไม่มี'}
Category: ${input.contentCategory ?? 'ไม่ระบุ'}
Notes: ${input.notes?.trim() || 'ไม่มี'}
`;

	const raw = await chat(
		[
			{ role: 'system', content: systemPrompt },
			{ role: 'user', content: userPrompt }
		],
		{ temperature: 0.75, max_tokens: 3000, timeout_ms: 300_000 }
	);

	const parsed = JSON.parse(cleanJsonResponse(raw)) as Record<string, unknown>;
	const slides = validateSlides(parsed.slides, slideCount);

	return {
		title: ensureNonEmptyString(parsed.title, 'title'),
		visual_direction: ensureNonEmptyString(parsed.visual_direction, 'visual_direction'),
		caption: ensureNonEmptyString(parsed.caption, 'caption'),
		hashtags: normalizeHashtags(parsed.hashtags),
		slides
	};
}
