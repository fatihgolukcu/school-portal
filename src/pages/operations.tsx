import { useEffect, useState, type FormEvent, type ReactNode } from 'react';
import {
  ArrowLeft,
  ArrowRight,
  CalendarDays,
  ChevronDown,
  ChevronRight,
  Download,
  ExternalLink,
  GraduationCap,
  History,
  Mail,
  MessageSquarePlus,
  Plus,
  Search,
  Upload,
  UserCog,
  Users,
} from 'lucide-react';
import type { PageProps, RecordRow } from '../types';
import {
  activeStudentEnrollment,
  classLevelId,
  confirmLeave,
  isSpecialistSubject,
  levelsForSubject,
  levelsInUse,
  planWeek,
  planWeekCount,
  schoolDay,
  schoolTimezone,
  zonedDate,
} from '../workflow';
import { CURRENCIES, isCurrency } from '../types';
import { countryName, countryOptions } from '../countries';
import { displayLogin, isUsernameAccount } from '../accounts';
import { StudentImport } from './studentImport';
import {
  Button,
  Disclosure,
  EmptyState,
  Field,
  FormActions,
  FormError,
  MenuButton,
  Modal,
  PageHeader,
  SearchField,
  SelectField,
  StatCard,
  StatusBadge,
  studentStatusValue,
  Tabs,
  TextArea,
  ageFrom,
  dobFromAge,
  errorText,
  formatDob,
  initials,
  shortDay,
  useConfirm,
  useSort,
  statusLabel,
  tr,
  useAction,
} from '../ui';

type Row = Record<string, any>;
type Lang = 'en' | 'tr';
const list = (data: unknown, key: string): Row[] => (data as Record<string, Row[]>)[key] || [];
const name = (row?: Row) =>
  row
    ? row.full_name ||
      [row.first_name, row.last_name].filter(Boolean).join(' ') ||
      row.name_en ||
      row.name ||
      '—'
    : '—';
const label = (row: Row | undefined, lang: Lang) => row?.[`name_${lang}`] || row?.name || name(row);
const date = shortDay;
const currency = (amount: number, code: string, lang: Lang) =>
  new Intl.NumberFormat(lang === 'tr' ? 'tr-TR' : 'en-GB', {
    style: 'currency',
    currency: code || 'EUR',
  }).format(Number(amount || 0));
/** A student's scholarship: a percentage of the fee, or a fixed amount off it. */
const scholarshipOf = (student?: Row) =>
  student?.scholarship_type === 'amount'
    ? { type: 'amount' as const, value: Number(student?.scholarship_amount || 0) }
    : { type: 'percent' as const, value: Number(student?.scholarship_percent || 0) };
const applyScholarship = (fee: number, type: string, value: number) =>
  Math.max(0, Math.round((type === 'amount' ? fee - value : fee * (1 - value / 100)) * 100) / 100);
const scholarshipText = (type: string, value: number, code: string, lang: Lang) =>
  !value ? '—' : type === 'amount' ? `−${currency(value, code, lang)}` : `%${value}`;
const CurrencySelect = ({
  lang,
  name: fieldName,
  value,
  defaultValue,
  onChange,
}: {
  lang: Lang;
  name: string;
  value?: string;
  defaultValue?: string;
  onChange?: (code: string) => void;
}) => (
  <SelectField
    label={tr(lang, 'Currency', 'Para birimi')}
    name={fieldName}
    required
    {...(value !== undefined
      ? { value, onChange: (event) => onChange?.(event.target.value) }
      : { defaultValue: isCurrency(defaultValue) ? defaultValue : 'EUR' })}
  >
    {CURRENCIES.map((code) => (
      <option key={code} value={code}>
        {code}
      </option>
    ))}
  </SelectField>
);
const today = () => {
  const now = new Date();
  return [
    now.getFullYear(),
    String(now.getMonth() + 1).padStart(2, '0'),
    String(now.getDate()).padStart(2, '0'),
  ].join('-');
};
const roles = (user: unknown): string[] => {
  const value = (user as Row).roles;
  return Array.isArray(value) ? value : [(user as Row).role || 'parent'];
};
const can = (user: unknown, ...allowed: string[]) =>
  roles(user).some((role) => allowed.includes(role));
const isParent = (user: unknown) => roles(user).every((role) => role === 'parent');
const studentName = (data: unknown, id: string) =>
  name(list(data, 'students').find((student) => student.id === id));
const formValues = (event: FormEvent<HTMLFormElement>) =>
  Object.fromEntries(new FormData(event.currentTarget).entries()) as Record<string, string>;
const downloadCsv = (filename: string, columns: string[], records: (string | number)[][]) => {
  const encode = (value: string | number) => {
    let text = String(value ?? '');
    if (/^[=+@\-\t\r]/.test(text)) text = `'${text}`;
    return `"${text.replaceAll('"', '""')}"`;
  };
  const blob = new Blob(
    ['\uFEFF', [columns, ...records].map((row) => row.map(encode).join(',')).join('\r\n')],
    { type: 'text/csv;charset=utf-8' },
  );
  const url = URL.createObjectURL(blob);
  const anchor = document.createElement('a');
  anchor.href = url;
  anchor.download = filename;
  anchor.click();
  URL.revokeObjectURL(url);
};

export function StudentsPage(props: PageProps) {
  const { data, lang, api, user } = props;
  const action = useAction(props);
  const [search, setSearch] = useState('');
  const [language, setLanguage] = useState('');
  const [status, setStatus] = useState('active');
  const [selectedId, setSelectedId] = useState<string | null>(props.context?.studentId || null);
  const [tab, setTab] = useState(
    props.context?.action === 'family'
      ? 'family'
      : props.context?.action === 'enroll'
        ? 'learning'
        : 'overview',
  );
  const [modal, setModal] = useState<
    'register' | 'edit' | 'guardian' | 'invite' | 'enroll' | 'placement' | null
  >(props.context?.action === 'register' ? 'register' : null);
  const [enrollmentGroup, setEnrollmentGroup] = useState('');
  const [level, setLevel] = useState('');
  const [bulk, setBulk] = useState(false);
  const [term, setTerm] = useState('');
  const [dobMode, setDobMode] = useState<'dob' | 'age'>('dob');
  const [regYear, setRegYear] = useState('');
  const students = list(data, 'students');
  const selected = students.find((student) => student.id === selectedId);
  const manage = can(user, 'admin', 'administrator', 'academic_manager');
  const admin = can(user, 'admin', 'administrator');
  const parent = isParent(user);
  const classLevels = list(data, 'levels').filter((item) => item.kind === 'class');
  const years = list(data, 'academic_years');
  const staff = list(data, 'profiles').filter(
    (profile) =>
      profile.active !== false &&
      roles(profile).some((role) => ['teacher', 'academic_manager', 'guidance'].includes(role)),
  );
  // New students belong to the active academic year unless another term is chosen.
  const activeYearId = (years.find((year) => year.active) || years[0])?.id || '';
  const levelName = (id?: string) =>
    id
      ? label(
          classLevels.find((item) => item.id === id),
          lang,
        )
      : '—';
  const yearName = (id?: string) => years.find((year) => year.id === id)?.name || '—';
  useEffect(() => {
    if (modal !== 'register' && modal !== 'edit') return;
    const editing = modal === 'edit' ? selected : undefined;
    setDobMode(editing?.dob_estimated ? 'age' : 'dob');
    setRegYear(editing ? editing.registration_year_id || '' : activeYearId);
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [modal]);
  const filtered = students.filter(
    (student) =>
      `${student.student_number || ''} ${name(student)} ${student.parent_name || ''} ${student.parent_email || ''} ${student.student_phone || ''}`
        .toLowerCase()
        .includes(search.toLowerCase()) &&
      (!language || student.language === language) &&
      (!level || student.class_level_id === level) &&
      (!term || student.registration_year_id === term) &&
      (!status ||
        (status === 'active' ? student.status !== 'archived' : student.status === status)),
  );
  const guardLinks = selected
    ? list(data, 'guardians').filter((link) => link.student_id === selected.id)
    : [];
  const guardians = guardLinks.map(
    (link) => list(data, 'profiles').find((profile) => profile.id === link.profile_id) || link,
  );
  const selectedEnrollments = selected
    ? list(data, 'enrollments').filter((enrollment) => enrollment.student_id === selected.id)
    : [];
  const selectedAttendance = selected
    ? list(data, 'attendance').filter((record) => record.student_id === selected.id)
    : [];
  const studentSort = useSort(
    filtered,
    {
      name: (student) => name(student),
      age: (student) => ageFrom(student.dob),
      language: (student) => student.language,
      level: (student) => {
        const text = levelName(student.class_level_id);
        return text === '—' ? '' : text;
      },
      country: (student) => countryName(student.country, lang),
      term: (student) => {
        const text = yearName(student.registration_year_id);
        return text === '—' ? '' : text;
      },
      status: (student) => student.status || 'active',
      added: (student) => student.registered_at,
    },
    lang,
  );
  const enrollmentSort = useSort(
    selectedEnrollments,
    {
      class: (enrollment) =>
        label(
          list(data, 'classes').find((group) => group.id === enrollment.class_id),
          lang,
        ),
      started: (enrollment) => enrollment.started_on,
      ended: (enrollment) => enrollment.ended_on,
    },
    lang,
  );
  const attendanceSort = useSort(
    selectedAttendance,
    {
      lesson: (record) => {
        const session = list(data, 'sessions').find((item) => item.id === record.session_id);
        return session?.starts_at || session?.session_date || record.starts_at || record.created_at;
      },
      status: (record) => record.status,
      excused: (record) => (record.excused ? 1 : 0),
    },
    lang,
  );
  const close = () => {
    setModal(null);
    setEnrollmentGroup('');
    action.clear();
  };
  const saveStudent = (event: FormEvent<HTMLFormElement>) => {
    event.preventDefault();
    const raw = formValues(event);
    const { age, ...values } = raw as Record<string, any>;
    if (dobMode === 'age') {
      values.dob = dobFromAge(Number(age));
      values.dob_estimated = true;
    } else values.dob_estimated = false;
    // One name field: the full name lives in first_name.
    values.first_name = String(values.first_name || '')
      .trim()
      .replace(/\s+/g, ' ');
    values.last_name = null;
    for (const key of [
      'parent_name',
      'parent_email',
      'parent_phone',
      'country',
      'contact_teacher_id',
      'class_level_id',
      'registration_year_id',
      'staff_notes',
    ])
      if (key in values && !String(values[key]).trim()) values[key] = null;

    let saved: Row | undefined;
    void action.run(
      async () => {
        saved =
          modal === 'register'
            ? await api.rpc('register_student', {
                p_payload: { ...values, student_phone: values.student_phone || null },
              })
            : await api.save('students', {
                id: selected!.id,
                ...values,
                student_phone: values.student_phone || null,
              });
      },
      () => {
        close();
        if (saved?.id) {
          setSelectedId(saved.id);
          setTab('overview');
        }
      },
    );
  };
  return (
    <>
      {selected ? (
        <>
          <button
            className="back-link"
            onClick={() => {
              if (confirmLeave(lang)) setSelectedId(null);
            }}
          >
            <ArrowLeft size={16} />
            {tr(lang, 'All students', 'Tüm öğrenciler')}
          </button>
          <PageHeader
            eyebrow={tr(lang, 'Student profile', 'Öğrenci profili')}
            title={name(selected)}
            description={`${selected.student_number || ''} · ${tr(lang, 'Registered', 'Kayıt tarihi')} ${date(selected.registered_at || selected.created_at, lang)} · ${selected.language === 'tr' ? 'Türkçe' : 'English'}`}
          >
            <StatusBadge value={studentStatusValue(selected)} lang={lang} />
            {manage && (
              <Button onClick={() => setModal('edit')} variant="secondary">
                {tr(lang, 'Edit profile', 'Profili düzenle')}
              </Button>
            )}
          </PageHeader>
          <Tabs
            label={tr(lang, 'Student sections', 'Öğrenci bölümleri')}
            value={tab}
            onChange={(next) => {
              if (confirmLeave(lang)) setTab(next);
            }}
            items={[
              ['overview', 'Overview', 'Genel bakış'],
              ['family', 'Family', 'Aile'],
              ['learning', 'Learning', 'Eğitim'],
              ['attendance', 'Attendance', 'Yoklama'],
            ].map(([id, en, turkish]) => ({ id, label: tr(lang, en, turkish) }))}
          />
          {tab === 'overview' && (
            <div className="detail-grid">
              <section className="card">
                <div className="card-header">
                  <h3>{tr(lang, 'A little about the learner', 'Öğrenciyi tanıyalım')}</h3>
                  <GraduationCap size={20} className="muted" />
                </div>
                <dl className="detail-list">
                  <div>
                    <dt>{tr(lang, 'Student number', 'Öğrenci numarası')}</dt>
                    <dd>{selected.student_number || '—'}</dd>
                  </div>
                  <div>
                    <dt>{tr(lang, 'Full name', 'Adı soyadı')}</dt>
                    <dd>{name(selected)}</dd>
                  </div>
                  <div>
                    <dt>{tr(lang, 'Date of birth', 'Doğum tarihi')}</dt>
                    <dd>{formatDob(selected.dob, selected.dob_estimated, lang)}</dd>
                  </div>
                  <div>
                    <dt>{tr(lang, 'Course language', 'Ders dili')}</dt>
                    <dd>{selected.language === 'tr' ? 'Türkçe' : 'English'}</dd>
                  </div>
                  <div>
                    <dt>{tr(lang, 'Class level', 'Ana sınıf seviyesi')}</dt>
                    <dd>{levelName(selected.class_level_id)}</dd>
                  </div>
                  <div>
                    <dt>{tr(lang, 'Country', 'Ülke')}</dt>
                    <dd>{countryName(selected.country, lang) || '—'}</dd>
                  </div>
                  <div>
                    <dt>{tr(lang, 'Contact teacher', 'Kontak hoca')}</dt>
                    <dd>
                      {name(
                        list(data, 'profiles').find(
                          (profile) => profile.id === selected.contact_teacher_id,
                        ),
                      )}
                    </dd>
                  </div>
                  <div>
                    <dt>{tr(lang, 'Registration term', 'Kayıt dönemi')}</dt>
                    <dd>{yearName(selected.registration_year_id)}</dd>
                  </div>
                  <div>
                    <dt>{tr(lang, 'Student phone', 'Öğrenci telefonu')}</dt>
                    <dd>{selected.student_phone || '—'}</dd>
                  </div>
                </dl>
                {selected.staff_notes && (
                  <div className="staff-note card-inset">
                    <h3>{tr(lang, 'Notes (staff only)', 'Notlar (yalnızca personel)')}</h3>
                    <p className="pre-wrap">{selected.staff_notes}</p>
                  </div>
                )}
              </section>
              <section className="card">
                <div className="card-header">
                  <h3>{tr(lang, 'Their learning journey', 'Eğitim yolculuğu')}</h3>
                </div>
                <div className="padded">
                  <div className="stat-grid compact">
                    <StatCard
                      title={tr(lang, 'Classes', 'Sınıflar')}
                      value={
                        selectedEnrollments.filter((enrollment) => !enrollment.ended_on).length
                      }
                    />
                    <StatCard
                      title={tr(lang, 'Lessons recorded', 'Kayıtlı dersler')}
                      value={selectedAttendance.length}
                    />
                  </div>
                  <p className="muted">
                    {tr(
                      lang,
                      'Every small step is progress. Explore classes and attendance from the tabs above.',
                      'Her küçük adım bir gelişimdir. Yukarıdaki sekmelerden sınıfları ve yoklamayı inceleyin.',
                    )}
                  </p>
                </div>
              </section>
            </div>
          )}
          {tab === 'family' && (
            <section className="card">
              <div className="card-header">
                <h3>{tr(lang, 'Parents & guardians', 'Veliler')}</h3>
                {manage && (
                  <div className="inline-actions">
                    <Button onClick={() => setModal('guardian')} variant="secondary">
                      <Plus size={16} />
                      {tr(lang, 'Add parent', 'Veli ekle')}
                    </Button>
                    {admin && (
                      <Button onClick={() => setModal('invite')} variant="secondary">
                        <Mail size={16} />
                        {tr(lang, 'Send invitation', 'Davet gönder')}
                      </Button>
                    )}
                  </div>
                )}
              </div>
              <div className="padded stack">
                {(selected.parent_name || selected.parent_email || selected.parent_phone) && (
                  <div className="list-row">
                    <div>
                      <strong>
                        {selected.parent_name ||
                          tr(lang, 'Parent contact', 'Veli iletişim bilgileri')}
                      </strong>
                      <p>
                        {[selected.parent_email, selected.parent_phone]
                          .filter(Boolean)
                          .join(' · ') || '—'}
                      </p>
                      <small className="muted">
                        {tr(
                          lang,
                          'Contact details provided at registration',
                          'Kayıt sırasında verilen iletişim bilgileri',
                        )}
                      </small>
                    </div>
                  </div>
                )}
                {guardians.length ? (
                  <div className="people-grid">
                    {guardians.map((guardian, index) => (
                      <article className="person-card" key={guardian.id || index}>
                        <div className="avatar">{initials(name(guardian))}</div>
                        <h3>{name(guardian)}</h3>
                        <p>{displayLogin(guardian.email) || '—'}</p>
                        <p>{guardian.phone || '—'}</p>
                        <small className="muted">{tr(lang, 'Guardian', 'Veli')}</small>
                      </article>
                    ))}
                  </div>
                ) : (
                  <EmptyState
                    title={tr(lang, 'No guardian linked yet', 'Henüz veli eklenmedi')}
                    description={tr(
                      lang,
                      admin
                        ? 'Add a registered parent or send an invitation.'
                        : 'Parent accounts with access to this student appear here.',
                      admin
                        ? 'Kayıtlı velilerden seçebilir veya davet gönderebilirsiniz.'
                        : 'Öğrenciyi takip edebilen veli hesapları burada görünür.',
                    )}
                  />
                )}
              </div>
            </section>
          )}
          {tab === 'learning' && (
            <div className="stack">
              <section className="card">
                <div className="card-header">
                  <h3>{tr(lang, 'Classes & enrollment history', 'Sınıflar ve kayıt geçmişi')}</h3>
                  {manage && selected.status !== 'archived' && (
                    <Button variant="secondary" onClick={() => setModal('enroll')}>
                      <Plus size={16} />
                      {tr(lang, 'Enroll in a class', 'Sınıfa kaydet')}
                    </Button>
                  )}
                </div>
                {selectedEnrollments.length ? (
                  <div className="table-wrap">
                    <table className="data-table">
                      <thead>
                        <tr>
                          {enrollmentSort.header('class', tr(lang, 'Class', 'Sınıf'))}
                          {enrollmentSort.header('started', tr(lang, 'Started', 'Başlangıç'))}
                          {enrollmentSort.header('ended', tr(lang, 'Ended', 'Bitiş'))}
                        </tr>
                      </thead>
                      <tbody>
                        {enrollmentSort.sorted.map((enrollment) => (
                          <tr key={enrollment.id}>
                            <td>
                              {label(
                                list(data, 'classes').find(
                                  (group) => group.id === enrollment.class_id,
                                ),
                                lang,
                              )}
                            </td>
                            <td>{date(enrollment.started_on, lang)}</td>
                            <td>
                              {enrollment.ended_on ? (
                                date(enrollment.ended_on, lang)
                              ) : (
                                <StatusBadge value="active" lang={lang} />
                              )}
                            </td>
                          </tr>
                        ))}
                      </tbody>
                    </table>
                  </div>
                ) : (
                  <EmptyState
                    title={tr(lang, 'Ready for a new class', 'Yeni bir sınıfa hazır')}
                    description={tr(
                      lang,
                      'Class enrollments will appear here.',
                      'Öğrencinin sınıf kayıtları burada görünür.',
                    )}
                  />
                )}
              </section>
              {!parent && (
                <section className="card">
                  <div className="card-header">
                    <h3>{tr(lang, 'Placement assessments', 'Seviye tespiti')}</h3>
                    {can(user, 'admin', 'administrator', 'academic_manager', 'teacher') && (
                      <Button onClick={() => setModal('placement')} variant="secondary">
                        <Plus size={16} />
                        {tr(lang, 'Record placement', 'Seviye kaydet')}
                      </Button>
                    )}
                  </div>
                  <div className="padded">
                    {list(data, 'placements')
                      .filter((placement) => placement.student_id === selected.id)
                      .map((placement) => (
                        <div className="list-row" key={placement.id}>
                          <div>
                            <strong>
                              {label(
                                list(data, 'levels').find(
                                  (level) => level.id === placement.specialist_level_id,
                                ),
                                lang,
                              )}
                            </strong>
                            <p className="muted">
                              {label(
                                list(data, 'levels').find(
                                  (level) => level.id === placement.knowledge_level_id,
                                ),
                                lang,
                              )}
                            </p>
                          </div>
                          <span>{date(placement.assessed_on, lang)}</span>
                        </div>
                      ))}
                    {!list(data, 'placements').some(
                      (placement) => placement.student_id === selected.id,
                    ) && (
                      <p className="muted">
                        {tr(
                          lang,
                          'No placement assessment recorded.',
                          'Henüz seviye tespiti kaydı yok.',
                        )}
                      </p>
                    )}
                  </div>
                </section>
              )}
            </div>
          )}
          {tab === 'attendance' && (
            <section className="card">
              <div className="card-header">
                <h3>{tr(lang, 'Lesson attendance', 'Ders yoklaması')}</h3>
              </div>
              {selectedAttendance.length ? (
                <div className="table-wrap">
                  <table className="data-table">
                    <thead>
                      <tr>
                        {attendanceSort.header('lesson', tr(lang, 'Lesson', 'Ders'))}
                        {attendanceSort.header('status', tr(lang, 'Status', 'Durum'))}
                        {attendanceSort.header('excused', tr(lang, 'Excused', 'Mazeretli'))}
                      </tr>
                    </thead>
                    <tbody>
                      {attendanceSort.sorted.map((record) => {
                        const session = list(data, 'sessions').find(
                          (item) => item.id === record.session_id,
                        );
                        return (
                          <tr key={record.id}>
                            <td>
                              {date(
                                session?.starts_at ||
                                  session?.session_date ||
                                  record.starts_at ||
                                  record.created_at,
                                lang,
                              )}
                            </td>
                            <td>
                              <StatusBadge value={record.status} lang={lang} />
                            </td>
                            <td>{record.excused ? tr(lang, 'Yes', 'Evet') : '—'}</td>
                          </tr>
                        );
                      })}
                    </tbody>
                  </table>
                </div>
              ) : (
                <EmptyState
                  title={tr(lang, 'Attendance will appear here', 'Yoklama burada görünecek')}
                />
              )}
            </section>
          )}
        </>
      ) : (
        <>
          <PageHeader
            eyebrow={tr(lang, 'A place for every learner', 'Her öğrenciye bir yer')}
            title={
              parent ? tr(lang, 'My children', 'Çocuklarım') : tr(lang, 'Students', 'Öğrenciler')
            }
            description={tr(
              lang,
              'Small steps. Growing confidence. All your students in one place.',
              'Küçük adımlar, büyüyen özgüven. Tüm öğrencileriniz tek yerde.',
            )}
          >
            {!parent && (
              <Button
                onClick={() =>
                  downloadCsv(
                    'school-portal-students.csv',
                    [
                      tr(lang, 'Student number', 'Öğrenci numarası'),
                      tr(lang, 'Name and surname', 'Ad Soyad'),
                      tr(lang, 'Language', 'Dil'),
                      tr(lang, 'Registration date', 'Kayıt tarihi'),
                      tr(lang, 'Status', 'Durum'),
                    ],
                    filtered.map((student) => [
                      student.student_number || '',
                      name(student),
                      student.language,
                      student.registered_at || '',
                      statusLabel(student.status || 'active', lang),
                    ]),
                  )
                }
                variant="secondary"
              >
                <Download size={16} />
                {tr(lang, 'Export', 'Dışa aktar')}
              </Button>
            )}
            {manage && (
              <Button variant="secondary" onClick={() => setBulk(true)}>
                <Upload size={16} />
                {tr(lang, 'Bulk import', 'Toplu yükle')}
              </Button>
            )}
            {manage && (
              <Button variant="primary" onClick={() => setModal('register')}>
                <Plus size={17} />
                {tr(lang, 'Register student', 'Öğrenci kaydet')}
              </Button>
            )}
          </PageHeader>
          {bulk && <StudentImport props={props} onClose={() => setBulk(false)} />}
          <div className="stat-grid">
            <StatCard
              title={tr(lang, 'Active students', 'Aktif öğrenciler')}
              value={students.filter((student) => student.status !== 'archived').length}
              subtitle={tr(lang, 'Growing together', 'Birlikte büyüyoruz')}
            />
            <StatCard
              title={tr(lang, 'English learners', 'İngilizce öğrencileri')}
              value={
                students.filter(
                  (student) => student.language === 'en' && student.status !== 'archived',
                ).length
              }
            />
            <StatCard
              title={tr(lang, 'Turkish learners', 'Türkçe öğrencileri')}
              value={
                students.filter(
                  (student) => student.language === 'tr' && student.status !== 'archived',
                ).length
              }
            />
          </div>
          <section className="card">
            <div className="toolbar">
              <SearchField
                value={search}
                onChange={(event) => setSearch(event.target.value)}
                placeholder={tr(
                  lang,
                  'Search by student number or name…',
                  'Öğrenci numarası veya ad ile ara…',
                )}
                label={tr(lang, 'Search students', 'Öğrenci ara')}
              />
              <select
                value={language}
                onChange={(event) => setLanguage(event.target.value)}
                aria-label={tr(lang, 'Teaching language', 'Eğitim dili')}
              >
                <option value="">{tr(lang, 'All languages', 'Tüm diller')}</option>
                <option value="en">English</option>
                <option value="tr">Türkçe</option>
              </select>
              <select
                value={level}
                onChange={(event) => setLevel(event.target.value)}
                aria-label={tr(lang, 'Class level', 'Ana sınıf seviyesi')}
              >
                <option value="">{tr(lang, 'All levels', 'Tüm seviyeler')}</option>
                {classLevels.map((item) => (
                  <option key={item.id} value={item.id}>
                    {label(item, lang)}
                  </option>
                ))}
              </select>
              <select
                value={term}
                onChange={(event) => setTerm(event.target.value)}
                aria-label={tr(lang, 'Registration term', 'Kayıt dönemi')}
              >
                <option value="">{tr(lang, 'All terms', 'Tüm dönemler')}</option>
                {years.map((year) => (
                  <option key={year.id} value={year.id}>
                    {year.name}
                  </option>
                ))}
              </select>
              <select
                value={status}
                onChange={(event) => setStatus(event.target.value)}
                aria-label={tr(lang, 'Student status', 'Öğrenci durumu')}
              >
                <option value="active">{tr(lang, 'Active', 'Aktif')}</option>
                <option value="archived">{tr(lang, 'Left school', 'Okuldan ayrıldı')}</option>
                <option value="">{tr(lang, 'All statuses', 'Tüm durumlar')}</option>
              </select>
            </div>
            {filtered.length ? (
              <div className="table-wrap">
                <table className="data-table">
                  <thead>
                    <tr>
                      {studentSort.header('name', tr(lang, 'Student', 'Öğrenci'))}
                      {studentSort.header('age', tr(lang, 'Age', 'Yaş'))}
                      {studentSort.header('language', tr(lang, 'Language', 'Dil'))}
                      {studentSort.header('level', tr(lang, 'Class level', 'Seviye'))}
                      {studentSort.header('country', tr(lang, 'Country', 'Ülke'))}
                      {studentSort.header('term', tr(lang, 'Term', 'Dönem'))}
                      {studentSort.header('status', tr(lang, 'Status', 'Durum'))}
                      {studentSort.header('added', tr(lang, 'Added', 'Eklenme tarihi'))}
                      <th scope="col">
                        <span className="sr-only">{tr(lang, 'Open', 'Aç')}</span>
                      </th>
                    </tr>
                  </thead>
                  <tbody>
                    {studentSort.sorted.map((student, index) => (
                      <tr key={student.id}>
                        <td>
                          <button
                            className="student-cell"
                            onClick={() => {
                              if (!confirmLeave(lang)) return;
                              setSelectedId(student.id);
                              setTab('overview');
                            }}
                          >
                            <span className={`avatar avatar-${index % 4}`}>
                              {initials(name(student))}
                            </span>
                            <span>
                              <strong>{name(student)}</strong>
                              <small>{student.student_number || '—'}</small>
                            </span>
                          </button>
                        </td>
                        <td>
                          {ageFrom(student.dob) === null ? (
                            '—'
                          ) : (
                            <>
                              {ageFrom(student.dob)} {tr(lang, 'yrs', 'yaş')}
                              {student.dob_estimated && (
                                <span className="muted">
                                  {' '}
                                  {tr(lang, '(estimated)', '(tahmini)')}
                                </span>
                              )}
                            </>
                          )}
                        </td>
                        <td>
                          <span className="language-tag">
                            {student.language === 'tr' ? 'TR' : 'EN'}
                          </span>{' '}
                          {student.language === 'tr' ? 'Türkçe' : 'English'}
                        </td>
                        <td>{levelName(student.class_level_id)}</td>
                        <td>{countryName(student.country, lang) || '—'}</td>
                        <td>{yearName(student.registration_year_id)}</td>
                        <td>
                          <StatusBadge value={studentStatusValue(student)} lang={lang} />
                        </td>
                        <td>{shortDay(student.registered_at, lang)}</td>
                        <td>
                          <button
                            className="icon-button"
                            onClick={() => {
                              if (!confirmLeave(lang)) return;
                              setSelectedId(student.id);
                              setTab('overview');
                            }}
                            aria-label={`${tr(lang, 'Open profile', 'Profili aç')}: ${name(student)}`}
                          >
                            <ChevronRight size={19} />
                          </button>
                        </td>
                      </tr>
                    ))}
                  </tbody>
                </table>
              </div>
            ) : (
              <EmptyState
                title={tr(lang, 'No students found', 'Öğrenci bulunamadı')}
                description={
                  students.length
                    ? tr(
                        lang,
                        'Try another name or adjust your filters.',
                        'Başka bir ad arayın veya filtreleri değiştirin.',
                      )
                    : tr(
                        lang,
                        'Welcome your first student to School Portal.',
                        'İlk öğrencinizi School Portal ailesine katın.',
                      )
                }
              />
            )}
            <div className="table-footer">
              {filtered.length} {tr(lang, 'students', 'öğrenci')}
            </div>
          </section>
        </>
      )}
      {(modal === 'register' || modal === 'edit') && (
        <Modal
          title={
            modal === 'register'
              ? tr(lang, 'Welcome a new student', 'Yeni bir öğrenci kaydedin')
              : tr(lang, 'Edit student profile', 'Öğrenci profilini düzenle')
          }
          onClose={close}
          lang={lang}
          bare
        >
          <form onSubmit={saveStudent}>
            <div className="modal-body stack">
              <FormError error={action.error} />
              <div className="form-grid">
                <Field
                  label={tr(lang, 'Name and surname', 'Ad Soyad')}
                  name="first_name"
                  defaultValue={modal === 'edit' ? name(selected) : ''}
                  required
                  maxLength={160}
                />
                <div className="field dob-mode">
                  <span>{tr(lang, 'Birth date or age', 'Doğum tarihi veya yaş')}</span>
                  <div
                    className="segmented"
                    role="radiogroup"
                    aria-label={tr(lang, 'Enter birth date or age', 'Doğum tarihi veya yaş girin')}
                  >
                    {(
                      [
                        ['dob', 'Date of birth', 'Doğum tarihi'],
                        ['age', 'Age', 'Yaş'],
                      ] as const
                    ).map(([id, en, turkish]) => (
                      <button
                        key={id}
                        type="button"
                        role="radio"
                        aria-checked={dobMode === id}
                        className={dobMode === id ? 'active' : ''}
                        onClick={() => setDobMode(id)}
                      >
                        {tr(lang, en, turkish)}
                      </button>
                    ))}
                  </div>
                </div>
                {dobMode === 'dob' ? (
                  <Field
                    key="dob"
                    label={tr(lang, 'Date of birth', 'Doğum tarihi')}
                    name="dob"
                    type="date"
                    defaultValue={modal === 'edit' && !selected?.dob_estimated ? selected?.dob : ''}
                    max={today()}
                    required
                  />
                ) : (
                  <Field
                    key="age"
                    label={tr(lang, 'Age', 'Yaş')}
                    name="age"
                    type="number"
                    min={2}
                    max={25}
                    defaultValue={modal === 'edit' ? (ageFrom(selected?.dob) ?? '') : ''}
                    required
                    hint={tr(
                      lang,
                      'Saved as 1 January of the birth year (01.01.YYYY).',
                      'Doğum yılının 1 Ocak tarihi olarak kaydedilir (01.01.YYYY).',
                    )}
                  />
                )}
                <SelectField
                  label={tr(lang, 'Course language', 'Ders dili')}
                  name="language"
                  defaultValue={modal === 'edit' ? selected?.language : lang}
                >
                  <option value="en">English</option>
                  <option value="tr">Türkçe</option>
                </SelectField>
                <SelectField
                  label={tr(lang, 'Class level', 'Ana sınıf seviyesi')}
                  name="class_level_id"
                  defaultValue={modal === 'edit' ? selected?.class_level_id || '' : ''}
                >
                  <option value="">{tr(lang, 'Not set', 'Belirtilmedi')}</option>
                  {classLevels.map((item) => (
                    <option key={item.id} value={item.id}>
                      {label(item, lang)}
                    </option>
                  ))}
                </SelectField>
                <SelectField
                  label={tr(lang, 'Country', 'Ülke')}
                  name="country"
                  defaultValue={modal === 'edit' ? selected?.country || '' : ''}
                >
                  <option value="">{tr(lang, 'Not set', 'Belirtilmedi')}</option>
                  {modal === 'edit' &&
                    selected?.country &&
                    !/^[A-Z]{2}$/.test(selected.country) && (
                      <option value={selected.country}>{selected.country}</option>
                    )}
                  <optgroup label={tr(lang, 'Most common', 'En sık')}>
                    {countryOptions(lang).common.map((item) => (
                      <option key={item.code} value={item.code}>
                        {item.name}
                      </option>
                    ))}
                  </optgroup>
                  <optgroup label={tr(lang, 'All countries', 'Tüm ülkeler')}>
                    {countryOptions(lang).all.map((item) => (
                      <option key={item.code} value={item.code}>
                        {item.name}
                      </option>
                    ))}
                  </optgroup>
                </SelectField>
                <SelectField
                  label={tr(lang, 'Contact teacher', 'Kontak hoca')}
                  name="contact_teacher_id"
                  defaultValue={modal === 'edit' ? selected?.contact_teacher_id || '' : ''}
                >
                  <option value="">{tr(lang, 'Not assigned', 'Atanmadı')}</option>
                  {staff.map((profile) => (
                    <option key={profile.id} value={profile.id}>
                      {name(profile)}
                    </option>
                  ))}
                </SelectField>
                <SelectField
                  label={tr(lang, 'Registration term', 'Kayıt dönemi')}
                  name="registration_year_id"
                  value={regYear}
                  onChange={(event) => setRegYear(event.target.value)}
                >
                  <option value="">{tr(lang, 'Not set', 'Belirtilmedi')}</option>
                  {years.map((year) => (
                    <option key={year.id} value={year.id}>
                      {year.name}
                    </option>
                  ))}
                </SelectField>
                <Field
                  label={tr(lang, 'Student phone (optional)', 'Öğrenci telefonu (isteğe bağlı)')}
                  name="student_phone"
                  type="tel"
                  defaultValue={modal === 'edit' ? selected?.student_phone : ''}
                />
                <Field
                  label={tr(lang, 'Registration date', 'Kayıt tarihi')}
                  name="registered_at"
                  type="date"
                  defaultValue={modal === 'edit' ? selected?.registered_at?.slice(0, 10) : today()}
                  required
                />
              </div>
              <>
                <h3>{tr(lang, 'Parent or guardian', 'Veli')}</h3>
                <Field
                  label={tr(lang, 'Parent full name', 'Veli adı soyadı')}
                  name="parent_name"
                  defaultValue={modal === 'edit' ? selected?.parent_name || '' : ''}
                />
                <div className="form-grid">
                  <Field
                    label={tr(lang, 'Parent email', 'Veli e-postası')}
                    name="parent_email"
                    type="email"
                    defaultValue={modal === 'edit' ? selected?.parent_email || '' : ''}
                  />
                  <Field
                    label={tr(lang, 'Parent phone', 'Veli telefonu')}
                    name="parent_phone"
                    type="tel"
                    defaultValue={modal === 'edit' ? selected?.parent_phone || '' : ''}
                  />
                </div>
                <p className="form-hint">
                  {tr(
                    lang,
                    'All parent details are optional. Email is checked only when entered.',
                    'Veli bilgilerinin tümü isteğe bağlıdır. E-posta yalnızca girildiğinde kontrol edilir.',
                  )}
                </p>
                <TextArea
                  label={tr(
                    lang,
                    'Notes and parent comments (staff only)',
                    'Not ve veli yorumu (yalnızca personel)',
                  )}
                  name="staff_notes"
                  defaultValue={modal === 'edit' ? selected?.staff_notes || '' : ''}
                  maxLength={2000}
                />
                <p className="form-hint">
                  {tr(
                    lang,
                    'After saving, you can add a parent account from this student’s Family tab.',
                    'Kaydettikten sonra öğrencinin Aile sekmesinden veli hesabı ekleyebilirsiniz.',
                  )}
                </p>
              </>
              {modal === 'edit' && (
                <SelectField
                  label={tr(lang, 'Status', 'Durum')}
                  name="status"
                  defaultValue={selected?.status || 'active'}
                >
                  <option value="active">{tr(lang, 'Active', 'Aktif')}</option>
                  <option value="support">
                    {tr(lang, 'Support in progress', 'Destek sürüyor')}
                  </option>
                  <option value="archived">{tr(lang, 'Left school', 'Okuldan ayrıldı')}</option>
                </SelectField>
              )}
            </div>
            <FormActions
              busy={action.busy}
              lang={lang}
              onCancel={close}
              submit={
                modal === 'register' ? tr(lang, 'Register student', 'Öğrenci kaydet') : undefined
              }
            />
          </form>
        </Modal>
      )}
      {modal === 'guardian' && selected && (
        <Modal title={tr(lang, 'Add parent', 'Veli ekle')} onClose={close} lang={lang} bare>
          <form
            onSubmit={(event) => {
              event.preventDefault();
              const values = formValues(event);
              void action.run(
                () =>
                  api.rpc('link_guardian', {
                    p_student_id: selected.id,
                    p_profile_id: values.profile_id,
                  }),
                () => {
                  close();
                  props.notify(tr(lang, 'Parent added.', 'Veli eklendi.'));
                },
                true,
              );
            }}
          >
            <div className="modal-body stack">
              <FormError error={action.error} />
              <SelectField
                label={tr(lang, 'Registered parents', 'Kayıtlı veliler')}
                name="profile_id"
                required
              >
                <option value="">{tr(lang, 'Choose a parent', 'Veli seçin')}</option>
                {list(data, 'profiles')
                  .filter(
                    (profile) =>
                      roles(profile).includes('parent') &&
                      profile.active !== false &&
                      !guardLinks.some((link) => link.profile_id === profile.id),
                  )
                  .map((profile) => (
                    <option key={profile.id} value={profile.id}>
                      {name(profile)} · {displayLogin(profile.email)}
                    </option>
                  ))}
              </SelectField>
              <p className="form-hint">
                {tr(
                  lang,
                  'The parent will also see this child in their existing account.',
                  'Öğrenci, velinin mevcut hesabında da görünecek.',
                )}
              </p>
            </div>
            <FormActions
              busy={action.busy}
              lang={lang}
              onCancel={close}
              submit={tr(lang, 'Add as parent', 'Veli olarak ekle')}
            />
          </form>
        </Modal>
      )}
      {modal === 'invite' && selected && admin && (
        <Modal
          title={tr(lang, 'Invite a parent', 'Veliye davet gönder')}
          onClose={close}
          lang={lang}
          bare
        >
          <form
            onSubmit={(event) => {
              event.preventDefault();
              const values = formValues(event);
              let existing = false;
              void action.run(
                async () => {
                  const result = await api.invite({
                    email: String(values.email),
                    full_name: String(values.full_name),
                    roles: ['parent'],
                    student_ids: [selected.id],
                    language: values.language as Lang,
                  });
                  existing = !!result.existingUser;
                },
                () => {
                  close();
                  props.notify(
                    existing
                      ? tr(lang, 'Parent added.', 'Veli eklendi.')
                      : tr(lang, 'Invitation sent.', 'Davet gönderildi.'),
                  );
                },
                true,
              );
            }}
          >
            <div className="modal-body stack">
              <FormError error={action.error} />
              <Field
                label={tr(lang, 'Parent name', 'Veli adı')}
                name="full_name"
                required
                defaultValue={selected.parent_name || ''}
              />
              <Field
                label={tr(lang, 'Email', 'E-posta')}
                name="email"
                type="email"
                required
                defaultValue={selected.parent_email || ''}
              />
              <SelectField
                label={tr(lang, 'Language', 'Dil')}
                name="language"
                defaultValue={selected.language || lang}
              >
                <option value="tr">Türkçe</option>
                <option value="en">English</option>
              </SelectField>
              <p className="form-hint">
                {tr(
                  lang,
                  'A new parent receives an email invitation. If an account already exists, this child is added to it.',
                  'Yeni veliye e-posta daveti gönderilir. Hesabı varsa öğrenci mevcut hesabına eklenir.',
                )}
              </p>
            </div>
            <FormActions
              busy={action.busy}
              lang={lang}
              onCancel={close}
              submit={tr(lang, 'Send invitation', 'Davet gönder')}
            />
          </form>
        </Modal>
      )}
      {modal === 'enroll' && selected && manage && (
        <Modal
          title={tr(lang, 'Enroll in a class', 'Sınıfa kaydet')}
          onClose={close}
          lang={lang}
          bare
        >
          <form
            onSubmit={(event) => {
              event.preventDefault();
              const lessons = data.classes.filter(
                (c) => c.group_id === enrollmentGroup && c.active,
              );
              void action.run(
                () =>
                  api.rpc('enroll_student_batch', {
                    p_student_id: selected.id,
                    p_class_ids: lessons.map((c) => c.id),
                    p_started_on: schoolDay(new Date(), schoolTimezone(data)),
                  }),
                () => {
                  close();
                  props.notify(tr(lang, 'Class enrollment saved.', 'Sınıf kaydı tamamlandı.'));
                },
                true,
              );
            }}
          >
            <div className="modal-body stack">
              <FormError error={action.error} />
              <SelectField
                label={tr(lang, 'Class', 'Sınıf')}
                required
                value={enrollmentGroup}
                onChange={(event) => setEnrollmentGroup(event.target.value)}
              >
                <option value="">{tr(lang, 'Choose a class', 'Sınıf seçin')}</option>
                {data.class_groups
                  .filter(
                    (g) => g.active && data.classes.some((c) => c.group_id === g.id && c.active),
                  )
                  .map((g) => (
                    <option key={g.id} value={g.id}>
                      {g.name} · {yearName(g.academic_year_id)}
                    </option>
                  ))}
              </SelectField>
              {!!enrollmentGroup && (
                <p>
                  {data.classes
                    .filter((c) => c.group_id === enrollmentGroup && c.active)
                    .map((c) => c.name)
                    .join(', ')}
                </p>
              )}
              <p className="form-hint">
                {tr(
                  lang,
                  'The student is enrolled in this class’s lessons. Existing enrollments are kept.',
                  'Öğrenci bu sınıfın derslerine kaydedilir. Mevcut kayıtları korunur.',
                )}
              </p>
            </div>
            <FormActions
              busy={action.busy}
              lang={lang}
              onCancel={close}
              submit={tr(lang, 'Enroll', 'Sınıfa kaydet')}
            />
          </form>
        </Modal>
      )}
      {modal === 'placement' && selected && (
        <Modal
          title={tr(lang, 'Record placement', 'Seviye tespiti kaydet')}
          onClose={close}
          lang={lang}
          bare
        >
          <form
            onSubmit={(event) => {
              event.preventDefault();
              const values = formValues(event);
              void action.run(
                () =>
                  api.save('placements', {
                    ...values,
                    specialist_level_id: values.specialist_level_id || null,
                    knowledge_level_id: values.knowledge_level_id || null,
                    student_id: selected.id,
                    assessor_id: user.id,
                  }),
                close,
              );
            }}
          >
            <div className="modal-body stack">
              <FormError error={action.error} />
              <Field
                label={tr(lang, 'Assessment date', 'Değerlendirme tarihi')}
                name="assessed_on"
                type="date"
                defaultValue={today()}
                required
              />
              <SelectField
                label={tr(lang, 'Specialist reading level', 'Uzmanlık seviyesi seviyesi')}
                name="specialist_level_id"
                required
              >
                <option value="">{tr(lang, 'Choose level', 'Seviye seçin')}</option>
                {list(data, 'levels')
                  .filter((level) => level.active !== false && level.kind === 'specialist')
                  .map((level) => (
                    <option key={level.id} value={level.id}>
                      {label(level, lang)}
                    </option>
                  ))}
              </SelectField>
              <SelectField
                label={tr(lang, 'Knowledge track level', 'Bilgi rotası seviyesi')}
                name="knowledge_level_id"
              >
                <option value="">{tr(lang, 'Not assessed yet', 'Henüz değerlendirilmedi')}</option>
                {list(data, 'levels')
                  .filter((level) => level.active !== false && level.kind === 'knowledge')
                  .map((level) => (
                    <option key={level.id} value={level.id}>
                      {label(level, lang)}
                    </option>
                  ))}
              </SelectField>
              <p className="form-hint">
                {tr(
                  lang,
                  'Knowledge levels can be added by an administrator in Settings.',
                  'Bilgi seviyeleri yönetici tarafından Ayarlar bölümünden eklenebilir.',
                )}
              </p>
              <TextArea label={tr(lang, 'Assessor notes', 'Değerlendiren notları')} name="notes" />
            </div>
            <FormActions busy={action.busy} lang={lang} onCancel={close} />
          </form>
        </Modal>
      )}
    </>
  );
}

export function PeoplePage(props: PageProps) {
  const { data, lang, api, user } = props;
  const action = useAction(props);
  const [search, setSearch] = useState('');
  const [modal, setModal] = useState(false);
  const [role, setRole] = useState('teacher');
  const [accountKind, setAccountKind] = useState<'email' | 'username'>('email');
  const [editProfile, setEditProfile] = useState<Row | null>(null);
  const [showArchived, setShowArchived] = useState(false);
  const manage = can(user, 'admin', 'administrator');
  const everyone = list(data, 'profiles');
  const archivedCount = everyone.filter((person) => person.active === false).length;
  const people = everyone.filter(
    (person) =>
      (showArchived || person.active !== false) &&
      `${name(person)} ${person.email || ''}`.toLowerCase().includes(search.toLowerCase()),
  );
  const peopleSort = useSort(
    people,
    {
      name: (person) => name(person),
      email: (person) => displayLogin(person.email),
      language: (person) => person.language,
      status: (person) => (person.active === false ? 'archived' : 'active'),
      added: (person) => person.created_at,
    },
    lang,
  );
  const guardianSort = useSort(
    list(data, 'students'),
    {
      guardian: (student) => student.parent_name,
      contact: (student) => student.parent_email || student.parent_phone,
      student: (student) => name(student),
    },
    lang,
  );
  const roleNames: Record<string, string> = {
    administrator: tr(lang, 'Administrator', 'Yönetici'),
    academic_manager: tr(lang, 'Academic manager', 'Akademik yönetici'),
    teacher: tr(lang, 'Teacher', 'Öğretmen'),
    guidance: tr(lang, 'Guidance staff', 'Rehberlik'),
    parent: tr(lang, 'Parent', 'Veli'),
  };
  return (
    <>
      <PageHeader
        eyebrow={tr(lang, 'The people behind the progress', 'Gelişimin arkasındaki insanlar')}
        title={tr(lang, 'People', 'Kişiler')}
        description={tr(
          lang,
          'Bring teachers, families and your school team together.',
          'Öğretmenleri, aileleri ve okul ekibinizi buluşturun.',
        )}
      >
        {manage && (
          <Button variant="primary" onClick={() => setModal(true)}>
            <Mail size={17} />
            {tr(lang, 'Invite a person', 'Kişi davet et')}
          </Button>
        )}
      </PageHeader>
      <section className="card">
        <div className="toolbar">
          <SearchField
            placeholder={tr(lang, 'Search people…', 'Kişi ara…')}
            value={search}
            onChange={(event) => setSearch(event.target.value)}
            label={tr(lang, 'Search people', 'Kişi ara')}
          />
          {archivedCount > 0 && (
            <label className="checkbox-label">
              <input
                type="checkbox"
                checked={showArchived}
                onChange={(event) => setShowArchived(event.target.checked)}
              />
              {tr(lang, 'Show archived', 'Arşivlenenleri göster')} ({archivedCount})
            </label>
          )}
          <span className="muted">
            {people.length} {tr(lang, 'people', 'kişi')}
          </span>
        </div>
        {people.length ? (
          <div className="table-wrap">
            <table className="data-table">
              <thead>
                <tr>
                  {peopleSort.header('name', tr(lang, 'Name', 'Adı soyadı'))}
                  {peopleSort.header(
                    'email',
                    tr(lang, 'Email or username', 'E-posta veya kullanıcı adı'),
                  )}
                  <th scope="col">{tr(lang, 'Roles', 'Roller')}</th>
                  {peopleSort.header('language', tr(lang, 'Language', 'Dil'))}
                  {peopleSort.header('status', tr(lang, 'Status', 'Durum'))}
                  {peopleSort.header('added', tr(lang, 'Added', 'Eklenme tarihi'))}
                </tr>
              </thead>
              <tbody>
                {peopleSort.sorted.map((person, index) => (
                  <tr key={person.id}>
                    <td>
                      <div className="student-cell">
                        <span className={`avatar avatar-${index % 4}`}>
                          {initials(name(person))}
                        </span>
                        <strong>
                          {manage ? (
                            <button className="text-button" onClick={() => setEditProfile(person)}>
                              {name(person)}
                            </button>
                          ) : (
                            name(person)
                          )}
                        </strong>
                      </div>
                    </td>
                    <td>{displayLogin(person.email) || '—'}</td>
                    <td>
                      <div className="inline-actions">
                        {roles(person).map((item) => (
                          <span className="badge" key={item}>
                            {roleNames[item] || item}
                          </span>
                        ))}
                      </div>
                    </td>
                    <td>{person.language === 'tr' ? 'Türkçe' : 'English'}</td>
                    <td>
                      <StatusBadge
                        value={person.active === false ? 'archived' : 'active'}
                        lang={lang}
                      />
                    </td>
                    <td>{shortDay(person.created_at, lang)}</td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
        ) : (
          <EmptyState title={tr(lang, 'No people found', 'Kişi bulunamadı')} />
        )}
      </section>
      {list(data, 'students').length > 0 && (
        <section className="card">
          <div className="card-header">
            <h3>{tr(lang, 'Guardian contacts', 'Veli iletişim bilgileri')}</h3>
          </div>
          <div className="table-wrap">
            <table className="data-table">
              <thead>
                <tr>
                  {guardianSort.header('guardian', tr(lang, 'Guardian', 'Veli'))}
                  {guardianSort.header('contact', tr(lang, 'Contact', 'İletişim'))}
                  {guardianSort.header('student', tr(lang, 'Student', 'Öğrenci'))}
                </tr>
              </thead>
              <tbody>
                {guardianSort.sorted.map((student) => (
                  <tr key={student.id}>
                    <td>{student.parent_name}</td>
                    <td>
                      {student.parent_email}
                      <br />
                      <small>{student.parent_phone}</small>
                    </td>
                    <td>{name(student)}</td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
        </section>
      )}
      {editProfile && (
        <Modal
          title={tr(lang, 'Edit team member', 'Ekip üyesini düzenle')}
          onClose={() => setEditProfile(null)}
          lang={lang}
          bare
        >
          <form
            onSubmit={(event) => {
              event.preventDefault();
              const form = new FormData(event.currentTarget);
              const updatedRoles = form.getAll('roles').map(String);
              if (!updatedRoles.length) {
                props.notify(
                  tr(lang, 'Choose at least one role.', 'En az bir rol seçin.'),
                  'error',
                );
                return;
              }
              if (
                editProfile.id === user.id &&
                (!updatedRoles.includes('administrator') || form.get('active') === 'false')
              ) {
                props.notify(
                  tr(
                    lang,
                    'Your own administrator access must remain active.',
                    'Kendi yönetici erişiminiz aktif kalmalıdır.',
                  ),
                  'error',
                );
                return;
              }
              void action.run(
                () =>
                  api.save('profiles', {
                    id: editProfile.id,
                    full_name: String(form.get('full_name')),
                    phone: String(form.get('phone')) || null,
                    language: String(form.get('language')),
                    languages: form.getAll('languages').map(String),
                    roles: updatedRoles,
                    active: form.get('active') === 'true',
                  }),
                () => setEditProfile(null),
              );
            }}
          >
            <div className="modal-body stack">
              <FormError error={action.error} />
              <Field
                label={tr(lang, 'Full name', 'Adı soyadı')}
                name="full_name"
                defaultValue={editProfile.full_name}
                required
              />
              <Field
                label={tr(lang, 'Phone', 'Telefon')}
                name="phone"
                type="tel"
                defaultValue={editProfile.phone}
              />
              <SelectField
                label={tr(lang, 'Preferred language', 'Tercih edilen dil')}
                name="language"
                defaultValue={editProfile.language}
              >
                <option value="en">English</option>
                <option value="tr">Türkçe</option>
              </SelectField>
              <fieldset className="choice-group">
                <legend>{tr(lang, 'Teaching languages', 'Eğitim dilleri')}</legend>
                {['en', 'tr'].map((code) => (
                  <label className="checkbox-label" key={code}>
                    <input
                      type="checkbox"
                      name="languages"
                      value={code}
                      defaultChecked={editProfile.languages?.includes(code)}
                    />
                    {code === 'tr' ? 'Türkçe' : 'English'}
                  </label>
                ))}
              </fieldset>
              <fieldset className="choice-group">
                <legend>{tr(lang, 'Access roles', 'Erişim rolleri')}</legend>
                {Object.entries(roleNames).map(([value, title]) => (
                  <label className="checkbox-label" key={value}>
                    <input
                      type="checkbox"
                      name="roles"
                      value={value}
                      defaultChecked={roles(editProfile).includes(value)}
                    />
                    {title}
                  </label>
                ))}
              </fieldset>
              <SelectField
                label={tr(lang, 'Status', 'Durum')}
                name="active"
                defaultValue={editProfile.active === false ? 'false' : 'true'}
              >
                <option value="true">{tr(lang, 'Active', 'Aktif')}</option>
                <option value="false">{tr(lang, 'Archived', 'Arşivlenmiş')}</option>
              </SelectField>
              <AccountTools
                person={editProfile}
                props={props}
                onRemoved={() => setEditProfile(null)}
              />
            </div>
            <FormActions busy={action.busy} lang={lang} onCancel={() => setEditProfile(null)} />
          </form>
        </Modal>
      )}
      {modal && (
        <Modal
          title={tr(lang, 'Invite to School Portal', 'School Portal’e davet et')}
          onClose={() => setModal(false)}
          lang={lang}
          bare
        >
          <form
            onSubmit={(event) => {
              event.preventDefault();
              const form = new FormData(event.currentTarget);
              if (
                accountKind === 'username' &&
                form.get('password') !== form.get('password_confirm')
              ) {
                props.notify(
                  tr(lang, 'The passwords do not match.', 'Şifreler eşleşmiyor.'),
                  'error',
                );
                return;
              }
              void action.run(
                () =>
                  api.invite({
                    email: String(form.get('email') || ''),
                    ...(accountKind === 'username'
                      ? {
                          username: String(form.get('username')),
                          password: String(form.get('password')),
                        }
                      : {}),
                    full_name: String(form.get('full_name')),
                    language: String(form.get('language')) as Lang,
                    roles: form.getAll('roles').map(String),
                    student_ids: form.getAll('student_ids').map(String),
                  }),
                () => setModal(false),
              );
            }}
          >
            <div className="modal-body stack">
              <FormError error={action.error} />
              <Field label={tr(lang, 'Full name', 'Adı soyadı')} name="full_name" required />
              <div
                className="segmented"
                role="radiogroup"
                aria-label={tr(lang, 'Sign-in type', 'Giriş türü')}
              >
                {(
                  [
                    ['email', 'Email invitation', 'E-posta daveti'],
                    ['username', 'Username & password', 'Kullanıcı adı ve şifre'],
                  ] as const
                ).map(([id, en, turkish]) => (
                  <button
                    key={id}
                    type="button"
                    role="radio"
                    aria-checked={accountKind === id}
                    className={accountKind === id ? 'active' : ''}
                    onClick={() => setAccountKind(id)}
                  >
                    {tr(lang, en, turkish)}
                  </button>
                ))}
              </div>
              {accountKind === 'email' ? (
                <Field
                  key="email"
                  label={tr(lang, 'Email address', 'E-posta adresi')}
                  name="email"
                  type="email"
                  required
                />
              ) : (
                <>
                  <Field
                    key="username"
                    label={tr(lang, 'Username', 'Kullanıcı adı')}
                    name="username"
                    required
                    minLength={3}
                    maxLength={32}
                    pattern="[A-Za-z0-9._\-]{3,32}"
                    autoCapitalize="none"
                    spellCheck={false}
                    autoComplete="off"
                    hint={tr(
                      lang,
                      '3–32 letters, numbers, dots, dashes or underscores. They sign in with this name.',
                      '3–32 harf, rakam, nokta, tire veya alt çizgi. Bu adla giriş yapar.',
                    )}
                  />
                  <div className="form-grid">
                    <Field
                      label={tr(lang, 'Password', 'Şifre')}
                      name="password"
                      type="password"
                      required
                      minLength={10}
                      autoComplete="new-password"
                    />
                    <Field
                      label={tr(lang, 'Confirm password', 'Şifre tekrar')}
                      name="password_confirm"
                      type="password"
                      required
                      minLength={10}
                      autoComplete="new-password"
                    />
                  </div>
                </>
              )}
              <SelectField
                label={tr(lang, 'Preferred language', 'Tercih edilen dil')}
                name="language"
                defaultValue={lang}
              >
                <option value="en">English</option>
                <option value="tr">Türkçe</option>
              </SelectField>
              <fieldset className="choice-group">
                <legend>{tr(lang, 'Access roles', 'Erişim rolleri')}</legend>
                {Object.entries(roleNames).map(([value, title]) => (
                  <label className="checkbox-label" key={value}>
                    <input
                      type="checkbox"
                      name="roles"
                      value={value}
                      defaultChecked={value === 'teacher'}
                      onChange={(event) =>
                        value === 'parent' && setRole(event.target.checked ? 'parent' : 'teacher')
                      }
                    />
                    {title}
                  </label>
                ))}
              </fieldset>
              {role === 'parent' && (
                <fieldset className="choice-group">
                  <legend>{tr(lang, 'Link children', 'Çocukları ilişkilendir')}</legend>
                  {list(data, 'students').map((student) => (
                    <label className="checkbox-label" key={student.id}>
                      <input type="checkbox" name="student_ids" value={student.id} />
                      {name(student)}
                    </label>
                  ))}
                </fieldset>
              )}
              <p className="form-hint">
                {tr(
                  lang,
                  accountKind === 'email'
                    ? 'The invitation lets them set a password securely. Staff may hold multiple roles.'
                    : 'The account works immediately; no email is sent. Share the username and password in person. If it is forgotten, open the person and use "Set a new password".',
                  accountKind === 'email'
                    ? 'Davet, güvenli bir şekilde parola oluşturmalarını sağlar. Personel birden fazla role sahip olabilir.'
                    : 'Hesap hemen kullanılabilir; e-posta gönderilmez. Kullanıcı adı ve şifreyi kendisine iletin. Unutulursa kişiyi açıp "Yeni şifre belirle" ile değiştirin.',
                )}
              </p>
            </div>
            <FormActions
              busy={action.busy}
              lang={lang}
              onCancel={() => setModal(false)}
              submit={
                accountKind === 'email'
                  ? tr(lang, 'Send invitation', 'Davet gönder')
                  : tr(lang, 'Create account', 'Hesap oluştur')
              }
            />
          </form>
        </Modal>
      )}
    </>
  );
}

/**
 * Administrator account tools inside the team-member editor: set a password, send a reset
 * link (email accounts) and delete an account that has no school records yet.
 * Buttons are type="button" so they never submit the surrounding profile form.
 */
function AccountTools({
  person,
  props,
  onRemoved,
}: {
  person: Row;
  props: PageProps;
  onRemoved: () => void;
}) {
  const { api, lang, user } = props;
  const action = useAction(props);
  const [confirm, confirmDialog] = useConfirm(lang);
  const [password, setPassword] = useState('');
  const [repeat, setRepeat] = useState('');
  const [hasRecords, setHasRecords] = useState(false);
  const usernameAccount = isUsernameAccount(person.email);
  const self = person.id === user.id;
  const blockEnter = (event: { key: string; preventDefault: () => void }) => {
    if (event.key === 'Enter') event.preventDefault();
  };
  const setNewPassword = () => {
    if (password.length < 10 || password.length > 72) {
      props.notify(
        tr(lang, 'Use a password of 10–72 characters.', 'Şifre 10–72 karakter olmalıdır.'),
        'error',
      );
      return;
    }
    if (password !== repeat) {
      props.notify(tr(lang, 'The passwords do not match.', 'Şifreler eşleşmiyor.'), 'error');
      return;
    }
    void action.run(
      () => api.manageUser({ action: 'set_password', userId: person.id, password }),
      () => {
        setPassword('');
        setRepeat('');
        props.notify(
          tr(
            lang,
            'Password changed. Share it with the person in private.',
            'Şifre değiştirildi. Kişiye özel olarak iletin.',
          ),
          'success',
        );
      },
      true,
    );
  };
  const sendReset = () =>
    void action.run(
      () => api.manageUser({ action: 'send_reset', userId: person.id }),
      () =>
        props.notify(
          tr(
            lang,
            `A reset link was sent to ${person.email}.`,
            `${person.email} adresine sıfırlama bağlantısı gönderildi.`,
          ),
          'success',
        ),
      true,
    );
  const remove = async () => {
    const confirmed = await confirm({
      title: tr(lang, 'Delete this person?', 'Bu kişi silinsin mi?'),
      message: tr(
        lang,
        `${name(person)} and their login are removed permanently. This only works for accounts without school records; otherwise archive them.`,
        `${name(person)} ve giriş hesabı kalıcı olarak silinir. Yalnızca okul kaydı olmayan hesaplarda çalışır; aksi halde arşivleyin.`,
      ),
      confirmLabel: tr(lang, 'Delete permanently', 'Kalıcı olarak sil'),
      danger: true,
    });
    if (!confirmed) return;
    setHasRecords(false);
    void action.run(
      async () => {
        try {
          await api.manageUser({ action: 'delete', userId: person.id });
        } catch (cause) {
          if ((cause as { code?: string })?.code === 'has_records') setHasRecords(true);
          throw cause;
        }
      },
      () => {
        props.notify(tr(lang, 'The person was deleted.', 'Kişi silindi.'), 'success');
        onRemoved();
      },
      true,
    );
  };
  const archive = () =>
    void action.run(
      () => api.save('profiles', { id: person.id, active: false }),
      () => onRemoved(),
    );
  return (
    <>
      <Disclosure
        title={tr(lang, 'Account and password', 'Hesap ve şifre')}
        summary={
          usernameAccount
            ? tr(lang, 'Username account', 'Kullanıcı adı hesabı')
            : tr(lang, 'Email account', 'E-posta hesabı')
        }
      >
        <div className="stack">
          <p className="form-hint">
            {tr(
              lang,
              'Set a new password and share it with the person, for example when they forgot it.',
              'Yeni bir şifre belirleyip kişiye iletin; örneğin şifresini unuttuğunda.',
            )}
          </p>
          <Field
            label={tr(lang, 'New password', 'Yeni şifre')}
            type="password"
            autoComplete="new-password"
            value={password}
            onChange={(event) => setPassword(event.target.value)}
            onKeyDown={blockEnter}
          />
          <Field
            label={tr(lang, 'Repeat the new password', 'Yeni şifreyi tekrar yazın')}
            type="password"
            autoComplete="new-password"
            value={repeat}
            onChange={(event) => setRepeat(event.target.value)}
            onKeyDown={blockEnter}
          />
          <div className="inline-actions">
            <Button
              type="button"
              variant="secondary"
              disabled={action.busy || !password}
              onClick={setNewPassword}
            >
              {tr(lang, 'Set a new password', 'Yeni şifre belirle')}
            </Button>
            {!usernameAccount && (
              <Button type="button" variant="secondary" disabled={action.busy} onClick={sendReset}>
                {tr(lang, 'Email a reset link', 'Şifre sıfırlama bağlantısı gönder')}
              </Button>
            )}
          </div>
        </div>
      </Disclosure>
      {!self && (
        <Disclosure
          title={tr(lang, 'Delete person', 'Kişiyi sil')}
          summary={tr(
            lang,
            'For test or mistaken accounts without records',
            'Kaydı olmayan deneme veya hatalı hesaplar için',
          )}
        >
          <div className="stack">
            <p className="form-hint">
              {tr(
                lang,
                'People who already taught, recorded attendance or wrote reports cannot be deleted; archive them so their history stays.',
                'Ders vermiş, yoklama almış veya rapor yazmış kişiler silinemez; geçmişleri korunsun diye arşivlenir.',
              )}
            </p>
            {hasRecords && (
              <div className="account-warning" role="alert">
                <span>
                  {tr(
                    lang,
                    'This person has school records, so they were not deleted.',
                    'Bu kişinin okul kayıtları olduğu için silinmedi.',
                  )}
                </span>
                {person.active !== false && (
                  <Button
                    type="button"
                    variant="secondary"
                    disabled={action.busy}
                    onClick={archive}
                  >
                    {tr(lang, 'Archive instead', 'Bunun yerine arşivle')}
                  </Button>
                )}
              </div>
            )}
            <div className="inline-actions">
              <Button type="button" variant="danger" disabled={action.busy} onClick={remove}>
                {tr(lang, 'Delete person', 'Kişiyi sil')}
              </Button>
            </div>
          </div>
        </Disclosure>
      )}
      {confirmDialog}
    </>
  );
}

/**
 * Enrolls one or more students in a lesson. A search box narrows the list (name or student
 * number); ticked students are saved one by one so a single overlap error does not block the
 * others, and the dialog stays open listing any that failed.
 */
function EnrollStudents({
  props,
  lesson,
  enrollments,
  onClose,
}: {
  props: PageProps;
  lesson: Row;
  enrollments: Row[];
  onClose: () => void;
}) {
  const { data, lang, api } = props;
  const action = useAction(props);
  const [query, setQuery] = useState('');
  const [chosen, setChosen] = useState<string[]>([]);
  const [startedOn, setStartedOn] = useState(today());
  const [failed, setFailed] = useState<string[]>([]);
  const fold = (value: unknown) => String(value || '').toLocaleLowerCase('tr');
  const lessonName = (id: string) =>
    label(
      list(data, 'classes').find((c) => c.id === id),
      lang,
    );
  const eligible = list(data, 'students')
    .filter(
      (student) =>
        student.status !== 'archived' &&
        !enrollments.some((e) => e.student_id === student.id && !e.ended_on),
    )
    .sort((a, b) => name(a).localeCompare(name(b), 'tr'));
  const shown = eligible.filter((student) =>
    `${fold(name(student))} ${fold(student.student_number)}`.includes(fold(query).trim()),
  );
  const otherLessons = (studentId: string) =>
    list(data, 'enrollments')
      .filter((e) => e.student_id === studentId && !e.ended_on && e.class_id !== lesson.id)
      .map((e) => lessonName(e.class_id));
  const toggle = (id: string, on: boolean) =>
    setChosen((previous) => (on ? [...previous, id] : previous.filter((x) => x !== id)));
  const save = () =>
    void action.run(
      async () => {
        const problems: string[] = [];
        const saved: string[] = [];
        for (const studentId of chosen) {
          try {
            await api.save('enrollments', {
              student_id: studentId,
              class_id: lesson.id,
              started_on: startedOn,
            });
            saved.push(studentId);
          } catch (cause) {
            problems.push(`${studentName(data, studentId)}: ${errorText(cause, lang)}`);
          }
        }
        setChosen((previous) => previous.filter((id) => !saved.includes(id)));
        setFailed(problems);
        if (problems.length) {
          // Show the students that were saved before reporting the rest.
          if (saved.length) await props.refresh();
          throw new Error(
            tr(
              lang,
              `${saved.length} saved, ${problems.length} not saved.`,
              `${saved.length} öğrenci kaydedildi, ${problems.length} kaydedilemedi.`,
            ),
          );
        }
      },
      () => {
        props.notify(
          tr(lang, `${chosen.length} students enrolled.`, `${chosen.length} öğrenci kaydedildi.`),
          'success',
        );
        onClose();
      },
      true,
    );
  return (
    <Modal title={tr(lang, 'Enroll students', 'Öğrenci kaydet')} onClose={onClose} lang={lang} bare>
      <form
        onSubmit={(event) => {
          event.preventDefault();
          if (chosen.length) save();
        }}
      >
        <div className="modal-body stack">
          <FormError error={action.error} />
          {failed.length > 0 && (
            <ul className="account-warning enroll-failures">
              {failed.map((line) => (
                <li key={line}>{line}</li>
              ))}
            </ul>
          )}
          <SearchField
            placeholder={tr(lang, 'Search by name or number…', 'Ad veya numara ile ara…')}
            value={query}
            onChange={(event) => setQuery(event.target.value)}
            label={tr(lang, 'Search students', 'Öğrenci ara')}
            onKeyDown={(event) => {
              if (event.key === 'Enter') event.preventDefault();
            }}
            autoFocus
          />
          <div className="pick-toolbar">
            <span className="muted">
              {tr(
                lang,
                `${chosen.length} selected · ${shown.length} shown`,
                `${chosen.length} öğrenci seçildi · ${shown.length} gösteriliyor`,
              )}
            </span>
            <span className="inline-actions">
              <button
                type="button"
                className="text-button"
                disabled={!shown.length}
                onClick={() =>
                  setChosen((previous) => [
                    ...new Set([...previous, ...shown.map((student) => student.id)]),
                  ])
                }
              >
                {tr(lang, 'Select all shown', 'Görünenlerin tümünü seç')}
              </button>
              <button
                type="button"
                className="text-button"
                disabled={!chosen.length}
                onClick={() => setChosen([])}
              >
                {tr(lang, 'Clear', 'Seçimi temizle')}
              </button>
            </span>
          </div>
          <div className="pick-list" role="group" aria-label={tr(lang, 'Students', 'Öğrenciler')}>
            {shown.length ? (
              shown.map((student) => {
                const others = otherLessons(student.id);
                return (
                  <label className="pick-row" key={student.id}>
                    <input
                      type="checkbox"
                      checked={chosen.includes(student.id)}
                      onChange={(event) => toggle(student.id, event.target.checked)}
                    />
                    <span>
                      <strong>{name(student)}</strong>
                      <small className="muted">
                        {[student.student_number, others.length ? others.join(', ') : '']
                          .filter(Boolean)
                          .join(' · ')}
                      </small>
                    </span>
                  </label>
                );
              })
            ) : (
              <p className="muted pick-empty">
                {eligible.length
                  ? tr(lang, 'No student matches the search.', 'Aramaya uyan öğrenci yok.')
                  : tr(
                      lang,
                      'Every active student is already in this lesson.',
                      'Tüm aktif öğrenciler bu derse zaten kayıtlı.',
                    )}
              </p>
            )}
          </div>
          <Field
            label={tr(lang, 'Start date', 'Başlangıç tarihi')}
            type="date"
            value={startedOn}
            onChange={(event) => setStartedOn(event.target.value)}
            required
          />
          <p className="form-hint">
            {tr(
              lang,
              'Lessons already taken are shown under each name. To transfer a student, end their previous enrollment first; both stay in their history.',
              'Öğrencinin aldığı diğer dersler adının altında görünür. Nakil için önceki kaydı sonlandırın; iki kayıt da geçmişte kalır.',
            )}
          </p>
        </div>
        <FormActions
          busy={action.busy}
          lang={lang}
          onCancel={onClose}
          disabled={!chosen.length}
          submit={tr(
            lang,
            `Enroll selected (${chosen.length})`,
            `Seçilenleri kaydet (${chosen.length})`,
          )}
        />
      </form>
    </Modal>
  );
}

const WEEKDAYS: [string, string][] = [
  ['Sunday', 'Pazar'],
  ['Monday', 'Pazartesi'],
  ['Tuesday', 'Salı'],
  ['Wednesday', 'Çarşamba'],
  ['Thursday', 'Perşembe'],
  ['Friday', 'Cuma'],
  ['Saturday', 'Cumartesi'],
];
const WEEKDAY_ORDER = [1, 2, 3, 4, 5, 6, 0];
const sortedSlots = (slots: Row[]) =>
  [...slots].sort(
    (a, b) =>
      WEEKDAY_ORDER.indexOf(Number(a.weekday)) - WEEKDAY_ORDER.indexOf(Number(b.weekday)) ||
      String(a.start_time).localeCompare(String(b.start_time)),
  );
const addDays = (iso: string, days: number) => {
  const d = new Date(`${iso}T12:00:00Z`);
  d.setUTCDate(d.getUTCDate() + days);
  return d.toISOString().slice(0, 10);
};
const weeklyMinutesText = (minutes: number, lang: Lang) => {
  const h = Math.floor(minutes / 60);
  const m = minutes % 60;
  return tr(
    lang,
    `${[h ? `${h} h` : '', m ? `${m} min` : ''].filter(Boolean).join(' ')} per week`,
    `Haftada ${[h ? `${h} saat` : '', m ? `${m} dk` : ''].filter(Boolean).join(' ')}`,
  );
};

type SlotDraft = { key: number; weekday: string; start_time: string; duration_minutes: string };
type PlanPreview = {
  to_add: string[];
  to_remove: string[];
  kept_past: number;
  reason?: 'no_start' | 'no_end';
};

/** Changes the day, time or length of one lesson date, after a confirmation. */
function SessionEditModal({
  props,
  session,
  onClose,
}: {
  props: PageProps;
  session: Row;
  onClose: () => void;
}) {
  const { data, lang, api } = props;
  const action = useAction(props);
  const [confirm, confirmDialog] = useConfirm(lang);
  const timezone = schoolTimezone(data);
  const locale = lang === 'tr' ? 'tr-TR' : 'en-GB';
  const clock = (iso: string) =>
    new Intl.DateTimeFormat('en-GB', {
      timeZone: timezone,
      hourCycle: 'h23',
      hour: '2-digit',
      minute: '2-digit',
    }).format(new Date(iso));
  const [day, setDay] = useState(schoolDay(session.starts_at, timezone));
  const [time, setTime] = useState(clock(session.starts_at));
  const [duration, setDuration] = useState(String(session.duration_minutes || 30));
  const show = (iso: string) =>
    new Date(iso).toLocaleString(locale, {
      timeZone: timezone,
      weekday: 'long',
      day: 'numeric',
      month: 'long',
      hour: '2-digit',
      minute: '2-digit',
    });
  const weekday = day
    ? new Date(`${day}T12:00:00Z`).toLocaleDateString(locale, { weekday: 'long', timeZone: 'UTC' })
    : '';
  return (
    <Modal
      title={tr(lang, 'Change lesson date', 'Ders tarihini değiştir')}
      onClose={onClose}
      lang={lang}
      bare
    >
      <form
        onSubmit={async (event) => {
          event.preventDefault();
          if (!day || !time) return;
          const next = zonedDate(day, time, timezone).toISOString();
          if (
            new Date(next).getTime() === new Date(session.starts_at).getTime() &&
            Number(duration) === Number(session.duration_minutes || 30)
          )
            return onClose();
          const ok = await confirm({
            title: tr(lang, 'Change this lesson date?', 'Ders tarihi değişsin mi?'),
            message: `${show(session.starts_at)} → ${show(next)} · ${duration} ${tr(lang, 'min', 'dk')}`,
            confirmLabel: tr(lang, 'Confirm', 'Onayla'),
          });
          if (!ok) return;
          void action.run(
            () =>
              api.save('sessions', {
                id: session.id,
                starts_at: next,
                duration_minutes: Number(duration),
              }),
            onClose,
          );
        }}
      >
        <div className="modal-body stack">
          <FormError error={action.error} />
          <p className="muted">
            {tr(lang, 'Now: ', 'Şu an: ')}
            <strong>{show(session.starts_at)}</strong>
          </p>
          <div className="form-grid">
            <Field
              label={tr(lang, 'New date', 'Yeni tarih')}
              type="date"
              value={day}
              onChange={(event) => setDay(event.target.value)}
              hint={weekday}
              required
            />
            <Field
              label={tr(lang, 'Time (school time)', 'Saat (okul saati)')}
              type="time"
              value={time}
              onChange={(event) => setTime(event.target.value)}
              required
            />
            <Field
              label={tr(lang, 'Duration (minutes)', 'Süre (dakika)')}
              type="number"
              min={5}
              max={180}
              value={duration}
              onChange={(event) => setDuration(event.target.value)}
              required
            />
          </div>
          <p className="form-hint">
            {tr(
              lang,
              'Only this date changes; the weekly plan stays the same. Dates with attendance cannot be moved.',
              'Yalnız bu tarih değişir; haftalık plan aynı kalır. Yoklaması alınmış tarih taşınamaz.',
            )}
          </p>
        </div>
        <FormActions
          busy={action.busy}
          lang={lang}
          onCancel={onClose}
          submit={tr(lang, 'Continue', 'Devam')}
        />
      </form>
      {confirmDialog}
    </Modal>
  );
}

function LessonPlanModal({
  props,
  lesson,
  onClose,
  onOneOff,
}: {
  props: PageProps;
  lesson: Row;
  onClose: () => void;
  onOneOff?: () => void;
}) {
  const { data, lang, api } = props;
  const action = useAction(props);
  const timezone = schoolTimezone(data);
  // A lesson without a plan starts from today, with its usual weekday and time as the
  // first weekly slot when it has none yet.
  const fresh = !list(data, 'class_slots').some((slot) => slot.class_id === lesson.id);
  const [startsOn, setStartsOn] = useState<string>(
    lesson.plan_starts_on || schoolDay(new Date(), timezone),
  );
  const [endsOn, setEndsOn] = useState<string>(lesson.plan_ends_on || '');
  const [skip, setSkip] = useState<number[]>(lesson.plan_skip_weeks || []);
  const [slots, setSlots] = useState<SlotDraft[]>(() =>
    fresh
      ? [
          {
            key: 0,
            weekday: String(lesson.weekday ?? 6),
            start_time: String(lesson.start_time || '10:00').slice(0, 5),
            duration_minutes: '30',
          },
        ]
      : sortedSlots(list(data, 'class_slots').filter((slot) => slot.class_id === lesson.id)).map(
          (slot, index) => ({
            key: index,
            weekday: String(slot.weekday),
            start_time: String(slot.start_time).slice(0, 5),
            duration_minutes: String(slot.duration_minutes),
          }),
        ),
  );
  const [nextKey, setNextKey] = useState(1000);
  const [preview, setPreview] = useState<PlanPreview | null>(null);
  const weekCount =
    startsOn && endsOn ? planWeekCount({ plan_starts_on: startsOn, plan_ends_on: endsOn }) : null;
  const locale = lang === 'tr' ? 'tr-TR' : 'en-GB';
  const updateSlot = (key: number, patch: Partial<SlotDraft>) =>
    setSlots((rows) => rows.map((row) => (row.key === key ? { ...row, ...patch } : row)));
  const formatDate = (iso: string) =>
    new Date(iso).toLocaleString(locale, {
      timeZone: timezone,
      weekday: 'short',
      day: 'numeric',
      month: 'short',
      hour: '2-digit',
      minute: '2-digit',
    });

  if (preview) {
    const empty = !preview.to_add.length && !preview.to_remove.length;
    return (
      <Modal title={tr(lang, 'Lesson plan', 'Ders planı')} onClose={onClose} lang={lang} bare>
        <div className="modal-body stack">
          <FormError error={action.error} />
          {preview.reason === 'no_start' ? (
            <p>
              {tr(
                lang,
                'Enter a start date and at least one weekly time for the schedule.',
                'Takvim için başlangıç tarihi ve en az bir haftalık saat girin.',
              )}
            </p>
          ) : (
            <>
              <ul className="plan-summary">
                <li>
                  <strong>{preview.to_add.length}</strong>{' '}
                  {tr(lang, 'new lesson dates will be added', 'yeni ders tarihi eklenecek')}
                </li>
                <li>
                  <strong>{preview.to_remove.length}</strong>{' '}
                  {tr(lang, 'future dates will be removed', 'gelecek tarih kaldırılacak')}
                </li>
                <li>
                  {tr(lang, 'Past dates kept: ', 'Geçmiş ')}
                  <strong>{preview.kept_past}</strong>
                  {tr(lang, '', ' tarih korunur')}
                </li>
              </ul>
              {preview.to_add.length > 0 && (
                <div className="plan-dates">
                  {preview.to_add.slice(0, 10).map((iso) => (
                    <span className="plan-chip" key={iso}>
                      {formatDate(iso)}
                    </span>
                  ))}
                  {preview.to_add.length > 10 && (
                    <span className="muted">+{preview.to_add.length - 10}</span>
                  )}
                </div>
              )}
              {empty && (
                <p className="muted">
                  {tr(lang, 'The schedule is already up to date.', 'Takvim zaten güncel.')}
                </p>
              )}
            </>
          )}
        </div>
        <div className="modal-actions">
          <Button variant="secondary" onClick={onClose} disabled={action.busy}>
            {tr(lang, 'Not now', 'Şimdilik uygulama')}
          </Button>
          {preview.reason !== 'no_start' && !empty && (
            <Button
              variant="primary"
              disabled={action.busy}
              onClick={() =>
                void action.run(
                  () => api.rpc('plan_class_sessions', { p_class_id: lesson.id, p_apply: true }),
                  () => {
                    props.notify(
                      tr(lang, 'Lesson schedule updated', 'Ders takvimi güncellendi'),
                      'success',
                    );
                    onClose();
                  },
                  true,
                )
              }
            >
              {tr(lang, 'Apply to schedule', 'Takvime uygula')}
            </Button>
          )}
        </div>
      </Modal>
    );
  }

  return (
    <Modal title={tr(lang, 'Lesson plan', 'Ders planı')} onClose={onClose} lang={lang} bare>
      <form
        onSubmit={(event) => {
          event.preventDefault();
          void action.run(
            async () => {
              await api.rpc('save_class_plan', {
                p_class_id: lesson.id,
                p_starts_on: startsOn || null,
                p_ends_on: endsOn || null,
                p_skip_weeks: weekCount ? skip.filter((week) => week <= weekCount) : [],
                p_slots: slots.map((slot) => ({
                  weekday: Number(slot.weekday),
                  start_time: slot.start_time,
                  duration_minutes: Number(slot.duration_minutes),
                })),
              });
              setPreview(
                await api.rpc('plan_class_sessions', { p_class_id: lesson.id, p_apply: false }),
              );
            },
            undefined,
            true,
          );
        }}
      >
        <div className="modal-body stack">
          <FormError error={action.error} />
          <div className="form-grid">
            <Field
              label={tr(lang, 'Start date', 'Başlangıç tarihi')}
              type="date"
              value={startsOn}
              onChange={(event) => setStartsOn(event.target.value)}
            />
            <Field
              label={tr(lang, 'End date', 'Bitiş tarihi')}
              type="date"
              value={endsOn}
              min={startsOn || undefined}
              onChange={(event) => setEndsOn(event.target.value)}
              hint={tr(
                lang,
                'If left empty, the end is the end of the academic year',
                'Boş bırakılırsa bitiş, eğitim yılının sonu olur',
              )}
            />
          </div>
          <div className="plan-slots">
            <strong>{tr(lang, 'Weekly times', 'Haftalık saatler')}</strong>
            {slots.map((slot) => (
              <div className="plan-slot-row" key={slot.key}>
                <SelectField
                  label={tr(lang, 'Day', 'Gün')}
                  value={slot.weekday}
                  onChange={(event) => updateSlot(slot.key, { weekday: event.target.value })}
                >
                  {WEEKDAYS.map(([en, turkish], index) => (
                    <option value={index} key={index}>
                      {tr(lang, en, turkish)}
                    </option>
                  ))}
                </SelectField>
                <Field
                  label={tr(lang, 'Time', 'Saat')}
                  type="time"
                  required
                  value={slot.start_time}
                  onChange={(event) => updateSlot(slot.key, { start_time: event.target.value })}
                />
                <Field
                  label={tr(lang, 'Duration (min)', 'Süre (dk)')}
                  type="number"
                  min={5}
                  max={180}
                  required
                  value={slot.duration_minutes}
                  onChange={(event) =>
                    updateSlot(slot.key, { duration_minutes: event.target.value })
                  }
                />
                <Button
                  variant="ghost"
                  aria-label={tr(lang, 'Remove time', 'Saati kaldır')}
                  onClick={() => setSlots((rows) => rows.filter((row) => row.key !== slot.key))}
                >
                  ×
                </Button>
              </div>
            ))}
            <div>
              <Button
                variant="secondary"
                onClick={() => {
                  setSlots((rows) => [
                    ...rows,
                    {
                      key: nextKey,
                      weekday: rows.length ? rows[rows.length - 1].weekday : '6',
                      start_time: '10:00',
                      duration_minutes: '40',
                    },
                  ]);
                  setNextKey(nextKey + 1);
                }}
              >
                {tr(lang, '+ Add time', '+ Saat ekle')}
              </Button>
            </div>
          </div>
          {weekCount && weekCount > 0 && (
            <fieldset className="plan-weeks">
              <legend>
                {tr(lang, 'Weeks to skip (holidays etc.)', 'Atlanacak haftalar (tatil vb.)')}
              </legend>
              <div className="plan-week-grid">
                {Array.from({ length: Math.min(weekCount, 80) }, (_, index) => index + 1).map(
                  (week) => (
                    <label className="plan-week" key={week}>
                      <input
                        type="checkbox"
                        checked={skip.includes(week)}
                        onChange={(event) =>
                          setSkip((weeks) =>
                            event.target.checked
                              ? [...weeks, week].sort((a, b) => a - b)
                              : weeks.filter((item) => item !== week),
                          )
                        }
                      />
                      {tr(lang, `Week ${week}`, `${week}. hafta`)} (
                      {new Date(`${addDays(startsOn, (week - 1) * 7)}T12:00:00`).toLocaleDateString(
                        locale,
                        { day: 'numeric', month: 'short' },
                      )}
                      )
                    </label>
                  ),
                )}
              </div>
            </fieldset>
          )}
        </div>
        {onOneOff && (
          <p className="form-hint plan-oneoff">
            {tr(lang, 'Only one extra date?', 'Yalnız tek bir ek tarih mi?')}{' '}
            <button type="button" className="text-button" onClick={onOneOff}>
              {tr(lang, 'Add a one-off lesson', 'Tek seferlik ders ekle')}
            </button>
          </p>
        )}
        <FormActions
          busy={action.busy}
          lang={lang}
          onCancel={onClose}
          submit={tr(lang, 'Save and preview', 'Kaydet ve önizle')}
        />
      </form>
    </Modal>
  );
}

export function ClassesPage(props: PageProps) {
  const { data, lang, api, user } = props;
  const action = useAction(props);
  const [confirm, confirmDialog] = useConfirm(lang);
  const [selectedId, setSelectedId] = useState<string | null>(null);
  const [search, setSearch] = useState('');
  const [levelFilter, setLevelFilter] = useState('');
  const [editSession, setEditSession] = useState<Row | null>(null);
  const [modal, setModal] = useState<'class' | 'edit' | 'session' | 'enroll' | 'plan' | null>(null);
  const [showArchived, setShowArchived] = useState(false);
  const [lessonSubject, setLessonSubject] = useState('');
  const manage = can(user, 'admin', 'administrator', 'academic_manager');
  const teach = manage || can(user, 'teacher');
  const classes = list(data, 'classes').filter(
    (c) =>
      !props.context?.studentId ||
      list(data, 'enrollments').some(
        (e) => e.class_id === c.id && e.student_id === props.context?.studentId,
      ),
  );
  const archivedLessonCount = classes.filter((group) => group.active === false).length;
  const levelOptions = levelsInUse(
    showArchived ? classes : classes.filter((group) => group.active !== false),
    data,
  );
  const levelLabel = (lesson: Row) =>
    label(
      list(data, 'levels').find((level) => level.id === classLevelId(lesson, data)),
      lang,
    );
  const selected = classes.find((group) => group.id === selectedId);
  // Editing keeps the lesson's current level selectable (even an old or inactive one) while its
  // subject is unchanged, so saving an unrelated change never clears the level silently.
  const keptLevel =
    modal === 'edit' && selected?.level_id && lessonSubject === String(selected.subject_id || '')
      ? list(data, 'levels').find((level) => level.id === selected.level_id)
      : undefined;
  const allowedLessonLevels = [
    ...levelsForSubject(lessonSubject, data),
    ...(keptLevel && !levelsForSubject(lessonSubject, data).some((l) => l.id === keptLevel.id)
      ? [keptLevel]
      : []),
  ];
  useEffect(() => {
    if (modal === 'class') setLessonSubject('');
    else if (modal === 'edit') setLessonSubject(String(selected?.subject_id || ''));
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [modal]);
  const close = () => {
    setModal(null);
    action.clear();
  };
  const enrollments = list(data, 'enrollments').filter(
    (enrollment) =>
      enrollment.class_id === selectedId && activeStudentEnrollment(enrollment as RecordRow, data),
  );
  const current = enrollments.filter((enrollment) => !enrollment.ended_on);
  const ended = enrollments
    .filter((enrollment) => enrollment.ended_on)
    .sort((a, b) => String(b.ended_on).localeCompare(String(a.ended_on)));
  const sessions = list(data, 'sessions')
    .filter((session) => session.class_id === selectedId)
    .sort((a, b) => String(b.starts_at).localeCompare(String(a.starts_at)));
  const groupRowsBase = list(data, 'class_groups')
    .filter((g) => g.active !== false)
    .filter(
      (g) =>
        !levelFilter ||
        g.level_id === levelFilter ||
        classes.some((c) => c.group_id === g.id && classLevelId(c, data) === levelFilter),
    )
    .sort((a, b) => String(a.name).localeCompare(String(b.name), lang));
  const groupSort = useSort(groupRowsBase, { name: (g) => g.name }, lang);
  return (
    <>
      {selected ? (
        <>
          <button className="back-link" onClick={() => setSelectedId(null)}>
            <ArrowLeft size={16} />
            {tr(lang, 'All classes', 'Tüm sınıflar')}
          </button>
          <PageHeader
            eyebrow={label(
              list(data, 'subjects').find((subject) => subject.id === selected.subject_id),
              lang,
            )}
            title={label(selected, lang)}
            description={[
              classLevelId(selected, data) ? levelLabel(selected) : '',
              selected.language === 'tr' ? 'Türkçe' : 'English',
              name(list(data, 'profiles').find((person) => person.id === selected.teacher_id)),
            ]
              .filter(Boolean)
              .join(' · ')}
          >
            {selected.zoom_url && (
              <a
                className="btn btn-secondary"
                href={selected.zoom_url}
                target="_blank"
                rel="noreferrer"
              >
                <ExternalLink size={16} />
                {tr(lang, 'Join Zoom', 'Zoom’a katıl')}
              </a>
            )}
            {manage && (
              <Button onClick={() => setModal('edit')} variant="secondary">
                {tr(lang, 'Edit class', 'Sınıfı düzenle')}
              </Button>
            )}
            {teach && (
              <Button variant="primary" onClick={() => setModal('plan')}>
                <Plus size={16} />
                {tr(lang, 'Schedule lessons', 'Ders planla')}
              </Button>
            )}
          </PageHeader>
          <div className="detail-grid">
            <section className="card">
              <div className="card-header">
                <h3>
                  {tr(lang, 'Class register', 'Sınıf listesi')}
                  {current.length > 0 && <span className="muted"> · {current.length}</span>}
                </h3>
                {manage && (
                  <Button onClick={() => setModal('enroll')} variant="secondary">
                    <Plus size={15} />
                    {tr(lang, 'Add students', 'Öğrenci ekle')}
                  </Button>
                )}
              </div>
              {current.length ? (
                current.map((enrollment) => (
                  <div className="list-row" key={enrollment.id}>
                    <div>
                      <strong>{studentName(data, enrollment.student_id)}</strong>
                      <p className="muted">{date(enrollment.started_on, lang)}</p>
                    </div>
                    {manage ? (
                      <Button
                        disabled={action.busy}
                        onClick={async () => {
                          const confirmed = await confirm({
                            title: tr(lang, 'End this enrollment?', 'Kayıt sonlandırılsın mı?'),
                            message: tr(
                              lang,
                              'The enrollment ends today. Its history will be preserved.',
                              'Kayıt bugün sonlandırılır. Geçmişi korunacaktır.',
                            ),
                            confirmLabel: tr(lang, 'End enrollment', 'Kaydı sonlandır'),
                            danger: true,
                          });
                          if (confirmed)
                            void action.run(() =>
                              api.save('enrollments', { id: enrollment.id, ended_on: today() }),
                            );
                        }}
                        variant="secondary"
                      >
                        {tr(lang, 'End enrollment', 'Kaydı sonlandır')}
                      </Button>
                    ) : (
                      <StatusBadge value="active" lang={lang} />
                    )}
                  </div>
                ))
              ) : (
                <EmptyState
                  title={tr(lang, 'Your class is ready', 'Sınıfınız hazır')}
                  description={tr(
                    lang,
                    'Enroll students to start their learning journey.',
                    'Eğitim yolculuğunu başlatmak için öğrenci kaydedin.',
                  )}
                />
              )}
              {ended.length > 0 && (
                <div className="ended-enrollments">
                  <Disclosure
                    title={`${tr(lang, 'Ended enrollments', 'Kaydı sonlanan öğrenciler')} (${ended.length})`}
                    summary={tr(
                      lang,
                      'Kept for history; also visible in each student’s profile.',
                      'Geçmiş için saklanır; öğrencinin profilinde de görünür.',
                    )}
                  >
                    {ended.map((enrollment) => (
                      <div className="list-row" key={enrollment.id}>
                        <div>
                          <strong>{studentName(data, enrollment.student_id)}</strong>
                          <p className="muted">
                            {date(enrollment.started_on, lang)} — {date(enrollment.ended_on, lang)}
                          </p>
                        </div>
                        <StatusBadge value="archived" lang={lang} />
                      </div>
                    ))}
                  </Disclosure>
                </div>
              )}
            </section>
            {(() => {
              const slots = sortedSlots(
                list(data, 'class_slots').filter((slot) => slot.class_id === selected.id),
              );
              const weeks = planWeekCount(selected);
              const skipped: number[] = selected.plan_skip_weeks || [];
              const totalMinutes = slots.reduce(
                (sum, slot) => sum + Number(slot.duration_minutes || 0),
                0,
              );
              return (
                <section className="card lesson-plan-card">
                  <div className="card-header">
                    <h3>{tr(lang, 'Lesson plan', 'Ders planı')}</h3>
                    {(manage || selected.teacher_id === user.id) && (
                      <Button onClick={() => setModal('plan')} variant="secondary">
                        {tr(lang, 'Edit plan', 'Planı düzenle')}
                      </Button>
                    )}
                  </div>
                  <div className="plan-card-body">
                    <p>
                      {selected.plan_starts_on ? (
                        <strong>
                          {date(selected.plan_starts_on, lang)} –{' '}
                          {selected.plan_ends_on ? date(selected.plan_ends_on, lang) : '…'}
                        </strong>
                      ) : (
                        <span className="muted">
                          {tr(lang, 'No start date set', 'Başlangıç tarihi girilmedi')}
                        </span>
                      )}
                      {weeks ? (
                        <span className="muted">
                          {' '}
                          · {weeks} {tr(lang, 'weeks', 'hafta')}
                        </span>
                      ) : null}
                    </p>
                    {slots.length > 0 && (
                      <>
                        <div className="plan-dates">
                          {slots.map((slot) => (
                            <span
                              className="plan-chip"
                              key={slot.id || `${slot.weekday}${slot.start_time}`}
                            >
                              {tr(
                                lang,
                                WEEKDAYS[Number(slot.weekday)][0],
                                WEEKDAYS[Number(slot.weekday)][1],
                              )}{' '}
                              {String(slot.start_time).slice(0, 5)} · {slot.duration_minutes}{' '}
                              {tr(lang, 'min', 'dk')}
                            </span>
                          ))}
                        </div>
                        <p className="muted">{weeklyMinutesText(totalMinutes, lang)}</p>
                      </>
                    )}
                    {skipped.length > 0 && (
                      <p className="muted">
                        {tr(lang, 'Skipped weeks: ', 'Atlanan haftalar: ')}
                        {skipped.join(', ')}
                      </p>
                    )}
                  </div>
                </section>
              );
            })()}
            <section className="card">
              <div className="card-header">
                <h3>{tr(lang, 'Lesson schedule', 'Ders takvimi')}</h3>
              </div>
              {sessions.length ? (
                sessions.map((session) => (
                  <div className="list-row" key={session.id}>
                    <div>
                      <strong>
                        {date(
                          session.starts_at
                            ? schoolDay(session.starts_at, schoolTimezone(data))
                            : session.session_date,
                          lang,
                        )}
                        {selected.plan_starts_on &&
                          (() => {
                            const week = planWeek(
                              selected,
                              session.starts_at
                                ? schoolDay(session.starts_at, schoolTimezone(data))
                                : String(session.session_date || ''),
                            );
                            return week ? (
                              <span className="muted">
                                {' '}
                                · {tr(lang, `Week ${week}`, `${week}. hafta`)}
                              </span>
                            ) : null;
                          })()}
                      </strong>
                      <p className="muted">
                        {session.starts_at
                          ? new Date(session.starts_at).toLocaleTimeString(
                              lang === 'tr' ? 'tr-TR' : 'en-GB',
                              {
                                hour: '2-digit',
                                minute: '2-digit',
                                timeZone: schoolTimezone(data),
                              },
                            )
                          : session.start_time}{' '}
                        · {session.duration_minutes || 30} {tr(lang, 'minutes', 'dakika')}
                      </p>
                    </div>
                    {teach &&
                      session.starts_at &&
                      session.status !== 'cancelled' &&
                      !list(data, 'attendance').some((a) => a.session_id === session.id) && (
                        <Button variant="ghost" onClick={() => setEditSession(session)}>
                          {tr(lang, 'Edit', 'Düzenle')}
                        </Button>
                      )}
                    {(session.zoom_url || selected.zoom_url) && (
                      <a
                        className="btn btn-ghost"
                        href={session.zoom_url || selected.zoom_url}
                        target="_blank"
                        rel="noreferrer"
                      >
                        <ExternalLink size={15} />
                        Zoom
                      </a>
                    )}
                  </div>
                ))
              ) : (
                <EmptyState
                  title={tr(lang, 'No lessons scheduled', 'Henüz ders planlanmadı')}
                  description={tr(
                    lang,
                    'Short, interactive 30-minute sessions make room for discovery.',
                    'Kısa, etkileşimli 30 dakikalık dersler keşfe alan açar.',
                  )}
                />
              )}
            </section>
          </div>
        </>
      ) : (
        <>
          <PageHeader
            eyebrow={tr(lang, 'Learning, together', 'Birlikte öğreniyoruz')}
            title={tr(lang, 'Classes & lessons', 'Sınıflar ve dersler')}
            description={tr(
              lang,
              'A small group, a shared adventure, a world of discovery.',
              'Küçük bir grup, ortak bir macera, keşfedilecek bir dünya.',
            )}
          ></PageHeader>
          {manage &&
            (() => {
              // Teacher assignment: one row per class, one column per subject taught.
              const groupRows = groupSort.sorted;
              const lessonOf = (groupId: string, subjectId: string) =>
                classes.find(
                  (c) => c.group_id === groupId && c.subject_id === subjectId && c.active !== false,
                );
              const columns = list(data, 'subjects')
                .filter((s) => groupRows.some((g) => lessonOf(g.id, s.id)))
                .sort((a, b) => String(a.code).localeCompare(String(b.code)));
              const teachers = list(data, 'profiles').filter(
                (person) => roles(person).includes('teacher') && person.active !== false,
              );
              const unassigned = groupRows.reduce(
                (sum, g) =>
                  sum +
                  columns.filter((s) => lessonOf(g.id, s.id) && !lessonOf(g.id, s.id)?.teacher_id)
                    .length,
                0,
              );
              return (
                <section className="card">
                  <div className="card-header">
                    <div>
                      <h3>{tr(lang, 'Teacher assignments', 'Öğretmen atamaları')}</h3>
                      <p className="muted">
                        {tr(
                          lang,
                          'Choose a teacher for each subject of each class. Classes and their subjects are managed in School settings → Classes.',
                          'Her sınıfın her dersi için öğretmen seçin. Sınıflar ve dersleri Okul ayarları → Sınıflar bölümünden yönetilir.',
                        )}
                      </p>
                    </div>
                    {unassigned > 0 && (
                      <span className="badge badge-orange">
                        {unassigned} {tr(lang, 'without a teacher', 'öğretmensiz')}
                      </span>
                    )}
                  </div>
                  {groupRows.length && columns.length ? (
                    <div className="table-wrap">
                      <table className="data-table assign-table">
                        <thead>
                          <tr>
                            {groupSort.header('name', tr(lang, 'Class', 'Sınıf'))}
                            {columns.map((s) => (
                              <th scope="col" key={s.id}>
                                {label(s, lang)}
                              </th>
                            ))}
                          </tr>
                        </thead>
                        <tbody>
                          {groupRows.map((g) => (
                            <tr key={g.id}>
                              <th scope="row">
                                {g.name}
                                <small>
                                  {[
                                    label(
                                      list(data, 'levels').find((l) => l.id === g.level_id),
                                      lang,
                                    ),
                                    g.language === 'en' ? 'EN' : 'TR',
                                  ]
                                    .filter((part) => part && part !== '—')
                                    .join(' · ')}
                                </small>
                              </th>
                              {columns.map((s) => {
                                const lesson = lessonOf(g.id, s.id);
                                return (
                                  <td key={s.id}>
                                    {lesson ? (
                                      <select
                                        className={lesson.teacher_id ? '' : 'unassigned'}
                                        value={lesson.teacher_id || ''}
                                        disabled={action.busy}
                                        aria-label={`${g.name} · ${label(s, lang)}`}
                                        onChange={(event) =>
                                          void action.run(() =>
                                            api.save('classes', {
                                              id: lesson.id,
                                              teacher_id: event.target.value || null,
                                            }),
                                          )
                                        }
                                      >
                                        <option value="">
                                          {tr(lang, 'Not assigned', 'Atanmadı')}
                                        </option>
                                        {teachers.map((person) => (
                                          <option key={person.id} value={person.id}>
                                            {name(person)}
                                          </option>
                                        ))}
                                      </select>
                                    ) : (
                                      <span className="muted">—</span>
                                    )}
                                  </td>
                                );
                              })}
                            </tr>
                          ))}
                        </tbody>
                      </table>
                    </div>
                  ) : (
                    <EmptyState
                      title={tr(lang, 'No classes yet', 'Henüz sınıf yok')}
                      description={tr(
                        lang,
                        'Create classes and pick their subjects in School settings → Classes.',
                        'Sınıfları ve derslerini Okul ayarları → Sınıflar bölümünden oluşturun.',
                      )}
                    />
                  )}
                </section>
              );
            })()}
          <div className="toolbar">
            <SearchField
              placeholder={tr(lang, 'Find a class…', 'Sınıf ara…')}
              value={search}
              onChange={(event) => setSearch(event.target.value)}
              label={tr(lang, 'Find a class', 'Sınıf ara')}
            />
            {levelOptions.length > 0 && (
              <select
                value={levelFilter}
                onChange={(event) => setLevelFilter(event.target.value)}
                aria-label={tr(lang, 'Level', 'Seviye')}
              >
                <option value="">{tr(lang, 'All levels', 'Tüm seviyeler')}</option>
                {levelOptions.map((level) => (
                  <option key={level.id} value={level.id}>
                    {label(level, lang)}
                  </option>
                ))}
              </select>
            )}
            {archivedLessonCount > 0 && (
              <label className="checkbox-label">
                <input
                  type="checkbox"
                  checked={showArchived}
                  onChange={(event) => setShowArchived(event.target.checked)}
                />
                {tr(lang, 'Show archived', 'Arşivlenenleri göster')} ({archivedLessonCount})
              </label>
            )}
          </div>
          {(() => {
            const visible = classes.filter(
              (group) =>
                (showArchived || group.active !== false) &&
                (!levelFilter || classLevelId(group, data) === levelFilter) &&
                `${label(group, lang)} ${label(
                  list(data, 'subjects').find((subject) => subject.id === group.subject_id),
                  lang,
                )} ${list(data, 'class_groups').find((item) => item.id === group.group_id)?.name || ''}`
                  .toLowerCase()
                  .includes(search.toLowerCase()),
            );
            const card = (group: Row, index: number) => (
              <button
                className="card class-card"
                key={group.id}
                onClick={() => setSelectedId(group.id)}
              >
                <div className="section-heading">
                  <span className={`class-icon class-icon-${index % 3}`}>
                    <GraduationCap size={24} />
                  </span>
                  <span className="inline-actions">
                    {classLevelId(group, data) && (
                      <span className="level-tag">{levelLabel(group)}</span>
                    )}
                    <span className="language-tag">{group.language === 'tr' ? 'TR' : 'EN'}</span>
                  </span>
                </div>
                {group.active === false && <StatusBadge value="archived" lang={lang} />}
                <p className="eyebrow">
                  {label(
                    list(data, 'subjects').find((subject) => subject.id === group.subject_id),
                    lang,
                  )}
                </p>
                <h3>{label(group, lang)}</h3>
                <p className="muted">
                  {group.teacher_id
                    ? name(list(data, 'profiles').find((person) => person.id === group.teacher_id))
                    : tr(lang, 'No teacher yet', 'Öğretmen atanmadı')}
                </p>
                <div className="class-footer">
                  <span>
                    <Users size={15} />{' '}
                    {
                      list(data, 'enrollments').filter(
                        (enrollment) =>
                          enrollment.class_id === group.id &&
                          !enrollment.ended_on &&
                          activeStudentEnrollment(enrollment as RecordRow, data),
                      ).length
                    }{' '}
                    {tr(lang, 'students', 'öğrenci')}
                  </span>
                  <ArrowRight size={17} />
                </div>
              </button>
            );
            // Lessons are shown under their class group; lessons without a group come last.
            const sections = [
              ...list(data, 'class_groups')
                .filter((item) => visible.some((group) => group.group_id === item.id))
                .sort((x, y) => String(x.name).localeCompare(String(y.name), lang))
                .map((item) => ({
                  id: item.id as string,
                  title: item.name as string,
                  level: label(
                    list(data, 'levels').find((level) => level.id === item.level_id),
                    lang,
                  ),
                  lessons: visible.filter((group) => group.group_id === item.id),
                })),
              {
                id: 'none',
                title: tr(lang, 'Lessons without a class', 'Sınıfa bağlı olmayan dersler'),
                level: '—',
                lessons: visible.filter(
                  (group) =>
                    !group.group_id ||
                    !list(data, 'class_groups').some((item) => item.id === group.group_id),
                ),
              },
            ].filter((section) => section.lessons.length);
            return sections.map((section) => (
              <section className="class-group" key={section.id}>
                <h2 className="class-group-title">
                  {section.title}
                  {section.level !== '—' && <span className="level-tag">{section.level}</span>}
                  <small>
                    {section.lessons.length} {tr(lang, 'lessons', 'ders')}
                  </small>
                </h2>
                <div className="class-grid">{section.lessons.map(card)}</div>
              </section>
            ));
          })()}
          {classes.length === 0 && (
            <section className="card">
              <EmptyState
                title={tr(lang, 'Let the learning begin', 'Öğrenme başlasın')}
                description={tr(
                  lang,
                  'Create a class, assign a teacher and invite students to join.',
                  'Bir sınıf oluşturun, öğretmen atayın ve öğrencileri kaydedin.',
                )}
              />
            </section>
          )}
        </>
      )}
      {(modal === 'class' || modal === 'edit') && (
        <Modal
          title={tr(
            lang,
            modal === 'edit' ? 'Edit class' : 'Create class',
            modal === 'edit' ? 'Sınıfı düzenle' : 'Sınıf oluştur',
          )}
          onClose={close}
          lang={lang}
          bare
        >
          <form
            onSubmit={(event) => {
              event.preventDefault();
              const { group_name: groupName, ...values } = formValues(event);
              void action.run(async () => {
                // Find the class group by name in that year, or create it.
                const wanted = String(groupName || '').trim();
                let groupId: string | null = null;
                if (wanted) {
                  const existing = list(data, 'class_groups').find(
                    (item) =>
                      String(item.name).toLocaleLowerCase('tr') ===
                        wanted.toLocaleLowerCase('tr') &&
                      item.academic_year_id === values.academic_year_id,
                  );
                  groupId = existing
                    ? existing.id
                    : (
                        await api.save('class_groups', {
                          name: wanted,
                          academic_year_id: values.academic_year_id,
                          language: values.language || null,
                          level_id: isSpecialistSubject(String(values.subject_id || ''), data)
                            ? null
                            : values.level_id || null,
                        })
                      ).id;
                }
                return api.save('classes', {
                  ...values,
                  group_id: groupId,
                  weekday: values.weekday ? Number(values.weekday) : null,
                  start_time: values.start_time || null,
                  active: values.active !== 'false',
                  level_id: values.level_id || null,
                  zoom_url: values.zoom_url || null,
                  ...(modal === 'edit' ? { id: selected!.id } : {}),
                });
              }, close);
            }}
          >
            <div className="modal-body stack">
              <FormError error={action.error} />
              <Field
                label={tr(lang, 'Class (group)', 'Sınıf (grup)')}
                name="group_name"
                list="class-group-names"
                defaultValue={
                  modal === 'edit'
                    ? list(data, 'class_groups').find((item) => item.id === selected?.group_id)
                        ?.name || ''
                    : ''
                }
                placeholder={tr(lang, 'e.g. Class 1', 'ör. Sınıf 1')}
                hint={tr(
                  lang,
                  'Lessons with the same class are shown together. Type a new name to create a class.',
                  'Aynı sınıftaki dersler birlikte görünür. Yeni bir isim yazarsanız sınıf oluşturulur.',
                )}
              />
              <datalist id="class-group-names">
                {list(data, 'class_groups').map((item) => (
                  <option key={item.id} value={item.name} />
                ))}
              </datalist>
              <Field
                label={tr(lang, 'Lesson name', 'Ders adı')}
                name="name"
                defaultValue={modal === 'edit' ? selected?.name : ''}
                required
              />
              <div className="form-grid">
                <SelectField
                  label={tr(lang, 'Subject', 'Ders')}
                  name="subject_id"
                  defaultValue={modal === 'edit' ? selected?.subject_id : ''}
                  onChange={(event) => setLessonSubject(event.target.value)}
                  required
                >
                  <option value="">{tr(lang, 'Choose subject', 'Ders seçin')}</option>
                  {list(data, 'subjects')
                    .filter((subject) => subject.active !== false)
                    .map((subject) => (
                      <option key={subject.id} value={subject.id}>
                        {label(subject, lang)}
                      </option>
                    ))}
                </SelectField>
                <SelectField
                  label={tr(lang, 'Teacher', 'Öğretmen')}
                  name="teacher_id"
                  defaultValue={modal === 'edit' ? selected?.teacher_id : ''}
                  required
                >
                  <option value="">{tr(lang, 'Choose teacher', 'Öğretmen seçin')}</option>
                  {list(data, 'profiles')
                    .filter(
                      (person) => roles(person).includes('teacher') && person.active !== false,
                    )
                    .map((person) => (
                      <option key={person.id} value={person.id}>
                        {name(person)}
                      </option>
                    ))}
                </SelectField>
                <SelectField
                  label={tr(lang, 'Academic year', 'Eğitim yılı')}
                  name="academic_year_id"
                  defaultValue={
                    modal === 'edit'
                      ? selected?.academic_year_id
                      : list(data, 'academic_years')[0]?.id
                  }
                  required
                >
                  {list(data, 'academic_years').map((year) => (
                    <option key={year.id} value={year.id}>
                      {year.name || year.label}
                    </option>
                  ))}
                </SelectField>
                <SelectField
                  label={tr(lang, 'Language', 'Dil')}
                  name="language"
                  defaultValue={modal === 'edit' ? selected?.language : lang}
                >
                  <option value="en">English</option>
                  <option value="tr">Türkçe</option>
                </SelectField>
                <SelectField
                  key={lessonSubject}
                  label={
                    isSpecialistSubject(lessonSubject, data)
                      ? tr(lang, 'Specialist level (optional)', 'Uzmanlık seviyesi (isteğe bağlı)')
                      : tr(lang, 'Level (optional)', 'Seviye (isteğe bağlı)')
                  }
                  hint={
                    isSpecialistSubject(lessonSubject, data)
                      ? tr(
                          lang,
                          'Specialist levels use codes such as C1 or T1.',
                          'Uzmanlık seviyeleri C1, T1 gibi kodlardır.',
                        )
                      : undefined
                  }
                  name="level_id"
                  defaultValue={keptLevel ? keptLevel.id : ''}
                >
                  <option value="">{tr(lang, 'Mixed / unassigned', 'Karma / atanmamış')}</option>
                  {allowedLessonLevels.map((level) => (
                    <option key={level.id} value={level.id}>
                      {label(level, lang)}
                    </option>
                  ))}
                </SelectField>
                <SelectField
                  label={tr(lang, 'Weekday', 'Gün')}
                  name="weekday"
                  defaultValue={modal === 'edit' ? String(selected?.weekday ?? '') : '6'}
                >
                  <option value="">{tr(lang, 'Unscheduled', 'Planlanmamış')}</option>
                  {[
                    ['Sunday', 'Pazar'],
                    ['Monday', 'Pazartesi'],
                    ['Tuesday', 'Salı'],
                    ['Wednesday', 'Çarşamba'],
                    ['Thursday', 'Perşembe'],
                    ['Friday', 'Cuma'],
                    ['Saturday', 'Cumartesi'],
                  ].map(([en, turkish], index) => (
                    <option value={index} key={index}>
                      {tr(lang, en, turkish)}
                    </option>
                  ))}
                </SelectField>
                <Field
                  label={tr(
                    lang,
                    'Start time (school timezone)',
                    'Başlangıç saati (okul saat dilimi)',
                  )}
                  name="start_time"
                  type="time"
                  defaultValue={modal === 'edit' ? selected?.start_time?.slice(0, 5) : '10:00'}
                />
              </div>
              <Field
                label={tr(lang, 'Zoom link', 'Zoom bağlantısı')}
                name="zoom_url"
                type="url"
                pattern="https://.*"
                defaultValue={modal === 'edit' ? selected?.zoom_url : ''}
                placeholder="https://zoom.us/j/…"
              />
              {modal === 'edit' && (
                <SelectField
                  label={tr(lang, 'Status', 'Durum')}
                  name="active"
                  defaultValue={selected?.active === false ? 'false' : 'true'}
                >
                  <option value="true">{tr(lang, 'Active', 'Aktif')}</option>
                  <option value="false">{tr(lang, 'Archived', 'Arşivlenmiş')}</option>
                </SelectField>
              )}
            </div>
            <FormActions busy={action.busy} lang={lang} onCancel={close} />
          </form>
        </Modal>
      )}
      {confirmDialog}
      {editSession && (
        <SessionEditModal
          props={props}
          session={editSession}
          onClose={() => setEditSession(null)}
        />
      )}
      {modal === 'plan' && selected && (
        <LessonPlanModal
          props={props}
          lesson={selected}
          onClose={close}
          onOneOff={() => setModal('session')}
        />
      )}
      {modal === 'session' && selected && (
        <Modal
          title={tr(lang, 'Add a one-off lesson', 'Tek seferlik ders ekle')}
          onClose={close}
          lang={lang}
          bare
        >
          <form
            onSubmit={(event) => {
              event.preventDefault();
              const values = formValues(event);
              void action.run(
                () =>
                  api.save('sessions', {
                    class_id: selected.id,
                    starts_at: new Date(values.starts_at).toISOString(),
                    duration_minutes: Number(values.duration_minutes),
                  }),
                close,
              );
            }}
          >
            <div className="modal-body stack">
              <FormError error={action.error} />
              <Field
                label={tr(lang, 'Date & time (your local time)', 'Tarih ve saat (yerel saatiniz)')}
                name="starts_at"
                type="datetime-local"
                required
              />
              <Field
                label={tr(lang, 'Duration in minutes', 'Süre (dakika)')}
                name="duration_minutes"
                type="number"
                defaultValue={30}
                min={5}
                max={120}
                step={5}
                required
              />
              <p className="form-hint">
                {tr(
                  lang,
                  'This lesson uses the Zoom link configured for its class.',
                  'Bu ders, sınıf için tanımlanan Zoom bağlantısını kullanır.',
                )}
              </p>
            </div>
            <FormActions
              busy={action.busy}
              lang={lang}
              onCancel={close}
              submit={tr(lang, 'Schedule lesson', 'Ders planla')}
            />
          </form>
        </Modal>
      )}
      {modal === 'enroll' && selected && (
        <EnrollStudents props={props} lesson={selected} enrollments={enrollments} onClose={close} />
      )}
    </>
  );
}

/** Who opened a case: "System" for automatic rules, otherwise the staff member's name. */
const caseCreator = (record: Row, data: unknown, lang: Lang) =>
  record.source === 'auto'
    ? tr(lang, 'System', 'Sistem')
    : (() => {
        const author = list(data, 'profiles').find((profile) => profile.id === record.created_by);
        return author ? name(author) : '';
      })();

/** Readable labels for the values automatic rules record. */
const metricLabels: Record<string, [string, string]> = {
  attendance_average: ['Attendance score', 'Yoklama puanı'],
  participation_average: ['Participation average', 'Katılım ortalaması'],
  engagement_average: ['Engagement average', 'Derse ilgi ortalaması'],
  behaviour_average: ['Behaviour average', 'Davranış ortalaması'],
  behaviour_min: ['Lowest behaviour score', 'En düşük davranış puanı'],
  subject_average: ['Subject average', 'Ders ortalaması'],
  academic_min: ['Lowest learning score', 'En düşük kazanım puanı'],
  overall_score: ['Report overall score', 'Karne genel puanı'],
  consecutive_absences: ['Absences in a row', 'Üst üste devamsızlık'],
  camera_incidents: ['Camera / microphone issues', 'Kamera / mikrofon sorunu'],
  observations: ['Observations', 'Gözlem sayısı'],
};

/** Where a case came from, in plain words instead of the stored technical record. */
function CaseOrigin({ record, data, lang }: { record: Row; data: unknown; lang: Lang }) {
  const evidence: Row =
    record.evidence && typeof record.evidence === 'object' ? record.evidence : {};
  const creator = [caseCreator(record, data, lang), date(record.created_at, lang)]
    .filter(Boolean)
    .join(' · ');
  if (record.source !== 'auto')
    return (
      <p className="form-hint">
        {tr(lang, 'Created by', 'Oluşturan')}: <strong>{creator}</strong>
      </p>
    );
  const rule =
    evidence.labels?.[lang] ||
    evidence.labels?.en ||
    record.reason ||
    tr(lang, 'Automatic rule', 'Otomatik kural');
  const context: Row =
    evidence.context && typeof evidence.context === 'object' ? evidence.context : {};
  const values = Object.entries(context).filter(
    ([key, value]) => metricLabels[key] && value !== null && value !== undefined,
  );
  const session = evidence.session_id
    ? list(data, 'sessions').find((item) => item.id === evidence.session_id)
    : undefined;
  return (
    <div className="form-hint">
      {tr(lang, 'Created by', 'Oluşturan')}: <strong>{creator}</strong> ·{' '}
      {tr(lang, 'Rule', 'Kural')}: <strong>{rule}</strong>
      {session && (
        <>
          {' '}
          · {tr(lang, 'Lesson', 'Ders')}: {date(session.starts_at, lang)}
        </>
      )}
      {values.length > 0 && (
        <ul className="origin-values">
          {values.map(([key, value]) => (
            <li key={key}>
              {tr(lang, ...metricLabels[key])}:{' '}
              <strong>
                {typeof value === 'number' ? Math.round(value * 100) / 100 : String(value)}
              </strong>
            </li>
          ))}
        </ul>
      )}
    </div>
  );
}

// Guidance follows five steps; management review is an optional detour from follow-up.
const guidanceSteps = ['new', 'review', 'plan', 'follow_up', 'closed'] as const;
const guidanceStages: Record<string, [string, string]> = {
  new: ['New request', 'Yeni istek'],
  review: ['Review', 'İnceleme'],
  plan: ['Plan & parent meeting', 'Plan ve veli görüşmesi'],
  follow_up: ['Follow-up', 'Takip'],
  closed: ['Closed', 'Kapandı'],
  management_review: ['Management review', 'Yönetim incelemesi'],
  resolved: ['Resolved', 'Çözüldü'],
  closed_unresolved: ['Closed without resolution', 'Çözülmeden kapatıldı'],
  // Earlier stage names, still found in case history.
  teacher_meeting: ['Teacher meeting', 'Öğretmen görüşmesi'],
  parent_meeting: ['Parent meeting', 'Veli görüşmesi'],
  agreed_actions: ['Agreed actions', 'Ortak kararlar'],
  reassessment: ['Reassessment', 'Yeniden değerlendirme'],
};
// Stages used before October 2026 are shown on the shorter path.
const legacyStage: Record<string, string> = {
  teacher_meeting: 'review',
  parent_meeting: 'plan',
  agreed_actions: 'plan',
  reassessment: 'follow_up',
};
const guidanceStage = (record: Row) => {
  const stage =
    record.workflow_stage ||
    (
      {
        new: 'new',
        under_review: 'review',
        plan_active: 'plan',
        follow_up: 'follow_up',
        escalated: 'management_review',
        resolved: 'resolved',
      } as Record<string, string>
    )[record.status] ||
    'new';
  return legacyStage[stage] || stage;
};
const stageLabel = (stage: string, lang: Lang) =>
  guidanceStages[stage]?.[lang === 'tr' ? 1 : 0] || stage;
const guidanceTerminal = (record: Row) =>
  ['resolved', 'closed_unresolved'].includes(guidanceStage(record));
/** Position on the five-step path (1–5); management review counts as follow-up. */
const stepNumber = (stage: string) =>
  stage === 'resolved' || stage === 'closed_unresolved'
    ? 5
    : stage === 'management_review'
      ? 4
      : Math.max(1, guidanceSteps.indexOf(stage as (typeof guidanceSteps)[number]) + 1);
const StepBadge = ({ stage, lang }: { stage: string; lang: Lang }) => (
  <span
    className={`badge ${stage === 'closed_unresolved' ? 'badge-orange' : stage === 'resolved' ? 'badge-active' : stage === 'management_review' ? 'badge-red' : ''}`}
  >
    {stepNumber(stage)}/5 · {stageLabel(stage, lang)}
  </span>
);

function GuidanceStepper({ stage, lang }: { stage: string; lang: Lang }) {
  const current = stepNumber(stage);
  return (
    <ol className="stepper" aria-label={tr(lang, 'Support steps', 'Destek adımları')}>
      {guidanceSteps.map((step, index) => {
        const number = index + 1;
        const state = number < current ? 'done' : number === current ? 'current' : 'todo';
        return (
          <li
            key={step}
            className={`step step-${state}`}
            aria-current={state === 'current' ? 'step' : undefined}
          >
            <span className="step-dot">{state === 'done' ? '✓' : number}</span>
            <span className="step-name">
              {number === 5 && current === 5 ? stageLabel(stage, lang) : stageLabel(step, lang)}
            </span>
          </li>
        );
      })}
    </ol>
  );
}

function GuidanceWorkflow({ record, props }: { record: Row; props: PageProps }) {
  const { lang, user, data, api } = props;
  const action = useAction(props);
  const stage = guidanceStage(record);
  const management = can(user, 'administrator', 'academic_manager');
  const owner =
    management ||
    (can(user, 'guidance') && (!record.assignee_id || record.assignee_id === user.id));
  const terminal = guidanceTerminal(record);
  const [noteOpen, setNoteOpen] = useState(false);
  const teacherIds = list(data, 'enrollments')
    .filter((enrollment) => enrollment.student_id === record.student_id)
    .flatMap((enrollment) =>
      list(data, 'classes')
        .filter((group) => group.id === enrollment.class_id)
        .map((group) => group.teacher_id),
    );
  const teachers = list(data, 'profiles').filter(
    (profile) =>
      roles(profile).includes('teacher') &&
      (teacherIds.includes(profile.id) ||
        profile.id === record.created_by ||
        profile.id === record.reporting_teacher_id),
  );
  // What the next step asks for, in plain words.
  const guide: Record<
    string,
    {
      title: [string, string];
      hint: [string, string];
      note: [string, string];
      button: [string, string];
    }
  > = {
    new: {
      title: ['Review the request', 'İsteği inceleyin'],
      hint: [
        'Talk to the teacher if needed and write down what you found.',
        'Gerekirse öğretmenle görüşün ve bulduklarınızı yazın.',
      ],
      note: ['What did you find?', 'Neler tespit ettiniz?'],
      button: ['Save review', 'İncelemeyi kaydet'],
    },
    review: {
      title: ['Agree a plan with the family', 'Aileyle bir plan yapın'],
      hint: [
        'Meet the parents and write the plan you agreed. This note is shared with the parents.',
        'Veliyle görüşün ve birlikte kararlaştırdığınız planı yazın. Bu not veliyle paylaşılır.',
      ],
      note: ['Plan agreed with the parents', 'Veliyle kararlaştırılan plan'],
      button: ['Save plan', 'Planı kaydet'],
    },
    plan: {
      title: ['Start follow-up', 'Takibi başlatın'],
      hint: [
        'Choose when you will check progress. If left empty, it is set 14 days from today.',
        'İlerlemeyi ne zaman kontrol edeceğinizi seçin. Boş bırakılırsa bugünden 14 gün sonrasıdır.',
      ],
      note: ['How will progress be followed?', 'İlerleme nasıl takip edilecek?'],
      button: ['Start follow-up', 'Takibi başlat'],
    },
    follow_up: {
      title: ['Check progress', 'İlerlemeyi değerlendirin'],
      hint: [
        'Close the case if things improved, continue follow-up with a new date, or pass it to management.',
        'Durum düzeldiyse kapatın, yeni bir tarihle takibe devam edin veya yönetime aktarın.',
      ],
      note: ['What did you observe?', 'Neler gözlemlediniz?'],
      button: ['Resolved – close case', 'Çözüldü – kapat'],
    },
    management_review: {
      title: ['Management decision', 'Yönetim kararı'],
      hint: [
        'Management decides: continue follow-up, or close the case without resolution.',
        'Yönetim karar verir: takibe devam edilir veya kayıt çözülmeden kapatılır.',
      ],
      note: ['Decision and reason', 'Karar ve gerekçe'],
      button: ['Continue follow-up', 'Takibe devam et'],
    },
  };
  const primaryStage: Record<string, string> = {
    new: 'review',
    review: 'plan',
    plan: 'follow_up',
    follow_up: 'resolved',
    management_review: 'follow_up',
  };
  const step = guide[stage];
  const canAct = owner && !terminal && !!step && (stage !== 'management_review' || management);
  const submit = (target: string, form: HTMLFormElement) => {
    if (!form.reportValidity()) return;
    const values = Object.fromEntries(new FormData(form).entries()) as Record<string, string>;
    void action.run(() =>
      api.rpc('advance_guidance_stage', {
        p_case_id: record.id,
        p_stage: target,
        p_note: values.note,
        p_teacher_id: target === 'review' ? values.teacher_id || null : null,
        p_follow_up_at:
          target === 'follow_up' && values.follow_up_at
            ? new Date(values.follow_up_at + 'T12:00:00').toISOString()
            : null,
      }),
    );
  };
  const askingDate = stage === 'plan' || stage === 'follow_up' || stage === 'management_review';
  return (
    <section className="stack">
      <div className="section-heading">
        <h3>{tr(lang, 'Support process', 'Destek süreci')}</h3>
        <StepBadge stage={stage} lang={lang} />
      </div>
      <GuidanceStepper stage={stage} lang={lang} />
      {stage === 'management_review' && (
        <p className="form-hint">
          {tr(lang, 'This case is with management.', 'Bu kayıt yönetim incelemesinde.')}
        </p>
      )}
      {terminal ? (
        <div className="next-step done">
          <strong>{stageLabel(stage, lang)}</strong>
          {record.outcome && <p className="pre-wrap">{record.outcome}</p>}
          {record.closed_at && <small className="muted">{date(record.closed_at, lang)}</small>}
        </div>
      ) : (
        canAct && (
          <form
            key={stage}
            className="next-step"
            onSubmit={(event) => {
              event.preventDefault();
              submit(primaryStage[stage], event.currentTarget);
            }}
          >
            <div className="stack">
              <div>
                <span className="eyebrow">{tr(lang, 'Next step', 'Sıradaki adım')}</span>
                <h4>{tr(lang, ...step.title)}</h4>
                <p className="muted">{tr(lang, ...step.hint)}</p>
              </div>
              <FormError error={action.error} />
              {stage === 'new' && (
                <SelectField
                  label={tr(
                    lang,
                    'Teacher you spoke to (optional)',
                    'Görüşülen öğretmen (isteğe bağlı)',
                  )}
                  name="teacher_id"
                  defaultValue={record.reporting_teacher_id || ''}
                >
                  <option value="">
                    {tr(lang, 'No teacher meeting', 'Öğretmen görüşmesi yok')}
                  </option>
                  {teachers.map((teacher) => (
                    <option key={teacher.id} value={teacher.id}>
                      {name(teacher)}
                    </option>
                  ))}
                </SelectField>
              )}
              <TextArea
                label={tr(lang, ...step.note)}
                name="note"
                required
                minLength={3}
                maxLength={5000}
              />
              {askingDate && (
                <Field
                  label={tr(lang, 'Next follow-up date', 'Sonraki takip tarihi')}
                  name="follow_up_at"
                  type="date"
                  min={today()}
                />
              )}
              <div className="inline-actions">
                <Button type="submit" variant="primary" disabled={action.busy}>
                  {action.busy ? tr(lang, 'Saving…', 'Kaydediliyor…') : tr(lang, ...step.button)}
                </Button>
                {stage === 'follow_up' && (
                  <>
                    <Button
                      variant="secondary"
                      disabled={action.busy}
                      onClick={(event) => submit('follow_up', event.currentTarget.form!)}
                    >
                      {tr(lang, 'Continue follow-up', 'Takibe devam et')}
                    </Button>
                    <Button
                      variant="secondary"
                      disabled={action.busy}
                      onClick={(event) => submit('management_review', event.currentTarget.form!)}
                    >
                      {tr(lang, 'Pass to management', 'Yönetime aktar')}
                    </Button>
                  </>
                )}
                {stage === 'management_review' && (
                  <Button
                    variant="danger"
                    disabled={action.busy}
                    onClick={(event) => submit('closed_unresolved', event.currentTarget.form!)}
                  >
                    {tr(lang, 'Close without resolution', 'Çözülmeden kapat')}
                  </Button>
                )}
              </div>
            </div>
          </form>
        )
      )}
      {!terminal && management && (
        <Disclosure
          icon={<UserCog size={17} />}
          title={tr(lang, 'Case assignment', 'Kayıt ataması')}
          summary={`${tr(lang, 'Assigned', 'Atanan')}: ${
            record.assignee_id
              ? name(list(data, 'profiles').find((profile) => profile.id === record.assignee_id))
              : tr(lang, 'Shared queue', 'Ortak kuyruk')
          }`}
        >
          <form
            onSubmit={(event) => {
              event.preventDefault();
              const values = formValues(event);
              void action.run(() =>
                api.rpc('update_guidance', {
                  p_case_id: record.id,
                  p_status: record.status,
                  p_assignee_id: values.assignee_id || null,
                  p_follow_up_at: record.follow_up_at || null,
                  p_outcome: record.outcome || null,
                }),
              );
            }}
          >
            <div className="stack">
              <div className="assignee-row">
                <span className="avatar avatar-small">
                  {record.assignee_id
                    ? initials(
                        name(
                          list(data, 'profiles').find(
                            (profile) => profile.id === record.assignee_id,
                          ),
                        ),
                      )
                    : '—'}
                </span>
                <span>
                  {record.assignee_id
                    ? name(
                        list(data, 'profiles').find((profile) => profile.id === record.assignee_id),
                      )
                    : tr(
                        lang,
                        'Shared queue: anyone in guidance can pick this up',
                        'Ortak kuyruk: rehberlikteki herkes üstlenebilir',
                      )}
                </span>
              </div>
              <SelectField
                label={tr(lang, 'Change to', 'Şu kişiye ata')}
                name="assignee_id"
                defaultValue={record.assignee_id || ''}
              >
                <option value="">{tr(lang, 'Shared queue', 'Ortak kuyruk')}</option>
                {list(data, 'profiles')
                  .filter(
                    (profile) =>
                      profile.active !== false &&
                      can(profile, 'administrator', 'academic_manager', 'guidance'),
                  )
                  .map((profile) => (
                    <option key={profile.id} value={profile.id}>
                      {name(profile)}
                    </option>
                  ))}
              </SelectField>
              <Button type="submit" disabled={action.busy} variant="secondary">
                {tr(lang, 'Save assignment', 'Atamayı kaydet')}
              </Button>
            </div>
          </form>
        </Disclosure>
      )}
      {!terminal && owner && (
        <Disclosure
          icon={<MessageSquarePlus size={17} />}
          title={tr(lang, 'Add a note or parent update', 'Not veya veli bilgilendirmesi ekle')}
          summary={tr(
            lang,
            'A private team note, or an update for the parents',
            'Ekip için özel not veya velilere bilgilendirme',
          )}
          open={noteOpen}
          onToggle={setNoteOpen}
        >
          <form
            onSubmit={(event) => {
              event.preventDefault();
              const values = formValues(event);
              void action.run(
                () =>
                  api.rpc('add_guidance_note', {
                    p_case_id: record.id,
                    p_body: values.body,
                    p_kind: 'note',
                    p_shared: values.shared === 'on',
                  }),
                () => setNoteOpen(false),
              );
            }}
          >
            <div className="stack">
              <TextArea
                label={tr(lang, 'Note', 'Not')}
                name="body"
                required
                minLength={3}
                maxLength={5000}
              />
              <label className="switch-row">
                <input name="shared" type="checkbox" role="switch" />
                <span>
                  <strong>
                    {tr(lang, 'Share this note with parents', 'Bu notu velilerle paylaş')}
                  </strong>
                  <small>
                    {tr(
                      lang,
                      'Off: only the team sees it. On: it appears on the parent timeline.',
                      'Kapalı: yalnızca ekip görür. Açık: veli zaman çizelgesinde görünür.',
                    )}
                  </small>
                </span>
              </label>
              <Button type="submit" disabled={action.busy} variant="secondary">
                {tr(lang, 'Save note', 'Notu kaydet')}
              </Button>
            </div>
          </form>
        </Disclosure>
      )}
    </section>
  );
}

export function GuidancePage(props: PageProps & { initialCaseId?: string }) {
  const { data, lang, api, user } = props;
  const action = useAction(props);
  const [selectedId, setSelectedId] = useState<string | null>(props.initialCaseId || null);
  const [create, setCreate] = useState(!!props.context?.studentId);
  const [filter, setFilter] = useState('open');
  useEffect(() => {
    setSelectedId(props.initialCaseId || null);
  }, [props.initialCaseId]);
  const parent = isParent(user);
  const manage = can(
    user,
    'admin',
    'administrator',
    'academic_manager',
    'guidance',
    'guidance_staff',
  );
  const cases = list(data, parent ? 'parent_guidance' : 'guidance_cases');
  const selected = cases.find((item) => item.id === selectedId);
  const states = ['new', 'under_review', 'plan_active', 'follow_up', 'escalated', 'resolved'];
  const visible = cases
    .filter(
      (item) =>
        filter === 'all' ||
        (filter === 'open' ? !guidanceTerminal(item) : item.severity === filter),
    )
    .sort(
      (a, b) =>
        Number(b.overdue) - Number(a.overdue) ||
        ({ red: 0, orange: 1, yellow: 2 }[a.severity as 'red'] ?? 3) -
          ({ red: 0, orange: 1, yellow: 2 }[b.severity as 'red'] ?? 3) ||
        String(a.follow_up_at || a.created_at).localeCompare(
          String(b.follow_up_at || b.created_at),
        ),
    );
  const caseTitle = (item: Row) =>
    item.report_topic ||
    item.title ||
    item.reason ||
    item.issue_key ||
    tr(lang, 'Student support', 'Öğrenci desteği');
  const stageEvents = list(data, 'guidance_stage_events')
    .filter((event) => event.case_id === selectedId)
    .sort((a, b) => String(b.created_at).localeCompare(String(a.created_at)));
  const events = list(data, 'guidance_notes')
    .filter((event) => event.case_id === selectedId)
    .sort((a, b) => String(b.created_at).localeCompare(String(a.created_at)));
  const close = () => {
    setCreate(false);
    action.clear();
  };
  return (
    <>
      <PageHeader
        eyebrow={tr(lang, 'Care that makes a difference', 'Fark yaratan ilgi')}
        title={tr(lang, 'Guidance & support', 'Rehberlik ve destek')}
        description={tr(
          lang,
          'Notice early. Listen closely. Help every child find their way.',
          'Erken fark edin. Dikkatle dinleyin. Her çocuğun yolunu bulmasına yardımcı olun.',
        )}
      >
        {!parent && (
          <Button variant="primary" onClick={() => setCreate(true)}>
            <Plus size={17} />
            {tr(lang, 'Create request', 'İstek oluştur')}
          </Button>
        )}
      </PageHeader>
      {parent ? (
        <div className="stack">
          {[...new Set(cases.map((item) => String(item.student_id)))].map((studentId) => (
            <section className="card" key={studentId}>
              <div className="card-header">
                <div>
                  <h3>{studentName(data, studentId)}</h3>
                  <p className="muted">
                    {tr(
                      lang,
                      'Updates shared with you by the guidance team',
                      'Rehberlik ekibinin sizinle paylaştığı bilgiler',
                    )}
                  </p>
                </div>
              </div>
              <ol className="ptl">
                {cases
                  .filter((item) => String(item.student_id) === studentId)
                  .sort((a, b) => String(b.created_at).localeCompare(String(a.created_at)))
                  .map((item) => (
                    <li key={item.id} className={`ptl-item ptl-${item.kind || 'note'}`}>
                      <span className="ptl-dot" aria-hidden="true" />
                      <div className="ptl-body">
                        <div className="ptl-meta">
                          <span className="badge">
                            {item.kind === 'action'
                              ? tr(lang, 'Support plan', 'Destek planı')
                              : item.kind === 'review'
                                ? tr(lang, 'Follow-up', 'Takip')
                                : item.kind === 'parent_meeting' || item.kind === 'teacher_meeting'
                                  ? tr(lang, 'Meeting', 'Görüşme')
                                  : tr(lang, 'Note', 'Not')}
                          </span>
                          <time>{date(item.created_at, lang)}</time>
                        </div>
                        <p className="pre-wrap">{item.body}</p>
                      </div>
                    </li>
                  ))}
              </ol>
            </section>
          ))}
          {!cases.length && (
            <section className="card">
              <EmptyState
                title={tr(lang, 'A caring team, by your side', 'Yanınızda, ilgili bir ekip')}
                description={tr(
                  lang,
                  'Shared support plans and follow-up actions will appear here.',
                  'Sizinle paylaşılan destek planları ve takip adımları burada görünecek.',
                )}
              />
            </section>
          )}
        </div>
      ) : (
        <>
          <div className="stat-grid">
            <StatCard
              title={tr(lang, 'Open cases', 'Açık kayıtlar')}
              value={cases.filter((item) => !guidanceTerminal(item)).length}
            />
            <StatCard
              title={tr(lang, 'Need urgent care', 'Acil ilgi bekleyen')}
              value={
                cases.filter((item) => item.severity === 'red' && !guidanceTerminal(item)).length
              }
            />
            <StatCard
              title={tr(lang, 'Resolved cases', 'Çözülen kayıtlar')}
              value={cases.filter((item) => guidanceStage(item) === 'resolved').length}
            />
          </div>
          <div className="toolbar">
            <Tabs
              compact
              label={tr(lang, 'Case filter', 'Kayıt filtresi')}
              value={filter}
              onChange={setFilter}
              items={[
                ['open', 'Open cases', 'Açık kayıtlar'],
                ['red', 'Urgent', 'Acil'],
                ['all', 'All cases', 'Tüm kayıtlar'],
              ].map(([id, en, turkish]) => ({ id, label: tr(lang, en, turkish) }))}
            />
            <span className="muted">
              {tr(lang, 'Review within 48 hours', '48 saat içinde inceleyin')}
            </span>
          </div>
          <div className="kanban-board">
            {states
              .filter((state) => filter !== 'open' || state !== 'resolved')
              .map((state) => (
                <section className="kanban-column" key={state}>
                  <div className="section-heading">
                    <h3>
                      {state === 'escalated'
                        ? tr(lang, 'Management review', 'Yönetim incelemesi')
                        : state === 'resolved'
                          ? tr(lang, 'Closed cases', 'Kapanan kayıtlar')
                          : statusLabel(state, lang)}
                    </h3>
                    <span className="count-badge">
                      {visible.filter((item) => item.status === state).length}
                    </span>
                  </div>
                  {visible
                    .filter((item) => item.status === state)
                    .map((item) => (
                      <button
                        className={`guidance-card severity-${item.severity}`}
                        key={item.id}
                        onClick={() => setSelectedId(item.id)}
                      >
                        <div className="section-heading">
                          <StatusBadge value={item.severity || 'yellow'} lang={lang} />
                          {item.review_due_at &&
                            new Date(item.review_due_at).getTime() < Date.now() &&
                            state === 'new' && (
                              <small className="danger-text">
                                {tr(lang, 'Overdue', 'Gecikmiş')}
                              </small>
                            )}
                        </div>
                        <h3>{studentName(data, item.student_id)}</h3>
                        <StepBadge stage={guidanceStage(item)} lang={lang} />
                        <p>
                          <strong>{caseTitle(item)}</strong>
                        </p>
                        {item.description && <p className="muted">{item.description}</p>}
                        <footer>
                          <small className="muted">
                            {[caseCreator(item, data, lang), date(item.created_at, lang)]
                              .filter(Boolean)
                              .join(' · ')}
                          </small>
                          <ChevronRight size={15} />
                        </footer>
                      </button>
                    ))}
                  {!visible.some((item) => item.status === state) && (
                    <p className="kanban-empty">
                      {tr(lang, 'Nothing here yet', 'Henüz kayıt yok')}
                    </p>
                  )}
                </section>
              ))}
          </div>
        </>
      )}
      {selected && !parent && (
        <Modal
          title={`${studentName(data, selected.student_id)} · ${caseTitle(selected)}`}
          onClose={() => setSelectedId(null)}
          lang={lang}
          bare
        >
          <div className="modal-body stack">
            <div className="inline-actions">
              <StatusBadge value={selected.severity} lang={lang} />
              <StepBadge stage={guidanceStage(selected)} lang={lang} />
            </div>
            <div>
              <h3>{tr(lang, 'Report topic', 'Rapor konusu')}</h3>
              <p>{caseTitle(selected)}</p>
            </div>
            {selected.description && (
              <div>
                <h3>{tr(lang, 'Description', 'Açıklama')}</h3>
                <p className="pre-wrap">{selected.description}</p>
              </div>
            )}
            <CaseOrigin record={selected} data={data} lang={lang} />
            <div className="form-hint">
              {tr(lang, 'Review deadline', 'İnceleme son tarihi')}:{' '}
              {date(selected.review_due_at, lang)} · {tr(lang, 'Assigned to', 'Atanan')}:{' '}
              {name(list(data, 'profiles').find((profile) => profile.id === selected.assignee_id))}
            </div>
            <GuidanceWorkflow
              key={selected.id + guidanceStage(selected)}
              record={selected}
              props={props}
            />
            {(() => {
              // One history: step changes plus extra notes. Each step also saves its text
              // as a note, so notes repeating a step's text are not shown twice.
              const stepTexts = new Set(stageEvents.map((event) => String(event.note).trim()));
              const person = (id?: string) =>
                id ? name(list(data, 'profiles').find((profile) => profile.id === id)) : '';
              const history = [
                ...stageEvents.map((event) => ({
                  id: event.id,
                  at: String(event.created_at),
                  type: 'step' as const,
                  title: `${stageLabel(event.from_stage, lang)} → ${stageLabel(event.to_stage, lang)}`,
                  body: event.note,
                  who: person(event.actor_id),
                  shared: event.to_stage === 'plan' || event.to_stage === 'agreed_actions',
                })),
                ...events
                  .filter((note) => !stepTexts.has(String(note.body).trim()))
                  .map((note) => ({
                    id: note.id,
                    at: String(note.created_at),
                    type: 'note' as const,
                    title:
                      (
                        {
                          note: tr(lang, 'Note', 'Not'),
                          teacher_meeting: tr(lang, 'Teacher meeting', 'Öğretmen görüşmesi'),
                          parent_meeting: tr(lang, 'Parent meeting', 'Veli görüşmesi'),
                          action: tr(lang, 'Support plan', 'Destek planı'),
                          review: tr(lang, 'Review', 'Değerlendirme'),
                        } as Record<string, string>
                      )[note.kind] || note.kind,
                    body: note.body,
                    who: person(note.author_id),
                    shared: !!note.shared,
                  })),
              ].sort((a, b) => b.at.localeCompare(a.at));
              return (
                <Disclosure
                  icon={<History size={17} />}
                  title={tr(lang, 'Process history', 'Süreç geçmişi')}
                  summary={
                    history.length
                      ? `${history.length} ${tr(lang, 'entries', 'kayıt')} · ${tr(lang, 'latest', 'son')}: ${date(history[0].at, lang)}`
                      : tr(lang, 'No activity yet', 'Henüz kayıt yok')
                  }
                  open
                >
                  {history.length ? (
                    <ol className="ptl">
                      {history.map((item) => (
                        <li
                          key={item.id}
                          className={`ptl-item ${item.type === 'step' ? 'ptl-step' : item.shared ? 'ptl-shared' : 'ptl-private'}`}
                        >
                          <span className="ptl-dot" aria-hidden="true" />
                          <div className="ptl-body">
                            <div className="ptl-meta">
                              <span className="badge">{item.title}</span>
                              <time>{date(item.at, lang)}</time>
                              {item.who && <span className="ptl-who">· {item.who}</span>}
                            </div>
                            <p className="pre-wrap">{item.body}</p>
                            {item.shared && (
                              <span className="badge badge-active">
                                {tr(lang, 'Shared with parents', 'Veliyle paylaşıldı')}
                              </span>
                            )}
                          </div>
                        </li>
                      ))}
                    </ol>
                  ) : (
                    <p className="muted">
                      {tr(lang, 'No follow-up activities yet.', 'Henüz takip etkinliği yok.')}
                    </p>
                  )}
                </Disclosure>
              );
            })()}
          </div>
          <div className="modal-actions">
            <Button onClick={() => setSelectedId(null)} variant="secondary">
              {tr(lang, 'Close', 'Kapat')}
            </Button>
          </div>
        </Modal>
      )}
      {create && (
        <Modal title={tr(lang, 'Create request', 'İstek oluştur')} onClose={close} lang={lang} bare>
          <form
            onSubmit={(event) => {
              event.preventDefault();
              const values = formValues(event);
              void action.run(
                () =>
                  api.rpc('create_guidance_request', {
                    p_student_id: values.student_id,
                    p_severity: values.severity,
                    p_report_topic: values.report_topic,
                    p_description: values.description,
                  }),
                close,
              );
            }}
          >
            <div className="modal-body stack">
              <FormError error={action.error} />
              <SelectField
                label={tr(lang, 'Student number', 'Öğrenci numarası')}
                name="student_id"
                required
                defaultValue={props.context?.studentId || ''}
              >
                <option value="">
                  {tr(lang, 'Choose a student by number', 'Öğrenci numarasıyla seçim yapın')}
                </option>
                {list(data, 'students')
                  .filter((student) => student.status !== 'archived')
                  .sort((a, b) =>
                    String(a.student_number || '').localeCompare(String(b.student_number || '')),
                  )
                  .map((student) => (
                    <option value={student.id} key={student.id}>
                      {student.student_number || '—'} · {name(student)}
                    </option>
                  ))}
              </SelectField>
              <SelectField
                label={tr(lang, 'Risk color', 'Risk rengi')}
                name="severity"
                defaultValue="orange"
                required
              >
                <option value="red">{tr(lang, 'Red — Urgent', 'Kırmızı — Acil')}</option>
                <option value="orange">
                  {tr(lang, 'Orange — Needs attention', 'Turuncu — İlgilenilmeli')}
                </option>
                <option value="yellow">{tr(lang, 'Yellow — Observe', 'Sarı — Gözlem')}</option>
              </SelectField>
              <Field
                label={tr(lang, 'Report topic', 'Rapor konusu')}
                name="report_topic"
                required
                minLength={3}
                maxLength={200}
              />
              <TextArea
                label={tr(lang, 'Description', 'Açıklama')}
                name="description"
                required
                minLength={3}
                maxLength={5000}
              />
              <p className="form-hint">
                {tr(
                  lang,
                  'The guidance team will review this request. Private notes are never shown to parents.',
                  'Rehberlik ekibi bu isteği inceleyecek. Özel notlar velilere gösterilmez.',
                )}
              </p>
            </div>
            <FormActions
              busy={action.busy}
              lang={lang}
              onCancel={close}
              submit={tr(lang, 'Create request', 'İstek oluştur')}
            />
          </form>
        </Modal>
      )}
    </>
  );
}

export function FinancePage(props: PageProps) {
  const { data, lang, api, user } = props;
  const action = useAction(props);
  const [modal, setModal] = useState<
    'payment' | 'dues' | 'fee' | 'void' | 'charge' | 'allocate' | 'void_charge' | 'account' | null
  >(null);
  const [tab, setTab] = useState('accounts');
  // The student whose account window is open; other forms return to it when closed.
  const [accountId, setAccountId] = useState<string | null>(null);
  const [accountSearch, setAccountSearch] = useState('');
  const [paymentAmount, setPaymentAmount] = useState('');
  const [manualCharge, setManualCharge] = useState(false);
  const [studentFilter, setStudentFilter] = useState(props.context?.studentId || '');
  const [preview, setPreview] = useState<Row[] | null>(null);
  const [duesMonth, setDuesMonth] = useState(today().slice(0, 7));
  const [paymentStudent, setPaymentStudent] = useState('');
  const [paymentCurrency, setPaymentCurrency] = useState('EUR');
  const [voidTarget, setVoidTarget] = useState<Row | null>(null);
  const [feeStudent, setFeeStudent] = useState('');
  const [chargeForm, setChargeForm] = useState<Row>({});
  const manage = can(user, 'admin', 'administrator');
  const [confirm, confirmDialog] = useConfirm(lang);
  /** Administrator-only permanent delete of a payment (its allocations go with it). */
  const deletePayment = async (payment: Row) => {
    const confirmed = await confirm({
      title: tr(lang, 'Delete this payment?', 'Bu tahsilat silinsin mi?'),
      message: tr(
        lang,
        `${currency(Number(payment.amount), payment.currency, lang)} · ${date(payment.paid_on, lang)} · ${studentName(data, payment.student_id)}. Its matches to charges are removed too.`,
        `${currency(Number(payment.amount), payment.currency, lang)} · ${date(payment.paid_on, lang)} · ${studentName(data, payment.student_id)}. Borçlarla eşleşmeleri de kaldırılır.`,
      ),
      confirmLabel: tr(lang, 'Delete', 'Sil'),
      danger: true,
    });
    if (!confirmed) return;
    void action.run(() => api.rpc('delete_payment', { p_id: payment.id }));
  };
  /** Administrator-only permanent delete of a charge (refused while a payment is allocated). */
  const deleteCharge = async (charge: Row) => {
    const confirmed = await confirm({
      title: tr(lang, 'Delete this charge?', 'Bu borç silinsin mi?'),
      message: tr(
        lang,
        `${currency(Number(charge.amount), charge.currency, lang)} · ${date(charge.due_on, lang)} · ${chargeTitle(charge)} · ${studentName(data, charge.student_id)}.`,
        `${currency(Number(charge.amount), charge.currency, lang)} · ${date(charge.due_on, lang)} · ${chargeTitle(charge)} · ${studentName(data, charge.student_id)}.`,
      ),
      confirmLabel: tr(lang, 'Delete', 'Sil'),
      danger: true,
    });
    if (!confirmed) return;
    void action.run(async () => {
      try {
        await api.rpc('delete_charge', { p_id: charge.id });
      } catch (cause) {
        if (errorText(cause, lang).includes('has_payments'))
          throw new Error(
            tr(
              lang,
              'A payment is allocated to this charge; delete or void that payment first.',
              'Bu borca bağlı tahsilat var; önce tahsilatı silin veya iptal edin.',
            ),
          );
        throw cause;
      }
    });
  };
  const [onlyDebtors, setOnlyDebtors] = useState(manage);
  const years = list(data, 'academic_years');
  const packages = list(data, 'packages').filter((pack) => pack.active !== false);
  /** Amount and currency taken from a package's price (left alone when it has none). */
  const packagePrice = (packageId?: string): Row => {
    const pack = list(data, 'packages').find((item) => item.id === packageId);
    return pack?.monthly_fee != null
      ? {
          gross_amount: String(pack.monthly_fee),
          currency: isCurrency(pack.currency) ? pack.currency : 'EUR',
        }
      : {};
  };
  /** The scholarship saved on the student's fee settings, if any. */
  const studentScholarship = (student?: Row): Row => {
    const scholarship = scholarshipOf(student);
    return scholarship.value > 0
      ? { discount_type: scholarship.type, discount_value: String(scholarship.value) }
      : { discount_type: '', discount_value: '' };
  };
  const openCharge = (studentId = '') => {
    const student = list(data, 'students').find((item) => item.id === studentId);
    setChargeForm({
      student_id: studentId,
      package_id: student?.package_id || '',
      currency: isCurrency(student?.currency) ? student?.currency : 'EUR',
      academic_year_id: (years.find((year) => year.active) || years[0])?.id || '',
      period_id: '',
      gross_amount: '',
      discount_type: '',
      discount_value: '',
      due_on: today(),
      note: '',
      ...packagePrice(student?.package_id),
      ...(student ? studentScholarship(student) : {}),
    });
    setModal('charge');
  };
  const setCharge = (patch: Row) =>
    setChargeForm((value) => ({ ...value, net_text: undefined, ...patch }));
  const chargeGross = Number(chargeForm.gross_amount || 0);
  const chargeNet = chargeForm.discount_type
    ? applyScholarship(
        chargeGross,
        chargeForm.discount_type,
        Number(chargeForm.discount_value || 0),
      )
    : chargeGross;
  /** A charge's title in the reader's language: year · package · term · note. */
  const chargeTitle = (charge: Row) => {
    if (!charge.academic_year_id)
      return charge.description || charge.month || date(charge.due_on, lang);
    const parts = [
      years.find((year) => year.id === charge.academic_year_id)?.name,
      charge.package_id
        ? label(
            list(data, 'packages').find((pack) => pack.id === charge.package_id),
            lang,
          )
        : null,
      charge.period_id
        ? label(
            list(data, 'periods').find((period) => period.id === charge.period_id),
            lang,
          )
        : null,
    ].filter(Boolean);
    const note = String(charge.description || '')
      .split(' · ')
      .slice(parts.length)
      .join(' · ');
    return [...parts, note].filter(Boolean).join(' · ');
  };
  const charges = list(data, 'charges');
  const payments = list(data, 'payments');
  const allocations = list(data, 'allocations');
  const validPayments = payments.filter(
    (payment) => !payment.voided_at && payment.status !== 'void',
  );
  const chargePaid = (charge: Row) =>
    allocations
      .filter(
        (allocation) =>
          allocation.charge_id === charge.id &&
          validPayments.some((payment) => payment.id === allocation.payment_id),
      )
      .reduce((sum, allocation) => sum + Number(allocation.amount), 0);
  const unallocated = (payment: Row) =>
    Math.max(
      0,
      Number(payment.amount) -
        allocations
          .filter((item) => item.payment_id === payment.id)
          .reduce((sum, item) => sum + Number(item.amount), 0),
    );
  const remaining = (charge: Row) => Math.max(0, Number(charge.amount) - chargePaid(charge));
  const codes = [
    ...new Set(
      charges
        .filter((charge) => !charge.voided_at)
        .map((charge) => String(charge.currency))
        .concat(validPayments.map((payment) => String(payment.currency))),
    ),
  ];
  const close = () => {
    // A form opened from a student's account returns to that account.
    setModal(accountId ? 'account' : null);
    setPreview(null);
    setManualCharge(false);
    action.clear();
  };
  const closeAccount = () => {
    setAccountId(null);
    setModal(null);
    action.clear();
  };
  const round2 = (value: number) => Math.round(value * 100) / 100;
  /** Open charges of a student in one currency, oldest due date first. */
  const openChargesOf = (studentId: string, code?: string) =>
    charges
      .filter(
        (charge) =>
          charge.student_id === studentId &&
          !charge.voided_at &&
          remaining(charge) > 0 &&
          (!code || charge.currency === code),
      )
      .sort((a, b) => String(a.due_on).localeCompare(String(b.due_on)));
  /** Splits an amount over the oldest open charges; anything left stays as credit. */
  const autoAllocate = (studentId: string, code: string, amount: number) => {
    let left = round2(amount);
    const allocations: { charge_id: string; amount: number }[] = [];
    for (const charge of openChargesOf(studentId, code)) {
      if (left <= 0) break;
      const take = round2(Math.min(left, remaining(charge)));
      if (take > 0) {
        allocations.push({ charge_id: charge.id, amount: take });
        left = round2(left - take);
      }
    }
    return { allocations, left };
  };
  const daysSince = (day: string) =>
    Math.floor(
      (new Date(`${today()}T12:00:00`).getTime() - new Date(`${day}T12:00:00`).getTime()) /
        86400000,
    );
  /** One line per student: balance per currency, oldest unpaid due date, last payment. */
  const accounts = list(data, 'students')
    .map((student) => {
      const balances = [
        ...new Set(
          charges
            .filter((charge) => charge.student_id === student.id && !charge.voided_at)
            .map((charge) => String(charge.currency))
            .concat(
              validPayments
                .filter((payment) => payment.student_id === student.id)
                .map((payment) => String(payment.currency)),
            ),
        ),
      ].map((code) => ({
        code,
        balance: round2(
          charges
            .filter(
              (charge) =>
                charge.student_id === student.id && !charge.voided_at && charge.currency === code,
            )
            .reduce((sum, charge) => sum + Number(charge.amount), 0) -
            validPayments
              .filter((payment) => payment.student_id === student.id && payment.currency === code)
              .reduce((sum, payment) => sum + Number(payment.amount), 0),
        ),
      }));
      const oldest = openChargesOf(student.id)[0];
      const overdue = oldest && oldest.due_on < today() ? daysSince(oldest.due_on) : 0;
      const lastPayment = validPayments
        .filter((payment) => payment.student_id === student.id)
        .map((payment) => String(payment.paid_on))
        .sort()
        .pop();
      return { student, balances, oldest, overdue, lastPayment };
    })
    .filter(
      (row) =>
        (!onlyDebtors || row.balances.some((item) => item.balance > 0)) &&
        name(row.student).toLowerCase().includes(accountSearch.toLowerCase()) &&
        (row.student.status !== 'archived' || row.balances.some((item) => item.balance !== 0)),
    )
    .sort(
      (a, b) =>
        b.overdue - a.overdue ||
        Math.max(0, ...b.balances.map((item) => item.balance)) -
          Math.max(0, ...a.balances.map((item) => item.balance)),
    );
  /** What a student will be charged each month: package or own fee, minus scholarship. */
  const monthlyDue = (student?: Row) => {
    const pack = list(data, 'packages').find((item) => item.id === student?.package_id);
    const fee = Number(student?.monthly_fee ?? pack?.monthly_fee ?? 0);
    const code = student?.monthly_fee != null ? student?.currency : pack?.currency || 'EUR';
    const scholarship = scholarshipOf(student);
    return {
      pack,
      fee,
      code: String(code || 'EUR'),
      scholarship,
      due: applyScholarship(fee, scholarship.type, scholarship.value),
    };
  };
  const openFee = (studentId: string) => {
    setFeeStudent(studentId);
    action.clear();
    setModal('fee');
  };
  const openAccount = (studentId: string) => {
    setAccountId(studentId);
    setModal('account');
  };
  const openPayment = (studentId = '') => {
    setPaymentStudent(studentId);
    setPaymentAmount('');
    setManualCharge(false);
    const first = studentId ? openChargesOf(studentId)[0] : undefined;
    setPaymentCurrency(first ? String(first.currency) : 'EUR');
    action.clear();
    setModal('payment');
  };
  const paymentPlan =
    paymentStudent && Number(paymentAmount) > 0
      ? autoAllocate(paymentStudent, paymentCurrency, Number(paymentAmount))
      : null;
  const balanceBadges = (balances: { code: string; balance: number }[]) =>
    balances.length ? (
      balances.map((item) => (
        <span
          key={item.code}
          className={`badge ${item.balance > 0 ? 'badge-orange' : item.balance < 0 ? 'badge-active' : ''}`}
        >
          {item.balance < 0 ? `${tr(lang, 'Credit', 'Alacak')} ` : ''}
          {currency(Math.abs(item.balance), item.code, lang)}
        </span>
      ))
    ) : (
      <span className="muted">—</span>
    );
  const filteredCharges = charges.filter(
    (charge) => !studentFilter || charge.student_id === studentFilter,
  );
  const filteredPayments = payments.filter(
    (payment) => !studentFilter || payment.student_id === studentFilter,
  );
  return (
    <>
      <PageHeader
        eyebrow={tr(lang, 'Simple, transparent records', 'Sade ve şeffaf kayıtlar')}
        title={tr(lang, 'Payments & dues', 'Ödemeler ve aidatlar')}
        description={tr(
          lang,
          'Keep family balances clear, with every payment accounted for.',
          'Her ödemeyi takip ederek aile bakiyelerini açık tutun.',
        )}
      >
        {manage && (
          <>
            <MenuButton
              className="more-actions"
              label={tr(lang, 'Other actions', 'Diğer işlemler')}
              button={
                <span className="btn btn-secondary">
                  {tr(lang, 'Other actions', 'Diğer işlemler')}
                  <ChevronDown size={15} aria-hidden="true" />
                </span>
              }
            >
              {(closeMenu) => (
                <>
                  <button
                    type="button"
                    role="menuitem"
                    className="menu-item"
                    onClick={() => {
                      closeMenu();
                      openCharge();
                    }}
                  >
                    <Plus size={16} aria-hidden="true" />
                    {tr(lang, 'Add charge', 'Tahakkuk ekle')}
                  </button>
                  <button
                    type="button"
                    role="menuitem"
                    className="menu-item"
                    onClick={() => {
                      closeMenu();
                      setModal('dues');
                    }}
                  >
                    <CalendarDays size={16} aria-hidden="true" />
                    {tr(lang, 'Monthly dues', 'Aylık aidat oluştur')}
                  </button>
                  <button
                    type="button"
                    role="menuitem"
                    className="menu-item"
                    onClick={() => {
                      closeMenu();
                      setModal('fee');
                    }}
                  >
                    <Users size={16} aria-hidden="true" />
                    {tr(lang, 'Set student fee', 'Öğrenci ücreti belirle')}
                  </button>
                </>
              )}
            </MenuButton>
            <Button variant="primary" onClick={() => openPayment()}>
              <Plus size={17} />
              {tr(lang, 'Take payment', 'Ödeme al')}
            </Button>
          </>
        )}
      </PageHeader>
      <div className="stat-grid">
        {codes.length ? (
          codes.map((code) => {
            const received = validPayments
              .filter((payment) => payment.currency === code)
              .reduce((sum, payment) => sum + Number(payment.amount), 0);
            return (
              <StatCard
                key={code}
                title={`${code} · ${tr(lang, 'Balance', 'Bakiye')}`}
                value={currency(
                  charges
                    .filter((charge) => charge.currency === code && !charge.voided_at)
                    .reduce((sum, charge) => sum + Number(charge.amount), 0) - received,
                  code,
                  lang,
                )}
                subtitle={`${tr(lang, 'Received', 'Tahsil edilen')}: ${currency(received, code, lang)}`}
              />
            );
          })
        ) : (
          <StatCard
            title={tr(lang, 'Recorded payments', 'Kayıtlı ödemeler')}
            value="0"
            subtitle={tr(
              lang,
              'Balances appear separately for each currency',
              'Her para birimi ayrı gösterilir',
            )}
          />
        )}
      </div>
      <section className="card">
        <div className="toolbar">
          <Tabs
            compact
            label={tr(lang, 'Payment records', 'Ödeme kayıtları')}
            value={tab}
            onChange={setTab}
            items={[
              ['accounts', 'Student accounts', 'Öğrenci hesapları'],
              ['charges', 'Charges', 'Tahakkuklar'],
              ['payments', 'Payments', 'Ödemeler'],
            ].map(([id, en, turkish]) => ({ id, label: tr(lang, en, turkish) }))}
          />
          {tab === 'accounts' ? (
            <div className="toolbar-filters">
              <SearchField
                label={tr(lang, 'Search student…', 'Öğrenci ara…')}
                value={accountSearch}
                onChange={(event) => setAccountSearch(event.target.value)}
              />
              {manage && (
                <label className="checkbox-label">
                  <input
                    type="checkbox"
                    checked={onlyDebtors}
                    onChange={(event) => setOnlyDebtors(event.target.checked)}
                  />
                  {tr(lang, 'Only students who owe', 'Sadece borçlular')}
                </label>
              )}
            </div>
          ) : (
            <select
              value={studentFilter}
              onChange={(event) => setStudentFilter(event.target.value)}
              aria-label={tr(lang, 'Filter by student', 'Öğrenciye göre filtrele')}
            >
              <option value="">{tr(lang, 'All students', 'Tüm öğrenciler')}</option>
              {list(data, 'students').map((student) => (
                <option value={student.id} key={student.id}>
                  {name(student)}
                </option>
              ))}
            </select>
          )}
        </div>
        {tab === 'accounts' &&
          (accounts.length ? (
            <div className="table-wrap">
              <table className="data-table">
                <thead>
                  <tr>
                    <th scope="col">{tr(lang, 'Student', 'Öğrenci')}</th>
                    <th scope="col">{tr(lang, 'Balance', 'Bakiye')}</th>
                    <th scope="col">{tr(lang, 'Oldest unpaid', 'En eski borç')}</th>
                    <th scope="col">{tr(lang, 'Last payment', 'Son ödeme')}</th>
                    {manage && <th scope="col">{tr(lang, 'Monthly due', 'Aylık aidat')}</th>}
                    <th scope="col">
                      <span className="sr-only">{tr(lang, 'Actions', 'İşlemler')}</span>
                    </th>
                  </tr>
                </thead>
                <tbody>
                  {accounts.map((row) => (
                    <tr
                      key={row.student.id}
                      className="clickable-row"
                      onClick={() => openAccount(row.student.id)}
                    >
                      <td>
                        <strong>{name(row.student)}</strong>
                        <small>{row.student.student_number}</small>
                      </td>
                      <td>
                        <div className="badge-row">{balanceBadges(row.balances)}</div>
                      </td>
                      <td>
                        {row.oldest ? (
                          <>
                            {date(row.oldest.due_on, lang)}
                            {row.overdue > 0 && (
                              <span
                                className={`badge ${row.overdue > 30 ? 'badge-red' : 'badge-orange'}`}
                              >
                                {tr(lang, `${row.overdue} days late`, `${row.overdue} gün gecikti`)}
                              </span>
                            )}
                          </>
                        ) : (
                          <span className="muted">—</span>
                        )}
                      </td>
                      <td>{row.lastPayment ? date(row.lastPayment, lang) : '—'}</td>
                      {manage && (
                        <td>
                          {(() => {
                            const plan = monthlyDue(row.student);
                            return plan.fee ? (
                              <>
                                {currency(plan.due, plan.code, lang)}
                                {plan.scholarship.value > 0 && (
                                  <small>
                                    {tr(lang, 'Scholarship', 'Burs')}{' '}
                                    {scholarshipText(
                                      plan.scholarship.type,
                                      plan.scholarship.value,
                                      plan.code,
                                      lang,
                                    )}
                                  </small>
                                )}
                              </>
                            ) : (
                              <span className="muted">—</span>
                            );
                          })()}
                        </td>
                      )}
                      <td>
                        <div className="row-actions">
                          {manage && (
                            <Button
                              variant="secondary"
                              onClick={(event) => {
                                event.stopPropagation();
                                openPayment(row.student.id);
                              }}
                            >
                              {tr(lang, 'Take payment', 'Ödeme al')}
                            </Button>
                          )}
                          <Button
                            variant="ghost"
                            onClick={(event) => {
                              event.stopPropagation();
                              openAccount(row.student.id);
                            }}
                          >
                            {tr(lang, 'Account', 'Hesap')}
                            <ChevronRight size={15} />
                          </Button>
                        </div>
                      </td>
                    </tr>
                  ))}
                </tbody>
              </table>
            </div>
          ) : (
            <EmptyState
              title={
                onlyDebtors
                  ? tr(lang, 'Nobody owes anything', 'Borcu olan öğrenci yok')
                  : tr(lang, 'No students found', 'Öğrenci bulunamadı')
              }
              description={
                onlyDebtors
                  ? tr(
                      lang,
                      'Untick “Only students who owe” to see every account.',
                      'Tüm hesapları görmek için “Sadece borçlular” seçimini kaldırın.',
                    )
                  : undefined
              }
            />
          ))}
        {tab === 'charges' &&
          (filteredCharges.length ? (
            <div className="table-wrap">
              <table className="data-table">
                <thead>
                  <tr>
                    <th scope="col">{tr(lang, 'Student', 'Öğrenci')}</th>
                    <th scope="col">{tr(lang, 'Description', 'Açıklama')}</th>
                    <th scope="col">{tr(lang, 'Due date', 'Son ödeme')}</th>
                    <th scope="col">{tr(lang, 'Amount', 'Tutar')}</th>
                    <th scope="col">{tr(lang, 'Remaining', 'Kalan')}</th>
                    <th scope="col">{tr(lang, 'Status', 'Durum')}</th>
                    {manage && <th scope="col">{tr(lang, 'Action', 'İşlem')}</th>}
                  </tr>
                </thead>
                <tbody>
                  {filteredCharges.map((charge) => (
                    <tr key={charge.id}>
                      <td>
                        <strong>{studentName(data, charge.student_id)}</strong>
                      </td>
                      <td>
                        {chargeTitle(charge)}
                        {charge.discount_type && (
                          <small className="muted">
                            {' '}
                            {tr(lang, 'Scholarship', 'Burs')}{' '}
                            {scholarshipText(
                              charge.discount_type,
                              Number(charge.discount_value),
                              charge.currency,
                              lang,
                            )}{' '}
                            · {tr(lang, 'before', 'öncesi')}{' '}
                            {currency(Number(charge.gross_amount), charge.currency, lang)}
                          </small>
                        )}
                      </td>
                      <td>{date(charge.due_on, lang)}</td>
                      <td>{currency(Number(charge.amount), charge.currency, lang)}</td>
                      <td>
                        {currency(charge.voided_at ? 0 : remaining(charge), charge.currency, lang)}
                      </td>
                      <td>
                        <span
                          className={`badge ${charge.voided_at ? '' : remaining(charge) === 0 ? 'badge-active' : chargePaid(charge) > 0 ? 'badge-yellow' : 'badge-orange'}`}
                        >
                          {charge.voided_at
                            ? tr(lang, 'Voided', 'İptal')
                            : remaining(charge) === 0
                              ? tr(lang, 'Paid', 'Ödendi')
                              : chargePaid(charge) > 0
                                ? tr(lang, 'Partially paid', 'Kısmen ödendi')
                                : tr(lang, 'Outstanding', 'Ödenmedi')}
                        </span>
                      </td>
                      {manage && (
                        <td>
                          <div className="inline-actions">
                            {!charge.voided_at && (
                              <Button
                                variant="ghost"
                                onClick={() => {
                                  setVoidTarget(charge);
                                  setModal('void_charge');
                                }}
                              >
                                {tr(lang, 'Correct / void', 'Düzelt / iptal et')}
                              </Button>
                            )}
                            <Button
                              variant="danger"
                              disabled={action.busy}
                              onClick={() => void deleteCharge(charge)}
                            >
                              {tr(lang, 'Delete', 'Sil')}
                            </Button>
                          </div>
                        </td>
                      )}
                    </tr>
                  ))}
                </tbody>
              </table>
            </div>
          ) : (
            <EmptyState
              title={tr(lang, 'No charges yet', 'Henüz tahakkuk yok')}
              description={tr(
                lang,
                'Monthly dues will appear here after they are generated.',
                'Aylık aidatlar oluşturulduktan sonra burada görünecek.',
              )}
            />
          ))}
        {tab === 'payments' &&
          (filteredPayments.length ? (
            <div className="table-wrap">
              <table className="data-table">
                <thead>
                  <tr>
                    <th scope="col">{tr(lang, 'Student', 'Öğrenci')}</th>
                    <th scope="col">{tr(lang, 'Payment date', 'Ödeme tarihi')}</th>
                    <th scope="col">{tr(lang, 'Amount', 'Tutar')}</th>
                    <th scope="col">{tr(lang, 'Unallocated', 'Dağıtılmamış')}</th>
                    <th scope="col">{tr(lang, 'Reference', 'Referans')}</th>
                    <th scope="col">{tr(lang, 'Status', 'Durum')}</th>
                    {manage && <th scope="col">{tr(lang, 'Action', 'İşlem')}</th>}
                  </tr>
                </thead>
                <tbody>
                  {filteredPayments.map((payment) => (
                    <tr key={payment.id}>
                      <td>{studentName(data, payment.student_id)}</td>
                      <td>{date(payment.paid_on, lang)}</td>
                      <td>{currency(Number(payment.amount), payment.currency, lang)}</td>
                      <td>
                        {currency(
                          payment.voided_at ? 0 : unallocated(payment),
                          payment.currency,
                          lang,
                        )}
                      </td>
                      <td>{payment.reference || '—'}</td>
                      <td>
                        <span className={`badge ${payment.voided_at ? '' : 'badge-active'}`}>
                          {payment.voided_at
                            ? tr(lang, 'Voided', 'İptal')
                            : tr(lang, 'Recorded', 'Kaydedildi')}
                        </span>
                      </td>
                      {manage && (
                        <td>
                          <div className="inline-actions">
                            {!payment.voided_at && unallocated(payment) > 0 && (
                              <Button
                                variant="ghost"
                                onClick={() => {
                                  setVoidTarget(payment);
                                  setModal('allocate');
                                }}
                              >
                                {tr(lang, 'Allocate', 'Dağıt')}
                              </Button>
                            )}
                            {!payment.voided_at && (
                              <Button
                                variant="ghost"
                                onClick={() => {
                                  setVoidTarget(payment);
                                  setModal('void');
                                }}
                              >
                                {tr(lang, 'Correct / void', 'Düzelt / iptal et')}
                              </Button>
                            )}
                            <Button
                              variant="danger"
                              disabled={action.busy}
                              onClick={() => void deletePayment(payment)}
                            >
                              {tr(lang, 'Delete', 'Sil')}
                            </Button>
                          </div>
                        </td>
                      )}
                    </tr>
                  ))}
                </tbody>
              </table>
            </div>
          ) : (
            <EmptyState title={tr(lang, 'No payments recorded', 'Henüz ödeme kaydedilmedi')} />
          ))}
      </section>
      {confirmDialog}
      {modal === 'fee' && (
        <Modal
          title={tr(
            lang,
            'Set a student’s package & fee',
            'Öğrencinin paketini ve ücretini belirle',
          )}
          onClose={close}
          lang={lang}
          bare
        >
          <form
            onSubmit={(event) => {
              event.preventDefault();
              const values = formValues(event);
              const scholarship = Number(values.scholarship_value || 0);
              void action.run(
                () =>
                  api.save('students', {
                    id: values.student_id,
                    package_id: values.package_id || null,
                    monthly_fee: values.monthly_fee === '' ? null : Number(values.monthly_fee),
                    currency: values.currency,
                    scholarship_type: values.scholarship_type,
                    scholarship_percent: values.scholarship_type === 'percent' ? scholarship : 0,
                    scholarship_amount: values.scholarship_type === 'amount' ? scholarship : 0,
                  }),
                close,
              );
            }}
          >
            <div className="modal-body stack">
              <FormError error={action.error} />
              <label className="field">
                <span>{tr(lang, 'Student', 'Öğrenci')} *</span>
                <select
                  name="student_id"
                  value={feeStudent}
                  onChange={(event) => setFeeStudent(event.target.value)}
                  required
                >
                  <option value="">{tr(lang, 'Choose student', 'Öğrenci seçin')}</option>
                  {list(data, 'students')
                    .filter((student) => student.status !== 'archived')
                    .map((student) => (
                      <option key={student.id} value={student.id}>
                        {name(student)}
                      </option>
                    ))}
                </select>
              </label>
              <div className="stack" key={feeStudent}>
                <SelectField
                  label={tr(lang, 'Education package', 'Eğitim paketi')}
                  name="package_id"
                  defaultValue={
                    list(data, 'students').find((student) => student.id === feeStudent)
                      ?.package_id || ''
                  }
                  required
                >
                  <option value="">{tr(lang, 'Choose package', 'Paket seçin')}</option>
                  {list(data, 'packages')
                    .filter((pack) => pack.active !== false)
                    .map((pack) => (
                      <option key={pack.id} value={pack.id}>
                        {label(pack, lang)}
                      </option>
                    ))}
                </SelectField>
                <div className="form-grid">
                  <Field
                    label={tr(
                      lang,
                      'Monthly fee override (optional)',
                      'Özel aylık ücret (isteğe bağlı)',
                    )}
                    name="monthly_fee"
                    type="number"
                    min={0}
                    step="0.01"
                    defaultValue={
                      list(data, 'students').find((student) => student.id === feeStudent)
                        ?.monthly_fee ?? ''
                    }
                    placeholder={(() => {
                      // The package price applies when this stays empty.
                      const pack = list(data, 'packages').find(
                        (item) =>
                          item.id ===
                          list(data, 'students').find((student) => student.id === feeStudent)
                            ?.package_id,
                      );
                      return pack?.monthly_fee != null
                        ? `${tr(lang, 'Package price', 'Paket ücreti')}: ${currency(Number(pack.monthly_fee), pack.currency || 'EUR', lang)}`
                        : '';
                    })()}
                  />
                  <CurrencySelect
                    lang={lang}
                    name="currency"
                    defaultValue={
                      list(data, 'students').find((student) => student.id === feeStudent)?.currency
                    }
                  />
                  <SelectField
                    label={tr(lang, 'Scholarship type', 'Burs türü')}
                    name="scholarship_type"
                    defaultValue={
                      scholarshipOf(
                        list(data, 'students').find((student) => student.id === feeStudent),
                      ).type
                    }
                  >
                    <option value="percent">{tr(lang, 'Percentage (%)', 'Yüzde (%)')}</option>
                    <option value="amount">
                      {tr(lang, 'Fixed amount per month', 'Aylık sabit tutar')}
                    </option>
                  </SelectField>
                  <Field
                    label={tr(lang, 'Scholarship', 'Burs')}
                    name="scholarship_value"
                    type="number"
                    min={0}
                    step="0.01"
                    defaultValue={
                      scholarshipOf(
                        list(data, 'students').find((student) => student.id === feeStudent),
                      ).value
                    }
                  />
                </div>
              </div>
              <p className="form-hint">
                {tr(
                  lang,
                  'The monthly fee comes from the package price in School settings → Packages. Fill in the override only if this student pays a different price. The scholarship is taken off each monthly due. Existing charges stay unchanged.',
                  'Aylık ücret, Okul ayarları → Paketler’deki paket fiyatından gelir. Özel ücreti yalnızca bu öğrenci farklı bir fiyat ödüyorsa doldurun. Burs her aylık aidattan düşülür. Mevcut tahakkuklar değişmez.',
                )}
              </p>
            </div>
            <FormActions busy={action.busy} lang={lang} onCancel={close} />
          </form>
        </Modal>
      )}
      {modal === 'charge' && (
        <Modal
          title={tr(
            lang,
            'Add an enrollment or other charge',
            'Kayıt ücreti veya diğer tahakkuk ekle',
          )}
          onClose={close}
          lang={lang}
          bare
        >
          <form
            onSubmit={(event) => {
              event.preventDefault();
              if (!chargeForm.package_id && !String(chargeForm.note || '').trim()) {
                action.clear();
                return void action.run(() =>
                  Promise.reject(
                    new Error(
                      tr(
                        lang,
                        'Choose a package or enter a description.',
                        'Bir paket seçin veya açıklama girin.',
                      ),
                    ),
                  ),
                );
              }
              void action.run(
                () =>
                  api.rpc('create_charge', {
                    p_payload: {
                      ...chargeForm,
                      gross_amount: chargeGross,
                      discount_type: chargeForm.discount_type || null,
                      discount_value: chargeForm.discount_type
                        ? Number(chargeForm.discount_value || 0)
                        : null,
                    },
                  }),
                close,
              );
            }}
          >
            <div className="modal-body stack">
              <FormError error={action.error} />
              <label className="field">
                <span>{tr(lang, 'Student', 'Öğrenci')} *</span>
                <select
                  value={chargeForm.student_id}
                  onChange={(event) => {
                    const student = list(data, 'students').find(
                      (item) => item.id === event.target.value,
                    );
                    const packageId = student?.package_id || chargeForm.package_id;
                    // Fill in the package price and the student's scholarship; both stay editable.
                    setCharge({
                      student_id: event.target.value,
                      package_id: packageId,
                      currency: isCurrency(student?.currency)
                        ? student?.currency
                        : chargeForm.currency,
                      ...packagePrice(packageId),
                      ...studentScholarship(student),
                    });
                  }}
                  required
                >
                  <option value="">{tr(lang, 'Choose student', 'Öğrenci seçin')}</option>
                  {list(data, 'students')
                    .filter((student) => student.status !== 'archived')
                    .map((student) => (
                      <option key={student.id} value={student.id}>
                        {name(student)}
                      </option>
                    ))}
                </select>
              </label>
              <div className="form-grid">
                <SelectField
                  label={tr(lang, 'Academic year', 'Akademik yıl')}
                  value={chargeForm.academic_year_id}
                  onChange={(event) =>
                    setCharge({ academic_year_id: event.target.value, period_id: '' })
                  }
                  required
                >
                  <option value="">{tr(lang, 'Choose year', 'Yıl seçin')}</option>
                  {years.map((year) => (
                    <option key={year.id} value={year.id}>
                      {year.name}
                    </option>
                  ))}
                </SelectField>
                <SelectField
                  label={tr(lang, 'Package', 'Paket')}
                  value={chargeForm.package_id}
                  onChange={(event) =>
                    setCharge({
                      package_id: event.target.value,
                      ...packagePrice(event.target.value),
                    })
                  }
                >
                  <option value="">
                    {tr(lang, 'No package (other charge)', 'Paket yok (diğer tahakkuk)')}
                  </option>
                  {packages.map((pack) => (
                    <option key={pack.id} value={pack.id}>
                      {label(pack, lang)}
                    </option>
                  ))}
                </SelectField>
                <SelectField
                  label={tr(lang, 'Term (optional)', 'Dönem (isteğe bağlı)')}
                  value={chargeForm.period_id}
                  onChange={(event) => setCharge({ period_id: event.target.value })}
                >
                  <option value="">{tr(lang, 'Whole year', 'Tüm yıl')}</option>
                  {list(data, 'periods')
                    .filter((period) => period.academic_year_id === chargeForm.academic_year_id)
                    .sort((a, b) => Number(a.number) - Number(b.number))
                    .map((period) => (
                      <option key={period.id} value={period.id}>
                        {period.number}. {label(period, lang)}
                      </option>
                    ))}
                </SelectField>
                <Field
                  label={tr(lang, 'Due date', 'Son ödeme tarihi')}
                  type="date"
                  value={chargeForm.due_on}
                  onChange={(event) => setCharge({ due_on: event.target.value })}
                  required
                />
                <Field
                  label={tr(lang, 'Amount before scholarship', 'Burs öncesi tutar')}
                  type="number"
                  min="0.01"
                  step="0.01"
                  value={chargeForm.gross_amount}
                  onChange={(event) => setCharge({ gross_amount: event.target.value })}
                  required
                />
                <CurrencySelect
                  lang={lang}
                  name="currency"
                  value={chargeForm.currency}
                  onChange={(code) => setCharge({ currency: code })}
                />
                <SelectField
                  label={tr(lang, 'Scholarship', 'Burs')}
                  value={chargeForm.discount_type}
                  onChange={(event) =>
                    setCharge({ discount_type: event.target.value, discount_value: '' })
                  }
                >
                  <option value="">{tr(lang, 'No scholarship', 'Burs yok')}</option>
                  <option value="percent">{tr(lang, 'Percentage (%)', 'Yüzde (%)')}</option>
                  <option value="amount">{tr(lang, 'Fixed amount', 'Sabit tutar')}</option>
                </SelectField>
                {chargeForm.discount_type && (
                  <Field
                    label={
                      chargeForm.discount_type === 'percent'
                        ? tr(lang, 'Scholarship %', 'Burs %')
                        : tr(lang, 'Scholarship amount', 'Burs tutarı')
                    }
                    type="number"
                    min="0"
                    max={chargeForm.discount_type === 'percent' ? 100 : undefined}
                    step="0.01"
                    value={chargeForm.discount_value}
                    onChange={(event) => setCharge({ discount_value: event.target.value })}
                    required
                  />
                )}
              </div>
              <Field
                label={tr(lang, 'Additional description (optional)', 'Ek açıklama (isteğe bağlı)')}
                value={chargeForm.note}
                onChange={(event) => setCharge({ note: event.target.value })}
                maxLength={180}
              />
              <Field
                label={tr(lang, 'Amount payable', 'Ödenecek tutar')}
                type="number"
                min="0"
                step="0.01"
                value={
                  chargeForm.net_text ?? (chargeForm.gross_amount === '' ? '' : String(chargeNet))
                }
                onChange={(event) => {
                  const text = event.target.value;
                  const net = Number(text);
                  if (text === '' || !Number.isFinite(net)) {
                    setChargeForm((value) => ({ ...value, net_text: text }));
                    return;
                  }
                  // Changing what is payable turns the difference into a scholarship amount.
                  setChargeForm((value) => {
                    const gross = Number(value.gross_amount || 0);
                    return net >= gross || gross <= 0
                      ? {
                          ...value,
                          net_text: text,
                          gross_amount: text,
                          discount_type: '',
                          discount_value: '',
                        }
                      : {
                          ...value,
                          net_text: text,
                          discount_type: 'amount',
                          discount_value: String(Math.round((gross - net) * 100) / 100),
                        };
                  });
                }}
                onBlur={() => setChargeForm((value) => ({ ...value, net_text: undefined }))}
                hint={tr(
                  lang,
                  'The amount comes from the package price and the scholarship from the student’s fee settings. You can change any of them; if you change the payable amount, the difference is recorded as a scholarship amount.',
                  'Tutar paket fiyatından, burs öğrencinin ücret ayarından otomatik gelir. Hepsini değiştirebilirsiniz; ödenecek tutarı değiştirirseniz aradaki fark burs tutarı olarak yazılır.',
                )}
              />
              {chargeForm.discount_type && chargeNet <= 0 && (
                <p className="form-error">
                  {tr(
                    lang,
                    'A full scholarship needs no charge.',
                    'Tam burs için tahakkuk gerekmez.',
                  )}
                </p>
              )}
            </div>
            <FormActions busy={action.busy} lang={lang} onCancel={close} />
          </form>
        </Modal>
      )}
      {modal === 'dues' && (
        <Modal
          title={tr(lang, 'Generate monthly dues', 'Aylık aidat oluştur')}
          onClose={close}
          lang={lang}
          bare
        >
          <form
            onSubmit={(event) => {
              event.preventDefault();
              void action.run(
                async () => {
                  const result = await api.rpc('preview_monthly_dues', {
                    p_month: `${duesMonth}-01`,
                  });
                  setPreview(Array.isArray(result) ? result : result?.rows || []);
                },
                undefined,
                true,
              );
            }}
          >
            <div className="modal-body stack">
              <FormError error={action.error} />
              <label className="field">
                <span>{tr(lang, 'Billing month', 'Aidat ayı')}</span>
                <input
                  type="month"
                  value={duesMonth}
                  onChange={(event) => {
                    setDuesMonth(event.target.value);
                    setPreview(null);
                  }}
                  required
                />
              </label>
              <p className="form-hint">
                {tr(
                  lang,
                  'Preview new charges before posting them. Previously generated student-month charges are skipped.',
                  'Tahakkukları kaydetmeden önce inceleyin. Önceden oluşturulmuş öğrenci-ay kayıtları atlanır.',
                )}
              </p>
              <Button type="submit" disabled={action.busy} variant="secondary">
                <Search size={16} />
                {tr(lang, 'Preview charges', 'Tahakkukları önizle')}
              </Button>
              {preview && (
                <>
                  {preview.length ? (
                    <div className="table-wrap">
                      <table className="data-table">
                        <thead>
                          <tr>
                            <th scope="col">{tr(lang, 'Student', 'Öğrenci')}</th>
                            <th scope="col">{tr(lang, 'Amount', 'Tutar')}</th>
                            <th scope="col">{tr(lang, 'Due date', 'Son ödeme')}</th>
                          </tr>
                        </thead>
                        <tbody>
                          {preview.map((charge, index) => (
                            <tr key={charge.student_id || index}>
                              <td>{studentName(data, charge.student_id)}</td>
                              <td>{currency(Number(charge.amount), charge.currency, lang)}</td>
                              <td>{date(charge.due_on || charge.month, lang)}</td>
                            </tr>
                          ))}
                        </tbody>
                      </table>
                    </div>
                  ) : (
                    <p>
                      {tr(
                        lang,
                        'No new charges to generate. Check student fees and existing charges.',
                        'Oluşturulacak yeni tahakkuk yok. Öğrenci ücretlerini ve mevcut kayıtları kontrol edin.',
                      )}
                    </p>
                  )}
                </>
              )}
            </div>
            <div className="modal-actions">
              <Button onClick={close} variant="secondary">
                {tr(lang, 'Cancel', 'Vazgeç')}
              </Button>
              <Button
                variant="primary"
                disabled={action.busy || !preview?.length}
                onClick={() =>
                  void action.run(
                    () => api.rpc('generate_monthly_dues', { p_month: `${duesMonth}-01` }),
                    close,
                  )
                }
              >
                {tr(lang, 'Generate reviewed charges', 'İncelenen tahakkukları oluştur')}
              </Button>
            </div>
          </form>
        </Modal>
      )}
      {modal === 'account' &&
        accountId &&
        (() => {
          const student = list(data, 'students').find((item) => item.id === accountId);
          const row = accounts.find((item) => item.student.id === accountId);
          const balances =
            row?.balances ||
            [
              ...new Set(
                charges
                  .filter((charge) => charge.student_id === accountId && !charge.voided_at)
                  .map((charge) => String(charge.currency)),
              ),
            ].map((code) => ({ code, balance: 0 }));
          const pack = list(data, 'packages').find((item) => item.id === student?.package_id);
          const fee = Number(student?.monthly_fee ?? pack?.monthly_fee ?? 0);
          const feeCode =
            student?.monthly_fee != null ? student?.currency : pack?.currency || 'EUR';
          const scholarship = scholarshipOf(student);
          const open = openChargesOf(accountId);
          const studentPayments = validPayments
            .filter((payment) => payment.student_id === accountId)
            .sort((a, b) => String(b.paid_on).localeCompare(String(a.paid_on)));
          const credits = studentPayments.filter((payment) => unallocated(payment) > 0);
          return (
            <Modal
              title={`${name(student)} · ${tr(lang, 'Account', 'Hesap')}`}
              onClose={closeAccount}
              lang={lang}
              wide
              bare
            >
              <div className="modal-body stack">
                <FormError error={action.error} />
                <div className="account-summary">
                  <div>
                    <span className="muted">{tr(lang, 'Balance', 'Bakiye')}</span>
                    <div className="badge-row">
                      {balanceBadges(balances.length ? balances : [])}
                    </div>
                  </div>
                  <div>
                    <span className="muted">{tr(lang, 'Package', 'Paket')}</span>
                    <strong>{pack ? label(pack, lang) : '—'}</strong>
                  </div>
                  <div>
                    <span className="muted">{tr(lang, 'Monthly fee', 'Aylık ücret')}</span>
                    <strong>{fee ? currency(fee, feeCode, lang) : '—'}</strong>
                  </div>
                  {student?.scholarship_percent != null && (
                    <div>
                      <span className="muted">{tr(lang, 'Scholarship', 'Burs')}</span>
                      <strong>
                        {scholarshipText(scholarship.type, scholarship.value, feeCode, lang)}
                      </strong>
                    </div>
                  )}
                  {manage && fee > 0 && (
                    <div>
                      <span className="muted">{tr(lang, 'Monthly due', 'Aylık aidat')}</span>
                      <strong>{currency(monthlyDue(student).due, feeCode, lang)}</strong>
                    </div>
                  )}
                </div>
                {manage && (
                  <div className="row-actions">
                    <Button variant="primary" onClick={() => openPayment(accountId)}>
                      <Plus size={16} />
                      {tr(lang, 'Take payment', 'Ödeme al')}
                    </Button>
                    <Button variant="secondary" onClick={() => openCharge(accountId)}>
                      {tr(lang, 'Add charge', 'Tahakkuk ekle')}
                    </Button>
                    <Button variant="secondary" onClick={() => openFee(accountId)}>
                      {tr(lang, 'Edit fee', 'Ücreti düzenle')}
                    </Button>
                  </div>
                )}
                {manage &&
                  credits.map((payment) => {
                    const plan = autoAllocate(
                      accountId,
                      String(payment.currency),
                      unallocated(payment),
                    );
                    return plan.allocations.length ? (
                      <div className="note-box" key={payment.id}>
                        {tr(lang, 'Unused credit', 'Kullanılmamış alacak')}:{' '}
                        <strong>{currency(unallocated(payment), payment.currency, lang)}</strong> ·{' '}
                        {date(payment.paid_on, lang)}
                        <Button
                          variant="secondary"
                          disabled={action.busy}
                          onClick={() =>
                            void action.run(() =>
                              api.rpc('allocate_payment', {
                                p_payment_id: payment.id,
                                p_allocations: plan.allocations,
                              }),
                            )
                          }
                        >
                          {tr(lang, 'Apply to open charges', 'Krediyi dağıt')}
                        </Button>
                      </div>
                    ) : null;
                  })}
                <h3>{tr(lang, 'Open charges', 'Açık tahakkuklar')}</h3>
                {open.length ? (
                  <div className="table-wrap">
                    <table className="data-table">
                      <thead>
                        <tr>
                          <th scope="col">{tr(lang, 'Description', 'Açıklama')}</th>
                          <th scope="col">{tr(lang, 'Due', 'Son ödeme')}</th>
                          <th scope="col">{tr(lang, 'Amount', 'Tutar')}</th>
                          <th scope="col">{tr(lang, 'Remaining', 'Kalan')}</th>
                        </tr>
                      </thead>
                      <tbody>
                        {open.map((charge) => (
                          <tr key={charge.id}>
                            <td>{chargeTitle(charge)}</td>
                            <td>
                              {date(charge.due_on, lang)}
                              {charge.due_on < today() && (
                                <span className="badge badge-orange">
                                  {tr(lang, 'Late', 'Gecikmiş')}
                                </span>
                              )}
                            </td>
                            <td>{currency(Number(charge.amount), charge.currency, lang)}</td>
                            <td>
                              <strong>{currency(remaining(charge), charge.currency, lang)}</strong>
                            </td>
                          </tr>
                        ))}
                      </tbody>
                    </table>
                  </div>
                ) : (
                  <p className="muted">
                    {tr(lang, 'Nothing is outstanding.', 'Ödenmemiş tahakkuk yok.')}
                  </p>
                )}
                <h3>{tr(lang, 'Payments', 'Ödemeler')}</h3>
                {studentPayments.length ? (
                  <div className="table-wrap">
                    <table className="data-table">
                      <thead>
                        <tr>
                          <th scope="col">{tr(lang, 'Date', 'Tarih')}</th>
                          <th scope="col">{tr(lang, 'Amount', 'Tutar')}</th>
                          <th scope="col">{tr(lang, 'Reference', 'Referans')}</th>
                        </tr>
                      </thead>
                      <tbody>
                        {studentPayments.slice(0, 12).map((payment) => (
                          <tr key={payment.id}>
                            <td>{date(payment.paid_on, lang)}</td>
                            <td>{currency(Number(payment.amount), payment.currency, lang)}</td>
                            <td>{payment.reference || '—'}</td>
                          </tr>
                        ))}
                      </tbody>
                    </table>
                  </div>
                ) : (
                  <p className="muted">{tr(lang, 'No payments yet.', 'Henüz ödeme yok.')}</p>
                )}
              </div>
            </Modal>
          );
        })()}
      {modal === 'payment' && (
        <Modal title={tr(lang, 'Take a payment', 'Ödeme al')} onClose={close} lang={lang} bare>
          <form
            onSubmit={(event) => {
              event.preventDefault();
              const values = formValues(event);
              const amount = Number(values.amount);
              const chosen = charges.find((charge) => charge.id === values.charge_id);
              // Automatic: oldest open charges first. Manual: only the chosen charge.
              const allocations = manualCharge
                ? chosen
                  ? [
                      {
                        charge_id: chosen.id,
                        amount: round2(Math.min(amount, remaining(chosen))),
                      },
                    ]
                  : []
                : autoAllocate(values.student_id, values.currency, amount).allocations;
              void action.run(
                () =>
                  api.rpc('record_payment', {
                    p_student_id: values.student_id,
                    p_amount: amount,
                    p_currency: values.currency,
                    p_paid_on: values.paid_on,
                    p_reference: values.reference || null,
                    p_allocations: allocations,
                  }),
                close,
              );
            }}
          >
            <div className="modal-body stack">
              <FormError error={action.error} />
              <label className="field">
                <span>{tr(lang, 'Student', 'Öğrenci')} *</span>
                <select
                  name="student_id"
                  value={paymentStudent}
                  onChange={(event) => setPaymentStudent(event.target.value)}
                  required
                >
                  <option value="">{tr(lang, 'Choose student', 'Öğrenci seçin')}</option>
                  {list(data, 'students').map((student) => (
                    <option key={student.id} value={student.id}>
                      {name(student)}
                    </option>
                  ))}
                </select>
              </label>
              <div className="form-grid">
                <Field
                  label={tr(lang, 'Amount', 'Tutar')}
                  name="amount"
                  type="number"
                  step="0.01"
                  min="0.01"
                  value={paymentAmount}
                  onChange={(event) => setPaymentAmount(event.target.value)}
                  required
                />
                <CurrencySelect
                  lang={lang}
                  name="currency"
                  value={paymentCurrency}
                  onChange={setPaymentCurrency}
                />
                <Field
                  label={tr(lang, 'Payment date', 'Ödeme tarihi')}
                  name="paid_on"
                  type="date"
                  defaultValue={today()}
                  required
                />
              </div>
              {manualCharge ? (
                <SelectField
                  label={tr(lang, 'Allocate to charge', 'Tahakkuka bağla')}
                  name="charge_id"
                >
                  <option value="">
                    {tr(lang, 'Keep as unallocated credit', 'Dağıtılmamış bakiye olarak tut')}
                  </option>
                  {openChargesOf(paymentStudent, paymentCurrency).map((charge) => (
                    <option key={charge.id} value={charge.id}>
                      {chargeTitle(charge)} · {currency(remaining(charge), charge.currency, lang)}
                    </option>
                  ))}
                </SelectField>
              ) : (
                <div className="allocation-preview" aria-live="polite">
                  <strong>
                    {tr(
                      lang,
                      'This payment will be applied to:',
                      'Bu ödeme şu tahakkuklara dağıtılacak:',
                    )}
                  </strong>
                  {paymentPlan ? (
                    <>
                      {paymentPlan.allocations.map((item) => {
                        const charge = charges.find((entry) => entry.id === item.charge_id);
                        return (
                          <div className="allocation-line" key={item.charge_id}>
                            <span>{charge ? chargeTitle(charge) : '—'}</span>
                            <strong>{currency(item.amount, paymentCurrency, lang)}</strong>
                          </div>
                        );
                      })}
                      {!paymentPlan.allocations.length && (
                        <p className="muted">
                          {tr(
                            lang,
                            'No open charges in this currency.',
                            'Bu para biriminde açık tahakkuk yok.',
                          )}
                        </p>
                      )}
                      {paymentPlan.left > 0 && (
                        <p className="muted">
                          {tr(
                            lang,
                            `The remaining ${currency(paymentPlan.left, paymentCurrency, lang)} is kept as credit.`,
                            `Kalan ${currency(paymentPlan.left, paymentCurrency, lang)} alacak olarak kaydedilir.`,
                          )}
                        </p>
                      )}
                    </>
                  ) : (
                    <p className="muted">
                      {tr(
                        lang,
                        'Choose a student and enter an amount.',
                        'Öğrenci seçin ve tutar girin.',
                      )}
                    </p>
                  )}
                </div>
              )}
              <button
                type="button"
                className="text-button"
                onClick={() => setManualCharge((value) => !value)}
              >
                {manualCharge
                  ? tr(
                      lang,
                      'Apply automatically (oldest first)',
                      'Otomatik dağıt (en eskiden başla)',
                    )
                  : tr(lang, 'Choose the charge myself', 'Tahakkuku elle seç')}
              </button>
              <Field
                label={tr(lang, 'Reference / receipt', 'Referans / makbuz')}
                name="reference"
                maxLength={180}
              />
              <p className="form-hint">
                {tr(
                  lang,
                  'Partial payments are fine. Payments only apply to charges in the same currency.',
                  'Kısmi ödeme yapılabilir. Ödeme yalnızca aynı para birimindeki tahakkuklara dağıtılır.',
                )}
              </p>
            </div>
            <FormActions
              busy={action.busy}
              lang={lang}
              onCancel={close}
              submit={tr(lang, 'Take payment', 'Ödeme al')}
            />
          </form>
        </Modal>
      )}
      {modal === 'allocate' && voidTarget && (
        <Modal
          title={tr(lang, 'Allocate a payment', 'Ödemeyi tahakkuka dağıt')}
          onClose={close}
          lang={lang}
          bare
        >
          <form
            onSubmit={(event) => {
              event.preventDefault();
              const values = formValues(event);
              void action.run(
                () =>
                  api.rpc('allocate_payment', {
                    p_payment_id: voidTarget.id,
                    p_allocations: [{ charge_id: values.charge_id, amount: Number(values.amount) }],
                  }),
                close,
              );
            }}
          >
            <div className="modal-body stack">
              <FormError error={action.error} />
              <p>
                {studentName(data, voidTarget.student_id)} ·{' '}
                {currency(unallocated(voidTarget), voidTarget.currency, lang)}{' '}
                {tr(lang, 'available', 'kullanılabilir')}
              </p>
              <SelectField label={tr(lang, 'Charge', 'Tahakkuk')} name="charge_id" required>
                <option value="">{tr(lang, 'Choose charge', 'Tahakkuk seçin')}</option>
                {charges
                  .filter(
                    (charge) =>
                      charge.student_id === voidTarget.student_id &&
                      charge.currency === voidTarget.currency &&
                      !charge.voided_at &&
                      remaining(charge) > 0,
                  )
                  .map((charge) => (
                    <option key={charge.id} value={charge.id}>
                      {chargeTitle(charge)} · {currency(remaining(charge), charge.currency, lang)}
                    </option>
                  ))}
              </SelectField>
              <Field
                label={tr(lang, 'Amount to allocate', 'Dağıtılacak tutar')}
                name="amount"
                type="number"
                min="0.01"
                max={unallocated(voidTarget)}
                step="0.01"
                required
              />
            </div>
            <FormActions busy={action.busy} lang={lang} onCancel={close} />
          </form>
        </Modal>
      )}
      {modal === 'void_charge' && voidTarget && (
        <Modal
          title={tr(lang, 'Correct a charge', 'Tahakkuku düzelt')}
          onClose={close}
          lang={lang}
          bare
        >
          <form
            onSubmit={(event) => {
              event.preventDefault();
              const values = formValues(event);
              void action.run(
                () =>
                  api.rpc('void_charge', { p_charge_id: voidTarget.id, p_reason: values.reason }),
                close,
              );
            }}
          >
            <div className="modal-body stack">
              <FormError error={action.error} />
              <p>
                {studentName(data, voidTarget.student_id)} ·{' '}
                {currency(Number(voidTarget.amount), voidTarget.currency, lang)}
              </p>
              <p className="muted">
                {tr(
                  lang,
                  'Void any allocated payment first. The original charge stays in the audit history; add a replacement afterwards if needed.',
                  'Önce bağlı ödemeleri iptal edin. Orijinal tahakkuk denetim geçmişinde kalır; gerekirse daha sonra yenisini ekleyin.',
                )}
              </p>
              <TextArea
                label={tr(lang, 'Correction reason', 'Düzeltme nedeni')}
                name="reason"
                required
              />
            </div>
            <FormActions
              busy={action.busy}
              lang={lang}
              onCancel={close}
              submit={tr(lang, 'Void charge', 'Tahakkuku iptal et')}
            />
          </form>
        </Modal>
      )}
      {modal === 'void' && voidTarget && (
        <Modal
          title={tr(lang, 'Correct a payment', 'Ödemeyi düzelt')}
          onClose={close}
          lang={lang}
          bare
        >
          <form
            onSubmit={(event) => {
              event.preventDefault();
              const values = formValues(event);
              void action.run(
                () =>
                  api.rpc('void_payment', { p_payment_id: voidTarget.id, p_reason: values.reason }),
                close,
              );
            }}
          >
            <div className="modal-body stack">
              <FormError error={action.error} />
              <p>
                {studentName(data, voidTarget.student_id)} ·{' '}
                <strong>{currency(Number(voidTarget.amount), voidTarget.currency, lang)}</strong>
              </p>
              <p className="muted">
                {tr(
                  lang,
                  'This voids the payment and releases its allocations while keeping a full audit record. Record a replacement payment afterwards if needed.',
                  'Bu işlem ödemeyi iptal eder ve tahsislerini kaldırır; denetim kaydı korunur. Gerekirse ardından yeni ödeme kaydedin.',
                )}
              </p>
              <TextArea
                label={tr(lang, 'Reason for correction', 'Düzeltme nedeni')}
                name="reason"
                required
              />
            </div>
            <FormActions
              busy={action.busy}
              lang={lang}
              onCancel={close}
              submit={tr(lang, 'Void payment', 'Ödemeyi iptal et')}
            />
          </form>
        </Modal>
      )}
    </>
  );
}
