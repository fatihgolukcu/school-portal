create function public.band_for_score(p_score numeric,p_body jsonb) returns jsonb language sql immutable set search_path=public,pg_temp as $$
  select jsonb_build_object('key',value->>'key','label_en',value->>'label_en','label_tr',value->>'label_tr','color',value->>'color','step',ordinality)
  from jsonb_array_elements(p_body->'bands') with ordinality
  where round(p_score,2)>=(value->>'min')::numeric order by (value->>'min')::numeric desc limit 1
$$;

create function public.preview_report(p_student_id uuid,p_period_id uuid,p_grading_id uuid default null) returns jsonb language plpgsql stable security definer set search_path=public,pg_temp as $$
declare period periods; cfg configurations; student students; attendance_avg numeric; a3 numeric; a4 numeric; behaviour_avg numeric; effort_avg numeric; academic_avg numeric; participation_avg numeric; discipline_avg numeric; total numeric; subject_scores jsonb:='{}'; subject_bands jsonb:='{}'; excluded_subjects jsonb:='[]'; missing jsonb:='[]'; r record; subject_score numeric; weighted_total numeric:=0; total_weight numeric:=0; weight numeric; tz text; comments jsonb;
begin
  if not can_read_academic(p_student_id) then raise exception 'Access denied' using errcode='42501'; end if;
  select * into strict period from periods where id=p_period_id;
  select * into strict student from students where id=p_student_id;
  if period.starts_on is null or period.ends_on is null then raise exception 'Configure period dates before calculating reports'; end if;
  select * into cfg from configurations where kind='grading' and status='published' and (p_grading_id is null or id=p_grading_id) order by version desc limit 1;
  if cfg.id is null then raise exception 'A published grading configuration is required'; end if;
  select timezone into tz from school_settings where id;
  -- All classes attended during the period require a submitted teacher form.
  for r in select distinct c.id,c.name from enrollments e join classes c on c.id=e.class_id
    where e.student_id=p_student_id and c.academic_year_id=period.academic_year_id and e.started_on<=period.ends_on and (e.ended_on is null or e.ended_on>=period.starts_on)
      and (student.package_id is null or exists(select 1 from package_subjects ps where ps.package_id=student.package_id and ps.subject_id=c.subject_id))
      and not exists(select 1 from assessments a where a.student_id=p_student_id and a.class_id=c.id and a.period_id=p_period_id and a.status='submitted') loop
    missing:=missing||jsonb_build_array('Assessment: '||r.name);
  end loop;
  -- Unrecorded completed sessions cannot silently improve an attendance average.
  for r in select distinct c.name,s.starts_at from sessions s join classes c on c.id=s.class_id join enrollments e on e.class_id=c.id
    where e.student_id=p_student_id and s.status='completed' and (s.starts_at at time zone coalesce(tz,'Europe/London'))::date between period.starts_on and period.ends_on
      and e.started_on<=(s.starts_at at time zone coalesce(tz,'Europe/London'))::date and (e.ended_on is null or e.ended_on>=(s.starts_at at time zone coalesce(tz,'Europe/London'))::date)
      and not exists(select 1 from attendance a where a.student_id=p_student_id and a.session_id=s.id) loop
    missing:=missing||jsonb_build_array('Attendance: '||r.name||' '||r.starts_at::date::text);
  end loop;
  select avg((cfg.body->'attendance_scores'->>(case when a.status='late' and a.late_minutes<5 then 'present' else a.status end))::numeric) filter(where not a.excused),avg(a.participation)
    into attendance_avg,a3 from attendance a join sessions s on s.id=a.session_id
    where a.student_id=p_student_id and s.status='completed' and (s.starts_at at time zone coalesce(tz,'Europe/London'))::date between period.starts_on and period.ends_on;
  -- First average each teacher's form. Then give each submitted teacher form equal weight.
  with form_means as (
    select a.id,
      avg(question_score(q.value,a.answers->(q.value->>'id'))) filter(where q.value->>'form'='A4') as a4,
      avg(question_score(q.value,a.answers->(q.value->>'id'))) filter(where q.value->>'form'='A5') as behaviour,
      avg(question_score(q.value,a.answers->(q.value->>'id'))) filter(where q.value->>'form'='A6') as effort
    from assessments a join configurations ac on ac.id=a.configuration_id cross join lateral jsonb_array_elements(ac.body->'questions') q
    where a.student_id=p_student_id and a.period_id=p_period_id and a.status='submitted'
    group by a.id
  ) select avg(fm.a4),avg(fm.behaviour),avg(fm.effort) into a4,behaviour_avg,effort_avg from form_means fm;
  for r in
    select distinct su.id,su.code,su.name_en from subjects su where
      (student.package_id is not null and exists(select 1 from package_subjects ps where ps.subject_id=su.id and ps.package_id=student.package_id)) or
      (student.package_id is null and exists(select 1 from enrollments e join classes c on c.id=e.class_id where c.subject_id=su.id and e.student_id=p_student_id and c.academic_year_id=period.academic_year_id and e.started_on<=period.ends_on and (e.ended_on is null or e.ended_on>=period.starts_on)))
  loop
    select avg(form_mean) into subject_score from (
      select a.id,avg(question_score(q.value,a.answers->(q.value->>'id'))) as form_mean
      from assessments a join classes c on c.id=a.class_id join configurations ac on ac.id=a.configuration_id cross join lateral jsonb_array_elements(ac.body->'questions') q
      where a.student_id=p_student_id and a.period_id=p_period_id and a.status='submitted' and c.subject_id=r.id and q.value->>'subject_code'=r.code
      group by a.id
    ) scored;
    if subject_score is null then
      if exists(select 1 from assessments a join classes c on c.id=a.class_id join configurations ac on ac.id=a.configuration_id cross join lateral jsonb_array_elements(ac.body->'questions') q
          where a.student_id=p_student_id and a.period_id=p_period_id and a.status='submitted' and c.subject_id=r.id and q.value->>'subject_code'=r.code and (q.value->>'type'='score' or q.value ? 'score_map'))
        and not exists(select 1 from assessments a join classes c on c.id=a.class_id join configurations ac on ac.id=a.configuration_id cross join lateral jsonb_array_elements(ac.body->'questions') q
          where a.student_id=p_student_id and a.period_id=p_period_id and a.status='submitted' and c.subject_id=r.id and q.value->>'subject_code'=r.code and (q.value->>'type'='score' or q.value ? 'score_map') and coalesce((a.answers->(q.value->>'id')->>'taught')::boolean,true)) then
        excluded_subjects:=excluded_subjects||jsonb_build_array(r.code);
      else missing:=missing||jsonb_build_array('Subject: '||r.name_en); end if;
    else
      subject_scores:=subject_scores||jsonb_build_object(r.code,round(subject_score,2));
      subject_bands:=subject_bands||jsonb_build_object(r.code,band_for_score(subject_score,cfg.body));
      weight:=case when cfg.body#>>'{academic,mode}'='weighted_average' then coalesce((cfg.body->'academic'->'weights'->>r.code)::numeric,1) else 1 end;
      weighted_total:=weighted_total+subject_score*weight; total_weight:=total_weight+weight;
    end if;
  end loop;
  academic_avg:=weighted_total/nullif(total_weight,0);
  if attendance_avg is null then missing:=missing||'"Attendance"'::jsonb; end if;
  if a3 is null then missing:=missing||'"A3 participation"'::jsonb; end if;
  if a4 is null then missing:=missing||'"A4 engagement"'::jsonb; end if;
  if behaviour_avg is null then missing:=missing||'"A5 behaviour"'::jsonb; end if;
  if effort_avg is null then missing:=missing||'"A6 effort"'::jsonb; end if;
  if academic_avg is null then missing:=missing||'"Academic subjects"'::jsonb; end if;
  participation_avg:=a3*coalesce((cfg.body#>>'{participation,a3}')::numeric,0.5)+a4*coalesce((cfg.body#>>'{participation,a4}')::numeric,0.5);
  discipline_avg:=attendance_avg*(cfg.body#>>'{discipline,attendance}')::numeric+participation_avg*(cfg.body#>>'{discipline,participation}')::numeric+behaviour_avg*(cfg.body#>>'{discipline,behaviour}')::numeric;
  total:=round(discipline_avg*(cfg.body#>>'{overall,discipline}')::numeric+academic_avg*(cfg.body#>>'{overall,academic}')::numeric+effort_avg*(cfg.body#>>'{overall,effort}')::numeric,2);
  select coalesce(jsonb_agg(jsonb_build_object('strengths',coalesce(nullif(a.strengths,''),a.answers#>>'{A6.strengths,value}',''),'development_areas',coalesce(nullif(a.development_areas,''),a.answers#>>'{A6.development,value}',''),'parent_advice',coalesce(nullif(a.parent_advice,''),a.answers#>>'{A6.advice,value}',''),'teacher_id',a.teacher_id) order by a.id),'[]') into comments from assessments a where a.student_id=p_student_id and a.period_id=p_period_id and a.status='submitted';
  return jsonb_build_object('configuration_id',cfg.id,'configuration_version',cfg.version,'complete',jsonb_array_length(missing)=0,'missing',missing,'excluded_subjects',excluded_subjects,'overall',total,'attendance',round(attendance_avg,2),'participation',round(participation_avg,2),'engagement',round(a4,2),'behaviour',round(behaviour_avg,2),'discipline',round(discipline_avg,2),'academic',round(academic_avg,2),'effort',round(effort_avg,2),'subjects',subject_scores,'comments',comments,'band',band_for_score(total,cfg.body),'parent_summary',jsonb_build_object('overall',band_for_score(total,cfg.body),'academic',band_for_score(academic_avg,cfg.body),'discipline',band_for_score(discipline_avg,cfg.body),'participation',band_for_score(participation_avg,cfg.body),'effort',band_for_score(effort_avg,cfg.body),'subjects',subject_bands,'comments',comments));
end $$;

create function public.generate_report(p_student_id uuid,p_period_id uuid,p_grading_id uuid default null) returns uuid language plpgsql security definer set search_path=public,pg_temp as $$
declare v_calculation jsonb; result uuid; next_revision integer;
begin
  perform require_role(array['administrator','academic_manager','teacher']);
  if not can_read_academic(p_student_id) then raise exception 'Access denied' using errcode='42501'; end if;
  v_calculation:=preview_report(p_student_id,p_period_id,p_grading_id);
  perform pg_advisory_xact_lock(hashtext(p_student_id::text||p_period_id::text));
  select id into result from reports where student_id=p_student_id and period_id=p_period_id and status='draft' order by revision desc limit 1 for update;
  if result is not null then
    update reports set calculation=v_calculation,grading_configuration_id=(v_calculation->>'configuration_id')::uuid,comments=v_calculation->'comments',generated_at=now(),generated_by=auth.uid() where id=result;
  else
    select coalesce(max(revision),0)+1 into next_revision from reports where student_id=p_student_id and period_id=p_period_id;
    insert into reports(student_id,period_id,grading_configuration_id,revision,calculation,comments,generated_by) values(p_student_id,p_period_id,(v_calculation->>'configuration_id')::uuid,next_revision,v_calculation,v_calculation->'comments',auth.uid()) returning id into result;
  end if;
  if (v_calculation->>'complete')::boolean then perform evaluate_guidance(p_student_id,null,jsonb_build_object('overall_score',v_calculation->'overall','report_id',result,'observations',1)); end if;
  return result;
end $$;
create function public.submit_report(p_report_id uuid) returns void language plpgsql security definer set search_path=public,pg_temp as $$
declare r reports; fresh jsonb;
begin
  select * into strict r from reports where id=p_report_id for update;
  perform require_role(array['administrator','academic_manager','teacher']);
  if not can_read_academic(r.student_id) then raise exception 'Access denied' using errcode='42501'; end if;
  if r.status<>'draft' then raise exception 'Only draft reports can be submitted'; end if;
  fresh:=preview_report(r.student_id,r.period_id,r.grading_configuration_id);
  if not (fresh->>'complete')::boolean then raise exception 'Missing required assessments: %',fresh->'missing'; end if;
  update reports set status='submitted',submitted_at=now(),calculation=fresh,comments=fresh->'comments' where id=p_report_id;
end $$;
create function public.publish_report(p_report_id uuid) returns void language plpgsql security definer set search_path=public,pg_temp as $$
declare r reports; fresh jsonb;
begin
  perform require_role(array['administrator','academic_manager']);
  select * into strict r from reports where id=p_report_id for update;
  if r.status<>'submitted' then raise exception 'Only submitted reports can be published'; end if;
  fresh:=preview_report(r.student_id,r.period_id,r.grading_configuration_id);
  if not (fresh->>'complete')::boolean then raise exception 'Required assessments are incomplete'; end if;
  if fresh<>r.calculation then raise exception 'Source data changed after submission; create and submit a revised report'; end if;
  perform pg_advisory_xact_lock(hashtext(r.student_id::text||r.period_id::text));
  if exists(select 1 from parent_reports where student_id=r.student_id and period_id=r.period_id and revision>r.revision) then raise exception 'A newer report revision already exists'; end if;
  update parent_reports set current=false where student_id=r.student_id and period_id=r.period_id and current;
  insert into parent_reports(id,student_id,period_id,revision,summary) values(r.id,r.student_id,r.period_id,r.revision,r.calculation->'parent_summary');
  update reports set status='published',published_at=now(),published_by=auth.uid() where id=r.id;
end $$;
create function public.report_immutable() returns trigger language plpgsql set search_path=public,pg_temp as $$
begin if old.status='published' then raise exception 'Published report snapshots cannot change'; end if; return new; end $$;
create trigger published_report_immutable before update or delete on public.reports for each row execute function public.report_immutable();

create function public.preview_monthly_dues(p_month date) returns jsonb language plpgsql stable security definer set search_path=public,pg_temp as $$
declare month_start date:=date_trunc('month',p_month)::date;
begin
  perform require_role(array['administrator']);
  return coalesce((select jsonb_agg(jsonb_build_object('student_id',s.id,'student_name',s.first_name||' '||s.last_name,'amount',coalesce(s.monthly_fee,p.monthly_fee),'currency',case when s.monthly_fee is not null then s.currency else p.currency end,'month',month_start) order by s.last_name,s.first_name)
    from students s left join packages p on p.id=s.package_id where s.status<>'archived' and s.registered_at::date<(month_start+interval '1 month')::date and coalesce(s.monthly_fee,p.monthly_fee)>0
      and not exists(select 1 from charges c where c.student_id=s.id and c.month=month_start and c.voided_at is null)),'[]');
end $$;
create function public.generate_monthly_dues(p_month date) returns integer language plpgsql security definer set search_path=public,pg_temp as $$
declare item jsonb; inserted integer:=0; affected integer;
begin
  perform require_role(array['administrator']); perform pg_advisory_xact_lock(hashtext('dues:'||date_trunc('month',p_month)::date::text));
  for item in select * from jsonb_array_elements(preview_monthly_dues(p_month)) loop
    insert into charges(student_id,month,amount,currency,due_on,description,created_by) values((item->>'student_id')::uuid,(item->>'month')::date,(item->>'amount')::numeric,item->>'currency',(item->>'month')::date,'Monthly tuition / Aylık eğitim ücreti',auth.uid()) on conflict do nothing;
    get diagnostics affected=row_count; inserted:=inserted+affected;
  end loop; return inserted;
end $$;
create function public.create_charge(p_student_id uuid,p_amount numeric,p_currency text,p_due_on date,p_description text) returns uuid language plpgsql security definer set search_path=public,pg_temp as $$
declare result uuid;
begin perform require_role(array['administrator']); insert into charges(student_id,amount,currency,due_on,description,created_by) values(p_student_id,p_amount,upper(p_currency),p_due_on,p_description,auth.uid()) returning id into result; return result; end $$;
create function public.record_payment(p_student_id uuid,p_amount numeric,p_currency text,p_paid_on date,p_reference text,p_allocations jsonb) returns uuid language plpgsql security definer set search_path=public,pg_temp as $$
declare result uuid; item jsonb; charge charges; allocation_amount numeric; allocated numeric:=0; existing_amount numeric;
begin
  perform require_role(array['administrator']);
  if p_amount<=0 or p_amount<>round(p_amount,2) or jsonb_typeof(p_allocations)<>'array' then raise exception 'A positive monetary amount and allocations array are required'; end if;
  perform pg_advisory_xact_lock(hashtext('finance:'||p_student_id::text));
  insert into payments(student_id,amount,currency,paid_on,reference,recorded_by) values(p_student_id,p_amount,upper(p_currency),p_paid_on,coalesce(p_reference,''),auth.uid()) returning id into result;
  for item in select * from jsonb_array_elements(p_allocations) loop
    select * into strict charge from charges where id=(item->>'charge_id')::uuid for update;
    allocation_amount:=(item->>'amount')::numeric;
    if charge.student_id<>p_student_id or charge.currency<>upper(p_currency) or charge.voided_at is not null then raise exception 'Allocation must match the student and currency of an active charge'; end if;
    if allocation_amount<=0 or allocation_amount<>round(allocation_amount,2) then raise exception 'Allocation must be a positive amount with at most two decimal places'; end if;
    select coalesce(sum(a.amount),0) into existing_amount from allocations a join payments p on p.id=a.payment_id where a.charge_id=charge.id and p.voided_at is null;
    if existing_amount+allocation_amount>charge.amount then raise exception 'Allocation exceeds remaining charge'; end if;
    allocated:=allocated+allocation_amount; if allocated>p_amount then raise exception 'Allocations exceed payment'; end if;
    insert into allocations(payment_id,charge_id,amount) values(result,charge.id,allocation_amount);
  end loop;
  return result;
end $$;
create function public.void_payment(p_payment_id uuid,p_reason text) returns void language plpgsql security definer set search_path=public,pg_temp as $$
begin
  perform require_role(array['administrator']); if length(trim(p_reason))<3 then raise exception 'A correction reason is required'; end if;
  update payments set voided_at=now(),void_reason=p_reason where id=p_payment_id and voided_at is null;
  if not found then raise exception 'Active payment not found'; end if;
end $$;
create function public.void_charge(p_charge_id uuid,p_reason text) returns void language plpgsql security definer set search_path=public,pg_temp as $$
declare c charges;
begin
  perform require_role(array['administrator']); if length(trim(p_reason))<3 then raise exception 'A correction reason is required'; end if;
  select * into strict c from charges where id=p_charge_id for update;
  if exists(select 1 from allocations a join payments p on p.id=a.payment_id where a.charge_id=p_charge_id and p.voided_at is null) then raise exception 'Void allocated payments before correcting this charge'; end if;
  update charges set voided_at=now(),void_reason=p_reason where id=p_charge_id and voided_at is null;
end $$;

create function public.family_balances() returns jsonb language plpgsql stable security definer set search_path=public,pg_temp as $$
begin
  perform require_role(array['administrator','parent']);
  return coalesce((select jsonb_agg(to_jsonb(b)) from (
    select student_id,currency,sum(charged) as charged,sum(paid) as paid,sum(charged)-sum(paid) as balance from (
      select student_id,currency,amount as charged,0::numeric as paid from charges where voided_at is null and (has_role(array['administrator']) or is_guardian(student_id))
      union all select student_id,currency,0,amount from payments where voided_at is null and (has_role(array['administrator']) or is_guardian(student_id))
    ) entries group by student_id,currency
  ) b),'[]');
end $$;
