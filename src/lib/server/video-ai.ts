import { chat } from '$lib/server/minimax';
import type { VideoCarouselTemplateType } from '$lib/video-carousel';

export interface VideoScriptSegment {
	position: number;
	layout_type: 'standard' | 'quiz' | 'quote';
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

export async function generateVideoScript(
	topic: string,
	clipCount: number,
	durationSeconds: number,
	templateType: VideoCarouselTemplateType = 'quiz'
): Promise<VideoScriptDraft> {
	const clampedCount = Math.min(Math.max(Math.round(clipCount), 1), 10);
	const clampedDuration = clampDuration(durationSeconds);
	const selectedTemplate: VideoCarouselTemplateType = templateType === 'quote' ? 'quote' : 'quiz';
	const expectedLayout = selectedTemplate === 'quote' ? 'quote' : 'quiz';

	const systemPrompt = `คุณคือ video content strategist ของทีม BigLot ซึ่งสร้างเนื้อหาเกี่ยวกับการเทรดทอง XAUUSD
ตอบเป็น JSON เท่านั้น ไม่มี markdown code block และไม่มีข้อความนำหน้า`;

	const templateInstruction =
		selectedTemplate === 'quote'
			? `Template: Quote / คำคม
- layout_type ให้ใช้ "quote" เสมอ
- text = คำคม/insight ภาษาไทยที่อ่านแล้วหยุดคิด 1-2 บรรทัด ไม่เกิน 18 คำ
- accent_text = null
- subtext = บริบทสั้น ๆ เช่น "BigLot Gold Insight" หรือคำอธิบายไม่เกิน 8 คำ
- options = []
- text_position ให้ใช้ "center" ทุก segment`
			: `Template: Quiz / ตัวเลือก
- layout_type ให้ใช้ "quiz" เสมอ
- text = คำถาม/หัวข้อหลัก กระชับ ภาษาไทย ไม่เกิน 6 คำ
- accent_text = ส่วนที่ต้องการเน้นด้วยสีทอง เช่น "คุณจะเลือกอะไร?" หรือ null ถ้าไม่ต้องการ
- options = 4-6 ตัวเลือก แต่ละอันไม่เกิน 6 คำ ภาษาไทย เชื่อมโยงกับ text
- text_position ให้ใช้ "top" ทุก segment`;

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
      "text": "${selectedTemplate === 'quote' ? 'คำคมหลักสำหรับขึ้นกลางจอ' : 'คำถามหลัก หรือ hook ด้านบน'}",
      "accent_text": ${selectedTemplate === 'quote' ? 'null' : '"ส่วนที่ต้องการเน้นสีเหลือง เช่น คุณเลือกอะไร?"'},
      "subtext": ${selectedTemplate === 'quote' ? '"ข้อความรองสั้น ๆ"' : 'null'},
      "options": ${selectedTemplate === 'quote' ? '[]' : '["ตัวเลือก A", "ตัวเลือก B", "ตัวเลือก C", "ตัวเลือก D"]'},
      "search_query": "english keyword for Pexels video (3-5 words describing the visual)",
      "text_position": "${selectedTemplate === 'quote' ? 'center' : 'top'}",
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
			return {
				position: i + 1,
				layout_type: expectedLayout,
				text: typeof s.text === 'string' && s.text.trim() ? s.text.trim() : topic,
				accent_text: typeof s.accent_text === 'string' && s.accent_text.trim() ? s.accent_text.trim() : null,
				subtext: typeof s.subtext === 'string' && s.subtext.trim() ? s.subtext.trim() : null,
				options: selectedTemplate === 'quiz' ? opts : [],
				search_query:
					typeof s.search_query === 'string' && s.search_query.trim() ? s.search_query.trim() : topic,
				text_position: selectedTemplate === 'quote' ? 'center' : normalizeTextPosition(s.text_position),
				duration_seconds: clampDuration(
					typeof s.duration_seconds === 'number' ? s.duration_seconds : clampedDuration
				)
			};
		})
	};
}
