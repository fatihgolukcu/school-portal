import {
  createContext,
  useContext,
  useCallback,
  useEffect,
  useId,
  useMemo,
  useRef,
  useState,
  type KeyboardEvent,
  type ReactNode,
  type ButtonHTMLAttributes,
  type InputHTMLAttributes,
  type SelectHTMLAttributes,
  type TextareaHTMLAttributes,
} from 'react';
import { createPortal } from 'react-dom';
import { X, Inbox, Search, ChevronDown } from 'lucide-react';
import type { Lang, PageProps } from './types';
import { useUnsavedChanges } from './workflow';

export const tr = (lang: Lang, en: string, turkish: string) => (lang === 'tr' ? turkish : en);
const ModalCloseContext = createContext<(() => void) | null>(null);

/** Unique-constraint names the school is likely to hit, with a plain explanation. */
const duplicateMessages: Record<string, [string, string]> = {
  periods_academic_year_id_number_key: [
    'This term number already exists for that academic year. Choose another number (1–5).',
    'Bu akademik yılda bu dönem numarası zaten var. Başka bir numara seçin (1–5).',
  ],
  academic_years_name_key: [
    'An academic year with this name already exists.',
    'Bu isimde bir akademik yıl zaten var.',
  ],
  one_monthly_charge: [
    'This student already has a charge for that month.',
    'Bu öğrencinin o ay için zaten bir tahakkuku var.',
  ],
  one_active_enrollment: [
    'The student is already enrolled in this class.',
    'Öğrenci bu sınıfa zaten kayıtlı.',
  ],
};
/** Server messages translated for Turkish users; English users see the original text. */
const serverMessages: Record<string, string> = {
  'Future lessons cannot have attendance': 'Gelecek tarihli derslerde yoklama alınamaz.',
  'Draft changed elsewhere. Reload the latest draft before saving.':
    'Taslak başka yerde değişti. Kaydetmeden önce son taslağı yükleyin.',
  'The submitted record changed. Reload before submitting.':
    'Gönderilmiş kayıt değişti. Devam etmeden önce yeniden yükleyin.',
  'The attendance changed. Reload before submitting.':
    'Yoklama değişti. Göndermeden önce yeniden yükleyin.',
  'The assessment changed. Reload before submitting.':
    'Değerlendirme değişti. Göndermeden önce yeniden yükleyin.',
  'Attendance already submitted. Reload the lesson.':
    'Yoklama zaten gönderildi. Dersi yeniden yükleyin.',
  'Assessment already submitted. Reload the student.':
    'Değerlendirme zaten gönderildi. Öğrenciyi yeniden yükleyin.',
  'Record attendance for every enrolled student': 'Kayıtlı her öğrencinin yoklamasını işaretleyin.',
  'Access denied': 'Bu işlem için yetkiniz yok.',
  'Date of birth cannot be in the future': 'Doğum tarihi gelecekte olamaz.',
  'Parent email is not valid': 'Veli e-posta adresi geçerli değil.',
  'Period dates must fall within the academic year':
    'Dönem tarihleri akademik yılın içinde olmalıdır.',
  'Reporting periods cannot overlap': 'Dönem tarihleri birbiriyle çakışamaz.',
  'Only administrators may change individual fees or scholarships':
    'Özel ücret ve bursu yalnızca yöneticiler değiştirebilir.',
  'Allocation must match the student and currency of an active charge':
    'Ödeme, aynı öğrenci ve para birimindeki aktif bir tahakkuka bağlanmalıdır.',
  'Void allocated payments before correcting this charge':
    'Bu tahakkuku düzeltmeden önce bağlı ödemeleri iptal edin.',
  'A correction reason is required': 'Düzeltme nedeni gereklidir.',
  'Full scholarship – no charge needed': 'Tam burs – tahakkuk gerekmez.',
  'The term does not belong to the selected academic year':
    'Seçilen dönem bu akademik yıla ait değil.',
  'Currency must be EUR or PLN': 'Para birimi EUR veya PLN olmalıdır.',
};

export const errorText = (error: unknown, lang: Lang = 'en') => {
  const record =
    error && typeof error === 'object' ? (error as { message?: unknown; code?: unknown }) : null;
  const message = record && 'message' in record ? String(record.message) : String(error);
  const code = record?.code ? String(record.code) : '';
  const constraint = /constraint "([^"]+)"/.exec(message)?.[1] || '';
  if (code === '23505') {
    const known = duplicateMessages[constraint];
    return known
      ? tr(lang, known[0], known[1])
      : tr(lang, 'This record already exists.', 'Bu kayıt zaten var.');
  }
  if (code === '23514')
    return tr(
      lang,
      `A value is not allowed (${constraint || message}).`,
      `Girilen değerlerden biri kabul edilmiyor (${constraint || message}).`,
    );
  if (code === '42501' && message !== 'Access denied')
    return tr(lang, 'You do not have permission for this action.', 'Bu işlem için yetkiniz yok.');
  return lang === 'tr' && serverMessages[message] ? serverMessages[message] : message;
};

/* ---------- Buttons and form fields ---------- */

export function Button({
  children,
  variant = 'primary',
  type = 'button',
  className,
  ...props
}: ButtonHTMLAttributes<HTMLButtonElement> & { variant?: string }) {
  return (
    <button {...props} type={type} className={`btn btn-${variant} ${className || ''}`.trim()}>
      {children}
    </button>
  );
}

function FieldLabel({ label, required }: { label: string; required?: boolean }) {
  return (
    <span>
      {label}
      {required && (
        <span className="required-mark" aria-hidden="true">
          {' '}
          *
        </span>
      )}
    </span>
  );
}

export function Field({
  label,
  hint,
  ...props
}: InputHTMLAttributes<HTMLInputElement> & { label: string; hint?: ReactNode }) {
  return (
    <label className="field">
      <FieldLabel label={label} required={props.required} />
      <input {...props} />
      {hint && <small className="form-hint">{hint}</small>}
    </label>
  );
}

export function SelectField({
  label,
  hint,
  children,
  ...props
}: SelectHTMLAttributes<HTMLSelectElement> & { label: string; hint?: ReactNode }) {
  return (
    <label className="field">
      <FieldLabel label={label} required={props.required} />
      <select {...props} aria-label={props['aria-label'] || label}>
        {children}
      </select>
      {hint && <small className="form-hint">{hint}</small>}
    </label>
  );
}

export function TextArea({
  label,
  hint,
  rows = 3,
  ...props
}: TextareaHTMLAttributes<HTMLTextAreaElement> & { label: string; hint?: ReactNode }) {
  return (
    <label className="field">
      <FieldLabel label={label} required={props.required} />
      <textarea rows={rows} {...props} />
      {hint && <small className="form-hint">{hint}</small>}
    </label>
  );
}

export function SearchField({
  label,
  className,
  ...props
}: InputHTMLAttributes<HTMLInputElement> & { label: string }) {
  return (
    <label className={`search-field ${className || ''}`.trim()}>
      <Search size={16} aria-hidden="true" />
      <input type="search" aria-label={label} placeholder={label} {...props} />
    </label>
  );
}

/* ---------- Dialogs ---------- */

const focusableInBody =
  'input:not([disabled]):not([type="hidden"]):not([hidden]):not([tabindex="-1"]), select:not([disabled]), textarea:not([disabled])';

/**
 * Native modal dialog: the browser provides the focus trap, inert background and Escape.
 * `bare` renders children without the padded body, for forms that lay out their own
 * `.modal-body` and `.modal-actions`.
 */
export function Modal({
  title,
  children,
  onClose,
  wide = false,
  bare = false,
  lang,
}: {
  title: string;
  children: ReactNode;
  onClose: () => void;
  wide?: boolean;
  bare?: boolean;
  lang?: Lang;
}) {
  const ref = useRef<HTMLDialogElement>(null);
  const [formDirty, setFormDirty] = useState(false);
  const allowClose = useUnsavedChanges(formDirty, lang || 'en');
  const requestClose = () => {
    if (ref.current?.querySelector('[aria-busy="true"]')) {
      window.alert(
        tr(
          lang || 'en',
          'Please wait until saving finishes.',
          'Kaydetme tamamlanana kadar bekleyin.',
        ),
      );
      return;
    }
    if (allowClose()) onClose();
  };
  const titleId = useId();
  const closeRef = useRef(onClose);
  closeRef.current = requestClose;
  useEffect(() => {
    const dialog = ref.current;
    const previous = document.activeElement as HTMLElement | null;
    if (dialog && !dialog.open) dialog.showModal();
    const first = dialog?.querySelector<HTMLElement>(`.modal-content ${focusableInBody}`);
    (first || dialog?.querySelector<HTMLElement>('.modal-header button'))?.focus();
    return () => {
      if (dialog?.open) dialog.close();
      if (previous?.isConnected) previous.focus();
    };
  }, []);
  const closeLabel = lang ? tr(lang, 'Close', 'Kapat') : 'Close / Kapat';
  return createPortal(
    <dialog
      ref={ref}
      aria-labelledby={titleId}
      className={`dialog ${wide ? 'dialog-wide' : ''}`}
      onChangeCapture={() => setFormDirty(true)}
      onCancel={(event) => {
        event.preventDefault();
        closeRef.current();
      }}
      onMouseDown={(event) => {
        // A press on the dialog element itself (not its content) is a press on the backdrop.
        if (event.target === event.currentTarget) {
          const box = event.currentTarget.getBoundingClientRect();
          const outside =
            event.clientX < box.left ||
            event.clientX > box.right ||
            event.clientY < box.top ||
            event.clientY > box.bottom;
          if (outside) closeRef.current();
        }
      }}
    >
      <div className="modal-header">
        <h2 id={titleId}>{title}</h2>
        <button
          type="button"
          className="icon-button"
          aria-label={closeLabel}
          onClick={requestClose}
        >
          <X size={20} />
        </button>
      </div>
      <div className={`modal-content ${bare ? '' : 'modal-body'}`.trim()}>
        <ModalCloseContext.Provider value={requestClose}>{children}</ModalCloseContext.Provider>
      </div>
    </dialog>,
    document.body,
  );
}

/**
 * A button that opens a small menu below it. The menu closes on Escape, on a click
 * outside, or when an item calls `close`; focus then returns to the button.
 */
export function MenuButton({
  label,
  button,
  className,
  menuClassName,
  align = 'right',
  children,
}: {
  label: string;
  button: ReactNode;
  className?: string;
  menuClassName?: string;
  align?: 'left' | 'right';
  children: (close: () => void) => ReactNode;
}) {
  const [open, setOpen] = useState(false);
  const wrap = useRef<HTMLDivElement>(null);
  const trigger = useRef<HTMLButtonElement>(null);
  const menuId = useId();
  const close = useCallback(() => {
    setOpen(false);
    trigger.current?.focus();
  }, []);
  useEffect(() => {
    if (!open) return;
    const onPointer = (event: MouseEvent) => {
      if (!wrap.current?.contains(event.target as Node)) setOpen(false);
    };
    const onKey = (event: globalThis.KeyboardEvent) => {
      if (event.key === 'Escape') close();
    };
    document.addEventListener('mousedown', onPointer);
    document.addEventListener('keydown', onKey);
    // Move focus to the first item so keyboard users can continue directly.
    wrap.current?.querySelector<HTMLElement>('[role^="menuitem"]')?.focus();
    return () => {
      document.removeEventListener('mousedown', onPointer);
      document.removeEventListener('keydown', onKey);
    };
  }, [open, close]);
  const onMenuKey = (event: KeyboardEvent<HTMLDivElement>) => {
    if (event.key !== 'ArrowDown' && event.key !== 'ArrowUp') return;
    event.preventDefault();
    const items = Array.from(
      event.currentTarget.querySelectorAll<HTMLElement>('[role^="menuitem"]:not([disabled])'),
    );
    const at = items.indexOf(document.activeElement as HTMLElement);
    const next = event.key === 'ArrowDown' ? at + 1 : at - 1;
    items[(next + items.length) % items.length]?.focus();
  };
  return (
    <div className={`menu-wrap ${className || ''}`.trim()} ref={wrap}>
      <button
        ref={trigger}
        type="button"
        className="menu-trigger"
        aria-label={label}
        aria-haspopup="menu"
        aria-expanded={open}
        aria-controls={open ? menuId : undefined}
        onClick={() => setOpen((value) => !value)}
      >
        {button}
      </button>
      {open && (
        <div
          id={menuId}
          role="menu"
          aria-label={label}
          className={`menu-popover menu-${align} ${menuClassName || ''}`.trim()}
          onKeyDown={onMenuKey}
        >
          {children(close)}
        </div>
      )}
    </div>
  );
}

/**
 * A collapsible section with an icon, a title and a one-line summary that is readable
 * while closed. Built on <details>, so keyboard and screen-reader support stay native.
 */
export function Disclosure({
  icon,
  title,
  summary,
  open,
  onToggle,
  children,
}: {
  icon?: ReactNode;
  title: ReactNode;
  summary?: ReactNode;
  open?: boolean;
  onToggle?: (open: boolean) => void;
  children: ReactNode;
}) {
  return (
    <details
      className="disclosure"
      open={open}
      onToggle={(event) => onToggle?.(event.currentTarget.open)}
    >
      <summary className="disclosure-summary">
        {icon && (
          <span className="disclosure-icon" aria-hidden="true">
            {icon}
          </span>
        )}
        <span className="disclosure-text">
          <strong>{title}</strong>
          {summary && <small>{summary}</small>}
        </span>
        <ChevronDown className="disclosure-chevron" size={18} aria-hidden="true" />
      </summary>
      <div className="disclosure-body">{children}</div>
    </details>
  );
}

type ConfirmOptions = {
  title: string;
  message?: ReactNode;
  confirmLabel?: string;
  danger?: boolean;
};

/**
 * Promise-based replacement for `window.confirm`, rendered with the portal's own dialog.
 * Usage: `const [confirm, confirmDialog] = useConfirm(lang);`
 * then `if (!(await confirm({ title }))) return;` and render `{confirmDialog}`.
 */
export function useConfirm(lang: Lang) {
  const [request, setRequest] = useState<
    (ConfirmOptions & { resolve: (value: boolean) => void }) | null
  >(null);
  const confirm = useCallback(
    (options: ConfirmOptions) =>
      new Promise<boolean>((resolve) => setRequest({ ...options, resolve })),
    [],
  );
  const finish = (value: boolean) => {
    request?.resolve(value);
    setRequest(null);
  };
  const dialog = request ? (
    <Modal title={request.title} onClose={() => finish(false)} lang={lang} bare>
      {request.message && <div className="modal-body">{request.message}</div>}
      <div className="modal-actions">
        <Button variant="secondary" onClick={() => finish(false)}>
          {tr(lang, 'Cancel', 'Vazgeç')}
        </Button>
        <Button variant={request.danger ? 'danger' : 'primary'} onClick={() => finish(true)}>
          {request.confirmLabel || tr(lang, 'Confirm', 'Onayla')}
        </Button>
      </div>
    </Modal>
  ) : null;
  return [confirm, dialog] as const;
}

/* ---------- Async actions ---------- */

/**
 * Runs a mutation once at a time: a ref lock prevents a double click from starting two
 * requests before React re-renders. Errors are kept for inline display and sent as a toast.
 */
export function useAction(props: Pick<PageProps, 'refresh' | 'notify' | 'lang'>) {
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState('');
  const lock = useRef(false);
  const run = async (action: () => Promise<unknown>, success?: () => void, quiet = false) => {
    if (lock.current) return false;
    lock.current = true;
    setBusy(true);
    setError('');
    try {
      try {
        await action();
      } catch (cause) {
        // The form stays open with its values; the message is shown inside it.
        const message = errorText(cause, props.lang);
        setError(message);
        props.notify(message, 'error');
        return false;
      }
      try {
        await props.refresh();
        if (!quiet)
          props.notify(tr(props.lang, 'Changes saved.', 'Değişiklikler kaydedildi.'), 'success');
      } catch (cause) {
        // The save succeeded; only reloading the page data failed.
        props.notify(
          tr(
            props.lang,
            `Saved, but the page could not reload: ${errorText(cause, props.lang)}`,
            `Kaydedildi, ancak sayfa yenilenemedi: ${errorText(cause, props.lang)}`,
          ),
          'error',
        );
      }
      success?.();
      return true;
    } finally {
      lock.current = false;
      setBusy(false);
    }
  };
  return { busy, error, run, clear: () => setError('') };
}

export const FormError = ({ error }: { error: string }) =>
  error ? (
    <div className="form-error" role="alert">
      {error}
    </div>
  ) : null;

export function FormActions({
  busy,
  lang,
  onCancel,
  submit,
  disabled = false,
}: {
  busy: boolean;
  lang: Lang;
  onCancel: () => void;
  submit?: string;
  disabled?: boolean;
}) {
  const closeModal = useContext(ModalCloseContext);
  useUnsavedChanges(false, lang, busy);
  return (
    <div className="modal-actions">
      <Button variant="secondary" onClick={closeModal || onCancel} disabled={busy}>
        {tr(lang, 'Cancel', 'Vazgeç')}
      </Button>
      <Button type="submit" variant="primary" disabled={busy || disabled} aria-busy={busy}>
        {busy ? tr(lang, 'Saving…', 'Kaydediliyor…') : submit || tr(lang, 'Save', 'Kaydet')}
      </Button>
    </div>
  );
}

/* ---------- Layout ---------- */

export function PageHeader({
  eyebrow,
  title,
  description,
  children,
}: {
  eyebrow?: ReactNode;
  title: ReactNode;
  description?: ReactNode;
  children?: ReactNode;
}) {
  return (
    <header className="page-heading">
      <div>
        {eyebrow && <p className="eyebrow">{eyebrow}</p>}
        <h1 tabIndex={-1} data-page-title>
          {title}
        </h1>
        {description && <p className="muted">{description}</p>}
      </div>
      {children && <div className="inline-actions">{children}</div>}
    </header>
  );
}

export function StatCard({
  title,
  value,
  subtitle,
}: {
  title: ReactNode;
  value: ReactNode;
  subtitle?: ReactNode;
}) {
  return (
    <div className="stat-card">
      <span className="muted">{title}</span>
      <strong>{value}</strong>
      {subtitle && <small>{subtitle}</small>}
    </div>
  );
}

export type TabItem = { id: string; label: ReactNode };

/** Accessible tab bar: arrow keys, Home and End move between tabs (roving tabindex). */
export function Tabs({
  items,
  value,
  onChange,
  label,
  compact = false,
  className,
}: {
  items: TabItem[];
  value: string;
  onChange: (id: string) => void;
  label: string;
  compact?: boolean;
  className?: string;
}) {
  const refs = useRef<(HTMLButtonElement | null)[]>([]);
  const move = (event: KeyboardEvent<HTMLButtonElement>, index: number) => {
    const last = items.length - 1;
    const next =
      event.key === 'ArrowRight'
        ? index === last
          ? 0
          : index + 1
        : event.key === 'ArrowLeft'
          ? index === 0
            ? last
            : index - 1
          : event.key === 'Home'
            ? 0
            : event.key === 'End'
              ? last
              : -1;
    if (next < 0) return;
    event.preventDefault();
    onChange(items[next].id);
    refs.current[next]?.focus();
  };
  return (
    <div
      role="tablist"
      aria-label={label}
      className={`tabs ${compact ? 'compact' : ''} ${className || ''}`.trim()}
    >
      {items.map((item, index) => {
        const selected = item.id === value;
        return (
          <button
            key={item.id}
            ref={(node) => {
              refs.current[index] = node;
            }}
            type="button"
            role="tab"
            aria-selected={selected}
            tabIndex={selected ? 0 : -1}
            className={`tab ${selected ? 'active' : ''}`.trim()}
            onClick={() => onChange(item.id)}
            onKeyDown={(event) => move(event, index)}
          >
            {item.label}
          </button>
        );
      })}
    </div>
  );
}

/* ---------- Status and empty states ---------- */

export function Badge({ children, tone = 'neutral' }: { children: ReactNode; tone?: string }) {
  return <span className={`badge badge-${tone}`}>{children}</span>;
}

const statusLabels: Record<string, [string, string]> = {
  active: ['Active', 'Aktif'],
  support: ['Support in progress', 'Destek sürüyor'],
  archived: ['Archived', 'Arşivlenmiş'],
  left: ['Left school', 'Okuldan ayrıldı'],
  present: ['Present', 'Katıldı'],
  late: ['Late', 'Geç'],
  absent: ['Absent', 'Katılmadı'],
  new: ['New', 'Yeni'],
  under_review: ['Under review', 'İnceleniyor'],
  plan_active: ['Plan active', 'Plan uygulanıyor'],
  follow_up: ['Follow-up', 'Takip'],
  resolved: ['Resolved', 'Çözüldü'],
  escalated: ['Escalated / DESTEK', 'Yönlendirildi / DESTEK'],
  red: ['Urgent', 'Acil'],
  orange: ['Needs attention', 'İlgilenilmeli'],
  yellow: ['Observe', 'Gözlem'],
  draft: ['Draft', 'Taslak'],
  submitted: ['Submitted', 'Gönderildi'],
  published: ['Published', 'Yayımlandı'],
};

export const statusLabel = (status: string, lang: Lang) =>
  statusLabels[status]?.[lang === 'tr' ? 1 : 0] || status.replaceAll('_', ' ');

/** Status value used to display a student (archived students have left the school). */
export const studentStatusValue = (s: { status?: unknown }) =>
  s.status === 'archived' ? 'left' : String(s.status || 'active');

/** Badge whose tone and translated text both come from a status value. */
export function StatusBadge({ value, lang }: { value: string; lang: Lang }) {
  return <Badge tone={value}>{statusLabel(value, lang)}</Badge>;
}

export function EmptyState({
  title,
  description,
  children,
}: {
  title: string;
  description?: string;
  children?: ReactNode;
}) {
  return (
    <div className="empty-state">
      <Inbox size={30} aria-hidden="true" />
      <h3>{title}</h3>
      {description && <p>{description}</p>}
      {children}
    </div>
  );
}

/* ---------- Formatting ---------- */

export const label = (row: any, lang: Lang) =>
  row?.[`name_${lang}`] || row?.name || row?.full_name || row?.code || '—';
/**
 * Readable names for assessment components that are stored as short codes. The codes
 * (a3/a4 weight keys, A4–A6 question forms) stay in the data; only the screen text changes.
 */
const componentNames: Record<string, [string, string, string, string]> = {
  A3: [
    'Lesson participation score',
    'Ders içi katılım puanı',
    'Average of the 1–5 participation score teachers enter with attendance in every lesson.',
    'Öğretmenin her derste yoklamayla birlikte girdiği 1–5 katılım puanının ortalaması.',
  ],
  A4: [
    'Engagement in class',
    'Derse ilgi',
    'Average of the engagement questions on the assessment form (focus, activities, communication).',
    'Değerlendirme formundaki derse ilgi sorularının ortalaması (odaklanma, etkinlikler, iletişim).',
  ],
  A5: [
    'Behaviour',
    'Davranış',
    'Average of the behaviour questions on the assessment form.',
    'Değerlendirme formundaki davranış sorularının ortalaması.',
  ],
  A6: [
    'Development and effort',
    'Gelişim ve çaba',
    'Effort question and the notes for the family on the assessment form.',
    'Değerlendirme formundaki çaba sorusu ve aileye yazılan notlar.',
  ],
  CUSTOM: [
    'Other questions',
    'Diğer sorular',
    'Not used in grading.',
    'Not hesabında kullanılmaz.',
  ],
};
/** "A4" → "Derse ilgi"; a subject code such as "B3" → the subject's name. */
export function componentLabel(
  code: string | null | undefined,
  lang: Lang,
  subjects: Record<string, any>[] = [],
) {
  if (!code) return '—';
  const known = componentNames[code.toUpperCase()];
  if (known) return tr(lang, known[0], known[1]);
  const subject = subjects.find((item) => item.code === code);
  return subject ? label(subject, lang) : code;
}
/** One-line explanation of where a component's score comes from. */
export function componentHint(code: string, lang: Lang) {
  const known = componentNames[code.toUpperCase()];
  return known ? tr(lang, known[2], known[3]) : '';
}
export const questionTypeLabel = (type: string, lang: Lang) =>
  (
    ({
      score: ['Scored scale', 'Puan ölçeği'],
      text: ['Text', 'Metin'],
      number: ['Number', 'Sayı'],
      boolean: ['Yes / No', 'Evet / Hayır'],
      choice: ['Choice', 'Seçim'],
      date: ['Date', 'Tarih'],
    }) as Record<string, [string, string]>
  )[type]?.[lang === 'tr' ? 1 : 0] || type;
export const fullName = (row: any) =>
  row ? `${row.first_name || ''} ${row.last_name || ''}`.trim() : '—';
/** Up to two initials from name parts; missing parts (e.g. no surname) are skipped. */
export const initials = (...parts: (string | null | undefined)[]) =>
  parts
    .flatMap((part) => String(part || '').split(' '))
    .filter(Boolean)
    .map((part) => part[0])
    .slice(0, 2)
    .join('')
    .toUpperCase();
/** Whole years between a YYYY-MM-DD birth date and today. */
export function ageFrom(dob?: string | null, today = new Date()) {
  if (!dob) return null;
  const [y, m, d] = dob.slice(0, 10).split('-').map(Number);
  if (!y) return null;
  let age = today.getFullYear() - y;
  if (today.getMonth() + 1 < m || (today.getMonth() + 1 === m && today.getDate() < d)) age -= 1;
  return age;
}

/** Birth date for an age-only registration: 1 January of (current year − age). */
export const dobFromAge = (age: number, today = new Date()) => `${today.getFullYear() - age}-01-01`;

/** "12.03.2016 · age 10", or "01.01.2016 · age 10 (estimated)" when only the age was known. */
export function formatDob(
  dob: string | null | undefined,
  estimated: boolean | undefined,
  lang: Lang,
) {
  if (!dob) return '—';
  const [y, m, d] = dob.slice(0, 10).split('-');
  const age = ageFrom(dob);
  const ageText =
    age === null
      ? ''
      : estimated
        ? tr(lang, ` · age ${age} (estimated)`, ` · ${age} yaş (tahmini)`)
        : tr(lang, ` · age ${age}`, ` · ${age} yaş`);
  return `${d}.${m}.${y}${ageText}`;
}

/** A date without the time, e.g. "12 Kas 2026"; "—" when empty. */
export function shortDay(value: string | null | undefined, lang: Lang): string {
  if (!value) return '—';
  return new Date(value.length === 10 ? `${value}T12:00:00` : value).toLocaleDateString(
    lang === 'tr' ? 'tr-TR' : 'en-GB',
    { day: 'numeric', month: 'short', year: 'numeric' },
  );
}

/** Click-to-sort for a table: rows keep their order until a header is clicked. */
export function useSort<T>(
  rows: T[],
  columns: Record<string, (row: T) => string | number | null | undefined>,
  lang: Lang,
) {
  const [state, setState] = useState<{ key: string | null; dir: 1 | -1 }>({ key: null, dir: 1 });
  const { key: sortKey, dir } = state;
  const accessor = sortKey ? columns[sortKey] : undefined;
  const sorted = useMemo(() => {
    if (!accessor) return rows;
    const collator = new Intl.Collator(lang === 'tr' ? 'tr' : 'en', {
      sensitivity: 'base',
      numeric: true,
    });
    const empty = (value: unknown) => value === null || value === undefined || value === '';
    return rows
      .map((row, index) => ({ row, index, value: accessor(row) }))
      .sort((a, b) => {
        if (empty(a.value) || empty(b.value)) {
          if (empty(a.value) && empty(b.value)) return a.index - b.index;
          return empty(a.value) ? 1 : -1;
        }
        const result =
          typeof a.value === 'number' && typeof b.value === 'number'
            ? a.value - b.value
            : collator.compare(String(a.value), String(b.value));
        return result * dir || a.index - b.index;
      })
      .map((item) => item.row);
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [rows, accessor, dir, lang]);
  const toggle = (key: string) =>
    setState((current) =>
      current.key === key ? { key, dir: current.dir === 1 ? -1 : 1 } : { key, dir: 1 },
    );
  const header = (key: string, label: ReactNode): ReactNode => (
    <th scope="col" aria-sort={sortKey === key ? (dir === 1 ? 'ascending' : 'descending') : 'none'}>
      <button type="button" className="sort-head" onClick={() => toggle(key)}>
        {label}
        <span className="sort-arrow" aria-hidden>
          {sortKey === key && dir === -1 ? '▼' : '▲'}
        </span>
      </button>
    </th>
  );
  return { sorted, sortKey, dir, header };
}

export function money(value: number, currency: string, lang: Lang) {
  return new Intl.NumberFormat(lang === 'tr' ? 'tr-TR' : 'en-GB', {
    style: 'currency',
    currency,
  }).format(value);
}
