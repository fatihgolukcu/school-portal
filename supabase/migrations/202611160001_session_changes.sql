-- Changing the day or time of a lesson date that already exists.
--   * sessions.moved_from keeps the original planned time, so re-applying the plan does not
--     create the date again at its old time; a moved date is no longer "planned";
--   * a date that already has attendance cannot be moved (its records belong to that day).

alter table public.sessions add column if not exists moved_from timestamptz;

create or replace function public.protect_session_change() returns trigger
language plpgsql set search_path = public, pg_temp as $$
begin
  if new.starts_at is distinct from old.starts_at then
    if exists (select 1 from attendance a where a.session_id = old.id) then
      raise exception 'This lesson already has attendance; its date cannot change';
    end if;
    if old.planned then
      new.moved_from := coalesce(old.moved_from, old.starts_at);
      new.planned := false;
    end if;
  end if;
  return new;
end $$;
revoke all on function public.protect_session_change() from public, anon, authenticated;
drop trigger if exists protect_session_change on public.sessions;
create trigger protect_session_change before update on public.sessions
  for each row execute function public.protect_session_change();

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
  where not exists (select 1 from sessions x where x.class_id = p_class_id and x.starts_at = w)
    and not exists (select 1 from sessions m where m.class_id = p_class_id and m.moved_from = w);

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
