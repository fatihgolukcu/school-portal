export type Lang = 'en' | 'tr';
export type Role = 'administrator' | 'academic_manager' | 'teacher' | 'guidance' | 'parent';
export interface RecordRow {
  id: string;
  [key: string]: any;
}
export interface Profile extends RecordRow {
  full_name: string;
  email: string;
  roles: Role[];
  language: Lang;
}
export interface Snapshot {
  [table: string]: RecordRow[];
  profiles: Profile[];
  students: RecordRow[];
  guardians: RecordRow[];
  academic_years: RecordRow[];
  periods: RecordRow[];
  subjects: RecordRow[];
  levels: RecordRow[];
  packages: RecordRow[];
  classes: RecordRow[];
  class_groups: RecordRow[];
  package_classes: RecordRow[];
  package_levels: RecordRow[];
  enrollments: RecordRow[];
  sessions: RecordRow[];
  attendance: RecordRow[];
  assessments: RecordRow[];
  configurations: RecordRow[];
  reports: RecordRow[];
  parent_reports: RecordRow[];
  guidance_cases: RecordRow[];
  guidance_notes: RecordRow[];
  guidance_stage_events: RecordRow[];
  parent_guidance: RecordRow[];
  charges: RecordRow[];
  payments: RecordRow[];
  allocations: RecordRow[];
  audit_log: RecordRow[];
  notification_outbox: RecordRow[];
  school_settings: RecordRow[];
  package_subjects: RecordRow[];
  dimensions: RecordRow[];
  placements: RecordRow[];
  curriculum_progress: RecordRow[];
  class_slots: RecordRow[];
  curriculum_weeks: RecordRow[];
}
export interface InvitePayload {
  /** Real email for invitations; ignored when `username` is set. */
  email: string;
  /** Username accounts sign in without email; the administrator sets the password. */
  username?: string;
  password?: string;
  full_name: string;
  roles: string[];
  student_ids?: string[];
  language?: Lang;
}
/** Administrator account tools handled by the manage-user server function. */
export type ManageUserPayload =
  | { action: 'set_password'; userId: string; password: string }
  | { action: 'send_reset'; userId: string }
  | { action: 'delete'; userId: string };
export interface PortalApi {
  mode: 'live' | 'demo';
  snapshot(tables?: string[]): Promise<Snapshot>;
  save(table: string, values: Record<string, any>): Promise<any>;
  rpc(name: string, args?: Record<string, any>): Promise<any>;
  invite(payload: InvitePayload): Promise<any>;
  manageUser(payload: ManageUserPayload): Promise<{ ok: boolean; loginRemains?: boolean }>;
  uploadMaterial?(objectKey: string, file: File): Promise<void>;
  materialUrl?(objectKey: string): Promise<string>;
}
/** The school bills only in euro and złoty; the database enforces the same list. */
export const CURRENCIES = ['EUR', 'PLN'] as const;
export const isCurrency = (value: unknown): value is (typeof CURRENCIES)[number] =>
  CURRENCIES.includes(value as (typeof CURRENCIES)[number]);
/** Terms per academic year; term 5 is the summer school. */
export const MAX_TERM = 5;
export const SUMMER_TERM = { number: 5, name_en: 'Summer School', name_tr: 'Yaz Okulu' };
export interface PageProps {
  data: Snapshot;
  lang: Lang;
  api: PortalApi;
  refresh: (tables?: string[]) => Promise<void>;
  notify: (message: string, kind?: 'success' | 'error') => void;
  user: Profile;
  context?: {
    classId?: string;
    sessionId?: string;
    studentId?: string;
    periodId?: string;
    action?: string;
  };
  navigate?: (view: string, context?: PageProps['context']) => void;
}
