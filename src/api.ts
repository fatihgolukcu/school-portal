import { createClient } from '@supabase/supabase-js';
import type { PortalApi, Snapshot, Profile } from './types';
import { materialLessons } from './workflow';
const url = import.meta.env.VITE_SUPABASE_URL;
const key = import.meta.env.VITE_SUPABASE_ANON_KEY;
export const supabase = url && key ? createClient(url, key) : null;
export const tableNames = [
  'profiles',
  'school_settings',
  'students',
  'guardians',
  'placements',
  'academic_years',
  'periods',
  'subjects',
  'levels',
  'packages',
  'package_subjects',
  'dimensions',
  'classes',
  'class_groups',
  'package_classes',
  'package_levels',
  'enrollments',
  'sessions',
  'attendance',
  'assessments',
  'configurations',
  'curriculum_progress',
  'reports',
  'parent_reports',
  'guidance_cases',
  'guidance_notes',
  'guidance_stage_events',
  'parent_guidance',
  'charges',
  'payments',
  'allocations',
  'audit_log',
  'notification_outbox',
  'learning_materials',
  'class_slots',
  'curriculum_weeks',
  'backup_runs',
];
export const blankSnapshot = () =>
  Object.fromEntries(tableNames.map((t) => [t, []])) as unknown as Snapshot;
export function liveApi(user: Profile): PortalApi {
  const db = supabase!;
  return {
    mode: 'live',
    async uploadMaterial(objectKey, file) {
      const { error } = await db.storage
        .from('learning-materials')
        .upload(objectKey, file, { upsert: false, contentType: file.type });
      if (error) {
        // A timeout may occur after the immutable object has been stored. Never
        // overwrite it: only accept a retry if the bytes match exactly.
        const existing = await db.storage.from('learning-materials').download(objectKey);
        if (existing.error || !existing.data || existing.data.size !== file.size) throw error;
        const digest = async (blob: Blob) =>
          Array.from(
            new Uint8Array(await crypto.subtle.digest('SHA-256', await blob.arrayBuffer())),
          ).join(',');
        if ((await digest(existing.data)) !== (await digest(file))) throw error;
      }
    },
    async materialUrl(objectKey) {
      const { data, error } = await db.storage
        .from('learning-materials')
        .createSignedUrl(objectKey, 120);
      if (error) throw error;
      return data.signedUrl;
    },
    async snapshot(tables) {
      const result = blankSnapshot();
      const parentOnly = user.roles.every((r) => r === 'parent');
      const excluded = parentOnly
        ? [
            'placements',
            'attendance',
            'assessments',
            'configurations',
            'reports',
            'guidance_cases',
            'guidance_notes',
            'guidance_stage_events',
            'audit_log',
            'notification_outbox',
            'backup_runs',
          ]
        : user.roles.includes('administrator')
          ? []
          : ['audit_log', 'notification_outbox', 'backup_runs'];
      await Promise.all(
        tableNames
          .filter((t) => !excluded.includes(t) && (!tables || tables.includes(t)))
          .map(async (table) => {
            const rows: any[] = [];
            const sort =
              table === 'guardians'
                ? 'student_id'
                : ['package_subjects', 'package_classes', 'package_levels'].includes(table)
                  ? 'package_id'
                  : table === 'curriculum_progress'
                    ? 'class_id'
                    : 'id';
            for (let offset = 0; ; offset += 1000) {
              const { data, error } = await db
                .from(table === 'students' ? 'student_directory' : table)
                .select('*')
                .order(sort)
                .range(offset, offset + 999);
              if (error) throw new Error(`${table}: ${error.message}`);
              rows.push(...data);
              if (data.length < 1000) break;
            }
            result[table] = rows;
          }),
      );
      result.academic_years.sort(
        (a, b) =>
          Number(b.active) - Number(a.active) ||
          String(b.starts_on).localeCompare(String(a.starts_on)),
      );
      result.periods.sort(
        (a, b) =>
          result.academic_years.findIndex((y) => y.id === a.academic_year_id) -
            result.academic_years.findIndex((y) => y.id === b.academic_year_id) ||
          Number(a.number) - Number(b.number),
      );
      if (parentOnly && !tables) {
        // Staff who are also parents can read more through their staff roles; the parent
        // view shows only their own children and those children's classes.
        const mine = new Set(
          result.guardians.filter((g) => g.profile_id === user.id).map((g) => g.student_id),
        );
        result.students = result.students.filter((s) => mine.has(s.id));
        for (const table of [
          'guardians',
          'enrollments',
          'charges',
          'payments',
          'parent_reports',
          'parent_guidance',
        ])
          result[table] = result[table].filter((row) => mine.has(row.student_id));
        const paymentIds = new Set(result.payments.map((p) => p.id));
        result.allocations = result.allocations.filter((a) => paymentIds.has(a.payment_id));
        const classIds = new Set(result.enrollments.map((e) => e.class_id));
        result.classes = result.classes.filter((c) => classIds.has(c.id));
        result.sessions = result.sessions.filter((s) => classIds.has(s.class_id));
        result.curriculum_progress = result.curriculum_progress.filter((c) =>
          classIds.has(c.class_id),
        );
        // The server already limits rows; this mirrors it for the family view.
        result.learning_materials = result.learning_materials.filter((m) => {
          if (m.status !== 'ready' || m.visible_to_guardians === false) return false;
          const lessons = new Set(materialLessons(m, result).map((c) => c.id));
          return result.enrollments.some(
            (e) =>
              lessons.has(e.class_id) &&
              !e.ended_on &&
              (!m.package_id ||
                result.students.some(
                  (s) => s.id === e.student_id && s.package_id === m.package_id,
                )),
          );
        });
        for (const student of result.students) {
          const { data, error } = await db.rpc('parent_attendance', { p_student_id: student.id });
          if (error) throw error;
          result.attendance.push(
            ...(data || []).map((x: any) => ({
              ...x,
              id: `${x.session_id}-${student.id}`,
              student_id: student.id,
            })),
          );
        }
        const { data: schedule, error } = await db.rpc('parent_schedule');
        if (error) throw error;
        for (const item of schedule || []) {
          const group = result.classes.find((c) => c.id === item.class_id);
          if (group && !result.profiles.some((p) => p.id === group.teacher_id))
            result.profiles.push({
              id: group.teacher_id,
              full_name: item.teacher_name,
              email: '',
              roles: ['teacher'],
              language: group.language,
            });
        }
      }
      return result;
    },
    async save(table, values) {
      // Ordinary record writes retain the signed-in user's RLS context.
      const composite: Record<string, string> = {
        package_subjects: 'package_id,subject_id',
        curriculum_progress: 'class_id,configuration_id,criterion_id',
        curriculum_weeks: 'class_id,criterion_id',
      };
      const query = composite[table]
        ? db.from(table).upsert(values, { onConflict: composite[table] })
        : values.id !== undefined
          ? db.from(table).update(values).eq('id', values.id)
          : db.from(table).insert(values);
      // Student fees are column-restricted; return the permitted directory projection.
      if (table === 'students') {
        const { error } = await query;
        if (error) throw error;
        const { data, error: readError } = await db
          .from('student_directory')
          .select('*')
          .eq('id', values.id)
          .single();
        if (readError) throw readError;
        return data;
      }
      const { data, error } = await query.select().single();
      if (error) throw error;
      return data;
    },
    async rpc(name, args = {}) {
      const { data, error } = await db.rpc(name, args);
      if (error) throw error;
      return data;
    },
    async invite(payload) {
      const {
        data: { session },
      } = await db.auth.getSession();
      const response = await fetch('/.netlify/functions/invite', {
        method: 'POST',
        headers: {
          'Content-Type': 'application/json',
          Authorization: `Bearer ${session?.access_token}`,
        },
        body: JSON.stringify({
          email: payload.email,
          username: payload.username,
          password: payload.password,
          fullName: payload.full_name,
          roles: payload.roles,
          studentIds: payload.student_ids,
          language: payload.language || 'tr',
        }),
      });
      const body = await response.json();
      if (!response.ok) throw new Error(body.error || 'Invitation failed');
      return body;
    },
    async manageUser(payload) {
      const {
        data: { session },
      } = await db.auth.getSession();
      const response = await fetch('/.netlify/functions/manage-user', {
        method: 'POST',
        headers: {
          'Content-Type': 'application/json',
          Authorization: `Bearer ${session?.access_token}`,
        },
        body: JSON.stringify(payload),
      });
      const body = await response.json().catch(() => ({}));
      if (!response.ok)
        throw Object.assign(new Error(body.error || 'Account action failed'), { code: body.code });
      return body;
    },
  };
}
