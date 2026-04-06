import { env } from '$env/dynamic/private';

const API_URL = 'https://api.deepseek.com/chat/completions';
const DEFAULT_MODEL = 'deepseek-chat';

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
	if (!env.DEEPSEEK_API_KEY) {
		throw new Error('DEEPSEEK_API_KEY is required');
	}

	const timeoutMs = options.timeout_ms ?? 300_000;
	const controller = new AbortController();
	const timer = setTimeout(() => controller.abort(), timeoutMs);

	let response: Response;
	try {
		response = await fetch(API_URL, {
			method: 'POST',
			headers: {
				'Content-Type': 'application/json',
				Authorization: `Bearer ${env.DEEPSEEK_API_KEY}`
			},
			body: JSON.stringify({
				model: options.model ?? DEFAULT_MODEL,
				temperature: options.temperature ?? 0.7,
				max_tokens: options.max_tokens ?? 2000,
				messages,
				stream: false
			}),
			signal: controller.signal
		});
	} catch (error) {
		if ((error as Error).name === 'AbortError') {
			throw new Error(`DeepSeek หมดเวลา (${timeoutMs / 1000} วินาที) — ลองใหม่อีกครั้ง`);
		}
		throw error;
	} finally {
		clearTimeout(timer);
	}

	if (!response.ok) {
		const err = await response.text();
		throw new Error(`DeepSeek API error ${response.status}: ${err}`);
	}

	const data = await response.json();

	if (!data.choices || data.choices.length === 0) {
		throw new Error(`DeepSeek returned no choices. Response: ${JSON.stringify(data)}`);
	}

	const choice = data.choices[0];
	if (choice.finish_reason === 'length') {
		throw new Error('AI response was cut off (max_tokens reached) — try increasing max_tokens or reducing prompt size');
	}

	if (typeof choice.message?.content !== 'string' || !choice.message.content.trim()) {
		throw new Error(`DeepSeek returned empty content. Response: ${JSON.stringify(data)}`);
	}

	return choice.message.content as string;
}
