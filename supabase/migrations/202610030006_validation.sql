create function public.set_package_subjects(p_package_id uuid,p_subject_ids uuid[]) returns void language plpgsql security definer set search_path=public,pg_temp as $$
begin
  perform require_role(array['administrator']);
  perform 1 from packages where id=p_package_id for update;
  if not found then raise exception 'Package not found'; end if;
  if p_subject_ids is null or array_length(p_subject_ids,1) is null then raise exception 'Select at least one subject'; end if;
  if exists(select 1 from unnest(p_subject_ids) s where not exists(select 1 from subjects where id=s and active)) then raise exception 'Choose active subjects'; end if;
  delete from package_subjects where package_id=p_package_id and not(subject_id=any(p_subject_ids));
  insert into package_subjects(package_id,subject_id) select p_package_id,s from unnest(p_subject_ids) s on conflict do nothing;
end $$;
create function public.validate_curriculum_progress() returns trigger language plpgsql security definer set search_path=public,pg_temp as $$
declare subject_code text;
begin
  select s.code into subject_code from classes c join subjects s on s.id=c.subject_id where c.id=new.class_id;
  if not exists(select 1 from configurations cfg cross join lateral jsonb_array_elements(cfg.body->'questions') q where cfg.id=new.configuration_id and cfg.kind='assessment' and cfg.status='published' and q.value->>'id'=new.criterion_id and q.value->>'subject_code'=subject_code) then raise exception 'Criterion must belong to the class subject in a published configuration'; end if;
  if new.taught and new.taught_on is null then new.taught_on:=current_date; end if;
  if not new.taught then new.taught_on:=null; end if;
  return new;
end $$;
create trigger validate_curriculum_progress before insert or update on public.curriculum_progress for each row execute function public.validate_curriculum_progress();
create function public.protect_last_administrator() returns trigger language plpgsql security definer set search_path=public,pg_temp as $$
begin
  if old.active and 'administrator'=any(old.roles) and (not new.active or not ('administrator'=any(new.roles))) then
    perform pg_advisory_xact_lock(hashtext('active-administrators'));
    if not exists(select 1 from profiles where id<>old.id and active and 'administrator'=any(roles)) then raise exception 'Keep at least one active administrator'; end if;
  end if;
  return new;
end $$;
create trigger protect_last_administrator before update on public.profiles for each row execute function public.protect_last_administrator();
create function public.protect_used_period() returns trigger language plpgsql security definer set search_path=public,pg_temp as $$
begin
  if (new.starts_on,new.ends_on,new.academic_year_id,new.number) is distinct from (old.starts_on,old.ends_on,old.academic_year_id,old.number) and (exists(select 1 from assessments where period_id=old.id) or exists(select 1 from reports where period_id=old.id)) then raise exception 'Dates of a period with assessments or reports cannot change'; end if;
  return new;
end $$;
create trigger protect_used_period before update on public.periods for each row execute function public.protect_used_period();
create function public.parent_schedule() returns jsonb language plpgsql stable security definer set search_path=public,pg_temp as $$
begin
  perform require_role(array['parent']);
  return coalesce((select jsonb_agg(jsonb_build_object('student_id',e.student_id,'class_id',c.id,'class_name',c.name,'teacher_name',p.full_name,'subject_en',su.name_en,'subject_tr',su.name_tr,'weekday',c.weekday,'start_time',c.start_time,'zoom_url',c.zoom_url,'language',c.language) order by c.weekday,c.start_time)
    from enrollments e join classes c on c.id=e.class_id join profiles p on p.id=c.teacher_id join subjects su on su.id=c.subject_id where e.ended_on is null and c.active and is_guardian(e.student_id)),'[]');
end $$;

-- The single student directory masks individual negotiated fees for staff who
-- have academic access only. Direct table column privileges close the API bypass.
create view public.student_directory with (security_barrier=true) as
select id,first_name,last_name,dob,language,parent_name,parent_email,parent_phone,student_phone,registered_at,status,package_id,
  case when has_role(array['administrator']) or is_guardian(id) then monthly_fee else null end as monthly_fee,
  currency,created_by,updated_at
from public.students where public.can_read_student(id);
revoke select on public.students from authenticated;
grant select(id,first_name,last_name,dob,language,parent_name,parent_email,parent_phone,student_phone,registered_at,status,package_id,currency,created_by,updated_at) on public.students to authenticated;
grant select on public.student_directory to authenticated;

create function public.protect_student_fee() returns trigger language plpgsql security definer set search_path=public,pg_temp as $$
begin
  if auth.role()='authenticated' and not has_role(array['administrator']) and
    ((tg_op='INSERT' and new.monthly_fee is not null) or (tg_op='UPDATE' and (new.monthly_fee,new.currency) is distinct from (old.monthly_fee,old.currency))) then raise exception 'Only administrators may change individual fees'; end if;
  return new;
end $$;
create trigger protect_student_fee before insert or update on public.students for each row execute function public.protect_student_fee();

drop policy profiles_read on public.profiles;
create policy profiles_read on public.profiles for select to authenticated using(
  id=auth.uid() or has_role(array['administrator','academic_manager']) or
  (has_role(array['teacher','guidance']) and roles && array['administrator','academic_manager','teacher','guidance'])
);

-- Helpers execute with owner privileges; callers cannot add shadow objects to
-- their fixed public search path or invoke private RPC helpers anonymously.
revoke create on schema public from public,anon,authenticated;
-- Verify all shipped versions during migration so malformed configuration fails
-- installation instead of failing during the first teacher submission.
do $$ declare cfg configurations; begin
  for cfg in select * from configurations where status='published' loop perform validate_configuration(cfg.kind,cfg.body); end loop;
end $$;

revoke all on function public.set_package_subjects(uuid,uuid[]),public.validate_curriculum_progress(),public.protect_last_administrator(),public.protect_used_period(),public.parent_schedule(),public.protect_student_fee() from public,anon,authenticated;
grant execute on function public.set_package_subjects(uuid,uuid[]),public.parent_schedule() to authenticated;
