create function public.enroll_student_batch(p_student_id uuid,p_class_ids uuid[],p_started_on date) returns integer
language plpgsql security definer set search_path=public,pg_temp as $$
declare key uuid; total integer:=0; inserted integer;
begin
  perform require_role(array['administrator','academic_manager']);
  perform 1 from students where id=p_student_id and status<>'archived' for update;
  if not found then raise exception 'Choose an active student'; end if;
  if coalesce(array_length(p_class_ids,1),0) not between 1 and 100 or p_started_on is null then raise exception 'Choose lessons and an enrollment date'; end if;
  foreach key in array p_class_ids loop
    if not exists(select 1 from classes where id=key and active) then raise exception 'Choose active lessons'; end if;
    -- The existing overlap trigger runs before ON CONFLICT. Skip an existing
    -- active enrollment explicitly; the locked student serializes batch retries.
    if exists(select 1 from enrollments where student_id=p_student_id and class_id=key and ended_on is null) then continue; end if;
    insert into enrollments(student_id,class_id,started_on) values(p_student_id,key,p_started_on)
    on conflict(student_id,class_id) where ended_on is null do nothing;
    get diagnostics inserted=row_count;total:=total+inserted;
  end loop;
  return total;
end $$;
revoke all on function public.enroll_student_batch(uuid,uuid[],date) from public,anon;
grant execute on function public.enroll_student_batch(uuid,uuid[],date) to authenticated;
notify pgrst,'reload schema';
