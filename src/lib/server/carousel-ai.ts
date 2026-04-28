import { DEFAULT_CAROUSEL_SLIDE_COUNT } from '$lib/carousel';
import type { BacklogContentCategory, CarouselContentMode, CarouselLayoutVariant, CarouselSlideRole } from '$lib/types';
import { chat } from '$lib/server/minimax';
import { CREATOR_SYSTEM_PROMPT } from '$lib/server/skills/creator';

const DEFAULT_LINE_OA_CTA = 'แอด Line OA @biglot.ai เพื่อรับไอเดียเทรดและอัปเดตจากทีม BigLot';
const QUOTE_CAROUSEL_SLIDE_COUNT = 6;

export interface GeneratedCarouselSlide {
	position: number;
	role: CarouselSlideRole;
	layout_variant: CarouselLayoutVariant;
	headline: string;
	body: string | null;
	cta: string | null;
	visual_brief: string;
	freepik_query: string | null;
}

export interface GeneratedCarouselDraft {
	title: string;
	visual_direction: string;
	caption: string;
	hashtags: string[];
	slides: GeneratedCarouselSlide[];
}

export interface RegenerateCarouselSlideInput {
	projectTitle: string;
	projectDescription?: string | null;
	projectVisualDirection?: string | null;
	notes?: string | null;
	contentCategory?: BacklogContentCategory | null;
	contentMode?: CarouselContentMode;
	slideCount: number;
	targetSlide: Pick<GeneratedCarouselSlide, 'position' | 'role' | 'layout_variant'> & {
		headline?: string | null;
		body?: string | null;
		cta?: string | null;
		visual_brief?: string | null;
		freepik_query?: string | null;
	};
	existingSlides: Array<
		Pick<GeneratedCarouselSlide, 'position' | 'role'> & {
			headline?: string | null;
			body?: string | null;
			cta?: string | null;
		}
	>;
}

function clampSlideCount(value: number | null | undefined): number {
	if (!value || !Number.isFinite(value)) return DEFAULT_CAROUSEL_SLIDE_COUNT;
	return Math.min(Math.max(Math.round(value), 4), 8);
}

function normalizeContentMode(value: unknown): CarouselContentMode {
	return value === 'quote' ? 'quote' : 'standard';
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

function normalizeRole(role: unknown, index: number, total: number, contentMode: CarouselContentMode): CarouselSlideRole {
	if (contentMode === 'quote') {
		return index === total - 1 ? 'cta' : 'body';
	}
	if (index === 0) return 'cover';
	if (index === total - 1) return 'cta';
	return role === 'cta' || role === 'cover' ? 'body' : 'body';
}

function normalizeLayout(role: CarouselSlideRole): CarouselLayoutVariant {
	if (role === 'cover') return 'cover';
	if (role === 'cta') return 'cta';
	return 'content';
}

function buildDraftPrompt(input: {
	title: string;
	description?: string | null;
	notes?: string | null;
	contentCategory?: BacklogContentCategory | null;
	contentMode: CarouselContentMode;
	slideCount: number;
}): { systemPrompt: string; userPrompt: string } {
	const isQuoteMode = input.contentMode === 'quote';

	if (isQuoteMode) {
		return {
			systemPrompt: `${CREATOR_SYSTEM_PROMPT}

คุณกำลังออกแบบ Instagram carousel สำหรับทีม BigLot โดยต้องตอบเป็น JSON เท่านั้น ไม่มี markdown wrapper ไม่มีคำอธิบายเพิ่ม

กติกา:
- จำนวน slide = ${QUOTE_CAROUSEL_SLIDE_COUNT} หน้า
- ต้องเป็น 5 quote slides + 1 CTA slide
- slide 1-5 ต้องเป็น quote-first copy สั้น กระชับ และคม
- slide 1-5 ให้ใช้ headline เป็น quote หลัก
- slide 1-5 ต้องให้ body = null
- slide 1-5 ต้องให้ freepik_query = null
- CTA slide คือ slide สุดท้าย และยังใช้ CTA default ตาม workflow เดิมได้
- ภาษาไทยเป็นหลัก อ่านง่าย กระชับ และเหมาะกับโพสต์บน Instagram
- visual_brief ต้องบอก mood, subject, composition และ text overlay direction
- visual_direction ต้องสะท้อนงาน text-first โทนดาร์ก เรียบ และมีพื้นที่สำหรับ account header
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
      "role": "body|cta",
      "headline": "ข้อความหลักบน slide",
      "body": null,
      "cta": "ข้อความ CTA ถ้ามี หรือใช้ค่าเริ่มต้นชวนเข้า Line OA @biglot.ai",
      "visual_brief": "brief สำหรับ visual",
      "freepik_query": null
    }
  ]
}`,
			userPrompt: `สร้าง Instagram quote carousel จาก idea นี้:

Title: ${input.title}
Description: ${input.description?.trim() || 'ไม่มี'}
Category: ${input.contentCategory ?? 'ไม่ระบุ'}
Notes: ${input.notes?.trim() || 'ไม่มี'}

ข้อกำหนดเพิ่มเติม:
- 5 slide แรกต้องเป็น quote ที่สั้น คม และหยุดสายตาได้
- หลีกเลี่ยงการอธิบายเชิง knowledge carousel แบบยาว
- CTA slide สุดท้ายยังคงชวนเข้า Line OA @biglot.ai ตาม workflow เดิม`,
		};
	}

	return {
		systemPrompt: `${CREATOR_SYSTEM_PROMPT}

คุณกำลังออกแบบ Instagram carousel สำหรับทีม BigLot โดยต้องตอบเป็น JSON เท่านั้น ไม่มี markdown wrapper ไม่มีคำอธิบายเพิ่ม

กติกา:
- จำนวน slide = ${input.slideCount} หน้า
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
}`,
		userPrompt: `สร้าง Instagram carousel จาก idea นี้:

Title: ${input.title}
Description: ${input.description?.trim() || 'ไม่มี'}
Category: ${input.contentCategory ?? 'ไม่ระบุ'}
Notes: ${input.notes?.trim() || 'ไม่มี'}
`
	};
}

function validateSlides(
	value: unknown,
	slideCount: number,
	contentMode: CarouselContentMode
): GeneratedCarouselSlide[] {
	if (!Array.isArray(value)) {
		throw new Error('AI response is missing slides array');
	}
	if (contentMode === 'quote' && value.length !== slideCount) {
		throw new Error(`AI response must include exactly ${slideCount} slides`);
	}
	if (contentMode === 'standard' && (value.length < 4 || value.length > 8)) {
		throw new Error('AI response must include 4-8 slides');
	}

	return value.map((item, index) => {
		if (!item || typeof item !== 'object') {
			throw new Error(`AI slide ${index + 1} is invalid`);
		}
		const slide = item as Record<string, unknown>;
		const role = normalizeRole(slide.role, index, value.length, contentMode);
		const isQuoteSlide = contentMode === 'quote' && role !== 'cta';
		return {
			position: index + 1,
			role,
			layout_variant: normalizeLayout(role),
			headline: ensureNonEmptyString(slide.headline, `slides[${index}].headline`),
			body: isQuoteSlide ? null : typeof slide.body === 'string' && slide.body.trim() ? slide.body.trim() : null,
			cta: role === 'cta'
				? typeof slide.cta === 'string' && slide.cta.trim()
					? slide.cta.trim()
					: DEFAULT_LINE_OA_CTA
				: null,
			visual_brief: ensureNonEmptyString(slide.visual_brief, `slides[${index}].visual_brief`),
			freepik_query:
				isQuoteSlide || role === 'cta'
					? null
					: ensureNonEmptyString(slide.freepik_query, `slides[${index}].freepik_query`)
		};
	}).slice(0, slideCount);
}

function describeExistingSlides(
	slides: RegenerateCarouselSlideInput['existingSlides'],
	targetPosition: number
): string {
	return slides
		.slice()
		.sort((a, b) => a.position - b.position)
		.map((slide) => {
			const status = slide.position === targetPosition ? 'TARGET' : 'LOCKED';
			const parts = [
				`${slide.position}. [${status}] role=${slide.role}`,
				slide.headline?.trim() ? `headline="${slide.headline.trim()}"` : null,
				slide.body?.trim() ? `body="${slide.body.trim()}"` : null,
				slide.cta?.trim() ? `cta="${slide.cta.trim()}"` : null
			].filter((part): part is string => Boolean(part));
			return parts.join(' | ');
		})
		.join('\n');
}

function buildRegenerateSlidePrompt(input: RegenerateCarouselSlideInput): { systemPrompt: string; userPrompt: string } {
	const contentMode = normalizeContentMode(input.contentMode);
	const targetRole = input.targetSlide.role;
	const isQuoteNonCtaSlide = contentMode === 'quote' && targetRole !== 'cta';
	const existingSlides = describeExistingSlides(input.existingSlides, input.targetSlide.position);

	if (isQuoteNonCtaSlide) {
		return {
			systemPrompt: `${CREATOR_SYSTEM_PROMPT}

คุณกำลัง regenerate Instagram carousel แค่ 1 slide สำหรับทีม BigLot โดยต้องตอบเป็น JSON เท่านั้น ไม่มี markdown wrapper ไม่มีคำอธิบายเพิ่ม

กติกา:
- regenerate เฉพาะ slide เป้าหมายเท่านั้น
- ห้ามเปลี่ยน role, layout หรือ position ของ slide เป้าหมาย
- งานนี้เป็น quote-first carousel
- ถ้า slide เป้าหมายไม่ใช่ CTA ต้องตอบเป็น quote slide เท่านั้น
- headline ต้องสั้น คม หยุดสายตา และอ่านแล้วต่อเนื่องกับ slide อื่น
- body ต้องเป็น null
- cta ต้องเป็น null
- freepik_query ต้องเป็น null
- visual_brief ต้องอธิบาย mood, subject, composition และ text overlay direction สำหรับ quote slide
- ภาษาไทยเป็นหลัก กระชับ และพร้อมใช้จริง

ตอบในรูปแบบนี้เท่านั้น:
{
  "headline": "ข้อความหลักบน slide",
  "body": null,
  "cta": null,
  "visual_brief": "brief สำหรับ visual",
  "freepik_query": null
}`,
			userPrompt: `Regenerate slide ที่ตำแหน่ง ${input.targetSlide.position} จาก carousel นี้:

Project title: ${input.projectTitle}
Project description: ${input.projectDescription?.trim() || 'ไม่มี'}
Visual direction: ${input.projectVisualDirection?.trim() || 'ไม่มี'}
Category: ${input.contentCategory ?? 'ไม่ระบุ'}
Notes: ${input.notes?.trim() || 'ไม่มี'}
Total slides: ${input.slideCount}

Current slide:
- position: ${input.targetSlide.position}
- role: ${input.targetSlide.role}
- layout: ${input.targetSlide.layout_variant}
- current headline: ${input.targetSlide.headline?.trim() || 'ไม่มี'}
- current visual brief: ${input.targetSlide.visual_brief?.trim() || 'ไม่มี'}

Slide map:
${existingSlides}

ข้อกำหนดเพิ่มเติม:
- ต้องรักษา mood และ message arc ของ carousel เดิม
- ห้ามซ้ำใจความกับ slide อื่นแบบตรง ๆ
- หลีกเลี่ยงประโยคยาวหรืออธิบายเยิ่นเย้อ`
		};
	}

	return {
		systemPrompt: `${CREATOR_SYSTEM_PROMPT}

คุณกำลัง regenerate Instagram carousel แค่ 1 slide สำหรับทีม BigLot โดยต้องตอบเป็น JSON เท่านั้น ไม่มี markdown wrapper ไม่มีคำอธิบายเพิ่ม

กติกา:
- regenerate เฉพาะ slide เป้าหมายเท่านั้น
- ห้ามเปลี่ยน role, layout หรือ position ของ slide เป้าหมาย
- ต้องรักษา theme และ flow ของ carousel เดิมให้ต่อเนื่องกับ slide อื่น
- headline ต้องชัดและพร้อมใช้จริง
- ถ้า role เป็น body ต้องมี body ที่อ่านง่าย กระชับ และช่วยขยายจาก headline
- ถ้า role เป็น cta ต้องมี cta ที่พร้อมใช้งานจริง ถ้าไม่ชัดให้ใช้การชวนเข้า Line OA @biglot.ai
- freepik_query ต้องเป็นภาษาอังกฤษ 1 บรรทัด สำหรับค้นภาพบน Pexels
- visual_brief ต้องอธิบาย mood, subject, composition และ text overlay direction
- ภาษาไทยเป็นหลัก อ่านง่าย กระชับ และเหมาะกับ Instagram

ตอบในรูปแบบนี้เท่านั้น:
{
  "headline": "ข้อความหลักบน slide",
  "body": "ข้อความเสริมหรือ null",
  "cta": "ข้อความ CTA หรือ null",
  "visual_brief": "brief สำหรับ visual",
  "freepik_query": "english pexels photo search query"
}`,
		userPrompt: `Regenerate slide ที่ตำแหน่ง ${input.targetSlide.position} จาก carousel นี้:

Project title: ${input.projectTitle}
Project description: ${input.projectDescription?.trim() || 'ไม่มี'}
Visual direction: ${input.projectVisualDirection?.trim() || 'ไม่มี'}
Category: ${input.contentCategory ?? 'ไม่ระบุ'}
Notes: ${input.notes?.trim() || 'ไม่มี'}
Content mode: ${contentMode}
Total slides: ${input.slideCount}

Current slide:
- position: ${input.targetSlide.position}
- role: ${input.targetSlide.role}
- layout: ${input.targetSlide.layout_variant}
- current headline: ${input.targetSlide.headline?.trim() || 'ไม่มี'}
- current body: ${input.targetSlide.body?.trim() || 'ไม่มี'}
- current cta: ${input.targetSlide.cta?.trim() || 'ไม่มี'}
- current visual brief: ${input.targetSlide.visual_brief?.trim() || 'ไม่มี'}
- current freepik query: ${input.targetSlide.freepik_query?.trim() || 'ไม่มี'}

Slide map:
${existingSlides}

ข้อกำหนดเพิ่มเติม:
- slide cover ต้องเด่นและเปิดเรื่องชัด
- slide body ต้องต่อ narrative กับ slide ก่อนหน้าและหลังจากนั้น
- slide cta ต้องปิดเรื่องและพาไป action เดียวที่ชัด`
	};
}

function validateRegeneratedSlide(input: RegenerateCarouselSlideInput, value: unknown): GeneratedCarouselSlide {
	if (!value || typeof value !== 'object') {
		throw new Error('AI response is missing slide object');
	}

	const slide = value as Record<string, unknown>;
	const contentMode = normalizeContentMode(input.contentMode);
	const role = input.targetSlide.role;
	const isQuoteNonCtaSlide = contentMode === 'quote' && role !== 'cta';
	const headline = ensureNonEmptyString(slide.headline, 'headline');
	const visualBrief = ensureNonEmptyString(slide.visual_brief, 'visual_brief');
	const bodyValue = typeof slide.body === 'string' && slide.body.trim() ? slide.body.trim() : null;
	const ctaValue = typeof slide.cta === 'string' && slide.cta.trim() ? slide.cta.trim() : null;

	if (!isQuoteNonCtaSlide && role === 'body' && !bodyValue) {
		throw new Error('AI response is missing body for body slide');
	}

	return {
		position: input.targetSlide.position,
		role,
		layout_variant: input.targetSlide.layout_variant,
		headline,
		body: isQuoteNonCtaSlide ? null : bodyValue,
		cta: role === 'cta' ? ctaValue ?? DEFAULT_LINE_OA_CTA : null,
		visual_brief: visualBrief,
		freepik_query: isQuoteNonCtaSlide ? null : ensureNonEmptyString(slide.freepik_query, 'freepik_query')
	};
}

export async function generateCarouselDraft(input: {
	title: string;
	description?: string | null;
	notes?: string | null;
	contentCategory?: BacklogContentCategory | null;
	slideCount?: number;
	contentMode?: CarouselContentMode;
}): Promise<GeneratedCarouselDraft> {
	const contentMode = normalizeContentMode(input.contentMode);
	const slideCount = contentMode === 'quote' ? QUOTE_CAROUSEL_SLIDE_COUNT : clampSlideCount(input.slideCount);
	const { systemPrompt, userPrompt } = buildDraftPrompt({
		title: input.title,
		description: input.description,
		notes: input.notes,
		contentCategory: input.contentCategory,
		contentMode,
		slideCount
	});

	const raw = await chat(
		[
			{ role: 'system', content: systemPrompt },
			{ role: 'user', content: userPrompt }
		],
		{ temperature: 0.75, max_tokens: 3000, timeout_ms: 300_000 }
	);

	const parsed = JSON.parse(cleanJsonResponse(raw)) as Record<string, unknown>;
	const slides = validateSlides(parsed.slides, slideCount, contentMode);

	return {
		title: ensureNonEmptyString(parsed.title, 'title'),
		visual_direction: ensureNonEmptyString(parsed.visual_direction, 'visual_direction'),
		caption: ensureNonEmptyString(parsed.caption, 'caption'),
		hashtags: normalizeHashtags(parsed.hashtags),
		slides
	};
}

export async function regenerateCarouselSlide(input: RegenerateCarouselSlideInput): Promise<GeneratedCarouselSlide> {
	const { systemPrompt, userPrompt } = buildRegenerateSlidePrompt(input);

	const raw = await chat(
		[
			{ role: 'system', content: systemPrompt },
			{ role: 'user', content: userPrompt }
		],
		{ temperature: 0.75, max_tokens: 1200, timeout_ms: 300_000 }
	);

	const parsed = JSON.parse(cleanJsonResponse(raw)) as Record<string, unknown>;
	return validateRegeneratedSlide(input, parsed);
}
