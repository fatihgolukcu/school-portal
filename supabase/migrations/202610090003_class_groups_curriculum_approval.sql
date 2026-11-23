-- 1. Class groups: one group (e.g. "Sınıf 1") holds several lessons.
-- A row in `classes` stays the teachable unit (one subject, one teacher, one schedule),
-- so enrollments, sessions, attendance, assessments and reports keep working unchanged.
create table public.class_groups (
  id uuid primary key default gen_random_uuid(),
  name text not null check (length(btrim(name)) > 0),
  academic_year_id uuid not null references public.academic_years,
  language text check (language in ('en','tr')),
  level_id uuid references public.levels,
  active boolean not null default true,
  created_at timestamptz not null default now(),
  unique (academic_year_id, name)
);
alter table public.classes add column group_id uuid references public.class_groups;
create index classes_group_idx on public.classes(group_id);

alter table public.class_groups enable row level security;
create policy class_groups_read on public.class_groups for select to authenticated using (
  has_role(array['administrator','academic_manager','guidance'])
  or exists (select 1 from public.classes c where c.group_id = class_groups.id and can_read_class(c.id))
);
create policy class_groups_write on public.class_groups for all to authenticated
  using (has_role(array['administrator','academic_manager']))
  with check (has_role(array['administrator','academic_manager']));
grant select, insert, update on public.class_groups to authenticated;
create trigger record_change after insert or update or delete on public.class_groups
  for each row execute function public.audit_change();

-- Existing classes join a group named after the part before " - "
-- ("Sinif 1 - Bilgi Rotasi" → "Sinif 1"), per academic year.
insert into public.class_groups (name, academic_year_id, language, level_id)
select distinct on (academic_year_id, gname) gname, academic_year_id, language, level_id
from (
  select c.academic_year_id, c.language, c.level_id,
    btrim(case when position(' - ' in c.name) > 0 then split_part(c.name, ' - ', 1) else c.name end) as gname
  from public.classes c
) x
order by academic_year_id, gname;
update public.classes c set group_id = g.id
from public.class_groups g
where g.academic_year_id = c.academic_year_id
  and g.name = btrim(case when position(' - ' in c.name) > 0 then split_part(c.name, ' - ', 1) else c.name end)
  and c.group_id is null;

-- 2. Curriculum changes by anyone other than the lesson's teacher wait for that teacher.
alter table public.curriculum_progress
  add column pending_taught boolean,
  add column requested_by uuid references public.profiles,
  add column requested_at timestamptz;

create function public.curriculum_needs_teacher() returns trigger
language plpgsql security definer set search_path=public,pg_temp as $$
declare lesson_teacher uuid; desired boolean; current_value boolean; current_on date;
begin
  select teacher_id into lesson_teacher from classes where id = new.class_id;
  if auth.uid() is not null and auth.uid() is distinct from lesson_teacher then
    -- Someone else (e.g. management) asked for this value: keep the confirmed value and
    -- record the wish as a request. Asking for the confirmed value withdraws a request.
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
    -- The lesson's teacher decides directly; any open request is settled by this write.
    new.pending_taught := null; new.requested_by := null; new.requested_at := null;
  end if;
  return new;
end $$;
-- Named to run after validate_curriculum_progress (triggers fire in name order).
create trigger zz_curriculum_needs_teacher before insert or update on public.curriculum_progress
  for each row execute function public.curriculum_needs_teacher();
revoke all on function public.curriculum_needs_teacher() from public, anon, authenticated;

notify pgrst, 'reload schema';
