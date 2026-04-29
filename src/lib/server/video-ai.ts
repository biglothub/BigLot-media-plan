import { chat } from '$lib/server/minimax';
import {
	VIDEO_QUOTE_CATEGORY_LABELS,
	VIDEO_QUOTE_CATEGORY_PROMPTS,
	type VideoCarouselTemplateType,
	type VideoQuoteCategory
} from '$lib/video-carousel';

export interface VideoScriptSegment {
	position: number;
	layout_type: 'standard' | 'quiz' | 'quote' | 'listicle' | 'stat';
	text: string;
	accent_text: string | null;
	subtext: string | null;
	options: string[];
	search_query: string;
	text_position: 'top' | 'center' | 'bottom';
	duration_seconds: number;
}

export interface VideoScriptDraft {
	title: string;
	segments: VideoScriptSegment[];
}

export interface VideoTopicSuggestion {
	title: string;
	angle: string | null;
}

function cleanJson(raw: string): string {
	return raw.replace(/```(?:json)?\n?/gi, '').replace(/```/g, '').trim();
}

function clampDuration(value: number): number {
	return Math.min(Math.max(Math.round(value), 5), 60);
}

function normalizeTextPosition(value: unknown): 'top' | 'center' | 'bottom' {
	if (value === 'top' || value === 'bottom') return value;
	return 'center';
}

function asTrimmedString(value: unknown): string | null {
	if (typeof value !== 'string') return null;
	const normalized = value.trim();
	return normalized ? normalized : null;
}

function normalizeTopicSuggestions(value: unknown, count: number): VideoTopicSuggestion[] {
	const rawItems = Array.isArray(value)
		? value
		: value && typeof value === 'object' && Array.isArray((value as Record<string, unknown>).topics)
			? ((value as Record<string, unknown>).topics as unknown[])
			: [];

	const suggestions = rawItems
		.map((item) => {
			if (typeof item === 'string') {
				const title = asTrimmedString(item);
				return title ? { title, angle: null } : null;
			}

			if (!item || typeof item !== 'object') return null;
			const raw = item as Record<string, unknown>;
			const title = asTrimmedString(raw.title);
			if (!title) return null;
			return {
				title,
				angle: asTrimmedString(raw.angle)
			};
		})
		.filter((item): item is VideoTopicSuggestion => item !== null)
		.slice(0, count);

	if (suggestions.length === 0) {
		throw new Error('AI returned no valid topic suggestions');
	}

	return suggestions;
}

function normalizeTemplateType(value: VideoCarouselTemplateType): VideoCarouselTemplateType {
	if (value === 'quote' || value === 'listicle' || value === 'stat') return value;
	return 'quiz';
}

export async function generateVideoTopicSuggestions(input: {
	templateType: VideoCarouselTemplateType;
	quoteCategory?: VideoQuoteCategory;
	quoteCategoryCustom?: string;
	seed?: string;
	count?: number;
}): Promise<VideoTopicSuggestion[]> {
	const count = Math.min(Math.max(Math.round(input.count ?? 6), 3), 8);
	const templateType = normalizeTemplateType(input.templateType);
	const seedHint =
		templateType === 'quote'
			? 'ให้ต่อยอดเป็นคำคมที่คมขึ้นจากโจทย์นี้ ไม่ใช่แค่ rephrase ตรง ๆ'
			: templateType === 'listicle'
				? 'ให้แตกเป็น "อันดับ Top N ของ ..." ที่คมขึ้นจากโจทย์นี้ ไม่ใช่แค่ rephrase ตรง ๆ'
				: templateType === 'stat'
					? 'ให้คิดเป็น claim ที่มีตัวเลขช็อก ๆ คมขึ้นจากโจทย์นี้ ไม่ใช่แค่ rephrase ตรง ๆ'
					: 'ให้แตกหัวข้อที่คมขึ้นจากโจทย์นี้ ไม่ใช่แค่ rephrase ตรง ๆ';
	const seedBlock = input.seed?.trim()
		? `\nโจทย์ตั้งต้นจากทีม: "${input.seed.trim()}"\n${seedHint}`
		: '';
	const customQuoteCategory = input.quoteCategoryCustom?.trim();
	const quoteCategoryBlock =
		templateType === 'quote' && customQuoteCategory
			? `\nหมวดคำคมที่ทีมกรอกเอง: ${customQuoteCategory}
ให้ตีความหมวดนี้ให้ชัด และสร้างคำคมทุกข้อให้ตรงหมวดนี้ ไม่ออกนอกกรอบ`
			: templateType === 'quote' && input.quoteCategory
			? `\nหมวดคำคมที่เลือก: ${VIDEO_QUOTE_CATEGORY_LABELS[input.quoteCategory]}
แนวทางหมวดนี้: ${VIDEO_QUOTE_CATEGORY_PROMPTS[input.quoteCategory]}
ให้คำคมทุกข้ออยู่ในหมวดนี้อย่างชัดเจน`
			: '';
	let templateGuidance: string;
	let outputLabel: string;
	let usageRule: string;
	let titleRule: string;
	let exampleTitle: string;
	let exampleAngle: string;

	if (templateType === 'quote') {
		templateGuidance = `คำคมสำหรับ video template แบบ Quote / คำคม:
- ต้องเหมาะกับการทำเป็น quote video 9:16
- title คือคำคมหลักที่นำไปวางบนวิดีโอได้ทันที อ่านแล้วหยุดคิด มี point of view ชัด
- หลีกเลี่ยงหัวข้อที่เป็น listicle ยาว`;
		outputLabel = 'คำคม';
		usageRule = 'ภาษาไทย กระชับ ใช้เป็นคำคมบนจอได้ทันที';
		titleRule = 'title เป็นคำคมภาษาไทย ไม่เกิน 16 คำ ใช้เป็นข้อความหลักบนจอได้ทันที';
		exampleTitle = 'เทรดตามแผน ไม่ใช่ตามเสียงตลาด';
		exampleAngle = 'ย้ำให้คนคุมใจและยึดระบบก่อนตัดสินใจเข้าออเดอร์';
	} else if (templateType === 'listicle') {
		templateGuidance = `หัวข้อสำหรับ video template แบบ Listicle / อันดับ Top N:
- ต้องเป็นรูปแบบ "อันดับ Top 3-5 ของ ..." ที่ดูแล้วอยากเลื่อนหา #1
- title ควรเริ่มด้วย "5 ...", "Top 5 ...", "อันดับ ..." หรือ "5 อันดับ ..."
- เน้นเรื่องเทรดทอง, error mode, นิสัย, indicator, mistake
- หลีกเลี่ยงหัวข้อที่กว้างจน rank ไม่ได้`;
		outputLabel = 'หัวข้อ';
		usageRule = 'ภาษาไทย กระชับ ขึ้นต้นด้วยจำนวนหรือ "อันดับ"';
		titleRule = 'title ไม่เกิน 14 คำ';
		exampleTitle = '5 นิสัยที่ฆ่าพอร์ตเทรดเดอร์มือใหม่';
		exampleAngle = 'นับถอยหลัง #5 → #1 จากเบาสุดไปหนักสุด ปิดท้ายด้วยข้อ #1 ที่กระแทกใจ';
	} else if (templateType === 'stat') {
		templateGuidance = `หัวข้อสำหรับ video template แบบ Stat / ตัวเลขช็อก:
- ต้องมี claim ที่มีตัวเลขใหญ่กระแทก เช่น "90% ของ ...", "70% ของ ..."
- title คือ claim เต็ม รวมตัวเลข + บริบท เช่น "90% ของเทรดเดอร์ขาดทุนใน 6 เดือนแรก"
- เน้นข้อเท็จจริงด้านพฤติกรรมเทรด, ความเสี่ยง, สถิติ`;
		outputLabel = 'หัวข้อ';
		usageRule = 'ภาษาไทย ขึ้นต้นด้วยตัวเลขชัด ๆ ใช้เป็น hook ได้ทันที';
		titleRule = 'title ไม่เกิน 16 คำ และต้องมีตัวเลขเป็น hook';
		exampleTitle = '90% ของเทรดเดอร์มือใหม่หมดพอร์ตใน 6 เดือนแรก';
		exampleAngle = 'เปิดด้วยตัวเลขกระแทกใจ ตามด้วยเหตุผล 3-4 ข้อว่าทำไมถึงเป็นแบบนั้น';
	} else {
		templateGuidance = `หัวข้อสำหรับ video template แบบ Quiz / ตัวเลือก:
- ต้องเหมาะกับคำถามพร้อมตัวเลือก A-F
- title ควรตั้งเป็นสถานการณ์หรือคำถามที่คนเทรดทองอยากตอบ
- หลีกเลี่ยงหัวข้อกว้างที่แตกเป็นตัวเลือกยาก`;
		outputLabel = 'หัวข้อ';
		usageRule = 'ภาษาไทย กระชับ ใช้งานเป็น Topic ได้ทันที';
		titleRule = 'title ไม่เกิน 12 คำ';
		exampleTitle = 'เทรดทองช่วงข่าว คุณเลือกทางไหน?';
		exampleAngle = 'ชวนคนเทียบวิธีรับมือ volatility ก่อนและหลังข่าว';
	}

	const raw = await chat(
		[
			{
				role: 'system',
				content: 'คุณคือ creative strategist ของทีม BigLot สำหรับคอนเทนต์เทรดทอง XAUUSD ตอบเป็น JSON เท่านั้น'
			},
			{
				role: 'user',
				content: `${templateGuidance}
${quoteCategoryBlock}
${seedBlock}

สร้าง${outputLabel} video carousel ใหม่ ${count} ข้อ สำหรับ Reels/Shorts ของทีม BigLot

เกณฑ์:
- ${usageRule}
- เกี่ยวกับ XAUUSD, trading psychology, risk management, ข่าวเศรษฐกิจที่กระทบทอง, หรือ mindset ของ trader
- ${titleRule}
- angle อธิบายมุมคอนเทนต์ 1 ประโยคสั้น ๆ
- หลีกเลี่ยงคำซ้ำและหัวข้อ generic เช่น "สอนเทรดทองเบื้องต้น"

ตอบเป็น JSON array เท่านั้น:
[
  {
    "title": "${exampleTitle}",
    "angle": "${exampleAngle}"
  }
]`
			}
		],
		{ temperature: 0.9, max_tokens: 1400 }
	);

	let parsed: unknown;
	try {
		parsed = JSON.parse(cleanJson(raw));
	} catch {
		throw new Error('AI returned invalid JSON for topic suggestions');
	}

	return normalizeTopicSuggestions(parsed, count);
}

export async function generateVideoScript(
	topic: string,
	clipCount: number,
	durationSeconds: number,
	templateType: VideoCarouselTemplateType = 'quiz'
): Promise<VideoScriptDraft> {
	const clampedCount = Math.min(Math.max(Math.round(clipCount), 1), 10);
	const clampedDuration = clampDuration(durationSeconds);
	const selectedTemplate = normalizeTemplateType(templateType);
	const expectedLayout = selectedTemplate;

	const systemPrompt = `คุณคือ video content strategist ของทีม BigLot ซึ่งสร้างเนื้อหาเกี่ยวกับการเทรดทอง XAUUSD
ตอบเป็น JSON เท่านั้น ไม่มี markdown code block และไม่มีข้อความนำหน้า`;

	let templateInstruction: string;
	let exampleSegment: string;
	let defaultTextPosition: 'top' | 'center' | 'bottom';

	if (selectedTemplate === 'quote') {
		defaultTextPosition = 'center';
		templateInstruction = `Template: Quote / คำคม
- layout_type ให้ใช้ "quote" เสมอ
- text = คำคม/insight ภาษาไทยที่อ่านแล้วหยุดคิด 1-2 บรรทัด ไม่เกิน 18 คำ
- accent_text = null
- subtext = บริบทสั้น ๆ เช่น "BigLot Gold Insight" หรือคำอธิบายไม่เกิน 8 คำ
- options = []
- text_position ให้ใช้ "center" ทุก segment`;
		exampleSegment = `      "text": "คำคมหลักสำหรับขึ้นกลางจอ",
      "accent_text": null,
      "subtext": "ข้อความรองสั้น ๆ",
      "options": [],
      "text_position": "center"`;
	} else if (selectedTemplate === 'listicle') {
		defaultTextPosition = 'center';
		templateInstruction = `Template: Listicle / อันดับ Top N
- layout_type ให้ใช้ "listicle" เสมอ
- เรียง segment เป็นการนับถอยหลัง: segment แรกคือ #${clampedCount} → segment สุดท้ายคือ #1 (ข้อที่หนักสุด/น่าตกใจสุด)
- accent_text = "#${clampedCount}", "#${Math.max(clampedCount - 1, 1)}", ... จนถึง "#1" (ใส่เครื่องหมาย # เสมอ)
- text = หัวข้อย่อยของอันดับนั้น ภาษาไทย ไม่เกิน 8 คำ คมและจำง่าย
- subtext = caption อธิบายอันดับนั้น 1 บรรทัด ไม่เกิน 14 คำ
- options = []
- text_position ให้ใช้ "center" ทุก segment`;
		exampleSegment = `      "text": "ไม่ตั้ง stop loss",
      "accent_text": "#${clampedCount}",
      "subtext": "ปล่อยให้ไม้เดียวลากพอร์ตกลับไม่ได้",
      "options": [],
      "text_position": "center"`;
	} else if (selectedTemplate === 'stat') {
		defaultTextPosition = 'center';
		templateInstruction = `Template: Stat / ตัวเลขช็อก
- layout_type ให้ใช้ "stat" เสมอ
- ${clampedCount === 1 ? 'มี 1 segment เดียว ใส่ตัวเลข hook หลักของหัวข้อ' : `แต่ละ segment เป็นตัวเลข/สถิติคนละมุมที่สนับสนุน claim เดียวกัน เรียงให้ build curiosity`}
- text = ตัวเลขล้วน ๆ เช่น "90", "1 ใน 3", "6 เดือน" ไม่ต้องมีหน่วย (ความยาวสูงสุด 6 ตัวอักษรรวมเว้นวรรค)
- accent_text = หน่วย/สัญลักษณ์สั้น ๆ เช่น "%", "บาท", "เดือน", "X" หรือ null ถ้าตัวเลขมีหน่วยในตัวแล้ว
- subtext = claim อธิบายตัวเลขนั้น 1 บรรทัด ภาษาไทย ไม่เกิน 16 คำ
- options = ใส่ source/อ้างอิงเป็น array 1 ข้อ เช่น ["ที่มา: SEC, 2024"] หรือ [] ถ้าไม่มี
- text_position ให้ใช้ "center" ทุก segment`;
		exampleSegment = `      "text": "90",
      "accent_text": "%",
      "subtext": "ของเทรดเดอร์มือใหม่ขาดทุนใน 6 เดือนแรก",
      "options": ["ที่มา: SEC Thailand"],
      "text_position": "center"`;
	} else {
		defaultTextPosition = 'top';
		templateInstruction = `Template: Quiz / ตัวเลือก
- layout_type ให้ใช้ "quiz" เสมอ
- text = คำถาม/หัวข้อหลัก กระชับ ภาษาไทย ไม่เกิน 6 คำ
- accent_text = ส่วนที่ต้องการเน้นด้วยสีทอง เช่น "คุณจะเลือกอะไร?" หรือ null ถ้าไม่ต้องการ
- options = 4-6 ตัวเลือก แต่ละอันไม่เกิน 6 คำ ภาษาไทย เชื่อมโยงกับ text
- text_position ให้ใช้ "top" ทุก segment`;
		exampleSegment = `      "text": "คำถามหลัก หรือ hook ด้านบน",
      "accent_text": "ส่วนที่ต้องการเน้นสีเหลือง",
      "subtext": null,
      "options": ["ตัวเลือก A", "ตัวเลือก B", "ตัวเลือก C", "ตัวเลือก D"],
      "text_position": "top"`;
	}

	const userPrompt = `สร้าง video script สำหรับ Reels/Shorts 9:16 เกี่ยวกับหัวข้อ: "${topic}"

จำนวน clip: ${clampedCount}
ความยาวต่อ clip: ${clampedDuration} วินาที
${templateInstruction}

ส่งคืนเป็น JSON ตามรูปแบบนี้:
{
  "title": "ชื่อโปรเจกต์",
  "segments": [
    {
      "position": 1,
      "layout_type": "${expectedLayout}",
${exampleSegment},
      "search_query": "english keyword for Pexels video (3-5 words describing the visual)",
      "duration_seconds": ${clampedDuration}
    }
  ]
}

กฎสำคัญ:
- search_query = English คำที่ describe visual เช่น "gold bar trading desk"
- จำนวน segments ต้องเท่ากับ ${clampedCount}`;

	const raw = await chat(
		[
			{ role: 'system', content: systemPrompt },
			{ role: 'user', content: userPrompt }
		],
		{ temperature: 0.8, max_tokens: 3000 }
	);

	let parsed: { title?: string; segments?: unknown[] };
	try {
		parsed = JSON.parse(cleanJson(raw));
	} catch {
		throw new Error('AI returned invalid JSON for video script');
	}

	const segments = Array.isArray(parsed.segments) ? parsed.segments : [];

	return {
		title: typeof parsed.title === 'string' && parsed.title.trim() ? parsed.title.trim() : topic,
		segments: segments.slice(0, clampedCount).map((seg, i) => {
			const s = seg as Record<string, unknown>;
			const opts = Array.isArray(s.options)
				? (s.options as unknown[]).filter((o): o is string => typeof o === 'string')
				: [];
			const optionsForTemplate =
				selectedTemplate === 'quiz'
					? opts
					: selectedTemplate === 'stat'
						? opts.slice(0, 1)
						: [];
			return {
				position: i + 1,
				layout_type: expectedLayout,
				text: typeof s.text === 'string' && s.text.trim() ? s.text.trim() : topic,
				accent_text: typeof s.accent_text === 'string' && s.accent_text.trim() ? s.accent_text.trim() : null,
				subtext: typeof s.subtext === 'string' && s.subtext.trim() ? s.subtext.trim() : null,
				options: optionsForTemplate,
				search_query:
					typeof s.search_query === 'string' && s.search_query.trim() ? s.search_query.trim() : topic,
				text_position:
					selectedTemplate === 'quiz'
						? normalizeTextPosition(s.text_position)
						: defaultTextPosition,
				duration_seconds: clampDuration(
					typeof s.duration_seconds === 'number' ? s.duration_seconds : clampedDuration
				)
			};
		})
	};
}
