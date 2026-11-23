create function public.refer_guidance(p_student_id uuid,p_class_id uuid,p_reason text,p_severity text) returns uuid language plpgsql security definer set search_path=public,pg_temp as $$
begin
  perform require_role(array['administrator','academic_manager','teacher','guidance']);
  if not can_read_academic(p_student_id) or (p_class_id is not null and not can_manage_class(p_class_id) and not has_role(array['guidance'])) then raise exception 'Access denied' using errcode='42501'; end if;
  if p_class_id is not null and not exists(select 1 from enrollments where student_id=p_student_id and class_id=p_class_id) then raise exception 'Student does not belong to this class'; end if;
  if length(trim(p_reason))<3 or p_severity not in ('red','orange','yellow') then raise exception 'A reason and valid severity are required'; end if;
  return upsert_guidance(p_student_id,p_class_id,'manual:'||md5(lower(trim(p_reason))),trim(p_reason),p_severity,'manual');
end $$;
create function public.can_manage_case(p_case_id uuid) returns boolean language sql stable security definer set search_path=public,pg_temp as $$
  select has_role(array['administrator','academic_manager']) or
    (has_role(array['guidance']) and exists(select 1 from guidance_cases where id=p_case_id and (assignee_id=auth.uid() or assignee_id is null)))
$$;
create function public.update_guidance(p_case_id uuid,p_status text,p_assignee_id uuid,p_follow_up_at timestamptz,p_outcome text) returns void language plpgsql security definer set search_path=public,pg_temp as $$
declare g guidance_cases;
begin
  select * into strict g from guidance_cases where id=p_case_id for update;
  if not can_manage_case(p_case_id) then raise exception 'Only case owners or management may change cases' using errcode='42501'; end if;
  if p_status not in ('new','under_review','plan_active','follow_up','resolved','escalated') then raise exception 'Unknown workflow status'; end if;
  if p_assignee_id is not null and not exists(select 1 from profiles where id=p_assignee_id and active and roles && array['administrator','academic_manager','guidance']) then raise exception 'Assignee must be active guidance or management staff'; end if;
  if has_role(array['guidance']) and not has_role(array['administrator','academic_manager']) and p_assignee_id is distinct from auth.uid() then raise exception 'Guidance staff can claim cases for themselves; management reassigns cases'; end if;
  if g.status='resolved' and p_status<>'resolved' then raise exception 'Resolved cases are immutable; create a new referral'; end if;
  if p_status in ('plan_active','follow_up') and p_follow_up_at is null then raise exception 'A follow-up date is required'; end if;
  if p_status in ('resolved','escalated') and length(trim(coalesce(p_outcome,'')))<3 then raise exception 'Record an outcome before resolving or escalating'; end if;
  if p_status in ('plan_active','follow_up') and not exists(select 1 from guidance_notes where case_id=p_case_id and kind='action') then raise exception 'Record a development action before starting the plan'; end if;
  update guidance_cases set status=p_status,assignee_id=p_assignee_id,follow_up_at=p_follow_up_at,outcome=nullif(trim(p_outcome),''),
    reviewed_at=case when p_status<>'new' then coalesce(reviewed_at,now()) else reviewed_at end,
    overdue=case when p_status<>'new' then false else overdue end,
    escalated_at=case when p_status='escalated' then coalesce(escalated_at,now()) else escalated_at end
    where id=p_case_id;
  if p_status='escalated' and g.status<>'escalated' then
    update students set status='support',updated_at=now() where id=g.student_id and status<>'archived';
    perform queue_case_email(p_case_id,'management_escalation');
  end if;
end $$;
create function public.add_guidance_note(p_case_id uuid,p_body text,p_kind text,p_shared boolean) returns uuid language plpgsql security definer set search_path=public,pg_temp as $$
declare g guidance_cases; result uuid;
begin
  select * into strict g from guidance_cases where id=p_case_id;
  if not can_manage_case(p_case_id) and not (has_role(array['teacher']) and can_read_case(p_case_id) and p_shared and p_kind in ('note','teacher_meeting','action')) then raise exception 'Access denied' using errcode='42501'; end if;
  if not p_shared and not has_role(array['administrator','academic_manager']) and g.assignee_id is distinct from auth.uid() then raise exception 'Claim the case before adding private notes'; end if;
  if length(trim(p_body))<3 then raise exception 'Note cannot be blank'; end if;
  if g.status='resolved' then raise exception 'Resolved cases cannot receive new notes'; end if;
  insert into guidance_notes(case_id,author_id,body,kind,shared) values(p_case_id,auth.uid(),trim(p_body),p_kind,p_shared) returning id into result;
  if p_shared then insert into parent_guidance(id,student_id,case_id,kind,body) values(result,g.student_id,p_case_id,p_kind,trim(p_body)); end if;
  return result;
end $$;
create function public.record_guidance_outcome(p_case_id uuid,p_no_improvement boolean,p_outcome text) returns void language plpgsql security definer set search_path=public,pg_temp as $$
begin
  if not can_manage_case(p_case_id) then raise exception 'Access denied' using errcode='42501'; end if;
  if length(trim(p_outcome))<3 then raise exception 'Record the review finding'; end if;
  perform add_guidance_note(p_case_id,p_outcome,'review',false);
  update guidance_cases set no_improvement=p_no_improvement,outcome=p_outcome where id=p_case_id;
end $$;

create function public.require_service() returns void language plpgsql stable security definer set search_path=public,pg_temp as $$
begin if coalesce(auth.role(),'')<>'service_role' then raise exception 'Service credentials required' using errcode='42501'; end if; end $$;
create function public.find_invited_user_by_email(p_email text) returns uuid language plpgsql stable security definer set search_path=public,pg_temp as $$
declare result uuid;
begin perform require_service(); select id into result from auth.users where lower(email)=lower(trim(p_email)) limit 1; return result; end $$;
create function public.provision_invited_user(p_user_id uuid,p_email text,p_full_name text,p_roles text[],p_language text default 'en',p_student_ids uuid[] default '{}',p_requested_by uuid default null) returns void language plpgsql security definer set search_path=public,pg_temp as $$
declare student uuid;
begin
  perform require_service();
  if not exists(select 1 from profiles where id=p_requested_by and active and 'administrator'=any(roles)) then raise exception 'An active administrator must request invitations' using errcode='42501'; end if;
  if not exists(select 1 from auth.users where id=p_user_id and lower(email)=lower(trim(p_email))) then raise exception 'Invitation email does not match the authenticated account'; end if;
  if array_length(p_roles,1) is null or not (p_roles <@ array['administrator','academic_manager','teacher','guidance','parent']) then raise exception 'Invalid roles'; end if;
  if array_length(p_student_ids,1)>0 and not ('parent'=any(p_roles)) then raise exception 'Student links require the parent role'; end if;
  foreach student in array p_student_ids loop if not exists(select 1 from students where id=student) then raise exception 'Student not found'; end if; end loop;
  insert into profiles(id,email,full_name,roles,language) values(p_user_id,lower(trim(p_email)),trim(p_full_name),p_roles,p_language)
  on conflict(id) do update set email=excluded.email,full_name=case when excluded.full_name<>'' then excluded.full_name else profiles.full_name end,
    roles=array(select distinct x from unnest(profiles.roles||excluded.roles) x),language=excluded.language,active=true;
  foreach student in array p_student_ids loop insert into guardians(student_id,profile_id) values(student,p_user_id) on conflict do nothing; end loop;
  insert into audit_log(actor_id,action,entity_type,entity_id,details) values(p_requested_by,'invite','profiles',p_user_id::text,jsonb_build_object('roles',p_roles,'student_ids',p_student_ids));
end $$;

create function public.advance_guidance_deadlines() returns jsonb language plpgsql security definer set search_path=public,pg_temp as $$
declare g guidance_cases; overdue_count integer:=0; escalated_count integer:=0; cfg configurations; rule jsonb; ctx jsonb; still_failing boolean; escalation_hours integer; escalation_days integer;
begin
  perform require_service();
  select * into cfg from configurations where kind='triggers' and status='published' order by version desc limit 1;
  escalation_hours:=coalesce((cfg.body->>'escalation_hours')::integer,72); escalation_days:=coalesce((cfg.body->>'orange_escalation_days')::integer,14);
  update guidance_cases set overdue=true where status='new' and reviewed_at is null and review_due_at<=now() and not overdue;
  get diagnostics overdue_count=row_count;
  for g in select * from guidance_cases where status='new' and reviewed_at is null and created_at+make_interval(hours=>escalation_hours)<=now() and escalated_at is null for update skip locked loop
    update guidance_cases set escalated_at=now() where id=g.id;
    perform queue_case_email(g.id,'management_escalation'); escalated_count:=escalated_count+1;
  end loop;
  for g in select * from guidance_cases where severity='orange' and status not in ('resolved','escalated') and created_at+make_interval(days=>escalation_days)<=now() for update skip locked loop
    still_failing:=false;
    if g.source='manual' then still_failing:=g.no_improvement;
    else
      select value into rule from jsonb_array_elements(coalesce(cfg.body->'rules','[]')) where value->>'id'=g.issue_key and coalesce((value->>'enabled')::boolean,true);
      if rule is not null then
        -- Weekly rules are reevaluated from current observations. Period rules
        -- need a fresh submitted finding after the fourteen-day review date.
        ctx:=case when g.last_detected_at>=g.created_at+make_interval(days=>escalation_days) then coalesce(g.evidence->'context','{}') else '{}'::jsonb end;
        still_failing:=trigger_condition_matches(rule->'condition',g.student_id,g.class_id,ctx);
      end if;
    end if;
    if still_failing then
      update guidance_cases set severity='red',status='escalated',escalated_at=coalesce(escalated_at,now()) where id=g.id;
      update students set status='support',updated_at=now() where id=g.student_id and status<>'archived';
      perform queue_case_email(g.id,'urgent'); perform queue_case_email(g.id,'management_escalation'); escalated_count:=escalated_count+1;
    end if;
  end loop;
  return jsonb_build_object('overdue',overdue_count,'escalated',escalated_count);
end $$;
create function public.claim_notifications(p_limit integer default 25) returns jsonb language plpgsql security definer set search_path=public,pg_temp as $$
declare result jsonb;
begin
  perform require_service();
  -- Stale claims are retryable within the provider's idempotency window only.
  update notification_outbox set status='failed',last_error=coalesce(last_error,'Delivery requires administrator review: retry window exhausted') where status in ('pending','processing') and (attempts>=8 or (attempts>0 and created_at<now()-interval '23 hours'));
  with candidates as (
    select id from notification_outbox where (status='pending' and next_attempt_at<=now()) or (status='processing' and locked_at<now()-interval '5 minutes')
    order by created_at for update skip locked limit least(greatest(p_limit,1),25)
  ), claimed as (
    update notification_outbox o set status='processing',attempts=o.attempts+1,locked_at=now()
    from candidates c where o.id=c.id returning o.id,o.recipient_email,o.recipient_language,o.event,o.case_id,o.attempts
  ) select coalesce(jsonb_agg(to_jsonb(claimed)),'[]') into result from claimed;
  return result;
end $$;
create function public.finish_notification(p_id uuid,p_success boolean,p_error text default null) returns void language plpgsql security definer set search_path=public,pg_temp as $$
begin
  perform require_service();
  update notification_outbox set status=case when p_success then 'sent' when attempts>=8 or created_at<now()-interval '23 hours' then 'failed' else 'pending' end,
    sent_at=case when p_success then now() else null end,last_error=case when p_success then null else left(p_error,500) end,
    next_attempt_at=now()+make_interval(secs=>least(3600,30*power(2,attempts)::integer)),locked_at=null
    where id=p_id and status='processing';
end $$;

create function public.allocate_payment(p_payment_id uuid,p_allocations jsonb) returns void language plpgsql security definer set search_path=public,pg_temp as $$
declare p payments; c charges; item jsonb; amount_to_allocate numeric; allocated numeric; used numeric;
begin
  perform require_role(array['administrator']);
  select * into strict p from payments where id=p_payment_id for update;
  if p.voided_at is not null or jsonb_typeof(p_allocations)<>'array' then raise exception 'Active payment and allocations array required'; end if;
  perform pg_advisory_xact_lock(hashtext('finance:'||p.student_id::text));
  select coalesce(sum(amount),0) into allocated from allocations where payment_id=p.id;
  for item in select * from jsonb_array_elements(p_allocations) loop
    select * into strict c from charges where id=(item->>'charge_id')::uuid for update;
    amount_to_allocate:=(item->>'amount')::numeric;
    if c.student_id<>p.student_id or c.currency<>p.currency or c.voided_at is not null then raise exception 'Allocation must match student and currency'; end if;
    if amount_to_allocate<=0 or amount_to_allocate<>round(amount_to_allocate,2) then raise exception 'Invalid allocation amount'; end if;
    select coalesce(sum(a.amount),0) into used from allocations a join payments pay on pay.id=a.payment_id where a.charge_id=c.id and pay.voided_at is null;
    if used+amount_to_allocate>c.amount or allocated+amount_to_allocate>p.amount then raise exception 'Allocation exceeds remaining charge or available payment'; end if;
    insert into allocations(payment_id,charge_id,amount) values(p.id,c.id,amount_to_allocate) on conflict(payment_id,charge_id) do update set amount=allocations.amount+excluded.amount;
    allocated:=allocated+amount_to_allocate;
  end loop;
end $$;

-- Restrict raw academic rows to the teacher's own classes. Case queue metadata
-- remains shared with guidance, but private notes are visible to case owners only.
drop policy attendance_read on public.attendance;
create policy attendance_read on public.attendance for select to authenticated using(has_role(array['administrator','academic_manager','guidance']) or exists(select 1 from sessions s where s.id=session_id and can_manage_class(s.class_id)));
drop policy assessment_read on public.assessments;
create policy assessment_read on public.assessments for select to authenticated using(has_role(array['administrator','academic_manager','guidance']) or can_manage_class(class_id));
create or replace function public.can_read_case(p_case_id uuid) returns boolean language sql stable security definer set search_path=public,pg_temp as $$
  select has_role(array['administrator','academic_manager','guidance']) or exists(select 1 from guidance_cases where id=p_case_id and has_role(array['teacher']) and (created_by=auth.uid() or (class_id is not null and can_manage_class(class_id))))
$$;
drop policy guidance_read on public.guidance_cases;
create policy guidance_read on public.guidance_cases for select to authenticated using(can_read_case(id));
drop policy note_read on public.guidance_notes;
create policy note_read on public.guidance_notes for select to authenticated using(has_role(array['administrator','academic_manager']) or (has_role(array['guidance']) and exists(select 1 from guidance_cases where id=case_id and assignee_id=auth.uid())) or (shared and can_read_case(case_id)));

-- Validation for safe direct CRUD operations.
create function public.validate_class() returns trigger language plpgsql security definer set search_path=public,pg_temp as $$
begin
  if not exists(select 1 from profiles where id=new.teacher_id and active and 'teacher'=any(roles)) then raise exception 'Class teacher must be an active teacher account'; end if;
  return new;
end $$;
create trigger validate_class before insert or update on public.classes for each row execute function public.validate_class();
create function public.validate_period() returns trigger language plpgsql set search_path=public,pg_temp as $$
declare y academic_years;
begin
  select * into strict y from academic_years where id=new.academic_year_id;
  if new.starts_on is not null then
    if new.starts_on<y.starts_on or new.ends_on>y.ends_on then raise exception 'Period dates must fall within the academic year'; end if;
    if exists(select 1 from periods p where p.academic_year_id=new.academic_year_id and p.id<>new.id and p.starts_on is not null and daterange(p.starts_on,p.ends_on,'[]') && daterange(new.starts_on,new.ends_on,'[]')) then raise exception 'Reporting periods cannot overlap'; end if;
  end if;
  return new;
end $$;
create trigger validate_period before insert or update on public.periods for each row execute function public.validate_period();
create function public.validate_student() returns trigger language plpgsql set search_path=public,pg_temp as $$
begin
  if new.dob>current_date or trim(new.parent_name)='' or trim(new.parent_phone)='' or new.parent_email !~ '^[^@\s]+@[^@\s]+\.[^@\s]+$' then raise exception 'Valid date of birth and parent contact details required'; end if;
  new.updated_at:=now(); return new;
end $$;
create trigger validate_student before insert or update on public.students for each row execute function public.validate_student();
create function public.validate_enrollment() returns trigger language plpgsql set search_path=public,pg_temp as $$
begin
  if exists(select 1 from enrollments e where e.id<>new.id and e.student_id=new.student_id and e.class_id=new.class_id and daterange(e.started_on,e.ended_on,'[]') && daterange(new.started_on,new.ended_on,'[]')) then raise exception 'Enrollment dates overlap existing enrollment'; end if;
  if tg_op='UPDATE' and (old.student_id<>new.student_id or old.class_id<>new.class_id or old.started_on<>new.started_on) then raise exception 'Preserve enrollment history: end the enrollment and create a new one'; end if;
  return new;
end $$;
create trigger validate_enrollment before insert or update on public.enrollments for each row execute function public.validate_enrollment();
create function public.validate_school_settings() returns trigger language plpgsql set search_path=public,pg_temp as $$
begin
  if not exists(select 1 from pg_timezone_names where name=new.timezone) then raise exception 'Choose a valid IANA timezone'; end if;
  new.updated_at:=now(); return new;
end $$;
create trigger validate_school_settings before insert or update on public.school_settings for each row execute function public.validate_school_settings();

alter table public.packages alter column currency set default 'EUR';
alter table public.students alter column currency set default 'EUR';

-- Close the default PostgreSQL PUBLIC function-execution privilege. Only these
-- entry points are callable from authenticated browsers; internal helpers are not.
revoke all on all functions in schema public from public,anon,authenticated;
grant execute on function public.has_role(text[]),public.is_guardian(uuid),public.can_manage_class(uuid),public.can_read_student(uuid),public.can_read_academic(uuid),public.can_read_class(uuid),public.can_read_case(uuid),public.can_manage_case(uuid) to authenticated;
grant execute on function public.register_student(jsonb),public.link_guardian(uuid,uuid),public.parent_attendance(uuid),public.save_configuration(uuid,text,text,jsonb),public.publish_configuration(uuid),public.save_attendance(uuid,jsonb),public.save_assessment(jsonb),public.preview_report(uuid,uuid,uuid),public.generate_report(uuid,uuid,uuid),public.submit_report(uuid),public.publish_report(uuid),public.preview_monthly_dues(date),public.generate_monthly_dues(date),public.create_charge(uuid,numeric,text,date,text),public.record_payment(uuid,numeric,text,date,text,jsonb),public.void_payment(uuid,text),public.void_charge(uuid,text),public.family_balances(),public.refer_guidance(uuid,uuid,text,text),public.update_guidance(uuid,text,uuid,timestamptz,text),public.add_guidance_note(uuid,text,text,boolean),public.record_guidance_outcome(uuid,boolean,text),public.allocate_payment(uuid,jsonb) to authenticated;
grant execute on function public.find_invited_user_by_email(text),public.provision_invited_user(uuid,text,text,text[],text,uuid[],uuid),public.advance_guidance_deadlines(),public.claim_notifications(integer),public.finish_notification(uuid,boolean,text) to service_role;
grant all on all tables in schema public to service_role;
grant usage,select on all sequences in schema public to service_role;
