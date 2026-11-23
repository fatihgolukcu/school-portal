-- Guidance follows five steps instead of nine:
--   new → review → plan (plan and parent meeting, shared with parents) → follow_up → resolved
-- Management review stays available from follow-up, and only management may close
-- a case without resolution. The 14-day reassessment wait is removed.

-- 1. Existing cases move onto the shorter path ---------------------------------
alter table public.guidance_cases drop constraint if exists guidance_workflow_stage_check;
alter table public.guidance_cases drop constraint if exists guidance_workflow_status_consistent;

update public.guidance_cases set
  workflow_stage = case workflow_stage
    when 'teacher_meeting' then 'review'
    when 'parent_meeting' then 'plan'
    when 'agreed_actions' then 'plan'
    when 'reassessment' then 'follow_up'
    else workflow_stage end,
  follow_up_at = case when workflow_stage = 'reassessment' then coalesce(reassessment_due_at, follow_up_at) else follow_up_at end
where workflow_stage in ('teacher_meeting','parent_meeting','agreed_actions','reassessment');

update public.guidance_cases g set status = x.status
from (select id, case workflow_stage
    when 'new' then 'new'
    when 'review' then 'under_review'
    when 'plan' then 'plan_active'
    when 'follow_up' then 'follow_up'
    when 'management_review' then 'escalated'
    else 'resolved' end as status from public.guidance_cases) x
where x.id = g.id and g.status is distinct from x.status;

alter table public.guidance_cases add constraint guidance_workflow_stage_check check (workflow_stage in
  ('new','review','plan','follow_up','management_review','resolved','closed_unresolved'));
alter table public.guidance_cases add constraint guidance_workflow_status_consistent check (status = case
  when workflow_stage = 'new' then 'new'
  when workflow_stage = 'review' then 'under_review'
  when workflow_stage = 'plan' then 'plan_active'
  when workflow_stage = 'follow_up' then 'follow_up'
  when workflow_stage = 'management_review' then 'escalated'
  else 'resolved' end);

-- 2. The step function: same signature, shorter path ----------------------------
create or replace function public.advance_guidance_stage(
  p_case_id uuid,p_stage text,p_note text,p_teacher_id uuid default null,p_follow_up_at timestamptz default null
) returns public.guidance_cases language plpgsql security definer set search_path=public,pg_temp as $$
declare g guidance_cases; result guidance_cases; event_id uuid; participant uuid; note_kind text;
  new_status text; next_due timestamptz; shared_note boolean:=false; manager boolean;
begin
  perform require_role(array['administrator','academic_manager','guidance']);
  select * into strict g from guidance_cases where id=p_case_id for update;
  if not can_manage_case(p_case_id) then raise exception 'Only the assigned guidance user or management may advance this case' using errcode='42501'; end if;
  manager:=has_role(array['administrator','academic_manager']);
  if coalesce(length(btrim(p_note)),0) not between 3 and 5000 then raise exception 'Record a finding or action of 3 to 5000 characters'; end if;
  if not (case g.workflow_stage
    when 'new' then p_stage='review'
    when 'review' then p_stage='plan'
    when 'plan' then p_stage='follow_up'
    when 'follow_up' then p_stage in ('follow_up','resolved','management_review')
    when 'management_review' then p_stage in ('follow_up','closed_unresolved')
    else false end) or p_stage is null then raise exception 'This action is not the next permitted workflow step'; end if;
  if g.workflow_stage='management_review' and not manager then raise exception 'Management must decide the outcome of its review' using errcode='42501'; end if;
  if p_stage='closed_unresolved' and not manager then raise exception 'Only management may close an unresolved case' using errcode='42501'; end if;

  -- A teacher is optional at review; when named, they must know the student.
  participant:=g.reporting_teacher_id;
  if p_stage='review' and p_teacher_id is not null then
    participant:=p_teacher_id;
    if not exists(select 1 from profiles where id=participant and 'teacher'=any(roles)) then raise exception 'Select the reporting teacher for the meeting'; end if;
    if not (participant=g.created_by or participant=g.reporting_teacher_id or exists(select 1 from enrollments e join classes c on c.id=e.class_id where e.student_id=g.student_id and c.teacher_id=participant)) then raise exception 'The meeting teacher must have taught this student'; end if;
  end if;

  new_status:=case p_stage when 'review' then 'under_review' when 'plan' then 'plan_active'
    when 'follow_up' then 'follow_up' when 'management_review' then 'escalated' else 'resolved' end;
  note_kind:=case when p_stage='review' and p_teacher_id is not null then 'teacher_meeting'
    when p_stage='plan' then 'action' else 'review' end;
  -- The plan agreed with the family is shared with the parents.
  shared_note:=p_stage='plan';
  next_due:=g.follow_up_at;
  if p_stage='follow_up' then
    next_due:=coalesce(p_follow_up_at,now()+interval '14 days');
    if next_due<=now() then raise exception 'Choose a future follow-up date'; end if;
  elsif p_stage in ('resolved','closed_unresolved') then next_due:=null; end if;

  update guidance_cases set assignee_id=coalesce(assignee_id,auth.uid()) where id=g.id;
  perform add_guidance_note(g.id,btrim(p_note),note_kind,shared_note);
  insert into guidance_stage_events(case_id,from_stage,to_stage,note,actor_id,reporting_teacher_id)
    values(g.id,g.workflow_stage,p_stage,btrim(p_note),auth.uid(),participant) returning id into event_id;
  update guidance_cases set workflow_stage=p_stage,status=new_status,reporting_teacher_id=participant,
    reviewed_at=coalesce(reviewed_at,now()),workflow_updated_at=now(),overdue=false,
    follow_up_at=next_due,
    outcome=case when p_stage in ('resolved','closed_unresolved','management_review') then btrim(p_note) else outcome end,
    no_improvement=case when p_stage='management_review' then true when p_stage='resolved' then false else no_improvement end,
    escalated_at=case when p_stage='management_review' then coalesce(escalated_at,now()) else escalated_at end,
    closed_at=case when p_stage in ('resolved','closed_unresolved') then now() else null end
    where id=g.id returning * into result;
  if p_stage='management_review' then
    update students set status='support',updated_at=now() where id=g.student_id and status<>'archived';
    perform queue_case_email(g.id,'management_escalation:'||event_id::text);
  end if;
  return result;
end $$;
revoke all on function public.advance_guidance_stage(uuid,text,text,uuid,timestamptz) from public,anon;
grant execute on function public.advance_guidance_stage(uuid,text,text,uuid,timestamptz) to authenticated;

-- 3. Assignment edits no longer know about reassessment -------------------------
create or replace function public.update_guidance(p_case_id uuid,p_status text,p_assignee_id uuid,p_follow_up_at timestamptz,p_outcome text)
returns void language plpgsql security definer set search_path=public,pg_temp as $$
declare g guidance_cases;
begin
  select * into strict g from guidance_cases where id=p_case_id for update;
  if not can_manage_case(p_case_id) then raise exception 'Access denied' using errcode='42501'; end if;
  if g.workflow_stage in ('resolved','closed_unresolved') then raise exception 'Closed cases cannot be edited; create a new request'; end if;
  if p_status is distinct from g.status then raise exception 'Use the ordered workflow actions to change case status'; end if;
  if p_assignee_id is not null and not exists(select 1 from profiles where id=p_assignee_id and active and roles && array['administrator','academic_manager','guidance']) then raise exception 'Choose active guidance or management staff'; end if;
  if not has_role(array['administrator','academic_manager']) and p_assignee_id is distinct from auth.uid() then raise exception 'Guidance staff can claim their own cases; management reassigns cases'; end if;
  if g.workflow_stage='follow_up' and (p_follow_up_at is null or p_follow_up_at<=now()) then raise exception 'Choose a future follow-up date'; end if;
  update guidance_cases set assignee_id=p_assignee_id,follow_up_at=p_follow_up_at,outcome=coalesce(nullif(btrim(p_outcome),''),outcome) where id=g.id;
end $$;

-- 4. Deadlines: no reassessment branch ------------------------------------------
create or replace function public.advance_guidance_deadlines() returns jsonb
language plpgsql security definer set search_path=public,pg_temp as $$
declare g guidance_cases; overdue_count integer:=0; escalated_count integer:=0;
  cfg configurations; rule jsonb; ctx jsonb; still_failing boolean; escalation_hours integer; escalation_days integer;
begin
  perform require_service();
  select * into cfg from configurations where kind='triggers' and status='published' order by version desc limit 1;
  escalation_hours:=coalesce((cfg.body->>'escalation_hours')::integer,72);
  escalation_days:=coalesce((cfg.body->>'orange_escalation_days')::integer,14);
  update guidance_cases set overdue=true where workflow_stage='new' and reviewed_at is null and review_due_at<=now() and not overdue;
  get diagnostics overdue_count=row_count;
  update guidance_cases set overdue=true where workflow_stage='follow_up' and follow_up_at<=now() and not overdue;
  for g in select * from guidance_cases where workflow_stage='new' and reviewed_at is null and created_at+make_interval(hours=>escalation_hours)<=now() and escalated_at is null for update skip locked loop
    update guidance_cases set escalated_at=now() where id=g.id;
    perform queue_case_email(g.id,'management_escalation'); escalated_count:=escalated_count+1;
  end loop;
  for g in select * from guidance_cases where severity='orange' and workflow_stage not in ('resolved','closed_unresolved','management_review') and created_at+make_interval(days=>escalation_days)<=now() for update skip locked loop
    still_failing:=false;
    if g.source='manual' then still_failing:=g.no_improvement;
    else
      select value into rule from jsonb_array_elements(coalesce(cfg.body->'rules','[]')) where value->>'id'=g.issue_key and coalesce((value->>'enabled')::boolean,true);
      if rule is not null then
        ctx:=case when g.last_detected_at>=g.created_at+make_interval(days=>escalation_days) then coalesce(g.evidence->'context','{}') else '{}'::jsonb end;
        still_failing:=trigger_condition_matches(rule->'condition',g.student_id,g.class_id,ctx);
      end if;
    end if;
    if still_failing then
      update guidance_cases set severity='red',escalated_at=coalesce(escalated_at,now()) where id=g.id;
      update students set status='support',updated_at=now() where id=g.student_id and status<>'archived';
      perform queue_case_email(g.id,'urgent'); perform queue_case_email(g.id,'management_escalation');
      escalated_count:=escalated_count+1;
    end if;
  end loop;
  return jsonb_build_object('overdue',overdue_count,'escalated',escalated_count,'reassessment_due',0);
end $$;

notify pgrst, 'reload schema';
