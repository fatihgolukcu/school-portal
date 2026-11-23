import type { RecordRow, Snapshot } from './types';
import { SPECIALIST_SUBJECT } from './workflow';

/** Subjects that belong to the full package besides the Specialist class. */
export const FULL_PACKAGE_SUBJECTS = ['B2', 'B3', 'B4', 'B5'];

export interface EnrollmentPlan {
  classIds: string[];
  /** Subject or Specialist classes that could not be found (shown as warnings). */
  missing: RecordRow[];
}

/**
 * Same rule as scripts/import-roster.mjs:
 * - every student joins the Specialist class of their Specialist teacher in their course language;
 * - full-package students also join the subject classes for their course language and level.
 */
export function classesForStudent(
  student: {
    language: string;
    class_level_id?: string | null;
    package_code?: string | null;
    specialist_teacher_id?: string | null;
  },
  data: Pick<Snapshot, 'classes' | 'subjects' | 'academic_years'>,
): EnrollmentPlan {
  const activeYear = data.academic_years.find((year) => year.active)?.id;
  const open = data.classes.filter(
    (group) =>
      group.active !== false &&
      group.language === student.language &&
      (!activeYear || !group.academic_year_id || group.academic_year_id === activeYear),
  );
  const subject = (code: string) => data.subjects.find((item) => item.code === code);
  const classIds: string[] = [];
  const missing: RecordRow[] = [];
  if (student.specialist_teacher_id) {
    const specialist = subject(SPECIALIST_SUBJECT);
    const group = open.find(
      (item) => item.subject_id === specialist?.id && item.teacher_id === student.specialist_teacher_id,
    );
    if (group) classIds.push(group.id);
    else if (specialist) missing.push(specialist);
  }
  if (student.package_code === 'full' && student.class_level_id) {
    for (const code of FULL_PACKAGE_SUBJECTS) {
      const item = subject(code);
      if (!item) continue;
      const group = open.find(
        (entry) => entry.subject_id === item.id && entry.level_id === student.class_level_id,
      );
      if (group) classIds.push(group.id);
      else missing.push(item);
    }
  }
  return { classIds, missing };
}
