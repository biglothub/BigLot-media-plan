import { json } from '@sveltejs/kit';
import type { RequestHandler } from './$types';
import { supabase } from '$lib/supabase';
import { chat } from '$lib/server/minimax';
import { CREATOR_SYSTEM_PROMPT } from '$lib/server/skills/creator';

export interface IdeaSuggestion {
	title: string;
	description: string;
	platform: string;
	content_category: 'hero' | 'hub' | 'help';
	reason: string;
}

export const POST: RequestHandler = async () => {
	if (!supabase) return json({ error: 'Supabase not configured' }, { status: 500 });

	// Load existing backlog to give AI context and avoid duplicates
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

	// Count category distribution
	const categoryCounts = { hero: 0, hub: 0, help: 0 };
	for (const b of backlog ?? []) {
		const cat = b.content_category as keyof typeof categoryCounts;
		if (cat in categoryCounts) categoryCounts[cat]++;
	}
	const total = categoryCounts.hero + categoryCounts.hub + categoryCounts.help;
	const categoryNote =
		total > 0
			? `ปัจจุบัน hero: ${categoryCounts.hero}, hub: ${categoryCounts.hub}, help: ${categoryCounts.help} — แนะนำให้เน้น category ที่ขาด`
			: 'ยังไม่มี category data';

	const systemPrompt = CREATOR_SYSTEM_PROMPT + '\n\nตอบเป็น JSON array เท่านั้น ไม่มี markdown wrapper ไม่มี text อื่น';

	const userPrompt = `Idea backlog ที่มีอยู่แล้ว (อย่าซ้ำ):
${backlogSummary}

${categoryNote}

แนะนำ content ideas ใหม่ 5 รายการ ทุก idea ต้องเชื่อมโยงกับการเทรด XAUUSD หรือ IB Business โดยตรง

ตอบเป็น JSON array format นี้:
[
  {
    "title": "ชื่อ content พร้อม Hook ที่ดึงดูด",
    "description": "อธิบายสั้นๆ ว่า content นี้เกี่ยวกับอะไร รูปแบบไหน 1-2 ประโยค",
    "platform": "youtube|facebook|instagram|tiktok",
    "content_category": "hero|hub|help",
    "reason": "เหตุผลว่า idea นี้จะช่วย journey ไหน (Awareness/Trust/Conversion) และทำไมน่าจะ perform ดี"
  }
]`;

	let suggestions: IdeaSuggestion[] = [];

	try {
		const raw = await chat(
			[
				{ role: 'system', content: systemPrompt },
				{ role: 'user', content: userPrompt }
			],
			{ temperature: 0.85, max_tokens: 4000 }
		);

		// Strip markdown code fences if present
		const cleaned = raw.replace(/```(?:json)?\n?/g, '').trim();
		suggestions = JSON.parse(cleaned);
	} catch (e) {
		return json({ error: `AI error: ${e instanceof Error ? e.message : String(e)}` }, { status: 500 });
	}

	return json({ suggestions });
};
