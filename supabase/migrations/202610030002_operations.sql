create function public.link_guardian(p_student_id uuid,p_profile_id uuid) returns void language plpgsql security definer set search_path=public,pg_temp as $$
begin
  perform require_role(array['administrator','academic_manager']);
  if not exists(select 1 from profiles where id=p_profile_id and 'parent'=any(roles) and active) then raise exception 'An active parent account is required'; end if;
  insert into guardians(student_id,profile_id) values(p_student_id,p_profile_id) on conflict do nothing;
end $$;

create function public.register_student(p_payload jsonb) returns public.students language plpgsql security definer set search_path=public,pg_temp as $$
declare result students; guardian_id text;
begin
  perform require_role(array['administrator','academic_manager']);
  if (p_payload->>'dob')::date > current_date then raise exception 'Date of birth cannot be in the future'; end if;
  if length(trim(coalesce(p_payload->>'parent_name','')))=0 or length(trim(coalesce(p_payload->>'parent_phone','')))=0 or coalesce(p_payload->>'parent_email','') !~ '^[^@\s]+@[^@\s]+\.[^@\s]+$' then raise exception 'Parent name, phone and a valid email are required'; end if;
  insert into students(first_name,last_name,dob,language,parent_name,parent_email,parent_phone,student_phone,package_id,monthly_fee,currency,registered_at,created_by)
  values(trim(p_payload->>'first_name'),trim(p_payload->>'last_name'),(p_payload->>'dob')::date,coalesce(p_payload->>'language','en'),trim(p_payload->>'parent_name'),lower(trim(p_payload->>'parent_email')),trim(p_payload->>'parent_phone'),nullif(p_payload->>'student_phone',''),nullif(p_payload->>'package_id','')::uuid,nullif(p_payload->>'monthly_fee','')::numeric,coalesce(p_payload->>'currency','EUR'),coalesce(nullif(p_payload->>'registered_at','')::timestamptz,now()),auth.uid()) returning * into result;
  for guardian_id in select jsonb_array_elements_text(coalesce(p_payload->'guardian_ids','[]')) loop perform link_guardian(result.id,guardian_id::uuid); end loop;
  return result;
end $$;

create function public.parent_attendance(p_student_id uuid) returns jsonb language plpgsql stable security definer set search_path=public,pg_temp as $$
begin
  if not is_guardian(p_student_id) and not can_read_academic(p_student_id) then raise exception 'Access denied' using errcode='42501'; end if;
  return coalesce((select jsonb_agg(jsonb_build_object('session_id',s.id,'class_id',s.class_id,'starts_at',s.starts_at,'status',a.status,'excused',a.excused,'late_minutes',a.late_minutes) order by s.starts_at desc) from attendance a join sessions s on s.id=a.session_id where a.student_id=p_student_id),'[]');
end $$;

create function public.question_score(p_question jsonb,p_answer jsonb) returns numeric language plpgsql immutable set search_path=public,pg_temp as $$
begin
  if p_answer is null or coalesce((p_answer->>'taught')::boolean,true)=false or p_answer->'value' is null or p_answer->'value'='null'::jsonb then return null; end if;
  if p_question ? 'score_map' and jsonb_typeof(p_question->'score_map')='object' then return nullif(p_question->'score_map'->>(p_answer->>'value'),'')::numeric; end if;
  if p_question->>'type'='score' and jsonb_typeof(p_answer->'value')='number' then return (p_answer->>'value')::numeric; end if;
  return null;
end $$;

create function public.validate_configuration(p_kind text,p_body jsonb) returns void language plpgsql immutable set search_path=public,pg_temp as $$
declare q jsonb; w numeric; n integer; seen text[]:='{}'; r jsonb;
begin
  if jsonb_typeof(p_body)<>'object' then raise exception 'Configuration must be an object'; end if;
  if p_kind='assessment' then
    if coalesce(jsonb_typeof(p_body->'questions'),'null')<>'array' or jsonb_array_length(p_body->'questions')=0 then raise exception 'Questions are required'; end if;
    for q in select * from jsonb_array_elements(p_body->'questions') loop
      if coalesce(q->>'id','')='' or (q->>'id')=any(seen) then raise exception 'Each question needs a unique stable id'; end if;
      seen:=array_append(seen,q->>'id');
      if coalesce(q->>'label_en','')='' or coalesce(q->>'label_tr','')='' then raise exception 'Both question translations are required'; end if;
      if coalesce(q->>'type','') not in ('text','number','score','boolean','choice','date') then raise exception 'Unsupported question type'; end if;
      if coalesce(q->>'form','') not in ('A4','A5','A6','custom') and not (coalesce(q->>'subject_code','')<>'' and q->>'form'=q->>'subject_code') then raise exception 'Question form must be a discipline form or its academic subject code'; end if;
      if q->>'type' in ('number','score') and ((q->>'min')::numeric>(q->>'max')::numeric or (q->>'type'='score' and ((q->>'min')::numeric<0 or (q->>'max')::numeric>5))) then raise exception 'Invalid numeric range'; end if;
      if q->>'type'='choice' and (jsonb_typeof(q->'choices')<>'array' or jsonb_array_length(q->'choices')=0) then raise exception 'Choices are required'; end if;
      if q ? 'score_map' then
        if q->>'type' not in ('boolean','choice','number') or jsonb_typeof(q->'score_map')<>'object' or q->'score_map'='{}'::jsonb then raise exception 'Score mapping requires a boolean, choice or number question and a nonempty mapping'; end if;
        if exists(select 1 from jsonb_each(q->'score_map') m where jsonb_typeof(m.value)<>'number') then raise exception 'Mapped scores must be numeric'; end if;
        if exists(select 1 from jsonb_each_text(q->'score_map') m where m.value::numeric not between 0 and 5) then raise exception 'Mapped scores must be 0–5'; end if;
        if q->>'type'='boolean' and not (q->'score_map' ?& array['true','false']) then raise exception 'Map both boolean outcomes'; end if;
        if q->>'type'='choice' and exists(select 1 from jsonb_array_elements_text(q->'choices') c where not (q->'score_map' ? c.value)) then raise exception 'Map every choice'; end if;
      end if;
    end loop;
  elsif p_kind='grading' then
    select sum(value::numeric),count(*) into w,n from jsonb_each_text(p_body->'overall');
    if n<>3 or abs(w-1)>0.00001 or not (p_body->'overall' ?& array['discipline','academic','effort']) or exists(select 1 from jsonb_each_text(p_body->'overall') where value::numeric<0) then raise exception 'Overall weights must total 1'; end if;
    select sum(value::numeric),count(*) into w,n from jsonb_each_text(p_body->'discipline');
    if n<>3 or abs(w-1)>0.00001 or not (p_body->'discipline' ?& array['attendance','participation','behaviour']) or exists(select 1 from jsonb_each_text(p_body->'discipline') where value::numeric<0) then raise exception 'Discipline weights must total 1'; end if;
    select sum(value::numeric),count(*) into w,n from jsonb_each_text(p_body->'participation');
    if n<>2 or abs(w-1)>0.00001 or not (p_body->'participation' ?& array['a3','a4']) or exists(select 1 from jsonb_each_text(p_body->'participation') where value::numeric<0) then raise exception 'Participation weights must total 1'; end if;
    if not (p_body->'attendance_scores' ?& array['present','late','absent']) or exists(select 1 from jsonb_each_text(p_body->'attendance_scores') where value::numeric not between 0 and 5) then raise exception 'Attendance scores must be 0–5'; end if;
    if coalesce(p_body#>>'{academic,mode}','average') not in ('average','weighted_average') then raise exception 'Unsupported aggregation'; end if;
    if p_body#>>'{academic,mode}'='weighted_average' and (jsonb_typeof(p_body#>'{academic,weights}')<>'object' or exists(select 1 from jsonb_each_text(p_body#>'{academic,weights}') where value::numeric<=0)) then raise exception 'Positive academic weights required'; end if;
    if jsonb_typeof(p_body->'bands')<>'array' or jsonb_array_length(p_body->'bands')<>5 then raise exception 'Exactly five ordered progress bands are required'; end if;
    w:=-1;
    for q in select * from jsonb_array_elements(p_body->'bands') loop
      if (q->>'min')::numeric<=w or (q->>'min')::numeric<0 or (q->>'min')::numeric>5 or coalesce(q->>'label_en','')='' or coalesce(q->>'label_tr','')='' then raise exception 'Invalid progress band'; end if;
      w:=(q->>'min')::numeric;
    end loop;
    if (p_body#>>'{bands,0,min}')::numeric<>0 then raise exception 'Bands must start at zero'; end if;
  elsif p_kind='triggers' then
    if coalesce((p_body->>'review_hours')::integer,48) not between 1 and 720 or coalesce((p_body->>'escalation_hours')::integer,72)<=coalesce((p_body->>'review_hours')::integer,48) or coalesce((p_body->>'escalation_hours')::integer,72)>1440 or coalesce((p_body->>'orange_escalation_days')::integer,14) not between 1 and 365 then raise exception 'Invalid review and escalation timing'; end if;
    if jsonb_typeof(p_body->'rules')<>'array' then raise exception 'Rules are required'; end if;
    for r in select * from jsonb_array_elements(p_body->'rules') loop
      if coalesce(r->>'id','')='' or (r->>'id')=any(seen) then raise exception 'Rule IDs must be unique'; end if;
      seen:=array_append(seen,r->>'id');
      if coalesce(r->>'severity','') not in ('red','orange','yellow') or coalesce(r->>'label_en','')='' or coalesce(r->>'label_tr','')='' then raise exception 'Severity and bilingual rule labels required'; end if;
      perform validate_condition(r->'condition',0);
    end loop;
  else raise exception 'Unsupported configuration kind'; end if;
end $$;

create function public.validate_condition(p_condition jsonb,p_depth integer default 0) returns void language plpgsql immutable set search_path=public,pg_temp as $$
declare child jsonb; op text;
begin
  if p_depth>6 or jsonb_typeof(p_condition)<>'object' then raise exception 'Invalid condition nesting'; end if;
  if p_condition ? 'all' or p_condition ? 'any' then
    if p_condition ? 'all' and p_condition ? 'any' then raise exception 'Choose AND or OR'; end if;
    op:=case when p_condition ? 'all' then 'all' else 'any' end;
    if jsonb_typeof(p_condition->op)<>'array' or jsonb_array_length(p_condition->op)=0 then raise exception 'Condition group cannot be empty'; end if;
    for child in select * from jsonb_array_elements(p_condition->op) loop perform validate_condition(child,p_depth+1); end loop;
  else
    if coalesce(p_condition->>'metric','') not in ('consecutive_absences','attendance_average','camera_incidents','participation_average','engagement_average','behaviour_average','behaviour_min','subject_average','academic_min','overall_score') then raise exception 'Unknown trigger metric'; end if;
    if coalesce(p_condition->>'operator','') not in ('lt','lte','gt','gte','eq') then raise exception 'Unknown comparison'; end if;
    if jsonb_typeof(p_condition->'value')<>'number' then raise exception 'A numeric comparison value is required'; end if;
    if coalesce((p_condition->>'window_days')::integer,0) not between 0 and 366 or coalesce((p_condition->>'min_observations')::integer,1) not between 1 and 1000 then raise exception 'Invalid window or observation count'; end if;
  end if;
end $$;

create function public.save_configuration(p_id uuid,p_kind text,p_name text,p_body jsonb) returns uuid language plpgsql security definer set search_path=public,pg_temp as $$
declare result uuid; old_config configurations;
begin
  perform require_role(array['administrator']); perform validate_configuration(p_kind,p_body);
  perform pg_advisory_xact_lock(hashtext('configuration:'||p_kind));
  if p_id is not null then
    select * into strict old_config from configurations where id=p_id for update;
    if old_config.kind<>p_kind then raise exception 'Configuration kind cannot change'; end if;
    if old_config.status='draft' then update configurations set body=p_body,name=p_name where id=p_id; return p_id; end if;
  end if;
  insert into configurations(kind,version,name,body,created_by) select p_kind,coalesce(max(version),0)+1,p_name,p_body,auth.uid() from configurations where kind=p_kind returning id into result;
  return result;
end $$;
create function public.configuration_immutable() returns trigger language plpgsql set search_path=public,pg_temp as $$
begin if old.status='published' then raise exception 'Published configurations are immutable; create a new draft'; end if; return new; end $$;
create trigger published_configuration_immutable before update or delete on public.configurations for each row execute function public.configuration_immutable();
create function public.publish_configuration(p_id uuid) returns void language plpgsql security definer set search_path=public,pg_temp as $$
declare cfg configurations; previous configurations; q jsonb; old_q jsonb;
begin
  perform require_role(array['administrator']); select * into strict cfg from configurations where id=p_id for update;
  if cfg.status<>'draft' then raise exception 'Only drafts can be published'; end if;
  perform validate_configuration(cfg.kind,cfg.body);
  if cfg.kind='assessment' then
    if exists(select 1 from jsonb_array_elements(cfg.body->'questions') q_item where coalesce(q_item.value->>'subject_code','')<>'' and not exists(select 1 from subjects s where s.code=q_item.value->>'subject_code')) then raise exception 'Create the subject before publishing its questions'; end if;
    select * into previous from configurations where kind='assessment' and status='published' order by version desc limit 1;
    if previous.id is not null then
      for q in select * from jsonb_array_elements(cfg.body->'questions') loop
        select value into old_q from jsonb_array_elements(previous.body->'questions') where value->>'id'=q->>'id';
        if old_q is not null and (old_q->>'type'<>q->>'type' or old_q->>'form'<>q->>'form' or old_q->>'subject_code' is distinct from q->>'subject_code') then raise exception 'Stable question IDs cannot change type, form or subject; use a new ID'; end if;
      end loop;
    end if;
  end if;
  update configurations set status='published',published_at=now() where id=p_id;
end $$;

create function public.queue_case_email(p_case_id uuid,p_event text) returns void language sql security definer set search_path=public,pg_temp as $$
  insert into notification_outbox(case_id,recipient_email,recipient_language,event,payload)
  select p_case_id,p.email,p.language,p_event,jsonb_build_object('case_id',p_case_id,'event',p_event)
  from profiles p where p.active and p.email<>'' and p.roles && case when p_event='management_escalation' then array['administrator','academic_manager'] else array['administrator','academic_manager','guidance'] end
  on conflict(case_id,recipient_email,event) do nothing
$$;
create function public.upsert_guidance(p_student_id uuid,p_class_id uuid,p_issue_key text,p_reason text,p_severity text,p_source text,p_evidence jsonb default '{}') returns uuid language plpgsql security definer set search_path=public,pg_temp as $$
declare result uuid; old_severity text; review_hours integer;
begin
  perform pg_advisory_xact_lock(hashtext(p_student_id::text||p_issue_key||coalesce(p_class_id::text,'')));
  select id,severity into result,old_severity from guidance_cases where student_id=p_student_id and class_id is not distinct from p_class_id and issue_key=p_issue_key and status<>'resolved' for update;
  if result is null then
    select coalesce((body->>'review_hours')::integer,48) into review_hours from configurations where kind='triggers' and status='published' order by version desc limit 1;
    insert into guidance_cases(student_id,class_id,issue_key,reason,severity,source,evidence,created_by,review_due_at) values(p_student_id,p_class_id,p_issue_key,p_reason,p_severity,p_source,p_evidence,auth.uid(),now()+make_interval(hours=>coalesce(review_hours,48))) returning id into result;
  else
    update guidance_cases set evidence=p_evidence,last_detected_at=now(),severity=case when severity='red' then severity else p_severity end where id=result;
  end if;
  if p_severity='red' and old_severity is distinct from 'red' then perform queue_case_email(result,'urgent'); end if;
  return result;
end $$;

create function public.trigger_condition_matches(p_condition jsonb,p_student_id uuid,p_class_id uuid,p_context jsonb default '{}') returns boolean language plpgsql stable security definer set search_path=public,pg_temp as $$
declare child jsonb; metric text; v numeric; n integer:=0; since_at timestamptz; needed integer; op text; target numeric; r record; matched boolean; attendance_mapping jsonb;
begin
  if p_condition ? 'all' then
    for child in select * from jsonb_array_elements(p_condition->'all') loop if not trigger_condition_matches(child,p_student_id,p_class_id,p_context) then return false; end if; end loop; return true;
  elsif p_condition ? 'any' then
    for child in select * from jsonb_array_elements(p_condition->'any') loop if trigger_condition_matches(child,p_student_id,p_class_id,p_context) then return true; end if; end loop; return false;
  end if;
  metric:=p_condition->>'metric'; needed:=coalesce((p_condition->>'min_observations')::integer,1);
  since_at:=case when coalesce((p_condition->>'window_days')::integer,0)>0 then now()-make_interval(days=>(p_condition->>'window_days')::integer) else '-infinity'::timestamptz end;
  if metric='consecutive_absences' then
    v:=0;
    for r in select a.status,a.excused from sessions s left join attendance a on a.session_id=s.id and a.student_id=p_student_id
      where s.class_id=p_class_id and s.status='completed' and s.starts_at<=now() and s.starts_at>=since_at order by s.starts_at desc loop
      if r.status='absent' and not r.excused then v:=v+1; else exit; end if;
    end loop; n:=v::integer;
  elsif metric in ('attendance_average','camera_incidents','participation_average') then
    select body->'attendance_scores' into attendance_mapping from configurations where kind='grading' and status='published' order by version desc limit 1;
    select case metric when 'attendance_average' then avg((attendance_mapping->>(case when a.status='late' and a.late_minutes<5 then 'present' else a.status end))::numeric)
        when 'camera_incidents' then count(*) filter(where a.camera_issue or a.microphone_issue)::numeric
        else avg(a.participation) end,
      case when metric='participation_average' then count(a.participation) else count(*) end
      into v,n from attendance a join sessions s on s.id=a.session_id
      where a.student_id=p_student_id and s.class_id=p_class_id and s.status='completed' and s.starts_at between since_at and now() and not a.excused;
  else
    v:=nullif(p_context->>metric,'')::numeric; n:=coalesce((p_context->>'observations')::integer,1);
  end if;
  if v is null or n<needed then return false; end if;
  target:=(p_condition->>'value')::numeric; op:=p_condition->>'operator';
  return case op when 'lt' then v<target when 'lte' then v<=target when 'gt' then v>target when 'gte' then v>=target when 'eq' then v=target else false end;
end $$;
create function public.evaluate_guidance(p_student_id uuid,p_class_id uuid,p_context jsonb default '{}') returns void language plpgsql security definer set search_path=public,pg_temp as $$
declare cfg configurations; r jsonb; issue text;
begin
  select * into cfg from configurations where kind='triggers' and status='published' order by version desc limit 1;
  if cfg.id is null then return; end if;
  for r in select * from jsonb_array_elements(cfg.body->'rules') loop
    if coalesce((r->>'enabled')::boolean,true) and trigger_condition_matches(r->'condition',p_student_id,p_class_id,p_context) then
      issue:=r->>'id';
      perform upsert_guidance(p_student_id,p_class_id,issue,r->>'label_en',r->>'severity','auto',jsonb_build_object('rule_id',issue,'configuration_id',cfg.id,'labels',jsonb_build_object('en',r->>'label_en','tr',r->>'label_tr'),'context',p_context));
    end if;
  end loop;
end $$;

create function public.save_attendance(p_session_id uuid,p_rows jsonb) returns integer language plpgsql security definer set search_path=public,pg_temp as $$
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
    if coalesce((row->>'excused')::boolean,false) then perform upsert_guidance(student,s.class_id,'excused_exception','Excused exception / İzinli istisna','yellow','auto',jsonb_build_object('session_id',s.id));
    else perform evaluate_guidance(student,s.class_id); end if;
  end loop;
  return saved;
end $$;

create function public.save_assessment(p_payload jsonb) returns uuid language plpgsql security definer set search_path=public,pg_temp as $$
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
    if coalesce((p_payload->>'excused')::boolean,false) then perform upsert_guidance(student,c.id,'excused_exception','Excused exception / İzinli istisna','yellow','auto',jsonb_build_object('assessment_id',result));
    else
      select jsonb_build_object('engagement_average',avg(question_score(value,answers->(value->>'id'))) filter(where value->>'form'='A4'),'behaviour_average',avg(question_score(value,answers->(value->>'id'))) filter(where value->>'form'='A5'),'behaviour_min',min(question_score(value,answers->(value->>'id'))) filter(where value->>'form'='A5'),'subject_average',avg(question_score(value,answers->(value->>'id'))) filter(where coalesce(value->>'subject_code','')<>''),'academic_min',min(question_score(value,answers->(value->>'id'))) filter(where coalesce(value->>'subject_code','')<>''),'assessment_id',result,'observations',1)
      into context from jsonb_array_elements(cfg.body->'questions');
      perform evaluate_guidance(student,c.id,context);
    end if;
  end if;
  return result;
end $$;
