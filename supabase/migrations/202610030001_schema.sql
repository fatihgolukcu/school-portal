-- Operational records are relational. Only immutable configuration and answer
-- structures use JSON. All privileged operations use a fixed search_path.
create extension if not exists pgcrypto with schema extensions;

create table public.profiles (
  id uuid primary key references auth.users(id) on delete restrict,
  full_name text not null default '', email text not null,
  phone text, languages text[] not null default '{en}',
  roles text[] not null default '{}', language text not null default 'en' check (language in ('en','tr')),
  active boolean not null default true, created_at timestamptz not null default now(),
  check (roles <@ array['administrator','academic_manager','teacher','guidance','parent']::text[])
);
create table public.school_settings (
  id boolean primary key default true check (id), name text not null default 'School Portal',
  timezone text not null default 'Europe/London', default_language text not null default 'en' check(default_language in ('en','tr')),
  updated_at timestamptz not null default now()
);
create table public.academic_years (
  id uuid primary key default gen_random_uuid(), name text not null unique,
  starts_on date not null, ends_on date not null, active boolean not null default true,
  check (ends_on > starts_on)
);
create table public.periods (
  id uuid primary key default gen_random_uuid(), academic_year_id uuid not null references public.academic_years,
  number integer not null check(number between 1 and 4), name_en text not null, name_tr text not null,
  starts_on date, ends_on date,
  unique(academic_year_id, number), check ((starts_on is null and ends_on is null) or (starts_on is not null and ends_on >= starts_on))
);
create table public.subjects (
  id uuid primary key default gen_random_uuid(), code text not null unique,
  name_en text not null, name_tr text not null, active boolean not null default true
);
create table public.levels (
  id uuid primary key default gen_random_uuid(), code text not null unique,
  name_en text not null, name_tr text not null, kind text not null default 'specialist', active boolean not null default true
);
create table public.packages (
  id uuid primary key default gen_random_uuid(), code text not null unique,
  name_en text not null, name_tr text not null, weekly_lessons integer check(weekly_lessons > 0),
  monthly_fee numeric(12,2) check(monthly_fee >= 0), currency text not null default 'GBP' check(currency ~ '^[A-Z]{3}$'),
  active boolean not null default true
);
create table public.package_subjects (
  package_id uuid not null references public.packages, subject_id uuid not null references public.subjects,
  primary key(package_id, subject_id)
);
create table public.dimensions (
  id uuid primary key default gen_random_uuid(), category text not null, code text not null,
  name_en text not null, name_tr text not null, active boolean not null default true,
  unique(category,code)
);
create table public.students (
  id uuid primary key default gen_random_uuid(), first_name text not null check(length(trim(first_name)) > 0),
  last_name text not null check(length(trim(last_name)) > 0), dob date not null,
  language text not null default 'en' check(language in ('en','tr')),
  parent_name text not null, parent_email text not null, parent_phone text not null, student_phone text,
  registered_at timestamptz not null default now(), status text not null default 'active' check(status in ('active','archived','support')),
  package_id uuid references public.packages, monthly_fee numeric(12,2) check(monthly_fee >= 0),
  currency text not null default 'GBP' check(currency ~ '^[A-Z]{3}$'), created_by uuid references public.profiles,
  updated_at timestamptz not null default now()
);
create table public.guardians (
  student_id uuid not null references public.students, profile_id uuid not null references public.profiles,
  relationship text not null default 'parent', primary key(student_id,profile_id)
);
create table public.placements (
  id uuid primary key default gen_random_uuid(), student_id uuid not null references public.students,
  assessed_on date not null default current_date, assessor_id uuid not null default auth.uid() references public.profiles,
  specialist_level_id uuid references public.levels, knowledge_level_id uuid references public.levels, notes text,
  created_at timestamptz not null default now()
);
create table public.classes (
  id uuid primary key default gen_random_uuid(), name text not null,
  academic_year_id uuid not null references public.academic_years,
  subject_id uuid not null references public.subjects, level_id uuid references public.levels,
  teacher_id uuid not null references public.profiles, language text not null check(language in ('en','tr')),
  weekday integer check(weekday between 0 and 6), start_time time,
  zoom_url text check(zoom_url is null or zoom_url ~ '^https://'), active boolean not null default true
);
create table public.enrollments (
  id uuid primary key default gen_random_uuid(), student_id uuid not null references public.students,
  class_id uuid not null references public.classes, started_on date not null default current_date, ended_on date,
  check(ended_on is null or ended_on >= started_on)
);
create unique index one_active_enrollment on public.enrollments(student_id,class_id) where ended_on is null;
create table public.sessions (
  id uuid primary key default gen_random_uuid(), class_id uuid not null references public.classes,
  starts_at timestamptz not null, duration_minutes integer not null default 30 check(duration_minutes between 5 and 180),
  status text not null default 'scheduled' check(status in ('scheduled','completed','cancelled')),
  unique(class_id,starts_at)
);
create table public.configurations (
  id uuid primary key default gen_random_uuid(), kind text not null check(kind in ('assessment','grading','triggers')),
  version integer not null check(version > 0), name text not null,
  status text not null default 'draft' check(status in ('draft','published')),
  body jsonb not null check(jsonb_typeof(body)='object'), created_by uuid references public.profiles,
  created_at timestamptz not null default now(), published_at timestamptz,
  unique(kind,version)
);
create table public.curriculum_progress (
  class_id uuid not null references public.classes, configuration_id uuid not null references public.configurations,
  criterion_id text not null, taught boolean not null default false, taught_on date,
  primary key(class_id,configuration_id,criterion_id)
);
create table public.attendance (
  id uuid primary key default gen_random_uuid(), session_id uuid not null references public.sessions,
  student_id uuid not null references public.students,
  status text not null check(status in ('present','late','absent')),
  late_minutes integer not null default 0 check(late_minutes >= 0),
  excused boolean not null default false, excuse_reason text,
  camera_issue boolean not null default false, microphone_issue boolean not null default false,
  participation numeric(3,2) check(participation between 1 and 5),
  engagement numeric(3,2) check(engagement between 1 and 5),
  behaviour jsonb not null default '{}', effort numeric(3,2) check(effort between 1 and 5),
  recorded_by uuid not null references public.profiles, updated_at timestamptz not null default now(),
  unique(session_id,student_id), check(not excused or length(trim(excuse_reason))>0)
);
create table public.assessments (
  id uuid primary key default gen_random_uuid(), student_id uuid not null references public.students,
  class_id uuid not null references public.classes, period_id uuid not null references public.periods,
  teacher_id uuid not null references public.profiles, configuration_id uuid not null references public.configurations,
  answers jsonb not null default '{}' check(jsonb_typeof(answers)='object'),
  strengths text not null default '', development_areas text not null default '', parent_advice text not null default '',
  excused boolean not null default false, excuse_reason text,
  status text not null default 'draft' check(status in ('draft','submitted')),
  submitted_at timestamptz, updated_at timestamptz not null default now(),
  unique(student_id,class_id,period_id,teacher_id), check(not excused or length(trim(excuse_reason))>0)
);
create table public.reports (
  id uuid primary key default gen_random_uuid(), student_id uuid not null references public.students,
  period_id uuid not null references public.periods, grading_configuration_id uuid not null references public.configurations,
  revision integer not null check(revision>0), status text not null default 'draft' check(status in ('draft','submitted','published')),
  calculation jsonb not null, comments jsonb not null default '{}', generated_by uuid not null references public.profiles,
  generated_at timestamptz not null default now(), submitted_at timestamptz, published_at timestamptz, published_by uuid references public.profiles,
  unique(student_id,period_id,revision)
);
create table public.parent_reports (
  id uuid primary key references public.reports, student_id uuid not null references public.students,
  period_id uuid not null references public.periods, revision integer not null, current boolean not null default true,
  summary jsonb not null, published_at timestamptz not null default now()
);
create unique index one_current_parent_report on public.parent_reports(student_id,period_id) where current;
create table public.guidance_cases (
  id uuid primary key default gen_random_uuid(), student_id uuid not null references public.students,
  class_id uuid references public.classes, issue_key text not null, reason text not null,
  severity text not null check(severity in ('red','orange','yellow')),
  status text not null default 'new' check(status in ('new','under_review','plan_active','follow_up','resolved','escalated')),
  assignee_id uuid references public.profiles, source text not null check(source in ('auto','manual')),
  evidence jsonb not null default '{}', created_by uuid references public.profiles,
  created_at timestamptz not null default now(), last_detected_at timestamptz not null default now(),
  review_due_at timestamptz not null default (now()+interval '48 hours'), reviewed_at timestamptz,
  follow_up_at timestamptz, outcome text, overdue boolean not null default false, escalated_at timestamptz,
  no_improvement boolean not null default false
);
create unique index one_open_guidance_issue on public.guidance_cases(student_id,issue_key,coalesce(class_id,'00000000-0000-0000-0000-000000000000'::uuid)) where status <> 'resolved';
create table public.guidance_notes (
  id uuid primary key default gen_random_uuid(), case_id uuid not null references public.guidance_cases,
  author_id uuid not null references public.profiles, kind text not null check(kind in ('note','teacher_meeting','parent_meeting','action','review')),
  body text not null, shared boolean not null default false, created_at timestamptz not null default now()
);
create table public.parent_guidance (
  id uuid primary key references public.guidance_notes, student_id uuid not null references public.students,
  case_id uuid not null references public.guidance_cases, kind text not null, body text not null, created_at timestamptz not null default now()
);
create table public.charges (
  id uuid primary key default gen_random_uuid(), student_id uuid not null references public.students,
  month date, amount numeric(12,2) not null check(amount>0), currency text not null check(currency ~ '^[A-Z]{3}$'),
  due_on date not null, description text not null default 'Monthly tuition',
  created_by uuid not null references public.profiles, created_at timestamptz not null default now(),
  voided_at timestamptz, void_reason text
);
create unique index one_monthly_charge on public.charges(student_id,month) where month is not null and voided_at is null;
create table public.payments (
  id uuid primary key default gen_random_uuid(), student_id uuid not null references public.students,
  amount numeric(12,2) not null check(amount>0), currency text not null check(currency ~ '^[A-Z]{3}$'),
  paid_on date not null, reference text not null default '',
  recorded_by uuid not null references public.profiles, created_at timestamptz not null default now(),
  voided_at timestamptz, void_reason text
);
create table public.allocations (
  id uuid primary key default gen_random_uuid(), payment_id uuid not null references public.payments,
  charge_id uuid not null references public.charges, amount numeric(12,2) not null check(amount>0),
  unique(payment_id,charge_id)
);
create table public.audit_log (
  id bigint generated always as identity primary key, actor_id uuid, action text not null,
  entity_type text not null, entity_id text not null, details jsonb not null default '{}',
  created_at timestamptz not null default now()
);
create table public.notification_outbox (
  id uuid primary key default gen_random_uuid(), case_id uuid references public.guidance_cases,
  recipient_email text not null, recipient_language text not null, event text not null,
  payload jsonb not null default '{}', status text not null default 'pending' check(status in ('pending','processing','sent','failed')),
  attempts integer not null default 0, next_attempt_at timestamptz not null default now(),
  locked_at timestamptz, last_error text, sent_at timestamptz, created_at timestamptz not null default now(),
  unique(case_id,recipient_email,event)
);

create index guardians_profile_idx on public.guardians(profile_id);
create index classes_teacher_idx on public.classes(teacher_id);
create index enrollment_student_idx on public.enrollments(student_id);
create index session_class_idx on public.sessions(class_id,starts_at);
create index attendance_student_idx on public.attendance(student_id);
create index assessment_student_period_idx on public.assessments(student_id,period_id);
create index guidance_queue_idx on public.guidance_cases(status,severity,review_due_at);

create function public.has_role(p_roles text[]) returns boolean language sql stable security definer set search_path=public,pg_temp as $$
  select exists(select 1 from profiles where id=auth.uid() and active and roles && p_roles)
$$;
create function public.is_guardian(p_student_id uuid) returns boolean language sql stable security definer set search_path=public,pg_temp as $$
  select has_role(array['parent']) and exists(select 1 from guardians where student_id=p_student_id and profile_id=auth.uid())
$$;
create function public.can_manage_class(p_class_id uuid) returns boolean language sql stable security definer set search_path=public,pg_temp as $$
  select has_role(array['administrator','academic_manager']) or
    (has_role(array['teacher']) and exists(select 1 from classes where id=p_class_id and teacher_id=auth.uid()))
$$;
create function public.can_read_student(p_student_id uuid) returns boolean language sql stable security definer set search_path=public,pg_temp as $$
  select has_role(array['administrator','academic_manager','guidance']) or is_guardian(p_student_id) or
    (has_role(array['teacher']) and exists(select 1 from enrollments e join classes c on c.id=e.class_id where e.student_id=p_student_id and c.teacher_id=auth.uid() and e.ended_on is null))
$$;
create function public.can_read_academic(p_student_id uuid) returns boolean language sql stable security definer set search_path=public,pg_temp as $$
  select can_read_student(p_student_id) and has_role(array['administrator','academic_manager','guidance','teacher'])
$$;
create function public.can_read_class(p_class_id uuid) returns boolean language sql stable security definer set search_path=public,pg_temp as $$
  select can_manage_class(p_class_id) or has_role(array['guidance']) or exists(select 1 from enrollments where class_id=p_class_id and ended_on is null and is_guardian(student_id))
$$;
create function public.can_read_case(p_case_id uuid) returns boolean language sql stable security definer set search_path=public,pg_temp as $$
  select exists(select 1 from guidance_cases where id=p_case_id and can_read_academic(student_id))
$$;
create function public.require_role(p_roles text[]) returns void language plpgsql stable security definer set search_path=public,pg_temp as $$
begin if not has_role(p_roles) then raise exception 'Access denied' using errcode='42501'; end if; end $$;
create function public.audit(p_action text,p_entity text,p_id text,p_details jsonb default '{}') returns void language sql security definer set search_path=public,pg_temp as $$
  insert into audit_log(actor_id,action,entity_type,entity_id,details) values(auth.uid(),p_action,p_entity,p_id,p_details)
$$;
create function public.audit_change() returns trigger language plpgsql security definer set search_path=public,pg_temp as $$
begin
  insert into audit_log(actor_id,action,entity_type,entity_id,details)
  values(auth.uid(),lower(tg_op),tg_table_name,coalesce(to_jsonb(new)->>'id',to_jsonb(old)->>'id','relation'),
    jsonb_build_object('before',case when tg_op<>'INSERT' then to_jsonb(old) end,'after',case when tg_op<>'DELETE' then to_jsonb(new) end));
  return coalesce(new,old);
end $$;
create function public.handle_new_user() returns trigger language plpgsql security definer set search_path=public,pg_temp as $$
begin insert into profiles(id,email) values(new.id,coalesce(new.email,'')) on conflict(id) do nothing; return new; end $$;
create trigger on_auth_user_created after insert on auth.users for each row execute function public.handle_new_user();

-- RLS is enabled on every public table; privileged writes are deliberately RPC-only.
do $$ declare t text; begin
  foreach t in array array['profiles','school_settings','academic_years','periods','subjects','levels','packages','package_subjects','dimensions','students','guardians','placements','classes','enrollments','sessions','configurations','curriculum_progress','attendance','assessments','reports','parent_reports','guidance_cases','guidance_notes','parent_guidance','charges','payments','allocations','audit_log','notification_outbox'] loop
    execute format('alter table public.%I enable row level security',t);
  end loop;
  foreach t in array array['school_settings','academic_years','periods','subjects','levels','packages','package_subjects','dimensions'] loop
    execute format('create policy reference_read on public.%I for select to authenticated using (has_role(array[''administrator'',''academic_manager'',''teacher'',''guidance'',''parent'']))',t);
    execute format('create policy reference_write on public.%I for all to authenticated using (has_role(array[''administrator''])) with check (has_role(array[''administrator'']))',t);
    execute format('create trigger record_change after insert or update or delete on public.%I for each row execute function public.audit_change()',t);
  end loop;
  foreach t in array array['students','profiles','guardians','placements','classes','enrollments','sessions','curriculum_progress','attendance','assessments','configurations','reports','guidance_cases','guidance_notes','charges','payments','allocations'] loop
    execute format('create trigger record_change after insert or update or delete on public.%I for each row execute function public.audit_change()',t);
  end loop;
end $$;

create policy profiles_read on public.profiles for select to authenticated using(id=auth.uid() or has_role(array['administrator','academic_manager','guidance','teacher']));
create policy profiles_admin on public.profiles for update to authenticated using(has_role(array['administrator'])) with check(has_role(array['administrator']));
create policy student_read on public.students for select to authenticated using(can_read_student(id));
create policy student_edit on public.students for update to authenticated using(has_role(array['administrator','academic_manager'])) with check(has_role(array['administrator','academic_manager']));
create policy guardian_read on public.guardians for select to authenticated using(profile_id=auth.uid() or can_read_academic(student_id));
create policy placement_read on public.placements for select to authenticated using(can_read_academic(student_id));
create policy placement_write on public.placements for all to authenticated using(has_role(array['administrator','academic_manager'])) with check(has_role(array['administrator','academic_manager']));
create policy classes_read on public.classes for select to authenticated using(can_read_class(id));
create policy classes_write on public.classes for all to authenticated using(has_role(array['administrator','academic_manager'])) with check(has_role(array['administrator','academic_manager']));
create policy enrollment_read on public.enrollments for select to authenticated using(can_read_student(student_id));
create policy enrollment_write on public.enrollments for all to authenticated using(has_role(array['administrator','academic_manager'])) with check(has_role(array['administrator','academic_manager']));
create policy session_read on public.sessions for select to authenticated using(can_read_class(class_id));
create policy session_write on public.sessions for all to authenticated using(can_manage_class(class_id)) with check(can_manage_class(class_id));
create policy config_read on public.configurations for select to authenticated using(has_role(array['administrator','academic_manager','teacher','guidance']));
create policy curriculum_read on public.curriculum_progress for select to authenticated using(can_read_class(class_id));
create policy curriculum_write on public.curriculum_progress for all to authenticated using(can_manage_class(class_id)) with check(can_manage_class(class_id));
create policy attendance_read on public.attendance for select to authenticated using(can_read_academic(student_id));
create policy assessment_read on public.assessments for select to authenticated using(can_read_academic(student_id));
create policy report_read on public.reports for select to authenticated using(can_read_academic(student_id));
create policy parent_report_read on public.parent_reports for select to authenticated using(can_read_academic(student_id) or (current and is_guardian(student_id)));
create policy guidance_read on public.guidance_cases for select to authenticated using(can_read_academic(student_id));
create policy note_read on public.guidance_notes for select to authenticated using(has_role(array['administrator','academic_manager','guidance']) or (shared and can_read_case(case_id)));
create policy shared_guidance_read on public.parent_guidance for select to authenticated using(is_guardian(student_id) or can_read_academic(student_id));
create policy charge_read on public.charges for select to authenticated using(has_role(array['administrator']) or is_guardian(student_id));
create policy payment_read on public.payments for select to authenticated using(has_role(array['administrator']) or is_guardian(student_id));
create policy allocation_read on public.allocations for select to authenticated using(exists(select 1 from payments p where p.id=payment_id and (has_role(array['administrator']) or is_guardian(p.student_id))));
create policy audit_read on public.audit_log for select to authenticated using(has_role(array['administrator']));
create policy outbox_read on public.notification_outbox for select to authenticated using(has_role(array['administrator']));

-- No public write policies exist for calculated/private operational tables.
grant usage on schema public to authenticated;
grant select on all tables in schema public to authenticated;
grant insert,update on public.school_settings,public.academic_years,public.periods,public.subjects,public.levels,public.packages,public.package_subjects,public.dimensions,public.placements,public.classes,public.enrollments,public.sessions,public.curriculum_progress to authenticated;
grant update on public.students,public.profiles to authenticated;
revoke delete on all tables in schema public from authenticated;
revoke all on all functions in schema public from public,anon;
grant execute on function public.has_role(text[]),public.is_guardian(uuid),public.can_manage_class(uuid),public.can_read_student(uuid),public.can_read_academic(uuid),public.can_read_class(uuid),public.can_read_case(uuid) to authenticated;
