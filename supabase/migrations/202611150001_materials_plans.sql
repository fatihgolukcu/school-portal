-- Subject-wide learning materials, lesson plans (weekly slots, dates, skipped weeks) and
-- outcome weeks.
--
-- Materials
--   * belong to a subject, optionally narrowed to a level and/or a class (class group);
--     older rows keep their lesson (class_id) and get the lesson's subject filled in;
--   * may be a file (PDF, Word, PowerPoint, Excel, image, audio; 25 MB) or an https link
--     (Drive, YouTube, any web page); teachers may add links for subjects they teach;
--   * can be tied to learning outcomes (criterion ids such as B5.1) and a week number;
--   * parents see them only when visible_to_guardians and their child is in a matching lesson.
-- Lesson plans
--   * classes.plan_starts_on / plan_ends_on / plan_skip_weeks and class_slots (one row per
--     weekly meeting) are all optional;
--   * plan_class_sessions previews or applies the lesson dates: future dates are added or
--     removed, past dates and dates with attendance or drafts are never touched.

-- ---------- Materials ----------
alter table public.learning_materials
  add column subject_id uuid references public.subjects,
  add column level_id uuid references public.levels,
  add column group_id uuid references public.class_groups on delete restrict,
  add column visible_to_guardians boolean not null default true,
  add column week_no smallint check (week_no between 1 and 60),
  add column criterion_ids text[] not null default '{}',
  add column link_kind text check (link_kind in ('drive', 'youtube', 'web'));
alter table public.learning_materials alter column class_id drop not null;
update public.learning_materials m set subject_id = c.subject_id
  from public.classes c where c.id = m.class_id and m.subject_id is null;
do $$ declare c record; begin
  for c in select conname from pg_constraint
    where conrelid = 'public.learning_materials'::regclass and contype = 'c'
      and (pg_get_constraintdef(oid) like '%external_url%' or pg_get_constraintdef(oid) like '%file_size%')
  loop
    execute format('alter table public.learning_materials drop constraint %I', c.conname);
  end loop;
end $$;
alter table public.learning_materials
  add constraint learning_materials_target check (class_id is not null or subject_id is not null),
  add constraint learning_materials_source check (
    (object_key is not null and external_url is null)
    or (object_key is null and external_url ~ '^https://[^\s/]+\.[^\s]+$' and length(external_url) <= 2000)),
  add constraint learning_materials_file_size check (file_size between 1 and 26214400);
create index if not exists materials_subject_idx on public.learning_materials(subject_id, status);

-- Who may add or change a material: management, or a teacher who teaches an active lesson
-- of the material's subject within its level/class (or the material's own lesson).
create or replace function public.can_manage_material_scope(
  p_class_id uuid, p_subject_id uuid, p_level_id uuid, p_group_id uuid
) returns boolean language sql stable security definer set search_path = public, pg_temp as $$
  select has_role(array['administrator', 'academic_manager'])
    or (p_class_id is not null and can_manage_class(p_class_id))
    or (has_role(array['teacher']) and exists (
      select 1 from classes c
      where c.teacher_id = auth.uid() and c.active and c.subject_id = p_subject_id
        and (p_level_id is null or c.level_id = p_level_id
             or exists (select 1 from class_groups g where g.id = c.group_id and g.level_id = p_level_id))
        and (p_group_id is null or c.group_id = p_group_id)))
$$;
create or replace function public.can_manage_material(p_id uuid) returns boolean
language sql stable security definer set search_path = public, pg_temp as $$
  select exists (select 1 from learning_materials m where m.id = p_id
    and can_manage_material_scope(m.class_id, m.subject_id, m.level_id, m.group_id))
$$;

-- Staff read every ready material (shared across teachers); parents only visible ones that
-- match a lesson their child is actively enrolled in.
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
                         or exists (select 1 from class_groups g where g.id = c.group_id and g.level_id = m.level_id))
                    and (m.group_id is null or c.group_id = m.group_id) end)))))
$$;

drop policy if exists materials_read on public.learning_materials;
drop policy if exists materials_insert on public.learning_materials;
drop policy if exists materials_update on public.learning_materials;
create policy materials_read on public.learning_materials for select to authenticated
  using (can_read_material(id) or can_manage_material_scope(class_id, subject_id, level_id, group_id));
create policy materials_insert on public.learning_materials for insert to authenticated
  with check (owner_id = auth.uid() and can_manage_material_scope(class_id, subject_id, level_id, group_id));
create policy materials_update on public.learning_materials for update to authenticated
  using (can_manage_material_scope(class_id, subject_id, level_id, group_id))
  with check (can_manage_material_scope(class_id, subject_id, level_id, group_id));

create or replace function public.protect_material_version() returns trigger
language plpgsql set search_path = public, pg_temp as $$
begin
  if tg_op = 'INSERT' then
    if new.object_key is not null and (new.status <> 'uploading' or new.object_key not like auth.uid()::text || '/%') then
      raise exception 'Create an incomplete upload owned by your account';
    end if;
    -- Links have no file to verify, so they are available at once.
    if new.external_url is not null and new.status not in ('ready', 'uploading') then
      raise exception 'Links are added as available';
    end if;
    if new.class_id is not null then
      new.subject_id := (select subject_id from classes where id = new.class_id);
    end if;
    if new.replaces_id is not null and not exists (
      select 1 from learning_materials m where m.id = new.replaces_id and new.version = m.version + 1
        and m.status <> 'archived' and can_manage_material(m.id)
        and m.class_id is not distinct from new.class_id and m.subject_id is not distinct from new.subject_id) then
      raise exception 'Choose the previous version of this material';
    end if;
  elsif not has_role(array['administrator', 'academic_manager'])
    and old.owner_id is distinct from auth.uid()
    and not (old.class_id is not null and can_manage_class(old.class_id)) then
    raise exception 'Only the author or management can change this material';
  elsif new.subject_id is distinct from old.subject_id and old.class_id is not null then
    raise exception 'A lesson material keeps its lesson subject';
  elsif new.object_key is distinct from old.object_key or new.external_url is distinct from old.external_url
    or new.class_id is distinct from old.class_id or new.owner_id is distinct from old.owner_id
    or new.version is distinct from old.version or new.replaces_id is distinct from old.replaces_id
    or new.file_size is distinct from old.file_size or new.file_type is distinct from old.file_type then
    raise exception 'Material versions are immutable. Upload a new version.';
  elsif old.status = 'archived' and new.status <> 'archived' then
    raise exception 'Archived versions cannot be reactivated';
  elsif old.status = 'ready' and new.status = 'uploading' then
    raise exception 'Ready versions cannot return to uploading';
  end if;
  if new.object_key is not null and new.status = 'ready' and (tg_op = 'INSERT' or old.status = 'uploading') and
    not exists (select 1 from storage.objects o where o.bucket_id = 'learning-materials' and o.name = new.object_key
      and (o.metadata->>'size')::bigint = new.file_size) then
    raise exception 'Upload the complete file before making it available';
  end if;
  return new;
end $$;
revoke all on function public.protect_material_version() from public, anon, authenticated;

update storage.buckets set file_size_limit = 26214400, allowed_mime_types = array[
  'application/pdf',
  'application/vnd.openxmlformats-officedocument.wordprocessingml.document',
  'application/vnd.openxmlformats-officedocument.presentationml.presentation',
  'application/vnd.openxmlformats-officedocument.spreadsheetml.sheet',
  'application/msword', 'application/vnd.ms-powerpoint', 'application/vnd.ms-excel',
  'image/jpeg', 'image/png', 'image/webp', 'image/gif',
  'audio/mpeg', 'audio/mp4', 'audio/x-m4a', 'audio/wav', 'audio/x-wav', 'audio/ogg']
where id = 'learning-materials';

drop policy if exists material_object_read on storage.objects;
drop policy if exists material_object_upload on storage.objects;
drop policy if exists material_object_cleanup on storage.objects;
create policy material_object_read on storage.objects for select to authenticated using (bucket_id = 'learning-materials' and exists (
  select 1 from public.learning_materials m where m.object_key = name and (public.can_read_material(m.id) or
    (m.status = 'uploading' and m.owner_id = auth.uid() and public.can_manage_material(m.id)))));
create policy material_object_upload on storage.objects for insert to authenticated with check (bucket_id = 'learning-materials' and exists (
  select 1 from public.learning_materials m where m.object_key = name and m.status = 'uploading'
    and m.owner_id = auth.uid() and public.can_manage_material(m.id)));
create policy material_object_cleanup on storage.objects for delete to authenticated using (bucket_id = 'learning-materials' and exists (
  select 1 from public.learning_materials m where m.object_key = name and m.status = 'uploading'
    and m.owner_id = auth.uid() and public.can_manage_material(m.id)));

revoke all on function public.can_manage_material_scope(uuid, uuid, uuid, uuid), public.can_manage_material(uuid),
  public.can_read_material(uuid) from public, anon;
grant execute on function public.can_manage_material_scope(uuid, uuid, uuid, uuid), public.can_manage_material(uuid),
  public.can_read_material(uuid) to authenticated;

-- ---------- Lesson plans ----------
alter table public.classes
  add column plan_starts_on date,
  add column plan_ends_on date,
  add column plan_skip_weeks integer[] not null default '{}',
  add constraint classes_plan_dates check (plan_ends_on is null or plan_starts_on is null
    or (plan_ends_on >= plan_starts_on and plan_ends_on <= plan_starts_on + 400));
-- Dates created from a plan; hand-added dates (makeup lessons) are never removed by a re-plan.
alter table public.sessions add column planned boolean not null default false;

create table public.class_slots (
  id uuid primary key default gen_random_uuid(),
  class_id uuid not null references public.classes on delete cascade,
  weekday integer not null check (weekday between 0 and 6),
  start_time time not null,
  duration_minutes integer not null default 30 check (duration_minutes between 5 and 180),
  unique (class_id, weekday, start_time)
);
alter table public.class_slots enable row level security;
create policy class_slots_read on public.class_slots for select to authenticated using (can_read_class(class_id));
create policy class_slots_write on public.class_slots for all to authenticated
  using (can_manage_class(class_id)) with check (can_manage_class(class_id));
grant select, insert, update, delete on public.class_slots to authenticated;
grant all on public.class_slots to service_role;
create trigger record_change after insert or update or delete on public.class_slots
  for each row execute function public.audit_change();
-- The single weekly time already stored on a lesson becomes its first slot.
insert into public.class_slots (class_id, weekday, start_time)
select id, weekday, start_time from public.classes
where weekday is not null and start_time is not null
on conflict do nothing;

create table public.curriculum_weeks (
  id uuid not null default gen_random_uuid() unique,
  class_id uuid not null references public.classes on delete cascade,
  criterion_id text not null,
  week_no smallint check (week_no between 1 and 60),
  updated_at timestamptz not null default now(),
  primary key (class_id, criterion_id)
);
alter table public.curriculum_weeks enable row level security;
create policy curriculum_weeks_read on public.curriculum_weeks for select to authenticated using (can_read_class(class_id));
create policy curriculum_weeks_write on public.curriculum_weeks for all to authenticated
  using (can_manage_class(class_id)) with check (can_manage_class(class_id));
grant select, insert, update, delete on public.curriculum_weeks to authenticated;
grant all on public.curriculum_weeks to service_role;
create trigger record_change after insert or update or delete on public.curriculum_weeks
  for each row execute function public.audit_change();

-- Saves a lesson's plan in one step. Teachers may plan their own lessons; lesson records
-- themselves stay management-only. p_slots: [{"weekday":1,"start_time":"10:00","duration_minutes":40}, ...]
create or replace function public.save_class_plan(
  p_class_id uuid, p_starts_on date, p_ends_on date, p_skip_weeks integer[], p_slots jsonb
) returns void language plpgsql security definer set search_path = public, pg_temp as $$
declare slot jsonb;
begin
  if not can_manage_class(p_class_id) then raise exception 'Access denied' using errcode = '42501'; end if;
  if p_ends_on is not null and p_starts_on is not null and p_ends_on < p_starts_on then
    raise exception 'The end date is before the start date';
  end if;
  if p_ends_on is not null and p_starts_on is not null and p_ends_on > p_starts_on + 400 then
    raise exception 'A plan can cover at most about 13 months';
  end if;
  if jsonb_typeof(coalesce(p_slots, '[]'::jsonb)) <> 'array' or jsonb_array_length(coalesce(p_slots, '[]'::jsonb)) > 14 then
    raise exception 'Invalid weekly times';
  end if;
  update classes set plan_starts_on = p_starts_on, plan_ends_on = p_ends_on,
    plan_skip_weeks = coalesce((select array_agg(distinct w order by w) from unnest(p_skip_weeks) w where w between 1 and 60), '{}')
  where id = p_class_id;
  delete from class_slots where class_id = p_class_id;
  for slot in select * from jsonb_array_elements(coalesce(p_slots, '[]'::jsonb)) loop
    insert into class_slots (class_id, weekday, start_time, duration_minutes)
    values (p_class_id, (slot->>'weekday')::integer, (slot->>'start_time')::time,
            coalesce((slot->>'duration_minutes')::integer, 30))
    on conflict (class_id, weekday, start_time) do update set duration_minutes = excluded.duration_minutes;
  end loop;
end $$;
revoke all on function public.save_class_plan(uuid, date, date, integer[], jsonb) from public, anon;
grant execute on function public.save_class_plan(uuid, date, date, integer[], jsonb) to authenticated;

-- Lesson dates from the plan. Week 1 starts on plan_starts_on; the plan ends on
-- plan_ends_on, or else at the end of the lesson's academic year. With p_apply = false it
-- only reports what would change.
create or replace function public.plan_class_sessions(p_class_id uuid, p_apply boolean default false)
returns jsonb language plpgsql security definer set search_path = public, pg_temp as $$
declare
  lesson classes;
  tz text := coalesce((select timezone from school_settings limit 1), 'Europe/Warsaw');
  last_day date;
  wanted timestamptz[];
  to_add timestamptz[];
  to_remove uuid[];
  removable timestamptz[];
  kept integer;
begin
  select * into lesson from classes where id = p_class_id;
  if not found then raise exception 'Lesson not found'; end if;
  if not can_manage_class(p_class_id) then raise exception 'Access denied' using errcode = '42501'; end if;
  perform 1 from classes where id = p_class_id for update;
  if lesson.plan_starts_on is null then
    return jsonb_build_object('to_add', '[]'::jsonb, 'to_remove', '[]'::jsonb, 'kept_past', 0, 'reason', 'no_start');
  end if;
  last_day := least(coalesce(lesson.plan_ends_on, (select ends_on from academic_years where id = lesson.academic_year_id)),
                    lesson.plan_starts_on + 400);
  if last_day is null then
    return jsonb_build_object('to_add', '[]'::jsonb, 'to_remove', '[]'::jsonb, 'kept_past', 0, 'reason', 'no_end');
  end if;

  select coalesce(array_agg(distinct (d::date + s.start_time) at time zone tz order by (d::date + s.start_time) at time zone tz), '{}')
    into wanted
  from generate_series(lesson.plan_starts_on, last_day, interval '1 day') d
  join class_slots s on s.class_id = p_class_id and s.weekday = extract(dow from d)::integer
  where not ((((d::date - lesson.plan_starts_on) / 7) + 1) = any(lesson.plan_skip_weeks))
    and (d::date + s.start_time) at time zone tz > now();

  select coalesce(array_agg(w order by w), '{}') into to_add
  from unnest(wanted) w
  where not exists (select 1 from sessions x where x.class_id = p_class_id and x.starts_at = w);

  -- Future planned dates that the plan no longer contains and that nobody has worked on.
  select coalesce(array_agg(x.id order by x.starts_at), '{}'), coalesce(array_agg(x.starts_at order by x.starts_at), '{}')
    into to_remove, removable
  from sessions x
  where x.class_id = p_class_id and x.status = 'scheduled' and x.planned and x.starts_at > now()
    and not (x.starts_at = any(wanted))
    and not exists (select 1 from attendance a where a.session_id = x.id)
    and not exists (select 1 from work_drafts w where w.kind = 'attendance' and w.context = x.id::text);

  select count(*) into kept from sessions x where x.class_id = p_class_id and x.starts_at <= now();

  if p_apply then
    insert into sessions (class_id, starts_at, duration_minutes, planned)
    select p_class_id, w,
      coalesce((select s.duration_minutes from class_slots s
        where s.class_id = p_class_id and s.weekday = extract(dow from w at time zone tz)::integer
          and s.start_time = (w at time zone tz)::time limit 1), 30), true
    from unnest(to_add) w
    on conflict (class_id, starts_at) do nothing;
    delete from sessions x where x.id = any(to_remove)
      and not exists (select 1 from attendance a where a.session_id = x.id)
      and not exists (select 1 from work_drafts w where w.kind = 'attendance' and w.context = x.id::text);
  end if;

  return jsonb_build_object(
    'to_add', to_jsonb(to_add),
    'to_remove', to_jsonb(removable),
    'kept_past', kept,
    'applied', p_apply);
end $$;
revoke all on function public.plan_class_sessions(uuid, boolean) from public, anon;
grant execute on function public.plan_class_sessions(uuid, boolean) to authenticated;

-- Deleting a class (202611140001) must also keep classes that have materials narrowed to them.
create or replace function public.delete_class_group(p_id uuid) returns void
language plpgsql security definer set search_path = public, pg_temp as $$
declare target class_groups; lessons uuid[];
begin
  perform require_role(array['administrator', 'academic_manager']);
  select * into target from class_groups where id = p_id for update;
  if not found then raise exception 'Class not found'; end if;
  select coalesce(array_agg(id), '{}') into lessons from classes where group_id = p_id;
  if exists (select 1 from enrollments where class_id = any(lessons))
     or exists (select 1 from sessions where class_id = any(lessons))
     or exists (select 1 from assessments where class_id = any(lessons))
     or exists (select 1 from curriculum_progress where class_id = any(lessons))
     or exists (select 1 from guidance_cases where class_id = any(lessons))
     or exists (select 1 from learning_materials where class_id = any(lessons) or group_id = p_id) then
    raise exception 'has_records' using errcode = 'P0001', hint = 'Archive this class instead.';
  end if;
  delete from classes where id = any(lessons);
  delete from class_groups where id = p_id;
  insert into audit_log(actor_id, action, entity_type, entity_id, details)
  values (auth.uid(), 'class_group_deleted', 'class_groups', p_id::text,
          jsonb_build_object('name', target.name, 'lessons', cardinality(lessons)));
end $$;
revoke all on function public.delete_class_group(uuid) from public, anon;
grant execute on function public.delete_class_group(uuid) to authenticated;
