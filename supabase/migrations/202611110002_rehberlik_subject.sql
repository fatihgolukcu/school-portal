-- Rehberlik (guidance lessons) subject and its seven learning outcomes.
--
-- Safe to run more than once and on a school that already started this by hand:
--  * an existing subject named "Rehberlik" is reused; otherwise B6 is created (or the next
--    free B number if B6 is taken);
--  * outcomes whose Turkish text already exists for that subject are skipped;
--  * published assessment versions are immutable, so the outcomes go into a NEW published
--    version (latest published + new questions). Existing assessments and reports keep the
--    version they were made with;
--  * open drafts also receive the outcomes and are renumbered after the new version, so
--    publishing a draft later does not drop them.
-- Packages and classes are not changed: add the subject to the classes that teach it
-- (Okul ayarları → Sınıflar) and to the packages that include it (Okul ayarları → Paketler).

do $$
declare
  outcomes constant jsonb := '[
    ["Kitap okumanın önemini kavrar.", "Understands the importance of reading books."],
    ["Okuduğunu anlar ve yorumlar.", "Understands and interprets what they read."],
    ["Olaylar arasındaki sebep-sonuç ilişkisini kavrar.", "Understands cause and effect between events."],
    ["Yeni sözcükler edinir.", "Learns new words."],
    ["Güçlü yönlerini keşfeder.", "Discovers their strengths."],
    ["Duygularını uygun sözcüklerle ifade eder.", "Expresses feelings with suitable words."],
    ["Ahlaki değerlerin önemini kavrar.", "Understands the importance of moral values."]
  ]';
  v_code text;
  latest configurations;
  draft configurations;
  new_version integer;
  added jsonb;
  next_body jsonb;
  shift integer := 0;
begin
  perform pg_advisory_xact_lock(hashtext('configuration:assessment'));

  select s.code into v_code from subjects s
  where lower(trim(s.name_tr)) = 'rehberlik' order by s.code limit 1;
  if v_code is null then
    v_code := 'B6';
    if exists (select 1 from subjects where subjects.code = 'B6') then
      select 'B' || (coalesce(max(substring(s.code from '^B(\d+)$')::integer), 0) + 1)
        into v_code from subjects s;
    end if;
    insert into subjects(code, name_en, name_tr) values (v_code, 'Guidance', 'Rehberlik');
  end if;

  select * into latest from configurations
  where kind = 'assessment' and status = 'published' order by version desc limit 1;
  if latest.id is null then
    raise notice 'No published assessment configuration; Rehberlik outcomes were not added.';
    return;
  end if;

  -- Questions to add to a body: outcomes not yet present for this subject, numbered after the
  -- subject's existing questions, with ids that do not collide.
  for draft in
    select * from configurations where id = latest.id
    union all
    select * from configurations where kind = 'assessment' and status = 'draft'
  loop
    select coalesce(jsonb_agg(jsonb_build_object(
        'id', case when exists (select 1 from jsonb_array_elements(draft.body->'questions') q
                                where q->>'id' = v_code || '.' || (base.top + o.n))
                   then v_code || '.r' || o.n else v_code || '.' || (base.top + o.n) end,
        'subject_code', v_code, 'form', v_code, 'type', 'score',
        'label_en', o.v->>1, 'label_tr', o.v->>0,
        'required', true, 'min', 1, 'max', 5, 'order', base.top + o.n) order by o.n), '[]')
      into added
    from jsonb_array_elements(outcomes) with ordinality as o(v, n)
    cross join lateral (
      select coalesce(max((q->>'order')::integer), 0) as top
      from jsonb_array_elements(draft.body->'questions') q where q->>'subject_code' = v_code
    ) base
    where not exists (
      select 1 from jsonb_array_elements(draft.body->'questions') q
      where q->>'subject_code' = v_code and lower(trim(q->>'label_tr')) = lower(o.v->>0)
    );
    if jsonb_array_length(added) = 0 then continue; end if;
    next_body := jsonb_set(draft.body, '{questions}', (draft.body->'questions') || added);
    perform validate_configuration('assessment', next_body);

    if draft.status = 'published' then
      select max(version) + 1 into new_version from configurations where kind = 'assessment';
      insert into configurations(kind, version, name, status, body, published_at)
      values ('assessment', new_version, 'Rehberlik kazanımları / Guidance outcomes',
              'published', next_body, now());
    else
      update configurations set body = next_body where id = draft.id;
    end if;
  end loop;

  -- Keep any open draft newer than the version just published.
  if new_version is not null then
    for draft in
      select * from configurations
      where kind = 'assessment' and status = 'draft' and version < new_version order by version
    loop
      shift := shift + 1;
      update configurations set version = new_version + shift where id = draft.id;
    end loop;
  end if;
end $$;
