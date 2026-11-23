import { USERNAME_PATTERN, isUsernameAccount, normaliseUsername, toLoginEmail } from './accounts';
import { blankSnapshot } from './api';
import type { PortalApi, Profile, Snapshot, RecordRow } from './types';
import seededConfigurations from './data/demo-configurations.json';
import {
  SPECIALIST_SUBJECT,
  isSpecialistSubject,
  materialLessons,
  planDates,
  schoolDay,
  schoolTimezone,
} from './workflow';
// Fictional, in-memory demonstration. Never reads or writes the live database.
const id = () => crypto.randomUUID();
/** File types and size accepted for learning materials (same list as the storage bucket). */
export const MATERIAL_TYPES = [
  'application/pdf',
  'application/vnd.openxmlformats-officedocument.wordprocessingml.document',
  'application/vnd.openxmlformats-officedocument.presentationml.presentation',
  'application/vnd.openxmlformats-officedocument.spreadsheetml.sheet',
  'application/msword',
  'application/vnd.ms-powerpoint',
  'application/vnd.ms-excel',
  'image/jpeg',
  'image/png',
  'image/webp',
  'image/gif',
  'audio/mpeg',
  'audio/mp4',
  'audio/x-m4a',
  'audio/wav',
  'audio/x-wav',
  'audio/ogg',
];
export const MATERIAL_MAX_BYTES = 25 * 1024 * 1024;
const makeId = (n: number) => `00000000-0000-4000-8000-${String(n).padStart(12, '0')}`;
export const demoAdmin: Profile = {
  id: makeId(1),
  full_name: 'Admin · Demo',
  email: 'admin@example.invalid',
  roles: ['administrator'],
  language: 'en',
  active: true,
};
export const demoParent: Profile = {
  id: makeId(2),
  full_name: 'Zeynep Yılmaz · Demo',
  email: 'parent@example.invalid',
  roles: ['parent'],
  language: 'tr',
  active: true,
};
export const demoTeacher: Profile = {
  id: makeId(3),
  full_name: 'Aisha Hassan',
  email: 'teacher@example.invalid',
  // Also a parent, to show the "view as" switch for staff who have children at the school.
  roles: ['teacher', 'parent'],
  language: 'en',
  active: true,
};
export const gradingDefaults = seededConfigurations.grading;
export const triggerDefaults = seededConfigurations.triggers;
const initial = (): Snapshot => {
  const s = blankSnapshot();
  s.work_drafts = [];
  const now = new Date('2026-10-17T12:00:00Z');
  const day = (offset: number) => new Date(now.getTime() + offset * 86400000).toISOString();
  s.profiles = [
    demoAdmin,
    demoParent,
    demoTeacher,
    {
      id: makeId(4),
      full_name: 'Elif Demir',
      email: 'elif@example.invalid',
      roles: ['teacher', 'guidance'],
      language: 'tr',
      active: true,
    },
  ];
  s.school_settings = [
    { id: true as any, name: 'School Portal', timezone: 'Europe/Warsaw', default_language: 'tr' },
  ];
  s.academic_years = [
    {
      id: makeId(10),
      name: '2026–2027',
      starts_on: '2026-10-03',
      ends_on: '2027-06-27',
      active: true,
    },
    {
      id: makeId(19),
      name: '2025–2026',
      starts_on: '2025-09-01',
      ends_on: '2026-08-31',
      active: false,
    },
  ];
  s.periods = [1, 2, 3, 4, 5].map((n) => ({
    id: makeId(10 + n),
    academic_year_id: makeId(10),
    number: n,
    name_en: n === 5 ? 'Summer School' : `Period ${n}`,
    name_tr: n === 5 ? 'Yaz Okulu' : `${n}. Dönem`,
    starts_on: n === 1 ? '2026-10-03' : null,
    ends_on: n === 1 ? '2026-12-01' : null,
  }));
  s.subjects = [
    ['B1', 'Language Skills', 'Dil Becerileri'],
    ['B2', 'History', 'Tarih'],
    ['B3', 'Stories & Biographies', 'Hikâyeler ve Biyografiler'],
    ['B4', 'Values Education', 'Değerler Eğitimi'],
    ['B5', 'Knowledge Track', 'Bilgi Rotası'],
    ['B6', 'Guidance', 'Rehberlik'],
  ].map(([code, name_en, name_tr], i) => ({
    id: makeId(20 + i),
    code,
    name_en,
    name_tr,
    active: true,
  }));
  s.levels = [
    ...['C1', 'C2', 'C3', 'T1', 'T2', 'T3'].map((code, i) => ({
      id: makeId(30 + i),
      code,
      name_en: code,
      name_tr: code,
      kind: 'specialist',
      active: true,
    })),
    ...[
      ['beginner', 'Beginner', 'Başlangıç'],
      ['intermediate', 'Intermediate', 'Orta'],
      ['advanced', 'Advanced', 'İleri'],
    ].map(([code, name_en, name_tr], i) => ({
      id: makeId(36 + i),
      code,
      name_en,
      name_tr,
      kind: 'class',
      active: true,
    })),
  ];
  s.packages = [
    ['full', 'Full Package', 'Tam Paket', 7, 70],
    ['specialist', 'Specialist School', 'Uzmanlık Okulu', 2, 45],
    ['weekend', 'Weekend School', 'Hafta Sonu Okulu', 5, 45],
  ].map(([code, name_en, name_tr, weekly_lessons, monthly_fee], i) => ({
    id: makeId(40 + i),
    code,
    name_en,
    name_tr,
    weekly_lessons,
    monthly_fee,
    currency: 'EUR',
    active: true,
  }));
  s.package_subjects = s.packages.flatMap((p) =>
    s.subjects
      // Rehberlik (B6) is added to packages by the school, as in the live migration.
      .filter((x) => x.code !== 'B6')
      .filter((x) => p.code === 'full' || (p.code === 'specialist' ? x.code === 'B1' : x.code !== 'B1'))
      .map((x) => ({ id: `${p.id}-${x.id}`, package_id: p.id, subject_id: x.id })),
  );
  const names = [
    ['Yusuf', 'Yılmaz', 'tr'],
    ['Zehra', 'Yılmaz', 'tr'],
    ['Adam', 'Rahman', 'en'],
    ['Maryam', 'Khan', 'en'],
    ['Ömer', 'Kaya', 'tr'],
    ['Elif', 'Aydın', 'tr'],
    ['Ibrahim', 'Ali', 'en'],
    ['Sara', 'Ahmed', 'en'],
    ['Zeynep', 'Arslan', 'tr'],
    ['Hamza', 'Hassan', 'en'],
    ['Asya', 'Demir', 'tr'],
    ['Musa', 'Patel', 'en'],
  ];
  s.students = names.map(([first_name, last_name, language], i) => ({
    id: makeId(100 + i),
    student_number: 'ST-' + String(i + 1).padStart(6, '0'),
    // One full-name field, as on the live database.
    first_name: `${first_name} ${last_name}`,
    last_name: null,
    language,
    // Every third child was registered by age only, so the birth date is 1 January.
    dob: i % 3 === 1 ? `${2015 + (i % 5)}-01-01` : `${2015 + (i % 5)}-0${1 + (i % 8)}-12`,
    dob_estimated: i % 3 === 1,
    country: ['Poland', 'Türkiye', 'Germany', 'United Kingdom'][i % 4],
    contact_teacher_id: i % 2 ? makeId(4) : demoTeacher.id,
    registration_type: i % 4 === 0 ? 'returning' : 'new',
    registration_year_id: i % 4 === 0 ? makeId(19) : makeId(10),
    class_level_id: makeId(36 + (i % 3)),
    scholarship_percent: [0, 0, 25, 50, 100][i % 5],
    staff_notes: i === 2 ? 'Prefers weekend lessons. (fictional note)' : '',
    parent_name: i < 2 ? 'Zeynep Yılmaz' : `Parent ${last_name}`,
    parent_email: `family${i < 2 ? 0 : i}@example.invalid`,
    parent_phone: '+44 0000 000000',
    student_phone: '',
    registered_at: '2026-10-03T09:00:00Z',
    status: i === 4 ? 'support' : 'active',
    package_id: makeId(40 + (i % 3)),
    monthly_fee: i % 3 === 0 ? 70 : 45,
    currency: i === 3 ? 'PLN' : 'EUR',
  }));
  s.guardians = s.students
    .slice(0, 2)
    .map((x) => ({ id: x.id, student_id: x.id, profile_id: demoParent.id }))
    .concat(
      s.students
        .slice(2, 3)
        .map((x) => ({ id: `${x.id}-t`, student_id: x.id, profile_id: demoTeacher.id })),
    );
  s.classes = [
    {
      id: makeId(50),
      group_id: makeId(60),
      name: 'Little Explorers',
      language: 'en',
      subject_id: makeId(20),
      level_id: makeId(30),
      teacher_id: makeId(3),
      academic_year_id: makeId(10),
      weekday: 6,
      start_time: '10:00',
      zoom_url: 'https://zoom.us',
      active: true,
    },
    {
      id: makeId(51),
      group_id: makeId(61),
      name: 'Minik Yıldızlar - Değerler Eğitimi',
      language: 'tr',
      subject_id: makeId(23),
      // Takes the class level (Orta); only the specialist lesson has its own C/T level.
      level_id: null,
      teacher_id: makeId(4),
      academic_year_id: makeId(10),
      weekday: 0,
      start_time: '11:00',
      zoom_url: 'https://zoom.us',
      active: true,
    },
    {
      // A second lesson in the same class group, taught by the demo teacher.
      id: makeId(52),
      group_id: makeId(61),
      name: 'Minik Yıldızlar - Uzmanlık',
      language: 'tr',
      subject_id: makeId(20),
      level_id: makeId(33),
      teacher_id: makeId(3),
      academic_year_id: makeId(10),
      weekday: 0,
      start_time: '12:00',
      zoom_url: 'https://zoom.us',
      active: true,
    },
  ];
  s.package_classes = [];
  s.package_levels = [];
  s.class_groups = [
    {
      id: makeId(60),
      name: 'Little Explorers',
      academic_year_id: makeId(10),
      language: 'en',
      level_id: makeId(36),
      active: true,
    },
    {
      id: makeId(61),
      name: 'Minik Yıldızlar',
      academic_year_id: makeId(10),
      language: 'tr',
      level_id: makeId(37),
      active: true,
    },
  ];
  s.enrollments = s.students.map((x, i) => ({
    id: makeId(200 + i),
    student_id: x.id,
    class_id: makeId(50 + (x.language === 'tr' ? 1 : 0)),
    started_on: '2026-10-03',
    ended_on: null,
  }));
  s.classes = s.classes.map((c) => ({
    ...c,
    plan_starts_on: null,
    plan_ends_on: null,
    plan_skip_weeks: [],
  }));
  s.class_slots = s.classes.map((c, i) => ({
    id: makeId(880 + i),
    class_id: c.id,
    weekday: c.weekday,
    start_time: c.start_time,
    duration_minutes: 30,
  }));
  s.curriculum_weeks = [];
  s.learning_materials = [
    {
      id: makeId(900),
      class_id: null,
      subject_id: makeId(23),
      level_id: null,
      group_id: null,
      package_id: null,
      title: 'Sevgi ve saygı hikâyesi (video)',
      owner_id: makeId(3),
      object_key: null,
      external_url: 'https://www.youtube.com/watch?v=schoolportal-demo',
      link_kind: 'youtube',
      file_type: null,
      file_size: null,
      version: 1,
      replaces_id: null,
      status: 'ready',
      visible_to_guardians: true,
      week_no: 1,
      criterion_ids: ['B4.1'],
      created_at: '2026-10-05T09:00:00Z',
    },
  ];
  s.sessions = s.classes.flatMap((c, i) =>
    [-14, -7, 0, 7].map((d, n) => ({
      id: makeId(300 + i * 10 + n),
      class_id: c.id,
      starts_at: day(d).slice(0, 10) + `T${i === 0 ? '10' : '11'}:00:00Z`,
      duration_minutes: 30,
      status: d < 0 ? 'completed' : 'scheduled',
    })),
  );
  s.attendance = s.sessions
    .filter((x) => x.status === 'completed')
    .flatMap((x) =>
      s.enrollments
        .filter((e) => e.class_id === x.class_id)
        .map((e, i) => ({
          id: id(),
          session_id: x.id,
          student_id: e.student_id,
          status: i === 2 ? 'absent' : 'present',
          excused: false,
          participation: 4,
          camera_issue: false,
          microphone_issue: false,
          late_minutes: 0,
        })),
    );
  s.configurations = [
    {
      id: makeId(400),
      kind: 'grading',
      name: 'School grading',
      version: 1,
      status: 'published',
      body: structuredClone(gradingDefaults),
    },
    {
      id: makeId(401),
      kind: 'triggers',
      name: 'Guidance rules',
      version: 1,
      status: 'published',
      body: structuredClone(triggerDefaults),
    },
    {
      id: makeId(402),
      kind: 'assessment',
      name: 'Learning & development',
      version: 1,
      status: 'published',
      body: structuredClone(seededConfigurations.assessment),
    },
  ];
  s.guidance_cases = [
    {
      id: makeId(500),
      student_id: makeId(104),
      class_id: makeId(51),
      reason: 'Participation needs a little encouragement',
      severity: 'orange',
      status: 'new',
      source: 'auto',
      issue_key: 'participation',
      created_at: day(-1),
      review_due_at: day(1),
      assignee_id: null,
      evidence: { observations: 3 },
      overdue: false,
    },
    {
      id: makeId(501),
      student_id: makeId(106),
      class_id: makeId(50),
      reason: 'Teacher requested a family conversation',
      severity: 'yellow',
      status: 'plan_active',
      source: 'manual',
      issue_key: 'manual',
      created_at: day(-4),
      review_due_at: day(-2),
      reviewed_at: day(-3),
      follow_up_at: day(10),
      assignee_id: makeId(4),
      evidence: {},
      overdue: false,
    },
  ];
  s.guidance_cases = s.guidance_cases.map((record) => ({
    ...record,
    report_topic: record.reason,
    description:
      record.source === 'manual'
        ? 'A short conversation with the family will help us agree on the next support steps.'
        : '',
    workflow_stage: record.status === 'plan_active' ? 'plan' : 'new',
    reporting_teacher_id: s.classes.find((group) => group.id === record.class_id)?.teacher_id,
    workflow_updated_at: record.created_at,
    reassessment_due_at: null,
    closed_at: null,
  }));
  s.guidance_stage_events = [];
  // A plan already shared with the demo parent, so the parent timeline has content.
  s.guidance_cases.push({
    id: makeId(502),
    student_id: makeId(100),
    class_id: makeId(50),
    reason: 'Reading confidence',
    report_topic: 'Reading confidence',
    description: '',
    severity: 'yellow',
    status: 'follow_up',
    workflow_stage: 'follow_up',
    source: 'manual',
    issue_key: 'manual',
    created_at: day(-12),
    review_due_at: day(-10),
    reviewed_at: day(-11),
    follow_up_at: day(9),
    assignee_id: makeId(4),
    evidence: {},
    overdue: false,
    reporting_teacher_id: demoTeacher.id,
    workflow_updated_at: day(-5),
    reassessment_due_at: null,
    closed_at: null,
  });
  s.guidance_notes = [
    {
      id: makeId(510),
      case_id: makeId(502),
      author_id: makeId(4),
      kind: 'action',
      shared: true,
      body: 'We agreed to read together for ten minutes each evening. The teacher will give a short reading task every Friday.',
      created_at: day(-8),
    },
    {
      id: makeId(511),
      case_id: makeId(502),
      author_id: makeId(4),
      kind: 'note',
      shared: true,
      body: 'Good progress this week: the reading task was completed on time.',
      created_at: day(-2),
    },
  ];
  s.parent_guidance = s.guidance_notes.map((note) => ({ ...note, student_id: makeId(100) }));
  s.charges = s.students.map((x, i) => ({
    id: makeId(600 + i),
    student_id: x.id,
    month: now.toISOString().slice(0, 7) + '-01',
    amount: x.monthly_fee,
    currency: x.currency,
    due_on: now.toISOString().slice(0, 7) + '-10',
    description: 'Monthly tuition',
    voided_at: null,
  }));
  s.payments = s.students.slice(0, 8).map((x, i) => ({
    id: makeId(700 + i),
    student_id: x.id,
    amount: x.monthly_fee,
    currency: x.currency,
    paid_on: day(-2).slice(0, 10),
    reference: 'Demo bank transfer',
    voided_at: null,
  }));
  s.allocations = s.payments.map((p, i) => ({
    id: id(),
    payment_id: p.id,
    charge_id: makeId(600 + i),
    amount: p.amount,
  }));
  return s;
};
let state = initial();
const demoFiles = new Map<string, File>();
export function createDemoApi(user: Profile): PortalApi {
  const has = (...allowed: string[]) => user.roles.some((role) => allowed.includes(role));
  const requireRole = (...allowed: string[]) => {
    if (!has(...allowed))
      throw new Error('Access denied in this demo role / Bu demo rolünde erişim yok');
  };
  const requireAdmin = () => requireRole('administrator');
  const requireStaff = () =>
    requireRole('administrator', 'academic_manager', 'teacher', 'guidance');
  const now = () => new Date().toISOString();
  const find = (table: string, key: string): RecordRow => {
    const row = state[table]?.find((item) => item.id === key);
    if (!row) throw new Error(`Record not found / Kayıt bulunamadı: ${table}`);
    return row;
  };
  const requireText = (value: unknown, minimum = 1) => {
    if (typeof value !== 'string' || value.trim().length < minimum)
      throw new Error('Complete the required text / Gerekli metni doldurun');
    return value.trim();
  };
  const money = (value: unknown) => {
    const amount = Number(value);
    if (
      !Number.isFinite(amount) ||
      amount <= 0 ||
      Math.abs(Math.round(amount * 100) - amount * 100) > 0.00001
    )
      throw new Error(
        'Enter a positive amount with at most two decimal places / En fazla iki ondalıklı pozitif tutar girin',
      );
    return amount;
  };
  const currencyCode = (value: unknown) => {
    const code = String(value || '').toUpperCase();
    if (!['EUR', 'PLN'].includes(code)) throw new Error('Currency must be EUR or PLN');
    return code;
  };
  const dateOnly = (value: unknown) => {
    if (
      typeof value !== 'string' ||
      !/^\d{4}-\d{2}-\d{2}$/.test(value) ||
      Number.isNaN(new Date(`${value}T12:00:00Z`).getTime()) ||
      new Date(`${value}T12:00:00Z`).toISOString().slice(0, 10) !== value
    )
      throw new Error('A valid date is required / Geçerli tarih gerekli');
    return value;
  };
  const audit = (action: string) =>
    state.audit_log.unshift({
      id: id(),
      action,
      actor_id: user.id,
      created_at: now(),
      entity_type: 'demo',
    });
  const put = (table: string, values: Record<string, any>) => {
    if (!Array.isArray(state[table])) throw new Error(`Unknown table: ${table}`);
    if (table === 'students') {
      const existing = state.students.find((student) => student.id === values.id);
      if ('student_number' in values && values.student_number !== existing?.student_number)
        throw new Error(
          'Student numbers are generated automatically and cannot be changed / Öğrenci numarası otomatik oluşturulur ve değiştirilemez',
        );
      const next =
        Math.max(
          0,
          ...state.students.map(
            (student) => Number(String(student.student_number || '').replace(/^ST-/, '')) || 0,
          ),
        ) + 1;
      values = {
        ...values,
        student_number: existing?.student_number || `ST-${String(next).padStart(6, '0')}`,
      };
    }
    if (
      table === 'guidance_cases' &&
      !state.guidance_cases.some((record) => record.id === values.id)
    ) {
      const teacher = state.profiles.find(
        (profile) => profile.id === values.created_by && profile.roles.includes('teacher'),
      );
      values = {
        workflow_stage: 'new',
        reporting_teacher_id:
          teacher?.id ||
          state.classes.find((group) => group.id === values.class_id)?.teacher_id ||
          null,
        reassessment_due_at: null,
        closed_at: null,
        workflow_updated_at: now(),
        description: '',
        ...values,
      };
    }
    const row: RecordRow = { id: id(), ...structuredClone(values) };
    let index = state[table].findIndex((item) => item.id === row.id);
    if (table === 'guardians')
      index = state.guardians.findIndex(
        (item) => item.student_id === row.student_id && item.profile_id === row.profile_id,
      );
    if (table === 'curriculum_weeks')
      index = state.curriculum_weeks.findIndex(
        (item) => item.class_id === row.class_id && item.criterion_id === row.criterion_id,
      );
    if (table === 'curriculum_progress')
      index = state.curriculum_progress.findIndex(
        (item) =>
          item.class_id === row.class_id &&
          item.configuration_id === row.configuration_id &&
          item.criterion_id === row.criterion_id,
      );
    if (index >= 0)
      state[table][index] = { ...state[table][index], ...row, id: state[table][index].id };
    else state[table].push(row);
    return structuredClone(index >= 0 ? state[table][index] : row);
  };
  const classAccess = (classId: string) => {
    const group = find('classes', classId);
    if (
      !has('administrator', 'academic_manager') &&
      !(has('teacher') && group.teacher_id === user.id)
    )
      throw new Error('This class is not assigned to you / Bu sınıf size atanmamış');
    return group;
  };
  const materialAccess = (material: Record<string, any>) => {
    if (has('administrator', 'academic_manager')) return;
    if (material.class_id) {
      classAccess(material.class_id);
      return;
    }
    if (
      !has('teacher') ||
      !materialLessons(material, state).some((c) => c.teacher_id === user.id && c.active !== false)
    )
      throw new Error('You do not teach this subject / Bu dersi okutmuyorsunuz');
  };
  const studentAccess = (studentId: string) => {
    const student = find('students', studentId);
    if (
      !has('administrator', 'academic_manager', 'guidance') &&
      !state.enrollments.some(
        (enrollment) =>
          enrollment.student_id === studentId &&
          !enrollment.ended_on &&
          state.classes.some(
            (group) => group.id === enrollment.class_id && group.teacher_id === user.id,
          ),
      )
    )
      throw new Error('This student is not assigned to you / Bu öğrenci size atanmamış');
    return student;
  };
  const caseAccess = (caseId: string) => {
    const record = find('guidance_cases', caseId);
    if (
      !has('administrator', 'academic_manager') &&
      !(has('guidance') && (!record.assignee_id || record.assignee_id === user.id))
    )
      throw new Error(
        'Only the case owner or management can update this case / Yalnızca kayıt sorumlusu veya yönetim bu kaydı güncelleyebilir',
      );
    return record;
  };
  const allocationTotal = (chargeId: string) =>
    state.allocations
      .filter(
        (allocation) =>
          allocation.charge_id === chargeId &&
          state.payments.some(
            (payment) => payment.id === allocation.payment_id && !payment.voided_at,
          ),
      )
      .reduce((total, allocation) => total + Number(allocation.amount), 0);
  const allocate = (payment: RecordRow, items: any[]) => {
    if (payment.voided_at || !Array.isArray(items))
      throw new Error(
        'An active payment and allocation list are required / Aktif ödeme ve tahsis listesi gerekli',
      );
    let allocated = state.allocations
      .filter((row) => row.payment_id === payment.id)
      .reduce((total, row) => total + Number(row.amount), 0);
    for (const item of items) {
      const charge = find('charges', item.charge_id);
      const amount = money(item.amount);
      if (
        charge.voided_at ||
        charge.student_id !== payment.student_id ||
        charge.currency !== payment.currency
      )
        throw new Error(
          'Allocation must match the student and currency of an active charge / Tahsis, aktif borcun öğrencisi ve para birimiyle eşleşmeli',
        );
      if (
        allocationTotal(charge.id) + amount > Number(charge.amount) + 0.00001 ||
        allocated + amount > Number(payment.amount) + 0.00001
      )
        throw new Error(
          'Allocation exceeds available credit or remaining charge / Tahsis kullanılabilir bakiye veya kalan borcu aşıyor',
        );
      const existing = state.allocations.find(
        (row) => row.charge_id === charge.id && row.payment_id === payment.id,
      );
      put('allocations', {
        ...(existing || {}),
        payment_id: payment.id,
        charge_id: charge.id,
        amount: amount + Number(existing?.amount || 0),
      });
      allocated += amount;
    }
  };
  const validateConfiguration = (kind: string, body: any) => {
    if (!body || typeof body !== 'object')
      throw new Error('Configuration is required / Yapılandırma gerekli');
    if (kind === 'assessment') {
      if (!Array.isArray(body.questions) || !body.questions.length)
        throw new Error('Add at least one question / En az bir soru ekleyin');
      const seen = new Set<string>();
      for (const question of body.questions) {
        if (seen.has(question.id) || !question.id)
          throw new Error('Question identifiers must be unique / Soru kimlikleri benzersiz olmalı');
        seen.add(question.id);
        requireText(question.label_en);
        requireText(question.label_tr);
        if (!['text', 'number', 'score', 'boolean', 'choice', 'date'].includes(question.type))
          throw new Error('Unsupported question type / Desteklenmeyen soru türü');
        if (
          !['A4', 'A5', 'A6', 'custom'].includes(question.form) &&
          !(question.subject_code && question.form === question.subject_code)
        )
          throw new Error(
            'Use a discipline form or the academic subject code / Disiplin formunu veya akademik ders kodunu kullanın',
          );
        if (
          ['score', 'number'].includes(question.type) &&
          (Number(question.min) > Number(question.max) ||
            (question.type === 'score' && (Number(question.min) < 0 || Number(question.max) > 5)))
        )
          throw new Error('Invalid question score range / Geçersiz soru puan aralığı');
        if (
          question.type === 'choice' &&
          (!Array.isArray(question.choices) || !question.choices.length)
        )
          throw new Error('Choice questions need options / Seçimli sorularda seçenek gerekli');
      }
    } else if (kind === 'grading') {
      for (const key of ['overall', 'discipline', 'participation']) {
        const weights = Object.values(body[key] || {}).map(Number);
        if (
          !weights.length ||
          weights.some((weight) => !Number.isFinite(weight) || weight < 0) ||
          Math.abs(weights.reduce((sum, weight) => sum + weight, 0) - 1) > 0.00001
        )
          throw new Error(
            'Each weighting group must total 100% / Her ağırlık grubu toplamı %100 olmalı',
          );
      }
      if (!Array.isArray(body.bands) || body.bands.length < 1 || !body.attendance_scores)
        throw new Error(
          'Attendance scores and progress bands are required / Yoklama puanları ve gelişim aralıkları gerekli',
        );
      for (const band of body.bands) {
        requireText(band.label_en);
        requireText(band.label_tr);
      }
    } else if (kind === 'triggers') {
      const validMetrics = [
        'consecutive_absences',
        'attendance_average',
        'camera_incidents',
        'participation_average',
        'engagement_average',
        'behaviour_average',
        'behaviour_min',
        'subject_average',
        'academic_min',
        'overall_score',
      ];
      const condition = (node: any, depth = 0) => {
        if (!node || depth > 6) throw new Error('Invalid condition tree / Geçersiz koşul ağacı');
        if (node.all || node.any) {
          const children = node.all || node.any;
          if (!Array.isArray(children) || !children.length)
            throw new Error('Add a condition to this group / Gruba bir koşul ekleyin');
          children.forEach((child) => condition(child, depth + 1));
        } else if (
          !validMetrics.includes(node.metric) ||
          !['lt', 'lte', 'eq', 'gte', 'gt'].includes(node.operator) ||
          !Number.isFinite(Number(node.value))
        )
          throw new Error('Invalid trigger condition / Geçersiz tetikleyici koşulu');
      };
      if (!Array.isArray(body.rules))
        throw new Error('Guidance rules are required / Rehberlik kuralları gerekli');
      const ids = new Set<string>();
      for (const rule of body.rules) {
        if (!rule.id || ids.has(rule.id))
          throw new Error('Rule identifiers must be unique / Kural kimlikleri benzersiz olmalı');
        ids.add(rule.id);
        requireText(rule.label_en);
        requireText(rule.label_tr);
        if (!['red', 'orange', 'yellow'].includes(rule.severity))
          throw new Error('Invalid severity / Geçersiz öncelik');
        condition(rule.condition);
      }
    } else throw new Error('Unknown configuration kind / Bilinmeyen yapılandırma türü');
  };

  // Parent details are optional, as on the server; email is checked only when given.
  const validateStudentContact = (values: Record<string, any>) => {
    if (values.parent_email && !/^[^@\s]+@[^@\s]+\.[^@\s]+$/.test(values.parent_email))
      throw new Error('Parent email is not valid');
    const scholarship = Number(values.scholarship_percent ?? 0);
    if (!(scholarship >= 0 && scholarship <= 100))
      throw new Error('Scholarship must be 0–100% / Burs %0–100 arasında olmalı');
    if (!(Number(values.scholarship_amount ?? 0) >= 0))
      throw new Error('Scholarship amount must be positive / Burs tutarı pozitif olmalı');
  };

  const rpc = async (name: string, args: Record<string, any>): Promise<any> => {
    requireStaff();
    if (name === 'register_student') {
      requireRole('administrator', 'academic_manager');
      const payload = args.p_payload || {};
      requireText(payload.first_name);
      validateStudentContact(payload);
      dateOnly(payload.dob);
      if (payload.dob > now().slice(0, 10))
        throw new Error('Date of birth cannot be in the future / Doğum tarihi gelecekte olamaz');
      if (
        (Number(payload.scholarship_percent || 0) || Number(payload.scholarship_amount || 0)) &&
        !has('administrator')
      )
        throw new Error(
          'Only administrators can set scholarships / Bursu yalnızca yöneticiler belirleyebilir',
        );
      const row = put('students', {
        registration_type: 'new',
        scholarship_percent: 0,
        scholarship_type: 'percent',
        scholarship_amount: 0,
        dob_estimated: false,
        status: 'active',
        registered_at: now(),
        currency: 'EUR',
        ...payload,
      });
      for (const profileId of payload.guardian_ids || []) {
        const profile = find('profiles', profileId);
        if (!profile.roles.includes('parent'))
          throw new Error('Choose a parent account / Bir veli hesabı seçin');
        put('guardians', { student_id: row.id, profile_id: profileId });
      }
      return row;
    }
    if (name === 'link_guardian') {
      requireRole('administrator', 'academic_manager');
      find('students', args.p_student_id);
      const profile = find('profiles', args.p_profile_id);
      if (!profile.roles.includes('parent') || profile.active === false)
        throw new Error('An active parent account is required / Aktif veli hesabı gerekli');
      put('guardians', { student_id: args.p_student_id, profile_id: args.p_profile_id });
      return null;
    }
    if (
      [
        'get_work_draft',
        'save_work_draft',
        'discard_work_draft',
        'finalize_attendance',
        'finalize_assessment',
      ].includes(name)
    ) {
      const kind =
        name === 'finalize_attendance'
          ? 'attendance'
          : name === 'finalize_assessment'
            ? 'assessment'
            : args.p_kind;
      const context = name === 'finalize_attendance' ? args.p_session_id : args.p_context;
      let baseline: string | null = null;
      if (kind === 'attendance') {
        const session = find('sessions', context);
        classAccess(session.class_id);
        if (session.status === 'cancelled')
          throw new Error('Cancelled sessions cannot have attendance');
        if (
          schoolDay(session.starts_at, schoolTimezone(state)) >
          schoolDay(new Date(), schoolTimezone(state))
        )
          throw new Error('Future lessons cannot have attendance');
        baseline =
          state.attendance
            .filter((a) => a.session_id === context)
            .map((a) => a.updated_at)
            .filter(Boolean)
            .sort()
            .at(-1) || null;
      } else if (kind === 'assessment') {
        const [classId, studentId, periodId] = context.split(':');
        classAccess(classId);
        studentAccess(studentId);
        const period = find('periods', periodId);
        if (
          !period.starts_on ||
          !period.ends_on ||
          !state.enrollments.some(
            (e) =>
              e.class_id === classId &&
              e.student_id === studentId &&
              e.started_on <= period.ends_on &&
              (!e.ended_on || e.ended_on >= period.starts_on),
          )
        )
          throw new Error('Student is not enrolled in this reporting period');
        baseline =
          state.assessments.find(
            (a) =>
              a.class_id === classId &&
              a.student_id === studentId &&
              a.period_id === periodId &&
              a.teacher_id === user.id,
          )?.updated_at || null;
      } else throw new Error('Invalid draft context');
      const old = state.work_drafts.find(
        (d) => d.owner_id === user.id && d.kind === kind && d.context === context,
      );
      if (name === 'get_work_draft') return old ? structuredClone(old) : null;
      if ((old?.revision || 0) !== args.p_revision)
        throw new Error('Draft changed elsewhere. Reload the latest draft before saving.');
      if (name === 'discard_work_draft') {
        state.work_drafts = state.work_drafts.filter((d) => d.id !== old?.id);
        return null;
      }
      if (old && old.base_updated_at !== baseline)
        throw new Error('The submitted record changed. Reload before submitting.');
      if (name === 'save_work_draft')
        return put('work_drafts', {
          ...old,
          owner_id: user.id,
          kind,
          context,
          body: args.p_body,
          revision: (old?.revision || 0) + 1,
          base_updated_at: old?.base_updated_at ?? baseline,
          updated_at: now(),
        });
      if (!old) throw new Error('Draft not found');
      const result =
        kind === 'attendance'
          ? await rpc('save_attendance', { p_session_id: context, p_rows: old.body })
          : await rpc('save_assessment', { p_payload: { ...old.body, status: args.p_status } });
      state.work_drafts = state.work_drafts.filter((d) => d.id !== old.id);
      return result;
    }
    if (name === 'save_curriculum_batch') {
      classAccess(args.p_class_id);
      for (const row of args.p_rows)
        await api.save('curriculum_progress', {
          class_id: args.p_class_id,
          configuration_id: args.p_configuration_id,
          ...row,
        });
      return args.p_rows.length;
    }
    if (name === 'save_school_reference') {
      if (args.p_table === 'packages') requireAdmin();
      else requireRole('academic_manager', 'administrator');
      if (!['packages', 'class_groups'].includes(args.p_table))
        throw new Error('Unsupported school reference');
      const { specialist_level_id: specialistLevelRaw, ...values } = args.p_values || {};
      const hasSpecialistLevel = args.p_table === 'class_groups' && specialistLevelRaw !== undefined;
      const specialistLevel = hasSpecialistLevel ? specialistLevelRaw || null : null;
      if (specialistLevel && state.levels.find((level) => level.id === specialistLevel)?.kind !== 'specialist')
        throw new Error('Choose a specialist level / Uzmanlık seviyesi seçin');
      const row = await api.save(
        args.p_table,
        args.p_table === 'class_groups' ? values : args.p_values,
      );
      if (args.p_table === 'packages')
        await rpc('set_package_contents', {
          p_package_id: row.id,
          p_subject_ids: args.p_subject_ids,
          p_group_ids: args.p_group_ids,
          p_level_ids: args.p_level_ids,
        });
      else {
        await rpc('set_class_group_subjects', {
          p_group_id: row.id,
          p_subject_ids: args.p_subject_ids,
        });
        if (hasSpecialistLevel)
          for (const lesson of state.classes)
            if (
              lesson.group_id === row.id &&
              state.subjects.find((s) => s.id === lesson.subject_id)?.code === SPECIALIST_SUBJECT
            )
              lesson.level_id = specialistLevel;
      }
      return row.id;
    }
    if (name === 'enroll_student_batch') {
      requireRole('administrator', 'academic_manager');
      const student = find('students', args.p_student_id);
      if (
        student.status === 'archived' ||
        !Array.isArray(args.p_class_ids) ||
        !args.p_class_ids.length ||
        !args.p_started_on
      )
        throw new Error('Choose lessons and an enrollment date');
      let count = 0;
      for (const classId of args.p_class_ids) {
        const classroom = find('classes', classId);
        if (!classroom.active) throw new Error('Choose active lessons');
        if (
          !state.enrollments.some(
            (e) => e.student_id === student.id && e.class_id === classId && !e.ended_on,
          )
        ) {
          await api.save('enrollments', {
            student_id: student.id,
            class_id: classId,
            started_on: args.p_started_on,
          });
          count++;
        }
      }
      return count;
    }
    if (name === 'save_attendance') {
      const session = find('sessions', args.p_session_id);
      classAccess(session.class_id);
      if (session.status === 'cancelled')
        throw new Error('Cancelled sessions cannot have attendance');
      if (
        schoolDay(session.starts_at, schoolTimezone(state)) >
        schoolDay(new Date(), schoolTimezone(state))
      )
        throw new Error('Future lessons cannot have attendance');
      if (!Array.isArray(args.p_rows))
        throw new Error('Attendance rows are required / Yoklama satırları gerekli');
      for (const row of args.p_rows) {
        if (
          !state.enrollments.some(
            (enrollment) =>
              enrollment.student_id === row.student_id &&
              enrollment.class_id === session.class_id &&
              enrollment.started_on <= session.starts_at.slice(0, 10) &&
              (!enrollment.ended_on || enrollment.ended_on >= session.starts_at.slice(0, 10)),
          )
        )
          throw new Error(
            'The student was not enrolled for this lesson / Öğrenci bu derse kayıtlı değil',
          );
        if (!['present', 'late', 'absent'].includes(row.status))
          throw new Error('Invalid attendance status / Geçersiz yoklama durumu');
        if (row.excused) requireText(row.excuse_reason);
        if (row.status !== 'absent' && (row.participation === '' || row.participation == null))
          throw new Error('Participation is required for attendees');
        for (const key of ['participation', 'engagement', 'effort'])
          if (row[key] != null && (Number(row[key]) < 1 || Number(row[key]) > 5))
            throw new Error('Scores must be between 1 and 5 / Puanlar 1 ile 5 arasında olmalı');
        const old = state.attendance.find(
          (item) => item.session_id === session.id && item.student_id === row.student_id,
        );
        put('attendance', {
          ...old,
          ...row,
          participation: row.status === 'absent' ? null : Number(row.participation),
          session_id: session.id,
          recorded_by: user.id,
          updated_at: now(),
        });
      }
      put('sessions', { ...session, status: 'completed' });
      return null;
    }
    if (name === 'save_assessment') {
      const payload = args.p_payload || {};
      classAccess(payload.class_id);
      studentAccess(payload.student_id);
      const configuration = find('configurations', payload.configuration_id);
      if (configuration.kind !== 'assessment' || configuration.status !== 'published')
        throw new Error(
          'Choose a published assessment version / Yayınlanmış değerlendirme sürümü seçin',
        );
      const period = find('periods', payload.period_id);
      if (!period.starts_on || !period.ends_on)
        throw new Error(
          'Configure reporting period dates first / Önce dönem tarihlerini belirleyin',
        );
      const old = state.assessments.find(
        (row) =>
          row.student_id === payload.student_id &&
          row.class_id === payload.class_id &&
          row.period_id === payload.period_id &&
          row.teacher_id === user.id,
      );
      if (old && old.configuration_id !== payload.configuration_id)
        throw new Error('Existing submissions must keep their original configuration version');
      if (payload.status === 'submitted') {
        for (const question of configuration.body.questions.filter(
          (q: any) =>
            !q.subject_code ||
            q.subject_code === find('subjects', find('classes', payload.class_id).subject_id).code,
        )) {
          const answer = payload.answers?.[question.id];
          if (
            question.required &&
            answer?.taught !== false &&
            (answer?.value == null || answer.value === '')
          )
            throw new Error('Complete required answers before submitting');
        }
        for (const field of ['strengths', 'development_areas', 'parent_advice'])
          requireText(payload[field]);
      }
      return put('assessments', { ...old, ...payload, teacher_id: user.id, updated_at: now() }).id;
    }
    if (name === 'save_configuration') {
      requireAdmin();
      validateConfiguration(args.p_kind, args.p_body);
      const old = state.configurations.find(
        (configuration) => configuration.id === args.p_id && configuration.status === 'draft',
      );
      const row = put('configurations', {
        id: old?.id || id(),
        kind: args.p_kind,
        name: requireText(args.p_name),
        body: args.p_body,
        status: 'draft',
        version:
          old?.version ||
          Math.max(
            0,
            ...state.configurations
              .filter((configuration) => configuration.kind === args.p_kind)
              .map((configuration) => configuration.version),
          ) + 1,
      });
      return row.id;
    }
    if (name === 'publish_configuration') {
      requireAdmin();
      const configuration = find('configurations', args.p_id);
      if (configuration.status !== 'draft')
        throw new Error(
          'Published versions cannot be changed / Yayınlanan sürümler değiştirilemez',
        );
      validateConfiguration(configuration.kind, configuration.body);
      if (configuration.kind === 'assessment') {
        for (const question of configuration.body.questions) {
          if (
            question.subject_code &&
            !state.subjects.some((subject) => subject.code === question.subject_code)
          )
            throw new Error(
              'Create the subject before publishing its questions / Soruları yayınlamadan önce dersi oluşturun',
            );
          for (const published of state.configurations.filter(
            (row) => row.kind === 'assessment' && row.status === 'published',
          )) {
            const old = published.body.questions.find((item: any) => item.id === question.id);
            if (
              old &&
              (old.type !== question.type ||
                old.form !== question.form ||
                (old.subject_code || null) !== (question.subject_code || null))
            )
              throw new Error(
                'Use a new question ID when changing type, form or subject / Tür, form veya ders değişirken yeni soru kimliği kullanın',
              );
          }
        }
      }
      configuration.status = 'published';
      configuration.published_at = now();
      return null;
    }
    if (name === 'save_class_plan') {
      const lesson = classAccess(args.p_class_id);
      if (args.p_starts_on && args.p_ends_on && args.p_ends_on < args.p_starts_on)
        throw new Error('The end date is before the start date / Bitiş tarihi başlangıçtan önce');
      Object.assign(lesson, {
        plan_starts_on: args.p_starts_on || null,
        plan_ends_on: args.p_ends_on || null,
        plan_skip_weeks: [...new Set<number>((args.p_skip_weeks || []).map(Number))]
          .filter((w) => w >= 1 && w <= 60)
          .sort((a, b) => a - b),
      });
      state.class_slots = state.class_slots.filter((slot) => slot.class_id !== lesson.id);
      for (const slot of args.p_slots || [])
        state.class_slots.push({
          id: id(),
          class_id: lesson.id,
          weekday: Number(slot.weekday),
          start_time: String(slot.start_time).slice(0, 5),
          duration_minutes: Number(slot.duration_minutes) || 30,
        });
      return null;
    }
    if (name === 'plan_class_sessions') {
      const lesson = classAccess(args.p_class_id);
      const timezone = schoolTimezone(state);
      const year = state.academic_years.find((y) => y.id === lesson.academic_year_id);
      const slots = state.class_slots.filter((slot) => slot.class_id === lesson.id);
      const wanted = planDates(lesson, slots, year?.ends_on, timezone);
      const ownSessions = state.sessions.filter((x) => x.class_id === lesson.id);
      const same = (a: string, b: string) => new Date(a).getTime() === new Date(b).getTime();
      const toAdd = wanted.filter(
        (at) =>
          !ownSessions.some(
            (x) => same(x.starts_at, at) || (x.moved_from && same(x.moved_from, at)),
          ),
      );
      const removable = ownSessions.filter(
        (x) =>
          x.status === 'scheduled' &&
          x.planned &&
          new Date(x.starts_at) > new Date() &&
          !wanted.some((at) => same(x.starts_at, at)) &&
          !state.attendance.some((a) => a.session_id === x.id) &&
          !state.work_drafts.some((d) => d.kind === 'attendance' && d.context === x.id),
      );
      const keptPast = ownSessions.filter((x) => new Date(x.starts_at) <= new Date()).length;
      if (args.p_apply) {
        for (const at of toAdd) {
          const local = new Intl.DateTimeFormat('en-GB', {
            timeZone: timezone,
            hourCycle: 'h23',
            weekday: 'short',
            hour: '2-digit',
            minute: '2-digit',
          }).formatToParts(new Date(at));
          const time = `${local.find((p) => p.type === 'hour')?.value}:${local.find((p) => p.type === 'minute')?.value}`;
          const slot = slots.find((x) => String(x.start_time).slice(0, 5) === time);
          put('sessions', {
            class_id: lesson.id,
            starts_at: at,
            duration_minutes: slot?.duration_minutes || 30,
            status: 'scheduled',
            planned: true,
          });
        }
        state.sessions = state.sessions.filter((x) => !removable.includes(x));
      }
      return {
        to_add: toAdd,
        to_remove: removable.map((x) => x.starts_at),
        kept_past: keptPast,
        applied: Boolean(args.p_apply),
        reason: !lesson.plan_starts_on ? 'no_start' : undefined,
      };
    }
    // Deletes a class created by mistake; classes with any history must be archived instead.
    if (name === 'delete_class_group') {
      requireRole('administrator', 'academic_manager');
      const group = find('class_groups', args.p_id);
      const lessons = state.classes.filter((c) => c.group_id === group.id).map((c) => c.id);
      const used = [
        'enrollments',
        'sessions',
        'assessments',
        'curriculum_progress',
        'guidance_cases',
        'learning_materials',
      ].some((table) => state[table]?.some((row) => lessons.includes(row.class_id)));
      if (used) throw new Error('has_records');
      state.classes = state.classes.filter((c) => !lessons.includes(c.id));
      state.package_classes = (state.package_classes || []).filter(
        (row) => row.group_id !== group.id,
      );
      state.class_groups = state.class_groups.filter((row) => row.id !== group.id);
      return null;
    }
    // A class's subjects become its lessons, as on the server.
    if (name === 'set_class_group_subjects') {
      requireRole('administrator', 'academic_manager');
      const group = find('class_groups', args.p_group_id);
      const subjectIds = [...new Set((args.p_subject_ids || []) as string[])];
      let created = 0;
      for (const subjectId of subjectIds) {
        const subject = find('subjects', subjectId);
        const lesson = state.classes.find(
          (c) => c.group_id === group.id && c.subject_id === subjectId,
        );
        if (lesson) lesson.active = true;
        else {
          put('classes', {
            name: `${group.name} - ${subject.name_tr}`,
            academic_year_id: group.academic_year_id,
            subject_id: subjectId,
            // The specialist lesson has its own Specialist level; it does not copy the class level.
            level_id: subject.code === SPECIALIST_SUBJECT ? null : group.level_id || null,
            teacher_id: null,
            language: group.language || 'tr',
            active: true,
            group_id: group.id,
          });
          created++;
        }
      }
      for (const lesson of state.classes)
        if (lesson.group_id === group.id && !subjectIds.includes(lesson.subject_id))
          lesson.active = false;
      return created;
    }
    if (name === 'set_package_contents') {
      requireAdmin();
      find('packages', args.p_package_id);
      const sets: [string, string, string[]][] = [
        ['package_subjects', 'subject_id', args.p_subject_ids || []],
        ['package_classes', 'group_id', args.p_group_ids || []],
        ['package_levels', 'level_id', args.p_level_ids || []],
      ];
      for (const [table, column, ids] of sets) {
        state[table] = state[table].filter((row) => row.package_id !== args.p_package_id);
        for (const value of new Set(ids))
          put(table, { package_id: args.p_package_id, [column]: value });
      }
      return null;
    }
    if (name === 'set_package_subjects') {
      requireAdmin();
      find('packages', args.p_package_id);
      if (!Array.isArray(args.p_subject_ids) || !args.p_subject_ids.length)
        throw new Error('Select at least one subject / En az bir ders seçin');
      const subjectIds = [...new Set(args.p_subject_ids as string[])];
      for (const subjectId of subjectIds)
        if (find('subjects', subjectId).active === false)
          throw new Error('Choose active subjects / Aktif dersleri seçin');
      state.package_subjects = state.package_subjects.filter(
        (row) => row.package_id !== args.p_package_id,
      );
      for (const subjectId of subjectIds)
        put('package_subjects', { package_id: args.p_package_id, subject_id: subjectId });
      return null;
    }
    if (name === 'create_guidance_request') {
      const student = studentAccess(args.p_student_id);
      if (student.status === 'archived')
        throw new Error('Choose an active student / Aktif öğrenci seçin');
      const topic = requireText(args.p_report_topic, 3);
      const description = requireText(args.p_description, 3);
      if (topic.length > 200)
        throw new Error(
          'Report topic cannot exceed 200 characters / Rapor konusu 200 karakteri aşamaz',
        );
      if (description.length > 5000)
        throw new Error(
          'Description cannot exceed 5000 characters / Açıklama 5000 karakteri aşamaz',
        );
      if (!['red', 'orange', 'yellow'].includes(args.p_severity))
        throw new Error('Choose a risk color / Risk rengi seçin');
      const existing = state.guidance_cases.find(
        (record) =>
          record.student_id === student.id &&
          !record.class_id &&
          record.source === 'manual' &&
          String(record.report_topic || record.reason)
            .trim()
            .toLowerCase() === topic.toLowerCase() &&
          record.status !== 'resolved',
      );
      if (existing) {
        const rank: Record<string, number> = { yellow: 1, orange: 2, red: 3 };
        put('guidance_cases', {
          id: existing.id,
          report_topic: topic,
          description,
          reason: topic,
          severity:
            rank[args.p_severity] > rank[existing.severity] ? args.p_severity : existing.severity,
          last_detected_at: now(),
        });
        return existing.id;
      }
      return put('guidance_cases', {
        student_id: student.id,
        class_id: null,
        report_topic: topic,
        description,
        reason: topic,
        severity: args.p_severity,
        source: 'manual',
        status: 'new',
        created_at: now(),
        created_by: user.id,
        review_due_at: new Date(Date.now() + 48 * 3600000).toISOString(),
        issue_key: `manual-request:${topic.toLowerCase()}`,
        evidence: {},
      }).id;
    }
    if (name === 'refer_guidance') {
      studentAccess(args.p_student_id);
      const reason = requireText(args.p_reason, 3);
      if (
        args.p_class_id &&
        !state.enrollments.some(
          (enrollment) =>
            enrollment.class_id === args.p_class_id && enrollment.student_id === args.p_student_id,
        )
      )
        throw new Error('Student does not belong to this class / Öğrenci bu sınıfa kayıtlı değil');
      if (!['red', 'orange', 'yellow'].includes(args.p_severity))
        throw new Error('Invalid severity / Geçersiz öncelik');
      const existing = state.guidance_cases.find(
        (record) =>
          record.student_id === args.p_student_id &&
          (record.class_id || null) === (args.p_class_id || null) &&
          record.source === 'manual' &&
          record.reason.toLowerCase() === reason.toLowerCase() &&
          record.status !== 'resolved',
      );
      if (existing) {
        existing.last_detected_at = now();
        return existing.id;
      }
      return put('guidance_cases', {
        student_id: args.p_student_id,
        class_id: args.p_class_id,
        report_topic: reason,
        description: null,
        reason,
        severity: args.p_severity,
        source: 'manual',
        status: 'new',
        created_at: now(),
        created_by: user.id,
        review_due_at: new Date(Date.now() + 48 * 3600000).toISOString(),
        issue_key: id(),
      }).id;
    }
    if (name === 'advance_guidance_stage') {
      requireRole('administrator', 'academic_manager', 'guidance');
      const record = caseAccess(args.p_case_id);
      // Five steps, as on the server: new → review → plan → follow_up → resolved.
      const legacy: Record<string, string> = {
        teacher_meeting: 'review',
        parent_meeting: 'plan',
        agreed_actions: 'plan',
        reassessment: 'follow_up',
      };
      const stage = legacy[record.workflow_stage] || record.workflow_stage || 'new';
      const next = args.p_stage;
      const transitions: Record<string, string[]> = {
        new: ['review'],
        review: ['plan'],
        plan: ['follow_up'],
        follow_up: ['follow_up', 'resolved', 'management_review'],
        management_review: ['follow_up', 'closed_unresolved'],
      };
      if (!transitions[stage]?.includes(next))
        throw new Error(
          'Use the next permitted workflow action / Sıradaki izin verilen iş akışı adımını kullanın',
        );
      const note = requireText(args.p_note, 3);
      if (note.length > 5000)
        throw new Error('Notes cannot exceed 5000 characters / Notlar 5000 karakteri aşamaz');
      if (
        (stage === 'management_review' || next === 'closed_unresolved') &&
        !has('administrator', 'academic_manager')
      )
        throw new Error('Management must decide this outcome / Bu sonuca yönetim karar vermeli');
      let participant = record.reporting_teacher_id || null;
      if (next === 'review' && args.p_teacher_id) {
        participant = args.p_teacher_id;
        const teacher = find('profiles', participant);
        if (!teacher?.roles.includes('teacher'))
          throw new Error('Select the reporting teacher for the meeting');
      }
      let due = record.follow_up_at || null;
      if (next === 'follow_up') {
        due = args.p_follow_up_at || new Date(Date.now() + 14 * 86400000).toISOString();
        if (!Number.isFinite(new Date(due).getTime()) || new Date(due).getTime() <= Date.now())
          throw new Error('Choose a future follow-up date / Gelecekte bir takip tarihi seçin');
      } else if (['resolved', 'closed_unresolved'].includes(next)) due = null;
      const kind =
        next === 'review' && args.p_teacher_id
          ? 'teacher_meeting'
          : next === 'plan'
            ? 'action'
            : 'review';
      const entry = put('guidance_notes', {
        case_id: record.id,
        author_id: user.id,
        body: note,
        kind,
        shared: next === 'plan',
        created_at: now(),
      });
      if (entry.shared) put('parent_guidance', { ...entry, student_id: record.student_id });
      put('guidance_stage_events', {
        case_id: record.id,
        from_stage: stage,
        to_stage: next,
        note,
        actor_id: user.id,
        reporting_teacher_id: participant,
        created_at: now(),
      });
      const status =
        next === 'review'
          ? 'under_review'
          : next === 'plan'
            ? 'plan_active'
            : next === 'follow_up'
              ? 'follow_up'
              : next === 'management_review'
                ? 'escalated'
                : 'resolved';
      const result = put('guidance_cases', {
        id: record.id,
        workflow_stage: next,
        status,
        assignee_id: record.assignee_id || user.id,
        reporting_teacher_id: participant,
        reviewed_at: record.reviewed_at || now(),
        workflow_updated_at: now(),
        overdue: false,
        follow_up_at: due,
        outcome: ['resolved', 'closed_unresolved', 'management_review'].includes(next)
          ? note
          : record.outcome,
        no_improvement:
          next === 'management_review' ? true : next === 'resolved' ? false : record.no_improvement,
        escalated_at:
          next === 'management_review' ? record.escalated_at || now() : record.escalated_at,
        closed_at: ['resolved', 'closed_unresolved'].includes(next) ? now() : null,
      });
      if (next === 'management_review') find('students', record.student_id).status = 'support';
      return result;
    }
    if (name === 'update_guidance') {
      const record = caseAccess(args.p_case_id);
      if (['resolved', 'closed_unresolved'].includes(record.workflow_stage))
        throw new Error('Closed cases cannot be edited / Kapanmış kayıt düzenlenemez');
      if (record.status !== args.p_status)
        throw new Error(
          'Use the ordered workflow actions to change case status / Durum değiştirmek için sıralı iş akışı adımlarını kullanın',
        );
      if (args.p_assignee_id) {
        const assignee = find('profiles', args.p_assignee_id);
        if (
          assignee.active === false ||
          !assignee.roles.some((role: string) =>
            ['administrator', 'academic_manager', 'guidance'].includes(role),
          )
        )
          throw new Error(
            'Choose active guidance or management staff / Aktif rehberlik veya yönetim personeli seçin',
          );
      }
      if (
        has('guidance') &&
        !has('administrator', 'academic_manager') &&
        args.p_assignee_id !== user.id
      )
        throw new Error(
          'Guidance staff can assign cases to themselves / Rehberlik personeli kayıtları kendisine atayabilir',
        );
      if (
        record.workflow_stage === 'follow_up' &&
        (!args.p_follow_up_at || new Date(args.p_follow_up_at).getTime() <= Date.now())
      )
        throw new Error('Choose a future follow-up date / Gelecekte bir takip tarihi seçin');
      put('guidance_cases', {
        id: record.id,
        assignee_id: args.p_assignee_id,
        follow_up_at: args.p_follow_up_at,
        outcome: args.p_outcome || record.outcome,
      });
      return null;
    }
    if (name === 'add_guidance_note' || name === 'record_guidance_outcome') {
      const record = caseAccess(args.p_case_id);
      if (record.status === 'resolved')
        throw new Error('Resolved cases cannot receive notes / Çözülmüş kayda not eklenemez');
      const isOutcome = name === 'record_guidance_outcome';
      const kind = isOutcome ? 'review' : args.p_kind;
      if (!['note', 'teacher_meeting', 'parent_meeting', 'action', 'review'].includes(kind))
        throw new Error('Unknown activity type / Bilinmeyen etkinlik türü');
      const body = requireText(isOutcome ? args.p_outcome : args.p_body, 3);
      const row = put('guidance_notes', {
        case_id: record.id,
        body,
        kind,
        shared: !isOutcome && !!args.p_shared,
        created_at: now(),
        author_id: user.id,
      });
      if (row.shared) put('parent_guidance', { ...row, student_id: record.student_id });
      if (isOutcome) {
        record.no_improvement = !!args.p_no_improvement;
        record.outcome = body;
      }
      return isOutcome ? null : row.id;
    }
    if (name === 'preview_monthly_dues' || name === 'generate_monthly_dues') {
      requireAdmin();
      const month = dateOnly(args.p_month).slice(0, 7) + '-01';
      const rows = state.students
        .filter(
          (student) =>
            student.status !== 'archived' &&
            student.registered_at.slice(0, 7) <= month.slice(0, 7) &&
            !state.charges.some(
              (charge) =>
                charge.student_id === student.id && charge.month === month && !charge.voided_at,
            ),
        )
        .flatMap((student) => {
          const pack = state.packages.find((item) => item.id === student.package_id);
          const base = Number(student.monthly_fee ?? pack?.monthly_fee ?? 0);
          const byAmount = student.scholarship_type === 'amount';
          const discount = byAmount
            ? Number(student.scholarship_amount || 0)
            : Number(student.scholarship_percent || 0);
          const amount = Math.max(
            0,
            Math.round((byAmount ? base - discount : base * (1 - discount / 100)) * 100) / 100,
          );
          return amount > 0
            ? [
                {
                  student_id: student.id,
                  student_name: [student.first_name, student.last_name].filter(Boolean).join(' '),
                  amount,
                  gross_amount: base,
                  discount_type: discount ? (byAmount ? 'amount' : 'percent') : null,
                  discount_value: discount || null,
                  package_id: student.package_id || null,
                  currency: student.monthly_fee != null ? student.currency : pack?.currency,
                  month,
                  due_on: month,
                },
              ]
            : [];
        });
      if (name === 'preview_monthly_dues') return rows;
      for (const row of rows)
        put('charges', {
          ...row,
          description: 'Monthly tuition / Aylık eğitim ücreti',
          created_by: user.id,
          created_at: now(),
        });
      return rows.length;
    }
    if (name === 'create_charge' && args.p_payload) {
      requireAdmin();
      const p = args.p_payload;
      find('students', p.student_id);
      const gross = money(p.gross_amount);
      const year = p.academic_year_id ? find('academic_years', p.academic_year_id) : null;
      const term = p.period_id ? find('periods', p.period_id) : null;
      if (term && term.academic_year_id !== year?.id)
        throw new Error('The term does not belong to the selected academic year');
      const pack = p.package_id ? find('packages', p.package_id) : null;
      const note = String(p.note || '').trim();
      if (!pack && !note) throw new Error('Choose a package or enter a description');
      const value = Number(p.discount_value || 0);
      const type = p.discount_type && value ? p.discount_type : null;
      if (type === 'percent' && !(value >= 0 && value <= 100))
        throw new Error('Scholarship percentage must be between 0 and 100');
      const net =
        Math.round(
          (type === 'percent'
            ? gross * (1 - value / 100)
            : type === 'amount'
              ? gross - value
              : gross) * 100,
        ) / 100;
      if (net <= 0) throw new Error('Full scholarship – no charge needed');
      return put('charges', {
        student_id: p.student_id,
        amount: net,
        gross_amount: gross,
        discount_type: type,
        discount_value: type ? value : null,
        academic_year_id: year?.id || null,
        period_id: term?.id || null,
        package_id: pack?.id || null,
        currency: currencyCode(p.currency),
        due_on: dateOnly(p.due_on),
        description: [
          year?.name,
          pack && `${pack.name_en} / ${pack.name_tr}`,
          term && `${term.name_en} / ${term.name_tr}`,
          note,
        ]
          .filter(Boolean)
          .join(' · '),
        created_by: user.id,
        created_at: now(),
        month: null,
        voided_at: null,
      }).id;
    }
    if (name === 'create_charge') {
      requireAdmin();
      find('students', args.p_student_id);
      return put('charges', {
        student_id: args.p_student_id,
        amount: money(args.p_amount),
        currency: currencyCode(args.p_currency),
        due_on: dateOnly(args.p_due_on),
        description: requireText(args.p_description),
        created_by: user.id,
        created_at: now(),
        month: null,
        voided_at: null,
      }).id;
    }
    if (name === 'record_payment') {
      requireAdmin();
      find('students', args.p_student_id);
      const payment = put('payments', {
        student_id: args.p_student_id,
        amount: money(args.p_amount),
        currency: currencyCode(args.p_currency),
        paid_on: dateOnly(args.p_paid_on),
        reference: args.p_reference || '',
        recorded_by: user.id,
        created_at: now(),
        voided_at: null,
      });
      allocate(payment, args.p_allocations);
      return payment.id;
    }
    if (name === 'allocate_payment') {
      requireAdmin();
      allocate(find('payments', args.p_payment_id), args.p_allocations);
      return null;
    }
    if (name === 'void_payment' || name === 'void_charge') {
      requireAdmin();
      const row = find(
        name === 'void_payment' ? 'payments' : 'charges',
        args.p_payment_id || args.p_charge_id,
      );
      if (row.voided_at)
        throw new Error('This record is already void / Bu kayıt zaten iptal edilmiş');
      const reason = requireText(args.p_reason, 3);
      if (name === 'void_charge' && allocationTotal(row.id) > 0)
        throw new Error(
          'Void allocated payments before correcting this charge / Bu tahakkuku düzeltmeden önce bağlı ödemeleri iptal edin',
        );
      row.voided_at = now();
      row.void_reason = reason;
      return null;
    }
    if (name === 'delete_payment' || name === 'delete_charge') {
      // Same rules as the server: administrators only; a charge with an active payment
      // allocated to it cannot be deleted until that payment is deleted or voided.
      requireAdmin();
      const table = name === 'delete_payment' ? 'payments' : 'charges';
      const row = find(table, args.p_id);
      if (name === 'delete_charge' && allocationTotal(row.id) > 0)
        throw new Error(
          'has_payments: Delete or void the payments allocated to this charge first / Önce bu borca bağlı tahsilatları silin veya iptal edin',
        );
      const key = name === 'delete_payment' ? 'payment_id' : 'charge_id';
      state.allocations = state.allocations.filter((a) => a[key] !== row.id);
      state[table] = state[table].filter((r) => r.id !== row.id);
      return null;
    }
    if (
      [
        'preview_report',
        'generate_report',
        'submit_report',
        'publish_report',
        'delete_report',
      ].includes(name)
    )
      throw new Error(
        'Report calculation and publication require a connected Supabase database. Demo records cannot produce school reports. / Karne hesaplama ve yayınlama için Supabase bağlantısı gerekir.',
      );
    throw new Error(
      `This action requires the live database / Bu işlem canlı veritabanı gerektirir: ${name}`,
    );
  };

  const api: PortalApi = {
    mode: 'demo',
    async uploadMaterial(objectKey, file) {
      const material = state.learning_materials.find(
        (m) => m.object_key === objectKey && m.status === 'uploading' && m.owner_id === user.id,
      );
      if (!material) throw new Error('Access denied');
      materialAccess(material);
      if (!MATERIAL_TYPES.includes(file.type) || file.size > MATERIAL_MAX_BYTES || !file.size)
        throw new Error('Invalid material file');
      if (file.size !== material.file_size || file.type !== material.file_type)
        throw new Error('Choose the original file with the same size and type');
      const existingFile = demoFiles.get(objectKey);
      if (existingFile && (await existingFile.text()) !== (await file.text()))
        throw new Error('Material versions are immutable');
      demoFiles.set(objectKey, file);
    },
    async materialUrl(objectKey) {
      const visible = await api.snapshot();
      const material = visible.learning_materials.find(
        (m) => m.object_key === objectKey && m.status === 'ready',
      );
      const file = demoFiles.get(objectKey);
      if (!material || !file) throw new Error('Access denied');
      return URL.createObjectURL(file);
    },
    async snapshot() {
      const data = structuredClone(state);
      data.work_drafts = [];
      data.backup_runs = has('administrator') ? data.backup_runs : [];
      if (has('administrator')) return data;
      const parentOnly = has('parent') && !has('academic_manager', 'teacher', 'guidance');
      const studentIds = parentOnly
        ? data.guardians
            .filter((guardian) => guardian.profile_id === user.id)
            .map((guardian) => guardian.student_id)
        : has('academic_manager', 'guidance')
          ? data.students.map((student) => student.id)
          : data.enrollments
              .filter(
                (enrollment) =>
                  !enrollment.ended_on &&
                  data.classes.some(
                    (group) => group.id === enrollment.class_id && group.teacher_id === user.id,
                  ),
              )
              .map((enrollment) => enrollment.student_id);
      data.students = data.students.filter((student) => studentIds.includes(student.id));
      if (!parentOnly)
        data.students = data.students.map((student) => ({ ...student, monthly_fee: null }));
      if (parentOnly || !has('academic_manager'))
        data.students = data.students.map((student) => ({
          ...student,
          scholarship_percent: null,
          scholarship_type: null,
          scholarship_amount: null,
          ...(parentOnly ? { staff_notes: null } : {}),
        }));
      for (const table of [
        'guardians',
        'placements',
        'enrollments',
        'attendance',
        'assessments',
        'reports',
        'parent_reports',
        'guidance_cases',
        'parent_guidance',
        'charges',
        'payments',
      ])
        data[table] = data[table].filter((row) => studentIds.includes(row.student_id));
      data.classes = data.classes.filter(
        (group) =>
          data.enrollments.some((enrollment) => enrollment.class_id === group.id) ||
          group.teacher_id === user.id,
      );
      // Staff share every ready material; families see visible ones for their child's lessons.
      data.learning_materials = data.learning_materials.filter((m) => {
        if (!parentOnly) return m.status === 'ready' || m.owner_id === user.id;
        if (m.status !== 'ready' || m.visible_to_guardians === false) return false;
        const lessons = new Set(materialLessons(m, state).map((c) => c.id));
        return data.enrollments.some(
          (e) =>
            lessons.has(e.class_id) &&
            !e.ended_on &&
            data.students.some(
              (s) => s.id === e.student_id && (!m.package_id || s.package_id === m.package_id),
            ),
        );
      });
      data.sessions = data.sessions.filter((session) =>
        data.classes.some((group) => group.id === session.class_id),
      );
      data.class_groups = data.class_groups.filter((item) =>
        data.classes.some((group) => group.group_id === item.id),
      );
      data.allocations = data.allocations.filter((allocation) =>
        data.payments.some((payment) => payment.id === allocation.payment_id),
      );
      data.profiles = data.profiles.filter(
        (profile) =>
          profile.id === user.id ||
          data.classes.some((group) => group.teacher_id === profile.id) ||
          (!parentOnly && has('academic_manager', 'guidance')),
      );
      data.audit_log = [];
      data.notification_outbox = [];
      data.guidance_stage_events = data.guidance_stage_events.filter((event) =>
        data.guidance_cases.some(
          (record) =>
            record.id === event.case_id &&
            (has('academic_manager') || (has('guidance') && record.assignee_id === user.id)),
        ),
      );
      if (parentOnly) {
        data.assessments = [];
        data.reports = [];
        data.guidance_cases = [];
        data.guidance_notes = [];
        data.guidance_stage_events = [];
        data.configurations = [];
        data.placements = [];
        data.curriculum_progress = [];
        data.attendance = data.attendance.map(
          ({ id, session_id, student_id, status, excused, late_minutes }) => ({
            id,
            session_id,
            student_id,
            status,
            excused,
            late_minutes,
          }),
        );
      } else {
        data.charges = [];
        data.payments = [];
        data.allocations = [];
        data.guidance_notes = data.guidance_notes.filter((note) =>
          data.guidance_cases.some(
            (record) =>
              record.id === note.case_id &&
              (has('academic_manager') ||
                (has('guidance') && (!record.assignee_id || record.assignee_id === user.id)) ||
                note.shared),
          ),
        );
      }
      return data;
    },
    async save(table, values) {
      requireStaff();
      if (
        [
          'configurations',
          'reports',
          'parent_reports',
          'charges',
          'payments',
          'allocations',
          'guidance_cases',
          'guidance_notes',
          'guidance_stage_events',
          'parent_guidance',
          'audit_log',
          'notification_outbox',
        ].includes(table)
      )
        throw new Error(
          'Use the validated workflow operation / Doğrulanan iş akışı işlemini kullanın',
        );
      if (!has('administrator')) {
        if (table === 'students') {
          requireRole('academic_manager');
          if (
            [
              'monthly_fee',
              'currency',
              'scholarship_percent',
              'scholarship_type',
              'scholarship_amount',
            ].some((key) => key in values)
          )
            throw new Error(
              'Only administrators can change fees / Ücretleri yalnızca yöneticiler değiştirebilir',
            );
        } else if (table === 'classes' || table === 'enrollments' || table === 'class_groups')
          requireRole('academic_manager');
        else if (table === 'learning_materials') {
          const previous = values.id ? find(table, values.id) : null;
          materialAccess({ ...(previous || {}), ...values });
          // Like the server: only the author (or the lesson's teacher for lesson materials).
          if (
            previous &&
            previous.owner_id !== user.id &&
            !(previous.class_id && find('classes', previous.class_id).teacher_id === user.id)
          )
            throw new Error(
              'Only the author or management can change this material / Bu materyali yalnız ekleyen kişi veya yönetim değiştirebilir',
            );
        } else if (
          table === 'sessions' ||
          table === 'curriculum_progress' ||
          table === 'curriculum_weeks'
        )
          classAccess(values.class_id || find(table, values.id).class_id);
        else if (table === 'placements')
          studentAccess(values.student_id || find(table, values.id).student_id);
        else requireAdmin();
      }
      if (
        table === 'profiles' &&
        values.id === user.id &&
        (values.active === false || (values.roles && !values.roles.includes('administrator')))
      )
        throw new Error(
          'Keep your administrator access active / Yönetici erişiminiz aktif kalmalı',
        );
      if (table === 'students' || table === 'packages') {
        if (
          'monthly_fee' in values &&
          values.monthly_fee != null &&
          (Number(values.monthly_fee) < 0 ||
            !Number.isFinite(Number(values.monthly_fee)) ||
            Math.abs(
              Number(values.monthly_fee) * 100 - Math.round(Number(values.monthly_fee) * 100),
            ) > 0.00001)
        )
          throw new Error(
            'Enter a non-negative fee with at most two decimals / En fazla iki ondalıklı, negatif olmayan ücret girin',
          );
        if ('currency' in values) values = { ...values, currency: currencyCode(values.currency) };
        if (table === 'students' && values.package_id) find('packages', values.package_id);
        if (table === 'students')
          validateStudentContact({ ...(values.id ? find('students', values.id) : {}), ...values });
      }
      if (table === 'classes') {
        // Like validate_class: the specialist lesson only takes a Specialist level (C1, T1…).
        const lesson = { ...(values.id ? find('classes', values.id) : {}), ...values };
        if (
          lesson.level_id &&
          isSpecialistSubject(lesson.subject_id, state) &&
          state.levels.find((level) => level.id === lesson.level_id)?.kind !== 'specialist'
        )
          throw new Error('Choose a specialist level / Uzmanlık seviyesi seçin');
      }
      if (table === 'learning_materials') {
        const previous = values.id ? find(table, values.id) : null;
        const material = { ...previous, ...values };
        if (
          previous &&
          [
            'object_key',
            'external_url',
            'class_id',
            'owner_id',
            'version',
            'replaces_id',
            'file_size',
            'file_type',
          ].some((key) => key in values && values[key] !== previous[key])
        )
          throw new Error('Material versions are immutable. Upload a new version.');
        if (previous?.status === 'archived' && material.status !== 'archived')
          throw new Error('Archived versions cannot be reactivated');
        if (previous?.status === 'ready' && material.status === 'uploading')
          throw new Error('Ready versions cannot return to uploading');
        if (
          material.object_key &&
          material.status === 'ready' &&
          !demoFiles.has(material.object_key)
        )
          throw new Error('Upload the complete file before making it available');
        if (!material.class_id && !material.subject_id)
          throw new Error('Choose a subject / Ders seçin');
        if (material.external_url && !/^https:\/\/[^\s/]+\.[^\s]+$/.test(material.external_url))
          throw new Error('Use a full https:// link / Tam bir https:// bağlantısı girin');
      }
      if (table === 'sessions' && values.id) {
        const previous = find('sessions', values.id);
        if (
          values.starts_at &&
          new Date(values.starts_at).getTime() !== new Date(previous.starts_at).getTime()
        ) {
          if (state.attendance.some((row) => row.session_id === previous.id))
            throw new Error(
              'This lesson already has attendance; its date cannot change / Yoklaması alınmış dersin tarihi değiştirilemez',
            );
          if (previous.planned)
            values = {
              ...values,
              moved_from: previous.moved_from || previous.starts_at,
              planned: false,
            };
        }
      }
      if (table === 'enrollments') {
        if (
          !values.id &&
          state.enrollments.some(
            (row) =>
              row.student_id === values.student_id &&
              row.class_id === values.class_id &&
              !row.ended_on,
          )
        )
          throw new Error('The student is already enrolled / Öğrenci zaten kayıtlı');
        const record = values.id ? { ...find(table, values.id), ...values } : values;
        if (record.ended_on && record.ended_on < record.started_on)
          throw new Error(
            'End date must follow start date / Bitiş tarihi başlangıçtan sonra olmalı',
          );
      }
      if (table === 'sessions') {
        const record = values.id ? { ...find(table, values.id), ...values } : values;
        if (
          state.sessions.some(
            (row) =>
              row.id !== record.id &&
              row.class_id === record.class_id &&
              row.starts_at === record.starts_at,
          )
        )
          throw new Error('A lesson already exists at this time / Bu saatte ders zaten var');
        if (Number(record.duration_minutes) < 5 || Number(record.duration_minutes) > 180)
          throw new Error(
            'Lesson duration must be 5–180 minutes / Ders süresi 5–180 dakika olmalı',
          );
      }
      if (table === 'curriculum_progress') {
        const group = find('classes', values.class_id);
        // As on the server: a change by anyone but the lesson's teacher waits for approval.
        const existing = state.curriculum_progress.find(
          (item) =>
            item.class_id === values.class_id &&
            item.configuration_id === values.configuration_id &&
            item.criterion_id === values.criterion_id,
        );
        if (group.teacher_id !== user.id) {
          const current = !!existing?.taught;
          values =
            !!values.taught !== current
              ? {
                  ...values,
                  taught: current,
                  pending_taught: !!values.taught,
                  requested_by: user.id,
                  requested_at: now(),
                }
              : { ...values, pending_taught: null, requested_by: null, requested_at: null };
        } else values = { ...values, pending_taught: null, requested_by: null, requested_at: null };
        const subject = find('subjects', group.subject_id);
        const configuration = find('configurations', values.configuration_id);
        if (
          configuration.status !== 'published' ||
          !configuration.body.questions.some(
            (question: any) =>
              question.id === values.criterion_id && question.subject_code === subject.code,
          )
        )
          throw new Error(
            'Choose a published criterion for this class subject / Bu sınıfın dersine ait yayınlanmış ölçüt seçin',
          );
      }
      const row = put(table, values);
      audit(`save ${table}`);
      return row;
    },
    async rpc(name, args = {}) {
      const checkpoint = structuredClone(state);
      try {
        const result = await rpc(name, args);
        if (!name.startsWith('preview_')) audit(name);
        return result;
      } catch (error) {
        state = checkpoint;
        throw error;
      }
    },
    async invite(payload) {
      requireAdmin();
      requireText(payload.full_name);
      if (payload.username !== undefined) {
        const username = normaliseUsername(payload.username);
        if (!USERNAME_PATTERN.test(username) || (payload.password || '').length < 10)
          throw new Error(
            'Use a 3–32 character username and a password of at least 10 characters / 3–32 karakterlik kullanıcı adı ve en az 10 karakterlik şifre kullanın',
          );
        if (state.profiles.some((profile) => profile.email === toLoginEmail(username)))
          throw new Error('That username is already taken / Bu kullanıcı adı kullanılıyor');
        payload = { ...payload, email: toLoginEmail(username) };
      }
      if (
        !/^[^@\s]+@[^@\s]+\.[^@\s]+$/.test(payload.email) ||
        !payload.roles.length ||
        payload.roles.some(
          (role) =>
            !['administrator', 'academic_manager', 'teacher', 'guidance', 'parent'].includes(role),
        )
      )
        throw new Error(
          'A valid email and access role are required / Geçerli e-posta ve erişim rolü gerekli',
        );
      if (payload.student_ids?.length && !payload.roles.includes('parent'))
        throw new Error(
          'Student links require the parent role / Öğrenci bağlantısı için veli rolü gerekli',
        );
      for (const studentId of payload.student_ids || []) find('students', studentId);
      const existing = state.profiles.find(
        (profile) => profile.email.toLowerCase() === payload.email.toLowerCase(),
      );
      const person = put('profiles', {
        ...(existing || {}),
        full_name: payload.full_name,
        email: payload.email.toLowerCase(),
        roles: payload.roles,
        language: payload.language || 'en',
        active: true,
      });
      for (const studentId of payload.student_ids || [])
        put('guardians', { profile_id: person.id, student_id: studentId });
      audit('demo invitation recorded; no email sent');
      return { userId: person.id, existingUser: Boolean(existing), demo: true };
    },
    async manageUser(payload) {
      requireAdmin();
      const person = find('profiles', payload.userId);
      if (payload.action === 'set_password') {
        if (payload.password.length < 10 || payload.password.length > 72)
          throw new Error(
            'Use a password of 10–72 characters / Şifre 10–72 karakter arasında olmalıdır',
          );
        audit('demo password set; no account changed');
        return { ok: true };
      }
      if (payload.action === 'send_reset') {
        if (isUsernameAccount(person.email))
          throw new Error(
            'Username accounts have no email. Set a new password instead / Kullanıcı adı hesaplarının e-postası yok; yeni şifre belirleyin',
          );
        audit('demo reset link recorded; no email sent');
        return { ok: true };
      }
      if (person.id === user.id)
        throw new Error('You cannot delete your own account / Kendi hesabınızı silemezsiniz');
      if (
        person.active &&
        person.roles?.includes('administrator') &&
        !state.profiles.some(
          (other) =>
            other.id !== person.id && other.active && other.roles?.includes('administrator'),
        )
      )
        throw new Error(
          'Keep at least one active administrator / En az bir aktif yönetici kalmalıdır',
        );
      const references: [string, string][] = [
        ['students', 'created_by'],
        ['students', 'contact_teacher_id'],
        ['placements', 'assessor_id'],
        ['classes', 'teacher_id'],
        ['configurations', 'created_by'],
        ['attendance', 'recorded_by'],
        ['assessments', 'teacher_id'],
        ['reports', 'generated_by'],
        ['reports', 'published_by'],
        ['guidance_cases', 'assignee_id'],
        ['guidance_cases', 'created_by'],
        ['guidance_cases', 'reporting_teacher_id'],
        ['guidance_notes', 'author_id'],
        ['charges', 'created_by'],
        ['payments', 'recorded_by'],
        ['curriculum_progress', 'requested_by'],
        ['learning_materials', 'owner_id'],
      ];
      if (
        references.some(([table, column]) => state[table]?.some((row) => row[column] === person.id))
      )
        throw Object.assign(
          new Error(
            'This person already has school records (classes, attendance, reports…). Archive them instead / Bu kişinin okul kayıtları var (sınıf, yoklama, rapor…). Bunun yerine arşivleyin',
          ),
          { code: 'has_records' },
        );
      state.guardians = state.guardians.filter((row) => row.profile_id !== person.id);
      if (Array.isArray(state.work_drafts))
        state.work_drafts = state.work_drafts.filter((row) => row.owner_id !== person.id);
      state.profiles = state.profiles.filter((row) => row.id !== person.id);
      audit('demo user deleted');
      return { ok: true };
    },
  };
  return api;
}
