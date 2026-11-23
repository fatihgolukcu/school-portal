import type { PageProps, Profile, RecordRow, Snapshot } from './types';
import { classLevelId, enrollmentOn, planWeek, schoolDay, schoolTimezone } from './workflow';

/** "2026-10-17" → "17 Eki 2026" (or "17 Oct 2026"). */
const shortDate = (day: string, locale: string) =>
  new Date(`${day}T12:00:00Z`).toLocaleDateString(locale, {
    day: 'numeric',
    month: 'short',
    year: 'numeric',
    timeZone: 'UTC',
  });

export type IssueGroup = 'plan' | 'attendance' | 'assessment' | 'student';
export type Severity = 'red' | 'orange' | 'yellow';
export interface Issue {
  id: string;
  group: IssueGroup;
  severity: Severity;
  title_en: string;
  title_tr: string;
  detail_en: string;
  detail_tr: string;
  teacherId?: string;
  classId?: string;
  studentId?: string;
  /** Students affected when one row stands for several. */
  studentIds?: string[];
  target: { view: string; context?: PageProps['context'] };
}

const MANAGEMENT = ['administrator', 'academic_manager'];
export const isManagement = (user: Profile) => user.roles.some((r) => MANAGEMENT.includes(r));

const dayNumber = (day: string) => Math.floor(Date.parse(`${day}T12:00:00Z`) / 86400000);
const daysBetween = (from: string, to: string) => dayNumber(to) - dayNumber(from);

/** The period a person should look at first: today's period of the active year, else the first. */
export function currentPeriodId(data: Snapshot, now = new Date()) {
  const day = schoolDay(now, schoolTimezone(data));
  const year = data.academic_years.find((y) => y.active);
  const periods = data.periods
    .filter((p) => !year || p.academic_year_id === year.id)
    .slice()
    .sort((a, b) => Number(a.number) - Number(b.number));
  return (
    (
      periods.find((p) => p.starts_on && p.ends_on && p.starts_on <= day && p.ends_on >= day) ||
      periods[0]
    )?.id || ''
  );
}

/** Past, non-cancelled sessions (oldest first) whose enrolled students lack attendance rows. */
export function overdueAttendanceSessions(
  data: Snapshot,
  lessonIds: Set<string>,
  now = new Date(),
) {
  return attendanceGaps(data, lessonIds, now).map((g) => g.session);
}

interface AttendanceGap {
  session: RecordRow;
  day: string;
  missing: string[];
}
function attendanceGaps(data: Snapshot, lessonIds: Set<string>, now: Date): AttendanceGap[] {
  const timezone = schoolTimezone(data);
  const today = schoolDay(now, timezone);
  const marked = new Map<string, Set<string>>();
  for (const a of data.attendance) {
    let set = marked.get(a.session_id);
    if (!set) marked.set(a.session_id, (set = new Set()));
    set.add(a.student_id);
  }
  const enrollmentsByClass = new Map<string, RecordRow[]>();
  for (const e of data.enrollments) {
    if (!lessonIds.has(e.class_id)) continue;
    const list = enrollmentsByClass.get(e.class_id) || [];
    list.push(e);
    enrollmentsByClass.set(e.class_id, list);
  }
  const out: AttendanceGap[] = [];
  const nowMs = now.getTime();
  for (const s of data.sessions
    .filter((x) => lessonIds.has(x.class_id) && x.status !== 'cancelled')
    .sort((a, b) => a.starts_at.localeCompare(b.starts_at))) {
    if (new Date(s.starts_at).getTime() >= nowMs) continue;
    const day = schoolDay(s.starts_at, timezone);
    if (day > today) continue;
    const set = marked.get(s.id);
    const missing = (enrollmentsByClass.get(s.class_id) || [])
      .filter((e) => enrollmentOn(e, day) && !set?.has(e.student_id))
      .map((e) => e.student_id as string);
    if (missing.length) out.push({ session: s, day, missing });
  }
  return out;
}

/** Enrolled students without a submitted assessment for the period, one row per student. */
export function incompleteAssessments(data: Snapshot, lessons: RecordRow[], period?: RecordRow) {
  if (!period) return [];
  const studentById = new Map(data.students.map((s) => [s.id, s]));
  const lessonById = new Map(lessons.map((c) => [c.id, c]));
  const assessments = new Map<string, RecordRow>();
  for (const a of data.assessments)
    if (a.period_id === period.id) assessments.set(`${a.class_id}|${a.student_id}`, a);
  const rows: { classroom: RecordRow; student?: RecordRow; assessment?: RecordRow }[] = [];
  for (const c of lessons) {
    if (!lessonById.has(c.id)) continue;
    for (const e of data.enrollments) {
      if (
        e.class_id !== c.id ||
        !(e.started_on <= period.ends_on && (!e.ended_on || e.ended_on >= period.starts_on))
      )
        continue;
      const assessment = assessments.get(`${c.id}|${e.student_id}`);
      const student = studentById.get(e.student_id);
      if (
        student &&
        !(assessment?.status === 'submitted' && assessment.teacher_id === c.teacher_id)
      )
        rows.push({ classroom: c, student, assessment });
    }
  }
  return rows;
}

interface Curriculum {
  criteria: Map<string, string[]>; // classId -> criterion ids
  taught: Map<string, Set<string>>;
  pending: Map<string, number>;
  weeks: Map<string, number>;
}
function curriculumOf(data: Snapshot, lessons: RecordRow[]): Curriculum {
  const cfg = data.configurations
    .filter((c) => c.kind === 'assessment' && c.status === 'published')
    .sort((a, b) => b.version - a.version)[0];
  const subjectCode = new Map(data.subjects.map((s) => [s.id, s.code]));
  const criteria = new Map<string, string[]>();
  const bySubject = new Map<string, string[]>();
  for (const lesson of lessons) {
    const code = subjectCode.get(lesson.subject_id);
    if (!bySubject.has(code))
      bySubject.set(
        code,
        ((cfg?.body?.questions as any[]) || [])
          .filter((q) => q.subject_code === code)
          .map((q) => String(q.id)),
      );
    criteria.set(lesson.id, bySubject.get(code) || []);
  }
  const taught = new Map<string, Set<string>>();
  const pending = new Map<string, number>();
  for (const p of data.curriculum_progress) {
    if (cfg && p.configuration_id !== cfg.id) continue;
    if (p.taught) {
      const set = taught.get(p.class_id) || new Set();
      set.add(p.criterion_id);
      taught.set(p.class_id, set);
    }
    if (p.pending_taught !== null && p.pending_taught !== undefined)
      pending.set(p.class_id, (pending.get(p.class_id) || 0) + 1);
  }
  const weeks = new Map<string, number>();
  for (const w of data.curriculum_weeks || [])
    weeks.set(`${w.class_id}|${w.criterion_id}`, w.week_no);
  return { criteria, taught, pending, weeks };
}

export function findIssues(
  data: Snapshot,
  user: Profile,
  opts: { periodId?: string; now?: Date } = {},
): Issue[] {
  const now = opts.now || new Date();
  const timezone = schoolTimezone(data);
  const today = schoolDay(now, timezone);
  const management = isManagement(user);
  const admin = user.roles.includes('administrator');
  if (!management && !user.roles.includes('teacher')) return [];
  const lessons = data.classes.filter(
    (c) => c.active !== false && (management || c.teacher_id === user.id),
  );
  const lessonIds = new Set(lessons.map((c) => c.id));
  const nameOf = new Map(data.classes.map((c) => [c.id, c.name as string]));
  const studentName = new Map(
    data.students.map((s) => [s.id, `${s.first_name || ''} ${s.last_name || ''}`.trim()]),
  );
  const issues: Issue[] = [];
  const add = (issue: Issue) => issues.push(issue);

  const sessionsByClass = new Map<string, RecordRow[]>();
  for (const s of data.sessions) {
    if (!lessonIds.has(s.class_id)) continue;
    const list = sessionsByClass.get(s.class_id) || [];
    list.push(s);
    sessionsByClass.set(s.class_id, list);
  }
  const slotClasses = new Set((data.class_slots || []).map((s) => s.class_id));
  const activeByClass = new Map<string, number>();
  for (const e of data.enrollments)
    if (lessonIds.has(e.class_id) && enrollmentOn(e, today))
      activeByClass.set(e.class_id, (activeByClass.get(e.class_id) || 0) + 1);

  // Plan
  for (const c of lessons) {
    const name = c.name as string;
    const base = { group: 'plan' as const, teacherId: c.teacher_id, classId: c.id };
    const classes = { view: 'classes', context: { classId: c.id } };
    if (!c.teacher_id)
      add({
        ...base,
        id: `plan:teacher:${c.id}`,
        severity: 'red',
        title_en: `${name} · no teacher assigned`,
        title_tr: `${name} · öğretmen atanmadı`,
        detail_en: 'Assign a teacher so attendance and assessments can be recorded.',
        detail_tr: 'Yoklama ve değerlendirme girilebilmesi için öğretmen atayın.',
        target: classes,
      });
    if (!c.plan_starts_on && !slotClasses.has(c.id))
      add({
        ...base,
        id: `plan:none:${c.id}`,
        severity: 'yellow',
        title_en: `${name} · no lesson plan`,
        title_tr: `${name} · ders planı yok`,
        detail_en: 'Set the weekly lesson times and the plan dates.',
        detail_tr: 'Haftalık ders saatlerini ve plan tarihlerini belirleyin.',
        target: classes,
      });
    const sessions = sessionsByClass.get(c.id) || [];
    if (!sessions.length)
      add({
        ...base,
        id: `plan:sessions:${c.id}`,
        severity: 'orange',
        title_en: `${name} · no lesson dates`,
        title_tr: `${name} · ders tarihi yok`,
        detail_en: 'This lesson has no sessions at all.',
        detail_tr: 'Bu dersin hiç oturumu oluşturulmamış.',
        target: classes,
      });
    else if (
      c.plan_ends_on &&
      c.plan_ends_on > today &&
      !sessions.some(
        (s) => s.status !== 'cancelled' && new Date(s.starts_at).getTime() > now.getTime(),
      )
    )
      add({
        ...base,
        id: `plan:upcoming:${c.id}`,
        severity: 'orange',
        title_en: `${name} · no upcoming lessons`,
        title_tr: `${name} · yaklaşan ders yok`,
        detail_en: `The plan runs until ${c.plan_ends_on} but no future dates exist.`,
        detail_tr: `Plan ${c.plan_ends_on} tarihine kadar sürüyor ancak ileri tarihli ders yok.`,
        target: classes,
      });
    if (!activeByClass.get(c.id))
      add({
        ...base,
        id: `plan:students:${c.id}`,
        severity: 'yellow',
        title_en: `${name} · no enrolled students`,
        title_tr: `${name} · kayıtlı öğrenci yok`,
        detail_en: 'No student is currently enrolled in this lesson.',
        detail_tr: 'Bu derse şu anda kayıtlı öğrenci yok.',
        target: classes,
      });
  }

  // Attendance
  for (const g of attendanceGaps(data, lessonIds, now)) {
    const c = data.classes.find((x) => x.id === g.session.class_id);
    const old = daysBetween(g.day, today) > 7;
    add({
      id: `att:${g.session.id}`,
      group: 'attendance',
      severity: old ? 'red' : 'orange',
      title_en: `${nameOf.get(g.session.class_id)} · ${shortDate(g.day, 'en-GB')} attendance missing`,
      title_tr: `${nameOf.get(g.session.class_id)} · ${shortDate(g.day, 'tr-TR')} yoklaması eksik`,
      detail_en: `${g.missing.length} student(s) without a record${old ? ' · older than 7 days' : ''}.`,
      detail_tr: `${g.missing.length} öğrencinin kaydı yok${old ? ' · 7 günden eski' : ''}.`,
      teacherId: c?.teacher_id,
      classId: g.session.class_id,
      studentIds: g.missing,
      target: {
        view: 'attendance',
        context: { classId: g.session.class_id, sessionId: g.session.id },
      },
    });
  }
  const curriculum = curriculumOf(data, lessons);
  for (const c of lessons) {
    const week = planWeek(c, today);
    const taught = curriculum.taught.get(c.id);
    if (week) {
      const late = (curriculum.criteria.get(c.id) || []).filter((id) => {
        const w = curriculum.weeks.get(`${c.id}|${id}`);
        return w !== undefined && w < week && !taught?.has(id);
      });
      if (late.length)
        add({
          id: `cur:late:${c.id}`,
          group: 'attendance',
          severity: 'yellow',
          title_en: `${c.name} · ${late.length} topic(s) behind the plan`,
          title_tr: `${c.name} · ${late.length} konu plandan geride`,
          detail_en: `Planned before week ${week} but not marked as taught.`,
          detail_tr: `${week}. haftadan önce planlandı ancak işlendi olarak işaretlenmedi.`,
          teacherId: c.teacher_id,
          classId: c.id,
          target: { view: 'curriculum', context: { classId: c.id } },
        });
    }
    const pending = curriculum.pending.get(c.id);
    if (pending)
      add({
        id: `cur:pending:${c.id}`,
        group: 'attendance',
        severity: 'yellow',
        title_en: `${c.name} · ${pending} topic request(s) awaiting the teacher`,
        title_tr: `${c.name} · öğretmen onayı bekleyen ${pending} konu isteği`,
        detail_en: 'Requested curriculum changes are waiting to be confirmed.',
        detail_tr: 'İstenen müfredat değişiklikleri onay bekliyor.',
        teacherId: c.teacher_id,
        classId: c.id,
        target: { view: 'curriculum', context: { classId: c.id } },
      });
  }

  // Assessment
  const periodId = opts.periodId || currentPeriodId(data, now);
  const period = data.periods.find((p) => p.id === periodId);
  const assessmentView = management ? 'reports' : 'assessments';
  if (period?.starts_on && period?.ends_on && period.starts_on <= today) {
    const byLesson = new Map<string, RecordRow[]>();
    for (const row of incompleteAssessments(
      data,
      lessons.filter((c) => !c.academic_year_id || c.academic_year_id === period.academic_year_id),
      period,
    )) {
      const list = byLesson.get(row.classroom.id) || [];
      list.push(row.student!);
      byLesson.set(row.classroom.id, list);
    }
    for (const [classId, students] of byLesson) {
      const c = data.classes.find((x) => x.id === classId)!;
      add({
        id: `asm:${classId}:${period.id}`,
        group: 'assessment',
        severity: 'orange',
        title_en: `${c.name} · ${students.length} student(s) not assessed`,
        title_tr: `${c.name} · ${students.length} öğrenci değerlendirilmedi`,
        detail_en:
          students
            .slice(0, 4)
            .map((s) => `${s.first_name} ${s.last_name}`)
            .join(', ') + (students.length > 4 ? '…' : ''),
        detail_tr:
          students
            .slice(0, 4)
            .map((s) => `${s.first_name} ${s.last_name}`)
            .join(', ') + (students.length > 4 ? '…' : ''),
        teacherId: c.teacher_id,
        classId,
        studentIds: students.map((s) => s.id),
        target: { view: assessmentView, context: { classId, periodId: period.id } },
      });
    }
    if (management) {
      const reports = new Map<string, RecordRow>();
      for (const r of data.reports)
        if (r.period_id === period.id) {
          const old = reports.get(r.student_id);
          if (
            !old ||
            r.status === 'published' ||
            (old.status !== 'published' && r.revision > old.revision)
          )
            reports.set(r.student_id, r);
        }
      for (const [studentId, r] of reports)
        if (r.status === 'submitted')
          add({
            id: `rep:submitted:${studentId}:${period.id}`,
            group: 'assessment',
            severity: 'yellow',
            title_en: `${studentName.get(studentId)} · report awaiting publication`,
            title_tr: `${studentName.get(studentId)} · karne yayın bekliyor`,
            detail_en: 'The report was submitted but is not published yet.',
            detail_tr: 'Karne gönderildi ancak henüz yayınlanmadı.',
            studentId,
            studentIds: [studentId],
            target: { view: 'reports', context: { studentId, periodId: period.id } },
          });
      if (period.ends_on < today) {
        const missing = new Map<string, RecordRow>();
        for (const e of data.enrollments)
          if (
            e.started_on <= period.ends_on &&
            (!e.ended_on || e.ended_on >= period.starts_on) &&
            !reports.has(e.student_id)
          )
            missing.set(e.student_id, e);
        for (const studentId of missing.keys()) {
          const student = data.students.find((s) => s.id === studentId);
          if (!student || student.status === 'archived') continue;
          add({
            id: `rep:none:${studentId}:${period.id}`,
            group: 'assessment',
            severity: 'yellow',
            title_en: `${studentName.get(studentId)} · no report for this period`,
            title_tr: `${studentName.get(studentId)} · bu dönem için karne yok`,
            detail_en: 'The period has ended and no report was generated.',
            detail_tr: 'Dönem bitti ancak karne oluşturulmadı.',
            studentId,
            studentIds: [studentId],
            target: { view: 'reports', context: { studentId, periodId: period.id } },
          });
        }
      }
    }
  }

  // Students
  if (management) {
    const enrolledNow = new Set<string>();
    for (const e of data.enrollments) if (enrollmentOn(e, today)) enrolledNow.add(e.student_id);
    const guarded = new Set(data.guardians.map((g) => g.student_id));
    for (const s of data.students) {
      if (s.status === 'archived') continue;
      const name = studentName.get(s.id);
      const common = { group: 'student' as const, studentId: s.id, studentIds: [s.id] };
      const target = { view: 'students', context: { studentId: s.id } };
      if (!enrolledNow.has(s.id))
        add({
          ...common,
          id: `stu:enrol:${s.id}`,
          severity: 'orange',
          title_en: `${name} · not enrolled in any lesson`,
          title_tr: `${name} · hiçbir derse kayıtlı değil`,
          detail_en: 'Enroll the student in a lesson.',
          detail_tr: 'Öğrenciyi bir derse kaydedin.',
          target,
        });
      if (!guarded.has(s.id))
        add({
          ...common,
          id: `stu:guardian:${s.id}`,
          severity: 'yellow',
          title_en: `${name} · no parent account linked`,
          title_tr: `${name} · veli hesabı bağlı değil`,
          detail_en: 'Link a parent so they can see progress and payments.',
          detail_tr: 'Gelişim ve ödemeleri görebilmesi için veli bağlayın.',
          target,
        });
      if (!s.package_id)
        add({
          ...common,
          id: `stu:package:${s.id}`,
          severity: 'yellow',
          title_en: `${name} · no package selected`,
          title_tr: `${name} · paket seçilmemiş`,
          detail_en: 'Choose the student’s package.',
          detail_tr: 'Öğrencinin paketini seçin.',
          target,
        });
    }
    if (admin) {
      const validPayments = new Set(data.payments.filter((p) => !p.voided_at).map((p) => p.id));
      const paid = new Map<string, number>();
      for (const a of data.allocations)
        if (validPayments.has(a.payment_id))
          paid.set(a.charge_id, (paid.get(a.charge_id) || 0) + Number(a.amount));
      const owed = new Map<string, { sums: Map<string, number>; oldest: string }>();
      for (const ch of data.charges) {
        const due = ch.due_on || ch.due_date;
        if (ch.voided_at || !due || due >= today) continue;
        const remaining = Math.round((Number(ch.amount) - (paid.get(ch.id) || 0)) * 100) / 100;
        if (remaining <= 0) continue;
        const row = owed.get(ch.student_id) || { sums: new Map(), oldest: due };
        row.sums.set(ch.currency, (row.sums.get(ch.currency) || 0) + remaining);
        if (due < row.oldest) row.oldest = due;
        owed.set(ch.student_id, row);
      }
      for (const [studentId, row] of owed) {
        const student = data.students.find((s) => s.id === studentId);
        if (!student || student.status === 'archived') continue;
        const days = daysBetween(row.oldest, today);
        const amount = [...row.sums].map(([code, sum]) => `${sum.toFixed(2)} ${code}`).join(' + ');
        add({
          id: `fin:${studentId}`,
          group: 'student',
          severity: days > 30 ? 'red' : 'orange',
          title_en: `${studentName.get(studentId)} · overdue payment`,
          title_tr: `${studentName.get(studentId)} · gecikmiş ödeme`,
          detail_en: `${amount} unpaid · ${days} days overdue`,
          detail_tr: `${amount} ödenmedi · ${days} gün gecikti`,
          studentId,
          studentIds: [studentId],
          target: { view: 'finance', context: { studentId } },
        });
      }
    }
  }
  const rank = { red: 0, orange: 1, yellow: 2 };
  return issues.sort((a, b) => rank[a.severity] - rank[b.severity]);
}

export interface SummaryRow {
  id: string;
  name_en: string;
  name_tr: string;
  lessons: number;
  pastSessions: number;
  completeSessions: number;
  /** Share of past sessions with attendance recorded for every enrolled student, 0-100. */
  attendancePct: number | null;
  missingAttendance: number;
  assessmentsSubmitted: number;
  assessmentsExpected: number;
  criteria: number;
  taught: number;
  curriculumPct: number | null;
}

const pct = (part: number, whole: number) => (whole ? Math.round((part / whole) * 100) : null);

function summarize(
  data: Snapshot,
  issues: Issue[],
  periodId: string,
  groups: { id: string; name_en: string; name_tr: string; lessons: RecordRow[] }[],
  now: Date,
  key: 'teacherId' | 'classId',
): SummaryRow[] {
  const all = groups.flatMap((g) => g.lessons);
  const ids = new Set(all.map((c) => c.id));
  const gaps = new Map<string, number>();
  for (const g of attendanceGaps(data, ids, now))
    gaps.set(g.session.class_id, (gaps.get(g.session.class_id) || 0) + 1);
  const timezone = schoolTimezone(data);
  const today = schoolDay(now, timezone);
  const past = new Map<string, number>();
  for (const s of data.sessions)
    if (
      ids.has(s.class_id) &&
      s.status !== 'cancelled' &&
      new Date(s.starts_at).getTime() < now.getTime() &&
      schoolDay(s.starts_at, timezone) <= today
    )
      past.set(s.class_id, (past.get(s.class_id) || 0) + 1);
  const period = data.periods.find((p) => p.id === periodId);
  const expected = new Map<string, number>();
  const submitted = new Map<string, number>();
  if (period?.starts_on && period?.ends_on) {
    const done = new Set(
      data.assessments
        .filter((a) => a.period_id === periodId && a.status === 'submitted')
        .map((a) => `${a.class_id}|${a.student_id}`),
    );
    for (const e of data.enrollments)
      if (
        ids.has(e.class_id) &&
        e.started_on <= period.ends_on &&
        (!e.ended_on || e.ended_on >= period.starts_on)
      ) {
        expected.set(e.class_id, (expected.get(e.class_id) || 0) + 1);
        if (done.has(`${e.class_id}|${e.student_id}`))
          submitted.set(e.class_id, (submitted.get(e.class_id) || 0) + 1);
      }
  }
  const curriculum = curriculumOf(data, all);
  void issues;
  void key;
  return groups.map((g) => {
    const sum = (m: Map<string, number>) => g.lessons.reduce((n, c) => n + (m.get(c.id) || 0), 0);
    const pastSessions = sum(past);
    const missing = sum(gaps);
    const criteria = g.lessons.reduce(
      (n, c) => n + (curriculum.criteria.get(c.id)?.length || 0),
      0,
    );
    const taught = g.lessons.reduce(
      (n, c) =>
        n +
        (curriculum.criteria.get(c.id) || []).filter((id) => curriculum.taught.get(c.id)?.has(id))
          .length,
      0,
    );
    return {
      id: g.id,
      name_en: g.name_en,
      name_tr: g.name_tr,
      lessons: g.lessons.length,
      pastSessions,
      completeSessions: Math.max(0, pastSessions - missing),
      attendancePct: pct(Math.max(0, pastSessions - missing), pastSessions),
      missingAttendance: missing,
      assessmentsSubmitted: sum(submitted),
      assessmentsExpected: sum(expected),
      criteria,
      taught,
      curriculumPct: pct(taught, criteria),
    };
  });
}

/** One row per teacher with active lessons; issues are accepted for scoping and kept for callers. */
export function teacherSummary(
  data: Snapshot,
  issues: Issue[],
  periodId: string,
  now = new Date(),
): SummaryRow[] {
  const lessons = data.classes.filter((c) => c.active !== false && c.teacher_id);
  const teachers = [...new Set(lessons.map((c) => c.teacher_id as string))];
  const profile = new Map(data.profiles.map((p) => [p.id, p.full_name]));
  return summarize(
    data,
    issues,
    periodId,
    teachers.map((id) => ({
      id,
      name_en: profile.get(id) || '—',
      name_tr: profile.get(id) || '—',
      lessons: lessons.filter((c) => c.teacher_id === id),
    })),
    now,
    'teacherId',
  ).sort((a, b) => a.name_en.localeCompare(b.name_en));
}

/** One row per active lesson. */
export function lessonSummary(
  data: Snapshot,
  issues: Issue[],
  periodId: string,
  now = new Date(),
): SummaryRow[] {
  return summarize(
    data,
    issues,
    periodId,
    data.classes
      .filter((c) => c.active !== false)
      .map((c) => ({ id: c.id, name_en: c.name, name_tr: c.name, lessons: [c] })),
    now,
    'classId',
  ).sort((a, b) => a.name_en.localeCompare(b.name_en));
}

/* ---------- Report metrics (charts) ---------- */

export interface ReportFilters {
  periodId?: string;
  levelId?: string;
  /** A class group id, or `lesson:<id>` for a lesson that has no group. */
  groupId?: string;
  teacherId?: string;
  now?: Date;
}
export interface ReportRow {
  id: string;
  name_en: string;
  name_tr: string;
  lessons: number;
  students: number;
  pastSessions: number;
  completeSessions: number;
  attendancePct: number | null;
  attendanceRows: number;
  attendancePresent: number;
  attendanceRatePct: number | null;
  assessmentsSubmitted: number;
  assessmentsExpected: number;
  assessmentPct: number | null;
  criteria: number;
  taught: number;
  curriculumPct: number | null;
}
export interface ReportWeek {
  /** Monday of the week, YYYY-MM-DD in the school time zone. */
  start: string;
  held: number;
  complete: number;
  completionPct: number | null;
  attendanceRows: number;
  attendancePresent: number;
  ratePct: number | null;
}
export interface ReportKpis {
  attendanceCompletionPct: number | null;
  attendanceRatePct: number | null;
  latePct: number | null;
  absentPct: number | null;
  assessmentPct: number | null;
  assessmentsSubmitted: number;
  assessmentsExpected: number;
  curriculumPct: number | null;
  activeStudents: number;
  activeLessons: number;
  weeklyMinutes: number;
}
export interface ReportMetrics {
  kpis: ReportKpis;
  weeks: ReportWeek[];
  teachers: ReportRow[];
  lessons: ReportRow[];
  levels: ReportRow[];
  groups: ReportRow[];
}

const addDays = (day: string, n: number) =>
  new Date(Date.parse(`${day}T12:00:00Z`) + n * 86400000).toISOString().slice(0, 10);
const mondayOf = (day: string) =>
  addDays(day, -((new Date(`${day}T12:00:00Z`).getUTCDay() + 6) % 7));

/** Management report numbers for the "Raporlar" charts. Pure; one pass per table. */
export function reportMetrics(
  data: Snapshot,
  _user: Profile,
  filters: ReportFilters = {},
  weekCount = 12,
): ReportMetrics {
  const now = filters.now || new Date();
  const nowMs = now.getTime();
  const timezone = schoolTimezone(data);
  const today = schoolDay(now, timezone);
  const lessons = data.classes.filter((c) => {
    if (c.active === false) return false;
    if (filters.teacherId && c.teacher_id !== filters.teacherId) return false;
    if (filters.levelId && classLevelId(c, data) !== filters.levelId) return false;
    if (filters.groupId) {
      if (filters.groupId.startsWith('lesson:')) return c.id === filters.groupId.slice(7);
      if (c.group_id !== filters.groupId) return false;
    }
    return true;
  });
  const lessonIds = new Set(lessons.map((c) => c.id));
  const gapSessions = new Set(attendanceGaps(data, lessonIds, now).map((g) => g.session.id));

  // Sessions
  const sessionClass = new Map<string, string>();
  const sessionDay = new Map<string, string>();
  const past = new Map<string, number>();
  const gaps = new Map<string, number>();
  const weekIndex = new Map<string, number>();
  const firstWeek = addDays(mondayOf(today), -7 * (weekCount - 1));
  const weeks: ReportWeek[] = Array.from({ length: weekCount }, (_, i) => {
    const start = addDays(firstWeek, i * 7);
    weekIndex.set(start, i);
    return {
      start,
      held: 0,
      complete: 0,
      completionPct: null,
      attendanceRows: 0,
      attendancePresent: 0,
      ratePct: null,
    };
  });
  const weekOf = (day?: string) => (day ? weeks[weekIndex.get(mondayOf(day)) ?? -1] : undefined);
  for (const s of data.sessions) {
    if (!lessonIds.has(s.class_id)) continue;
    sessionClass.set(s.id, s.class_id);
    if (s.status === 'cancelled' || new Date(s.starts_at).getTime() >= nowMs) continue;
    const day = schoolDay(s.starts_at, timezone);
    if (day > today) continue;
    sessionDay.set(s.id, day);
    past.set(s.class_id, (past.get(s.class_id) || 0) + 1);
    const gap = gapSessions.has(s.id);
    if (gap) gaps.set(s.class_id, (gaps.get(s.class_id) || 0) + 1);
    const w = weekOf(day);
    if (w) {
      w.held += 1;
      if (!gap) w.complete += 1;
    }
  }

  // Attendance rows
  const rows = new Map<string, number>();
  const present = new Map<string, number>();
  let late = 0;
  let absent = 0;
  for (const a of data.attendance) {
    const classId = sessionClass.get(a.session_id);
    if (!classId) continue;
    rows.set(classId, (rows.get(classId) || 0) + 1);
    const here = a.status === 'present' || a.status === 'late';
    if (here) present.set(classId, (present.get(classId) || 0) + 1);
    if (a.status === 'late') late += 1;
    if (a.status === 'absent') absent += 1;
    const w = weekOf(sessionDay.get(a.session_id));
    if (w) {
      w.attendanceRows += 1;
      if (here) w.attendancePresent += 1;
    }
  }
  for (const w of weeks) {
    w.completionPct = pct(w.complete, w.held);
    w.ratePct = pct(w.attendancePresent, w.attendanceRows);
  }

  // Assessments and enrolment
  const period = data.periods.find((p) => p.id === filters.periodId);
  const expected = new Map<string, number>();
  const submitted = new Map<string, number>();
  const done = new Set(
    data.assessments
      .filter((a) => a.period_id === filters.periodId && a.status === 'submitted')
      .map((a) => `${a.class_id}|${a.student_id}`),
  );
  const studentStatus = new Map(data.students.map((s) => [s.id, s.status]));
  const studentsByClass = new Map<string, Set<string>>();
  const activeStudents = new Set<string>();
  for (const e of data.enrollments) {
    if (!lessonIds.has(e.class_id)) continue;
    if (
      period?.starts_on &&
      period?.ends_on &&
      e.started_on <= period.ends_on &&
      (!e.ended_on || e.ended_on >= period.starts_on)
    ) {
      expected.set(e.class_id, (expected.get(e.class_id) || 0) + 1);
      if (done.has(`${e.class_id}|${e.student_id}`))
        submitted.set(e.class_id, (submitted.get(e.class_id) || 0) + 1);
    }
    if (enrollmentOn(e, today) && studentStatus.get(e.student_id) !== 'archived') {
      activeStudents.add(e.student_id);
      let set = studentsByClass.get(e.class_id);
      if (!set) studentsByClass.set(e.class_id, (set = new Set()));
      set.add(e.student_id);
    }
  }
  const curriculum = curriculumOf(data, lessons);
  const criteriaOf = (c: RecordRow) => curriculum.criteria.get(c.id)?.length || 0;
  const taughtOf = (c: RecordRow) =>
    (curriculum.criteria.get(c.id) || []).filter((id) => curriculum.taught.get(c.id)?.has(id))
      .length;
  let weeklyMinutes = 0;
  for (const slot of data.class_slots || [])
    if (lessonIds.has(slot.class_id)) weeklyMinutes += Number(slot.duration_minutes) || 0;

  const build = (id: string, name_en: string, name_tr: string, group: RecordRow[]): ReportRow => {
    const sum = (m: Map<string, number>) => group.reduce((n, c) => n + (m.get(c.id) || 0), 0);
    const students = new Set<string>();
    for (const c of group) for (const s of studentsByClass.get(c.id) || []) students.add(s);
    const pastSessions = sum(past);
    const completeSessions = Math.max(0, pastSessions - sum(gaps));
    const attendanceRows = sum(rows);
    const attendancePresent = sum(present);
    const assessmentsExpected = sum(expected);
    const assessmentsSubmitted = sum(submitted);
    const criteria = group.reduce((n, c) => n + criteriaOf(c), 0);
    const taught = group.reduce((n, c) => n + taughtOf(c), 0);
    return {
      id,
      name_en,
      name_tr,
      lessons: group.length,
      students: students.size,
      pastSessions,
      completeSessions,
      attendancePct: pct(completeSessions, pastSessions),
      attendanceRows,
      attendancePresent,
      attendanceRatePct: pct(attendancePresent, attendanceRows),
      assessmentsSubmitted,
      assessmentsExpected,
      assessmentPct: pct(assessmentsSubmitted, assessmentsExpected),
      criteria,
      taught,
      curriculumPct: pct(taught, criteria),
    };
  };
  const profile = new Map(data.profiles.map((p) => [p.id, p.full_name]));
  const byKey = (key: (c: RecordRow) => string) => {
    const map = new Map<string, RecordRow[]>();
    for (const c of lessons) {
      const k = key(c);
      if (!k) continue;
      const list = map.get(k) || [];
      list.push(c);
      map.set(k, list);
    }
    return map;
  };
  const teachers = [...byKey((c) => c.teacher_id || '')].map(([id, g]) =>
    build(id, profile.get(id) || '—', profile.get(id) || '—', g),
  );
  const lessonRows = lessons.map((c) => build(c.id, c.name, c.name, [c]));
  const levelById = new Map(data.levels.map((l) => [l.id, l]));
  const levels = [...byKey((c) => classLevelId(c, data))].map(([id, g]) => {
    const l = levelById.get(id);
    return build(id, l?.name_en || l?.name || '—', l?.name_tr || l?.name || '—', g);
  });
  const groupById = new Map(data.class_groups.map((g) => [g.id, g]));
  const groups = [...byKey((c) => (groupById.has(c.group_id) ? c.group_id : `lesson:${c.id}`))].map(
    ([id, g]) => {
      const rec = groupById.get(id);
      return build(
        id,
        rec?.name_en || rec?.name || g[0].name,
        rec?.name_tr || rec?.name || g[0].name,
        g,
      );
    },
  );
  const total = build('all', '', '', lessons);
  return {
    kpis: {
      attendanceCompletionPct: total.attendancePct,
      attendanceRatePct: total.attendanceRatePct,
      latePct: pct(late, total.attendanceRows),
      absentPct: pct(absent, total.attendanceRows),
      assessmentPct: total.assessmentPct,
      assessmentsSubmitted: total.assessmentsSubmitted,
      assessmentsExpected: total.assessmentsExpected,
      curriculumPct: total.curriculumPct,
      activeStudents: activeStudents.size,
      activeLessons: lessons.length,
      weeklyMinutes,
    },
    weeks,
    teachers,
    lessons: lessonRows,
    levels,
    groups,
  };
}
