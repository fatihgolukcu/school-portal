-- Roster fields for the school's real student list.
-- Surname and parent email/phone become optional; age-only registrations store an
-- estimated date of birth (1 January of the birth year) flagged by dob_estimated.

alter table public.students alter column last_name drop not null;
alter table public.students drop constraint if exists students_last_name_check;
alter table public.students alter column parent_email drop not null;
alter table public.students alter column parent_phone drop not null;
alter table public.students alter column parent_name drop not null;

alter table public.students
  add column dob_estimated boolean not null default false,
  add column country text,
  add column contact_teacher_id uuid references public.profiles,
  add column registration_type text not null default 'new' check (registration_type in ('new','returning')),
  add column registration_year_id uuid references public.academic_years,
  add column class_level_id uuid references public.levels,
  add column scholarship_percent numeric(5,2) not null default 0 check (scholarship_percent between 0 and 100),
  add column staff_notes text;

-- Contact rules: a guardian name or phone is enough; email is checked only when given.
create or replace function public.validate_student() returns trigger language plpgsql set search_path=public,pg_temp as $$
begin
  if new.dob > current_date then raise exception 'Date of birth cannot be in the future'; end if;
  new.last_name := nullif(trim(coalesce(new.last_name,'')),'');
  new.parent_name := nullif(trim(coalesce(new.parent_name,'')),'');
  new.parent_phone := nullif(trim(coalesce(new.parent_phone,'')),'');
  new.parent_email := nullif(lower(trim(coalesce(new.parent_email,''))),'');
  new.country := nullif(trim(coalesce(new.country,'')),'');
  new.staff_notes := nullif(trim(coalesce(new.staff_notes,'')),'');
  if new.parent_name is null and new.parent_phone is null then
    raise exception 'A parent name or phone number is required';
  end if;
  if new.parent_email is not null and new.parent_email !~ '^[^@\s]+@[^@\s]+\.[^@\s]+$' then
    raise exception 'Parent email is not valid';
  end if;
  new.updated_at := now();
  return new;
end $$;

-- Scholarship changes the fee, so it follows the same administrator-only rule as fees.
create or replace function public.protect_student_fee() returns trigger language plpgsql security definer set search_path=public,pg_temp as $$
begin
  if auth.role()='authenticated' and not has_role(array['administrator']) and
    ((tg_op='INSERT' and (new.monthly_fee is not null or new.scholarship_percent <> 0)) or
     (tg_op='UPDATE' and (new.monthly_fee,new.currency,new.scholarship_percent) is distinct from (old.monthly_fee,old.currency,old.scholarship_percent)))
  then raise exception 'Only administrators may change individual fees or scholarships'; end if;
  return new;
end $$;

drop function public.register_student(jsonb);
create function public.register_student(p_payload jsonb) returns public.students language plpgsql security definer set search_path=public,pg_temp as $$
declare result students; guardian_id text;
begin
  perform require_role(array['administrator','academic_manager']);
  insert into students(first_name,last_name,dob,dob_estimated,language,parent_name,parent_email,parent_phone,student_phone,
    package_id,monthly_fee,currency,registered_at,created_by,country,contact_teacher_id,registration_type,registration_year_id,
    class_level_id,scholarship_percent,staff_notes)
  values(trim(p_payload->>'first_name'),p_payload->>'last_name',(p_payload->>'dob')::date,coalesce((p_payload->>'dob_estimated')::boolean,false),
    coalesce(p_payload->>'language','en'),p_payload->>'parent_name',p_payload->>'parent_email',p_payload->>'parent_phone',
    nullif(p_payload->>'student_phone',''),nullif(p_payload->>'package_id','')::uuid,nullif(p_payload->>'monthly_fee','')::numeric,
    coalesce(p_payload->>'currency','EUR'),coalesce(nullif(p_payload->>'registered_at','')::timestamptz,now()),auth.uid(),
    p_payload->>'country',nullif(p_payload->>'contact_teacher_id','')::uuid,coalesce(nullif(p_payload->>'registration_type',''),'new'),
    nullif(p_payload->>'registration_year_id','')::uuid,nullif(p_payload->>'class_level_id','')::uuid,
    coalesce(nullif(p_payload->>'scholarship_percent','')::numeric,0),p_payload->>'staff_notes')
  returning * into result;
  for guardian_id in select jsonb_array_elements_text(coalesce(p_payload->'guardian_ids','[]')) loop perform link_guardian(result.id,guardian_id::uuid); end loop;
  return result;
end $$;
revoke all on function public.register_student(jsonb) from public, anon;
grant execute on function public.register_student(jsonb) to authenticated;

-- Append the new columns (keeps the existing view's column order). Staff notes and the
-- scholarship are never shown to parents.
create or replace view public.student_directory with (security_barrier=true) as
select id,first_name,last_name,dob,language,parent_name,parent_email,parent_phone,student_phone,registered_at,status,package_id,
  case when has_role(array['administrator']) or is_guardian(id) then monthly_fee else null end as monthly_fee,
  currency,created_by,updated_at,student_number,
  dob_estimated,country,contact_teacher_id,registration_type,registration_year_id,class_level_id,
  case when has_role(array['administrator','academic_manager']) then scholarship_percent else null end as scholarship_percent,
  case when has_role(array['administrator','academic_manager','teacher','guidance']) then staff_notes else null end as staff_notes
from public.students where public.can_read_student(id);
grant select(dob_estimated,country,contact_teacher_id,registration_type,registration_year_id,class_level_id) on public.students to authenticated;
grant select on public.student_directory to authenticated;

-- Reference data: the previous registration term, class levels and the website's subject names.
insert into public.academic_years(id,name,starts_on,ends_on,active)
values('10000000-0000-0000-0000-000000000002','2025–2026','2025-09-01','2026-08-31',false)
on conflict (name) do nothing;
insert into public.levels(code,name_en,name_tr,kind) values
('beginner','Beginner','Başlangıç','class'),
('intermediate','Intermediate','Orta','class'),
('advanced','Advanced','İleri','class')
on conflict (code) do nothing;
update public.subjects set name_en='Language Skills', name_tr='Dil Becerileri' where code='B1';
update public.subjects set name_en='History', name_tr='Tarih' where code='B2';
update public.subjects set name_en='Stories & Biographies', name_tr='Hikâyeler ve Biyografiler' where code='B3';

-- Monthly dues apply the scholarship; full scholarships produce no charge.
create or replace function public.preview_monthly_dues(p_month date) returns jsonb language plpgsql stable security definer set search_path=public,pg_temp as $$
declare month_start date:=date_trunc('month',p_month)::date;
begin
  perform require_role(array['administrator']);
  return coalesce((select jsonb_agg(jsonb_build_object('student_id',x.id,'student_name',x.student_name,'amount',x.amount,'currency',x.currency,'month',month_start) order by x.sort_name)
    from (select s.id, concat_ws(' ',s.first_name,s.last_name) as student_name, concat_ws(' ',s.last_name,s.first_name) as sort_name,
            round(coalesce(s.monthly_fee,p.monthly_fee)*(1-s.scholarship_percent/100),2) as amount,
            case when s.monthly_fee is not null then s.currency else p.currency end as currency
          from students s left join packages p on p.id=s.package_id
          where s.status<>'archived' and s.registered_at::date<(month_start+interval '1 month')::date
            and not exists(select 1 from charges c where c.student_id=s.id and c.month=month_start and c.voided_at is null)) x
    where x.amount>0),'[]');
end $$;
