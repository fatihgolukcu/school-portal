import { useEffect, useMemo, useRef, useState } from 'react';
import {
  FileText,
  Image as ImageIcon,
  Link as LinkIcon,
  Music,
  Plus,
  Presentation,
  Upload,
  Youtube,
} from 'lucide-react';
import type { PageProps, RecordRow } from '../types';
import { MATERIAL_MAX_BYTES, MATERIAL_TYPES } from '../demo';
import {
  Badge,
  Button,
  EmptyState,
  Field,
  FormActions,
  FormError,
  Modal,
  PageHeader,
  SearchField,
  SelectField,
  errorText,
  label,
  tr,
  useConfirm,
} from '../ui';
import { classLevelId, levelsInUse, useUnsavedChanges } from '../workflow';

const FILE_ACCEPT =
  '.pdf,.doc,.docx,.ppt,.pptx,.xls,.xlsx,.jpg,.jpeg,.png,.webp,.gif,.mp3,.m4a,.wav,.ogg';

function detectLinkKind(url: string): 'drive' | 'youtube' | 'web' {
  let host = '';
  try {
    host = new URL(url).hostname.toLowerCase();
  } catch {
    return 'web';
  }
  if (host === 'drive.google.com' || host === 'docs.google.com') return 'drive';
  if (host === 'youtube.com' || host.endsWith('.youtube.com') || host === 'youtu.be')
    return 'youtube';
  return 'web';
}

function parseAction(action?: string) {
  if (!action || !action.startsWith('new:')) return null;
  const [, subject = '', criterion = '', week = ''] = action.split(':');
  const weekNo = Number(week);
  return {
    subjectId: subject,
    criterionId: criterion,
    week: Number.isInteger(weekNo) && weekNo >= 1 && weekNo <= 60 ? String(weekNo) : '',
  };
}

function materialIcon(m: RecordRow) {
  if (m.external_url) return m.link_kind === 'youtube' ? Youtube : LinkIcon;
  const t = String(m.file_type || '');
  if (t.startsWith('image/')) return ImageIcon;
  if (t.startsWith('audio/')) return Music;
  if (t.includes('powerpoint') || t.includes('presentation')) return Presentation;
  return FileText;
}

export function MaterialsPage(props: PageProps) {
  const { data, user, lang, api, refresh } = props;
  const manager = user.roles.some((r) => ['administrator', 'academic_manager'].includes(r));
  const parentOnly = user.roles.length > 0 && user.roles.every((r) => r === 'parent');
  const canAdd = manager || user.roles.includes('teacher');
  const lessons = data.classes.filter((c) => c.active);
  const [confirm, confirmDialog] = useConfirm(lang);

  const allowedSubjects = useMemo(() => {
    const subjects = (data.subjects || []).filter((s) => s.active !== false);
    if (manager) return subjects;
    const mine = new Set(lessons.filter((c) => c.teacher_id === user.id).map((c) => c.subject_id));
    return subjects.filter((s) => mine.has(s.id));
  }, [data.subjects, data.classes, manager, user.id]);

  const config = useMemo(
    () =>
      (data.configurations || [])
        .filter((c) => c.kind === 'assessment' && c.status === 'published')
        .sort((a, b) => (b.version || 0) - (a.version || 0))[0],
    [data.configurations],
  );
  const questions: RecordRow[] = config?.body?.questions || [];
  const questionLabel = (q: RecordRow) =>
    (lang === 'tr' ? q.label_tr : q.label_en) || q.label_tr || q.id;

  // Filters
  const [fSubject, setFSubject] = useState('');
  const [fLevel, setFLevel] = useState('');
  const [fGroup, setFGroup] = useState('');
  const [fWeek, setFWeek] = useState('');
  const [fSearch, setFSearch] = useState('');

  // Form
  const [open, setOpen] = useState(false);
  const [kind, setKind] = useState<'file' | 'link'>('file');
  const [subjectId, setSubjectId] = useState('');
  const [levelId, setLevelId] = useState('');
  const [groupId, setGroupId] = useState('');
  const [criteria, setCriteria] = useState<string[]>([]);
  const [week, setWeek] = useState('');
  const [visible, setVisible] = useState(true);
  const [title, setTitle] = useState('');
  const [url, setUrl] = useState('');
  const [file, setFile] = useState<File | null>(null);
  const [replacesId, setReplacesId] = useState('');
  const [pendingId, setPendingId] = useState('');
  const [baseline, setBaseline] = useState('');
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState('');
  const fileInput = useRef<HTMLInputElement>(null);
  const formValue = JSON.stringify([
    kind,
    subjectId,
    levelId,
    groupId,
    criteria,
    week,
    visible,
    title,
    url,
  ]);
  const allowLeave = useUnsavedChanges(open && (!!file || formValue !== baseline), lang, busy);
  const locked = !!pendingId || !!replacesId;

  const subject = (data.subjects || []).find((s) => s.id === subjectId);
  const subjectLessons = lessons.filter((c) => c.subject_id === subjectId);
  const formLevels = levelsInUse(subjectLessons, data);
  const formGroups = (data.class_groups || []).filter((g) =>
    subjectLessons.some(
      (c) => c.group_id === g.id && (!levelId || classLevelId(c, data) === levelId),
    ),
  );
  const subjectQuestions = subject ? questions.filter((q) => q.subject_code === subject.code) : [];

  function initialForm() {
    setKind('file');
    setSubjectId(allowedSubjects.length === 1 ? allowedSubjects[0].id : '');
    setLevelId('');
    setGroupId('');
    setCriteria([]);
    setWeek('');
    setVisible(true);
    setTitle('');
    setUrl('');
    setFile(null);
    setReplacesId('');
    setPendingId('');
    setError('');
  }
  function begin(material?: RecordRow, resume = false, prefill?: ReturnType<typeof parseAction>) {
    if (!allowLeave()) return;
    initialForm();
    if (material) {
      setKind('file');
      setSubjectId(material.subject_id || '');
      setLevelId(material.level_id || '');
      setGroupId(material.group_id || '');
      setCriteria(material.criterion_ids || []);
      setWeek(material.week_no ? String(material.week_no) : '');
      setVisible(material.visible_to_guardians !== false);
      setTitle(material.title || '');
      setReplacesId(resume ? material.replaces_id || '' : material.id);
      setPendingId(resume ? material.id : '');
    } else if (prefill) {
      if (allowedSubjects.some((s) => s.id === prefill.subjectId)) setSubjectId(prefill.subjectId);
      if (prefill.criterionId) setCriteria([prefill.criterionId]);
      setWeek(prefill.week);
    }
    setBaseline('');
    setOpen(true);
  }
  // Baseline is captured after the initial state settles so untouched forms are not "dirty".
  useEffect(() => {
    if (open && baseline === '') setBaseline(formValue);
  }, [open, baseline, formValue]);

  const prefillKey = useRef('');
  useEffect(() => {
    const action = props.context?.action;
    if (!action || prefillKey.current === action) return;
    const parsed = parseAction(action);
    if (!parsed) return;
    prefillKey.current = action;
    if (canAdd) begin(undefined, false, parsed);
  }, [props.context?.action]);

  function closeForm() {
    setOpen(false);
    setFile(null);
    setError('');
  }

  const urlOk = /^https:\/\/[^\s/]+\.[^\s]+$/i.test(url.trim());
  const canSubmit =
    !!subjectId &&
    !!title.trim() &&
    (kind === 'link' ? urlOk : !!file) &&
    allowedSubjects.some((s) => s.id === subjectId);

  async function submit() {
    if (!canSubmit || busy) return;
    const weekNo = week ? Number(week) : null;
    if (weekNo !== null && (!Number.isInteger(weekNo) || weekNo < 1 || weekNo > 60)) {
      setError(tr(lang, 'Week must be between 1 and 60.', 'Hafta 1 ile 60 arasında olmalı.'));
      return;
    }
    const common = {
      subject_id: subjectId,
      level_id: levelId || null,
      group_id: groupId || null,
      title: title.trim(),
      owner_id: user.id,
      criterion_ids: criteria,
      week_no: weekNo,
      visible_to_guardians: visible,
    };
    setBusy(true);
    setError('');
    try {
      if (kind === 'link') {
        const link = url.trim();
        await api.save('learning_materials', {
          ...common,
          external_url: link,
          link_kind: detectLinkKind(link),
          status: 'ready',
        });
        setOpen(false);
        await refresh();
        props.notify(tr(lang, 'Link added.', 'Bağlantı eklendi.'));
        return;
      }
      if (!file) return;
      if (
        !MATERIAL_TYPES.includes(file.type) ||
        file.size === 0 ||
        file.size > MATERIAL_MAX_BYTES
      ) {
        setError(
          tr(
            lang,
            'Choose a PDF, Word, PowerPoint, Excel, image or audio file up to 25 MB.',
            'En fazla 25 MB PDF, Word, PowerPoint, Excel, resim veya ses dosyası seçin.',
          ),
        );
        return;
      }
      let row = data.learning_materials?.find((m) => m.id === pendingId);
      if (pendingId && !row)
        throw new Error(
          tr(
            lang,
            'Reload this page before retrying the upload.',
            'Yüklemeyi tekrar denemeden önce sayfayı yenileyin.',
          ),
        );
      if (row && (file.size !== row.file_size || file.type !== row.file_type))
        throw new Error(
          tr(
            lang,
            'Choose the same file to resume the upload.',
            'Yüklemeye devam etmek için aynı dosyayı seçin.',
          ),
        );
      if (!row) {
        const previous = data.learning_materials?.find((m) => m.id === replacesId);
        row = await api.save('learning_materials', {
          ...common,
          package_id: previous?.package_id || null,
          object_key: `${user.id}/${crypto.randomUUID()}`,
          file_type: file.type,
          file_size: file.size,
          status: 'uploading',
          replaces_id: previous?.id || null,
          version: previous ? previous.version + 1 : 1,
        });
        if (!row)
          throw new Error(
            tr(lang, 'The file details could not be saved.', 'Dosya bilgileri kaydedilemedi.'),
          );
        setPendingId(row.id);
      }
      if (!api.uploadMaterial)
        throw new Error(
          tr(
            lang,
            'File storage is unavailable. Contact the school.',
            'Dosya yükleme şu anda kullanılamıyor. Okul yönetimine başvurun.',
          ),
        );
      // Storage verifies the immutable file when resuming a previous upload.
      await api.uploadMaterial(row.object_key, file);
      await api.save('learning_materials', { id: row.id, status: 'ready' });
      setOpen(false);
      setTitle('');
      setFile(null);
      setPendingId('');
      setReplacesId('');
      await refresh();
      props.notify(tr(lang, 'File uploaded.', 'Dosya yüklendi.'));
    } catch (cause) {
      setError(errorText(cause, lang));
      await refresh().catch(() => {});
    } finally {
      setBusy(false);
    }
  }

  const [pageError, setPageError] = useState('');
  async function openMaterial(material: RecordRow) {
    setPageError('');
    if (material.external_url) {
      window.open(material.external_url, '_blank', 'noopener');
      return;
    }
    const popup = window.open('about:blank', '_blank');
    if (popup) popup.opener = null;
    try {
      const signed = await api.materialUrl?.(material.object_key);
      if (!signed)
        throw new Error(
          tr(
            lang,
            'This file is unavailable. Contact the school.',
            'Dosya açılamıyor. Okul yönetimine başvurun.',
          ),
        );
      if (popup) popup.location.replace(signed);
      else window.location.assign(signed);
    } catch (cause) {
      popup?.close();
      setPageError(errorText(cause, lang));
    }
  }
  async function archive(m: RecordRow) {
    const ok = await confirm({
      title: tr(lang, 'Archive this material?', 'Bu materyal arşivlensin mi?'),
      message: m.title,
      confirmLabel: tr(lang, 'Archive', 'Arşivle'),
      danger: true,
    });
    if (!ok) return;
    try {
      await api.save('learning_materials', { id: m.id, status: 'archived' });
      await refresh();
    } catch (cause) {
      setPageError(errorText(cause, lang));
    }
  }
  async function toggleVisible(m: RecordRow) {
    try {
      await api.save('learning_materials', {
        id: m.id,
        visible_to_guardians: m.visible_to_guardians === false,
      });
      await refresh();
    } catch (cause) {
      setPageError(errorText(cause, lang));
    }
  }

  const all = data.learning_materials || [];
  const canManage = (m: RecordRow) => !parentOnly && (manager || m.owner_id === user.id);
  const info = (m: RecordRow) => {
    const legacy = lessons.find((c) => c.id === m.class_id);
    const subjectRow = (data.subjects || []).find(
      (s) => s.id === (m.subject_id || legacy?.subject_id),
    );
    const levelRow = (data.levels || []).find(
      (l) => l.id === (m.level_id || (legacy ? classLevelId(legacy, data) : '')),
    );
    const groupRow = (data.class_groups || []).find(
      (g) => g.id === (m.group_id || legacy?.group_id),
    );
    return { legacy, subjectRow, levelRow, groupRow };
  };
  const materials = all
    .filter((m) => m.status === 'ready')
    .filter((m) => {
      const { subjectRow, levelRow, groupRow } = info(m);
      if (fSubject && subjectRow?.id !== fSubject) return false;
      if (fLevel && levelRow?.id !== fLevel) return false;
      if (fGroup && groupRow?.id !== fGroup) return false;
      if (fWeek && String(m.week_no || '') !== fWeek) return false;
      if (fSearch && !String(m.title).toLowerCase().includes(fSearch.trim().toLowerCase()))
        return false;
      return true;
    });
  const unfinished = all.filter((m) => m.owner_id === user.id && m.status === 'uploading');
  const criterionName = (id: string) => {
    const q = questions.find((x) => x.id === id);
    return q ? questionLabel(q) : id;
  };
  const filterSubjects = (data.subjects || []).filter((s) => s.active !== false);

  return (
    <>
      <PageHeader
        title={tr(lang, 'Learning materials', 'Ders materyalleri')}
        description={tr(
          lang,
          'Files and links shared for lessons.',
          'Dersler için paylaşılan dosya ve bağlantılar.',
        )}
      >
        {canAdd && !!allowedSubjects.length && (
          <Button onClick={() => begin()}>
            <Plus size={16} />
            {tr(lang, 'Add material', 'Materyal ekle')}
          </Button>
        )}
      </PageHeader>
      {!open && <FormError error={pageError} />}
      {!parentOnly && (
        <div className="card padded materials-filters">
          <SelectField
            label={tr(lang, 'Subject', 'Ders')}
            value={fSubject}
            onChange={(e) => setFSubject(e.target.value)}
          >
            <option value="">{tr(lang, 'All subjects', 'Tüm dersler')}</option>
            {filterSubjects.map((s) => (
              <option key={s.id} value={s.id}>
                {label(s, lang)}
              </option>
            ))}
          </SelectField>
          <SelectField
            label={tr(lang, 'Level', 'Seviye')}
            value={fLevel}
            onChange={(e) => setFLevel(e.target.value)}
          >
            <option value="">{tr(lang, 'All levels', 'Tüm seviyeler')}</option>
            {(data.levels || []).map((l) => (
              <option key={l.id} value={l.id}>
                {label(l, lang)}
              </option>
            ))}
          </SelectField>
          <SelectField
            label={tr(lang, 'Class', 'Sınıf')}
            value={fGroup}
            onChange={(e) => setFGroup(e.target.value)}
          >
            <option value="">{tr(lang, 'All classes', 'Tüm sınıflar')}</option>
            {(data.class_groups || []).map((g) => (
              <option key={g.id} value={g.id}>
                {label(g, lang)}
              </option>
            ))}
          </SelectField>
          <Field
            label={tr(lang, 'Week', 'Hafta')}
            type="number"
            min={1}
            max={60}
            value={fWeek}
            onChange={(e) => setFWeek(e.target.value)}
          />
          <SearchField
            label={tr(lang, 'Search title', 'Başlıkta ara')}
            value={fSearch}
            onChange={(e) => setFSearch(e.target.value)}
          />
        </div>
      )}
      {!!unfinished.length && (
        <section className="card">
          <div className="card-header">
            <h3>{tr(lang, 'Unfinished uploads', 'Tamamlanmamış yüklemeler')}</h3>
          </div>
          <div className="padded">
            {unfinished.map((m) => (
              <div className="task-row" key={m.id}>
                <span>
                  {m.title} · v{m.version}
                </span>
                <Button variant="secondary" onClick={() => begin(m, true)}>
                  {tr(lang, 'Resume upload', 'Yüklemeye devam et')}
                </Button>
              </div>
            ))}
            <p className="form-hint">
              {tr(
                lang,
                'Choose the same file to resume the upload.',
                'Yüklemeye devam etmek için aynı dosyayı seçin.',
              )}
            </p>
          </div>
        </section>
      )}
      <div className="task-grid">
        {materials.map((m) => {
          const { legacy, subjectRow, levelRow, groupRow } = info(m);
          const Icon = materialIcon(m);
          const meta = [
            legacy?.name,
            subjectRow && !legacy ? label(subjectRow, lang) : '',
            levelRow ? label(levelRow, lang) : '',
            groupRow ? label(groupRow, lang) : '',
            m.week_no ? tr(lang, `Week ${m.week_no}`, `Hafta ${m.week_no}`) : '',
          ].filter(Boolean);
          const ids: string[] = m.criterion_ids || [];
          const mine = canManage(m);
          return (
            <article className="card task-card material-card" key={m.id}>
              <div className="material-head">
                <span className="material-icon" aria-hidden="true">
                  <Icon size={20} />
                </span>
                <h3>{m.title}</h3>
              </div>
              {!!meta.length && <p>{meta.join(' · ')}</p>}
              {!!ids.length && !parentOnly && (
                <div className="material-chips">
                  {ids.slice(0, 3).map((id) => (
                    <span className="material-chip" key={id}>
                      {criterionName(id)}
                    </span>
                  ))}
                  {ids.length > 3 && <span className="material-chip">+{ids.length - 3}</span>}
                </div>
              )}
              {!parentOnly && (
                <div>
                  {m.visible_to_guardians === false ? (
                    <Badge tone="neutral">{tr(lang, 'Staff only', 'Yalnız personel')}</Badge>
                  ) : (
                    <Badge tone="green">{tr(lang, 'Visible to guardians', 'Velilere açık')}</Badge>
                  )}
                </div>
              )}
              <small>
                {m.file_size
                  ? `${(m.file_size / 1024 / 1024).toFixed(1)} MB · v${m.version}`
                  : m.external_url
                    ? tr(lang, 'Link', 'Bağlantı')
                    : tr(lang, 'School resource', 'Okulun paylaştığı dosya')}
              </small>
              <div className="inline-actions">
                <Button onClick={() => void openMaterial(m)}>{tr(lang, 'Open', 'Aç')}</Button>
                {mine && (
                  <>
                    {!m.external_url && (
                      <Button variant="secondary" onClick={() => begin(m)}>
                        <Upload size={14} />
                        {tr(lang, 'Upload new version', 'Yeni sürüm yükle')}
                      </Button>
                    )}
                    <Button variant="secondary" onClick={() => void toggleVisible(m)}>
                      {m.visible_to_guardians === false
                        ? tr(lang, 'Show to guardians', 'Velilere aç')
                        : tr(lang, 'Hide from guardians', 'Velilere kapat')}
                    </Button>
                    <Button variant="ghost" onClick={() => void archive(m)}>
                      {tr(lang, 'Archive', 'Arşivle')}
                    </Button>
                  </>
                )}
              </div>
            </article>
          );
        })}
      </div>
      {!materials.length && (
        <EmptyState
          title={tr(lang, 'No materials yet', 'Henüz materyal yok')}
          description={tr(
            lang,
            'Files and links shared for lessons appear here.',
            'Dersler için paylaşılan dosya ve bağlantılar burada görünür.',
          )}
        />
      )}
      {confirmDialog}
      {open && (
        <Modal
          lang={lang}
          title={
            pendingId
              ? tr(lang, 'Resume upload', 'Yüklemeye devam et')
              : replacesId
                ? tr(lang, 'Upload new version', 'Yeni sürüm yükle')
                : tr(lang, 'Add material', 'Materyal ekle')
          }
          onClose={closeForm}
          bare
        >
          <form
            onSubmit={(e) => {
              e.preventDefault();
              void submit();
            }}
          >
            <div className="modal-body stack">
              <FormError error={error} />
              <fieldset disabled={busy} className="fieldset-reset stack">
                {!locked && (
                  <div className="segmented" role="group" aria-label={tr(lang, 'Type', 'Tür')}>
                    <button
                      type="button"
                      className={kind === 'file' ? 'active' : ''}
                      aria-pressed={kind === 'file'}
                      onClick={() => setKind('file')}
                    >
                      {tr(lang, 'File', 'Dosya')}
                    </button>
                    <button
                      type="button"
                      className={kind === 'link' ? 'active' : ''}
                      aria-pressed={kind === 'link'}
                      onClick={() => setKind('link')}
                    >
                      {tr(lang, 'Link', 'Bağlantı')}
                    </button>
                  </div>
                )}
                <SelectField
                  label={tr(lang, 'Subject', 'Ders')}
                  required
                  value={subjectId}
                  disabled={locked}
                  onChange={(e) => {
                    setSubjectId(e.target.value);
                    setLevelId('');
                    setGroupId('');
                    setCriteria([]);
                  }}
                >
                  <option value="">{tr(lang, 'Choose a subject', 'Ders seçin')}</option>
                  {allowedSubjects.map((s) => (
                    <option key={s.id} value={s.id}>
                      {label(s, lang)}
                    </option>
                  ))}
                </SelectField>
                <SelectField
                  label={tr(lang, 'Level', 'Seviye')}
                  value={levelId}
                  disabled={locked}
                  onChange={(e) => {
                    setLevelId(e.target.value);
                    setGroupId('');
                  }}
                >
                  <option value="">{tr(lang, 'All levels', 'Tüm seviyeler')}</option>
                  {formLevels.map((l) => (
                    <option key={l.id} value={l.id}>
                      {label(l, lang)}
                    </option>
                  ))}
                </SelectField>
                <SelectField
                  label={tr(lang, 'Class', 'Sınıf')}
                  value={groupId}
                  disabled={locked}
                  onChange={(e) => setGroupId(e.target.value)}
                >
                  <option value="">{tr(lang, 'All classes', 'Tüm sınıflar')}</option>
                  {formGroups.map((g) => (
                    <option key={g.id} value={g.id}>
                      {label(g, lang)}
                    </option>
                  ))}
                </SelectField>
                {!!subjectQuestions.length && (
                  <fieldset className="field material-outcomes" disabled={locked}>
                    <legend>{tr(lang, 'Learning outcomes', 'Kazanımlar')}</legend>
                    <div className="material-outcome-list">
                      {subjectQuestions.map((q) => (
                        <label className="check-row" key={q.id}>
                          <input
                            type="checkbox"
                            checked={criteria.includes(q.id)}
                            onChange={(e) =>
                              setCriteria(
                                e.target.checked
                                  ? [...criteria, q.id]
                                  : criteria.filter((id) => id !== q.id),
                              )
                            }
                          />
                          <span>{questionLabel(q)}</span>
                        </label>
                      ))}
                    </div>
                  </fieldset>
                )}
                <Field
                  label={tr(lang, 'Week', 'Hafta')}
                  type="number"
                  min={1}
                  max={60}
                  value={week}
                  disabled={locked}
                  onChange={(e) => setWeek(e.target.value)}
                />
                <label className="check-row">
                  <input
                    type="checkbox"
                    checked={visible}
                    disabled={locked}
                    onChange={(e) => setVisible(e.target.checked)}
                  />
                  <span>{tr(lang, 'Visible to guardians', 'Veliler görebilsin')}</span>
                </label>
                <Field
                  label={tr(lang, 'Title', 'Başlık')}
                  required
                  maxLength={200}
                  value={title}
                  disabled={!!pendingId}
                  onChange={(e) => setTitle(e.target.value)}
                />
                {kind === 'link' ? (
                  <Field
                    label={tr(lang, 'Link (https://)', 'Bağlantı (https://)')}
                    type="url"
                    required
                    placeholder="https://"
                    value={url}
                    onChange={(e) => setUrl(e.target.value)}
                    hint={tr(
                      lang,
                      'Videos are added as YouTube or Drive links.',
                      'Videolar YouTube veya Drive bağlantısı olarak eklenir',
                    )}
                  />
                ) : (
                  <div className="field">
                    <span>
                      {tr(
                        lang,
                        'PDF, Word, PowerPoint, Excel, image or audio (up to 25 MB)',
                        'PDF, Word, PowerPoint, Excel, resim veya ses (en fazla 25 MB)',
                      )}
                    </span>
                    <input
                      ref={fileInput}
                      hidden
                      tabIndex={-1}
                      aria-label={tr(lang, 'Material file', 'Materyal dosyası')}
                      type="file"
                      accept={FILE_ACCEPT}
                      onChange={(e) => setFile(e.target.files?.[0] || null)}
                    />
                    <div className="file-picker">
                      <Button variant="secondary" onClick={() => fileInput.current?.click()}>
                        {tr(lang, 'Choose file', 'Dosya seç')}
                      </Button>
                      <span aria-live="polite">
                        {file?.name || tr(lang, 'No file selected', 'Dosya seçilmedi')}
                      </span>
                    </div>
                  </div>
                )}
              </fieldset>
            </div>
            <FormActions
              busy={busy}
              lang={lang}
              onCancel={closeForm}
              disabled={!canSubmit}
              submit={kind === 'link' ? tr(lang, 'Add', 'Ekle') : tr(lang, 'Upload', 'Yükle')}
            />
          </form>
        </Modal>
      )}
    </>
  );
}
