-- October 2026 changes requested by the school:
--   * five terms per academic year; term 5 is the summer school
--   * billing only in EUR or PLN
--   * charges record the academic year, package, optional term and any scholarship
--   * student scholarships may be a percentage or a fixed amount
--   * parent contact details are optional
--   * countries are stored as ISO 3166 alpha-2 codes
-- Safe to run once on a database that already has migrations 0001–0009.
-- Any row that cannot be converted makes a constraint fail, and the whole
-- migration rolls back instead of changing data silently.

-- 1. Parent contact details are optional; email is checked only when given -------------
create or replace function public.validate_student() returns trigger language plpgsql set search_path=public,pg_temp as $$
begin
  if new.dob > current_date then raise exception 'Date of birth cannot be in the future'; end if;
  new.last_name := nullif(trim(coalesce(new.last_name,'')),'');
  new.parent_name := nullif(trim(coalesce(new.parent_name,'')),'');
  new.parent_phone := nullif(trim(coalesce(new.parent_phone,'')),'');
  new.parent_email := nullif(lower(trim(coalesce(new.parent_email,''))),'');
  new.country := nullif(trim(coalesce(new.country,'')),'');
  new.staff_notes := nullif(trim(coalesce(new.staff_notes,'')),'');
  if new.parent_email is not null and new.parent_email !~ '^[^@\s]+@[^@\s]+\.[^@\s]+$' then
    raise exception 'Parent email is not valid';
  end if;
  new.updated_at := now();
  return new;
end $$;

-- 2. Five terms per year -------------------------------------------------------
alter table public.periods drop constraint if exists periods_number_check;
alter table public.periods add constraint periods_number_check check (number between 1 and 5);

-- Every academic year that uses terms gets a summer school term 5, unless it has one.
-- Dates stay empty until the school sets them in School settings.
insert into public.periods(academic_year_id, number, name_en, name_tr)
select y.id, 5, 'Summer School', 'Yaz Okulu'
from public.academic_years y
where exists (select 1 from public.periods p where p.academic_year_id = y.id)
  and not exists (select 1 from public.periods p where p.academic_year_id = y.id and p.number = 5);

-- 3. Currencies: EUR or PLN only ---------------------------------------------------
alter table public.students alter column currency set default 'EUR';
alter table public.packages alter column currency set default 'EUR';
-- Placeholder currencies on rows without a price carry no meaning; move them to EUR.
-- (Rows that hold a real price in another currency are left alone and stop the migration.)
update public.students set currency = 'EUR'
  where currency not in ('EUR','PLN') and monthly_fee is null;
update public.packages set currency = 'EUR'
  where currency not in ('EUR','PLN') and monthly_fee is null;
alter table public.students add constraint students_currency_allowed check (currency in ('EUR','PLN'));
alter table public.packages add constraint packages_currency_allowed check (currency in ('EUR','PLN'));
alter table public.charges add constraint charges_currency_allowed check (currency in ('EUR','PLN'));
alter table public.payments add constraint payments_currency_allowed check (currency in ('EUR','PLN'));

-- 4. Student scholarships as a percentage or a fixed amount --------------------------
alter table public.students
  add column scholarship_type text not null default 'percent' check (scholarship_type in ('percent','amount')),
  add column scholarship_amount numeric(12,2) not null default 0 check (scholarship_amount >= 0);

-- 5. Charges know what they are for ---------------------------------------------------
alter table public.charges
  add column academic_year_id uuid references public.academic_years,
  add column period_id uuid references public.periods,
  add column package_id uuid references public.packages,
  add column gross_amount numeric(12,2) check (gross_amount > 0),
  add column discount_type text check (discount_type in ('percent','amount')),
  add column discount_value numeric(12,2) check (discount_value >= 0),
  add constraint charges_net_not_above_gross check (gross_amount is null or amount <= gross_amount);

-- 6. Countries become ISO codes ---------------------------------------------------------
-- The portal shows codes as localised names; values it cannot map stay as typed.
update public.students s set country = m.code
from (values
  ('poland','PL'),('polonya','PL'),('polska','PL'),
  ('turkey','TR'),('türkiye','TR'),('turkiye','TR'),('türkei','TR'),
  ('united kingdom','GB'),('uk','GB'),('england','GB'),('great britain','GB'),('ingiltere','GB'),('i̇ngiltere','GB'),('birleşik krallık','GB'),
  ('germany','DE'),('almanya','DE'),('deutschland','DE'),
  ('netherlands','NL'),('the netherlands','NL'),('hollanda','NL'),('holland','NL'),
  ('belgium','BE'),('belçika','BE'),
  ('france','FR'),('fransa','FR'),
  ('austria','AT'),('avusturya','AT'),
  ('ireland','IE'),('irlanda','IE'),('i̇rlanda','IE'),
  ('united states','US'),('usa','US'),('abd','US'),('amerika','US'),
  ('canada','CA'),('kanada','CA'),
  ('sweden','SE'),('isveç','SE'),('i̇sveç','SE'),
  ('norway','NO'),('norveç','NO'),
  ('denmark','DK'),('danimarka','DK'),
  ('switzerland','CH'),('isviçre','CH'),('i̇sviçre','CH'),
  ('italy','IT'),('italya','IT'),('i̇talya','IT'),
  ('spain','ES'),('ispanya','ES'),('i̇spanya','ES'),
  ('czech republic','CZ'),('czechia','CZ'),('çekya','CZ'),('çek cumhuriyeti','CZ'),
  ('australia','AU'),('avustralya','AU'),
  ('azerbaijan','AZ'),('azerbaycan','AZ'),
  ('kazakhstan','KZ'),('kazakistan','KZ'),
  ('bosnia and herzegovina','BA'),('bosna hersek','BA'),
  ('bulgaria','BG'),('bulgaristan','BG'),
  ('romania','RO'),('romanya','RO'),
  ('hungary','HU'),('macaristan','HU'),
  ('greece','GR'),('yunanistan','GR'),
  ('ukraine','UA'),('ukrayna','UA'),
  ('finland','FI'),('finlandiya','FI'),
  ('luxembourg','LU'),('lüksemburg','LU')
) as m(name, code)
where lower(trim(s.country)) = m.name;

-- 7. Registration accepts the new scholarship fields ------------------------------------
create or replace function public.register_student(p_payload jsonb) returns public.students language plpgsql security definer set search_path=public,pg_temp as $$
declare result students; guardian_id text;
begin
  perform require_role(array['administrator','academic_manager']);
  insert into students(first_name,last_name,dob,dob_estimated,language,parent_name,parent_email,parent_phone,student_phone,
    package_id,monthly_fee,currency,registered_at,created_by,country,contact_teacher_id,registration_type,registration_year_id,
    class_level_id,scholarship_percent,scholarship_type,scholarship_amount,staff_notes)
  values(trim(p_payload->>'first_name'),p_payload->>'last_name',(p_payload->>'dob')::date,coalesce((p_payload->>'dob_estimated')::boolean,false),
    coalesce(p_payload->>'language','en'),p_payload->>'parent_name',p_payload->>'parent_email',p_payload->>'parent_phone',
    nullif(p_payload->>'student_phone',''),nullif(p_payload->>'package_id','')::uuid,nullif(p_payload->>'monthly_fee','')::numeric,
    coalesce(nullif(p_payload->>'currency',''),'EUR'),coalesce(nullif(p_payload->>'registered_at','')::timestamptz,now()),auth.uid(),
    p_payload->>'country',nullif(p_payload->>'contact_teacher_id','')::uuid,coalesce(nullif(p_payload->>'registration_type',''),'new'),
    nullif(p_payload->>'registration_year_id','')::uuid,nullif(p_payload->>'class_level_id','')::uuid,
    coalesce(nullif(p_payload->>'scholarship_percent','')::numeric,0),
    coalesce(nullif(p_payload->>'scholarship_type',''),'percent'),
    coalesce(nullif(p_payload->>'scholarship_amount','')::numeric,0),
    p_payload->>'staff_notes')
  returning * into result;
  for guardian_id in select jsonb_array_elements_text(coalesce(p_payload->'guardian_ids','[]')) loop perform link_guardian(result.id,guardian_id::uuid); end loop;
  return result;
end $$;

-- Scholarship changes alter the fee, so only administrators may make them.
create or replace function public.protect_student_fee() returns trigger language plpgsql security definer set search_path=public,pg_temp as $$
begin
  if auth.role()='authenticated' and not has_role(array['administrator']) and
    ((tg_op='INSERT' and (new.monthly_fee is not null or new.scholarship_percent <> 0 or new.scholarship_amount <> 0)) or
     (tg_op='UPDATE' and (new.monthly_fee,new.currency,new.scholarship_percent,new.scholarship_type,new.scholarship_amount)
        is distinct from (old.monthly_fee,old.currency,old.scholarship_percent,old.scholarship_type,old.scholarship_amount)))
  then raise exception 'Only administrators may change individual fees or scholarships'; end if;
  return new;
end $$;

-- The directory view gains the scholarship fields (management only), appended at the end.
create or replace view public.student_directory with (security_barrier=true) as
select id,first_name,last_name,dob,language,parent_name,parent_email,parent_phone,student_phone,registered_at,status,package_id,
  case when has_role(array['administrator']) or is_guardian(id) then monthly_fee else null end as monthly_fee,
  currency,created_by,updated_at,student_number,
  dob_estimated,country,contact_teacher_id,registration_type,registration_year_id,class_level_id,
  case when has_role(array['administrator','academic_manager']) then scholarship_percent else null end as scholarship_percent,
  case when has_role(array['administrator','academic_manager','teacher','guidance']) then staff_notes else null end as staff_notes,
  case when has_role(array['administrator','academic_manager']) then scholarship_type else null end as scholarship_type,
  case when has_role(array['administrator','academic_manager']) then scholarship_amount else null end as scholarship_amount
from public.students where public.can_read_student(id);
grant select on public.student_directory to authenticated;

-- 8. Monthly dues apply either kind of scholarship; a fully covered month produces no charge.
create or replace function public.preview_monthly_dues(p_month date) returns jsonb language plpgsql stable security definer set search_path=public,pg_temp as $$
declare month_start date:=date_trunc('month',p_month)::date;
begin
  perform require_role(array['administrator']);
  return coalesce((select jsonb_agg(jsonb_build_object('student_id',x.id,'student_name',x.student_name,'amount',x.amount,
      'gross_amount',x.gross,'discount_type',x.discount_type,'discount_value',x.discount_value,
      'package_id',x.package_id,'currency',x.currency,'month',month_start) order by x.sort_name)
    from (select s.id, s.package_id, concat_ws(' ',s.first_name,s.last_name) as student_name, concat_ws(' ',s.last_name,s.first_name) as sort_name,
            g.gross,
            case when s.scholarship_type='amount' then greatest(round(g.gross-s.scholarship_amount,2),0)
                 else round(g.gross*(1-s.scholarship_percent/100),2) end as amount,
            case when s.scholarship_type='amount' and s.scholarship_amount>0 then 'amount'
                 when s.scholarship_type='percent' and s.scholarship_percent>0 then 'percent' end as discount_type,
            case when s.scholarship_type='amount' and s.scholarship_amount>0 then s.scholarship_amount
                 when s.scholarship_type='percent' and s.scholarship_percent>0 then s.scholarship_percent end as discount_value,
            case when s.monthly_fee is not null then s.currency else p.currency end as currency
          from students s left join packages p on p.id=s.package_id
          cross join lateral (select coalesce(s.monthly_fee,p.monthly_fee) as gross) g
          where s.status<>'archived' and s.registered_at::date<(month_start+interval '1 month')::date
            and not exists(select 1 from charges c where c.student_id=s.id and c.month=month_start and c.voided_at is null)) x
    where x.amount>0),'[]');
end $$;

create or replace function public.generate_monthly_dues(p_month date) returns integer language plpgsql security definer set search_path=public,pg_temp as $$
declare item jsonb; inserted integer:=0; affected integer;
begin
  perform require_role(array['administrator']); perform pg_advisory_xact_lock(hashtext('dues:'||date_trunc('month',p_month)::date::text));
  for item in select * from jsonb_array_elements(preview_monthly_dues(p_month)) loop
    insert into charges(student_id,month,amount,currency,due_on,description,created_by,package_id,gross_amount,discount_type,discount_value)
    values((item->>'student_id')::uuid,(item->>'month')::date,(item->>'amount')::numeric,item->>'currency',(item->>'month')::date,
      'Monthly tuition / Aylık eğitim ücreti',auth.uid(),nullif(item->>'package_id','')::uuid,(item->>'gross_amount')::numeric,
      item->>'discount_type',nullif(item->>'discount_value','')::numeric)
    on conflict do nothing;
    get diagnostics affected=row_count; inserted:=inserted+affected;
  end loop; return inserted;
end $$;

-- 9. Charges are created from an academic year and package, with an optional scholarship.
-- The original create_charge(uuid,numeric,text,date,text) stays available for older clients.
create function public.create_charge(p_payload jsonb) returns uuid language plpgsql security definer set search_path=public,pg_temp as $$
declare
  y academic_years; t periods; pk packages; v_student uuid; gross numeric; net numeric;
  d_type text; d_value numeric; cur text; note text; description text; result uuid;
begin
  perform require_role(array['administrator']);
  v_student := nullif(p_payload->>'student_id','')::uuid;
  if v_student is null or not exists(select 1 from students s where s.id=v_student) then raise exception 'Student not found'; end if;
  gross := nullif(p_payload->>'gross_amount','')::numeric;
  if gross is null or gross<=0 or gross<>round(gross,2) then raise exception 'A positive amount with at most two decimal places is required'; end if;
  cur := upper(coalesce(nullif(p_payload->>'currency',''),'EUR'));
  if cur not in ('EUR','PLN') then raise exception 'Currency must be EUR or PLN'; end if;
  if nullif(p_payload->>'academic_year_id','') is not null then
    select * into y from academic_years where id=(p_payload->>'academic_year_id')::uuid;
    if not found then raise exception 'Academic year not found'; end if;
  end if;
  if nullif(p_payload->>'period_id','') is not null then
    select * into t from periods where id=(p_payload->>'period_id')::uuid;
    if not found or t.academic_year_id is distinct from y.id then raise exception 'The term does not belong to the selected academic year'; end if;
  end if;
  if nullif(p_payload->>'package_id','') is not null then
    select * into pk from packages where id=(p_payload->>'package_id')::uuid;
    if not found then raise exception 'Package not found'; end if;
  end if;
  note := nullif(trim(coalesce(p_payload->>'note','')),'');
  if pk.id is null and note is null then raise exception 'Choose a package or enter a description'; end if;
  d_type := nullif(p_payload->>'discount_type','');
  d_value := coalesce(nullif(p_payload->>'discount_value','')::numeric,0);
  if d_type is null or d_value=0 then
    d_type := null; d_value := null; net := gross;
  elsif d_type='percent' then
    if d_value<0 or d_value>100 then raise exception 'Scholarship percentage must be between 0 and 100'; end if;
    net := round(gross*(1-d_value/100),2);
  elsif d_type='amount' then
    if d_value<0 or d_value<>round(d_value,2) then raise exception 'Scholarship amount must be positive with at most two decimal places'; end if;
    net := round(gross-d_value,2);
  else
    raise exception 'Unknown scholarship type';
  end if;
  if net<=0 then raise exception 'Full scholarship – no charge needed'; end if;
  -- Stored bilingual; the portal shows the parts in the reader's language.
  description := concat_ws(' · ', y.name,
    case when pk.id is not null then pk.name_en||' / '||pk.name_tr end,
    case when t.id is not null then t.name_en||' / '||t.name_tr end,
    note);
  insert into charges(student_id,amount,currency,due_on,description,created_by,academic_year_id,period_id,package_id,gross_amount,discount_type,discount_value)
  values(v_student,net,cur,(p_payload->>'due_on')::date,description,auth.uid(),y.id,t.id,pk.id,gross,d_type,d_value)
  returning id into result;
  return result;
end $$;
revoke all on function public.create_charge(jsonb) from public, anon;
grant execute on function public.create_charge(jsonb) to authenticated;

notify pgrst, 'reload schema';
