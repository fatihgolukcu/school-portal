-- Administrator account tools: remove a team member who has no school records.
-- Called only by the manage-user Netlify function with service credentials; the function then
-- deletes the matching auth.users row (profiles.id references auth.users with ON DELETE RESTRICT,
-- so the profile must go first).

create or replace function public.protect_last_administrator() returns trigger language plpgsql security definer set search_path=public,pg_temp as $$
declare losing boolean;
begin
  if tg_op='DELETE' then losing:=old.active and 'administrator'=any(old.roles);
  else losing:=old.active and 'administrator'=any(old.roles) and (not new.active or not ('administrator'=any(new.roles)));
  end if;
  if losing then
    perform pg_advisory_xact_lock(hashtext('active-administrators'));
    if not exists(select 1 from profiles where id<>old.id and active and 'administrator'=any(roles)) then
      raise exception 'Keep at least one active administrator';
    end if;
  end if;
  if tg_op='DELETE' then return old; end if;
  return new;
end $$;
revoke all on function public.protect_last_administrator() from public,anon,authenticated;
drop trigger if exists protect_last_administrator_delete on public.profiles;
create trigger protect_last_administrator_delete before delete on public.profiles for each row execute function public.protect_last_administrator();

create or replace function public.delete_unused_profile(p_profile_id uuid,p_actor_id uuid) returns void language plpgsql security definer set search_path=public,pg_temp as $$
declare target profiles;
begin
  perform require_service();
  if not exists(select 1 from profiles where id=p_actor_id and active and 'administrator'=any(roles)) then
    raise exception 'Only an active administrator can delete users' using errcode='42501';
  end if;
  if p_profile_id=p_actor_id then raise exception 'You cannot delete your own account'; end if;
  select * into target from profiles where id=p_profile_id for update;
  if not found then raise exception 'User not found'; end if;
  begin
    -- Links and private drafts belong to the account itself and go with it.
    delete from guardians where profile_id=p_profile_id;
    delete from work_drafts where owner_id=p_profile_id;
    delete from profiles where id=p_profile_id;
  exception when foreign_key_violation then
    raise exception 'has_records' using errcode='P0001', hint='Archive this user instead.';
  end;
  insert into audit_log(actor_id,action,entity_type,entity_id,details)
  values(p_actor_id,'user_deleted','profiles',p_profile_id::text,
    jsonb_build_object('email',target.email,'full_name',target.full_name,'roles',target.roles));
end $$;

revoke all on function public.delete_unused_profile(uuid,uuid) from public, anon, authenticated;
grant execute on function public.delete_unused_profile(uuid,uuid) to service_role;
