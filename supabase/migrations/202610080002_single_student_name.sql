-- Students have one "name surname" field. It is stored in first_name;
-- last_name is kept only for compatibility and is always empty.
-- Anything a client still sends as last_name is appended to first_name, so a
-- name can never be split again.

create or replace function public.validate_student() returns trigger language plpgsql set search_path=public,pg_temp as $$
begin
  if new.dob > current_date then raise exception 'Date of birth cannot be in the future'; end if;
  new.first_name := regexp_replace(btrim(concat_ws(' ', btrim(new.first_name), nullif(btrim(coalesce(new.last_name,'')),''))), '\s+', ' ', 'g');
  new.last_name := null;
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

-- Merge existing surnames into the name (the trigger above does the joining).
update public.students set last_name = last_name where last_name is not null;

comment on column public.students.first_name is 'Full name of the student (name and surname).';
comment on column public.students.last_name is 'Unused: always empty; kept for compatibility.';
