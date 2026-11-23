import { Fragment, useEffect, useState } from 'react';
import {
  Check,
  ChevronDown,
  ClipboardCheck,
  Eye,
  FileCheck2,
  Printer,
  Plus,
  Save,
  Send,
  Sparkles,
} from 'lucide-react';
import type { PageProps, RecordRow, Lang, Snapshot } from '../types';
import {
  classLevelId,
  levelsInUse,
  activeStudentEnrollment,
  materialLessons,
  planWeek,
  schoolDay,
  schoolTimezone,
  todaySession,
  useUnsavedChanges,
} from '../workflow';
import { useDraft, DraftStatus } from '../drafts';
import {
  Badge,
  Button,
  EmptyState,
  Field,
  Modal,
  SelectField,
  TextArea,
  PageHeader,
  errorText,
  fullName,
  label,
  tr,
  useConfirm,
  componentLabel,
} from '../ui';
/** Report calculations list missing data in English codes; show them in plain words. */
function missingRecordLabel(item: string, lang: Lang) {
  const fixed: Record<string, [string, string]> = {
    Attendance: ['Attendance', 'Yoklama'],
    'Academic subjects': ['Subject assessments', 'Ders değerlendirmeleri'],
  };
  if (fixed[item]) return tr(lang, ...fixed[item]);
  const code = /^(A[3-6]) /.exec(item)?.[1];
  if (code) return componentLabel(code, lang);
  if (item.startsWith('Attendance: '))
    return `${tr(lang, 'Attendance', 'Yoklama')}: ${item.slice(12)}`;
  if (item.startsWith('Subject: ')) return `${tr(lang, 'Subject', 'Ders')}: ${item.slice(9)}`;
  return item;
}
const date = (value: string, lang: Lang, timeZone: string) =>
  new Date(value).toLocaleString(lang === 'tr' ? 'tr-TR' : 'en-GB', {
    dateStyle: 'medium',
    timeStyle: 'short',
    timeZone,
  });
function defaultPeriod(data: Snapshot, yearId?: string) {
  const day = new Intl.DateTimeFormat('en-CA', {
    timeZone: data.school_settings[0]?.timezone || 'Europe/Warsaw',
    year: 'numeric',
    month: '2-digit',
    day: '2-digit',
  }).format(new Date());
  const periods = data.periods
    .filter((p) => !yearId || p.academic_year_id === yearId)
    .slice()
    .sort((a, b) => Number(a.number) - Number(b.number));
  return (
    (
      periods.find((p) => p.starts_on && p.ends_on && p.starts_on <= day && p.ends_on >= day) ||
      periods[0]
    )?.id || ''
  );
}
export function CurriculumPage({
  data,
  lang,
  api,
  refresh,
  notify,
  user,
  context,
  navigate,
}: PageProps) {
  const management = user.roles.some((r) => ['administrator', 'academic_manager'].includes(r));
  const canAdd = user.roles.includes('administrator');
  // Lessons this person may see: all for management, their own for teachers.
  const lessons = data.classes.filter((c) => c.active && (management || c.teacher_id === user.id));
  // A class group holds several lessons; a lesson without a group stands alone.
  const groups = [
    ...data.class_groups
      .filter((g) => lessons.some((c) => c.group_id === g.id))
      .map((g) => ({ id: g.id as string, name: g.name as string })),
    ...lessons
      .filter((c) => !c.group_id || !data.class_groups.some((g) => g.id === c.group_id))
      .map((c) => ({ id: `lesson:${c.id}`, name: c.name as string })),
  ].sort((a, b) => a.name.localeCompare(b.name, lang));
  const contextualLesson = lessons.find((c) => c.id === context?.classId);
  const [groupId, setGroupId] = useState(
    contextualLesson
      ? contextualLesson.group_id || `lesson:${contextualLesson.id}`
      : groups[0]?.id || '',
  );
  const [coverage, setCoverage] = useState<Record<string, boolean>>({});
  const [busy, setBusy] = useState('');
  // Outcomes whose materials list is open, keyed lesson+criterion (see `key`).
  const [openMaterials, setOpenMaterials] = useState<Set<string>>(new Set());
  const toggleMaterials = (id: string) =>
    setOpenMaterials((prev) => {
      const next = new Set(prev);
      if (!next.delete(id)) next.add(id);
      return next;
    });
  const cfg = data.configurations
    .filter((c) => c.kind === 'assessment' && c.status === 'published')
    .sort((a, b) => b.version - a.version)[0];
  const groupLessons = groupId.startsWith('lesson:')
    ? lessons.filter((c) => c.id === groupId.slice(7))
    : lessons.filter((c) => c.group_id === groupId);
  const questionsFor = (lesson: RecordRow) => {
    const subject = data.subjects.find((s) => s.id === lesson.subject_id);
    return (cfg?.body.questions || [])
      .filter((q: any) => q.subject_code === subject?.code)
      .sort((a: any, b: any) => (a.order || 0) - (b.order || 0));
  };
  const progress = (lessonId: string, criterion: string) =>
    data.curriculum_progress.find(
      (p) =>
        p.class_id === lessonId && p.configuration_id === cfg?.id && p.criterion_id === criterion,
    );
  const key = (lessonId: string, criterion: string) => `${lessonId}|${criterion}`;
  const today = schoolDay(new Date(), schoolTimezone(data));
  const weekOf = (lessonId: string, criterion: string) =>
    data.curriculum_weeks.find((w) => w.class_id === lessonId && w.criterion_id === criterion)
      ?.week_no ?? null;
  const materialsFor = (lesson: RecordRow, criterion: string) =>
    data.learning_materials.filter(
      (m) =>
        m.status === 'ready' &&
        (m.criterion_ids || []).includes(criterion) &&
        materialLessons(m, data).some((c) => c.id === lesson.id),
    );
  async function saveWeek(lesson: RecordRow, criterion: string, value: string) {
    try {
      await api.save('curriculum_weeks', {
        class_id: lesson.id,
        criterion_id: criterion,
        week_no: value ? Number(value) : null,
      });
      await refresh(['curriculum_weeks']);
    } catch (e) {
      notify(errorText(e, lang), 'error');
    }
  }
  async function openMaterial(material: RecordRow) {
    if (material.external_url) {
      window.open(material.external_url, '_blank', 'noopener');
      return;
    }
    const tab = window.open('', '_blank');
    try {
      const url = await api.materialUrl?.(material.object_key);
      if (tab && url) tab.location.href = url;
    } catch (e) {
      tab?.close();
      notify(errorText(e, lang), 'error');
    }
  }
  const baseline = (lesson: RecordRow, criterion: string) => {
    const row = progress(lesson.id, criterion);
    return lesson.teacher_id === user.id ? !!row?.taught : !!(row?.pending_taught ?? row?.taught);
  };
  const dirty = groupLessons.some((lesson) =>
    questionsFor(lesson).some(
      (q: any) =>
        coverage[key(lesson.id, q.id)] !== undefined &&
        coverage[key(lesson.id, q.id)] !== baseline(lesson, q.id),
    ),
  );
  const allowLeave = useUnsavedChanges(dirty, lang, !!busy);
  useEffect(() => {
    // Teachers start from the confirmed state; others from what they last asked for.
    const next: Record<string, boolean> = {};
    for (const lesson of groupLessons)
      for (const q of questionsFor(lesson)) next[key(lesson.id, q.id)] = baseline(lesson, q.id);
    setCoverage(next);
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [groupId, cfg?.id]);
  const write = async (lesson: RecordRow, values: Record<string, boolean>, message: string) => {
    if (!cfg || busy) return;
    setBusy(lesson.id);
    try {
      await api.rpc('save_curriculum_batch', {
        p_class_id: lesson.id,
        p_configuration_id: cfg.id,
        p_rows: Object.entries(values).map(([criterion_id, taught]) => ({ criterion_id, taught })),
      });
      setCoverage((previous) => ({
        ...previous,
        ...Object.fromEntries(
          Object.entries(values).map(([criterion, taught]) => [key(lesson.id, criterion), taught]),
        ),
      }));
      await refresh(['curriculum_progress']);
      notify(message);
    } catch (e) {
      notify(errorText(e, lang), 'error');
    } finally {
      setBusy('');
    }
  };
  const teacherName = (lesson: RecordRow) =>
    label(
      data.profiles.find((p) => p.id === lesson.teacher_id),
      lang,
    );
  const totalPending = groupLessons.reduce(
    (sum, lesson) =>
      sum +
      questionsFor(lesson).filter((q: any) => progress(lesson.id, q.id)?.pending_taught != null)
        .length,
    0,
  );
  return (
    <>
      <PageHeader
        eyebrow={tr(lang, 'Learning with intention', 'Bilinçli öğrenme')}
        title={tr(lang, 'Curriculum coverage', 'Müfredat takibi')}
        description={tr(
          lang,
          'Follow the learning outcomes covered in each lesson.',
          'Derslerde işlenen kazanımları buradan takip edebilirsiniz.',
        )}
      >
        {totalPending > 0 && (
          <Badge tone="orange">
            {totalPending} {tr(lang, 'awaiting approval', 'onay bekliyor')}
          </Badge>
        )}
      </PageHeader>
      <div className="card padded">
        <div className="form-grid">
          <SelectField
            label={tr(lang, 'Class', 'Sınıf')}
            value={groupId}
            onChange={(e) => {
              if (allowLeave()) setGroupId(e.target.value);
            }}
          >
            {groups.map((g) => (
              <option key={g.id} value={g.id}>
                {g.name}
              </option>
            ))}
          </SelectField>
          <div>
            <h3>
              {groupLessons.length} {tr(lang, 'lessons', 'ders')}
            </h3>
            <p className="muted">
              {tr(lang, 'Curriculum version', 'Müfredat sürümü')} {cfg?.version || '—'}
            </p>
          </div>
        </div>
      </div>
      {!groupLessons.length && (
        <EmptyState title={tr(lang, 'No lessons in this class yet', 'Bu sınıfta henüz ders yok')} />
      )}
      {groupLessons.map((lesson) => {
        const subject = data.subjects.find((s) => s.id === lesson.subject_id);
        const questions = questionsFor(lesson);
        const isTeacher = lesson.teacher_id === user.id;
        const canEdit = isTeacher || management;
        const currentWeek = planWeek(lesson, today);
        const taughtCount = questions.filter((q: any) => progress(lesson.id, q.id)?.taught).length;
        const pending = questions.filter(
          (q: any) => progress(lesson.id, q.id)?.pending_taught != null,
        );
        const changed = Object.fromEntries(
          questions
            .map((q: any): [string, boolean] => [q.id, !!coverage[key(lesson.id, q.id)]])
            .filter(
              ([criterion, value]: [string, boolean]) => value !== baseline(lesson, criterion),
            ),
        );
        return (
          <section className="card" key={lesson.id}>
            <div className="card-header">
              <div>
                <h3>{label(subject, lang)}</h3>
                <p className="muted">
                  {lesson.name} · {tr(lang, 'Teacher', 'Öğretmen')}: {teacherName(lesson)}
                </p>
              </div>
              <div className="badge-row">
                {currentWeek && (
                  <Badge tone="neutral">
                    {tr(lang, `Week ${currentWeek}`, `Bu hafta: ${currentWeek}. hafta`)}
                  </Badge>
                )}
                {pending.length > 0 && (
                  <Badge tone="orange">
                    {pending.length} {tr(lang, 'awaiting approval', 'onay bekliyor')}
                  </Badge>
                )}
                {!!questions.length && (
                  <Badge tone="green">
                    {taughtCount} / {questions.length} {tr(lang, 'taught', 'işlendi')}
                  </Badge>
                )}
                {canAdd && cfg && subject && questions.length > 0 && (
                  <Button
                    variant="secondary"
                    onClick={() =>
                      navigate?.('configuration', { classId: lesson.id, action: 'add_outcome' })
                    }
                  >
                    <Plus size={16} />
                    {tr(lang, 'Add learning outcome', 'Kazanım ekle')}
                  </Button>
                )}
              </div>
            </div>
            {isTeacher && pending.length > 0 && (
              <div className="approval-banner">
                <span>
                  {tr(
                    lang,
                    `${pending.length} change(s) by management are waiting for your approval.`,
                    `Yönetimin yaptığı ${pending.length} değişiklik onayınızı bekliyor.`,
                  )}
                </span>
                <Button
                  variant="primary"
                  disabled={!!busy}
                  onClick={() =>
                    void write(
                      lesson,
                      Object.fromEntries(
                        pending.map((q: any) => [
                          q.id,
                          !!progress(lesson.id, q.id)?.pending_taught,
                        ]),
                      ),
                      tr(lang, 'Changes approved.', 'Değişiklikler onaylandı.'),
                    )
                  }
                >
                  {tr(lang, 'Approve all', 'Tümünü onayla')}
                </Button>
              </div>
            )}
            {questions.length ? (
              <div className="table-wrap">
                <table className="data-table">
                  <thead>
                    <tr>
                      <th scope="col">{tr(lang, 'Criterion', 'Ölçüt')}</th>
                      <th scope="col">{tr(lang, 'Learning outcome', 'Kazanım')}</th>
                      <th scope="col">{tr(lang, 'Week', 'Hafta')}</th>
                      <th scope="col">{tr(lang, 'Materials', 'Materyaller')}</th>
                      <th scope="col">{tr(lang, 'Taught', 'İşlendi')}</th>
                      <th scope="col">{tr(lang, 'Approval', 'Onay')}</th>
                    </tr>
                  </thead>
                  <tbody>
                    {questions.map((q: any) => {
                      const row = progress(lesson.id, q.id);
                      const waiting = row?.pending_taught != null;
                      const requesterProfile = data.profiles.find(
                        (p) => p.id === row?.requested_by,
                      );
                      const requester = waiting
                        ? requesterProfile
                          ? label(requesterProfile, lang)
                          : tr(lang, 'Management', 'Yönetim')
                        : '';
                      const week = weekOf(lesson.id, q.id);
                      const late = !!week && !!currentWeek && week < currentWeek && !row?.taught;
                      const materials = materialsFor(lesson, q.id);
                      const openKey = key(lesson.id, q.id);
                      const materialsOpen = openMaterials.has(openKey);
                      const newMaterial = (
                        <button
                          type="button"
                          className="text-button"
                          onClick={() =>
                            navigate?.('materials', {
                              action: `new:${lesson.subject_id}:${q.id}:${week ?? ''}`,
                            })
                          }
                        >
                          + {tr(lang, 'Material', 'Materyal')}
                        </button>
                      );
                      return (
                        <Fragment key={q.id}>
                          <tr
                            className={
                              [waiting ? 'row-pending' : '', late ? 'row-late' : '']
                                .filter(Boolean)
                                .join(' ') || undefined
                            }
                          >
                            <td>
                              <span className="question-code">{q.id}</span>
                            </td>
                            <td>
                              {q[`label_${lang}`]}
                              {late && (
                                <small className="late-note">
                                  {tr(lang, 'Planned week has passed', 'Planlanan hafta geçti')}
                                </small>
                              )}
                            </td>
                            <td>
                              <select
                                className="week-select"
                                value={week ?? ''}
                                disabled={!canEdit}
                                aria-label={`${tr(lang, 'Week', 'Hafta')}: ${q[`label_${lang}`]}`}
                                onChange={(e) => void saveWeek(lesson, q.id, e.target.value)}
                              >
                                <option value="">—</option>
                                {Array.from({ length: 60 }, (_, i) => i + 1).map((n) => (
                                  <option key={n} value={n}>
                                    {n}
                                  </option>
                                ))}
                              </select>
                            </td>
                            <td>
                              {materials.length > 0 ? (
                                <button
                                  type="button"
                                  className="materials-toggle"
                                  aria-expanded={materialsOpen}
                                  onClick={() => toggleMaterials(openKey)}
                                >
                                  {tr(lang, 'Materials', 'Materyaller')} ({materials.length})
                                  <ChevronDown size={14} className={materialsOpen ? 'open' : ''} />
                                </button>
                              ) : canEdit ? (
                                newMaterial
                              ) : (
                                '—'
                              )}
                            </td>
                            <td>
                              <label className="checkbox-label">
                                <input
                                  type="checkbox"
                                  disabled={!canEdit}
                                  checked={coverage[key(lesson.id, q.id)] || false}
                                  onChange={(e) =>
                                    setCoverage({
                                      ...coverage,
                                      [key(lesson.id, q.id)]: e.target.checked,
                                    })
                                  }
                                />
                                {coverage[key(lesson.id, q.id)]
                                  ? tr(lang, 'Taught', 'İşlendi')
                                  : tr(lang, 'Not yet', 'Henüz değil')}
                              </label>
                            </td>
                            <td>
                              {waiting ? (
                                <div className="approval-cell">
                                  <span className="badge badge-orange">
                                    {tr(lang, 'Awaiting teacher', 'Onay bekliyor')}:{' '}
                                    {row?.pending_taught
                                      ? tr(lang, 'taught', 'işlendi')
                                      : tr(lang, 'not taught', 'işlenmedi')}
                                  </span>
                                  <small className="muted">
                                    {requester}
                                    {row?.requested_at
                                      ? ` · ${new Date(row.requested_at).toLocaleDateString(lang === 'tr' ? 'tr-TR' : 'en-GB')}`
                                      : ''}
                                  </small>
                                  {isTeacher && (
                                    <span className="row-actions">
                                      <Button
                                        variant="secondary"
                                        disabled={!!busy}
                                        onClick={() =>
                                          void write(
                                            lesson,
                                            { [q.id]: !!row?.pending_taught },
                                            tr(lang, 'Change approved.', 'Değişiklik onaylandı.'),
                                          )
                                        }
                                      >
                                        {tr(lang, 'Approve', 'Onayla')}
                                      </Button>
                                      <Button
                                        variant="ghost"
                                        disabled={!!busy}
                                        onClick={() =>
                                          void write(
                                            lesson,
                                            { [q.id]: !!row?.taught },
                                            tr(lang, 'Change rejected.', 'Değişiklik reddedildi.'),
                                          )
                                        }
                                      >
                                        {tr(lang, 'Reject', 'Reddet')}
                                      </Button>
                                    </span>
                                  )}
                                </div>
                              ) : (
                                <span className="muted">—</span>
                              )}
                            </td>
                          </tr>
                          {materialsOpen && (
                            <tr className="outcome-materials">
                              <td colSpan={6}>
                                <ul className="outcome-materials-list">
                                  {materials.map((m) => (
                                    <li key={m.id}>
                                      <span aria-hidden="true">{m.external_url ? '🔗' : '📄'}</span>
                                      <button
                                        type="button"
                                        className="text-button"
                                        title={m.title}
                                        onClick={() => void openMaterial(m)}
                                      >
                                        {m.title}
                                      </button>
                                      {m.week_no ? (
                                        <small className="muted">
                                          {tr(lang, `Week ${m.week_no}`, `${m.week_no}. hafta`)}
                                        </small>
                                      ) : null}
                                      <Badge tone={m.visible_to_guardians ? 'green' : 'neutral'}>
                                        {m.visible_to_guardians
                                          ? tr(lang, 'Visible to guardians', 'Velilere açık')
                                          : tr(lang, 'Hidden from guardians', 'Velilere kapalı')}
                                      </Badge>
                                    </li>
                                  ))}
                                </ul>
                                {canEdit && newMaterial}
                              </td>
                            </tr>
                          )}
                        </Fragment>
                      );
                    })}
                  </tbody>
                </table>
              </div>
            ) : (
              <EmptyState
                title={tr(
                  lang,
                  'Learning outcomes have not been added for this lesson yet.',
                  'Bu dersin kazanımları henüz eklenmedi.',
                )}
              >
                {canAdd && cfg && subject && (
                  <Button
                    variant="secondary"
                    onClick={() =>
                      navigate?.('configuration', { classId: lesson.id, action: 'add_outcome' })
                    }
                  >
                    <Plus size={16} />
                    {tr(lang, 'Add learning outcome', 'Kazanım ekle')}
                  </Button>
                )}
              </EmptyState>
            )}
            {canEdit && questions.length > 0 && (
              <div className="table-footer">
                <span>
                  {isTeacher
                    ? tr(
                        lang,
                        'Untaught topics are excluded from academic averages.',
                        'İşlenmeyen konular akademik ortalamaya katılmaz.',
                      )
                    : tr(
                        lang,
                        'Your changes are sent to the lesson’s teacher and apply once approved.',
                        'Değişiklikleriniz dersin öğretmenine gider; onaylanınca geçerli olur.',
                      )}
                </span>
                <Button
                  disabled={!!busy || !Object.keys(changed).length}
                  onClick={() =>
                    void write(
                      lesson,
                      changed,
                      isTeacher
                        ? tr(lang, 'Curriculum saved.', 'Müfredat kaydedildi.')
                        : tr(
                            lang,
                            'Sent to the teacher for approval.',
                            'Öğretmenin onayına gönderildi.',
                          ),
                    )
                  }
                >
                  <Save size={16} />
                  {busy === lesson.id
                    ? tr(lang, 'Saving…', 'Kaydediliyor…')
                    : isTeacher
                      ? tr(lang, 'Save coverage', 'Müfredatı kaydet')
                      : tr(lang, 'Send for approval', 'Onaya gönder')}
                </Button>
              </div>
            )}
          </section>
        );
      })}
    </>
  );
}

export function AttendancePage(props: PageProps) {
  const { data, lang, api, refresh, notify, user, context } = props;
  const classes = data.classes.filter(
    (c) =>
      c.active &&
      (user.roles.some((r) => ['administrator', 'academic_manager'].includes(r)) ||
        c.teacher_id === user.id),
  );
  const timezone = schoolTimezone(data);
  // No automatic class: the page lists today's lessons and the user picks one.
  const initialClass = classes.find((c) => c.id === context?.classId);
  const levels = levelsInUse(classes, data);
  // The remembered level applies unless a link opened a class from another level.
  const [levelId, setLevelId] = useState(() => {
    try {
      const saved = localStorage.getItem('portal-attendance-level') || '';
      return levels.some((level) => level.id === saved) &&
        (!context?.classId || classLevelId(initialClass || {}, data) === saved)
        ? saved
        : '';
    } catch {
      return '';
    }
  });
  const startClass =
    levelId && initialClass && classLevelId(initialClass, data) !== levelId
      ? classes.find((c) => classLevelId(c, data) === levelId)
      : initialClass;
  const [classId, setClassId] = useState(startClass?.id || '');
  const levelClasses = levelId ? classes.filter((c) => classLevelId(c, data) === levelId) : classes;
  // Group the class list by level so mixed lists stay readable.
  const classGroups = [
    ...levels.map((level) => ({
      id: level.id,
      name: label(level, lang),
      items: levelClasses.filter((c) => classLevelId(c, data) === level.id),
    })),
    {
      id: '',
      name: tr(lang, 'No level', 'Seviyesiz'),
      items: levelClasses.filter((c) => !classLevelId(c, data)),
    },
  ].filter((group) => group.items.length);
  const [sessionId, setSessionId] = useState(
    context?.sessionId ||
      todaySession(
        data.sessions.filter((s) => s.class_id === startClass?.id),
        timezone,
      ),
  );
  const [busy, setBusy] = useState(false);
  const [formError, setFormError] = useState('');
  const [finalized, setFinalized] = useState(false);
  const today = schoolDay(new Date(), timezone);
  const classSessions = data.sessions.filter(
    (s) => s.class_id === classId && s.status !== 'cancelled',
  );
  // Today and past lessons first (newest on top); upcoming lessons are listed but locked.
  const sessions = classSessions
    .filter((s) => schoolDay(s.starts_at, timezone) <= today)
    .sort((a, b) => b.starts_at.localeCompare(a.starts_at));
  const upcoming = classSessions
    .filter((s) => schoolDay(s.starts_at, timezone) > today)
    .sort((a, b) => a.starts_at.localeCompare(b.starts_at));
  const session = [...sessions, ...upcoming].find((s) => s.id === sessionId);
  const future = !!session && schoolDay(session.starts_at, timezone) > today;
  const management = user.roles.some((r) => ['administrator', 'academic_manager'].includes(r));
  const timeText = (value: string) =>
    new Date(value).toLocaleTimeString(lang === 'tr' ? 'tr-TR' : 'en-GB', {
      hour: '2-digit',
      minute: '2-digit',
      hour12: false,
      timeZone: timezone,
    });
  const todayLessons = classes
    .flatMap((c) =>
      data.sessions
        .filter(
          (s) =>
            s.class_id === c.id &&
            s.status !== 'cancelled' &&
            schoolDay(s.starts_at, timezone) === today,
        )
        .map((s) => ({ s, c })),
    )
    .sort((a, b) => a.s.starts_at.localeCompare(b.s.starts_at));
  const chooseClass = (next: string) => {
    setClassId(next);
    setSessionId(
      todaySession(
        data.sessions.filter((s) => s.class_id === next),
        timezone,
      ),
    );
  };
  const initialRows = (() => {
    const day = session ? schoolDay(session.starts_at, timezone) : undefined;
    const enrolled = data.enrollments.filter(
      (e) =>
        e.class_id === classId &&
        (!day || e.started_on <= day) &&
        (!e.ended_on || !day || e.ended_on >= day) &&
        (activeStudentEnrollment(e, data) ||
          data.attendance.some(
            (a) => a.session_id === session?.id && a.student_id === e.student_id,
          )),
    );
    return enrolled.map((e) => {
      const old = data.attendance.find(
        (a) => a.session_id === session?.id && a.student_id === e.student_id,
      );
      return {
        student_id: e.student_id,
        status: '',
        late_minutes: 0,
        participation: '',
        camera_issue: false,
        microphone_issue: false,
        excused: false,
        excuse_reason: '',
        ...old,
      };
    });
  })();
  // Future lessons have no draft: the server refuses attendance before the lesson day.
  const draft = useDraft<any[]>(
    props,
    'attendance',
    future ? '' : session?.id || '',
    initialRows,
    !!session && !future,
  );
  const rows = draft.body;
  const setRows = draft.edit;
  useUnsavedChanges(false, lang, busy);
  useEffect(() => {
    setFormError('');
    setFinalized(false);
  }, [session?.id]);
  const change = (id: string, values: any) => {
    setRows(rows.map((r) => (r.student_id === id ? { ...r, ...values } : r)));
    setFinalized(false);
  };
  async function save() {
    if (!session || busy) return;
    const invalid = rows.find(
      (r) =>
        !['present', 'late', 'absent'].includes(r.status) ||
        (r.status !== 'absent' &&
          (r.participation === '' ||
            r.participation == null ||
            Number(r.participation) < 1 ||
            Number(r.participation) > 5)) ||
        (r.excused && !String(r.excuse_reason || '').trim()),
    );
    if (invalid) {
      setFormError(
        `${fullName(data.students.find((s) => s.id === invalid.student_id))}: ${tr(lang, 'Check attendance, participation and any exception reason.', 'Yoklama, katılım ve istisna gerekçesini kontrol edin.')}`,
      );
      return;
    }
    setBusy(true);
    setFormError('');
    try {
      const revision = await draft.flush();
      await api.rpc('finalize_attendance', { p_session_id: session.id, p_revision: revision });
      draft.finalized();
      setFinalized(true);
      try {
        await refresh([
          'attendance',
          'sessions',
          'guidance_cases',
          'guidance_notes',
          'parent_guidance',
        ]);
      } catch {
        notify(
          tr(lang, 'Saved. The summary could not refresh.', 'Kaydedildi. Özet yenilenemedi.'),
          'error',
        );
      }
      window.setTimeout(() => void draft.reload(), 0);
      notify(tr(lang, 'Attendance submitted.', 'Yoklama gönderildi.'));
    } catch (e) {
      setFormError(errorText(e, lang));
      notify(errorText(e, lang), 'error');
    } finally {
      setBusy(false);
    }
  }
  return (
    <>
      <PageHeader
        eyebrow={tr(lang, 'Every little presence matters', 'Her küçük katılım değerli')}
        title={tr(lang, 'Attendance & participation', 'Yoklama ve katılım')}
        description={tr(
          lang,
          'One class, one screen. Record the small moments that shape progress.',
          'Bir sınıf, bir ekran. Gelişimi şekillendiren küçük anları kaydedin.',
        )}
      >
        <Badge tone="orange">{tr(lang, 'Weekly check-in', 'Haftalık kontrol')}</Badge>
      </PageHeader>
      <div className="card padded">
        <div className="form-grid">
          {levels.length > 0 && (
            <SelectField
              label={tr(lang, 'Level', 'Seviye')}
              value={levelId}
              onChange={(e) => {
                const next = e.target.value;
                const inLevel = next
                  ? classes.filter((c) => classLevelId(c, data) === next)
                  : classes;
                const keep = inLevel.some((c) => c.id === classId);
                if (!keep && (!draft.allowLeave() || busy)) return;
                setLevelId(next);
                try {
                  localStorage.setItem('portal-attendance-level', next);
                } catch {
                  /* storage unavailable */
                }
                if (!keep) chooseClass(inLevel[0]?.id || '');
              }}
            >
              <option value="">{tr(lang, 'All levels', 'Tüm seviyeler')}</option>
              {levels.map((level) => (
                <option key={level.id} value={level.id}>
                  {label(level, lang)}
                </option>
              ))}
            </SelectField>
          )}
          <SelectField
            label={tr(lang, 'Class', 'Sınıf')}
            value={classId}
            onChange={async (e) => {
              const next = e.target.value;
              if (!draft.allowLeave() || busy) return;
              chooseClass(next);
            }}
          >
            {!levelClasses.some((c) => c.id === classId) && (
              <option value="">{tr(lang, 'Choose a class', 'Sınıf seçin')}</option>
            )}
            {classGroups.length > 1 || levels.length
              ? classGroups.map((group) => (
                  <optgroup key={group.id || 'none'} label={group.name}>
                    {group.items.map((c) => (
                      <option key={c.id} value={c.id}>
                        {c.name} · {c.language.toUpperCase()}
                      </option>
                    ))}
                  </optgroup>
                ))
              : levelClasses.map((c) => (
                  <option key={c.id} value={c.id}>
                    {c.name} · {c.language.toUpperCase()}
                  </option>
                ))}
          </SelectField>
          <SelectField
            label={tr(lang, 'Lesson session', 'Ders oturumu')}
            value={session?.id || ''}
            onChange={async (e) => {
              const next = e.target.value;
              if (!draft.allowLeave() || busy) return;
              setSessionId(next);
            }}
          >
            <option value="">{tr(lang, 'Choose a dated lesson', 'Tarihli ders seçin')}</option>
            {sessions.length > 0 && (
              <optgroup label={tr(lang, 'Today and earlier', 'Bugün ve geçmiş')}>
                {sessions.map((s) => (
                  <option key={s.id} value={s.id}>
                    {date(s.starts_at, lang, timezone)} ·{' '}
                    {s.status === 'completed'
                      ? tr(lang, 'Recorded', 'Kaydedildi')
                      : tr(lang, 'Scheduled', 'Planlandı')}
                  </option>
                ))}
              </optgroup>
            )}
            {upcoming.length > 0 && (
              <optgroup label={tr(lang, 'Upcoming', 'Yaklaşan')}>
                {upcoming.map((s) => (
                  <option key={s.id} value={s.id}>
                    {date(s.starts_at, lang, timezone)} ·{' '}
                    {tr(lang, 'opens on the lesson day', 'ders günü açılır')}
                  </option>
                ))}
              </optgroup>
            )}
          </SelectField>
          <div className="field">
            <span>{tr(lang, 'Quick entry', 'Hızlı giriş')}</span>
            <Button
              variant="secondary"
              disabled={!session || future || !rows.length || !draft.ready || busy}
              onClick={() => {
                setRows(rows.map((r) => ({ ...r, status: 'present', late_minutes: 0 })));
                setFinalized(false);
              }}
            >
              <Check size={16} />
              {tr(lang, 'Mark all present', 'Herkesi katıldı işaretle')}
            </Button>
          </div>
        </div>
      </div>
      {!classId && (
        <section className="card padded stack today-lessons">
          <h3>{tr(lang, "Today's lessons", 'Bugünkü dersler')}</h3>
          {todayLessons.length ? (
            <div className="today-lesson-list">
              {todayLessons.map(({ s, c }) => {
                const level = levels.find((l) => l.id === classLevelId(c, data));
                const teacher = data.profiles.find((p) => p.id === c.teacher_id);
                return (
                  <button
                    type="button"
                    key={s.id}
                    className="today-lesson-card"
                    onClick={() => {
                      if (!draft.allowLeave() || busy) return;
                      chooseClass(c.id);
                      setSessionId(s.id);
                    }}
                  >
                    <strong>{timeText(s.starts_at)}</strong>
                    <span>{c.name}</span>
                    {(level || (management && teacher)) && (
                      <small className="muted">
                        {[
                          level ? label(level, lang) : '',
                          management && teacher ? label(teacher, lang) : '',
                        ]
                          .filter(Boolean)
                          .join(' · ')}
                      </small>
                    )}
                  </button>
                );
              })}
            </div>
          ) : (
            <p className="muted">{tr(lang, 'No lessons today', 'Bugün planlı ders yok')}</p>
          )}
        </section>
      )}
      {!classId ? (
        <EmptyState
          title={tr(
            lang,
            'Choose a lesson to take attendance',
            'Yoklama almak için bir ders seçin',
          )}
        />
      ) : !session ? (
        <EmptyState
          title={tr(lang, 'Choose the lesson date', 'Ders tarihini seçin')}
          description={
            classSessions.length
              ? tr(
                  lang,
                  'Choose a lesson. Upcoming lessons are listed too; their attendance opens on the lesson day.',
                  'Bir ders seçin. Yaklaşan dersler de listelenir; yoklamaları ders günü açılır.',
                )
              : tr(
                  lang,
                  'This class has no planned lessons yet. Add one in Classes & lessons with "Schedule lesson".',
                  'Bu sınıfın planlanmış dersi yok. Sınıflar ve dersler bölümünde "Ders planla" ile ekleyin.',
                )
          }
        />
      ) : future ? (
        <div className="card padded stack">
          <div className="notice" role="status">
            {tr(
              lang,
              `This lesson is on ${date(session.starts_at, lang, timezone)}. Attendance opens on the lesson day.`,
              `Bu ders ${date(session.starts_at, lang, timezone)} tarihinde. Yoklama ders günü açılır.`,
            )}
          </div>
          <h3>
            {tr(lang, 'Class list', 'Sınıf listesi')} · {initialRows.length}{' '}
            {tr(lang, 'students', 'öğrenci')}
          </h3>
          {initialRows.length ? (
            <ul className="plain-list">
              {initialRows.map((row) => (
                <li key={row.student_id}>
                  {fullName(data.students.find((s) => s.id === row.student_id))}
                </li>
              ))}
            </ul>
          ) : (
            <p className="muted">
              {tr(
                lang,
                'No students are enrolled for this date yet.',
                'Bu tarih için kayıtlı öğrenci yok.',
              )}
            </p>
          )}
        </div>
      ) : (
        <form
          onSubmit={(e) => {
            e.preventDefault();
            save();
          }}
        >
          <DraftStatus draft={draft} lang={lang} />
          {formError && (
            <div className="form-error" role="alert">
              {formError}
            </div>
          )}
          {finalized && (
            <div className="notice notice-success" role="status">
              {tr(
                lang,
                'Attendance submitted. You can continue with topics taught.',
                'Yoklama gönderildi. İşlenen konulara devam edebilirsiniz.',
              )}
              {props.navigate && (
                <Button onClick={() => props.navigate?.('curriculum', { classId })}>
                  {tr(lang, 'Topics taught', 'İşlenen konular')}
                </Button>
              )}
            </div>
          )}
          <fieldset disabled={!draft.ready || busy} className="workspace-fields">
            <div className="card">
              <div className="card-header">
                <h3>{classes.find((c) => c.id === classId)?.name}</h3>
                <span className="muted">
                  {rows.length} {tr(lang, 'students', 'öğrenci')} · {session.duration_minutes}{' '}
                  {tr(lang, 'minutes', 'dakika')}
                </span>
              </div>
              <div className="table-wrap">
                <table className="data-table attendance-table">
                  <thead>
                    <tr>
                      <th scope="col">{tr(lang, 'Student', 'Öğrenci')}</th>
                      <th scope="col">{tr(lang, 'Attendance', 'Yoklama')}</th>
                      <th scope="col">{tr(lang, 'Participation', 'Katılım')}</th>
                      <th scope="col">
                        {tr(lang, 'Camera / mic issue', 'Kamera / mikrofon sorunu')}
                      </th>
                      <th scope="col">
                        {tr(lang, 'Excused exception', 'Bilgim dahilinde / izinli')}
                      </th>
                    </tr>
                  </thead>
                  <tbody>
                    {rows.map((r) => (
                      <tr key={r.student_id}>
                        <td>
                          <strong>
                            {fullName(data.students.find((s) => s.id === r.student_id))}
                          </strong>
                        </td>
                        <td>
                          <select
                            aria-label={tr(lang, 'Attendance status', 'Yoklama durumu')}
                            value={r.status}
                            required
                            onChange={(e) =>
                              change(r.student_id, {
                                status: e.target.value,
                                late_minutes: e.target.value === 'late' ? 5 : 0,
                              })
                            }
                          >
                            <option value="">{tr(lang, 'Not marked', 'İşaretlenmedi')}</option>
                            {[
                              ['present', 'Present', 'Katıldı'],
                              ['late', 'Late', 'Geç geldi'],
                              ['absent', 'Absent', 'Katılmadı'],
                            ].map(([key, en, t]) => (
                              <option key={key} value={key}>
                                {tr(lang, en, t)}
                              </option>
                            ))}
                          </select>
                          {r.status === 'late' && (
                            <label className="compact-field">
                              <input
                                aria-label={tr(lang, 'Minutes late', 'Gecikme dakikası')}
                                type="number"
                                min="0"
                                value={r.late_minutes}
                                onChange={(e) =>
                                  change(r.student_id, { late_minutes: Number(e.target.value) })
                                }
                              />
                              <span>{tr(lang, 'min', 'dk')}</span>
                            </label>
                          )}
                        </td>
                        <td>
                          <select
                            aria-label={tr(lang, 'Participation score', 'Katılım puanı')}
                            required={r.status !== 'absent'}
                            disabled={r.status === 'absent'}
                            value={r.status === 'absent' ? '' : (r.participation ?? '')}
                            onChange={(e) =>
                              change(r.student_id, {
                                participation: e.target.value === '' ? '' : Number(e.target.value),
                              })
                            }
                          >
                            <option value="">—</option>
                            {[1, 2, 3, 4, 5].map((n) => (
                              <option key={n}>{n}</option>
                            ))}
                          </select>
                        </td>
                        <td>
                          <div className="stack compact">
                            <label className="checkbox-label">
                              <input
                                type="checkbox"
                                disabled={r.status === 'absent'}
                                checked={r.camera_issue}
                                onChange={(e) =>
                                  change(r.student_id, { camera_issue: e.target.checked })
                                }
                              />
                              {tr(lang, 'Camera', 'Kamera')}
                            </label>
                            <label className="checkbox-label">
                              <input
                                type="checkbox"
                                disabled={r.status === 'absent'}
                                checked={r.microphone_issue}
                                onChange={(e) =>
                                  change(r.student_id, { microphone_issue: e.target.checked })
                                }
                              />
                              {tr(lang, 'Microphone', 'Mikrofon')}
                            </label>
                          </div>
                        </td>
                        <td>
                          {(r.status === 'absent' ||
                            Number(r.participation) <= 3 ||
                            r.camera_issue ||
                            r.microphone_issue ||
                            r.excused) && (
                            <>
                              <label className="checkbox-label">
                                <input
                                  type="checkbox"
                                  checked={r.excused}
                                  onChange={(e) =>
                                    change(r.student_id, { excused: e.target.checked })
                                  }
                                />
                                {tr(lang, 'Known / excused', 'Bilgim dahilinde / izinli')}
                              </label>
                              {r.excused && (
                                <input
                                  required
                                  aria-label={tr(lang, 'Reason', 'Gerekçe')}
                                  placeholder={tr(
                                    lang,
                                    'Reason for exception',
                                    'İstisna gerekçesi',
                                  )}
                                  value={r.excuse_reason || ''}
                                  onChange={(e) =>
                                    change(r.student_id, { excuse_reason: e.target.value })
                                  }
                                />
                              )}
                            </>
                          )}
                        </td>
                      </tr>
                    ))}
                  </tbody>
                </table>
              </div>
              <div className="table-footer">
                <p>
                  {tr(
                    lang,
                    'Excused absences stay visible but are excluded from the grade and urgent absence alerts.',
                    'İzinli devamsızlıklar görünür kalır; nota ve acil devamsızlık uyarısına katılmaz.',
                  )}
                </p>
                <Button type="submit" disabled={busy || !rows.length}>
                  <Save size={16} />
                  {busy
                    ? tr(lang, 'Saving…', 'Kaydediliyor…')
                    : tr(lang, 'Submit attendance', 'Yoklamayı gönder')}
                </Button>
              </div>
            </div>
          </fieldset>
        </form>
      )}
    </>
  );
}

export function AssessmentsPage(props: PageProps) {
  const { data, lang, api, refresh, notify, user, context } = props;
  const allowed = data.classes.filter(
    (c) =>
      c.active &&
      (user.roles.some((r) => ['administrator', 'academic_manager'].includes(r)) ||
        c.teacher_id === user.id),
  );
  const initialClass = allowed.find((c) => c.id === context?.classId) || allowed[0];
  const [classId, setClassId] = useState(initialClass?.id || '');
  const [studentId, setStudentId] = useState(context?.studentId || '');
  const [periodId, setPeriodId] = useState(
    context?.periodId || defaultPeriod(data, initialClass?.academic_year_id),
  );
  const [busy, setBusy] = useState(false);
  const [formError, setFormError] = useState('');
  const period = data.periods.find((p) => p.id === periodId);
  const classroom = allowed.find((c) => c.id === classId);
  const subject = data.subjects.find((s) => s.id === classroom?.subject_id);
  const students = data.students.filter((s) =>
    data.enrollments.some(
      (e) =>
        e.class_id === classId &&
        e.student_id === s.id &&
        (!period?.ends_on || e.started_on <= period.ends_on) &&
        (!e.ended_on || !period?.starts_on || e.ended_on >= period.starts_on),
    ),
  );
  const selected = students.find((s) => s.id === studentId) || students[0];
  const existing = data.assessments.find(
    (a) =>
      a.class_id === classId &&
      a.student_id === selected?.id &&
      a.period_id === periodId &&
      a.teacher_id === user.id,
  );
  const cfg = existing
    ? data.configurations.find((c) => c.id === existing.configuration_id)
    : data.configurations
        .filter((c) => c.kind === 'assessment' && c.status === 'published')
        .sort((a, b) => b.version - a.version)[0];
  const initialQuestions = (cfg?.body.questions || [])
    .filter((q: any) => !q.subject_code || q.subject_code === subject?.code)
    .sort(
      (a: any, b: any) =>
        Number(!a.subject_code) - Number(!b.subject_code) ||
        String(a.form).localeCompare(String(b.form)) ||
        (a.order || 0) - (b.order || 0),
    );
  const draftContext = `${classId}:${selected?.id || ''}:${periodId}`;
  const initialAnswers =
    existing?.answers ||
    Object.fromEntries(
      initialQuestions.map((q: any) => [
        q.id,
        {
          value: null,
          taught:
            !q.subject_code ||
            data.curriculum_progress.some(
              (p) =>
                p.class_id === classId &&
                p.configuration_id === cfg?.id &&
                p.criterion_id === q.id &&
                p.taught,
            ),
        },
      ]),
    );
  const initialDraft = {
    student_id: selected?.id,
    class_id: classId,
    period_id: periodId,
    configuration_id: cfg?.id,
    answers: initialAnswers,
    strengths: existing?.strengths || '',
    development_areas: existing?.development_areas || '',
    parent_advice: existing?.parent_advice || '',
    excused: existing?.excused || false,
    excuse_reason: existing?.excuse_reason || '',
  };
  const draft = useDraft<typeof initialDraft>(
    props,
    'assessment',
    draftContext,
    initialDraft,
    !!selected && !!cfg && !!period?.starts_on && !!period?.ends_on,
  );
  const activeConfiguration =
    data.configurations.find((c) => c.id === draft.body.configuration_id) || cfg;
  const questions = (activeConfiguration?.body.questions || [])
    .filter((q: any) => !q.subject_code || q.subject_code === subject?.code)
    .sort(
      (a: any, b: any) =>
        Number(!a.subject_code) - Number(!b.subject_code) ||
        String(a.form).localeCompare(String(b.form)) ||
        (a.order || 0) - (b.order || 0),
    );
  const answers = draft.body.answers;
  const comments = {
    strengths: draft.body.strengths,
    development_areas: draft.body.development_areas,
    parent_advice: draft.body.parent_advice,
  };
  const setComments = (value: typeof comments) =>
    draft.edit((previous) => ({ ...previous, ...value }));
  const exception = draft.body.excused;
  const setException = (value: boolean) =>
    draft.edit((previous) => ({ ...previous, excused: value }));
  const reason = draft.body.excuse_reason;
  const setReason = (value: string) =>
    draft.edit((previous) => ({ ...previous, excuse_reason: value }));
  const update = (key: string, v: any) =>
    draft.edit((previous) => ({
      ...previous,
      answers: { ...previous.answers, [key]: { ...previous.answers[key], ...v } },
    }));
  useUnsavedChanges(false, lang, busy);
  useEffect(() => {
    setFormError('');
  }, [draftContext]);
  const missing = questions.filter(
    (q: any) =>
      q.required &&
      answers[q.id]?.taught !== false &&
      !['A6.strengths', 'A6.development', 'A6.advice'].includes(q.id) &&
      (answers[q.id]?.value == null || answers[q.id]?.value === ''),
  );
  for (const [key, en, turkish] of [
    ['strengths', 'Strengths', 'Güçlü yönler'],
    ['development_areas', 'Areas to develop', 'Gelişim alanları'],
    ['parent_advice', 'Suggestions for parents', 'Veliye öneriler'],
  ]) {
    if (!String(comments[key as keyof typeof comments] || '').trim())
      missing.push({ id: `assessment-${key}`, label_en: en, label_tr: turkish, family: true });
  }
  // Required answers in total (questions still to teach are skipped) plus the three notes.
  const requiredCount =
    questions.filter(
      (q: any) =>
        q.required &&
        answers[q.id]?.taught !== false &&
        !['A6.strengths', 'A6.development', 'A6.advice'].includes(q.id),
    ).length + 3;
  const missingIds = new Set(missing.map((q: any) => q.id));
  const sectionName = (q: any) =>
    q.family
      ? tr(lang, 'Note to the family', 'Aileye not')
      : componentLabel(q.subject_code || q.form, lang, data.subjects);
  const missingSections: { name: string; items: any[] }[] = missing.reduce(
    (groups: { name: string; items: any[] }[], q: any) => {
      const name = sectionName(q);
      const group = groups.find((item) => item.name === name);
      if (group) group.items.push(q);
      else groups.push({ name, items: [q] });
      return groups;
    },
    [],
  );
  const jumpTo = (id: string) => {
    const target = document.getElementById(id) || document.getElementsByName(id)[0];
    target?.scrollIntoView({ block: 'center' });
    target?.focus();
  };
  async function save(status: string, next = false) {
    if (!selected || !cfg || busy) return;
    setBusy(true);
    setFormError('');
    try {
      draft.edit((previous) => ({
        ...previous,
        answers: {
          ...answers,
          ...Object.fromEntries(
            [
              ['A6.strengths', 'strengths'],
              ['A6.development', 'development_areas'],
              ['A6.advice', 'parent_advice'],
            ]
              .filter(([key]) => questions.some((q: any) => q.id === key))
              .map(([key, field]) => [key, { value: (comments as any)[field], taught: true }]),
          ),
        },
      }));
      const revision = await draft.flush();
      await api.rpc('finalize_assessment', {
        p_context: draftContext,
        p_revision: revision,
        p_status: status,
      });
      draft.finalized();
      try {
        await refresh(['assessments', 'guidance_cases', 'guidance_notes', 'parent_guidance']);
      } catch {
        notify(
          tr(lang, 'Saved. The summary could not refresh.', 'Kaydedildi. Özet yenilenemedi.'),
          'error',
        );
      }
      if (next) {
        const index = students.findIndex((s) => s.id === selected.id);
        setStudentId(students[(index + 1) % students.length]?.id || '');
      } else window.setTimeout(() => void draft.reload(), 0);
      notify(
        tr(
          lang,
          status === 'submitted'
            ? 'Assessment submitted and guidance rules evaluated.'
            : 'Assessment draft saved.',
          status === 'submitted'
            ? 'Değerlendirme gönderildi ve rehberlik kuralları değerlendirildi.'
            : 'Değerlendirme taslağı kaydedildi.',
        ),
      );
    } catch (e) {
      setFormError(errorText(e, lang));
      notify(errorText(e, lang), 'error');
    } finally {
      setBusy(false);
    }
  }
  return (
    <>
      <PageHeader
        eyebrow={tr(lang, 'Celebrate each step', 'Her adımı değerli kılın')}
        title={tr(lang, 'Learning assessments', 'Öğrenme değerlendirmeleri')}
        description={tr(
          lang,
          'A thoughtful picture of every child’s understanding, character and effort.',
          'Her çocuğun anlayışını, karakterini ve çabasını özenle değerlendirin.',
        )}
      >
        <ClipboardCheck className="heading-icon" size={34} />
      </PageHeader>
      <div className="card padded">
        <div className="form-grid">
          <SelectField
            label={tr(lang, 'Class', 'Sınıf')}
            value={classId}
            onChange={(e) => {
              if (!draft.allowLeave() || busy) return;
              setClassId(e.target.value);
              setStudentId('');
              setPeriodId(
                defaultPeriod(data, allowed.find((c) => c.id === e.target.value)?.academic_year_id),
              );
            }}
          >
            {allowed.map((c) => (
              <option key={c.id} value={c.id}>
                {c.name}
              </option>
            ))}
          </SelectField>
          <SelectField
            label={tr(lang, 'Student', 'Öğrenci')}
            value={selected?.id || ''}
            onChange={(e) => {
              if (!busy && draft.allowLeave()) setStudentId(e.target.value);
            }}
          >
            {students.map((s) => (
              <option key={s.id} value={s.id}>
                {fullName(s)}
              </option>
            ))}
          </SelectField>
          <SelectField
            label={tr(lang, 'Reporting period', 'Karne dönemi')}
            value={periodId}
            onChange={(e) => {
              if (!busy && draft.allowLeave()) setPeriodId(e.target.value);
            }}
          >
            {data.periods
              .filter((p) => !classroom || p.academic_year_id === classroom.academic_year_id)
              .map((p) => (
                <option key={p.id} value={p.id}>
                  {label(p, lang)}
                </option>
              ))}
          </SelectField>
        </div>
      </div>
      {!selected || !cfg ? (
        <EmptyState
          title={tr(
            lang,
            'Choose a class with enrolled students',
            'Kayıtlı öğrencileri olan bir sınıf seçin',
          )}
        />
      ) : !period?.starts_on || !period.ends_on ? (
        <div className="notice">
          {tr(
            lang,
            'An administrator must set the reporting period dates before assessments can be saved.',
            'Değerlendirme kaydetmeden önce yönetici dönem tarihlerini belirlemelidir.',
          )}
        </div>
      ) : (
        <form
          onSubmit={(e) => {
            e.preventDefault();
            save('submitted');
          }}
        >
          <DraftStatus draft={draft} lang={lang} />
          {formError && (
            <div className="form-error" role="alert">
              {formError}
            </div>
          )}
          <div className="card padded assessment-checklist" aria-live="polite">
            <div className="checklist-head">
              <strong>{tr(lang, 'Progress', 'İlerleme')}</strong>
              <span>
                {tr(
                  lang,
                  `${requiredCount - missing.length} / ${requiredCount} answered`,
                  `${requiredCount - missing.length} / ${requiredCount} yanıtlandı`,
                )}
                {missing.length > 0 && (
                  <span className="muted">
                    {' · '}
                    {tr(lang, `${missing.length} left`, `${missing.length} eksik`)}
                  </span>
                )}
              </span>
            </div>
            <div className="checklist-bar" aria-hidden="true">
              <span
                style={{
                  width: `${Math.round(((requiredCount - missing.length) / requiredCount) * 100)}%`,
                }}
              />
            </div>
            {missing.length ? (
              <>
                <div className="checklist-sections">
                  {missingSections.map((group) => (
                    <button
                      key={group.name}
                      type="button"
                      className="checklist-chip"
                      onClick={() => jumpTo(group.items[0].id)}
                    >
                      {group.name} <strong>{group.items.length}</strong>
                    </button>
                  ))}
                  <Button variant="secondary" onClick={() => jumpTo(missing[0].id)}>
                    {tr(lang, 'Go to the first missing answer', 'İlk eksik soruya git')}
                  </Button>
                </div>
                <details className="checklist-details">
                  <summary>{tr(lang, 'List missing answers', 'Eksikleri listele')}</summary>
                  {missingSections.map((group) => (
                    <div key={group.name} className="checklist-group">
                      <small>{group.name}</small>
                      {group.items.map((q: any) => (
                        <button
                          key={q.id}
                          type="button"
                          className="text-button"
                          onClick={() => jumpTo(q.id)}
                        >
                          {q[`label_${lang}`]}
                        </button>
                      ))}
                    </div>
                  ))}
                </details>
              </>
            ) : (
              <p className="checklist-done">
                <Check size={16} aria-hidden="true" />
                {tr(
                  lang,
                  'All required answers are complete. Review the note to the family, then submit.',
                  'Tüm zorunlu yanıtlar tamamlandı. Aileye notu gözden geçirip gönderin.',
                )}
              </p>
            )}
          </div>
          <fieldset disabled={!draft.ready || busy} className="workspace-fields">
            <div className="card">
              <div className="card-header">
                <div>
                  <h3>{fullName(selected)}</h3>
                  <span className="muted">
                    {label(subject, lang)} · {label(period, lang)}
                  </span>
                </div>
                <Badge tone={existing?.status === 'submitted' ? 'green' : 'neutral'}>
                  {tr(lang, 'Form version', 'Form sürümü')} {activeConfiguration?.version} ·{' '}
                  {existing?.status === 'submitted'
                    ? tr(lang, 'Submitted', 'Gönderildi')
                    : tr(lang, 'Draft', 'Taslak')}
                </Badge>
              </div>
              <p className="score-legend">
                <strong>{tr(lang, 'Score guide', 'Puan rehberi')}:</strong>{' '}
                {tr(
                  lang,
                  '1 needs close support · 3 developing · 5 consistently confident',
                  '1 yakın destek gerekiyor · 3 gelişiyor · 5 düzenli ve güvenli',
                )}
              </p>
              <div className="assessment-questions">
                {questions
                  .filter(
                    (q: any) => !['A6.strengths', 'A6.development', 'A6.advice'].includes(q.id),
                  )
                  .map((q: any, index: number, shown: any[]) => {
                    const answer = answers[q.id] || { value: null, taught: !q.subject_code };
                    const section = sectionName(q);
                    const newSection = index === 0 || sectionName(shown[index - 1]) !== section;
                    return (
                      <Fragment key={q.id}>
                        {newSection && <h4 className="assessment-section">{section}</h4>}
                        <div
                          className={`assessment-question ${answer.taught === false ? 'untaught' : ''} ${missingIds.has(q.id) ? 'unanswered' : ''}`}
                        >
                          <div className="question-label">
                            <label htmlFor={q.id}>
                              {q[`label_${lang}`]}
                              {q.required && answer.taught !== false ? ' *' : ''}
                            </label>
                            {Boolean(q.subject_code) && (
                              <label className="checkbox-label">
                                <input
                                  type="checkbox"
                                  checked={answer.taught === false}
                                  onChange={(e) =>
                                    update(q.id, {
                                      taught: !e.target.checked,
                                      value: e.target.checked ? null : answer.value,
                                    })
                                  }
                                />
                                {tr(lang, 'Not yet taught', 'Henüz işlenmedi')}
                              </label>
                            )}
                          </div>
                          {answer.taught !== false && (
                            <div className="question-answer">
                              {q.type === 'score' ? (
                                <div className="score-choices">
                                  {[0, 1, 2, 3, 4, 5]
                                    .filter((n) => n >= (q.min ?? 1) && n <= (q.max ?? 5))
                                    .map((n) => (
                                      <label
                                        className={answer.value === n ? 'selected' : ''}
                                        key={n}
                                      >
                                        <input
                                          type="radio"
                                          name={q.id}
                                          aria-label={`${q[`label_${lang}`]}: ${n}`}
                                          value={n}
                                          checked={answer.value === n}
                                          onChange={() => update(q.id, { value: n, taught: true })}
                                          required={q.required}
                                        />
                                        {n}
                                      </label>
                                    ))}
                                </div>
                              ) : q.type === 'boolean' || q.type === 'choice' ? (
                                <select
                                  id={q.id}
                                  required={q.required}
                                  value={answer.value === null ? '' : String(answer.value)}
                                  onChange={(e) =>
                                    update(q.id, {
                                      value:
                                        e.target.value === ''
                                          ? null
                                          : q.type === 'boolean'
                                            ? e.target.value === 'true'
                                            : e.target.value,
                                      taught: true,
                                    })
                                  }
                                >
                                  <option value="">—</option>
                                  {q.type === 'boolean' ? (
                                    <>
                                      <option value="true">{tr(lang, 'Yes', 'Evet')}</option>
                                      <option value="false">{tr(lang, 'No', 'Hayır')}</option>
                                    </>
                                  ) : (
                                    (q.choices || []).map((c: string) => (
                                      <option key={c}>{c}</option>
                                    ))
                                  )}
                                </select>
                              ) : q.type === 'text' ? (
                                <textarea
                                  id={q.id}
                                  required={q.required}
                                  value={answer.value ?? ''}
                                  onChange={(e) =>
                                    update(q.id, { value: e.target.value, taught: true })
                                  }
                                />
                              ) : (
                                <input
                                  id={q.id}
                                  type={q.type === 'date' ? 'date' : 'number'}
                                  required={q.required}
                                  min={q.min}
                                  max={q.max}
                                  step="any"
                                  value={answer.value ?? ''}
                                  onChange={(e) =>
                                    update(q.id, {
                                      value:
                                        q.type === 'number'
                                          ? e.target.value === ''
                                            ? null
                                            : Number(e.target.value)
                                          : e.target.value,
                                      taught: true,
                                    })
                                  }
                                />
                              )}
                            </div>
                          )}
                        </div>
                      </Fragment>
                    );
                  })}
              </div>
            </div>
            <div className="card padded">
              <h3>{tr(lang, 'A note to the family', 'Aileye bir not')}</h3>
              <div className="form-grid">
                <TextArea
                  id="assessment-strengths"
                  label={tr(lang, 'Strengths', 'Güçlü yönler')}
                  required
                  value={comments.strengths}
                  onChange={(e) => setComments({ ...comments, strengths: e.target.value })}
                />
                <TextArea
                  id="assessment-development_areas"
                  label={tr(lang, 'Areas to develop', 'Gelişim alanları')}
                  required
                  value={comments.development_areas}
                  onChange={(e) => setComments({ ...comments, development_areas: e.target.value })}
                />
                <TextArea
                  id="assessment-parent_advice"
                  label={tr(lang, 'Suggestions for parents', 'Veliye öneriler')}
                  required
                  value={comments.parent_advice}
                  onChange={(e) => setComments({ ...comments, parent_advice: e.target.value })}
                />
              </div>
              <label className="checkbox-label">
                <input
                  type="checkbox"
                  checked={exception}
                  onChange={(e) => setException(e.target.checked)}
                />
                {tr(
                  lang,
                  'Known circumstances: use quiet observation instead of urgent alerts',
                  'Bilgim dahilinde: acil uyarı yerine sessiz gözlem',
                )}
              </label>
              {exception && (
                <Field
                  label={tr(lang, 'Reason', 'Gerekçe')}
                  required
                  value={reason}
                  onChange={(e) => setReason(e.target.value)}
                />
              )}
            </div>
            <p className="form-hint">
              {tr(
                lang,
                'Drafts stay inside the school. Submitting sends the assessment for review.',
                'Taslak kurum içinde kalır. Gönderdiğinizde değerlendirme incelemeye iletilir.',
              )}
            </p>
            <div className="page-actions">
              <Button
                variant="secondary"
                type="button"
                disabled={busy || draft.saving}
                onClick={() => save('draft')}
              >
                <Save size={16} />
                {tr(lang, 'Save draft', 'Taslağı kaydet')}
              </Button>
              <Button
                variant="secondary"
                disabled={busy || draft.saving || students.length < 2}
                onClick={() => save('draft', true)}
              >
                {tr(lang, 'Save and next child', 'Kaydet ve sonraki öğrenci')}
              </Button>
              <Button type="submit" disabled={busy || draft.saving}>
                <Send size={16} />
                {busy
                  ? tr(lang, 'Saving…', 'Kaydediliyor…')
                  : tr(lang, 'Submit assessment', 'Değerlendirmeyi gönder')}
              </Button>
            </div>
          </fieldset>
        </form>
      )}
    </>
  );
}

function ProgressBand({ title, band }: { title: string; band: any }) {
  return (
    <div className="report-progress">
      <div>
        <span>{title}</span>
        <Badge tone={band?.color || 'neutral'}>{band?.label || band?.label_en || '—'}</Badge>
      </div>
      <div
        className="progress-steps"
        role="img"
        aria-label={`${title}: ${Number(band?.step || 0)} / 5 · ${band?.label || band?.label_en || '—'}`}
      >
        {[1, 2, 3, 4, 5].map((n) => (
          <span
            key={n}
            className={n <= Number(band?.step || 0) ? `filled ${band?.color || 'green'}` : ''}
          />
        ))}
      </div>
    </div>
  );
}
export function ReportsPage({ data, lang, api, refresh, notify, user, context }: PageProps) {
  const parentOnly = user.roles.every((r) => r === 'parent');
  const management = user.roles.some((r) => ['administrator', 'academic_manager'].includes(r));
  const [studentId, setStudentId] = useState(context?.studentId || data.students[0]?.id || '');
  const [periodId, setPeriodId] = useState(context?.periodId || defaultPeriod(data));
  const [gradingId, setGradingId] = useState('');
  const [calculation, setCalculation] = useState<any>(null);
  const [busy, setBusy] = useState(false);
  const [opened, setOpened] = useState<RecordRow | null>(null);
  const reports = (parentOnly ? data.parent_reports.filter((r) => r.current) : data.reports)
    .filter(
      (r) => (!studentId || r.student_id === studentId) && (!periodId || r.period_id === periodId),
    )
    .sort((a, b) => (b.revision || 1) - (a.revision || 1));
  const grading = data.configurations
    .filter((c) => c.kind === 'grading' && c.status === 'published')
    .sort((a, b) => b.version - a.version);
  async function perform(action: string, report?: RecordRow) {
    if (busy) return;
    setBusy(true);
    try {
      if (action === 'preview')
        setCalculation(
          await api.rpc('preview_report', {
            p_student_id: studentId,
            p_period_id: periodId,
            p_grading_id: gradingId || null,
          }),
        );
      else {
        await api.rpc(action, {
          ...(report
            ? { p_report_id: report.id }
            : { p_student_id: studentId, p_period_id: periodId, p_grading_id: gradingId || null }),
        });
        await refresh();
        setCalculation(null);
        notify(tr(lang, 'Report updated.', 'Karne güncellendi.'));
      }
    } catch (e) {
      notify(errorText(e, lang), 'error');
    } finally {
      setBusy(false);
    }
  }
  const [confirm, confirmDialog] = useConfirm(lang);
  /** Draft or submitted report cards only; published ones stay (parents have them). */
  async function deleteReport(report: RecordRow) {
    const student = fullName(data.students.find((s) => s.id === report.student_id));
    const period = label(
      data.periods.find((p) => p.id === report.period_id),
      lang,
    );
    const ok = await confirm({
      title: tr(lang, 'Delete this report card?', 'Bu karne silinsin mi?'),
      message: `${student} · ${period} · ${tr(lang, 'Revision', 'Sürüm')} ${report.revision}`,
      confirmLabel: tr(lang, 'Delete', 'Sil'),
      danger: true,
    });
    if (!ok || busy) return;
    setBusy(true);
    try {
      await api.rpc('delete_report', { p_id: report.id });
      await refresh();
      notify(tr(lang, 'Report card deleted.', 'Karne silindi.'));
    } catch (e) {
      notify(errorText(e, lang), 'error');
    } finally {
      setBusy(false);
    }
  }
  const summary = opened && (parentOnly ? opened.summary : opened.calculation?.parent_summary);
  const band = (b: any) => ({ ...b, label: b?.[`label_${lang}`] });
  return (
    <>
      <PageHeader
        eyebrow={tr(lang, 'A year of growing together', 'Birlikte büyüdüğümüz bir yıl')}
        title={tr(lang, 'Report cards', 'Karneler')}
        description={tr(
          lang,
          'Four thoughtful snapshots of learning, effort and personal growth.',
          'Öğrenme, çaba ve kişisel gelişimin dört özenli özeti.',
        )}
      >
        <Badge tone="green">
          {tr(lang, '4 periods · 1 growing journey', '4 dönem · 1 gelişim yolculuğu')}
        </Badge>
      </PageHeader>
      <div className="card padded">
        <div className="form-grid">
          <SelectField
            label={tr(lang, 'Student', 'Öğrenci')}
            value={studentId}
            onChange={(e) => {
              setStudentId(e.target.value);
              setCalculation(null);
            }}
          >
            <option value="">{tr(lang, 'All students', 'Tüm öğrenciler')}</option>
            {data.students.map((s) => (
              <option key={s.id} value={s.id}>
                {fullName(s)}
              </option>
            ))}
          </SelectField>
          <SelectField
            label={tr(lang, 'Reporting period', 'Karne dönemi')}
            value={periodId}
            onChange={(e) => {
              setPeriodId(e.target.value);
              setCalculation(null);
            }}
          >
            {data.periods.map((p) => (
              <option key={p.id} value={p.id}>
                {label(p, lang)}
              </option>
            ))}
          </SelectField>
          {management && (
            <>
              <SelectField
                label={tr(lang, 'Calculation version', 'Hesaplama sürümü')}
                value={gradingId}
                onChange={(e) => {
                  setGradingId(e.target.value);
                  setCalculation(null);
                }}
              >
                <option value="">{tr(lang, 'Latest published', 'Son yayınlanan')}</option>
                {grading.map((c) => (
                  <option key={c.id} value={c.id}>
                    {c.name} · v{c.version}
                  </option>
                ))}
              </SelectField>
              <Button
                variant="secondary"
                disabled={busy || !studentId || !periodId}
                onClick={() => perform('preview')}
              >
                <Eye size={16} />
                {tr(lang, 'Preview calculation', 'Hesaplamayı önizle')}
              </Button>
            </>
          )}
        </div>
      </div>
      {calculation && (
        <div className="card padded">
          <div className="section-heading">
            <h3>{tr(lang, 'Calculation preview', 'Hesaplama önizlemesi')}</h3>
            <Badge tone={calculation.complete ? 'green' : 'orange'}>
              {calculation.complete
                ? tr(lang, 'Complete', 'Tamamlandı')
                : tr(lang, 'Needs input', 'Giriş gerekiyor')}
            </Badge>
          </div>
          <div className="stat-grid report-stat-grid">
            {['overall', 'academic', 'discipline', 'effort'].map((k) => (
              <div className="stat-card" key={k}>
                <span>
                  {
                    (
                      {
                        overall: tr(lang, 'Overall', 'Genel'),
                        academic: tr(lang, 'Academic', 'Akademik'),
                        discipline: tr(lang, 'Discipline', 'Disiplin'),
                        effort: tr(lang, 'Effort', 'Çaba'),
                      } as any
                    )[k]
                  }
                </span>
                <strong>
                  {calculation[k] ?? '—'}
                  <small> / 5</small>
                </strong>
              </div>
            ))}
          </div>
          {calculation.missing?.length > 0 && (
            <div className="notice">
              <strong>
                {tr(
                  lang,
                  'Complete these records before publication:',
                  'Yayınlamadan önce bu kayıtları tamamlayın:',
                )}
              </strong>
              <ul>
                {calculation.missing.map((m: string) => (
                  <li key={m}>{missingRecordLabel(m, lang)}</li>
                ))}
              </ul>
            </div>
          )}
          <p className="muted">
            {tr(
              lang,
              'Saving refreshes the current draft only. Published versions stay unchanged.',
              'Kaydetmek yalnızca mevcut taslağı günceller. Yayınlanmış sürümler değişmez.',
            )}
          </p>
          <Button disabled={busy} onClick={() => perform('generate_report')}>
            <Save size={16} />
            {tr(lang, 'Save / recalculate draft', 'Taslağı kaydet / yeniden hesapla')}
          </Button>
        </div>
      )}
      <div className="report-grid">
        {reports.map((r) => (
          <div className="card report-card" key={r.id}>
            <div className="report-card-top">
              <FileCheck2 size={28} />
              <Badge tone={r.status === 'published' || parentOnly ? 'green' : 'orange'}>
                {parentOnly || r.status === 'published'
                  ? tr(lang, 'Published', 'Yayınlandı')
                  : r.status === 'submitted'
                    ? tr(lang, 'Awaiting approval', 'Onay bekliyor')
                    : tr(lang, 'Draft', 'Taslak')}
              </Badge>
            </div>
            <h3>{fullName(data.students.find((s) => s.id === r.student_id))}</h3>
            <p>
              {label(
                data.periods.find((p) => p.id === r.period_id),
                lang,
              )}{' '}
              · {tr(lang, 'Revision', 'Sürüm')} {r.revision}
            </p>
            {parentOnly ? (
              <ProgressBand
                title={tr(lang, 'Overall progress', 'Genel ilerleme')}
                band={band(r.summary?.overall)}
              />
            ) : (
              <div className="report-mini-score">
                {r.calculation?.overall ?? '—'}
                <small>/ 5</small>
              </div>
            )}
            <div className="inline-actions">
              <Button variant="secondary" onClick={() => setOpened(r)}>
                <Eye size={15} />
                {tr(lang, 'View', 'Görüntüle')}
              </Button>
              {!parentOnly && r.status === 'draft' && (
                <Button
                  disabled={busy || !r.calculation?.complete}
                  onClick={() => perform('submit_report', r)}
                >
                  {tr(lang, 'Submit', 'Gönder')}
                </Button>
              )}
              {management && r.status === 'submitted' && (
                <Button disabled={busy} onClick={() => perform('publish_report', r)}>
                  {tr(lang, 'Publish', 'Yayınla')}
                </Button>
              )}
              {!parentOnly &&
                r.status !== 'published' &&
                (management || (r.status === 'draft' && r.generated_by === user.id)) && (
                  <Button variant="danger" disabled={busy} onClick={() => void deleteReport(r)}>
                    {tr(lang, 'Delete', 'Sil')}
                  </Button>
                )}
            </div>
          </div>
        ))}
      </div>
      {confirmDialog}
      {!reports.length && (
        <EmptyState
          title={tr(lang, 'A new chapter is taking shape', 'Yeni bir dönem şekilleniyor')}
          description={tr(
            lang,
            parentOnly
              ? 'Published report cards will appear here.'
              : 'Preview a student’s calculation to create their first report card.',
            parentOnly
              ? 'Yayınlanan karneler burada görünecek.'
              : 'İlk karneyi oluşturmak için öğrencinin hesaplamasını önizleyin.',
          )}
        />
      )}
      {opened && (
        <Modal
          title={tr(lang, 'Student progress report', 'Öğrenci gelişim karnesi')}
          onClose={() => setOpened(null)}
          lang={lang}
          wide
        >
          <div className="print-report">
            <div className="report-brand">
              <img src="/favicon.svg" alt="School Portal" />
              <div>
                <h2>{fullName(data.students.find((s) => s.id === opened.student_id))}</h2>
                <p>
                  {label(
                    data.periods.find((p) => p.id === opened.period_id),
                    lang,
                  )}{' '}
                  · {tr(lang, 'Revision', 'Sürüm')} {opened.revision}
                </p>
              </div>
            </div>
            {summary && (
              <>
                {[
                  ['overall', 'Overall progress', 'Genel ilerleme'],
                  ['academic', 'Academic learning', 'Akademik öğrenme'],
                  ['discipline', 'Learning habits', 'Öğrenme alışkanlıkları'],
                  ['participation', 'Participation', 'Katılım'],
                  ['effort', 'Growth & effort', 'Gelişim ve çaba'],
                ].map(([key, en, t]) => (
                  <ProgressBand key={key} title={tr(lang, en, t)} band={band(summary[key])} />
                ))}
                <h3>{tr(lang, 'Subject progress', 'Ders gelişimi')}</h3>
                {Object.entries(summary.subjects || {}).map(([code, b]) => (
                  <ProgressBand
                    key={code}
                    title={label(
                      data.subjects.find((s) => s.code === code),
                      lang,
                    )}
                    band={band(b)}
                  />
                ))}
                {(summary.comments || []).map((c: any, i: number) => (
                  <div className="report-comments" key={i}>
                    {[
                      ['strengths', 'What shines', 'Güçlü yönler'],
                      ['development_areas', 'Next steps', 'Sonraki adımlar'],
                      ['parent_advice', 'Growing together at home', 'Evde birlikte gelişim'],
                    ].map(([key, en, t]) => (
                      <div key={key}>
                        <h4>{tr(lang, en, t)}</h4>
                        <p>{c[key] || '—'}</p>
                      </div>
                    ))}
                  </div>
                ))}
              </>
            )}
          </div>
          <div className="page-actions">
            <Button variant="secondary" onClick={() => window.print()}>
              <Printer size={16} />
              {tr(lang, 'Print / save PDF', 'Yazdır / PDF kaydet')}
            </Button>
          </div>
        </Modal>
      )}
    </>
  );
}
