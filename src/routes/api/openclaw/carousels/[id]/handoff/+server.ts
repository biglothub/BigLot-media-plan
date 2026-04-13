import { json } from '@sveltejs/kit';
import type { RequestHandler } from './$types';
import { TEAM_MEMBERS } from '$lib/team';
import { supabase } from '$lib/supabase';
import { getCarouselProjectById, getCarouselWorkflow } from '$lib/server/carousel-store';

function normalizeDate(value: unknown): string | null {
	if (typeof value !== 'string') return null;
	const trimmed = value.trim();
	return trimmed || null;
}

function normalizeNotes(value: unknown): string | null {
	if (typeof value !== 'string') return null;
	const trimmed = value.trim();
	return trimmed || null;
}

type AssignmentInput = {
	member_name: (typeof TEAM_MEMBERS)[number];
	role_detail: string;
};

function normalizeAssignments(value: unknown): AssignmentInput[] {
	if (!Array.isArray(value)) return [];

	return value.flatMap((item) => {
		if (!item || typeof item !== 'object') return [];
		const row = item as Record<string, unknown>;
		const memberName = row.member_name;
		if (typeof memberName !== 'string' || !TEAM_MEMBERS.includes(memberName as (typeof TEAM_MEMBERS)[number])) {
			return [];
		}
		return [
			{
				member_name: memberName as (typeof TEAM_MEMBERS)[number],
				role_detail: typeof row.role_detail === 'string' ? row.role_detail.trim() : ''
			}
		];
	});
}

export const POST: RequestHandler = async ({ params, request }) => {
	if (!supabase) return json({ error: 'Supabase not configured' }, { status: 500 });

	try {
		const project = await getCarouselProjectById(params.id);
		if (!project) return json({ error: 'Carousel project not found' }, { status: 404 });

		const workflow = await getCarouselWorkflow(project);
		const body = await request.json();
		const shootDate = normalizeDate(body.shoot_date) ?? workflow.linked_schedule?.shoot_date ?? new Date().toISOString().slice(0, 10);
		const publishDeadline =
			body.publish_deadline !== undefined
				? normalizeDate(body.publish_deadline)
				: workflow.linked_schedule?.publish_deadline ?? null;
		const notes =
			body.notes !== undefined
				? normalizeNotes(body.notes)
				: workflow.linked_schedule?.notes ?? null;
		const assignments = normalizeAssignments(body.assignments);

		let scheduleId = workflow.linked_schedule?.id ?? null;
		if (scheduleId) {
			const { error: updateError } = await supabase
				.from('production_calendar')
				.update({
					carousel_project_id: project.id,
					handoff_source: 'carousel_handoff',
					shoot_date: shootDate,
					publish_deadline: publishDeadline,
					notes
				})
				.eq('id', scheduleId);

			if (updateError) return json({ error: updateError.message }, { status: 500 });
		} else {
			const { data: inserted, error: insertError } = await supabase
				.from('production_calendar')
				.insert({
					backlog_id: project.backlog_id,
					carousel_project_id: project.id,
					handoff_source: 'carousel_handoff',
					shoot_date: shootDate,
					publish_deadline: publishDeadline,
					notes,
					status: 'planned',
					approval_status: 'draft',
					revision_count: 0
				})
				.select('id')
				.single();

			if (insertError) return json({ error: insertError.message }, { status: 500 });
			scheduleId = inserted.id as string;
		}

		if (scheduleId && body.assignments !== undefined) {
			const { error: deleteError } = await supabase.from('calendar_assignments').delete().eq('calendar_id', scheduleId);
			if (deleteError) return json({ error: deleteError.message }, { status: 500 });

			if (assignments.length > 0) {
				const { error: assignmentError } = await supabase.from('calendar_assignments').insert(
					assignments.map((assignment) => ({
						calendar_id: scheduleId,
						member_name: assignment.member_name,
						role_detail: assignment.role_detail
					}))
				);

				if (assignmentError) return json({ error: assignmentError.message }, { status: 500 });
			}
		}

		const refreshedWorkflow = await getCarouselWorkflow(project);
		return json({
			schedule: refreshedWorkflow.linked_schedule,
			published_record: refreshedWorkflow.published_record
		});
	} catch (error) {
		return json({ error: error instanceof Error ? error.message : String(error) }, { status: 500 });
	}
};
