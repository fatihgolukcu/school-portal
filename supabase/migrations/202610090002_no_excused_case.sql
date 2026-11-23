-- An "excused" mark no longer opens a guidance case automatically.
-- Before: every excused lesson or excused assessment created a yellow
-- "Excused exception / İzinli istisna" case. The school found this noisy: an excused
-- mark means the reason was accepted. Repeated absences and low attendance are still
-- caught by the configurable rules in "Questions & rules".

create or replace function public.save_attendance(p_session_id uuid,p_rows jsonb) returns integer language plpgsql security definer set search_path=public,pg_temp as $$
declare s sessions; row jsonb; student uuid; saved integer:=0; entry_date date; tz text;
begin
  select * into strict s from sessions where id=p_session_id for update;
  if not can_manage_class(s.class_id) then raise exception 'Access denied' using errcode='42501'; end if;
  if s.status='cancelled' then raise exception 'Cancelled sessions cannot have attendance'; end if;
  select timezone into tz from school_settings where id; entry_date:=(s.starts_at at time zone coalesce(tz,'Europe/London'))::date;
  if jsonb_typeof(p_rows)<>'array' or jsonb_array_length(p_rows)=0 then raise exception 'Attendance rows required'; end if;
  for row in select * from jsonb_array_elements(p_rows) loop
    student:=(row->>'student_id')::uuid;
    if not exists(select 1 from enrollments where student_id=student and class_id=s.class_id and started_on<=entry_date and (ended_on is null or ended_on>=entry_date)) then raise exception 'Student is not enrolled on the session date'; end if;
    if row->>'status'<>'absent' and nullif(row->>'participation','') is null then raise exception 'Participation is required for attendees'; end if;
    insert into attendance(session_id,student_id,status,late_minutes,excused,excuse_reason,camera_issue,microphone_issue,participation,recorded_by)
    values(p_session_id,student,row->>'status',coalesce((row->>'late_minutes')::integer,0),coalesce((row->>'excused')::boolean,false),nullif(row->>'excuse_reason',''),coalesce((row->>'camera_issue')::boolean,false),coalesce((row->>'microphone_issue')::boolean,false),case when row->>'status'='absent' then null else (row->>'participation')::numeric end,auth.uid())
    on conflict(session_id,student_id) do update set status=excluded.status,late_minutes=excluded.late_minutes,excused=excluded.excused,excuse_reason=excluded.excuse_reason,camera_issue=excluded.camera_issue,microphone_issue=excluded.microphone_issue,participation=excluded.participation,recorded_by=auth.uid(),updated_at=now();
    saved:=saved+1;
  end loop;
  update sessions set status='completed' where id=s.id;
  for row in select * from jsonb_array_elements(p_rows) loop
    student:=(row->>'student_id')::uuid;
    -- An excused lesson is not a concern by itself; the normal rules still run
    -- (they already leave excused lessons out of their averages).
    perform evaluate_guidance(student,s.class_id);
  end loop;
  return saved;
end $$;

create or replace function public.save_assessment(p_payload jsonb) returns uuid language plpgsql security definer set search_path=public,pg_temp as $$
declare cfg configurations; c classes; period periods; q jsonb; answer jsonb; answers jsonb; identifier text; applicable integer:=0; result uuid; student uuid; state text; score numeric; subject_code text; context jsonb; form_scores jsonb;
begin
  student:=(p_payload->>'student_id')::uuid; state:=coalesce(p_payload->>'status','draft'); answers:=coalesce(p_payload->'answers','{}');
  select * into strict c from classes where id=(p_payload->>'class_id')::uuid;
  if not can_manage_class(c.id) then raise exception 'Access denied' using errcode='42501'; end if;
  select * into strict period from periods where id=(p_payload->>'period_id')::uuid;
  if period.starts_on is null or period.ends_on is null then raise exception 'Configure reporting period dates first'; end if;
  if period.academic_year_id<>c.academic_year_id then raise exception 'Class and reporting period must be in the same academic year'; end if;
  if not exists(select 1 from enrollments where student_id=student and class_id=c.id and started_on<=period.ends_on and (ended_on is null or ended_on>=period.starts_on)) then raise exception 'Student is not enrolled in this period'; end if;
  select * into strict cfg from configurations where id=(p_payload->>'configuration_id')::uuid and kind='assessment' and status='published';
  if exists(select 1 from assessments a where a.student_id=student and a.class_id=c.id and a.period_id=period.id and a.teacher_id=auth.uid() and a.configuration_id<>cfg.id) then raise exception 'Existing submissions must keep their original configuration version'; end if;
  select code into subject_code from subjects where id=c.subject_id;
  for identifier in select jsonb_object_keys(answers) loop
    if not exists(select 1 from jsonb_array_elements(cfg.body->'questions') z where z->>'id'=identifier and (z->>'subject_code'=subject_code or coalesce(z->>'subject_code','')='')) then raise exception 'Answer is not part of this version and subject: %',identifier; end if;
  end loop;
  for q in select * from jsonb_array_elements(cfg.body->'questions') where value->>'subject_code'=subject_code or coalesce(value->>'subject_code','')='' loop
    answer:=answers->(q->>'id');
    if coalesce(q->>'subject_code','')<>'' and answer is not null and (answer->>'taught')::boolean=false then continue; end if;
    if state='submitted' and coalesce((q->>'required')::boolean,true) and (answer is null or answer->'value' is null or answer->'value'='null'::jsonb or answer->>'value'='') then raise exception 'Required answer missing: %',q->>'id'; end if;
    if answer is null or answer->'value' is null or answer->'value'='null'::jsonb or answer->>'value'='' then continue; end if;
    if q->>'type' in ('score','number') then
      if jsonb_typeof(answer->'value')<>'number' then raise exception 'Numeric answer expected: %',q->>'id'; end if;
      score:=(answer->>'value')::numeric;
      if score<coalesce((q->>'min')::numeric,1) or score>coalesce((q->>'max')::numeric,5) then raise exception 'Score outside valid range: %',q->>'id'; end if;
    elsif q->>'type'='boolean' and jsonb_typeof(answer->'value')<>'boolean' then raise exception 'Boolean answer expected';
    elsif q->>'type'='choice' and not exists(select 1 from jsonb_array_elements_text(q->'choices') where value=answer->>'value') then raise exception 'Invalid choice';
    elsif q->>'type'='date' then perform (answer->>'value')::date;
    elsif q->>'type'='text' and jsonb_typeof(answer->'value')<>'string' then raise exception 'Text answer expected'; end if;
    if q ? 'score_map' and not (q->'score_map' ? (answer->>'value')) then raise exception 'Answer has no configured score mapping: %',q->>'id'; end if;
    applicable:=applicable+1;
  end loop;
  if state='submitted' and applicable=0 then raise exception 'No applicable assessment answers'; end if;
  insert into assessments(student_id,class_id,period_id,teacher_id,configuration_id,answers,strengths,development_areas,parent_advice,excused,excuse_reason,status,submitted_at)
  values(student,c.id,period.id,auth.uid(),cfg.id,answers,coalesce(p_payload->>'strengths',''),coalesce(p_payload->>'development_areas',''),coalesce(p_payload->>'parent_advice',''),coalesce((p_payload->>'excused')::boolean,false),nullif(p_payload->>'excuse_reason',''),state,case when state='submitted' then now() end)
  on conflict(student_id,class_id,period_id,teacher_id) do update set configuration_id=excluded.configuration_id,answers=excluded.answers,strengths=excluded.strengths,development_areas=excluded.development_areas,parent_advice=excluded.parent_advice,excused=excluded.excused,excuse_reason=excluded.excuse_reason,status=excluded.status,submitted_at=excluded.submitted_at,updated_at=now() returning id into result;
  if state='submitted' then
    -- An excused assessment opens no case and is not scored by the rules.
    if coalesce((p_payload->>'excused')::boolean,false) then null;
    else
      select jsonb_build_object('engagement_average',avg(question_score(value,answers->(value->>'id'))) filter(where value->>'form'='A4'),'behaviour_average',avg(question_score(value,answers->(value->>'id'))) filter(where value->>'form'='A5'),'behaviour_min',min(question_score(value,answers->(value->>'id'))) filter(where value->>'form'='A5'),'subject_average',avg(question_score(value,answers->(value->>'id'))) filter(where coalesce(value->>'subject_code','')<>''),'academic_min',min(question_score(value,answers->(value->>'id'))) filter(where coalesce(value->>'subject_code','')<>''),'assessment_id',result,'observations',1)
      into context from jsonb_array_elements(cfg.body->'questions');
      perform evaluate_guidance(student,c.id,context);
    end if;
  end if;
  return result;
end $$;

notify pgrst, 'reload schema';
