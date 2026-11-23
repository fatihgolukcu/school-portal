import { useState } from 'react';
import { ArrowRight, BookOpen, CalendarDays, CheckCircle2 } from 'lucide-react';
import type { PageProps } from '../types';
import { Badge, Button, EmptyState, PageHeader, SelectField, fullName, label, tr } from '../ui';
import { incompleteAssessments, overdueAttendanceSessions } from '../checks';
import { activeStudentEnrollment, enrollmentOn, schoolDay, schoolTimezone } from '../workflow';

export function WorkspaceHome(props: PageProps) {
  const { data, user, lang, navigate } = props;
  const timezone = schoolTimezone(data);
  const day = schoolDay(new Date(), timezone);
  const parent = user.roles.every((r) => r === 'parent');
  const management = user.roles.some((r) => ['administrator', 'academic_manager'].includes(r));
  const teacher = user.roles.includes('teacher') && !management;
  const lessons = data.classes.filter((c) => c.active && (!teacher || c.teacher_id === user.id));
  const lessonIds = new Set(lessons.map((c) => c.id));
  const sessions = data.sessions
    .filter((s) => lessonIds.has(s.class_id) && s.status !== 'cancelled')
    .sort((a, b) => a.starts_at.localeCompare(b.starts_at));
  const today = sessions.filter((s) => schoolDay(s.starts_at, timezone) === day);
  const upcoming = sessions.filter((s) => schoolDay(s.starts_at, timezone) > day).slice(0, 4);
  const overdueIds = new Set(overdueAttendanceSessions(data, lessonIds).map((s) => s.id));
  const overdue = sessions.filter((s) => overdueIds.has(s.id)).slice(-6);
  const currentYear = data.academic_years.find((y) => y.active);
  const [periodId, setPeriodId] = useState(
    data.periods.find(
      (p) => p.academic_year_id === currentYear?.id && p.starts_on <= day && p.ends_on >= day,
    )?.id ||
      data.periods.find((p) => p.academic_year_id === currentYear?.id)?.id ||
      '',
  );
  const period = data.periods.find((p) => p.id === periodId);
  const incomplete = incompleteAssessments(data, lessons, period);
  const cases = data.guidance_cases
    .filter(
      (c) =>
        !['resolved', 'closed_unresolved'].includes(c.workflow_stage) && c.status !== 'resolved',
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
  const openLesson = (s: (typeof sessions)[number]) =>
    navigate?.('lesson', { classId: s.class_id, sessionId: s.id });
  const lessonCard = (s: (typeof sessions)[number], canRecord: boolean) => {
    const classroom = lessons.find((c) => c.id === s.class_id);
    const enrolled = data.enrollments.filter(
      (e) =>
        e.class_id === s.class_id &&
        enrollmentOn(e, schoolDay(s.starts_at, timezone)) &&
        activeStudentEnrollment(e, data),
    );
    const recorded = enrolled.filter((e) =>
      data.attendance.some((a) => a.session_id === s.id && a.student_id === e.student_id),
    ).length;
    return (
      <article className="card task-card" key={s.id}>
        <div className="task-heading">
          <CalendarDays size={21} />
          <Badge
            tone={
              enrolled.length && recorded === enrolled.length
                ? 'green'
                : canRecord && enrolled.length
                  ? 'orange'
                  : 'neutral'
            }
          >
            {!enrolled.length
              ? tr(lang, 'No enrolled children', 'Kayıtlı öğrenci yok')
              : recorded === enrolled.length
                ? tr(lang, 'Recorded', 'Kaydedildi')
                : canRecord
                  ? tr(lang, 'Attendance needed', 'Yoklama bekliyor')
                  : tr(lang, 'Scheduled', 'Planlandı')}
          </Badge>
        </div>
        <h3>{classroom?.name}</h3>
        <p>
          {new Date(s.starts_at).toLocaleString(lang === 'tr' ? 'tr-TR' : 'en-GB', {
            timeZone: timezone,
            dateStyle: 'medium',
            timeStyle: 'short',
          })}
        </p>
        <p className="muted">
          {recorded}/{enrolled.length} {tr(lang, 'attendance records', 'yoklama kaydı')} ·{' '}
          {s.duration_minutes} {tr(lang, 'minutes', 'dakika')}
        </p>
        {canRecord && (
          <Button disabled={!enrolled.length} onClick={() => openLesson(s)}>
            {tr(lang, 'Open lesson', 'Dersi aç')}
            <ArrowRight size={16} />
          </Button>
        )}
        {!canRecord && classroom?.zoom_url && (
          <a
            className="btn btn-secondary"
            target="_blank"
            rel="noreferrer"
            href={classroom.zoom_url}
          >
            {tr(lang, 'Join lesson', 'Derse katıl')}
          </a>
        )}
      </article>
    );
  };
  if (parent)
    return (
      <>
        <PageHeader
          title={tr(lang, 'My children', 'Çocuklarım')}
          description={tr(
            lang,
            'Lessons, approved progress and payments for your family.',
            'Ailenizin dersleri, onaylanmış gelişimi ve ödemeleri.',
          )}
        />
        <div className="task-grid">
          {data.students
            .filter((s) => s.status !== 'archived')
            .map((student) => {
              const ids = new Set(
                data.enrollments
                  .filter((e) => e.student_id === student.id && !e.ended_on)
                  .map((e) => e.class_id),
              );
              const next = sessions.find(
                (s) => ids.has(s.class_id) && new Date(s.starts_at).getTime() >= Date.now(),
              );
              const report = data.parent_reports
                .filter((r) => r.student_id === student.id && r.current)
                .sort((a, b) => String(b.published_at).localeCompare(String(a.published_at)))[0];
              return (
                <article className="card task-card" key={student.id}>
                  <h3>{fullName(student)}</h3>
                  <small>{student.student_number}</small>
                  <p>
                    {next
                      ? new Date(next.starts_at).toLocaleString(lang === 'tr' ? 'tr-TR' : 'en-GB', {
                          timeZone: timezone,
                          dateStyle: 'medium',
                          timeStyle: 'short',
                        })
                      : tr(lang, 'No upcoming lesson scheduled', 'Yaklaşan ders planlanmadı')}
                  </p>
                  <div className="inline-actions">
                    <Button onClick={() => navigate?.('classes', { studentId: student.id })}>
                      {tr(lang, 'Lessons', 'Dersler')}
                    </Button>
                    <Button
                      variant="secondary"
                      onClick={() =>
                        navigate?.('reports', {
                          studentId: student.id,
                          periodId: report?.period_id,
                        })
                      }
                    >
                      {tr(lang, 'Approved reports', 'Onaylı karneler')}
                    </Button>
                    <Button
                      variant="secondary"
                      onClick={() => navigate?.('finance', { studentId: student.id })}
                    >
                      {tr(lang, 'Payments', 'Ödemeler')}
                    </Button>
                  </div>
                </article>
              );
            })}
        </div>
        {!data.students.length && (
          <EmptyState
            title={tr(
              lang,
              'Contact the school to add your children to your account.',
              'Çocuklarınızı hesabınıza eklemek için okul yönetimine başvurun.',
            )}
          />
        )}
      </>
    );
  return (
    <>
      <PageHeader
        title={tr(
          lang,
          teacher ? 'Today' : 'Your next tasks',
          teacher ? 'Bugün' : 'Sıradaki işleriniz',
        )}
        description={tr(
          lang,
          'Today’s lessons and tasks awaiting completion.',
          'Bugünün dersleri ve tamamlanmayı bekleyen işler.',
        )}
      />
      {(teacher || management) && (
        <>
          <h2 className="section-heading">{tr(lang, "Today's lessons", 'Bugünkü dersler')}</h2>
          <div className="task-grid">{today.map((s) => lessonCard(s, true))}</div>
          {!today.length && (
            <EmptyState
              title={tr(lang, 'No lessons today', 'Bugün ders yok')}
              description={tr(
                lang,
                'Your upcoming lessons are below. Choose an earlier lesson only if its attendance needs recording.',
                'Yaklaşan dersler aşağıda. Yoklaması eksikse geçmiş bir ders seçebilirsiniz.',
              )}
            />
          )}
          {!!overdue.length && (
            <section>
              <h2 className="section-heading">
                {tr(lang, 'Earlier lessons to record', 'Yoklama bekleyen geçmiş dersler')}
              </h2>
              <div className="task-grid">{overdue.map((s) => lessonCard(s, true))}</div>
            </section>
          )}
          <section className="card padded">
            <div className="section-heading">
              <h2>{tr(lang, 'Term assessments', 'Dönem değerlendirmeleri')}</h2>
              <Badge tone={incomplete.length ? 'orange' : 'green'}>
                {incomplete.length} {tr(lang, 'not submitted', 'gönderilmedi')}
              </Badge>
            </div>
            <SelectField
              label={tr(lang, 'Reporting period', 'Karne dönemi')}
              value={periodId}
              onChange={(e) => setPeriodId(e.target.value)}
            >
              {data.periods
                .filter((p) => p.academic_year_id === currentYear?.id)
                .map((p) => (
                  <option key={p.id} value={p.id}>
                    {label(p, lang)}
                  </option>
                ))}
            </SelectField>
            {!period?.starts_on && (
              <p>
                {tr(
                  lang,
                  'The administrator needs to set period dates.',
                  'Yönetici dönem tarihlerini belirlemelidir.',
                )}
              </p>
            )}
            {incomplete.slice(0, 12).map(({ classroom, student, assessment }) => (
              <div className="task-row" key={`${classroom.id}-${student!.id}`}>
                <div>
                  <strong>{fullName(student)}</strong>
                  <small>
                    {classroom.name} ·{' '}
                    {data.profiles.find((p) => p.id === classroom.teacher_id)?.full_name ||
                      tr(lang, 'Teacher not assigned', 'Öğretmen atanmadı')}{' '}
                    ·{' '}
                    {assessment
                      ? tr(lang, 'Draft', 'Taslak')
                      : tr(lang, 'Not submitted', 'Gönderilmedi')}
                  </small>
                </div>
                <Button
                  variant="secondary"
                  onClick={() =>
                    navigate?.(teacher ? 'assessments' : 'reports', {
                      classId: classroom.id,
                      studentId: student!.id,
                      periodId,
                    })
                  }
                >
                  {tr(lang, teacher ? 'Continue' : 'Review', teacher ? 'Devam et' : 'İncele')}
                </Button>
              </div>
            ))}
            {incomplete.length > 12 && (
              <p>
                {tr(
                  lang,
                  'More work remains. Open Student progress to continue.',
                  'Başka bekleyen işler var. Öğrenci gelişimini açın.',
                )}
              </p>
            )}
            {management && (
              <Button onClick={() => navigate?.('reports', { periodId })}>
                {tr(lang, 'Review and publish reports', 'Karneleri incele ve yayınla')}
              </Button>
            )}
          </section>
          {!!upcoming.length && (
            <section>
              <h2 className="section-heading">{tr(lang, 'Coming up', 'Yaklaşan dersler')}</h2>
              <div className="task-grid">{upcoming.map((s) => lessonCard(s, false))}</div>
            </section>
          )}
        </>
      )}
      {!!cases.length && (
        <section className="card padded">
          <h2>{tr(lang, 'Guidance and follow-up', 'Rehberlik ve takip')}</h2>
          {cases.slice(0, 8).map((c) => (
            <div className="task-row" key={c.id}>
              <Badge tone={c.severity}>
                {tr(
                  lang,
                  c.severity === 'red' ? 'Urgent' : c.overdue ? 'Overdue' : 'Review',
                  c.severity === 'red' ? 'Acil' : c.overdue ? 'Gecikti' : 'İncele',
                )}
              </Badge>
              <div>
                <strong>{fullName(data.students.find((s) => s.id === c.student_id))}</strong>
                <small>
                  {c.report_topic || c.topic || c.title} ·{' '}
                  {data.profiles.find((p) => p.id === c.assignee_id)?.full_name ||
                    tr(lang, 'Unassigned', 'Atanmadı')}
                </small>
              </div>
              <Button variant="secondary" onClick={() => navigate?.('guidance')}>
                {tr(lang, 'Open queue', 'Listeyi aç')}
              </Button>
            </div>
          ))}
        </section>
      )}
      {user.roles.includes('administrator') && (
        <section className="card padded">
          <h2>{tr(lang, 'School health', 'Sistem durumu')}</h2>
          <div className="task-grid">
            <div>
              <strong>
                {tr(lang, 'Last verified backup upload', 'Son doğrulanan yedek yüklemesi')}
              </strong>
              <p>
                {data.backup_runs
                  ?.filter((r) => r.status === 'verified')
                  .sort((a, b) => b.finished_at.localeCompare(a.finished_at))[0]?.finished_at
                  ? new Date(
                      data.backup_runs
                        .filter((r) => r.status === 'verified')
                        .sort((a, b) => b.finished_at.localeCompare(a.finished_at))[0].finished_at,
                    ).toLocaleString(lang === 'tr' ? 'tr-TR' : 'en-GB')
                  : tr(
                      lang,
                      'No verified upload recorded. Set up backup automation before relying on this school.',
                      'Doğrulanmış yükleme kaydı yok. Canlı kullanım öncesi yedeklemeyi kurun.',
                    )}
              </p>
              {!data.backup_runs?.some(
                (r) =>
                  r.status === 'verified' &&
                  new Date(r.finished_at).getTime() > Date.now() - 86400000,
              ) && (
                <Badge tone="red">
                  {tr(
                    lang,
                    'Backup missing or older than 24 hours',
                    'Yedek yok veya 24 saatten eski',
                  )}
                </Badge>
              )}
              <small>
                {tr(
                  lang,
                  'Upload verification does not replace an isolated restore drill.',
                  'Yükleme doğrulaması ayrı ortamda geri yükleme provasının yerine geçmez.',
                )}
              </small>
            </div>
            <div>
              <strong>{tr(lang, 'Email notifications', 'E-posta bildirimleri')}</strong>
              <p>
                {
                  data.notification_outbox.filter(
                    (n) => n.status === 'pending' || n.status === 'processing',
                  ).length
                }{' '}
                {tr(lang, 'waiting', 'bekliyor')} ·{' '}
                {data.notification_outbox.filter((n) => n.status === 'failed').length}{' '}
                {tr(lang, 'failed', 'başarısız')}
              </p>
              <p>
                {tr(
                  lang,
                  'Administrator: review failures and contact the school technical owner.',
                  'Yönetici: hataları inceleyin ve okulun teknik sorumlusuna başvurun.',
                )}
              </p>
            </div>
          </div>
        </section>
      )}
    </>
  );
}

export function LessonWorkspace(props: PageProps & { children: React.ReactNode }) {
  const classroom = props.data.classes.find((c) => c.id === props.context?.classId);
  const session = props.data.sessions.find(
    (s) => s.id === props.context?.sessionId && s.class_id === classroom?.id,
  );
  const management = props.user.roles.some((r) =>
    ['administrator', 'academic_manager'].includes(r),
  );
  if (!classroom || !session || (!management && classroom.teacher_id !== props.user.id))
    return (
      <EmptyState
        title={tr(
          props.lang,
          'Choose an assigned lesson from Today',
          'Bugün bölümünden size atanmış bir ders seçin',
        )}
        description={tr(
          props.lang,
          'This lesson is unavailable in your workspace.',
          'Bu ders çalışma alanınızda kullanılamıyor.',
        )}
      />
    );
  return (
    <>
      <section className="card padded lesson-context">
        <div>
          <BookOpen size={24} />
          <h2>
            {classroom?.name ||
              tr(props.lang, 'Choose a lesson from Today', 'Bugün bölümünden ders seçin')}
          </h2>
          {session && (
            <p>
              {new Date(session.starts_at).toLocaleString(props.lang === 'tr' ? 'tr-TR' : 'en-GB', {
                timeZone: schoolTimezone(props.data),
                dateStyle: 'medium',
                timeStyle: 'short',
              })}
            </p>
          )}
        </div>
        <div className="inline-actions">
          <Button variant="secondary" onClick={() => props.navigate?.('overview')}>
            {tr(props.lang, 'Today', 'Bugün')}
          </Button>
          <Button
            variant="secondary"
            onClick={() => props.navigate?.('curriculum', { classId: classroom?.id })}
          >
            {tr(props.lang, 'Topics taught', 'İşlenen konular')}
          </Button>
          <Button
            variant="secondary"
            onClick={() => props.navigate?.('materials', { classId: classroom?.id })}
          >
            {tr(props.lang, 'Materials', 'Materyaller')}
          </Button>
          <Button
            variant="secondary"
            onClick={() => props.navigate?.('guidance', { studentId: props.context?.studentId })}
          >
            {tr(props.lang, 'Ask for support', 'Destek iste')}
          </Button>
        </div>
      </section>
      {props.children}
    </>
  );
}
