import { useEffect, useId, useRef } from 'react';
import type { Snapshot, RecordRow, Lang, PageProps } from './types';

export function portalRoute(view: string, context: PageProps['context'] = {}) {
  if (view === 'family_setup')
    return { view: 'students', context: { ...context, action: 'family' } };
  if (view === 'help') return { view: 'guide', context: {} };
  return { view, context };
}

export const schoolDay = (value: string | Date = new Date(), timezone = 'Europe/Warsaw') => {
  const parts = new Intl.DateTimeFormat('en-GB', {
    timeZone: timezone,
    year: 'numeric',
    month: '2-digit',
    day: '2-digit',
  }).formatToParts(new Date(value));
  const part = (type: string) => parts.find((p) => p.type === type)?.value;
  return `${part('year')}-${part('month')}-${part('day')}`;
};
export const schoolTimezone = (data: Snapshot) =>
  data.school_settings[0]?.timezone || 'Europe/Warsaw';
export const todaySession = (sessions: RecordRow[], timezone: string) => {
  const today = schoolDay(new Date(), timezone);
  const candidates = sessions.filter(
    (s) => s.status !== 'cancelled' && schoolDay(s.starts_at, timezone) === today,
  );
  return candidates.length === 1 ? candidates[0].id : '';
};
/** Subject code of the specialist lesson. It has its own level codes (C1, T1…, kind 'specialist'). */
export const SPECIALIST_SUBJECT = 'B1';
export const isSpecialistSubject = (subjectId: unknown, data: Pick<Snapshot, 'subjects'>) =>
  !!subjectId &&
  (data.subjects || []).some(
    (subject) => subject.id === subjectId && subject.code === SPECIALIST_SUBJECT,
  );
/** Active levels a lesson of this subject can have: Specialist levels for the specialist lesson,
 * class levels (başlangıç, orta…) for every other subject. */
export const levelsForSubject = (
  subjectId: unknown,
  data: Pick<Snapshot, 'subjects' | 'levels'>,
) => {
  const specialist = isSpecialistSubject(subjectId, data);
  return (data.levels || []).filter(
    (level) => level.active !== false && (level.kind === 'specialist') === specialist,
  );
};
/** A lesson's level: its own level, or the level of its class group when it has none.
 * The specialist lesson never takes the class level; it only has its own Specialist level. */
export const classLevelId = (
  lesson: Record<string, any>,
  data: Pick<Snapshot, 'class_groups' | 'subjects'>,
): string =>
  lesson.level_id ||
  (isSpecialistSubject(lesson.subject_id, data)
    ? ''
    : (data.class_groups || []).find((group) => group.id === lesson.group_id)?.level_id) ||
  '';
/** A current enrollment whose student has not left the school (status 'archived'). Class
 * registers, counts and attendance show only these; reports keep the full history. */
export const activeStudentEnrollment = (enrollment: RecordRow, data: Pick<Snapshot, 'students'>) =>
  (data.students || []).find((student) => student.id === enrollment.student_id)?.status !==
  'archived';
/** Lessons a material belongs to: its own lesson, or every lesson of its subject within its
 * optional level and class. */
export const materialLessons = (
  material: Record<string, any>,
  data: Pick<Snapshot, 'classes' | 'class_groups' | 'subjects'>,
) =>
  data.classes.filter((lesson) =>
    material.class_id
      ? lesson.id === material.class_id
      : lesson.subject_id === material.subject_id &&
        (!material.level_id || classLevelId(lesson, data) === material.level_id) &&
        (!material.group_id || lesson.group_id === material.group_id),
  );

/** The UTC instant of a wall-clock date and time in the school's time zone. */
export function zonedDate(day: string, time: string, timeZone: string) {
  const guess = new Date(`${day}T${time.slice(0, 5)}:00Z`);
  const parts = new Intl.DateTimeFormat('en-GB', {
    timeZone,
    hourCycle: 'h23',
    year: 'numeric',
    month: '2-digit',
    day: '2-digit',
    hour: '2-digit',
    minute: '2-digit',
  }).formatToParts(guess);
  const part = (type: string) => Number(parts.find((p) => p.type === type)?.value);
  const shown = Date.UTC(
    part('year'),
    part('month') - 1,
    part('day'),
    part('hour'),
    part('minute'),
  );
  return new Date(guess.getTime() - (shown - guess.getTime()));
}

const dayNumber = (day: string) => Math.floor(Date.parse(`${day}T12:00:00Z`) / 86400000);
/** Week of a school day in a lesson plan: week 1 starts on plan_starts_on. */
export const planWeek = (lesson: Record<string, any>, day: string) =>
  lesson?.plan_starts_on && day >= lesson.plan_starts_on
    ? Math.floor((dayNumber(day) - dayNumber(lesson.plan_starts_on)) / 7) + 1
    : null;
/** Number of weeks in a plan with both dates set. */
export const planWeekCount = (lesson: Record<string, any>) =>
  lesson?.plan_starts_on && lesson?.plan_ends_on
    ? Math.floor((dayNumber(lesson.plan_ends_on) - dayNumber(lesson.plan_starts_on)) / 7) + 1
    : null;

/**
 * Future lesson dates of a plan (same rules as the server's plan_class_sessions): every
 * weekly slot from plan_starts_on to plan_ends_on (or the academic year's end), skipping
 * plan_skip_weeks. Returned as ISO strings.
 */
export function planDates(
  lesson: Record<string, any>,
  slots: Record<string, any>[],
  lastDay: string | null | undefined,
  timeZone: string,
  now = new Date(),
) {
  const end = lesson.plan_ends_on || lastDay;
  if (!lesson.plan_starts_on || !end) return [];
  const skip = new Set<number>((lesson.plan_skip_weeks || []).map(Number));
  const out: string[] = [];
  for (let n = dayNumber(lesson.plan_starts_on); n <= dayNumber(end); n++) {
    const day = new Date(n * 86400000).toISOString().slice(0, 10);
    const weekday = new Date(`${day}T12:00:00Z`).getUTCDay();
    if (skip.has(planWeek(lesson, day)!)) continue;
    for (const slot of slots.filter((s) => Number(s.weekday) === weekday)) {
      const at = zonedDate(day, String(slot.start_time), timeZone);
      if (at > now) out.push(at.toISOString());
    }
  }
  return [...new Set(out)].sort();
}

/** Levels used by at least one of the given lessons, in their stored order. */
export const levelsInUse = (
  lessons: Record<string, any>[],
  data: Pick<Snapshot, 'class_groups' | 'levels' | 'subjects'>,
) => {
  const used = new Set(lessons.map((lesson) => classLevelId(lesson, data)).filter(Boolean));
  return (data.levels || []).filter((level) => used.has(level.id));
};
export const enrollmentOn = (enrollment: RecordRow, day: string) =>
  enrollment.started_on <= day && (!enrollment.ended_on || enrollment.ended_on >= day);

const pending = new Map<string, { dirty: boolean; busy: boolean }>();
export function confirmLeave(lang: Lang) {
  if ([...pending.values()].some((p) => p.busy)) {
    window.alert(
      lang === 'tr' ? 'Kaydetme tamamlanana kadar bekleyin.' : 'Please wait until saving finishes.',
    );
    return false;
  }
  if (![...pending.values()].some((p) => p.dirty)) return true;
  const accepted = window.confirm(
    lang === 'tr'
      ? 'Henüz kaydedilmemiş değişiklikler var. Değişiklikleri bırakıp devam etmek istiyor musunuz?'
      : 'You have changes that are not saved yet. Discard them and continue?',
  );
  return accepted;
}
export function useUnsavedChanges(dirty: boolean, lang: Lang, busy = false) {
  const key = useId();
  const current = useRef({ dirty, busy });
  current.current = { dirty, busy };
  useEffect(() => {
    pending.set(key, { dirty, busy });
    return () => {
      pending.delete(key);
    };
  }, [key, dirty, busy]);
  useEffect(() => {
    const unload = (event: BeforeUnloadEvent) => {
      if (!current.current.dirty && !current.current.busy) return;
      event.preventDefault();
      event.returnValue = '';
    };
    window.addEventListener('beforeunload', unload);
    return () => window.removeEventListener('beforeunload', unload);
  }, []);
  return () => {
    if (busy) {
      window.alert(
        lang === 'tr'
          ? 'Kaydetme tamamlanana kadar bekleyin.'
          : 'Please wait until saving finishes.',
      );
      return false;
    }
    return (
      !dirty ||
      window.confirm(
        lang === 'tr'
          ? 'Kaydedilmeyen değişiklikleri bırakıp devam etmek istiyor musunuz?'
          : 'Discard the changes that are not saved yet and continue?',
      )
    );
  };
}
