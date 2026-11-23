-- Remove a class (class group) that was created by mistake.
-- Only classes whose lessons were never used can be deleted: no enrollments, lesson dates,
-- assessments, curriculum records, guidance cases or materials. Otherwise the caller gets
-- `has_records` and should archive the class (active = false) instead.
-- Deleting removes the class's lessons (classes.group_id) and the class; package links in
-- package_classes go with it (ON DELETE CASCADE).

create or replace function public.delete_class_group(p_id uuid) returns void
language plpgsql security definer set search_path = public, pg_temp as $$
declare target class_groups; lessons uuid[];
begin
  perform require_role(array['administrator', 'academic_manager']);
  select * into target from class_groups where id = p_id for update;
  if not found then raise exception 'Class not found'; end if;
  select coalesce(array_agg(id), '{}') into lessons from classes where group_id = p_id;
  if exists (select 1 from enrollments where class_id = any(lessons))
     or exists (select 1 from sessions where class_id = any(lessons))
     or exists (select 1 from assessments where class_id = any(lessons))
     or exists (select 1 from curriculum_progress where class_id = any(lessons))
     or exists (select 1 from guidance_cases where class_id = any(lessons))
     or exists (select 1 from learning_materials where class_id = any(lessons)) then
    raise exception 'has_records' using errcode = 'P0001', hint = 'Archive this class instead.';
  end if;
  delete from classes where id = any(lessons);
  delete from class_groups where id = p_id;
  insert into audit_log(actor_id, action, entity_type, entity_id, details)
  values (auth.uid(), 'class_group_deleted', 'class_groups', p_id::text,
          jsonb_build_object('name', target.name, 'lessons', cardinality(lessons)));
end $$;

revoke all on function public.delete_class_group(uuid) from public, anon;
grant execute on function public.delete_class_group(uuid) to authenticated;
