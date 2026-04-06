import { randomUUID } from 'node:crypto';
import { env } from '$env/dynamic/private';
import type { CarouselAsset } from '$lib/types';
import { supabaseAdmin, hasSupabaseServiceRoleConfig } from '$lib/server/supabase-admin';

const PEXELS_API_BASE_URL = 'https://api.pexels.com/v1';
const PEXELS_TIMEOUT_MS = 60_000;
const CAROUSEL_ASSET_BUCKET = 'carousel-assets';

type JsonRecord = Record<string, unknown>;

export const hasPexelsConfig = Boolean(env.PEXELS_API_KEY);

function pexelsHeaders(): HeadersInit {
	if (!env.PEXELS_API_KEY) {
		throw new Error('PEXELS_API_KEY is required');
	}

	return {
		Accept: 'application/json',
		Authorization: env.PEXELS_API_KEY
	};
}

async function pexelsFetch(pathname: string): Promise<unknown> {
	const controller = new AbortController();
	const timer = setTimeout(() => controller.abort(), PEXELS_TIMEOUT_MS);

	try {
		const response = await fetch(`${PEXELS_API_BASE_URL}${pathname}`, {
			headers: pexelsHeaders(),
			signal: controller.signal
		});

		if (!response.ok) {
			const message = await response.text();
			throw new Error(`Pexels API error ${response.status}: ${message}`);
		}

		return await response.json();
	} catch (error) {
		if ((error as Error).name === 'AbortError') {
			throw new Error('Pexels request timed out');
		}
		throw error;
	} finally {
		clearTimeout(timer);
	}
}

function normalizePhotographerSlug(value: string | null): string | null {
	if (!value) return null;
	try {
		const parsed = new URL(value);
		const segments = parsed.pathname.split('/').filter(Boolean);
		return segments.at(-1) ?? null;
	} catch {
		return null;
	}
}

function toOrientation(width: number | null, height: number | null): string | null {
	if (!width || !height) return null;
	if (height > width) return 'portrait';
	if (width > height) return 'landscape';
	return 'square';
}

function extractPexelsAsset(item: JsonRecord, sourceQuery: string | null): CarouselAsset {
	const src = (item.src as JsonRecord | undefined) ?? {};
	const width = typeof item.width === 'number' ? item.width : null;
	const height = typeof item.height === 'number' ? item.height : null;
	const photographerUrl = typeof item.photographer_url === 'string' ? item.photographer_url : null;

	return {
		id: Number(item.id),
		title:
			typeof item.alt === 'string' && item.alt.trim()
				? item.alt.trim()
				: typeof item.photographer === 'string'
					? `Photo by ${item.photographer}`
					: 'Untitled photo',
		type: 'photo',
		url: typeof item.url === 'string' ? item.url : null,
		preview_url:
			typeof src.portrait === 'string'
				? src.portrait
				: typeof src.large2x === 'string'
					? src.large2x
					: typeof src.large === 'string'
						? src.large
						: typeof src.original === 'string'
							? src.original
							: null,
		preview_width: width,
		preview_height: height,
		orientation: toOrientation(width, height),
		author_name: typeof item.photographer === 'string' ? item.photographer : null,
		author_slug: normalizePhotographerSlug(photographerUrl),
		license_url: 'https://www.pexels.com/license/',
		premium: false,
		is_ai_generated: false,
		downloads: null,
		likes: null,
		published_at: null,
		available_formats: ['original', 'large2x', 'large', 'portrait'],
		source_query: sourceQuery,
		selected_format: null,
		storage_url: null
	};
}

export async function searchPexelsResources(term: string, limit = 8): Promise<CarouselAsset[]> {
	const normalizedTerm = term.trim();
	if (!normalizedTerm) return [];
	if (!hasPexelsConfig) {
		throw new Error('PEXELS_API_KEY is required');
	}

	const params = new URLSearchParams({
		query: normalizedTerm,
		per_page: String(Math.min(Math.max(limit, 1), 15)),
		orientation: 'portrait',
		size: 'large',
		locale: 'en-US'
	});

	const payload = (await pexelsFetch(`/search?${params.toString()}`)) as JsonRecord;
	const items = Array.isArray(payload.photos) ? (payload.photos as JsonRecord[]) : [];
	return items
		.map((item) => extractPexelsAsset(item, normalizedTerm))
		.filter((item) => Number.isFinite(item.id) && item.id > 0);
}

function resolvePexelsDownloadUrl(asset: CarouselAsset): string | null {
	return asset.storage_url ?? asset.preview_url ?? null;
}

function extensionFromUrl(url: string): string | null {
	try {
		const pathname = new URL(url).pathname.toLowerCase();
		const match = pathname.match(/\.([a-z0-9]+)$/);
		return match?.[1] ?? null;
	} catch {
		return null;
	}
}

function contentTypeToExtension(contentType: string | null, url: string): string {
	if (contentType?.includes('png')) return 'png';
	if (contentType?.includes('webp')) return 'webp';
	if (contentType?.includes('svg')) return 'svg';
	if (contentType?.includes('jpeg') || contentType?.includes('jpg')) return 'jpg';
	return extensionFromUrl(url) ?? 'jpg';
}

async function fetchBinary(url: string): Promise<{ buffer: ArrayBuffer; contentType: string | null }> {
	const response = await fetch(url);
	if (!response.ok) {
		throw new Error(`Asset download failed: ${response.status}`);
	}

	return {
		buffer: await response.arrayBuffer(),
		contentType: response.headers.get('content-type')
	};
}

export async function downloadAndStorePexelsAsset(
	asset: CarouselAsset,
	projectId: string,
	slideId: string
): Promise<{ path: string; publicUrl: string; asset: CarouselAsset }> {
	if (!hasSupabaseServiceRoleConfig || !supabaseAdmin) {
		throw new Error('SUPABASE_SERVICE_ROLE_KEY is required for asset caching');
	}

	const assetUrl = resolvePexelsDownloadUrl(asset);
	if (!assetUrl) {
		throw new Error('Selected asset does not contain a downloadable URL');
	}

	const binary = await fetchBinary(assetUrl);
	const extension = contentTypeToExtension(binary.contentType, assetUrl);
	const filePath = `projects/${projectId}/${slideId}-${randomUUID()}.${extension}`;
	const { error: uploadError } = await supabaseAdmin.storage
		.from(CAROUSEL_ASSET_BUCKET)
		.upload(filePath, binary.buffer, {
			contentType: binary.contentType ?? 'image/jpeg',
			upsert: false
		});

	if (uploadError) {
		throw new Error(`Supabase storage upload failed: ${uploadError.message}`);
	}

	const { data: publicData } = supabaseAdmin.storage.from(CAROUSEL_ASSET_BUCKET).getPublicUrl(filePath);
	const publicUrl = publicData.publicUrl;

	return {
		path: filePath,
		publicUrl,
		asset: {
			...asset,
			selected_format: 'original',
			storage_url: publicUrl
		}
	};
}
