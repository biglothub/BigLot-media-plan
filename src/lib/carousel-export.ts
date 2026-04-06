import { carouselRoleLabel, toHashtagText } from '$lib/carousel';
import type { CarouselProjectRow, CarouselSlideRow } from '$lib/types';

export interface CarouselExportEntry {
	slideId: string;
	position: number;
	filename: string;
	label: string;
}

export interface CarouselExportManifest {
	version: 1;
	project_id: string;
	backlog_id: string;
	platform: 'instagram';
	status: string;
	title: string | null;
	caption: string | null;
	hashtags: string[];
	exported_at: string;
	slides: Array<{
		id: string;
		position: number;
		role: string;
		layout_variant: string;
		filename: string;
		headline: string | null;
		freepik_query: string | null;
	}>;
}

function padSlideNumber(position: number): string {
	return String(position).padStart(2, '0');
}

export function buildCarouselExportEntries(slides: CarouselSlideRow[]): CarouselExportEntry[] {
	return [...slides]
		.sort((a, b) => a.position - b.position)
		.map((slide) => ({
			slideId: slide.id,
			position: slide.position,
			filename: `${padSlideNumber(slide.position)}-${slide.role}.png`,
			label: `${padSlideNumber(slide.position)} ${carouselRoleLabel[slide.role]}`
		}));
}

export function buildCarouselExportManifest(
	project: CarouselProjectRow,
	slides: CarouselSlideRow[],
	exportedAt = new Date().toISOString()
): CarouselExportManifest {
	const entries = buildCarouselExportEntries(slides);
	return {
		version: 1,
		project_id: project.id,
		backlog_id: project.backlog_id,
		platform: 'instagram',
		status: project.status,
		title: project.title,
		caption: project.caption,
		hashtags: project.hashtags_json ?? [],
		exported_at: exportedAt,
		slides: entries.map((entry) => {
			const slide = slides.find((item) => item.id === entry.slideId);
			return {
				id: entry.slideId,
				position: entry.position,
				role: slide?.role ?? 'body',
				layout_variant: slide?.layout_variant ?? 'content',
				filename: entry.filename,
				headline: slide?.headline ?? null,
				freepik_query: slide?.freepik_query ?? null
			};
		})
	};
}

export function buildPostingChecklist(project: CarouselProjectRow, slides: CarouselSlideRow[]): string {
	const hashtags = toHashtagText(project.hashtags_json);
	const lines = [
		'Instagram Carousel Posting Checklist',
		`Project: ${project.title ?? 'Untitled carousel'}`,
		`Slides: ${slides.length}`,
		'1. Review caption wording and CTA one last time.',
		'2. Confirm slide order matches the exported filenames.',
		'3. Check brand spelling, trading terms, and Thai copy.',
		'4. Upload all PNG files in order to Instagram.',
		'5. Paste the caption from caption.txt.',
		'6. Paste hashtags from hashtags.txt if needed.',
		'7. Add final @mentions / location manually before publishing.'
	];

	return hashtags ? [...lines, `8. Suggested hashtags: ${hashtags}`].join('\n') : lines.join('\n');
}
