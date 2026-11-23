import { useState } from 'react';
import { isSpecialistSubject, levelsForSubject, useUnsavedChanges } from '../workflow';
import {
  BookOpen,
  Plus,
  Save,
  Send,
  Settings2,
  Trash2,
  Eye,
  ChevronDown,
  ChevronUp,
  Layers3,
} from 'lucide-react';
import type { PageProps, RecordRow, Lang } from '../types';
import { CURRENCIES, MAX_TERM, SUMMER_TERM, isCurrency } from '../types';
import {
  Badge,
  Button,
  EmptyState,
  Field,
  FormError,
  Modal,
  PageHeader,
  SearchField,
  SelectField,
  Tabs,
  errorText,
  label,
  tr,
  useConfirm,
  useSort,
  componentHint,
  componentLabel,
  questionTypeLabel,
} from '../ui';

const metrics = [
  ['consecutive_absences', 'Consecutive absences', 'Ardışık devamsızlık'],
  ['attendance_average', 'Attendance score (0–5)', 'Yoklama puanı (0–5)'],
  ['camera_incidents', 'Camera/microphone incidents', 'Kamera/mikrofon ihlalleri'],
  ['participation_average', 'Lesson participation average', 'Ders içi katılım ortalaması'],
  ['engagement_average', 'Engagement in class average', 'Derse ilgi ortalaması'],
  ['behaviour_average', 'Behaviour average', 'Davranış ortalaması'],
  ['behaviour_min', 'Lowest behaviour question', 'En düşük davranış sorusu'],
  ['subject_average', 'Subject average', 'Ders ortalaması'],
  ['academic_min', 'Lowest subject criterion', 'En düşük ders ölçütü'],
  ['overall_score', 'Overall report score', 'Genel karne puanı'],
];
/** Grading weight keys → [name, where the number comes from]. Keys stay as stored. */
function weightLabel(metric: string, lang: 'en' | 'tr'): [string, string] {
  const names: Record<string, [string, string, string, string]> = {
    academic: [
      'Academic',
      'Akademik',
      'Average of the subject questions.',
      'Ders (konu) sorularının ortalaması.',
    ],
    discipline: [
      'Discipline',
      'Disiplin',
      'Calculated with the discipline component.',
      'Disiplin bileşeniyle hesaplanır.',
    ],
    effort: [
      'Development and effort',
      'Gelişim ve çaba',
      'Effort question on the assessment form.',
      'Değerlendirme formundaki çaba sorusu.',
    ],
    attendance: [
      'Attendance',
      'Yoklama',
      'Present / late / absent scores from attendance.',
      'Yoklamadaki geldi / geç / gelmedi puanları.',
    ],
    participation: [
      'Participation',
      'Katılım',
      'Calculated with the participation component.',
      'Katılım bileşeniyle hesaplanır.',
    ],
    behaviour: [
      'Behaviour',
      'Davranış',
      'Behaviour questions on the assessment form.',
      'Değerlendirme formundaki davranış soruları.',
    ],
  };
  if (metric === 'a3' || metric === 'a4')
    return [componentLabel(metric, lang), componentHint(metric, lang)];
  const known = names[metric];
  return known ? [tr(lang, known[0], known[1]), tr(lang, known[2], known[3])] : [metric, ''];
}
const operators = [
  ['lt', '<'],
  ['lte', '≤'],
  ['eq', '='],
  ['gte', '≥'],
  ['gt', '>'],
];
const freshCondition = () => ({
  metric: 'attendance_average',
  operator: 'lt',
  value: 3,
  min_observations: 3,
  window_days: 90,
});
function ConditionEditor({
  value,
  onChange,
  lang,
  depth = 0,
}: {
  value: any;
  onChange: (v: any) => void;
  lang: Lang;
  depth?: number;
}) {
  const group = value.all ? 'all' : value.any ? 'any' : null;
  return (
    <div className="condition-box">
      <div className="condition-top">
        <SelectField
          label={tr(lang, 'Match', 'Koşul')}
          value={group || 'single'}
          onChange={(e) =>
            onChange(
              e.target.value === 'single'
                ? freshCondition()
                : { [e.target.value]: [group ? value[group][0] : value] },
            )
          }
        >
          <option value="single">{tr(lang, 'One condition', 'Tek koşul')}</option>
          <option value="all">{tr(lang, 'All conditions (AND)', 'Tüm koşullar (VE)')}</option>
          <option value="any">{tr(lang, 'Any condition (OR)', 'Bir koşul (VEYA)')}</option>
        </SelectField>
      </div>
      {group ? (
        <div className="stack">
          {value[group].map((child: any, i: number) => (
            <div key={i} className="condition-child">
              <ConditionEditor
                value={child}
                lang={lang}
                depth={depth + 1}
                onChange={(v) =>
                  onChange({ [group]: value[group].map((x: any, n: number) => (n === i ? v : x)) })
                }
              />
              {value[group].length > 1 && (
                <button
                  className="icon-button"
                  aria-label={tr(lang, 'Remove condition', 'Koşulu kaldır')}
                  onClick={() =>
                    onChange({ [group]: value[group].filter((_: any, n: number) => n !== i) })
                  }
                >
                  <Trash2 size={16} />
                </button>
              )}
            </div>
          ))}
          {depth < 5 && (
            <Button
              variant="secondary"
              onClick={() => onChange({ [group]: [...value[group], freshCondition()] })}
            >
              <Plus size={14} />
              {tr(lang, 'Add condition', 'Koşul ekle')}
            </Button>
          )}
        </div>
      ) : (
        <div className="form-grid condition-fields">
          <SelectField
            label={tr(lang, 'Metric', 'Ölçüt')}
            value={value.metric}
            onChange={(e) => onChange({ ...value, metric: e.target.value })}
          >
            {metrics.map(([key, en, turkish]) => (
              <option key={key} value={key}>
                {tr(lang, en, turkish)}
              </option>
            ))}
          </SelectField>
          <SelectField
            label={tr(lang, 'Comparison', 'Karşılaştırma')}
            value={value.operator}
            onChange={(e) => onChange({ ...value, operator: e.target.value })}
          >
            {operators.map(([key, text]) => (
              <option key={key} value={key}>
                {text}
              </option>
            ))}
          </SelectField>
          <Field
            label={tr(lang, 'Threshold', 'Eşik')}
            type="number"
            step="0.01"
            value={value.value}
            onChange={(e) => onChange({ ...value, value: Number(e.target.value) })}
          />
          <Field
            label={tr(lang, 'Minimum observations', 'En az gözlem')}
            type="number"
            min="1"
            max="1000"
            value={value.min_observations ?? 1}
            onChange={(e) => onChange({ ...value, min_observations: Number(e.target.value) })}
          />
          <Field
            label={tr(lang, 'Lookback days · 0 = all', 'Geriye dönük gün · 0 = tümü')}
            type="number"
            min="0"
            max="366"
            value={value.window_days ?? 0}
            onChange={(e) => onChange({ ...value, window_days: Number(e.target.value) })}
          />
        </div>
      )}
    </div>
  );
}
function matches(condition: any, values: Record<string, number>): boolean {
  if (condition.all) return condition.all.every((c: any) => matches(c, values));
  if (condition.any) return condition.any.some((c: any) => matches(c, values));
  const n = values[condition.metric];
  if (n === undefined || values.observations < (condition.min_observations ?? 1)) return false;
  return (
    {
      lt: n < condition.value,
      lte: n <= condition.value,
      eq: n === condition.value,
      gte: n >= condition.value,
      gt: n > condition.value,
    } as any
  )[condition.operator];
}
function newQuestion(body: any, subjectCode?: string) {
  return {
    id: `custom_${crypto.randomUUID().slice(0, 8)}`,
    form: subjectCode || 'custom',
    ...(subjectCode ? { subject_code: subjectCode } : {}),
    type: 'score',
    label_en: subjectCode ? 'New learning outcome' : 'New question',
    label_tr: subjectCode ? 'Yeni kazanım' : 'Yeni soru',
    required: true,
    min: 1,
    max: 5,
    order: (body.questions?.length || 0) + 1,
  };
}
export function ConfigurationPage({
  data,
  lang,
  api,
  refresh,
  notify,
  user,
  context,
  navigate,
}: PageProps) {
  const lesson = data.classes.find((c) => c.id === context?.classId);
  const subject = data.subjects.find((s) => s.id === lesson?.subject_id);
  const published = data.configurations
    .filter((c) => c.kind === 'assessment' && c.status === 'published')
    .sort((a, b) => b.version - a.version)[0];
  const [addition] = useState(() =>
    context?.action === 'add_outcome' &&
    user.roles.includes('administrator') &&
    subject &&
    published
      ? { base: published, question: newQuestion(published.body, subject.code) }
      : null,
  );
  const [kind, setKind] = useState('assessment');
  const [selected, setSelected] = useState(addition?.base.id || '');
  const [draft, setDraft] = useState<any>(() =>
    addition
      ? {
          ...structuredClone(addition.base.body),
          questions: [...structuredClone(addition.base.body.questions || []), addition.question],
        }
      : null,
  );
  const [name, setName] = useState('');
  const [busy, setBusy] = useState(false);
  const [preview, setPreview] = useState(false);
  const [previewed, setPreviewed] = useState('');
  const [search, setSearch] = useState('');
  const [expanded, setExpanded] = useState<string | null>(addition?.question.id || null);
  const [subjectFilter, setSubjectFilter] = useState(addition?.question.subject_code || '');
  const [confirm, confirmDialog] = useConfirm(lang);
  const [sample, setSample] = useState<Record<string, number>>({
    discipline: 4,
    academic: 4,
    effort: 4,
    observations: 3,
    ...Object.fromEntries(metrics.map(([k]) => [k, 3])),
  });
  const versions = data.configurations
    .filter((c) => c.kind === kind)
    .sort((a, b) => b.version - a.version);
  const current = versions.find((c) => c.id === selected) || versions[0];
  const body = draft ?? current?.body;
  const canEdit = user.roles.includes('administrator');
  const fingerprint = JSON.stringify({ kind, body, name: name || current?.name || kind });
  useUnsavedChanges(!!draft || !!name, lang, busy);
  const edit = (b: any) => setDraft(structuredClone(b));
  const keepDraft = async () =>
    draft &&
    !(await confirm({
      title: tr(
        lang,
        'Discard unsaved configuration changes?',
        'Kaydedilmeyen değişiklikler silinsin mi?',
      ),
      message: tr(
        lang,
        'Your edits to this version have not been saved as a draft yet.',
        'Bu sürümdeki düzenlemeler henüz taslak olarak kaydedilmedi.',
      ),
      confirmLabel: tr(lang, 'Discard changes', 'Değişiklikleri sil'),
      danger: true,
    }));
  const changeKind = async (k: string) => {
    if (await keepDraft()) return;
    setKind(k);
    setSelected('');
    setDraft(null);
    setName('');
  };
  const changeVersion = async (id: string) => {
    if (await keepDraft()) return;
    setSelected(id);
    setDraft(null);
    setName('');
  };
  async function save(publish = false) {
    if (!canEdit || busy || !body || (publish && previewed !== fingerprint)) return;
    setBusy(true);
    try {
      let key = current?.id;
      if (draft || !current || current.status === 'published')
        key = await api.rpc('save_configuration', {
          p_id: current?.id || null,
          p_kind: kind,
          p_name: name || current?.name || kind,
          p_body: body,
        });
      if (publish) await api.rpc('publish_configuration', { p_id: key });
      await refresh();
      setSelected(key);
      setDraft(null);
      setName('');
      notify(
        tr(
          lang,
          publish
            ? 'Configuration published. Existing records keep their versions.'
            : 'Draft saved.',
          publish
            ? 'Yapılandırma yayınlandı. Önceki kayıtların sürümleri korundu.'
            : 'Taslak kaydedildi.',
        ),
      );
    } catch (error) {
      notify(errorText(error, lang), 'error');
    } finally {
      setBusy(false);
    }
  }
  function updateQuestion(index: number, values: any) {
    if (values.id && expanded === body.questions[index]?.id) setExpanded(values.id);
    edit({
      ...body,
      questions: body.questions.map((q: any, i: number) => (i === index ? { ...q, ...values } : q)),
    });
  }
  const addQuestion = () => {
    const question = newQuestion(body, subjectFilter || undefined);
    edit({
      ...body,
      questions: [...(body.questions || []), question],
    });
    setExpanded(question.id);
  };
  return (
    <>
      <PageHeader
        eyebrow={tr(lang, 'Make it your school', 'Okulunuza uyarlayın')}
        title={tr(lang, 'Questions & rules', 'Sorular ve kurallar')}
        description={tr(
          lang,
          'Shape learning, grading and support. Every published version is preserved.',
          'Öğrenme, değerlendirme ve desteği düzenleyin. Yayınlanan her sürüm korunur.',
        )}
      >
        {lesson && context?.action === 'add_outcome' && (
          <Button variant="ghost" onClick={() => navigate?.('curriculum', { classId: lesson.id })}>
            {tr(lang, 'Back to curriculum', 'Müfredata dön')}
          </Button>
        )}
        {draft && <Badge tone="orange">{tr(lang, 'Unsaved changes', 'Kaydedilmedi')}</Badge>}
        <Button
          variant="secondary"
          onClick={() => {
            setPreviewed(fingerprint);
            setPreview(true);
          }}
          disabled={!body}
        >
          <Eye size={16} />
          {tr(lang, 'Preview', 'Önizle')}
        </Button>
        {canEdit && (
          <>
            <Button variant="secondary" onClick={() => save()} disabled={busy || !body}>
              <Save size={16} />
              {tr(lang, 'Save draft', 'Taslağı kaydet')}
            </Button>
            <Button
              onClick={() => save(true)}
              title={tr(
                lang,
                'Preview this version before publishing',
                'Yayınlamadan önce bu sürümü önizleyin',
              )}
              disabled={
                busy ||
                !body ||
                (context?.action === 'add_outcome' && !!draft) ||
                previewed !== fingerprint ||
                (!draft && current?.status === 'published')
              }
            >
              <Send size={16} />
              {tr(lang, 'Publish', 'Yayınla')}
            </Button>
          </>
        )}
      </PageHeader>
      {confirmDialog}
      {addition && kind === 'assessment' && (
        <p className="form-hint">
          {label(subject, lang)} ·{' '}
          {tr(
            lang,
            'Save the draft, preview it and publish to use the outcome in assessments.',
            'Kazanımı taslak olarak kaydedin. Önizleyip yayımladığınızda değerlendirmelerde kullanılabilir.',
          )}
        </p>
      )}
      <Tabs
        label={tr(lang, 'Configuration type', 'Yapılandırma türü')}
        value={kind}
        onChange={(key) => void changeKind(key)}
        items={[
          ['assessment', 'Assessment questions', 'Değerlendirme soruları'],
          ['grading', 'Grade calculations', 'Not hesaplama'],
          ['triggers', 'Guidance triggers', 'Rehberlik tetikleyicileri'],
        ].map(([id, en, t]) => ({ id, label: tr(lang, en, t) }))}
      />
      <div className="card configuration-meta">
        <Layers3 size={20} />
        <SelectField
          label={tr(lang, 'Configuration version', 'Yapılandırma sürümü')}
          value={current?.id || ''}
          onChange={(e) => void changeVersion(e.target.value)}
        >
          {versions.map((c) => (
            <option key={c.id} value={c.id}>
              {c.name} · v{c.version} ·{' '}
              {c.status === 'published'
                ? tr(lang, 'Published', 'Yayınlandı')
                : tr(lang, 'Draft', 'Taslak')}
            </option>
          ))}
        </SelectField>
        <Field
          label={tr(lang, 'Version name', 'Sürüm adı')}
          value={name || current?.name || ''}
          disabled={!canEdit}
          onChange={(e) => {
            setName(e.target.value);
            if (!draft) edit(body);
          }}
        />
        <p className="muted">
          {tr(
            lang,
            'Editing a published version creates a new draft. Historical reports stay unchanged.',
            'Yayınlanan sürümü düzenlemek yeni taslak oluşturur. Önceki karneler değişmez.',
          )}
        </p>
      </div>
      {!body ? (
        <EmptyState
          title={tr(lang, 'School configuration is not loaded', 'Okul yapılandırması yüklenmedi')}
          description={tr(
            lang,
            'Apply the database migrations and initial curriculum to continue.',
            'Devam etmek için veritabanı ve başlangıç müfredatını yükleyin.',
          )}
        />
      ) : (
        <fieldset disabled={!canEdit || busy} className="fieldset-reset">
          {kind === 'assessment' && (
            <>
              <div className="toolbar">
                <SelectField
                  label={tr(lang, 'Subject', 'Ders')}
                  value={subjectFilter}
                  onChange={(e) => setSubjectFilter(e.target.value)}
                >
                  <option value="">{tr(lang, 'All questions', 'Tüm sorular')}</option>
                  {data.subjects.map((s) => (
                    <option key={s.id} value={s.code}>
                      {label(s, lang)}
                    </option>
                  ))}
                </SelectField>
                <SearchField
                  placeholder={tr(lang, 'Find a question…', 'Soru ara…')}
                  label={tr(lang, 'Search questions', 'Sorularda ara')}
                  value={search}
                  onChange={(e) => setSearch(e.target.value)}
                />
                <span className="muted">
                  {
                    (body.questions || []).filter(
                      (q: any) => !subjectFilter || q.subject_code === subjectFilter,
                    ).length
                  }{' '}
                  {subjectFilter
                    ? tr(lang, 'learning outcomes', 'kazanım')
                    : tr(lang, 'questions', 'soru')}
                </span>
                <Button onClick={addQuestion}>
                  <Plus size={16} />
                  {subjectFilter
                    ? tr(lang, 'Add learning outcome', 'Kazanım ekle')
                    : tr(lang, 'Add question', 'Soru ekle')}
                </Button>
              </div>
              <div className="question-list">
                {(body.questions || [])
                  .map((q: any, index: number) => ({ q, index }))
                  .filter(({ q }: any) => !subjectFilter || q.subject_code === subjectFilter)
                  .filter(({ q }: any) =>
                    `${q.label_en} ${q.label_tr} ${q.id}`
                      .toLowerCase()
                      .includes(search.toLowerCase()),
                  )
                  .map(({ q, index }: any) => (
                    <div className="card question-card" key={q.id}>
                      <button
                        className="question-summary"
                        onClick={() => setExpanded(expanded === q.id ? null : q.id)}
                      >
                        <span className="question-code">
                          {componentLabel(q.form, lang, data.subjects)}
                        </span>
                        <div>
                          <strong>{q[`label_${lang}`]}</strong>
                          <span className="muted">
                            {questionTypeLabel(q.type, lang)}{' '}
                            {q.required ? '· ' + tr(lang, 'Required', 'Zorunlu') : ''}
                          </span>
                        </div>
                        {expanded === q.id ? <ChevronUp size={18} /> : <ChevronDown size={18} />}
                      </button>
                      {expanded === q.id && (
                        <div className="question-edit">
                          <div className="form-grid">
                            <Field
                              label="English"
                              value={q.label_en}
                              onChange={(e) => updateQuestion(index, { label_en: e.target.value })}
                            />
                            <Field
                              label="Türkçe"
                              value={q.label_tr}
                              onChange={(e) => updateQuestion(index, { label_tr: e.target.value })}
                            />
                            <SelectField
                              label={tr(lang, 'Question type', 'Soru türü')}
                              value={q.type}
                              onChange={(e) =>
                                updateQuestion(index, {
                                  type: e.target.value,
                                  id: `custom_${crypto.randomUUID().slice(0, 8)}`,
                                  choices: e.target.value === 'choice' ? ['Yes', 'No'] : undefined,
                                })
                              }
                            >
                              {[
                                ['score', 'Scored scale', 'Puan ölçeği'],
                                ['text', 'Text', 'Metin'],
                                ['number', 'Number', 'Sayı'],
                                ['boolean', 'Yes / No', 'Evet / Hayır'],
                                ['choice', 'Choice', 'Seçim'],
                                ['date', 'Date', 'Tarih'],
                              ].map(([key, en, t]) => (
                                <option key={key} value={key}>
                                  {tr(lang, en, t)}
                                </option>
                              ))}
                            </SelectField>
                            <SelectField
                              label={tr(lang, 'Component', 'Bileşen')}
                              value={q.form}
                              onChange={(e) =>
                                updateQuestion(index, {
                                  form: e.target.value,
                                  id: `custom_${crypto.randomUUID().slice(0, 8)}`,
                                  subject_code: data.subjects.some((s) => s.code === e.target.value)
                                    ? e.target.value
                                    : undefined,
                                })
                              }
                            >
                              {[
                                'A4',
                                'A5',
                                'A6',
                                ...data.subjects.map((s) => s.code),
                                'custom',
                              ].map((k) => (
                                <option key={k} value={k}>
                                  {componentLabel(k, lang, data.subjects)}
                                </option>
                              ))}
                            </SelectField>
                            {['number', 'score'].includes(q.type) && (
                              <>
                                <Field
                                  label={tr(lang, 'Minimum', 'En az')}
                                  type="number"
                                  value={q.min ?? 1}
                                  onChange={(e) =>
                                    updateQuestion(index, { min: Number(e.target.value) })
                                  }
                                />
                                <Field
                                  label={tr(lang, 'Maximum', 'En çok')}
                                  type="number"
                                  value={q.max ?? 5}
                                  onChange={(e) =>
                                    updateQuestion(index, { max: Number(e.target.value) })
                                  }
                                />
                              </>
                            )}
                            {q.type === 'choice' && (
                              <Field
                                label={tr(
                                  lang,
                                  'Choices, separated by |',
                                  'Seçenekler, | ile ayırın',
                                )}
                                value={(q.choices || []).join('|')}
                                onChange={(e) =>
                                  updateQuestion(index, { choices: e.target.value.split('|') })
                                }
                              />
                            )}
                            <Field
                              label={tr(lang, 'Display order', 'Gösterim sırası')}
                              type="number"
                              value={q.order ?? index + 1}
                              onChange={(e) =>
                                updateQuestion(index, { order: Number(e.target.value) })
                              }
                            />
                            <label className="checkbox-label">
                              <input
                                type="checkbox"
                                checked={q.required ?? true}
                                onChange={(e) =>
                                  updateQuestion(index, { required: e.target.checked })
                                }
                              />
                              {tr(lang, 'Required answer', 'Zorunlu yanıt')}
                            </label>
                          </div>
                          {['boolean', 'choice'].includes(q.type) && (
                            <div className="mapping-editor">
                              <h4>
                                {tr(
                                  lang,
                                  'Optional score mapping (0–5)',
                                  'İsteğe bağlı puan eşlemesi (0–5)',
                                )}
                              </h4>
                              <div className="form-grid">
                                {(q.type === 'boolean' ? ['true', 'false'] : q.choices || []).map(
                                  (choice: string) => (
                                    <Field
                                      key={choice}
                                      label={choice}
                                      type="number"
                                      min="0"
                                      max="5"
                                      step="0.1"
                                      placeholder={tr(lang, 'Unscored', 'Puansız')}
                                      value={q.score_map?.[choice] ?? ''}
                                      onChange={(e) => {
                                        const map = { ...q.score_map };
                                        if (e.target.value === '') delete map[choice];
                                        else map[choice] = Number(e.target.value);
                                        updateQuestion(index, { score_map: map });
                                      }}
                                    />
                                  ),
                                )}
                              </div>
                            </div>
                          )}
                          <Button
                            variant="danger"
                            onClick={async () => {
                              const removed = await confirm({
                                title: tr(
                                  lang,
                                  'Remove this question from the version?',
                                  'Bu soru sürümden kaldırılsın mı?',
                                ),
                                message: tr(
                                  lang,
                                  'Published versions and past reports keep their questions. Discard the draft to undo.',
                                  'Yayınlanmış sürümler ve önceki karneler sorularını korur. Geri almak için taslağı silin.',
                                ),
                                confirmLabel: tr(lang, 'Remove', 'Kaldır'),
                                danger: true,
                              });
                              if (removed)
                                edit({
                                  ...body,
                                  questions: body.questions.filter(
                                    (_: any, i: number) => i !== index,
                                  ),
                                });
                            }}
                          >
                            <Trash2 size={14} />
                            {tr(lang, 'Remove from this version', 'Bu sürümden kaldır')}
                          </Button>
                        </div>
                      )}
                    </div>
                  ))}
              </div>
            </>
          )}
          {kind === 'grading' && (
            <>
              <div className="split-grid">
                {[
                  [
                    'overall',
                    'Overall grade',
                    'Genel not',
                    'The report card score is built from these three parts.',
                    'Karnedeki genel puan bu üç parçadan oluşur.',
                  ],
                  [
                    'discipline',
                    'Discipline component',
                    'Disiplin bileşeni',
                    'The "Discipline" part of the overall grade.',
                    'Genel nottaki "Disiplin" parçası.',
                  ],
                  [
                    'participation',
                    'Participation component',
                    'Katılım bileşeni',
                    'The "Participation" part of the discipline component.',
                    'Disiplin bileşenindeki "Katılım" parçası.',
                  ],
                ].map(([key, en, t, aboutEn, aboutTr]) => (
                  <div className="card padded" key={key}>
                    <h3>{tr(lang, en, t)}</h3>
                    <p className="muted">
                      {tr(lang, aboutEn, aboutTr)}{' '}
                      {tr(lang, 'Weights must total 100%.', 'Ağırlıklar toplamı %100 olmalıdır.')}
                    </p>
                    {Object.entries(body[key] || { a3: 0.5, a4: 0.5 }).map(([metric, weight]) => (
                      <div className="weight-row" key={metric}>
                        <label>
                          <span>{weightLabel(metric, lang)[0]}</span>
                          {weightLabel(metric, lang)[1] && (
                            <small className="weight-hint">{weightLabel(metric, lang)[1]}</small>
                          )}
                        </label>
                        <input
                          aria-label={weightLabel(metric, lang)[0]}
                          type="number"
                          min="0"
                          max="100"
                          step="1"
                          value={Math.round(Number(weight) * 10000) / 100}
                          onChange={(e) =>
                            edit({
                              ...body,
                              [key]: {
                                ...(body[key] || { a3: 0.5, a4: 0.5 }),
                                [metric]: Number(e.target.value) / 100,
                              },
                            })
                          }
                        />
                        <span>%</span>
                      </div>
                    ))}
                    <div className="weight-total">
                      {tr(lang, 'Total', 'Toplam')}{' '}
                      <strong>
                        {Math.round(
                          Object.values(body[key] || { a3: 0.5, a4: 0.5 }).reduce<number>(
                            (sum, n) => sum + Number(n),
                            0,
                          ) * 10000,
                        ) / 100}
                        %
                      </strong>
                    </div>
                  </div>
                ))}
              </div>
              <div className="card padded">
                <h3>{tr(lang, 'Subject aggregation', 'Ders ortalaması')}</h3>
                <div className="form-grid">
                  <SelectField
                    label={tr(lang, 'Method', 'Yöntem')}
                    value={body.academic?.mode || 'average'}
                    onChange={(e) =>
                      edit({
                        ...body,
                        academic: {
                          ...body.academic,
                          mode: e.target.value,
                          weights:
                            body.academic?.weights ||
                            Object.fromEntries(data.subjects.map((s) => [s.code, 1])),
                        },
                      })
                    }
                  >
                    <option value="average">{tr(lang, 'Equal average', 'Eşit ortalama')}</option>
                    <option value="weighted_average">
                      {tr(lang, 'Weighted average', 'Ağırlıklı ortalama')}
                    </option>
                  </SelectField>
                  {body.academic?.mode === 'weighted_average' &&
                    data.subjects.map((s) => (
                      <Field
                        key={s.id}
                        label={label(s, lang)}
                        type="number"
                        min="0.01"
                        step="0.1"
                        value={body.academic.weights?.[s.code] ?? 1}
                        onChange={(e) =>
                          edit({
                            ...body,
                            academic: {
                              ...body.academic,
                              weights: {
                                ...body.academic.weights,
                                [s.code]: Number(e.target.value),
                              },
                            },
                          })
                        }
                      />
                    ))}
                  {Object.entries(body.attendance_scores || { present: 5, late: 3, absent: 0 }).map(
                    ([key, value]) => (
                      <Field
                        key={key}
                        label={tr(
                          lang,
                          `${key} score`,
                          `${key === 'present' ? 'Katıldı' : key === 'late' ? 'Geç geldi' : 'Katılmadı'} puanı`,
                        )}
                        type="number"
                        min="0"
                        max="5"
                        value={Number(value)}
                        onChange={(e) =>
                          edit({
                            ...body,
                            attendance_scores: {
                              ...body.attendance_scores,
                              [key]: Number(e.target.value),
                            },
                          })
                        }
                      />
                    ),
                  )}
                </div>
              </div>
              <div className="card padded">
                <h3>{tr(lang, 'Parent-facing progress bands', 'Veli ilerleme etiketleri')}</h3>
                {body.bands?.map((band: any, i: number) => (
                  <div className="band-edit" key={i}>
                    <Field
                      label={tr(lang, 'Minimum score', 'Alt sınır')}
                      type="number"
                      min="0"
                      max="5"
                      step="0.01"
                      value={band.min}
                      onChange={(e) =>
                        edit({
                          ...body,
                          bands: body.bands.map((b: any, n: number) =>
                            n === i ? { ...b, min: Number(e.target.value) } : b,
                          ),
                        })
                      }
                    />
                    <Field
                      label="English"
                      value={band.label_en}
                      onChange={(e) =>
                        edit({
                          ...body,
                          bands: body.bands.map((b: any, n: number) =>
                            n === i ? { ...b, label_en: e.target.value } : b,
                          ),
                        })
                      }
                    />
                    <Field
                      label="Türkçe"
                      value={band.label_tr}
                      onChange={(e) =>
                        edit({
                          ...body,
                          bands: body.bands.map((b: any, n: number) =>
                            n === i ? { ...b, label_tr: e.target.value } : b,
                          ),
                        })
                      }
                    />
                    <SelectField
                      label={tr(lang, 'Colour', 'Renk')}
                      value={band.color}
                      onChange={(e) =>
                        edit({
                          ...body,
                          bands: body.bands.map((b: any, n: number) =>
                            n === i ? { ...b, color: e.target.value } : b,
                          ),
                        })
                      }
                    >
                      {['green', 'yellow', 'orange', 'red'].map((c) => (
                        <option key={c}>{c}</option>
                      ))}
                    </SelectField>
                  </div>
                ))}
              </div>
            </>
          )}
          {kind === 'triggers' && (
            <>
              <div className="card padded">
                <div className="form-grid">
                  <Field
                    label={tr(lang, 'Review target (hours)', 'İnceleme hedefi (saat)')}
                    type="number"
                    min="1"
                    value={body.review_hours ?? 48}
                    onChange={(e) => edit({ ...body, review_hours: Number(e.target.value) })}
                  />
                  <Field
                    label={tr(lang, 'Management escalation (hours)', 'Yönetim eskalasyonu (saat)')}
                    type="number"
                    min="1"
                    value={body.escalation_hours ?? 72}
                    onChange={(e) => edit({ ...body, escalation_hours: Number(e.target.value) })}
                  />
                  <Field
                    label={tr(lang, 'Orange follow-up (days)', 'Turuncu takip (gün)')}
                    type="number"
                    min="1"
                    value={body.orange_escalation_days ?? 14}
                    onChange={(e) =>
                      edit({ ...body, orange_escalation_days: Number(e.target.value) })
                    }
                  />
                </div>
              </div>
              <div className="toolbar">
                <p className="muted">
                  {tr(
                    lang,
                    'Triggers run after submissions. Missing values never count as failure.',
                    'Tetikleyiciler gönderimden sonra çalışır. Eksik değerler başarısızlık sayılmaz.',
                  )}
                </p>
                <Button
                  onClick={() =>
                    edit({
                      ...body,
                      rules: [
                        ...body.rules,
                        {
                          id: `rule_${crypto.randomUUID().slice(0, 8)}`,
                          label_en: 'New guidance rule',
                          label_tr: 'Yeni rehberlik kuralı',
                          severity: 'orange',
                          enabled: true,
                          condition: freshCondition(),
                        },
                      ],
                    })
                  }
                >
                  <Plus size={16} />
                  {tr(lang, 'Add rule', 'Kural ekle')}
                </Button>
              </div>
              {body.rules?.map((rule: any, i: number) => (
                <div className="card padded rule-card" key={rule.id}>
                  <div className="form-grid">
                    <Field
                      label="English"
                      value={rule.label_en}
                      onChange={(e) =>
                        edit({
                          ...body,
                          rules: body.rules.map((r: any, n: number) =>
                            n === i ? { ...r, label_en: e.target.value } : r,
                          ),
                        })
                      }
                    />
                    <Field
                      label="Türkçe"
                      value={rule.label_tr}
                      onChange={(e) =>
                        edit({
                          ...body,
                          rules: body.rules.map((r: any, n: number) =>
                            n === i ? { ...r, label_tr: e.target.value } : r,
                          ),
                        })
                      }
                    />
                    <SelectField
                      label={tr(lang, 'Severity', 'Önem')}
                      value={rule.severity}
                      onChange={(e) =>
                        edit({
                          ...body,
                          rules: body.rules.map((r: any, n: number) =>
                            n === i ? { ...r, severity: e.target.value } : r,
                          ),
                        })
                      }
                    >
                      <option value="red">{tr(lang, 'Red · urgent', 'Kırmızı · acil')}</option>
                      <option value="orange">
                        {tr(lang, 'Orange · development', 'Turuncu · gelişim')}
                      </option>
                      <option value="yellow">
                        {tr(lang, 'Yellow · observation', 'Sarı · gözlem')}
                      </option>
                    </SelectField>
                    <label className="checkbox-label">
                      <input
                        type="checkbox"
                        checked={rule.enabled ?? true}
                        onChange={(e) =>
                          edit({
                            ...body,
                            rules: body.rules.map((r: any, n: number) =>
                              n === i ? { ...r, enabled: e.target.checked } : r,
                            ),
                          })
                        }
                      />
                      {tr(lang, 'Enabled', 'Etkin')}
                    </label>
                  </div>
                  <ConditionEditor
                    lang={lang}
                    value={rule.condition}
                    onChange={(condition) =>
                      edit({
                        ...body,
                        rules: body.rules.map((r: any, n: number) =>
                          n === i ? { ...r, condition } : r,
                        ),
                      })
                    }
                  />
                  <Button
                    variant="ghost"
                    onClick={async () => {
                      const removed = await confirm({
                        title: tr(lang, 'Remove this rule?', 'Bu kural kaldırılsın mı?'),
                        message: tr(
                          lang,
                          'The rule is removed from this draft. Discard the draft to undo.',
                          'Kural bu taslaktan kaldırılır. Geri almak için taslağı silin.',
                        ),
                        confirmLabel: tr(lang, 'Remove', 'Kaldır'),
                        danger: true,
                      });
                      if (removed)
                        edit({ ...body, rules: body.rules.filter((_: any, n: number) => n !== i) });
                    }}
                  >
                    <Trash2 size={14} />
                    {tr(lang, 'Remove rule', 'Kuralı kaldır')}
                  </Button>
                </div>
              ))}
            </>
          )}
        </fieldset>
      )}
      {preview && body && (
        <Modal
          title={tr(lang, 'Configuration preview', 'Yapılandırma önizlemesi')}
          onClose={() => setPreview(false)}
          lang={lang}
          wide
        >
          {kind === 'assessment' ? (
            <div className="stack">
              {body.questions
                ?.slice()
                .sort((a: any, b: any) => (a.order || 0) - (b.order || 0))
                .map((q: any) => (
                  <div key={q.id}>
                    <label className="field">
                      <span>
                        {q[`label_${lang}`]} {q.required ? '*' : ''}
                      </span>
                      {q.type === 'boolean' || q.type === 'choice' ? (
                        <select>
                          <option>—</option>
                          {(q.type === 'boolean'
                            ? [tr(lang, 'Yes', 'Evet'), tr(lang, 'No', 'Hayır')]
                            : q.choices || []
                          ).map((c: string) => (
                            <option key={c}>{c}</option>
                          ))}
                        </select>
                      ) : (
                        <input
                          type={
                            q.type === 'score' || q.type === 'number'
                              ? 'number'
                              : q.type === 'date'
                                ? 'date'
                                : 'text'
                          }
                          min={q.min}
                          max={q.max}
                        />
                      )}
                    </label>
                  </div>
                ))}
            </div>
          ) : kind === 'grading' ? (
            <>
              <div className="form-grid">
                {(
                  [
                    ['discipline', 'Discipline', 'Disiplin'],
                    ['academic', 'Academic', 'Akademik'],
                    ['effort', 'Effort', 'Çaba'],
                  ] as const
                ).map(([k, en, turkish]) => (
                  <Field
                    key={k}
                    label={tr(lang, en, turkish)}
                    type="number"
                    min="0"
                    max="5"
                    step="0.1"
                    value={sample[k]}
                    onChange={(e) => setSample({ ...sample, [k]: Number(e.target.value) })}
                  />
                ))}
              </div>
              <div className="preview-score">
                {Object.entries(body.overall)
                  .reduce((sum, [k, w]) => sum + sample[k] * Number(w), 0)
                  .toFixed(2)}
                <small>/ 5</small>
              </div>
              <p className="muted">
                {tr(
                  lang,
                  'Illustrative preview. Published school reports are calculated securely by the database.',
                  'Örnek önizleme. Yayınlanan okul karneleri veritabanında güvenli hesaplanır.',
                )}
              </p>
            </>
          ) : (
            <>
              <div className="form-grid">
                <Field
                  label={tr(lang, 'Observations', 'Gözlem')}
                  type="number"
                  value={sample.observations}
                  onChange={(e) => setSample({ ...sample, observations: Number(e.target.value) })}
                />
                {metrics.map(([k, en, t]) => (
                  <Field
                    key={k}
                    label={tr(lang, en, t)}
                    type="number"
                    step="0.1"
                    value={sample[k]}
                    onChange={(e) => setSample({ ...sample, [k]: Number(e.target.value) })}
                  />
                ))}
              </div>
              <div className="stack">
                {body.rules.map((r: any) => (
                  <div key={r.id} className="list-row">
                    <span>{r[`label_${lang}`]}</span>
                    <Badge
                      tone={r.enabled && matches(r.condition, sample) ? r.severity : 'neutral'}
                    >
                      {r.enabled && matches(r.condition, sample)
                        ? tr(lang, 'Would trigger', 'Tetiklenir')
                        : tr(lang, 'No alert', 'Uyarı yok')}
                    </Badge>
                  </div>
                ))}
              </div>
            </>
          )}
        </Modal>
      )}
    </>
  );
}

const referenceTables = [
  ['class_groups', 'Classes', 'Sınıflar'],
  ['subjects', 'Subjects', 'Dersler'],
  ['levels', 'Levels', 'Seviyeler'],
  ['packages', 'Packages', 'Paketler'],
  ['academic_years', 'Academic years', 'Akademik yıllar'],
  ['periods', 'Reporting periods', 'Karne dönemleri'],
];
export function SettingsPage({ data, lang, api, refresh, notify }: PageProps) {
  const [table, setTable] = useState('class_groups');
  // Package contents besides subjects (members): classes and levels.
  const [memberGroups, setMemberGroups] = useState<string[]>([]);
  const [memberLevels, setMemberLevels] = useState<string[]>([]);
  const levelKind = (kind: string) =>
    kind === 'class'
      ? tr(lang, 'Class level', 'Sınıf seviyesi')
      : kind === 'knowledge'
        ? tr(lang, 'Knowledge track', 'Bilgi rotası')
        : tr(lang, 'Specialist reading', 'Uzmanlık seviyesi');
  const yearName = (id?: string) => data.academic_years.find((y) => y.id === id)?.name || '';
  const lessonsOf = (groupId: string) =>
    data.classes.filter((c) => c.group_id === groupId && c.active !== false);
  const [editing, setEditing] = useState<RecordRow | null>(null);
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState('');
  const [members, setMembers] = useState<string[]>([]);
  const [specialistLevel, setSpecialistLevel] = useState('');
  const specialistSubjectId = data.subjects.find((s) => isSpecialistSubject(s.id, data))?.id as
    string | undefined;
  const [settings, setSettings] = useState<any>(null);
  const [schoolBusy, setSchoolBusy] = useState(false);
  const [showArchived, setShowArchived] = useState(false);
  const [hasRecords, setHasRecords] = useState(false);
  const [confirmDelete, confirmDialog] = useConfirm(lang);
  const school = settings || data.school_settings[0];
  useUnsavedChanges(!!settings, lang, busy || schoolBusy);
  const allRows = data[table] || [];
  const archivedCount = allRows.filter((row) => row.active === false).length;
  // Archived records stay available but out of the way, like archived people.
  const rows = showArchived ? allRows : allRows.filter((row) => row.active !== false);
  const rowSort = useSort(
    rows,
    {
      name: (row) => label(row, lang),
      status: (row) => (row.active === false ? 'archived' : 'active'),
    },
    lang,
  );
  const field = (key: string, value: any) => setEditing((v) => (v ? { ...v, [key]: value } : null));
  // The first term number not yet used in an academic year (1–5).
  const nextTerm = (yearId: string) => {
    const used = data.periods.filter((p) => p.academic_year_id === yearId).map((p) => p.number);
    return Array.from({ length: MAX_TERM }, (_, i) => i + 1).find((n) => !used.includes(n)) || 1;
  };
  const setTermNumber = (value: number) =>
    setEditing((v) => {
      if (!v) return null;
      const next = { ...v, number: value };
      // Term 5 is the summer school: prefill its names on a new record.
      if (!v.id && value === SUMMER_TERM.number && (!v.name_en || /^Period \d$/.test(v.name_en)))
        Object.assign(next, { name_en: SUMMER_TERM.name_en, name_tr: SUMMER_TERM.name_tr });
      return next;
    });
  const close = () => {
    setEditing(null);
    setError('');
  };
  // Checks that need no server round trip, so the form keeps what was typed.
  const precheck = (row: RecordRow) => {
    if (table === 'periods') {
      const number = Number(row.number);
      if (!(number >= 1 && number <= MAX_TERM))
        return tr(
          lang,
          'Term number must be 1 to 5.',
          'Dönem numarası 1 ile 5 arasında olmalıdır.',
        );
      if (
        data.periods.some(
          (p) =>
            p.academic_year_id === row.academic_year_id && p.number === number && p.id !== row.id,
        )
      )
        return tr(
          lang,
          `Term ${number} already exists for this academic year. Edit that term or choose another number.`,
          `Bu akademik yılda ${number}. dönem zaten var. O dönemi düzenleyin veya başka bir numara seçin.`,
        );
      const year = data.academic_years.find((y) => y.id === row.academic_year_id);
      if (year && row.starts_on && (row.starts_on < year.starts_on || row.ends_on > year.ends_on))
        return tr(
          lang,
          `Term dates must fall within the academic year (${year.starts_on} → ${year.ends_on}).`,
          `Dönem tarihleri akademik yılın içinde olmalıdır (${year.starts_on} → ${year.ends_on}).`,
        );
    }
    if (row.starts_on && row.ends_on && row.ends_on < row.starts_on)
      return tr(lang, 'The end date is before the start date.', 'Bitiş tarihi başlangıçtan önce.');
    return '';
  };
  const open = (row?: RecordRow) => {
    setError('');
    setHasRecords(false);
    const yearId = data.academic_years[0]?.id;
    setEditing(
      row
        ? {
            ...structuredClone(row),
            // Legacy currencies (e.g. GBP) are replaced by the allowed default on save.
            ...(table === 'packages' && !isCurrency(row.currency) ? { currency: 'EUR' } : {}),
          }
        : {
            id: '',
            active: true,
            currency: 'EUR',
            kind: 'class',
            language: 'tr',
            academic_year_id: (data.academic_years.find((y) => y.active) || data.academic_years[0])
              ?.id,
            number: nextTerm(yearId),
          },
    );
    setMembers(
      !row
        ? []
        : table === 'class_groups'
          ? lessonsOf(row.id).map((c) => c.subject_id)
          : data.package_subjects.filter((r) => r.package_id === row.id).map((r) => r.subject_id),
    );
    setSpecialistLevel(
      row && table === 'class_groups'
        ? data.classes.find((c) => c.group_id === row.id && isSpecialistSubject(c.subject_id, data))
            ?.level_id || ''
        : '',
    );
    setMemberGroups(
      row ? data.package_classes.filter((r) => r.package_id === row.id).map((r) => r.group_id) : [],
    );
    setMemberLevels(
      row ? data.package_levels.filter((r) => r.package_id === row.id).map((r) => r.level_id) : [],
    );
  };
  async function save(override: Partial<RecordRow> = {}) {
    if (!editing) return;
    const current = { ...editing, ...override } as RecordRow;
    const problem = precheck(current);
    if (problem) {
      setError(problem);
      return;
    }
    setError('');
    setBusy(true);
    try {
      const allowed: Record<string, string[]> = {
        class_groups: ['name', 'academic_year_id', 'language', 'level_id', 'active'],
        subjects: ['code', 'name_en', 'name_tr', 'active'],
        levels: ['code', 'name_en', 'name_tr', 'kind', 'active'],
        packages: [
          'code',
          'name_en',
          'name_tr',
          'weekly_lessons',
          'monthly_fee',
          'currency',
          'active',
        ],
        academic_years: ['name', 'starts_on', 'ends_on', 'active'],
        periods: ['academic_year_id', 'number', 'name_en', 'name_tr', 'starts_on', 'ends_on'],
      };
      const value = Object.fromEntries(
        allowed[table]
          .filter((k) => current[k] !== undefined)
          .map((k) => [
            k,
            current[k] === '' && ['starts_on', 'ends_on', 'monthly_fee', 'level_id'].includes(k)
              ? null
              : current[k],
          ]),
      );
      if (current.id) value.id = current.id;
      if (table === 'class_groups' && specialistSubjectId && members.includes(specialistSubjectId))
        value.specialist_level_id = specialistLevel;
      if (table === 'packages' || table === 'class_groups')
        await api.rpc('save_school_reference', {
          p_table: table,
          p_values: value,
          p_subject_ids: members,
          p_group_ids: memberGroups,
          p_level_ids: memberLevels,
        });
      else await api.save(table, value);
    } catch (e) {
      // Keep the form open with everything typed; show the reason inside it.
      setError(errorText(e, lang));
      setBusy(false);
      return;
    }
    try {
      await refresh();
    } catch (e) {
      notify(errorText(e, lang), 'error');
    }
    close();
    setBusy(false);
    notify(tr(lang, 'Saved.', 'Kaydedildi.'));
  }
  async function deleteGroup() {
    if (!editing?.id || busy) return;
    const confirmed = await confirmDelete({
      title: tr(lang, 'Delete this class?', 'Bu sınıf silinsin mi?'),
      message: tr(
        lang,
        `"${editing.name}" and its lessons are removed permanently. This only works for a class with no students, lesson dates or records; otherwise archive it.`,
        `"${editing.name}" ve dersleri kalıcı olarak silinir. Yalnızca öğrencisi, ders tarihi veya kaydı olmayan sınıflarda çalışır; aksi halde arşivleyin.`,
      ),
      confirmLabel: tr(lang, 'Delete permanently', 'Kalıcı olarak sil'),
      danger: true,
    });
    if (!confirmed) return;
    setBusy(true);
    setError('');
    try {
      await api.rpc('delete_class_group', { p_id: editing.id });
    } catch (e) {
      const message = errorText(e, lang);
      if (message.includes('has_records')) {
        setHasRecords(true);
        setError(
          tr(
            lang,
            'This class has students, lesson dates or other records, so it cannot be deleted. Archive it instead; its history stays.',
            'Bu sınıfın öğrencisi, ders tarihi veya başka kayıtları var; silinemez. Bunun yerine arşivleyin, geçmişi korunur.',
          ),
        );
      } else setError(message);
      setBusy(false);
      return;
    }
    try {
      await refresh();
    } catch (e) {
      notify(errorText(e, lang), 'error');
    }
    close();
    setBusy(false);
    notify(tr(lang, 'Class deleted.', 'Sınıf silindi.'));
  }
  async function saveSchool() {
    if (!settings || schoolBusy) return;
    setSchoolBusy(true);
    try {
      await api.save('school_settings', school);
      await refresh();
      setSettings(null);
      notify(tr(lang, 'School settings updated.', 'Okul ayarları güncellendi.'));
    } catch (e) {
      notify(errorText(e, lang), 'error');
    } finally {
      setSchoolBusy(false);
    }
  }
  return (
    <>
      <PageHeader
        eyebrow={tr(lang, 'A place for everything', 'Her şey yerli yerinde')}
        title={tr(lang, 'School settings', 'Okul ayarları')}
        description={tr(
          lang,
          'Keep your subjects, packages and academic calendar up to date.',
          'Dersleri, paketleri ve akademik takvimi güncel tutun.',
        )}
      >
        <Settings2 className="heading-icon" size={34} />
      </PageHeader>
      <div className="card padded">
        <div className="form-grid">
          <Field
            label={tr(lang, 'School name', 'Okul adı')}
            value={school?.name || ''}
            onChange={(e) => setSettings({ ...school, name: e.target.value })}
          />
          <SelectField
            label={tr(lang, 'School timezone', 'Okul saat dilimi')}
            value={school?.timezone || 'Europe/Warsaw'}
            onChange={(e) => setSettings({ ...school, timezone: e.target.value })}
          >
            {[
              ['Europe/Warsaw', tr(lang, 'Poland (Warsaw)', 'Polonya (Varşova)')],
              ['Europe/Istanbul', tr(lang, 'Türkiye (Istanbul)', 'Türkiye (İstanbul)')],
              ['Europe/Berlin', tr(lang, 'Germany (Berlin)', 'Almanya (Berlin)')],
              ['Europe/Amsterdam', tr(lang, 'Netherlands (Amsterdam)', 'Hollanda (Amsterdam)')],
              ['Europe/London', tr(lang, 'United Kingdom (London)', 'Birleşik Krallık (Londra)')],
            ].map(([zone, text]) => (
              <option key={zone} value={zone}>
                {text}
              </option>
            ))}
          </SelectField>
          <SelectField
            label={tr(lang, 'Default language', 'Varsayılan dil')}
            value={school?.default_language || 'tr'}
            onChange={(e) => setSettings({ ...school, default_language: e.target.value })}
          >
            <option value="tr">Türkçe</option>
            <option value="en">English</option>
          </SelectField>
          <Button disabled={!settings || schoolBusy} onClick={saveSchool}>
            {schoolBusy
              ? tr(lang, 'Saving…', 'Kaydediliyor…')
              : tr(lang, 'Save settings', 'Ayarları kaydet')}
          </Button>
        </div>
      </div>
      <Tabs
        className="scroll-tabs"
        label={tr(lang, 'Reference lists', 'Tanım listeleri')}
        value={table}
        onChange={setTable}
        items={referenceTables.map(([id, en, t]) => ({ id, label: tr(lang, en, t) }))}
      />
      <div className="card">
        <div className="card-header">
          <h3>
            {tr(
              lang,
              referenceTables.find((x) => x[0] === table)![1],
              referenceTables.find((x) => x[0] === table)![2],
            )}
          </h3>
          <span className="inline-actions">
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
            <Button onClick={() => open()}>
              <Plus size={16} />
              {tr(lang, 'Add new', 'Yeni ekle')}
            </Button>
          </span>
        </div>
        <div className="table-wrap">
          <table className="data-table">
            <thead>
              <tr>
                {rowSort.header('name', tr(lang, 'Name', 'Ad'))}
                <th scope="col">{tr(lang, 'Details', 'Ayrıntılar')}</th>
                {rowSort.header('status', tr(lang, 'Status', 'Durum'))}
                <th scope="col">
                  <span className="sr-only">{tr(lang, 'Actions', 'İşlemler')}</span>
                </th>
              </tr>
            </thead>
            <tbody>
              {rowSort.sorted.map((row) => (
                <tr key={row.id}>
                  <td>
                    <strong>{label(row, lang)}</strong>
                    <small>{row.code}</small>
                  </td>
                  <td>
                    {table === 'periods'
                      ? `${data.academic_years.find((y) => y.id === row.academic_year_id)?.name || ''} · ${tr(lang, 'Term', 'Dönem')} ${row.number} · ${row.starts_on || '—'} → ${row.ends_on || '—'}`
                      : table === 'class_groups'
                        ? [
                            yearName(row.academic_year_id),
                            row.language === 'en' ? 'English' : 'Türkçe',
                            label(
                              data.levels.find((l) => l.id === row.level_id),
                              lang,
                            ),
                            `${lessonsOf(row.id).length} ${tr(lang, 'subjects', 'ders')}`,
                          ]
                            .filter((part) => part && part !== '—')
                            .join(' · ')
                        : table === 'packages'
                          ? [
                              `${data.package_classes.filter((r) => r.package_id === row.id).length} ${tr(lang, 'classes', 'sınıf')}`,
                              `${data.package_levels.filter((r) => r.package_id === row.id).length} ${tr(lang, 'levels', 'seviye')}`,
                              `${data.package_subjects.filter((r) => r.package_id === row.id).length} ${tr(lang, 'subjects', 'ders')}`,
                            ].join(' · ')
                          : table === 'academic_years'
                            ? `${row.starts_on} → ${row.ends_on}`
                            : table === 'levels'
                              ? levelKind(row.kind)
                              : '—'}
                  </td>
                  <td>
                    <Badge tone={row.active === false ? 'neutral' : 'green'}>
                      {row.active === false
                        ? tr(lang, 'Archived', 'Arşivlendi')
                        : tr(lang, 'Active', 'Etkin')}
                    </Badge>
                  </td>
                  <td>
                    <Button variant="ghost" onClick={() => open(row)}>
                      {tr(lang, 'Edit', 'Düzenle')}
                    </Button>
                  </td>
                </tr>
              ))}
            </tbody>
          </table>
        </div>
        {!rows.length && (
          <EmptyState
            title={
              allRows.length
                ? tr(lang, 'Only archived records', 'Yalnızca arşivlenmiş kayıtlar var')
                : tr(lang, 'No records yet', 'Henüz kayıt yok')
            }
          />
        )}
      </div>
      <div className="card padded">
        <h3>{tr(lang, 'Recent system activity', 'Son sistem işlemleri')}</h3>
        {data.audit_log
          .slice()
          .reverse()
          .slice(0, 8)
          .map((r) => (
            <div className="list-row" key={r.id}>
              <span>
                {r.action} · {r.entity_type}
              </span>
              <time>
                {new Date(r.created_at).toLocaleString(lang === 'tr' ? 'tr-TR' : 'en-GB')}
              </time>
            </div>
          ))}
        <p className="muted">
          {tr(
            lang,
            'History is retained for changes to records, payments and configurations.',
            'Kayıt, ödeme ve yapılandırma değişikliklerinin geçmişi saklanır.',
          )}
        </p>
      </div>
      {editing && (
        <Modal
          title={tr(lang, 'Edit reference record', 'Tanım kaydını düzenle')}
          onClose={close}
          lang={lang}
        >
          <form
            onSubmit={(e) => {
              e.preventDefault();
              void save();
            }}
            className="stack"
          >
            <FormError error={error} />
            <div className="form-grid">
              {table === 'academic_years' || table === 'class_groups' ? (
                <Field
                  label={
                    table === 'class_groups'
                      ? tr(lang, 'Class name', 'Sınıf adı')
                      : tr(lang, 'Name', 'Ad')
                  }
                  placeholder={
                    table === 'class_groups' ? tr(lang, 'e.g. Class 1', 'ör. Sınıf 1') : undefined
                  }
                  required
                  value={editing.name || ''}
                  onChange={(e) => field('name', e.target.value)}
                />
              ) : (
                <>
                  <Field
                    label="English"
                    required
                    value={editing.name_en || ''}
                    onChange={(e) => field('name_en', e.target.value)}
                  />
                  <Field
                    label="Türkçe"
                    required
                    value={editing.name_tr || ''}
                    onChange={(e) => field('name_tr', e.target.value)}
                  />
                </>
              )}
              {table === 'class_groups' && (
                <>
                  <SelectField
                    label={tr(lang, 'Academic year', 'Akademik yıl')}
                    value={editing.academic_year_id || ''}
                    onChange={(e) => field('academic_year_id', e.target.value)}
                    required
                  >
                    {data.academic_years.map((y) => (
                      <option value={y.id} key={y.id}>
                        {y.name}
                      </option>
                    ))}
                  </SelectField>
                  <SelectField
                    label={tr(lang, 'Course language', 'Ders dili')}
                    value={editing.language || 'tr'}
                    onChange={(e) => field('language', e.target.value)}
                  >
                    <option value="tr">Türkçe</option>
                    <option value="en">English</option>
                  </SelectField>
                  <SelectField
                    label={tr(lang, 'Level', 'Seviye')}
                    value={editing.level_id || ''}
                    onChange={(e) => field('level_id', e.target.value)}
                  >
                    <option value="">{tr(lang, 'Not set', 'Belirtilmedi')}</option>
                    {data.levels
                      .filter((l) => l.active !== false && l.kind !== 'specialist')
                      .map((l) => (
                        <option value={l.id} key={l.id}>
                          {label(l, lang)}
                        </option>
                      ))}
                  </SelectField>
                </>
              )}
              {!['academic_years', 'periods', 'class_groups'].includes(table) && (
                <Field
                  label={tr(lang, 'Code', 'Kod')}
                  required
                  value={editing.code || ''}
                  onChange={(e) => field('code', e.target.value)}
                />
              )}{' '}
              {table === 'levels' && (
                <SelectField
                  label={tr(lang, 'Level type', 'Seviye türü')}
                  value={editing.kind || 'specialist'}
                  onChange={(e) => field('kind', e.target.value)}
                >
                  <option value="class">{tr(lang, 'Class level', 'Sınıf seviyesi')}</option>
                  <option value="specialist">{tr(lang, 'Specialist reading', 'Uzmanlık seviyesi')}</option>
                  <option value="knowledge">{tr(lang, 'Knowledge track', 'Bilgi rotası')}</option>
                </SelectField>
              )}
              {table === 'periods' && (
                <>
                  <SelectField
                    label={tr(lang, 'Academic year', 'Akademik yıl')}
                    value={editing.academic_year_id}
                    onChange={(e) => {
                      field('academic_year_id', e.target.value);
                      if (!editing.id) setTermNumber(nextTerm(e.target.value));
                    }}
                  >
                    {data.academic_years.map((y) => (
                      <option value={y.id} key={y.id}>
                        {y.name}
                      </option>
                    ))}
                  </SelectField>
                  <Field
                    label={tr(lang, 'Term number (1–5)', 'Dönem numarası (1–5)')}
                    type="number"
                    min="1"
                    max={MAX_TERM}
                    required
                    value={editing.number || 1}
                    onChange={(e) => setTermNumber(Number(e.target.value))}
                    hint={tr(lang, 'Term 5 is the summer school.', '5. dönem yaz okuludur.')}
                  />
                </>
              )}
              {['academic_years', 'periods'].includes(table) && (
                <>
                  <Field
                    label={tr(lang, 'Start date', 'Başlangıç')}
                    type="date"
                    required
                    value={editing.starts_on || ''}
                    onChange={(e) => field('starts_on', e.target.value)}
                  />
                  <Field
                    label={tr(lang, 'End date', 'Bitiş')}
                    type="date"
                    required
                    value={editing.ends_on || ''}
                    onChange={(e) => field('ends_on', e.target.value)}
                  />
                </>
              )}
              {table === 'packages' && (
                <>
                  <Field
                    label={tr(lang, 'Lessons per week', 'Haftalık ders')}
                    type="number"
                    min="1"
                    required
                    value={editing.weekly_lessons || 1}
                    onChange={(e) => field('weekly_lessons', Number(e.target.value))}
                  />
                  <Field
                    label={tr(lang, 'Monthly fee', 'Aylık ücret')}
                    type="number"
                    min="0"
                    step="0.01"
                    value={editing.monthly_fee ?? ''}
                    onChange={(e) =>
                      field('monthly_fee', e.target.value === '' ? null : Number(e.target.value))
                    }
                  />
                  <SelectField
                    label={tr(lang, 'Currency', 'Para birimi')}
                    required
                    value={isCurrency(editing.currency) ? editing.currency : 'EUR'}
                    onChange={(e) => field('currency', e.target.value)}
                  >
                    {CURRENCIES.map((code) => (
                      <option key={code} value={code}>
                        {code}
                      </option>
                    ))}
                  </SelectField>
                </>
              )}
              {table !== 'periods' && (
                <label className="checkbox-label">
                  <input
                    type="checkbox"
                    checked={editing.active !== false}
                    onChange={(e) => field('active', e.target.checked)}
                  />
                  {tr(lang, 'Active', 'Etkin')}
                </label>
              )}
            </div>
            {(table === 'packages' || table === 'class_groups') && (
              <div className="stack">
                <h4>
                  {table === 'class_groups'
                    ? tr(lang, 'Subjects taught in this class', 'Bu sınıfta okutulan dersler')
                    : tr(lang, 'Included subjects', 'Dahil edilen dersler')}
                </h4>
                {table === 'class_groups' && (
                  <p className="form-hint">
                    {tr(
                      lang,
                      'Each ticked subject becomes a lesson of this class. Assign its teacher on the Classes & lessons page. Unticking keeps the lesson’s history but makes it inactive.',
                      'İşaretlenen her ders bu sınıfın dersi olur. Öğretmenini Sınıflar ve dersler sayfasından atayın. İşareti kaldırmak dersin geçmişini korur, dersi pasif yapar.',
                    )}
                  </p>
                )}
                <div className="check-grid">
                  {data.subjects
                    .filter((s) => s.active !== false)
                    .map((s) => (
                      <label key={s.id} className="checkbox-label">
                        <input
                          type="checkbox"
                          checked={members.includes(s.id)}
                          onChange={(e) =>
                            setMembers(
                              e.target.checked
                                ? [...members, s.id]
                                : members.filter((x) => x !== s.id),
                            )
                          }
                        />
                        {label(s, lang)}
                      </label>
                    ))}
                </div>
                {table === 'class_groups' && specialistSubjectId && members.includes(specialistSubjectId) && (
                  <>
                    <SelectField
                      label={tr(lang, 'Specialist level', 'Uzmanlık seviyesi')}
                      value={specialistLevel}
                      onChange={(e) => setSpecialistLevel(e.target.value)}
                    >
                      <option value="">{tr(lang, 'Not set', 'Belirtilmedi')}</option>
                      {levelsForSubject(specialistSubjectId, data).map((l) => (
                        <option value={l.id} key={l.id}>
                          {label(l, lang)}
                        </option>
                      ))}
                    </SelectField>
                    <p className="form-hint">
                      {tr(
                        lang,
                        'The specialist lesson of this class has its own level (C1, T1…); the class level above is used by the other lessons.',
                        'Bu sınıfın Uzmanlık dersi kendi seviyesine sahiptir (C1, T1…); yukarıdaki sınıf seviyesi diğer dersler içindir.',
                      )}
                    </p>
                  </>
                )}
              </div>
            )}
            {table === 'packages' && (
              <>
                <div className="stack">
                  <h4>{tr(lang, 'Included classes', 'Dahil edilen sınıflar')}</h4>
                  <div className="check-grid">
                    {data.class_groups
                      .filter((g) => g.active !== false)
                      .map((g) => (
                        <label key={g.id} className="checkbox-label">
                          <input
                            type="checkbox"
                            checked={memberGroups.includes(g.id)}
                            onChange={(e) =>
                              setMemberGroups(
                                e.target.checked
                                  ? [...memberGroups, g.id]
                                  : memberGroups.filter((x) => x !== g.id),
                              )
                            }
                          />
                          {g.name}
                          <small className="muted"> {yearName(g.academic_year_id)}</small>
                        </label>
                      ))}
                    {!data.class_groups.length && (
                      <p className="muted">{tr(lang, 'No classes yet.', 'Henüz sınıf yok.')}</p>
                    )}
                  </div>
                </div>
                <div className="stack">
                  <h4>{tr(lang, 'Included levels', 'Dahil edilen seviyeler')}</h4>
                  <div className="check-grid">
                    {data.levels
                      .filter((l) => l.active !== false)
                      .map((l) => (
                        <label key={l.id} className="checkbox-label">
                          <input
                            type="checkbox"
                            checked={memberLevels.includes(l.id)}
                            onChange={(e) =>
                              setMemberLevels(
                                e.target.checked
                                  ? [...memberLevels, l.id]
                                  : memberLevels.filter((x) => x !== l.id),
                              )
                            }
                          />
                          {label(l, lang)}
                          <small className="muted"> {levelKind(l.kind)}</small>
                        </label>
                      ))}
                  </div>
                </div>
              </>
            )}
            <div className="modal-row-actions">
              <Button type="submit" disabled={busy}>
                <Save size={16} />
                {tr(lang, 'Save record', 'Kaydı kaydet')}
              </Button>
              {table === 'class_groups' && editing.id && (
                <span className="inline-actions">
                  {hasRecords && editing.active !== false && (
                    <Button
                      type="button"
                      variant="secondary"
                      disabled={busy}
                      onClick={() => void save({ active: false })}
                    >
                      {tr(lang, 'Archive instead', 'Bunun yerine arşivle')}
                    </Button>
                  )}
                  <Button
                    type="button"
                    variant="danger"
                    disabled={busy}
                    onClick={() => void deleteGroup()}
                  >
                    {tr(lang, 'Delete class', 'Sınıfı sil')}
                  </Button>
                </span>
              )}
            </div>
          </form>
        </Modal>
      )}
      {confirmDialog}
    </>
  );
}
