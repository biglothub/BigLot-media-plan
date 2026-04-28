import type { PageLoad } from './$types';

export const load: PageLoad = async ({ params, fetch }) => {
	const [projectRes, slidesRes] = await Promise.all([
		fetch(`/api/video-carousel/projects/${params.id}`),
		fetch(`/api/video-carousel/projects/${params.id}/slides`)
	]);

	if (!projectRes.ok) {
		return { project: null, slides: [] };
	}

	const project = await projectRes.json();
	const slides = slidesRes.ok ? await slidesRes.json() : [];

	return { project, slides };
};
