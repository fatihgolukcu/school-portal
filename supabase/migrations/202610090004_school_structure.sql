-- School structure, as the school uses it:
--   Sınıf (class_groups)  — e.g. "Sınıf 1"
--   Ders  (classes)       — one class × one subject, with its own teacher
--   Paket (packages)      — contains classes, levels and subjects
-- Also: school time zone Europe/Warsaw and Turkish as the default language.

-- 1. Time zone and language ------------------------------------------------------
update public.school_settings set timezone = 'Europe/Warsaw', default_language = 'tr';
alter table public.school_settings alter column timezone set default 'Europe/Warsaw';
alter table public.school_settings alter column default_language set default 'tr';
alter table public.profiles alter column language set default 'tr';

-- 2. A lesson may exist before a teacher is assigned ---------------------------------
alter table public.classes alter column teacher_id drop not null;
create or replace function public.validate_class() returns trigger language plpgsql security definer set search_path=public,pg_temp as $$
begin
  if new.teacher_id is not null and not exists(select 1 from profiles where id=new.teacher_id and active and 'teacher'=any(roles)) then
    raise exception 'Class teacher must be an active teacher account';
  end if;
  return new;
end $$;
-- One lesson per class and subject.
create unique index classes_group_subject_key on public.classes(group_id, subject_id) where group_id is not null;

-- Curriculum approval only applies when the lesson has a teacher to approve.
create or replace function public.curriculum_needs_teacher() returns trigger
language plpgsql security definer set search_path=public,pg_temp as $$
declare lesson_teacher uuid; desired boolean; current_value boolean; current_on date;
begin
  select teacher_id into lesson_teacher from classes where id = new.class_id;
  if lesson_teacher is not null and auth.uid() is not null and auth.uid() is distinct from lesson_teacher then
    desired := new.taught;
    if tg_op = 'INSERT' then current_value := false; current_on := null;
    else current_value := old.taught; current_on := old.taught_on; end if;
    new.taught := current_value;
    new.taught_on := current_on;
    if desired is distinct from current_value then
      new.pending_taught := desired; new.requested_by := auth.uid(); new.requested_at := now();
    else
      new.pending_taught := null; new.requested_by := null; new.requested_at := null;
    end if;
  else
    new.pending_taught := null; new.requested_by := null; new.requested_at := null;
  end if;
  return new;
end $$;

-- 3. Assigning subjects to a class creates (or re-activates) its lessons --------------
create function public.set_class_group_subjects(p_group_id uuid, p_subject_ids uuid[]) returns integer
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
      values (g.name || ' - ' || s.name_tr, g.academic_year_id, s.id, g.level_id, null,
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

-- 4. Packages contain classes and levels (subjects already exist) --------------------
create table public.package_classes (
  package_id uuid not null references public.packages on delete cascade,
  group_id uuid not null references public.class_groups on delete cascade,
  primary key (package_id, group_id)
);
create table public.package_levels (
  package_id uuid not null references public.packages on delete cascade,
  level_id uuid not null references public.levels on delete cascade,
  primary key (package_id, level_id)
);
do $$ declare t text; begin
  foreach t in array array['package_classes','package_levels'] loop
    execute format('alter table public.%I enable row level security', t);
    execute format('create policy reference_read on public.%I for select to authenticated using (has_role(array[''administrator'',''academic_manager'',''teacher'',''guidance'',''parent'']))', t);
    execute format('create trigger record_change after insert or update or delete on public.%I for each row execute function public.audit_change()', t);
    execute format('grant select on public.%I to authenticated', t);
  end loop;
end $$;

create function public.set_package_contents(p_package_id uuid, p_subject_ids uuid[], p_group_ids uuid[], p_level_ids uuid[])
returns void language plpgsql security definer set search_path=public,pg_temp as $$
begin
  perform require_role(array['administrator']);
  perform 1 from packages where id = p_package_id for update;
  if not found then raise exception 'Package not found'; end if;
  p_subject_ids := coalesce(p_subject_ids, '{}');
  p_group_ids := coalesce(p_group_ids, '{}');
  p_level_ids := coalesce(p_level_ids, '{}');
  delete from package_subjects where package_id = p_package_id and not (subject_id = any(p_subject_ids));
  insert into package_subjects(package_id, subject_id) select p_package_id, x from unnest(p_subject_ids) x on conflict do nothing;
  delete from package_classes where package_id = p_package_id and not (group_id = any(p_group_ids));
  insert into package_classes(package_id, group_id) select p_package_id, x from unnest(p_group_ids) x on conflict do nothing;
  delete from package_levels where package_id = p_package_id and not (level_id = any(p_level_ids));
  insert into package_levels(package_id, level_id) select p_package_id, x from unnest(p_level_ids) x on conflict do nothing;
end $$;
revoke all on function public.set_package_contents(uuid, uuid[], uuid[], uuid[]) from public, anon;
grant execute on function public.set_package_contents(uuid, uuid[], uuid[], uuid[]) to authenticated;

notify pgrst, 'reload schema';
