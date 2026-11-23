-- Drafts are private working copies. They never finalize attendance, calculate
-- grades, evaluate referrals or publish/share content.
create table public.work_drafts (
  id uuid primary key default gen_random_uuid(),
  owner_id uuid not null references public.profiles,
  kind text not null check (kind in ('attendance','assessment')),
  context text not null,
  body jsonb not null,
  revision integer not null default 1,
  base_updated_at timestamptz,
  updated_at timestamptz not null default now(),
  unique(owner_id,kind,context)
);
alter table public.work_drafts enable row level security;
-- Direct writes are intentionally unavailable; every command checks assignment.
revoke all on public.work_drafts from anon, authenticated;

create function public.work_context(p_kind text,p_context text) returns timestamptz
language plpgsql security definer set search_path=public,pg_temp as $$
declare c uuid; s public.sessions; student uuid; period uuid; baseline timestamptz; day date;
begin
  perform require_role(array['administrator','academic_manager','teacher']);
  if p_kind='attendance' then
    select * into strict s from sessions where id=p_context::uuid;
    c:=s.class_id;
    select (s.starts_at at time zone timezone)::date into day from school_settings where id;
    if s.status='cancelled' then raise exception 'Cancelled sessions cannot have attendance'; end if;
    if day > (now() at time zone coalesce((select timezone from school_settings where id),'Europe/Warsaw'))::date then
      raise exception 'Future lessons cannot have attendance';
    end if;
    select max(updated_at) into baseline from attendance where session_id=s.id;
  elsif p_kind='assessment' and array_length(string_to_array(p_context,':'),1)=3 then
    c:=split_part(p_context,':',1)::uuid;
    student:=split_part(p_context,':',2)::uuid;
    period:=split_part(p_context,':',3)::uuid;
    if not exists(select 1 from periods p join classes cl on cl.academic_year_id=p.academic_year_id
      where p.id=period and cl.id=c and p.starts_on is not null and p.ends_on is not null
      and exists(select 1 from enrollments e where e.student_id=student and e.class_id=c
        and e.started_on<=p.ends_on and (e.ended_on is null or e.ended_on>=p.starts_on))) then
      raise exception 'Student is not enrolled in this reporting period';
    end if;
    select updated_at into baseline from assessments where class_id=c and student_id=student and period_id=period and teacher_id=auth.uid();
  else raise exception 'Invalid draft context'; end if;
  if not can_manage_class(c) then raise exception 'Access denied' using errcode='42501'; end if;
  return baseline;
end $$;
revoke all on function public.work_context(text,text) from public,anon,authenticated;

create function public.get_work_draft(p_kind text,p_context text) returns jsonb
language plpgsql security definer set search_path=public,pg_temp as $$
declare result jsonb;
begin
  perform work_context(p_kind,p_context);
  select to_jsonb(d) into result from work_drafts d where owner_id=auth.uid() and kind=p_kind and context=p_context;
  return result;
end $$;

create function public.save_work_draft(p_kind text,p_context text,p_body jsonb,p_revision integer) returns jsonb
language plpgsql security definer set search_path=public,pg_temp as $$
declare d work_drafts; baseline timestamptz;
begin
  baseline:=work_context(p_kind,p_context);
  if octet_length(p_body::text)>1048576 or p_body is null then raise exception 'Draft is too large or empty'; end if;
  if (p_kind='attendance' and jsonb_typeof(p_body)<>'array') or (p_kind='assessment' and jsonb_typeof(p_body)<>'object') then raise exception 'Invalid draft body'; end if;
  perform pg_advisory_xact_lock(hashtextextended(auth.uid()::text||p_kind||p_context,0));
  select * into d from work_drafts where owner_id=auth.uid() and kind=p_kind and context=p_context for update;
  if coalesce(d.revision,0) is distinct from p_revision then raise exception 'Draft changed elsewhere. Reload the latest draft before saving.' using errcode='40001'; end if;
  if d.id is not null and d.base_updated_at is distinct from baseline then raise exception 'The submitted record changed. Reload before submitting.' using errcode='40001'; end if;
  insert into work_drafts(owner_id,kind,context,body,revision,base_updated_at)
    values(auth.uid(),p_kind,p_context,p_body,1,baseline)
    on conflict(owner_id,kind,context) do update set body=excluded.body,revision=work_drafts.revision+1,updated_at=now()
    returning * into d;
  return to_jsonb(d);
end $$;

create function public.discard_work_draft(p_kind text,p_context text,p_revision integer) returns void
language plpgsql security definer set search_path=public,pg_temp as $$
declare d work_drafts;
begin
  perform work_context(p_kind,p_context);
  perform pg_advisory_xact_lock(hashtextextended(auth.uid()::text||p_kind||p_context,0));
  select * into d from work_drafts where owner_id=auth.uid() and kind=p_kind and context=p_context for update;
  if d.id is not null and d.revision is distinct from p_revision then raise exception 'Draft changed elsewhere. Reload the latest draft before saving.' using errcode='40001'; end if;
  delete from work_drafts where id=d.id;
end $$;
revoke all on function public.discard_work_draft(text,text,integer) from public,anon;
grant execute on function public.discard_work_draft(text,text,integer) to authenticated;

-- Defense in depth for every attendance write, including the existing final RPC.
create function public.reject_future_attendance() returns trigger
language plpgsql security definer set search_path=public,pg_temp as $$
declare starts timestamptz; status text; tz text:=coalesce((select timezone from school_settings where id),'Europe/Warsaw');
begin
  select starts_at,s.status into starts,status from sessions s where id=new.session_id;
  if status='cancelled' then raise exception 'Cancelled sessions cannot have attendance'; end if;
  if (starts at time zone tz)::date>(now() at time zone tz)::date then raise exception 'Future lessons cannot have attendance'; end if;
  return new;
end $$;
create trigger reject_future_attendance before insert or update on public.attendance for each row execute function public.reject_future_attendance();
revoke all on function public.reject_future_attendance() from public,anon,authenticated;

create function public.finalize_attendance(p_session_id uuid,p_revision integer) returns integer
language plpgsql security definer set search_path=public,pg_temp as $$
declare d work_drafts; baseline timestamptz; result integer;
begin
  perform 1 from sessions where id=p_session_id for update;
  baseline:=work_context('attendance',p_session_id::text);
  select * into d from work_drafts where owner_id=auth.uid() and kind='attendance' and context=p_session_id::text for update;
  if not found then raise exception 'Attendance already submitted. Reload the lesson.' using errcode='40001'; end if;
  if d.revision<>p_revision or d.base_updated_at is distinct from baseline then raise exception 'The attendance changed. Reload before submitting.' using errcode='40001'; end if;
  if jsonb_array_length(d.body)<>(select count(distinct row->>'student_id') from jsonb_array_elements(d.body) row) then raise exception 'Each student must appear once'; end if;
  if exists(select 1 from enrollments e join sessions s on s.class_id=e.class_id where s.id=p_session_id
    and e.started_on<=(s.starts_at at time zone coalesce((select timezone from school_settings where id),'Europe/Warsaw'))::date
    and (e.ended_on is null or e.ended_on>=(s.starts_at at time zone coalesce((select timezone from school_settings where id),'Europe/Warsaw'))::date)
    and not exists(select 1 from jsonb_array_elements(d.body) row where row->>'student_id'=e.student_id::text)) then raise exception 'Record attendance for every enrolled student'; end if;
  result:=save_attendance(p_session_id,d.body);
  delete from work_drafts where id=d.id;
  return result;
end $$;

create function public.finalize_assessment(p_context text,p_revision integer,p_status text) returns uuid
language plpgsql security definer set search_path=public,pg_temp as $$
declare d work_drafts; baseline timestamptz; result uuid;
begin
  if p_status not in ('draft','submitted') or p_status is null then raise exception 'Invalid assessment status'; end if;
  perform 1 from classes where id=split_part(p_context,':',1)::uuid for update;
  perform 1 from assessments where class_id=split_part(p_context,':',1)::uuid
    and student_id=split_part(p_context,':',2)::uuid and period_id=split_part(p_context,':',3)::uuid and teacher_id=auth.uid() for update;
  baseline:=work_context('assessment',p_context);
  select * into d from work_drafts where owner_id=auth.uid() and kind='assessment' and context=p_context for update;
  if not found then raise exception 'Assessment already submitted. Reload the student.' using errcode='40001'; end if;
  if d.revision<>p_revision or d.base_updated_at is distinct from baseline then raise exception 'The assessment changed. Reload before submitting.' using errcode='40001'; end if;
  if d.body->>'class_id' is distinct from split_part(p_context,':',1)
    or d.body->>'student_id' is distinct from split_part(p_context,':',2)
    or d.body->>'period_id' is distinct from split_part(p_context,':',3) then raise exception 'Draft context does not match'; end if;
  result:=save_assessment(d.body||jsonb_build_object('status',p_status));
  delete from work_drafts where id=d.id;
  return result;
end $$;

create function public.save_curriculum_batch(p_class_id uuid,p_configuration_id uuid,p_rows jsonb) returns integer
language plpgsql security definer set search_path=public,pg_temp as $$
declare row jsonb; total integer:=0;
begin
  if not can_manage_class(p_class_id) then raise exception 'Access denied' using errcode='42501'; end if;
  perform 1 from classes where id=p_class_id for update;
  if jsonb_typeof(p_rows)<>'array' or jsonb_array_length(p_rows)>500 then raise exception 'Invalid curriculum batch'; end if;
  for row in select * from jsonb_array_elements(p_rows) loop
    if jsonb_typeof(row->'taught')<>'boolean' then raise exception 'Taught must be true or false'; end if;
    insert into curriculum_progress(class_id,configuration_id,criterion_id,taught)
    values(p_class_id,p_configuration_id,row->>'criterion_id',(row->>'taught')::boolean)
    on conflict(class_id,configuration_id,criterion_id) do update set taught=excluded.taught;
    total:=total+1;
  end loop;
  return total;
end $$;

revoke all on function public.get_work_draft(text,text),public.save_work_draft(text,text,jsonb,integer),public.finalize_attendance(uuid,integer),public.finalize_assessment(text,integer,text),public.save_curriculum_batch(uuid,uuid,jsonb) from public,anon;
grant execute on function public.get_work_draft(text,text),public.save_work_draft(text,text,jsonb,integer),public.finalize_attendance(uuid,integer),public.finalize_assessment(text,integer,text),public.save_curriculum_batch(uuid,uuid,jsonb) to authenticated;
notify pgrst,'reload schema';
