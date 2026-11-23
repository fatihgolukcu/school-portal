-- Guidance intake: create request -> student profile/number -> risk -> topic -> description.
-- Existing follow-up states and the original referral RPC remain compatible.
create sequence public.student_number_sequence as bigint start with 1 increment by 1;

create function public.next_student_number() returns text
language plpgsql volatile security definer set search_path=public,pg_temp as $$
declare number_value bigint;
begin
  number_value:=nextval('public.student_number_sequence');
  return 'ST-'||lpad(number_value::text,greatest(6,length(number_value::text)),'0');
end $$;

alter table public.students add column student_number text not null default public.next_student_number();
alter table public.students add constraint students_student_number_key unique(student_number);
alter table public.students add constraint students_student_number_format check(student_number ~ '^ST-[0-9]{6,}$');
alter sequence public.student_number_sequence owned by public.students.student_number;

create function public.protect_student_number() returns trigger
language plpgsql set search_path=public,pg_temp as $$
begin
  if new.student_number is distinct from old.student_number then
    raise exception 'Student numbers are permanent and cannot be changed';
  end if;
  return new;
end $$;
create trigger protect_student_number before update on public.students
for each row execute function public.protect_student_number();

-- Append the new column to preserve the existing view's column order and API shape.
create or replace view public.student_directory with (security_barrier=true) as
select id,first_name,last_name,dob,language,parent_name,parent_email,parent_phone,student_phone,registered_at,status,package_id,
  case when has_role(array['administrator']) or is_guardian(id) then monthly_fee else null end as monthly_fee,
  currency,created_by,updated_at,student_number
from public.students where public.can_read_student(id);
grant select(student_number) on public.students to authenticated;
grant select on public.student_directory to authenticated;

alter table public.guidance_cases add column report_topic text;
alter table public.guidance_cases add column description text not null default '';

update public.guidance_cases set
  report_topic=coalesce(nullif(btrim(split_part(reason,E'\n',1),E'\r\n '),''),'Guidance request'),
  description=case when strpos(reason,E'\n')>0 then btrim(substr(reason,strpos(reason,E'\n')+1)) else '' end;
alter table public.guidance_cases alter column report_topic set not null;
alter table public.guidance_cases add constraint guidance_report_topic_not_blank check(length(btrim(report_topic))>0);

create function public.populate_guidance_request_fields() returns trigger
language plpgsql set search_path=public,pg_temp as $$
begin
  if new.report_topic is null or btrim(new.report_topic)='' then
    new.report_topic:=coalesce(nullif(btrim(split_part(new.reason,E'\n',1),E'\r\n '),''),'Guidance request');
  end if;
  if coalesce(new.description,'')='' and strpos(new.reason,E'\n')>0 then
    new.description:=btrim(substr(new.reason,strpos(new.reason,E'\n')+1));
  end if;
  new.description:=coalesce(new.description,'');
  return new;
end $$;
create trigger populate_guidance_request_fields before insert on public.guidance_cases
for each row execute function public.populate_guidance_request_fields();

create function public.create_guidance_request(
  p_student_id uuid,p_severity text,p_report_topic text,p_description text
) returns uuid language plpgsql security definer set search_path=public,pg_temp as $$
declare result uuid; topic_value text:=btrim(p_report_topic); description_value text:=btrim(p_description);
begin
  perform require_role(array['administrator','academic_manager','teacher','guidance']);
  if not can_read_academic(p_student_id) then raise exception 'Access denied' using errcode='42501'; end if;
  if not exists(select 1 from students where id=p_student_id and status<>'archived') then
    raise exception 'Choose an active student profile';
  end if;
  if coalesce(p_severity,'') not in ('red','orange','yellow') then raise exception 'Choose a red, orange or yellow risk level'; end if;
  if coalesce(length(topic_value),0) not between 3 and 200 then raise exception 'Report topic must contain 3 to 200 characters'; end if;
  if coalesce(length(description_value),0) not between 3 and 5000 then raise exception 'Description must contain 3 to 5000 characters'; end if;

  -- Same open issue for the student updates the existing case. Audit history
  -- preserves earlier request descriptions; risk cannot silently downgrade red.
  result:=upsert_guidance(p_student_id,null,'manual:'||md5(lower(topic_value)),topic_value,p_severity,'manual',
    jsonb_build_object('request_type','guidance_request'));
  update guidance_cases set reason=topic_value,report_topic=topic_value,description=description_value where id=result;
  return result;
end $$;

revoke all on sequence public.student_number_sequence from public,anon,authenticated;
grant usage,select on sequence public.student_number_sequence to service_role;
revoke all on function public.next_student_number(),public.protect_student_number(),public.populate_guidance_request_fields(),public.create_guidance_request(uuid,text,text,text) from public,anon,authenticated;
grant execute on function public.next_student_number() to service_role;
grant execute on function public.create_guidance_request(uuid,text,text,text) to authenticated;
