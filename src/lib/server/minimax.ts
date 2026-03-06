import { MINIMAX_API_KEY } from '$env/static/private';

const API_URL = 'https://api.minimax.io/v1/text/chatcompletion_v2';

interface Message {
	role: 'system' | 'user' | 'assistant';
	content: string;
}

interface ChatOptions {
	model?: string;
	temperature?: number;
	max_tokens?: number;
	timeout_ms?: number;
}

export async function chat(messages: Message[], options: ChatOptions = {}): Promise<string> {
	const timeoutMs = options.timeout_ms ?? 300_000;
	const controller = new AbortController();
	const timer = setTimeout(() => controller.abort(), timeoutMs);

	let response: Response;
	try {
		response = await fetch(API_URL, {
			method: 'POST',
			headers: {
				'Content-Type': 'application/json',
				Authorization: `Bearer ${MINIMAX_API_KEY}`
			},
			body: JSON.stringify({
				model: options.model ?? 'MiniMax-M2.5',
				temperature: options.temperature ?? 0.7,
				max_completion_tokens: options.max_tokens ?? 2000,
				messages
			}),
			signal: controller.signal
		});
	} catch (e) {
		if ((e as Error).name === 'AbortError') {
			throw new Error(`MiniMax หมดเวลา (${timeoutMs / 1000} วินาที) — ลองใหม่อีกครั้ง`);
		}
		throw e;
	} finally {
		clearTimeout(timer);
	}

	if (!response.ok) {
		const err = await response.text();
		throw new Error(`MiniMax API error ${response.status}: ${err}`);
	}

	const data = await response.json();

	// MiniMax sometimes returns base_resp error even with 200 status
	if (data.base_resp && data.base_resp.status_code !== 0) {
		throw new Error(`MiniMax error ${data.base_resp.status_code}: ${data.base_resp.status_msg}`);
	}

	if (!data.choices || data.choices.length === 0) {
		throw new Error(`MiniMax returned no choices. Response: ${JSON.stringify(data)}`);
	}

	const choice = data.choices[0];
	if (choice.finish_reason === 'length') {
		throw new Error('AI response was cut off (max_tokens reached) — try increasing max_tokens or reducing prompt size');
	}

	return choice.message.content as string;
}
