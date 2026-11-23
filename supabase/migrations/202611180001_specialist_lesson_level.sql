-- The specialist lesson (subject B1) has its own level per class: the Specialist level codes
-- (C1, C2, C3, T1, T2, T3; levels.kind = 'specialist'), not the class level (başlangıç, orta…).
-- 1. A new specialist lesson no longer copies the class level.
-- 2. The class editor can set the specialist lesson's level together with the class.
-- 3. specialist lessons that copied a class level earlier are cleared, to be chosen again.
-- 4. validate_class rejects a non-Specialist level on the specialist lesson.
-- 5. Material access by level follows the same lesson-level rule as the portal.

-- 1 ---------------------------------------------------------------------------------------
create or replace function public.set_class_group_subjects(p_group_id uuid, p_subject_ids uuid[]) returns integer
language plpgsql security definer set search_path=public,pg_temp as $$
declare g class_groups; s subjects; created integer := 0;
begin
  perform require_role(array['administrator','academic_manager']);
  select * into g from class_groups where id = p_group_id for update;
  if not found then raise exception 'Class not found'; end if;
  p_subject_ids := coalesce(p_subject_ids, '{}');
  for s in select * from subjects where id = any(p_subject_ids) loop
    if exists (select 1 from classes where group_id = g.id and subject_id = s.id) then
      update classes set active = true where group_id = g.id and subject_id = s.id and not active;
    else
      insert into classes(name, academic_year_id, subject_id, level_id, teacher_id, language, active, group_id)
      values (g.name || ' - ' || s.name_tr, g.academic_year_id, s.id,
              case when s.code = 'B1' then null else g.level_id end, null,
              coalesce(g.language, 'tr'), true, g.id);
      created := created + 1;
    end if;
  end loop;
  -- Subjects taken off the class: the lesson is kept (with its history) but made inactive.
  update classes set active = false
  where group_id = g.id and active and not (subject_id = any(p_subject_ids));
  return created;
end $$;
revoke all on function public.set_class_group_subjects(uuid, uuid[]) from public, anon;
grant execute on function public.set_class_group_subjects(uuid, uuid[]) to authenticated;

-- 2 ---------------------------------------------------------------------------------------
-- Reference record and its memberships commit together. Only these two
-- whitelisted entities are accepted; the function is not a generic privileged API.
-- For a class, p_values may carry specialist_level_id ('' clears it) for its specialist lesson.
create or replace function public.save_school_reference(p_table text,p_values jsonb,p_subject_ids uuid[],p_group_ids uuid[] default '{}',p_level_ids uuid[] default '{}') returns uuid
language plpgsql security definer set search_path=public,pg_temp as $$
declare key uuid:=coalesce(nullif(p_values->>'id','')::uuid,gen_random_uuid());
  specialist_level uuid;
begin
  if p_table='packages' then
    perform require_role(array['administrator']);
    if p_values ? 'id' then
      perform 1 from packages where id=key for update;
      if not found then raise exception 'Package not found'; end if;
      update packages set code=p_values->>'code',name_en=p_values->>'name_en',name_tr=p_values->>'name_tr',
        weekly_lessons=(p_values->>'weekly_lessons')::integer,monthly_fee=(p_values->>'monthly_fee')::numeric,
        currency=p_values->>'currency',active=coalesce((p_values->>'active')::boolean,true) where id=key;
    else
      insert into packages(id,code,name_en,name_tr,weekly_lessons,monthly_fee,currency,active)
      values(key,p_values->>'code',p_values->>'name_en',p_values->>'name_tr',(p_values->>'weekly_lessons')::integer,
        (p_values->>'monthly_fee')::numeric,p_values->>'currency',coalesce((p_values->>'active')::boolean,true));
    end if;
    perform set_package_contents(key,p_subject_ids,p_group_ids,p_level_ids);
  elsif p_table='class_groups' then
    perform require_role(array['administrator','academic_manager']);
    specialist_level := nullif(p_values->>'specialist_level_id','')::uuid;
    if specialist_level is not null and not exists (select 1 from levels where id=specialist_level and kind='specialist') then
      raise exception 'Choose a specialist level / Uzmanlık seviyesi seçin';
    end if;
    if p_values ? 'id' then
      perform 1 from class_groups where id=key for update;
      if not found then raise exception 'Class not found'; end if;
      update class_groups set name=p_values->>'name',academic_year_id=(p_values->>'academic_year_id')::uuid,
        language=p_values->>'language',level_id=nullif(p_values->>'level_id','')::uuid,active=coalesce((p_values->>'active')::boolean,true) where id=key;
    else
      insert into class_groups(id,name,academic_year_id,language,level_id,active)
      values(key,p_values->>'name',(p_values->>'academic_year_id')::uuid,p_values->>'language',nullif(p_values->>'level_id','')::uuid,coalesce((p_values->>'active')::boolean,true));
    end if;
    perform set_class_group_subjects(key,p_subject_ids);
    if p_values ? 'specialist_level_id' then
      update classes set level_id=specialist_level
      where group_id=key and subject_id in (select id from subjects where code='B1')
        and level_id is distinct from specialist_level;
    end if;
  else raise exception 'Unsupported school reference'; end if;
  return key;
end $$;
revoke all on function public.save_school_reference(text,jsonb,uuid[],uuid[],uuid[]) from public,anon;
grant execute on function public.save_school_reference(text,jsonb,uuid[],uuid[],uuid[]) to authenticated;

-- 3 ---------------------------------------------------------------------------------------
update public.classes set level_id = null
where subject_id in (select id from public.subjects where code = 'B1')
  and level_id in (select id from public.levels where kind is distinct from 'specialist');

-- 4 ---------------------------------------------------------------------------------------
-- Every write to a lesson: the specialist lesson only takes a Specialist level (after the fix above).
create or replace function public.validate_class() returns trigger language plpgsql security definer set search_path=public,pg_temp as $$
begin
  if new.teacher_id is not null and not exists(select 1 from profiles where id=new.teacher_id and active and 'teacher'=any(roles)) then
    raise exception 'Class teacher must be an active teacher account';
  end if;
  if new.level_id is not null
     and exists(select 1 from subjects where id=new.subject_id and code='B1')
     and not exists(select 1 from levels where id=new.level_id and kind='specialist') then
    raise exception 'Choose a specialist level / Uzmanlık seviyesi seçin';
  end if;
  return new;
end $$;

-- 5 ---------------------------------------------------------------------------------------
-- Material scope by level: a lesson's level is its own level, or its class level when it has
-- none — except the specialist lesson, which never takes the class level (same as the portal's
-- classLevelId). Otherwise unchanged from 202611150001.
create or replace function public.can_manage_material_scope(
  p_class_id uuid, p_subject_id uuid, p_level_id uuid, p_group_id uuid
) returns boolean language sql stable security definer set search_path = public, pg_temp as $$
  select has_role(array['administrator', 'academic_manager'])
    or (p_class_id is not null and can_manage_class(p_class_id))
    or (has_role(array['teacher']) and exists (
      select 1 from classes c
      where c.teacher_id = auth.uid() and c.active and c.subject_id = p_subject_id
        and (p_level_id is null or c.level_id = p_level_id
             or (c.level_id is null
                 and not exists (select 1 from subjects s where s.id = c.subject_id and s.code = 'B1')
                 and exists (select 1 from class_groups g where g.id = c.group_id and g.level_id = p_level_id)))
        and (p_group_id is null or c.group_id = p_group_id)))
$$;
create or replace function public.can_read_material(p_id uuid) returns boolean
language sql stable security definer set search_path = public, pg_temp as $$
  select exists (select 1 from learning_materials m where m.id = p_id and m.status = 'ready' and (
    has_role(array['administrator', 'academic_manager', 'teacher', 'guidance'])
    or (m.visible_to_guardians and exists (
      select 1 from enrollments e
        join classes c on c.id = e.class_id
        join students s on s.id = e.student_id
      where e.ended_on is null and is_guardian(e.student_id)
        and (m.package_id is null or s.package_id = m.package_id)
        and (case when m.class_id is not null then c.id = m.class_id
                  else c.subject_id = m.subject_id
                    and (m.level_id is null or c.level_id = m.level_id
                         or (c.level_id is null
                             and not exists (select 1 from subjects x where x.id = c.subject_id and x.code = 'B1')
                             and exists (select 1 from class_groups g where g.id = c.group_id and g.level_id = m.level_id)))
                    and (m.group_id is null or c.group_id = m.group_id) end)))))
$$;
revoke all on function public.can_manage_material_scope(uuid, uuid, uuid, uuid), public.can_read_material(uuid) from public, anon;
grant execute on function public.can_manage_material_scope(uuid, uuid, uuid, uuid), public.can_read_material(uuid) to authenticated;

notify pgrst,'reload schema';
