import { randomUUID } from 'node:crypto';
import { supabaseAdmin, hasSupabaseServiceRoleConfig } from '$lib/server/supabase-admin';

const VIDEO_CAROUSEL_BUCKET = 'carousel-assets';
const MAX_VIDEO_CAROUSEL_UPLOAD_BYTES = 100 * 1024 * 1024;
const SUPPORTED_VIDEO_CAROUSEL_TYPES = new Set(['video/mp4', 'video/webm']);

function contentTypeToVideoExtension(contentType: string, fileName: string): string {
	if (contentType === 'video/webm') return 'webm';
	if (contentType === 'video/mp4') return 'mp4';
	const match = fileName.toLowerCase().match(/\.([a-z0-9]+)$/);
	return match?.[1] ?? 'mp4';
}

export async function uploadVideoCarouselFile(
	file: File,
	projectId: string,
	slideId: string
): Promise<{ path: string; publicUrl: string }> {
	if (!hasSupabaseServiceRoleConfig || !supabaseAdmin) {
		throw new Error('SUPABASE_SERVICE_ROLE_KEY is required for video uploads');
	}
	if (!SUPPORTED_VIDEO_CAROUSEL_TYPES.has(file.type)) {
		throw new Error('รองรับเฉพาะไฟล์วิดีโอ MP4 หรือ WEBM');
	}
	if (file.size <= 0) {
		throw new Error('ไฟล์วิดีโอว่างเปล่า');
	}
	if (file.size > MAX_VIDEO_CAROUSEL_UPLOAD_BYTES) {
		throw new Error('ไฟล์วิดีโอใหญ่เกิน 100MB');
	}

	const extension = contentTypeToVideoExtension(file.type, file.name);
	const filePath = `video-carousel/${projectId}/${slideId}-upload-${randomUUID()}.${extension}`;
	const buffer = await file.arrayBuffer();
	const { error } = await supabaseAdmin.storage.from(VIDEO_CAROUSEL_BUCKET).upload(filePath, buffer, {
		contentType: file.type,
		upsert: false
	});

	if (error) {
		throw new Error(`Supabase storage upload failed: ${error.message}`);
	}

	const { data } = supabaseAdmin.storage.from(VIDEO_CAROUSEL_BUCKET).getPublicUrl(filePath);
	return {
		path: filePath,
		publicUrl: data.publicUrl
	};
}
