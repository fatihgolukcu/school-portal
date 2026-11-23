-- The same complete follow-up process applies to automatic and manual requests.
alter table public.guidance_cases add column workflow_stage text not null default 'new';
alter table public.guidance_cases add column reporting_teacher_id uuid references public.profiles;
alter table public.guidance_cases add column reassessment_due_at timestamptz;
alter table public.guidance_cases add column workflow_updated_at timestamptz not null default now();
alter table public.guidance_cases add column closed_at timestamptz;

update public.guidance_cases g set
  workflow_stage=case g.status when 'under_review' then 'review' when 'plan_active' then 'plan' when 'follow_up' then 'follow_up' when 'escalated' then 'management_review' when 'resolved' then 'resolved' else 'new' end,
  reporting_teacher_id=case when exists(select 1 from public.profiles p where p.id=g.created_by and 'teacher'=any(p.roles)) then g.created_by else (select teacher_id from public.classes where id=g.class_id) end,
  closed_at=case when g.status='resolved' then now() else null end;

alter table public.guidance_cases add constraint guidance_workflow_stage_check check(workflow_stage in
  ('new','review','teacher_meeting','plan','parent_meeting','agreed_actions','follow_up','management_review','reassessment','resolved','closed_unresolved'));
alter table public.guidance_cases add constraint guidance_workflow_status_consistent check(status=case
  when workflow_stage='new' then 'new'
  when workflow_stage in ('review','teacher_meeting') then 'under_review'
  when workflow_stage in ('plan','parent_meeting','agreed_actions') then 'plan_active'
  when workflow_stage in ('follow_up','reassessment') then 'follow_up'
  when workflow_stage='management_review' then 'escalated'
  else 'resolved' end);

create table public.guidance_stage_events (
  id uuid primary key default gen_random_uuid(), case_id uuid not null references public.guidance_cases,
  from_stage text not null, to_stage text not null, note text not null,
  actor_id uuid references public.profiles, reporting_teacher_id uuid references public.profiles,
  created_at timestamptz not null default now()
);
create index guidance_stage_events_case_idx on public.guidance_stage_events(case_id,created_at);
alter table public.guidance_stage_events enable row level security;
create policy guidance_stage_events_read on public.guidance_stage_events for select to authenticated using(
  has_role(array['administrator','academic_manager']) or
  (has_role(array['guidance']) and exists(select 1 from public.guidance_cases g where g.id=case_id and g.assignee_id=auth.uid()))
);
grant select on public.guidance_stage_events to authenticated;
revoke insert,update,delete on public.guidance_stage_events from authenticated,anon;
grant all on public.guidance_stage_events to service_role;

create function public.populate_reporting_teacher() returns trigger
language plpgsql security definer set search_path=public,pg_temp as $$
begin
  if new.reporting_teacher_id is null then
    if exists(select 1 from profiles where id=new.created_by and 'teacher'=any(roles)) then
      new.reporting_teacher_id:=new.created_by;
    elsif new.class_id is not null then
      select teacher_id into new.reporting_teacher_id from classes where id=new.class_id;
    end if;
  end if;
  return new;
end $$;
create trigger populate_reporting_teacher before insert on public.guidance_cases
for each row execute function public.populate_reporting_teacher();

-- A distinct event id permits notification of a later return to management while
-- each individual outbox item retains its own delivery idempotency key.
create or replace function public.queue_case_email(p_case_id uuid,p_event text) returns void
language sql security definer set search_path=public,pg_temp as $$
  insert into notification_outbox(case_id,recipient_email,recipient_language,event,payload)
  select p_case_id,p.email,p.language,p_event,jsonb_build_object('case_id',p_case_id,'event',p_event)
  from profiles p where p.active and p.email<>'' and p.roles &&
    case when p_event like 'management_escalation%' then array['administrator','academic_manager'] else array['administrator','academic_manager','guidance'] end
  on conflict(case_id,recipient_email,event) do nothing
$$;

create function public.advance_guidance_stage(
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
    when 'review' then p_stage='teacher_meeting'
    when 'teacher_meeting' then p_stage='plan'
    when 'plan' then p_stage='parent_meeting'
    when 'parent_meeting' then p_stage='agreed_actions'
    when 'agreed_actions' then p_stage='follow_up'
    when 'follow_up' then p_stage in ('management_review','reassessment')
    when 'management_review' then p_stage in ('reassessment','closed_unresolved')
    when 'reassessment' then p_stage in ('resolved','management_review')
    else false end) or p_stage is null then raise exception 'This action is not the next permitted workflow step'; end if;
  if g.workflow_stage='management_review' and not manager then raise exception 'Management must decide the outcome of its review' using errcode='42501'; end if;
  if p_stage='closed_unresolved' and not manager then raise exception 'Only management may close an unresolved case' using errcode='42501'; end if;
  if g.workflow_stage='reassessment' and (g.reassessment_due_at is null or now()<g.reassessment_due_at) then
    raise exception 'The two-week reassessment period has not ended';
  end if;

  participant:=g.reporting_teacher_id;
  if p_stage='teacher_meeting' then
    participant:=coalesce(p_teacher_id,g.reporting_teacher_id);
    if participant is null or not exists(select 1 from profiles where id=participant and 'teacher'=any(roles)) then raise exception 'Select the reporting teacher for the meeting'; end if;
    if g.reporting_teacher_id is not null and participant<>g.reporting_teacher_id then raise exception 'The meeting must include the reporting teacher'; end if;
    if not (participant=g.created_by or exists(select 1 from enrollments e join classes c on c.id=e.class_id where e.student_id=g.student_id and c.teacher_id=participant)) then raise exception 'The meeting teacher must have taught this student'; end if;
  end if;
  if p_stage='plan' and not exists(select 1 from guidance_notes where case_id=g.id and kind='teacher_meeting') then raise exception 'Record the teacher meeting before creating the plan'; end if;
  if p_stage='agreed_actions' and not exists(select 1 from guidance_notes where case_id=g.id and kind='parent_meeting') then raise exception 'Record the parent meeting before agreeing actions'; end if;
  if p_stage='follow_up' and not exists(select 1 from guidance_notes where case_id=g.id and kind='action' and shared) then raise exception 'Agree and share the actions before follow-up'; end if;

  new_status:=case when p_stage='new' then 'new' when p_stage in ('review','teacher_meeting') then 'under_review'
    when p_stage in ('plan','parent_meeting','agreed_actions') then 'plan_active'
    when p_stage in ('follow_up','reassessment') then 'follow_up'
    when p_stage='management_review' then 'escalated' else 'resolved' end;
  note_kind:=case when p_stage='teacher_meeting' then 'teacher_meeting' when p_stage='parent_meeting' then 'parent_meeting'
    when p_stage in ('plan','agreed_actions') then 'action' else 'review' end;
  shared_note:=p_stage='agreed_actions';
  next_due:=g.follow_up_at;
  if p_stage='follow_up' then
    next_due:=coalesce(p_follow_up_at,now()+interval '14 days');
    if next_due<=now() then raise exception 'Choose a future follow-up date'; end if;
  elsif p_stage='reassessment' then next_due:=now()+interval '14 days';
  elsif p_stage in ('resolved','closed_unresolved') then next_due:=null; end if;

  -- Claiming a shared-queue case and writing its private meeting record happen
  -- within the same transaction. Terminal notes are inserted before closure.
  update guidance_cases set assignee_id=coalesce(assignee_id,auth.uid()) where id=g.id;
  perform add_guidance_note(g.id,btrim(p_note),note_kind,shared_note);
  insert into guidance_stage_events(case_id,from_stage,to_stage,note,actor_id,reporting_teacher_id)
    values(g.id,g.workflow_stage,p_stage,btrim(p_note),auth.uid(),participant) returning id into event_id;
  update guidance_cases set workflow_stage=p_stage,status=new_status,reporting_teacher_id=participant,
    reviewed_at=coalesce(reviewed_at,now()),workflow_updated_at=now(),overdue=false,
    follow_up_at=next_due,
    reassessment_due_at=case when p_stage='reassessment' then next_due else reassessment_due_at end,
    outcome=case when p_stage in ('reassessment','resolved','closed_unresolved','management_review') then btrim(p_note) else outcome end,
    no_improvement=case when p_stage='management_review' then true when p_stage in ('reassessment','resolved') then false else no_improvement end,
    escalated_at=case when p_stage='management_review' then coalesce(escalated_at,now()) else escalated_at end,
    closed_at=case when p_stage in ('resolved','closed_unresolved') then now() else null end
    where id=g.id returning * into result;
  if p_stage='management_review' then
    update students set status='support',updated_at=now() where id=g.student_id and status<>'archived';
    perform queue_case_email(g.id,'management_escalation:'||event_id::text);
  end if;
  return result;
end $$;

-- The legacy RPC is retained for assignments and dates, never for state changes.
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
  if g.workflow_stage='reassessment' and p_follow_up_at is distinct from g.reassessment_due_at then raise exception 'The server-set reassessment deadline cannot be changed'; end if;
  if g.workflow_stage='follow_up' and (p_follow_up_at is null or p_follow_up_at<=now()) then raise exception 'Choose a future follow-up date'; end if;
  update guidance_cases set assignee_id=p_assignee_id,follow_up_at=p_follow_up_at,outcome=coalesce(nullif(btrim(p_outcome),''),outcome) where id=g.id;
end $$;

-- Risk escalation draws management attention without skipping required meetings
-- or deciding whether the problem has been resolved. Reassessment stays open.
create or replace function public.advance_guidance_deadlines() returns jsonb
language plpgsql security definer set search_path=public,pg_temp as $$
declare g guidance_cases; overdue_count integer:=0; escalated_count integer:=0; reassessment_count integer:=0;
  cfg configurations; rule jsonb; ctx jsonb; still_failing boolean; escalation_hours integer; escalation_days integer;
begin
  perform require_service();
  select * into cfg from configurations where kind='triggers' and status='published' order by version desc limit 1;
  escalation_hours:=coalesce((cfg.body->>'escalation_hours')::integer,72);
  escalation_days:=coalesce((cfg.body->>'orange_escalation_days')::integer,14);
  update guidance_cases set overdue=true where workflow_stage='new' and reviewed_at is null and review_due_at<=now() and not overdue;
  get diagnostics overdue_count=row_count;
  update guidance_cases set overdue=true where workflow_stage='reassessment' and reassessment_due_at<=now() and not overdue;
  get diagnostics reassessment_count=row_count;
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
  return jsonb_build_object('overdue',overdue_count,'escalated',escalated_count,'reassessment_due',reassessment_count);
end $$;

revoke all on function public.populate_reporting_teacher(),public.advance_guidance_stage(uuid,text,text,uuid,timestamptz) from public,anon,authenticated;
grant execute on function public.advance_guidance_stage(uuid,text,text,uuid,timestamptz) to authenticated;
