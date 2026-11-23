create table public.learning_materials (
  id uuid primary key default gen_random_uuid(),
  class_id uuid not null references public.classes,
  package_id uuid references public.packages,
  title text not null check(length(btrim(title)) between 1 and 200),
  owner_id uuid not null references public.profiles default auth.uid(),
  object_key text unique,
  external_url text,
  file_type text,
  file_size bigint check(file_size between 1 and 20971520),
  version integer not null default 1 check(version>0),
  replaces_id uuid references public.learning_materials,
  status text not null default 'uploading' check(status in ('uploading','ready','archived')),
  created_at timestamptz not null default now(),
  check((object_key is not null and external_url is null) or (object_key is null and external_url ~ '^https://(drive\.google\.com|docs\.google\.com)/'))
);
alter table public.learning_materials enable row level security;
create function public.can_read_material(p_id uuid) returns boolean language sql stable security definer set search_path=public,pg_temp as $$
  select exists(select 1 from learning_materials m where m.id=p_id and m.status='ready' and (
    can_manage_class(m.class_id) or exists(select 1 from enrollments e join students s on s.id=e.student_id
      where e.class_id=m.class_id and e.ended_on is null and is_guardian(e.student_id)
        and (m.package_id is null or s.package_id=m.package_id))
  ))
$$;
create policy materials_read on public.learning_materials for select to authenticated using(can_manage_class(class_id) or can_read_material(id));
create policy materials_insert on public.learning_materials for insert to authenticated with check(can_manage_class(class_id) and owner_id=auth.uid());
create policy materials_update on public.learning_materials for update to authenticated using(can_manage_class(class_id)) with check(can_manage_class(class_id));
grant select,insert,update on public.learning_materials to authenticated;
grant all on public.learning_materials to service_role;
create function public.protect_material_version() returns trigger language plpgsql set search_path=public,pg_temp as $$
begin
  if tg_op='INSERT' then
    if new.object_key is not null and (new.status<>'uploading' or new.object_key not like auth.uid()::text||'/%') then raise exception 'Create an incomplete upload owned by your account'; end if;
    if new.external_url is not null and not has_role(array['administrator','academic_manager']) then raise exception 'Management must approve external material links'; end if;
    if new.replaces_id is not null and not exists(select 1 from learning_materials m where m.id=new.replaces_id and m.class_id=new.class_id and new.version=m.version+1) then raise exception 'Choose the previous version from this class'; end if;
  elsif new.object_key is distinct from old.object_key or new.external_url is distinct from old.external_url
    or new.class_id is distinct from old.class_id or new.owner_id is distinct from old.owner_id
    or new.version is distinct from old.version or new.replaces_id is distinct from old.replaces_id
    or new.file_size is distinct from old.file_size or new.file_type is distinct from old.file_type then
    raise exception 'Material versions are immutable. Upload a new version.';
  elsif old.status='archived' and new.status<>'archived' then raise exception 'Archived versions cannot be reactivated';
  elsif old.status='ready' and new.status='uploading' then raise exception 'Ready versions cannot return to uploading';
  end if;
  if new.object_key is not null and new.status='ready' and (tg_op='INSERT' or old.status='uploading') and
    not exists(select 1 from storage.objects o where o.bucket_id='learning-materials' and o.name=new.object_key
      and (o.metadata->>'size')::bigint=new.file_size) then raise exception 'Upload the complete file before making it available'; end if;
  return new;
end $$;
create trigger protect_material_version before insert or update on public.learning_materials for each row execute function public.protect_material_version();
revoke all on function public.protect_material_version() from public,anon,authenticated;
create trigger record_change after insert or update on public.learning_materials for each row execute function public.audit_change();

insert into storage.buckets(id,name,public,file_size_limit,allowed_mime_types)
values('learning-materials','learning-materials',false,20971520,array['application/pdf','audio/mpeg','audio/mp4','audio/wav','audio/x-wav','audio/ogg'])
on conflict(id) do nothing;
create policy material_object_read on storage.objects for select to authenticated using(bucket_id='learning-materials' and exists(
  select 1 from public.learning_materials m where m.object_key=name and (public.can_read_material(m.id) or
    (m.status='uploading' and m.owner_id=auth.uid() and public.can_manage_class(m.class_id)))));
create policy material_object_upload on storage.objects for insert to authenticated with check(bucket_id='learning-materials' and exists(
  select 1 from public.learning_materials m where m.object_key=name and m.status='uploading' and m.owner_id=auth.uid() and public.can_manage_class(m.class_id)));
-- Only incomplete uploads can be cleaned up by staff. Ready versions are archived,
-- preserving the bytes so database/file recovery and history stay consistent.
create policy material_object_cleanup on storage.objects for delete to authenticated using(bucket_id='learning-materials' and exists(
  select 1 from public.learning_materials m where m.object_key=name and m.status='uploading' and m.owner_id=auth.uid() and public.can_manage_class(m.class_id)));
create index materials_class_status_idx on public.learning_materials(class_id,status);
revoke all on function public.can_read_material(uuid) from public,anon;
grant execute on function public.can_read_material(uuid) to authenticated;

create table public.backup_runs (
  id uuid primary key default gen_random_uuid(),
  status text not null check(status in ('running','verified','failed')),
  started_at timestamptz not null default now(),
  finished_at timestamptz,
  object_count integer,
  sha256 text,
  drive_file_id text,
  failure_code text
);
alter table public.backup_runs enable row level security;
create policy backup_admin_read on public.backup_runs for select to authenticated using(has_role(array['administrator']));
grant select on public.backup_runs to authenticated;
revoke insert,update,delete on public.backup_runs from authenticated;
grant all on public.backup_runs to service_role;

-- Reference record and its memberships commit together. Only these two
-- whitelisted entities are accepted; the function is not a generic privileged API.
create function public.save_school_reference(p_table text,p_values jsonb,p_subject_ids uuid[],p_group_ids uuid[] default '{}',p_level_ids uuid[] default '{}') returns uuid
language plpgsql security definer set search_path=public,pg_temp as $$
declare key uuid:=coalesce(nullif(p_values->>'id','')::uuid,gen_random_uuid());
begin
  if p_table='packages' then
    perform require_role(array['administrator']);
    if p_values ? 'id' then
      perform 1 from packages where id=key for update;
      if not found then raise exception 'Package not found'; end if;
      update packages set code=p_values->>'code',name_en=p_values->>'name_en',name_tr=p_values->>'name_tr',
        weekly_lessons=(p_values->>'weekly_lessons')::integer,monthly_fee=(p_values->>'monthly_fee')::numeric,
        currency=p_values->>'currency',active=coalesce((p_values->>'active')::boolean,true) where id=key;
    else
      insert into packages(id,code,name_en,name_tr,weekly_lessons,monthly_fee,currency,active)
      values(key,p_values->>'code',p_values->>'name_en',p_values->>'name_tr',(p_values->>'weekly_lessons')::integer,
        (p_values->>'monthly_fee')::numeric,p_values->>'currency',coalesce((p_values->>'active')::boolean,true));
    end if;
    perform set_package_contents(key,p_subject_ids,p_group_ids,p_level_ids);
  elsif p_table='class_groups' then
    perform require_role(array['administrator','academic_manager']);
    if p_values ? 'id' then
      perform 1 from class_groups where id=key for update;
      if not found then raise exception 'Class not found'; end if;
      update class_groups set name=p_values->>'name',academic_year_id=(p_values->>'academic_year_id')::uuid,
        language=p_values->>'language',level_id=nullif(p_values->>'level_id','')::uuid,active=coalesce((p_values->>'active')::boolean,true) where id=key;
    else
      insert into class_groups(id,name,academic_year_id,language,level_id,active)
      values(key,p_values->>'name',(p_values->>'academic_year_id')::uuid,p_values->>'language',nullif(p_values->>'level_id','')::uuid,coalesce((p_values->>'active')::boolean,true));
    end if;
    perform set_class_group_subjects(key,p_subject_ids);
  else raise exception 'Unsupported school reference'; end if;
  return key;
end $$;
revoke all on function public.save_school_reference(text,jsonb,uuid[],uuid[],uuid[]) from public,anon;
grant execute on function public.save_school_reference(text,jsonb,uuid[],uuid[],uuid[]) to authenticated;
notify pgrst,'reload schema';
