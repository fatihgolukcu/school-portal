import {
  Component,
  useCallback,
  useEffect,
  useMemo,
  useRef,
  useState,
  type ReactNode,
} from 'react';
import {
  ArrowRight,
  Bell,
  BookOpen,
  CalendarDays,
  CheckCircle2,
  ChevronDown,
  ChevronRight,
  CircleHelp,
  ClipboardCheck,
  CreditCard,
  FileCheck2,
  GraduationCap,
  HeartHandshake,
  KeyRound,
  Languages,
  LayoutDashboard,
  LogOut,
  Menu,
  Settings2,
  ShieldCheck,
  SlidersHorizontal,
  Sparkles,
  Sprout,
  Users,
  X,
} from 'lucide-react';
import type { Lang, PageProps, Profile, Snapshot } from './types';
import { blankSnapshot, liveApi, supabase } from './api';
import { displayLogin, isUsername, toLoginEmail } from './accounts';
import { createDemoApi, demoAdmin, demoParent, demoTeacher } from './demo';
import {
  StudentsPage,
  PeoplePage,
  ClassesPage,
  GuidancePage,
  FinancePage,
} from './pages/operations';
import { AssessmentsPage, AttendancePage, ReportsPage, CurriculumPage } from './pages/academic';
import { ConfigurationPage, SettingsPage } from './pages/configuration';
import { WorkspaceHome, LessonWorkspace } from './pages/workspace';
import { MaterialsPage } from './pages/materials';
import { GuidePage, guidePageFor } from './pages/guide';
import { ControlPage } from './pages/control';
import { confirmLeave, portalRoute, schoolDay, schoolTimezone } from './workflow';
import {
  Badge,
  Button,
  EmptyState,
  Field,
  MenuButton,
  Modal,
  fullName,
  initials,
  label,
  tr,
} from './ui';

class ErrorBoundary extends Component<{ children: ReactNode }, { error: string }> {
  state = { error: '' };
  static getDerivedStateFromError(error: Error) {
    return { error: error.message };
  }
  componentDidCatch(error: Error, info: { componentStack?: string | null }) {
    // Keeps the exact location of a crash in the browser console for support.
    console.error(error, info.componentStack);
  }
  render() {
    return this.state.error ? (
      <main className="fatal-error">
        <h1>Something needs attention / Bir sorun oluştu</h1>
        <p>{this.state.error}</p>
        <Button onClick={() => window.location.reload()}>Reload / Yenile</Button>
      </main>
    ) : (
      this.props.children
    );
  }
}
const navigation = [
  { key: 'overview', en: 'Overview', tr: 'Genel bakış', icon: LayoutDashboard, roles: [] },
  {
    key: 'lesson',
    en: 'Lesson workspace',
    tr: 'Ders çalışma alanı',
    icon: BookOpen,
    roles: ['administrator', 'academic_manager', 'teacher'],
  },
  {
    key: 'materials',
    en: 'Learning materials',
    tr: 'Ders materyalleri',
    icon: BookOpen,
    roles: ['administrator', 'academic_manager', 'teacher', 'parent'],
  },
  { key: 'students', en: 'Students', tr: 'Öğrenciler', icon: Users, roles: [] },
  {
    key: 'people',
    en: 'Our team',
    tr: 'Ekibimiz',
    icon: GraduationCap,
    roles: ['administrator', 'academic_manager'],
  },
  { key: 'classes', en: 'Classes & lessons', tr: 'Sınıflar ve dersler', icon: BookOpen, roles: [] },
  {
    key: 'curriculum',
    en: 'Curriculum',
    tr: 'Müfredat',
    icon: Sprout,
    roles: ['administrator', 'academic_manager', 'teacher'],
  },
  {
    key: 'attendance',
    en: 'Attendance',
    tr: 'Yoklama',
    icon: ClipboardCheck,
    roles: ['administrator', 'academic_manager', 'teacher'],
  },
  {
    key: 'assessments',
    en: 'Assessments',
    tr: 'Değerlendirmeler',
    icon: CheckCircle2,
    roles: ['administrator', 'academic_manager', 'teacher'],
  },
  { key: 'reports', en: 'Report cards', tr: 'Karneler', icon: FileCheck2, roles: [] },
  {
    key: 'guidance',
    en: 'Guidance & care',
    tr: 'Rehberlik ve destek',
    icon: HeartHandshake,
    roles: [],
  },
  {
    key: 'finance',
    en: 'Payments',
    tr: 'Ödemeler',
    icon: CreditCard,
    roles: ['administrator', 'parent'],
  },
  {
    key: 'configuration',
    en: 'Questions & rules',
    tr: 'Sorular ve kurallar',
    icon: SlidersHorizontal,
    roles: ['administrator', 'academic_manager'],
  },
  {
    key: 'settings',
    en: 'School settings',
    tr: 'Okul ayarları',
    icon: Settings2,
    roles: ['administrator'],
  },
  {
    key: 'control',
    en: 'Checks & reports',
    tr: 'Kontrol ve raporlar',
    icon: ClipboardCheck,
    roles: ['administrator', 'academic_manager', 'teacher'],
  },
  { key: 'guide', en: 'User guide', tr: 'Kullanım kılavuzu', icon: CircleHelp, roles: [] },
];
// Turkish unless the person chose English.
const initialLang = (): Lang => (localStorage.getItem('portal-language') === 'en' ? 'en' : 'tr');
const roleLabel = (role: string, lang: Lang) =>
  (
    ({
      administrator: tr(lang, 'Administrator', 'Yönetici'),
      academic_manager: tr(lang, 'Academic manager', 'Akademik yönetici'),
      teacher: tr(lang, 'Teacher', 'Öğretmen'),
      guidance: tr(lang, 'Guidance', 'Rehberlik'),
      parent: tr(lang, 'Parent', 'Veli'),
    }) as Record<string, string>
  )[role] || role;

function Login({
  lang,
  onDemo,
  onLanguage,
  recovery,
  onRecoveryDone,
}: {
  lang: Lang;
  onDemo: () => void;
  onLanguage: () => void;
  recovery: boolean;
  onRecoveryDone: () => void;
}) {
  const [email, setEmail] = useState('');
  const [password, setPassword] = useState('');
  const [reset, setReset] = useState(false);
  const [busy, setBusy] = useState(false);
  const [message, setMessage] = useState('');
  const [error, setError] = useState('');
  const demoAllowed = import.meta.env.DEV || import.meta.env.VITE_ENABLE_DEMO === 'true';
  async function submit() {
    if (!supabase) return;
    setBusy(true);
    setError('');
    setMessage('');
    try {
      if (recovery) {
        const { error } = await supabase.auth.updateUser({ password });
        if (error) throw error;
        onRecoveryDone();
      } else if (reset) {
        if (isUsername(email)) {
          setError(
            tr(
              lang,
              'Username accounts are reset by a school administrator. Please contact them.',
              'Kullanıcı adı hesaplarının şifresini okul yöneticisi yeniler. Lütfen onlara başvurun.',
            ),
          );
          return;
        }
        const { error } = await supabase.auth.resetPasswordForEmail(email.trim(), {
          redirectTo: `${window.location.origin}/reset-password`,
        });
        if (error) throw error;
        setMessage(
          tr(
            lang,
            'If your account exists, a recovery link has been sent.',
            'Hesabınız varsa kurtarma bağlantısı gönderildi.',
          ),
        );
      } else {
        const { error } = await supabase.auth.signInWithPassword({
          email: toLoginEmail(email),
          password,
        });
        if (error) throw error;
      }
    } catch (e) {
      setError(
        tr(lang, 'We could not complete this request. ', 'Bu işlem tamamlanamadı. ') +
          (e as Error).message,
      );
    } finally {
      setBusy(false);
    }
  }
  return (
    <div className="login-layout">
      <section className="login-story">
        <img src="/favicon.svg" alt="School Portal" className="login-logo" />
        <div className="story-content">
          <span className="eyebrow">
            {tr(lang, 'LEARN. CONNECT. GROW.', 'ÖĞREN. PAYLAŞ. GELİŞ.')}
          </span>
          <h1>
            {tr(lang, 'Little hearts.', 'Küçük kalpler.')}
            <br />
            <em>{tr(lang, 'Bright futures.', 'Aydınlık yarınlar.')}</em>
          </h1>
          <p>
            {tr(
              lang,
              'A caring space for learning, faith and every child’s unique journey.',
              'Öğrenme, inanç ve her çocuğun eşsiz yolculuğu için özenli bir alan.',
            )}
          </p>
          <div className="story-art" aria-hidden="true">
            <div className="art-sun">
              <Sparkles />
            </div>
            <div className="art-window">
              <BookOpen />
              <span>علم</span>
            </div>
            <div className="art-leaf leaf-one" />
            <div className="art-leaf leaf-two" />
            <div className="art-pot" />
            <div className="art-star">✦</div>
            <div className="art-dots">
              · · ·<br />· · ·
            </div>
          </div>
          <div className="story-footer">
            <ShieldCheck size={17} />
            {tr(
              lang,
              'A school and family space, built with care.',
              'Okul ve aileler için özenle tasarlandı.',
            )}
          </div>
        </div>
      </section>
      <section className="login-form-section">
        <button className="language-button login-language" onClick={onLanguage}>
          {lang === 'en' ? 'TR · Türkçe' : 'EN · English'}
        </button>
        <div className="login-form-card">
          <div className="login-mark">
            <Sprout size={27} />
          </div>
          <h2>
            {recovery
              ? tr(lang, 'Make yourself at home', 'Aramıza hoş geldiniz')
              : reset
                ? tr(lang, 'Let’s get you back in', 'Hesabınıza geri dönün')
                : tr(lang, 'Welcome to your school', 'Okulunuza hoş geldiniz')}
          </h2>
          <p>
            {recovery
              ? tr(
                  lang,
                  'Choose a password to secure your account.',
                  'Hesabınız için güvenli bir şifre belirleyin.',
                )
              : reset
                ? tr(
                    lang,
                    'Enter the email linked to your account.',
                    'Hesabınıza bağlı e-posta adresini girin.',
                  )
                : tr(
                    lang,
                    'Sign in to continue your learning journey.',
                    'Öğrenme yolculuğuna devam etmek için giriş yapın.',
                  )}
          </p>
          {supabase ? (
            <form
              onSubmit={(e) => {
                e.preventDefault();
                submit();
              }}
              className="stack"
            >
              {!recovery && (
                <Field
                  label={
                    reset
                      ? tr(lang, 'Email address', 'E-posta adresi')
                      : tr(lang, 'Email or username', 'E-posta veya kullanıcı adı')
                  }
                  type={reset ? 'email' : 'text'}
                  autoComplete={reset ? 'email' : 'username'}
                  autoCapitalize="none"
                  spellCheck={false}
                  required
                  placeholder={
                    reset
                      ? 'you@example.com'
                      : tr(
                          lang,
                          'you@example.com or username',
                          'ornek@eposta.com veya kullanıcı adı',
                        )
                  }
                  value={email}
                  onChange={(e) => setEmail(e.target.value)}
                />
              )}{' '}
              {(!reset || recovery) && (
                <Field
                  label={tr(lang, 'Password', 'Şifre')}
                  type="password"
                  autoComplete={recovery ? 'new-password' : 'current-password'}
                  minLength={recovery ? 10 : undefined}
                  required
                  value={password}
                  onChange={(e) => setPassword(e.target.value)}
                />
              )}{' '}
              {error && (
                <div className="form-error" role="alert">
                  {error}
                </div>
              )}
              {message && <div className="notice notice-success">{message}</div>}
              <Button type="submit" disabled={busy}>
                {busy
                  ? tr(lang, 'One moment…', 'Bir an…')
                  : recovery
                    ? tr(lang, 'Set password', 'Şifre belirle')
                    : reset
                      ? tr(lang, 'Send recovery link', 'Kurtarma bağlantısı gönder')
                      : tr(lang, 'Sign in', 'Giriş yap')}
                <ArrowRight size={17} />
              </Button>
              {!recovery && (
                <button
                  type="button"
                  className="text-button"
                  onClick={() => {
                    setReset(!reset);
                    setError('');
                    setMessage('');
                  }}
                >
                  {reset
                    ? tr(lang, 'Back to sign in', 'Girişe dön')
                    : tr(lang, 'Forgot your password?', 'Şifrenizi mi unuttunuz?')}
                </button>
              )}
            </form>
          ) : (
            <div className="setup-message">
              <h3>{tr(lang, 'Your portal is ready to connect', 'Portalınız bağlantıya hazır')}</h3>
              <p>
                {tr(
                  lang,
                  'Connect the school’s Supabase project to enable secure staff and family accounts. Setup instructions are included with this project.',
                  'Personel ve veli hesapları için okulun Supabase projesini bağlayın. Kurulum yönergeleri proje içinde yer alır.',
                )}
              </p>
            </div>
          )}
          {demoAllowed && (
            <div className="demo-entry">
              <div className="divider">
                <span>{tr(lang, 'Take a look around', 'Portalımızı keşfedin')}</span>
              </div>
              <Button variant="secondary" onClick={onDemo}>
                {tr(lang, 'Explore the demo school', 'Örnek okulu keşfet')}
                <ArrowRight size={16} />
              </Button>
              <small>
                {tr(
                  lang,
                  'Fictional records. No account needed.',
                  'Örnek kayıtlar. Hesap gerekmez.',
                )}
              </small>
            </div>
          )}
          <p className="login-contact">
            {tr(
              lang,
              'Need access? Contact your school administrator.',
              'Erişim için okul yöneticinizle iletişime geçin.',
            )}
          </p>
        </div>
        <div className="login-footer">
          School Portal <span>·</span>{' '}
          {tr(lang, 'Growing together, with purpose.', 'Bir amaç için birlikte büyüyoruz.')}
        </div>
      </section>
    </div>
  );
}

function Overview({
  data,
  lang,
  user,
  navigate,
}: PageProps & { navigate: (view: string) => void }) {
  const parent = user.roles.every((r) => r === 'parent');
  const active = data.students.filter((s) => s.status !== 'archived');
  const attendance = data.attendance.filter((a) => !a.excused);
  const presence = attendance.length
    ? Math.round((attendance.filter((a) => a.status !== 'absent').length / attendance.length) * 100)
    : null;
  const open = data.guidance_cases.filter((c) => c.status !== 'resolved');
  const next = data.sessions
    .filter((s) => s.status === 'scheduled' && new Date(s.starts_at).getTime() > Date.now())
    .sort((a, b) => a.starts_at.localeCompare(b.starts_at))
    .slice(0, 4);
  const timezone = data.school_settings[0]?.timezone || 'Europe/Warsaw';
  const today = new Date().toLocaleDateString(lang === 'tr' ? 'tr-TR' : 'en-GB', {
    weekday: 'long',
    day: 'numeric',
    month: 'long',
    timeZone: timezone,
  });
  const metrics = [
    {
      title: tr(
        lang,
        parent ? 'My children' : 'Active students',
        parent ? 'Çocuklarım' : 'Aktif öğrenci',
      ),
      value: active.length,
      subtitle: tr(lang, 'Each one, a world of potential', 'Her biri ayrı bir potansiyel'),
      icon: Users,
      tone: 'blue',
      view: 'students',
    },
    {
      title: tr(lang, 'Attendance', 'Devam oranı'),
      value: presence === null ? '—' : `${presence}%`,
      subtitle: tr(lang, 'Across recorded lessons', 'Kaydedilen derslerde'),
      icon: ClipboardCheck,
      tone: 'green',
      view: parent ? 'students' : 'attendance',
    },
    {
      title: tr(lang, 'Learning groups', 'Öğrenme grupları'),
      value: data.classes.filter((c) => c.active).length,
      subtitle: tr(lang, 'Learning better, together', 'Birlikte daha iyi öğreniyoruz'),
      icon: BookOpen,
      tone: 'purple',
      view: 'classes',
    },
    {
      title: tr(
        lang,
        parent ? 'Published reports' : 'Guidance follow-ups',
        parent ? 'Yayınlanan karne' : 'Rehberlik takibi',
      ),
      value: parent ? data.parent_reports.filter((r) => r.current).length : open.length,
      subtitle: tr(
        lang,
        parent ? 'A picture of their progress' : 'A little extra care',
        parent ? 'Gelişimlerinin özeti' : 'Biraz daha fazla ilgi',
      ),
      icon: parent ? FileCheck2 : HeartHandshake,
      tone: 'teal',
      view: parent ? 'reports' : 'guidance',
    },
  ];
  const subjectCounts = data.subjects.map((s, i) => ({
    ...s,
    count: data.enrollments.filter(
      (e) => !e.ended_on && data.classes.some((c) => c.id === e.class_id && c.subject_id === s.id),
    ).length,
    tone: ['blue', 'green', 'pink', 'purple', 'teal'][i % 5],
  }));
  return (
    <>
      <div className="overview-intro">
        <div>
          <p className="eyebrow">{today}</p>
          <h1>{tr(lang, 'A lovely day to grow.', 'Gelişmek için güzel bir gün.')}</h1>
          <p>
            {tr(lang, 'Welcome back,', 'Tekrar hoş geldiniz,')} {user.full_name.split(' ')[0]}.{' '}
            {tr(lang, 'Here’s your school at a glance.', 'İşte okulunuzdan bir bakış.')}
          </p>
        </div>
        <Button variant="secondary" onClick={() => navigate('classes')}>
          <CalendarDays size={16} />
          {tr(lang, 'View timetable', 'Ders programı')}
        </Button>
      </div>
      <section className="welcome-banner">
        <div>
          <span className="banner-tag">
            <Sprout size={13} />
            {tr(lang, 'A LITTLE CARE. A WORLD OF GROWTH.', 'BİRAZ İLGİ. KOCAMAN BİR GELİŞİM.')}
          </span>
          <h2>
            {tr(lang, 'Small steps.', 'Küçük adımlar.')}
            <br />
            <span>{tr(lang, 'Brighter futures.', 'Aydınlık yarınlar.')}</span>
          </h2>
          <p>
            {tr(
              lang,
              'Every lesson, every conversation, every moment of care helps a young heart flourish.',
              'Her ders, her sohbet, her ilgi dolu an küçük bir kalbin gelişmesine katkı sağlar.',
            )}
          </p>
          <button onClick={() => navigate(parent ? 'reports' : 'students')}>
            {tr(
              lang,
              parent ? 'See your children’s progress' : 'Meet your learners',
              parent ? 'Çocuklarınızın gelişimi' : 'Öğrencilerinizi tanıyın',
            )}
            <ArrowRight size={16} />
          </button>
        </div>
        <div className="banner-art" aria-hidden="true">
          <span className="sun-circle">
            <Sparkles size={38} />
          </span>
          <div className="arch arch-one">
            <BookOpen size={58} strokeWidth={1.25} />
          </div>
          <div className="arch arch-two">
            <Sprout size={56} strokeWidth={1.25} />
          </div>
          <span className="floating-star star-one">✦</span>
          <span className="floating-star star-two">✧</span>
          <div className="art-line" />
        </div>
      </section>
      <section className="overview-stats">
        {metrics.map((m) => (
          <button className="overview-stat" key={m.title} onClick={() => navigate(m.view)}>
            <span className={`stat-icon ${m.tone}`}>
              <m.icon size={21} />
            </span>
            <span className="stat-label">{m.title}</span>
            <strong>{m.value}</strong>
            <small>{m.subtitle}</small>
          </button>
        ))}
      </section>
      <div className="overview-columns">
        <section className="card">
          <div className="card-header">
            <div>
              <h3>{tr(lang, 'Coming up next', 'Sıradaki dersler')}</h3>
              <p className="muted">
                {tr(lang, 'Little moments of learning ahead', 'Önümüzdeki öğrenme anları')}
              </p>
            </div>
            <button className="text-button" onClick={() => navigate('classes')}>
              {tr(lang, 'View all', 'Tümü')}
              <ArrowRight size={14} />
            </button>
          </div>
          <div className="lesson-list">
            {next.length ? (
              next.map((s) => {
                const c = data.classes.find((c) => c.id === s.class_id);
                const subject = data.subjects.find((x) => x.id === c?.subject_id);
                const teacher = data.profiles.find((p) => p.id === c?.teacher_id);
                return (
                  <div className="upcoming-lesson" key={s.id}>
                    <div className="lesson-date">
                      <strong>
                        {new Date(s.starts_at).toLocaleDateString(
                          lang === 'tr' ? 'tr-TR' : 'en-GB',
                          { day: '2-digit', timeZone: timezone },
                        )}
                      </strong>
                      <span>
                        {new Date(s.starts_at).toLocaleDateString(
                          lang === 'tr' ? 'tr-TR' : 'en-GB',
                          { month: 'short', timeZone: timezone },
                        )}
                      </span>
                    </div>
                    <div className="lesson-information">
                      <strong>{c?.name}</strong>
                      <span>
                        {label(subject, lang)} · {teacher?.full_name || '—'}
                      </span>
                      <small>
                        {new Date(s.starts_at).toLocaleTimeString(
                          lang === 'tr' ? 'tr-TR' : 'en-GB',
                          { hour: '2-digit', minute: '2-digit', timeZone: timezone },
                        )}{' '}
                        · {s.duration_minutes} {tr(lang, 'min', 'dk')} ·{' '}
                        {c?.language?.toUpperCase()}
                      </small>
                    </div>
                    {c?.zoom_url ? (
                      <a className="lesson-join" href={c.zoom_url} target="_blank" rel="noreferrer">
                        {tr(lang, 'Join', 'Katıl')}
                        <ArrowRight size={14} />
                      </a>
                    ) : (
                      <ChevronRight size={16} />
                    )}
                  </div>
                );
              })
            ) : (
              <EmptyState
                title={tr(lang, 'A little space to plan', 'Planlamak için biraz alan')}
                description={tr(
                  lang,
                  'Your next scheduled lessons will appear here.',
                  'Planlanan sıradaki dersler burada görünecek.',
                )}
              />
            )}
          </div>
        </section>
        <section className="card">
          <div className="card-header">
            <div>
              <h3>{tr(lang, 'Learning, in every direction', 'Her alanda öğreniyoruz')}</h3>
              <p className="muted">
                {tr(lang, 'Our curriculum at a glance', 'Müfredatımıza bir bakış')}
              </p>
            </div>
            <BookOpen size={20} className="muted" />
          </div>
          <div className="subject-list">
            {subjectCounts.map((s) => (
              <div className="subject-item" key={s.id}>
                <span className={`subject-dot ${s.tone}`} />
                <div>
                  <span>{label(s, lang)}</span>
                  <div className="subject-track">
                    <span
                      className={s.tone}
                      style={{
                        width: `${active.length ? Math.min(100, (s.count / active.length) * 100) : 0}%`,
                      }}
                    />
                  </div>
                </div>
                <strong>{s.count}</strong>
              </div>
            ))}
          </div>
          <div className="card-note">
            <Sprout size={16} />
            {tr(
              lang,
              'Knowledge, character and confidence — together.',
              'Bilgi, karakter ve özgüven — birlikte.',
            )}
          </div>
        </section>
      </div>
      <section className="card learner-glance">
        <div className="card-header">
          <div>
            <h3>
              {tr(
                lang,
                parent ? 'Your little learners' : 'Our little learners',
                parent ? 'Küçük öğrencileriniz' : 'Küçük öğrencilerimiz',
              )}
            </h3>
            <p className="muted">
              {tr(
                lang,
                'A familiar face behind every record',
                'Her kaydın ardında tanıdık bir yüz',
              )}
            </p>
          </div>
          <button className="text-button" onClick={() => navigate('students')}>
            {tr(lang, 'View students', 'Öğrenciler')}
            <ArrowRight size={14} />
          </button>
        </div>
        <div className="learner-strip">
          {active.slice(0, 6).map((s, i) => (
            <button key={s.id} className="learner-chip" onClick={() => navigate('students')}>
              <span className={`avatar color-${i % 5}`}>{initials(s.first_name, s.last_name)}</span>
              <strong>{s.first_name}</strong>
              <span>{s.language === 'tr' ? 'Türkçe' : 'English'}</span>
            </button>
          ))}
          {!active.length && (
            <EmptyState
              title={tr(lang, 'Your school story starts here', 'Okul hikâyeniz burada başlıyor')}
              description={tr(
                lang,
                'Register your first student to begin.',
                'Başlamak için ilk öğrencinizi kaydedin.',
              )}
            />
          )}
        </div>
      </section>
    </>
  );
}

/** Signed-in password change: confirms the current password, then sets the new one. */
function ChangePassword({
  lang,
  email,
  demo,
  onClose,
  onDone,
}: {
  lang: Lang;
  email: string;
  demo: boolean;
  onClose: () => void;
  onDone: () => void;
}) {
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState('');
  return (
    <Modal
      title={tr(lang, 'Change my password', 'Şifremi değiştir')}
      onClose={onClose}
      lang={lang}
      bare
    >
      <form
        onSubmit={async (event) => {
          event.preventDefault();
          const form = new FormData(event.currentTarget);
          const current = String(form.get('current') || '');
          const next = String(form.get('next') || '');
          if (next.length < 10 || next.length > 72)
            return setError(
              tr(lang, 'Use a password of 10–72 characters.', 'Şifre 10–72 karakter olmalıdır.'),
            );
          if (next !== String(form.get('repeat') || ''))
            return setError(
              tr(lang, 'The new passwords do not match.', 'Yeni şifreler eşleşmiyor.'),
            );
          if (demo) return onDone();
          if (!supabase) return;
          setBusy(true);
          setError('');
          try {
            const check = await supabase.auth.signInWithPassword({ email, password: current });
            if (check.error)
              throw new Error(
                tr(lang, 'Your current password is not correct.', 'Mevcut şifreniz doğru değil.'),
              );
            const { error: updateError } = await supabase.auth.updateUser({ password: next });
            if (updateError) throw updateError;
            onDone();
          } catch (cause) {
            setError(cause instanceof Error ? cause.message : String(cause));
          } finally {
            setBusy(false);
          }
        }}
      >
        <div className="modal-body stack">
          {error && (
            <p className="form-error" role="alert">
              {error}
            </p>
          )}
          <Field
            label={tr(lang, 'Current password', 'Mevcut şifre')}
            name="current"
            type="password"
            autoComplete="current-password"
            required
          />
          <Field
            label={tr(lang, 'New password', 'Yeni şifre')}
            name="next"
            type="password"
            autoComplete="new-password"
            hint={tr(lang, 'At least 10 characters.', 'En az 10 karakter.')}
            required
          />
          <Field
            label={tr(lang, 'Repeat the new password', 'Yeni şifreyi tekrar yazın')}
            name="repeat"
            type="password"
            autoComplete="new-password"
            required
          />
        </div>
        <div className="modal-actions">
          <Button variant="secondary" onClick={onClose} disabled={busy}>
            {tr(lang, 'Cancel', 'Vazgeç')}
          </Button>
          <Button type="submit" disabled={busy} aria-busy={busy}>
            {tr(lang, 'Change password', 'Şifreyi değiştir')}
          </Button>
        </div>
      </form>
    </Modal>
  );
}

function readPortalRoute() {
  const params = new URLSearchParams(location.search);
  return portalRoute(params.get('view') || 'overview', {
    classId: params.get('class') || undefined,
    sessionId: params.get('session') || undefined,
    studentId: params.get('student') || undefined,
    periodId: params.get('period') || undefined,
    action: params.get('action') || undefined,
  });
}

function canonicalizeLegacyRoute() {
  const url = new URL(location.href);
  if (!['family_setup', 'help'].includes(url.searchParams.get('view') || '')) return;
  const route = readPortalRoute();
  url.searchParams.set('view', route.view);
  if (route.context?.action) url.searchParams.set('action', route.context.action);
  else url.searchParams.delete('action');
  history.replaceState({}, '', url);
}

function Portal() {
  const [lang, setLang] = useState<Lang>(initialLang);
  const [user, setUser] = useState<Profile | null>(null);
  // Staff who are also parents choose which side of the portal they are using.
  const [viewMode, setViewMode] = useState<'staff' | 'parent'>(() => {
    try {
      return localStorage.getItem('portal-view') === 'parent' ? 'parent' : 'staff';
    } catch {
      return 'staff';
    }
  });
  const dualRole =
    !!user && user.roles.includes('parent') && user.roles.some((role) => role !== 'parent');
  // The account as the pages see it: one side only for staff who are also parents.
  // Database permissions still follow the real roles; this only shapes the portal.
  const viewUser = useMemo<Profile | null>(
    () =>
      user && dualRole
        ? {
            ...user,
            roles:
              viewMode === 'parent' ? ['parent'] : user.roles.filter((role) => role !== 'parent'),
          }
        : user,
    [user, dualRole, viewMode],
  );
  const [demo, setDemo] = useState(false);
  const [data, setData] = useState<Snapshot>(blankSnapshot);
  const [view, setView] = useState(() => readPortalRoute().view);
  const [loading, setLoading] = useState(true);
  // Pages render only once data for the current API (user or demo role) has arrived, so their
  // initial selections (class, student…) are never computed from an empty snapshot.
  const [loadedApi, setLoadedApi] = useState<object | null>(null);
  const [loadError, setLoadError] = useState('');
  const [toast, setToast] = useState<{ message: string; kind: string } | null>(null);
  const toastRef = useRef<HTMLDivElement>(null);
  const toastKey = useRef(0);
  const [mobile, setMobile] = useState(false);
  const [caseId, setCaseId] = useState(new URLSearchParams(location.search).get('case') || '');
  const readContext = (): PageProps['context'] => readPortalRoute().context;
  const [context, setContext] = useState(readContext);
  const currentUrl = useRef(location.href);
  useEffect(() => {
    canonicalizeLegacyRoute();
    currentUrl.current = location.href;
  }, []);
  const languageRef = useRef(lang);
  languageRef.current = lang;
  const [passwordModal, setPasswordModal] = useState(false);
  const [alerts, setAlerts] = useState(false);
  const focusPage = useRef(false);
  const menuButton = useRef<HTMLButtonElement>(null);
  const [recovery, setRecovery] = useState(
    location.pathname === '/reset-password' ||
      new URLSearchParams(location.search).get('invite') === '1',
  );
  const api = useMemo(
    () => (viewUser ? (demo ? createDemoApi(viewUser) : liveApi(viewUser)) : null),
    [viewUser, demo],
  );
  const notify = useCallback((message: string, kind = 'success') => {
    toastKey.current += 1;
    setToast({ message, kind });
  }, []);
  const refresh = useCallback(
    async (tables?: string[]) => {
      if (!api) return;
      const snapshot = await api.snapshot(tables);
      setData((previous) =>
        tables
          ? ({
              ...previous,
              ...Object.fromEntries(tables.map((table) => [table, snapshot[table]])),
            } as Snapshot)
          : snapshot,
      );
      setLoadError('');
    },
    [api],
  );
  useEffect(() => {
    localStorage.setItem('portal-language', lang);
    document.documentElement.lang = lang;
  }, [lang]);
  useEffect(() => {
    if (!toast) return;
    // The toast joins the browser's top layer so it shows above an open dialog.
    try {
      toastRef.current?.showPopover();
    } catch {
      /* Older browsers fall back to the fixed-position toast. */
    }
    const timeout = setTimeout(() => setToast(null), 6500);
    return () => clearTimeout(timeout);
  }, [toast]);
  useEffect(() => {
    if (!supabase) {
      setLoading(false);
      return;
    }
    let mounted = true;
    const load = async (id?: string) => {
      if (!mounted) return;
      if (!id) {
        setUser(null);
        setData(blankSnapshot());
        setLoading(false);
        return;
      }
      const { data: profile, error } = await supabase!
        .from('profiles')
        .select('*')
        .eq('id', id)
        .single();
      if (!mounted) return;
      if (error || !profile?.active || !profile.roles?.length) {
        setLoadError(
          error?.message ||
            tr(
              lang,
              'Your school administrator needs to activate your access.',
              'Okul yöneticiniz erişiminizi etkinleştirmelidir.',
            ),
        );
        setUser(null);
      } else {
        setUser((previous) =>
          previous && JSON.stringify(previous) === JSON.stringify(profile)
            ? previous
            : (profile as Profile),
        );
        setLang(profile.language || 'en');
      }
      setLoading(false);
    };
    void supabase.auth.getSession().then(({ data: { session } }) => load(session?.user.id));
    const { data: listener } = supabase.auth.onAuthStateChange((event, session) => {
      if (event === 'PASSWORD_RECOVERY') setRecovery(true);
      if (event === 'SIGNED_OUT') {
        setUser(null);
        setData(blankSnapshot());
      }
      if (['SIGNED_IN', 'USER_UPDATED', 'TOKEN_REFRESHED'].includes(event))
        setTimeout(() => void load(session?.user.id), 0);
    });
    return () => {
      mounted = false;
      listener.subscription.unsubscribe();
    };
  }, []);
  useEffect(() => {
    if (!api) return;
    let active = true;
    setLoading(true);
    api
      .snapshot()
      .then((s) => {
        if (active) {
          setData(s);
          setLoadedApi(api);
          setLoadError('');
        }
      })
      .catch((e) => {
        if (active) setLoadError(e.message);
      })
      .finally(() => {
        if (active) setLoading(false);
      });
    return () => {
      active = false;
    };
  }, [api]);
  const available = navigation.filter(
    (n) => !n.roles.length || viewUser?.roles.some((r) => n.roles.includes(r)),
  );
  const teacherOnly =
    !!viewUser?.roles.includes('teacher') &&
    !viewUser.roles.some((r) => ['administrator', 'academic_manager', 'guidance'].includes(r));
  const primary = teacherOnly
    ? ['overview', 'classes', 'assessments', 'control', 'guide']
    : [
        'overview',
        ...available.filter((n) => !['overview', 'lesson'].includes(n.key)).map((n) => n.key),
      ];
  const navLabel = (n: (typeof navigation)[number]) =>
    teacherOnly
      ? {
          overview: tr(lang, 'Today', 'Bugün'),
          classes: tr(lang, 'My classes', 'Sınıflarım'),
          assessments: tr(lang, 'Student progress', 'Öğrenci gelişimi'),
        }[n.key] || (lang === 'tr' ? n.tr : n.en)
      : lang === 'tr'
        ? n.tr
        : n.en;
  const page =
    available.find((n) => n.key === view) || available.find((n) => n.key === 'overview')!;
  const pageName = navLabel(page);
  // Browser Back/Forward move between portal pages.
  useEffect(() => {
    const restore = () => {
      if (!confirmLeave(languageRef.current)) {
        history.pushState({}, '', currentUrl.current);
        return;
      }
      const params = new URLSearchParams(location.search);
      setView(readPortalRoute().view);
      setCaseId(params.get('case') || '');
      setContext(readContext());
      canonicalizeLegacyRoute();
      currentUrl.current = location.href;
      setMobile(false);
    };
    window.addEventListener('popstate', restore);
    return () => window.removeEventListener('popstate', restore);
  }, []);
  useEffect(() => {
    document.title = user
      ? `${pageName} · School Portal`
      : tr(lang, 'School Portal · School Portal', 'School Portal · Okul Portalı');
  }, [lang, pageName, user]);
  // After an in-app navigation, move focus to the new page's heading for keyboard and
  // screen-reader users.
  useEffect(() => {
    if (!focusPage.current || loading) return;
    focusPage.current = false;
    const main = document.getElementById('main-content');
    const heading = main?.querySelector<HTMLElement>('[data-page-title], h1');
    if (heading && !heading.hasAttribute('tabindex')) heading.setAttribute('tabindex', '-1');
    (heading || main)?.focus({ preventScroll: true });
  }, [page.key, loading]);
  // The mobile menu closes with Escape and returns focus to its toggle.
  useEffect(() => {
    if (!mobile) return;
    document.querySelector<HTMLElement>('#app-sidebar .nav-item')?.focus();
    const onKey = (event: KeyboardEvent) => {
      if (event.key !== 'Escape') return;
      setMobile(false);
      menuButton.current?.focus();
    };
    document.addEventListener('keydown', onKey);
    return () => document.removeEventListener('keydown', onKey);
  }, [mobile]);
  function navigate(key: string, next: string | PageProps['context'] = '', authorized = false) {
    if (!authorized && !confirmLeave(lang)) return;
    const nextCase = typeof next === 'string' ? next : '';
    const route = portalRoute(key, typeof next === 'object' ? next : {});
    const nextContext = route.context;
    setView(route.view);
    setCaseId(nextCase);
    setContext(nextContext);
    setMobile(false);
    const url = new URL(location.href);
    url.searchParams.set('view', route.view);
    if (nextCase) url.searchParams.set('case', nextCase);
    else url.searchParams.delete('case');
    for (const [parameter, value] of Object.entries({
      class: nextContext?.classId,
      session: nextContext?.sessionId,
      student: nextContext?.studentId,
      period: nextContext?.periodId,
      action: nextContext?.action,
    })) {
      if (value) url.searchParams.set(parameter, value);
      else url.searchParams.delete(parameter);
    }
    if (url.href !== location.href) history.pushState({}, '', url);
    currentUrl.current = url.href;
    focusPage.current = true;
    window.scrollTo({ top: 0, behavior: 'smooth' });
  }
  async function logout() {
    if (!confirmLeave(lang)) return;
    if (!demo) await supabase?.auth.signOut();
    // The next person starts in the staff view with an empty login form.
    try {
      localStorage.removeItem('portal-view');
    } catch {
      /* storage unavailable */
    }
    setViewMode('staff');
    setDemo(false);
    setUser(null);
    setData(blankSnapshot());
    setLoadError('');
    navigate('overview', '', true);
  }
  if (!user || recovery)
    return (
      <>
        {loadError && (
          <div className="auth-error" role="alert">
            {loadError}
          </div>
        )}
        <Login
          lang={lang}
          onLanguage={() => setLang(lang === 'en' ? 'tr' : 'en')}
          onDemo={() => {
            setDemo(true);
            setUser(demoAdmin);
            setRecovery(false);
            setLoadError('');
          }}
          recovery={recovery}
          onRecoveryDone={() => {
            setRecovery(false);
            history.replaceState({}, '', '/');
            notify(tr(lang, 'Password saved. Welcome!', 'Şifre kaydedildi. Hoş geldiniz!'));
          }}
        />
      </>
    );
  const props: PageProps = {
    data,
    lang,
    api: api!,
    refresh,
    notify,
    user: viewUser!,
    context,
    navigate,
  };
  const switchView = (mode: 'staff' | 'parent') => {
    if (!confirmLeave(lang)) return;
    setViewMode(mode);
    try {
      localStorage.setItem('portal-view', mode);
    } catch {
      /* The choice is only remembered when storage is available. */
    }
    navigate('overview', '', true);
  };
  const newCases = data.guidance_cases.filter((c) => c.status === 'new').length;
  // Curriculum changes by management waiting for this teacher's approval.
  const curriculumPending = data.curriculum_progress.filter(
    (p) =>
      p.pending_taught != null &&
      data.classes.some((c) => c.id === p.class_id && c.teacher_id === user.id),
  ).length;
  const attention = data.guidance_cases.filter((c) => c.status === 'new' || c.overdue);
  const components: Record<string, ReactNode> = {
    overview: <WorkspaceHome {...props} />,
    lesson: (
      <LessonWorkspace {...props}>
        <AttendancePage {...props} />
      </LessonWorkspace>
    ),
    materials: <MaterialsPage {...props} />,
    students: <StudentsPage {...props} />,
    people: <PeoplePage {...props} />,
    classes: <ClassesPage {...props} />,
    curriculum: <CurriculumPage {...props} />,
    attendance: <AttendancePage {...props} />,
    assessments: <AssessmentsPage {...props} />,
    reports: <ReportsPage {...props} />,
    guidance: <GuidancePage {...props} initialCaseId={caseId} />,
    finance: <FinancePage {...props} />,
    configuration: <ConfigurationPage {...props} />,
    settings: <SettingsPage {...props} />,
    control: <ControlPage {...props} />,
    guide: <GuidePage {...props} />,
  };
  return (
    <div className="app-layout">
      <a
        className="skip-link"
        href="#main-content"
        onClick={(event) => {
          event.preventDefault();
          document.getElementById('main-content')?.focus();
        }}
      >
        {tr(lang, 'Skip to content', 'İçeriğe geç')}
      </a>
      {mobile && (
        <button
          type="button"
          className="sidebar-scrim"
          aria-label={tr(lang, 'Close menu', 'Menüyü kapat')}
          tabIndex={-1}
          onClick={() => setMobile(false)}
        />
      )}
      <aside id="app-sidebar" className={`sidebar ${mobile ? 'is-open' : ''}`}>
        <a
          className="brand"
          href="/?view=overview"
          onClick={(e) => {
            e.preventDefault();
            navigate('overview');
          }}
        >
          <img src="/favicon.svg" alt="School Portal" />
          <span>{tr(lang, 'SCHOOL & FAMILY PORTAL', 'OKUL VE AİLE PORTALI')}</span>
        </a>
        <div className="school-year">
          <span className="year-dot" />
          {data.academic_years.find((y) => y.active)?.name || '2026–2027'}
          <span>{tr(lang, 'Academic year', 'Akademik yıl')}</span>
        </div>
        <nav aria-label={tr(lang, 'Main navigation', 'Ana menü')}>
          <span className="nav-label">{tr(lang, 'YOUR WORKSPACE', 'ÇALIŞMA ALANINIZ')}</span>
          {available
            .filter((n) => primary.includes(n.key))
            .sort((a, b) => primary.indexOf(a.key) - primary.indexOf(b.key))
            .map((n) => (
              <button
                type="button"
                key={n.key}
                className={`nav-item ${page.key === n.key ? 'active' : ''}`}
                aria-current={page.key === n.key ? 'page' : undefined}
                onClick={() => navigate(n.key)}
              >
                <n.icon size={19} />
                <span>{navLabel(n)}</span>
                {n.key === 'guidance' && newCases > 0 && (
                  <span
                    className="nav-count"
                    aria-label={tr(lang, `${newCases} new`, `${newCases} yeni`)}
                  >
                    {newCases}
                  </span>
                )}
                {n.key === 'curriculum' && curriculumPending > 0 && (
                  <span
                    className="nav-count nav-count-warn"
                    aria-label={tr(
                      lang,
                      `${curriculumPending} awaiting your approval`,
                      `${curriculumPending} onayınızı bekliyor`,
                    )}
                  >
                    {curriculumPending}
                  </span>
                )}
              </button>
            ))}
          {teacherOnly && (
            <details className="secondary-navigation">
              <summary>{tr(lang, 'More tools', 'Diğer araçlar')}</summary>
              {available
                .filter((n) => !primary.includes(n.key) && n.key !== 'lesson')
                .map((n) => (
                  <button
                    className={`nav-item ${page.key === n.key ? 'active' : ''}`}
                    key={n.key}
                    onClick={() => navigate(n.key)}
                  >
                    <n.icon size={19} />
                    {navLabel(n)}
                  </button>
                ))}
            </details>
          )}
        </nav>
        <div className="sidebar-bottom">
          <div className="sidebar-care">
            <Sprout size={25} />
            <strong>{tr(lang, 'Together, we grow.', 'Birlikte büyüyoruz.')}</strong>
            <p>
              {tr(
                lang,
                'A little support goes a long way.',
                'Küçük bir destek büyük fark yaratır.',
              )}
            </p>
            <button
              onClick={() =>
                navigate('guide', guidePageFor[page.key] ? { action: guidePageFor[page.key] } : {})
              }
            >
              {tr(lang, 'Need a hand?', 'Yardım ister misiniz?')}
              <ArrowRight size={14} />
            </button>
          </div>
        </div>
      </aside>
      <div className="main-shell">
        <header className="topbar">
          <div className="topbar-left">
            <button
              ref={menuButton}
              type="button"
              className="icon-button mobile-menu"
              onClick={() => setMobile(!mobile)}
              aria-label={tr(lang, 'Menu', 'Menü')}
              aria-expanded={mobile}
              aria-controls="app-sidebar"
            >
              <Menu size={22} />
            </button>
            <span className="breadcrumb">
              {tr(lang, 'Your school', 'Okulunuz')}
              <ChevronRight size={13} />
              <strong>{lang === 'tr' ? page.tr : page.en}</strong>
            </span>
          </div>
          <div className="topbar-actions">
            <button
              type="button"
              className="language-button"
              onClick={() => setLang(lang === 'en' ? 'tr' : 'en')}
              title={tr(lang, 'Switch to Turkish', 'İngilizceye geç')}
            >
              {lang === 'en' ? 'EN' : 'TR'}
              <span> / {lang === 'en' ? 'TR' : 'EN'}</span>
            </button>
            <button
              type="button"
              className="icon-button notification-button"
              aria-label={
                attention.length
                  ? tr(
                      lang,
                      `Notifications, ${attention.length} need attention`,
                      `Bildirimler, ${attention.length} ilgi bekliyor`,
                    )
                  : tr(lang, 'Notifications', 'Bildirimler')
              }
              onClick={() => setAlerts(true)}
            >
              <Bell size={20} />
              {attention.length > 0 && (
                <span className="notification-count" aria-hidden="true">
                  {attention.length > 9 ? '9+' : attention.length}
                </span>
              )}
            </button>
            <MenuButton
              className="profile-chip"
              menuClassName="account-menu"
              label={tr(lang, 'Account menu', 'Hesap menüsü')}
              button={
                <>
                  <span className="avatar avatar-small">{initials(user.full_name)}</span>
                  <span className="profile-text">
                    <strong>{user.full_name.split(' · ')[0]}</strong>
                    <small>{roleLabel(viewUser!.roles[0], lang)}</small>
                  </span>
                  <ChevronDown size={15} className="muted" aria-hidden="true" />
                </>
              }
            >
              {(close) => (
                <>
                  <div className="menu-header">
                    <strong>{user.full_name.split(' · ')[0]}</strong>
                    <small>{displayLogin(user.email)}</small>
                    <small>{user.roles.map((role) => roleLabel(role, lang)).join(' · ')}</small>
                  </div>
                  {dualRole && (
                    <div
                      className="menu-group"
                      role="group"
                      aria-label={tr(lang, 'View', 'Görünüm')}
                    >
                      <span className="menu-label">{tr(lang, 'View', 'Görünüm')}</span>
                      {(['staff', 'parent'] as const).map((mode) => (
                        <button
                          key={mode}
                          type="button"
                          role="menuitemradio"
                          aria-checked={viewMode === mode}
                          className="menu-item"
                          onClick={() => {
                            close();
                            if (mode !== viewMode) switchView(mode);
                          }}
                        >
                          <span className="menu-check">{viewMode === mode ? '✓' : ''}</span>
                          {mode === 'parent'
                            ? roleLabel('parent', lang)
                            : roleLabel(
                                user.roles.find((role) => role !== 'parent')!,
                                lang,
                              )}
                        </button>
                      ))}
                    </div>
                  )}
                  <button
                    type="button"
                    role="menuitem"
                    className="menu-item"
                    onClick={() => {
                      setLang(lang === 'en' ? 'tr' : 'en');
                      close();
                    }}
                  >
                    <Languages size={16} aria-hidden="true" />
                    {tr(lang, 'Türkçe', 'English')}
                  </button>
                  <button
                    type="button"
                    role="menuitem"
                    className="menu-item"
                    onClick={() => {
                      close();
                      setPasswordModal(true);
                    }}
                  >
                    <KeyRound size={16} aria-hidden="true" />
                    {tr(lang, 'Change my password', 'Şifremi değiştir')}
                  </button>
                  <div className="menu-separator" role="separator" />
                  <button
                    type="button"
                    role="menuitem"
                    className="menu-item"
                    onClick={() => {
                      close();
                      void logout();
                    }}
                  >
                    <Users size={16} aria-hidden="true" />
                    {tr(lang, 'Switch user', 'Kullanıcı değiştir')}
                  </button>
                  <button
                    type="button"
                    role="menuitem"
                    className="menu-item menu-danger"
                    onClick={() => {
                      close();
                      void logout();
                    }}
                  >
                    <LogOut size={16} aria-hidden="true" />
                    {tr(lang, 'Sign out', 'Çıkış yap')}
                  </button>
                </>
              )}
            </MenuButton>
          </div>
        </header>
        {demo && (
          <div className="demo-banner">
            <span>
              <strong>{tr(lang, 'DEMO SCHOOL', 'ÖRNEK OKUL')}</strong> ·{' '}
              {tr(
                lang,
                'Fictional records. Changes reset when this page reloads.',
                'Örnek kayıtlar. Değişiklikler sayfa yenilenince sıfırlanır.',
              )}
            </span>
            <label>
              {tr(lang, 'View as', 'Görünüm')}
              <select
                value={user.id}
                onChange={(e) => {
                  if (!confirmLeave(lang)) return;
                  setUser(
                    [demoAdmin, demoTeacher, demoParent].find((u) => u.id === e.target.value)!,
                  );
                  navigate('overview', '', true);
                }}
              >
                <option value={demoAdmin.id}>{tr(lang, 'Administrator', 'Yönetici')}</option>
                <option value={demoTeacher.id}>{tr(lang, 'Teacher', 'Öğretmen')}</option>
                <option value={demoParent.id}>{tr(lang, 'Parent', 'Veli')}</option>
              </select>
            </label>
          </div>
        )}
        <main
          id="main-content"
          tabIndex={-1}
          className="page-content"
          key={`${page.key}-${user.id}-${viewMode}-${context?.classId || ''}-${context?.sessionId || ''}-${context?.studentId || ''}-${context?.periodId || ''}-${context?.action || ''}`}
        >
          {loadError ? (
            <div className="error-card">
              <h2>{tr(lang, 'We couldn’t load your workspace', 'Çalışma alanınız yüklenemedi')}</h2>
              <p>{loadError}</p>
              <Button onClick={() => refresh().catch((e) => setLoadError(e.message))}>
                {tr(lang, 'Try again', 'Tekrar dene')}
              </Button>
            </div>
          ) : loading || loadedApi !== api ? (
            <div className="loading-state">
              <div className="loader" />
              <p>{tr(lang, 'Gathering your school’s story…', 'Okulunuzun hikâyesi yükleniyor…')}</p>
            </div>
          ) : (
            components[page.key]
          )}
        </main>
        <footer className="app-footer">
          <span>School Portal</span> ·{' '}
          {tr(
            lang,
            'Every little heart, a bright future.',
            'Her küçük kalpte aydınlık bir gelecek.',
          )}
          <span className="footer-languages">English & Türkçe</span>
        </footer>
      </div>
      {/* Always mounted so screen readers reliably announce each new message. */}
      <div className="sr-only" role="status" aria-live="polite" aria-atomic="true">
        {toast?.message}
      </div>
      {toast && (
        <div
          ref={toastRef}
          popover="manual"
          key={toastKey.current}
          className={`toast toast-${toast.kind}`}
        >
          {toast.kind === 'success' ? (
            <CheckCircle2 size={19} aria-hidden="true" />
          ) : (
            <CircleHelp size={19} aria-hidden="true" />
          )}
          <span>{toast.message}</span>
          <button
            type="button"
            className="icon-button"
            onClick={() => setToast(null)}
            aria-label={tr(lang, 'Close', 'Kapat')}
          >
            <X size={15} />
          </button>
        </div>
      )}
      {passwordModal && (
        <ChangePassword
          lang={lang}
          email={user.email}
          demo={demo}
          onClose={() => setPasswordModal(false)}
          onDone={() => {
            setPasswordModal(false);
            notify(tr(lang, 'Your password was changed.', 'Şifreniz değiştirildi.'));
          }}
        />
      )}
      {alerts && (
        <Modal
          title={tr(lang, 'Your attention matters', 'İlginiz değerli')}
          onClose={() => setAlerts(false)}
          lang={lang}
        >
          <div className="stack">
            {attention.map((c) => (
              <button
                type="button"
                className="list-row alert-row"
                key={c.id}
                onClick={() => {
                  setAlerts(false);
                  navigate('guidance', c.id);
                }}
              >
                <Badge tone={c.severity}>
                  {c.severity === 'red' ? tr(lang, 'Urgent', 'Acil') : tr(lang, 'Review', 'İncele')}
                </Badge>
                <span>{fullName(data.students.find((s) => s.id === c.student_id))}</span>
                <ChevronRight size={17} />
              </button>
            ))}
            {!attention.length && (
              <EmptyState
                title={tr(lang, 'All caught up', 'Her şey güncel')}
                description={tr(
                  lang,
                  'Nothing needs your immediate attention.',
                  'Şu anda acil ilgi gerektiren bir durum yok.',
                )}
              />
            )}{' '}
            {data.notification_outbox.filter((n) => n.status === 'failed').length > 0 && (
              <div className="form-error">
                {tr(
                  lang,
                  'Some notification emails failed. Check the operational email logs.',
                  'Bazı bildirim e-postaları gönderilemedi. E-posta işlem kayıtlarını kontrol edin.',
                )}
              </div>
            )}
          </div>
        </Modal>
      )}
    </div>
  );
}
export default function App() {
  return (
    <ErrorBoundary>
      <Portal />
    </ErrorBoundary>
  );
}
