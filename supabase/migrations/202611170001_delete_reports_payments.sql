-- Deleting records that were created by mistake.
--   * delete_report: a draft or submitted report card. Management may delete either; the teacher
--     who generated a draft may delete that draft. Published reports are never deleted (parents
--     have them, and the published_report_immutable trigger blocks it anyway).
--   * delete_payment / delete_charge: administrators only. Voiding stays the normal correction;
--     deletion is for wrong entries. A charge with an active (non-voided) payment allocated to it
--     cannot be deleted until that payment is deleted or voided.
-- Every deletion writes an audit_log row with the deleted values.

-- The original trigger returned NEW on delete as well. NEW is null in a BEFORE DELETE trigger,
-- which makes Postgres cancel the delete silently, so no report could ever be deleted.
create or replace function public.report_immutable() returns trigger
language plpgsql set search_path = public, pg_temp as $$
begin
  if old.status = 'published' then raise exception 'Published report snapshots cannot change'; end if;
  if tg_op = 'DELETE' then return old; end if;
  return new;
end $$;

create or replace function public.delete_report(p_id uuid) returns void
language plpgsql security definer set search_path = public, pg_temp as $$
declare r reports;
begin
  perform require_role(array['administrator', 'academic_manager', 'teacher']);
  select * into r from reports where id = p_id for update;
  -- Access is checked before anything about the report is revealed.
  if not has_role(array['administrator', 'academic_manager']) then
    if not found or r.status <> 'draft' or r.generated_by is distinct from auth.uid() then
      raise exception 'Access denied' using errcode = '42501';
    end if;
  end if;
  if not found then raise exception 'Report not found'; end if;
  if r.status = 'published' then
    raise exception 'published' using errcode = 'P0001', hint = 'Published report cards cannot be deleted.';
  end if;
  delete from parent_reports where id = p_id;
  delete from reports where id = p_id;
  perform audit('report_deleted', 'reports', p_id::text,
    jsonb_build_object('student_id', r.student_id, 'period_id', r.period_id,
                       'revision', r.revision, 'status', r.status, 'generated_by', r.generated_by));
end $$;

create or replace function public.delete_payment(p_id uuid) returns void
language plpgsql security definer set search_path = public, pg_temp as $$
declare p payments; n integer;
begin
  perform require_role(array['administrator']);
  -- Same lock order as record_payment: student advisory lock first, then the row.
  select student_id into p.student_id from payments where id = p_id;
  if not found then raise exception 'Payment not found'; end if;
  perform pg_advisory_xact_lock(hashtext('finance:' || p.student_id::text));
  select * into p from payments where id = p_id for update;
  if not found then raise exception 'Payment not found'; end if;
  delete from allocations where payment_id = p_id;
  get diagnostics n = row_count;
  delete from payments where id = p_id;
  perform audit('payment_deleted', 'payments', p_id::text,
    jsonb_build_object('student_id', p.student_id, 'amount', p.amount, 'currency', p.currency,
                       'paid_on', p.paid_on, 'reference', p.reference, 'voided_at', p.voided_at,
                       'allocations', n));
end $$;

create or replace function public.delete_charge(p_id uuid) returns void
language plpgsql security definer set search_path = public, pg_temp as $$
declare c charges; n integer;
begin
  perform require_role(array['administrator']);
  select student_id into c.student_id from charges where id = p_id;
  if not found then raise exception 'Charge not found'; end if;
  perform pg_advisory_xact_lock(hashtext('finance:' || c.student_id::text));
  select * into c from charges where id = p_id for update;
  if not found then raise exception 'Charge not found'; end if;
  if exists (select 1 from allocations a join payments p on p.id = a.payment_id
             where a.charge_id = p_id and p.voided_at is null) then
    raise exception 'has_payments' using errcode = 'P0001',
      hint = 'Delete or void the payments allocated to this charge first.';
  end if;
  delete from allocations where charge_id = p_id;
  get diagnostics n = row_count;
  delete from charges where id = p_id;
  perform audit('charge_deleted', 'charges', p_id::text,
    jsonb_build_object('student_id', c.student_id, 'amount', c.amount, 'currency', c.currency,
                       'due_on', c.due_on, 'month', c.month, 'description', c.description,
                       'voided_at', c.voided_at, 'allocations', n));
end $$;

revoke all on function public.delete_report(uuid), public.delete_payment(uuid), public.delete_charge(uuid) from public, anon;
grant execute on function public.delete_report(uuid), public.delete_payment(uuid), public.delete_charge(uuid) to authenticated;
