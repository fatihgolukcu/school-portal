import { useEffect, useMemo, useRef, useState, type ReactNode } from 'react';
import { Download } from 'lucide-react';
import type { PageProps } from '../types';
import {
  Badge,
  Button,
  EmptyState,
  PageHeader,
  SearchField,
  SelectField,
  StatCard,
  Tabs,
  fullName,
  label,
  tr,
} from '../ui';
import {
  currentPeriodId,
  findIssues,
  isManagement,
  lessonSummary,
  reportMetrics,
  teacherSummary,
  type Issue,
  type IssueGroup,
  type ReportKpis,
  type ReportRow,
  type SummaryRow,
} from '../checks';
import { classLevelId } from '../workflow';
import { downloadBlob, writeXlsx } from '../xlsx';

const GROUPS: { id: IssueGroup; en: string; tr: string }[] = [
  { id: 'plan', en: 'Lesson plan and teacher', tr: 'Ders planı ve öğretmen' },
  { id: 'attendance', en: 'Attendance and curriculum', tr: 'Yoklama ve müfredat' },
  { id: 'assessment', en: 'Assessments and reports', tr: 'Değerlendirme ve karne' },
  { id: 'student', en: 'Students and parents', tr: 'Öğrenci ve veli' },
];
const SEVERITY: Record<string, [string, string]> = {
  red: ['Urgent', 'Acil'],
  orange: ['Important', 'Önemli'],
  yellow: ['Review', 'İncele'],
};

/* ---------- Report charts (plain SVG/HTML) ---------- */

type Lang = PageProps['lang'];
const SERIES_1 = '#2a78d6';
const SERIES_2 = '#eb6834';

interface Tip {
  x: number;
  y: number;
  title: string;
  rows: { color?: string; name: string; value: string }[];
}

function usePlot(active: boolean) {
  const ref = useRef<HTMLDivElement>(null);
  const [width, setWidth] = useState(640);
  const [tip, setTip] = useState<Tip | null>(null);
  useEffect(() => {
    const el = ref.current;
    if (!el) return;
    const measure = () => setWidth(el.clientWidth || 640);
    measure();
    if (typeof ResizeObserver === 'undefined') return;
    const observer = new ResizeObserver(measure);
    observer.observe(el);
    return () => observer.disconnect();
  }, [active]);
  const at = (event: { clientX: number; clientY: number }) => {
    const box = ref.current?.getBoundingClientRect();
    return { x: event.clientX - (box?.left || 0), y: event.clientY - (box?.top || 0) };
  };
  return { ref, width, tip, setTip, at };
}

function ChartTip({ tip, width }: { tip: Tip | null; width: number }) {
  if (!tip) return null;
  const flip = tip.x > width * 0.55;
  return (
    <div
      className="rc-tip"
      style={{
        left: tip.x,
        top: tip.y,
        transform: flip ? 'translate(calc(-100% - 12px), -50%)' : 'translate(12px, -50%)',
      }}
    >
      <div className="rc-tip-title">{tip.title}</div>
      {tip.rows.map((r) => (
        <div className="rc-tip-row" key={r.name}>
          {r.color && <i style={{ background: r.color }} />}
          <strong>{r.value}</strong>
          <span>{r.name}</span>
        </div>
      ))}
    </div>
  );
}

const pctText = (value: number | null) => (value === null ? '—' : `${value}%`);
const niceStep = (raw: number) => {
  const base = Math.pow(10, Math.floor(Math.log10(raw || 1)));
  return ([1, 2, 5, 10].find((m) => m * base >= raw) || 10) * base;
};
const weekText = (start: string, lang: Lang, short = false) => {
  const day = new Date(`${start}T12:00:00Z`).toLocaleDateString(lang === 'tr' ? 'tr-TR' : 'en-GB', {
    day: 'numeric',
    month: 'short',
    timeZone: 'UTC',
  });
  return short ? day : lang === 'tr' ? `${day} haftası` : `Week of ${day}`;
};
const minutesText = (minutes: number, lang: Lang) => {
  const h = Math.floor(minutes / 60);
  const m = minutes % 60;
  return lang === 'tr' ? `${h} sa ${m} dk` : `${h} h ${m} min`;
};

function StatTile({ label, value, sub }: { label: string; value: ReactNode; sub?: ReactNode }) {
  return (
    <div className="rc-tile">
      <span>{label}</span>
      <strong>{value}</strong>
      {sub && <small>{sub}</small>}
    </div>
  );
}

interface TableView {
  head: string[];
  rows: (string | number)[][];
}

function ChartCard({
  title,
  description,
  legend,
  table,
  lang,
  children,
  controls,
  footer,
}: {
  footer?: ReactNode;
  title: string;
  description?: string;
  legend?: { name: string; color: string }[];
  table: TableView;
  lang: Lang;
  children: ReactNode;
  controls?: ReactNode;
}) {
  const [view, setView] = useState<'chart' | 'table'>('chart');
  return (
    <section className="card padded rc-card">
      <div className="rc-card-head">
        <div>
          <h2>{title}</h2>
          {description && <p className="muted">{description}</p>}
        </div>
        <div className="rc-card-tools">
          {controls}
          <button
            type="button"
            className="rc-toggle"
            aria-pressed={view === 'table'}
            onClick={() => setView(view === 'chart' ? 'table' : 'chart')}
          >
            {view === 'chart'
              ? tr(lang, 'Table view', 'Tablo görünümü')
              : tr(lang, 'Chart view', 'Grafik görünümü')}
          </button>
        </div>
      </div>
      {legend && legend.length > 1 && view === 'chart' && (
        <div className="rc-legend">
          {legend.map((l) => (
            <span key={l.name}>
              <i style={{ background: l.color }} />
              {l.name}
            </span>
          ))}
        </div>
      )}
      {view === 'chart' ? (
        children
      ) : (
        <div className="table-wrap">
          <table className="data-table rc-plain-table">
            <thead>
              <tr>
                {table.head.map((h) => (
                  <th key={h}>{h}</th>
                ))}
              </tr>
            </thead>
            <tbody>
              {table.rows.map((row, i) => (
                <tr key={i}>
                  {row.map((cell, j) => (
                    <td key={j}>{cell}</td>
                  ))}
                </tr>
              ))}
            </tbody>
          </table>
        </div>
      )}
      {footer}
    </section>
  );
}

interface BarItem {
  id: string;
  label: string;
  value: number | null;
  display: string;
  tip: { name: string; value: string }[];
}

function BarChartH({
  items,
  max,
  lang,
  unit,
  color = SERIES_1,
  limit = 10,
}: {
  items: BarItem[];
  max: number;
  lang: Lang;
  unit: string;
  color?: string;
  limit?: number;
}) {
  const plot = usePlot(items.length > 0);
  const [all, setAll] = useState(false);
  if (!items.length)
    return (
      <EmptyState title={tr(lang, 'No data for this selection.', 'Bu seçim için veri yok.')} />
    );
  const shown = all ? items : items.slice(0, limit);
  const show = (item: BarItem, x: number, y: number) =>
    plot.setTip({
      x,
      y,
      title: item.label,
      rows: [{ name: unit, value: item.display }, ...item.tip],
    });
  return (
    <>
      <div className="rc-plot rc-hbars" ref={plot.ref} onPointerLeave={() => plot.setTip(null)}>
        {shown.map((item) => {
          const p = item.value === null || max <= 0 ? 0 : Math.min(100, (item.value / max) * 100);
          return (
            <div
              className="rc-hrow"
              key={item.id}
              tabIndex={0}
              onPointerMove={(e) => {
                const { x, y } = plot.at(e);
                show(item, x, y);
              }}
              onFocus={(e) =>
                show(
                  item,
                  plot.width / 2,
                  e.currentTarget.offsetTop + e.currentTarget.offsetHeight / 2,
                )
              }
              onBlur={() => plot.setTip(null)}
            >
              <span className="rc-hlabel" title={item.label}>
                {item.label}
              </span>
              <span className="rc-htrack">
                <span className="rc-hbar" style={{ width: `${p * 0.86}%`, background: color }} />
                <span className="rc-hval" style={{ left: `calc(${p * 0.86}% + 6px)` }}>
                  {item.display}
                </span>
              </span>
            </div>
          );
        })}
        <ChartTip tip={plot.tip} width={plot.width} />
      </div>
      {items.length > limit && (
        <button type="button" className="rc-more" onClick={() => setAll(!all)}>
          {all
            ? tr(lang, 'Show fewer', 'Daha az göster')
            : tr(lang, `Show all (${items.length})`, `Tümünü göster (${items.length})`)}
        </button>
      )}
    </>
  );
}

const MARGIN = { top: 14, right: 8, bottom: 26, left: 34 };

function ColumnChart({
  labels,
  tipTitles,
  values,
  unit,
  lang,
  color = SERIES_1,
}: {
  labels: string[];
  tipTitles: string[];
  values: number[];
  unit: string;
  lang: Lang;
  color?: string;
}) {
  const empty = !values.some((v) => v > 0);
  const plot = usePlot(!empty);
  if (empty)
    return (
      <EmptyState
        title={tr(lang, 'No lessons held in this range.', 'Bu aralıkta yapılan ders yok.')}
      />
    );
  const height = 200;
  const w = plot.width;
  const innerW = Math.max(40, w - MARGIN.left - MARGIN.right);
  const innerH = height - MARGIN.top - MARGIN.bottom;
  const step = niceStep(Math.max(...values) / 4);
  const yMax = step * 4;
  const band = innerW / values.length;
  const bw = Math.min(24, band * 0.6);
  const base = MARGIN.top + innerH;
  const every = Math.max(1, Math.ceil(46 / band));
  const maxIndex = values.indexOf(Math.max(...values));
  const last = values.length - 1;
  const hover = plot.tip ? Math.floor((plot.tip.x - MARGIN.left) / band) : -1;
  const point = (i: number, y: number) =>
    plot.setTip({
      x: MARGIN.left + band * (i + 0.5),
      y,
      title: tipTitles[i],
      rows: [{ color, name: unit, value: String(values[i]) }],
    });
  return (
    <div className="rc-plot" ref={plot.ref} onPointerLeave={() => plot.setTip(null)}>
      <svg width={w} height={height} role="img" aria-label={unit}>
        {[0, 1, 2, 3, 4].map((t) => {
          const y = base - (t / 4) * innerH;
          return (
            <g key={t}>
              <line x1={MARGIN.left} x2={w - MARGIN.right} y1={y} y2={y} className="rc-grid" />
              <text x={MARGIN.left - 6} y={y + 4} textAnchor="end" className="rc-axis">
                {t * step}
              </text>
            </g>
          );
        })}
        {values.map((v, i) => {
          const h = (v / yMax) * innerH;
          const x = MARGIN.left + band * (i + 0.5) - bw / 2;
          const r = Math.min(4, h);
          const labelled = v > 0 && (i === maxIndex || i === last);
          return (
            <g
              key={i}
              tabIndex={0}
              className={i === hover ? 'rc-col active' : 'rc-col'}
              onFocus={() => point(i, base - h)}
              onBlur={() => plot.setTip(null)}
            >
              <rect
                x={MARGIN.left + band * i}
                y={MARGIN.top}
                width={band}
                height={innerH}
                fill="transparent"
                onPointerMove={(e) => point(i, plot.at(e).y)}
              />
              {h > 0 && (
                <path
                  d={`M${x},${base} V${base - h + r} a${r},${r} 0 0 1 ${r},${-r} H${x + bw - r} a${r},${r} 0 0 1 ${r},${r} V${base} Z`}
                  fill={color}
                  pointerEvents="none"
                />
              )}
              {labelled && (
                <text x={x + bw / 2} y={base - h - 5} textAnchor="middle" className="rc-value">
                  {v}
                </text>
              )}
            </g>
          );
        })}
        <line x1={MARGIN.left} x2={w - MARGIN.right} y1={base} y2={base} className="rc-baseline" />
        {labels.map(
          (label, i) =>
            (last - i) % every === 0 && (
              <text
                key={i}
                x={MARGIN.left + band * (i + 0.5)}
                y={height - 8}
                textAnchor="middle"
                className="rc-axis"
              >
                {label}
              </text>
            ),
        )}
      </svg>
      <ChartTip tip={plot.tip} width={w} />
    </div>
  );
}

interface LineSeries {
  name: string;
  color: string;
  values: (number | null)[];
}

function LineChart({
  labels,
  tipTitles,
  series,
  lang,
}: {
  labels: string[];
  tipTitles: string[];
  series: LineSeries[];
  lang: Lang;
}) {
  const empty = !series.some((s) => s.values.some((v) => v !== null));
  const plot = usePlot(!empty);
  const [index, setIndex] = useState<number | null>(null);
  if (empty)
    return <EmptyState title={tr(lang, 'No attendance data yet.', 'Henüz yoklama verisi yok.')} />;
  const height = 220;
  const w = plot.width;
  const right = 44;
  const innerW = Math.max(40, w - MARGIN.left - right);
  const innerH = height - MARGIN.top - MARGIN.bottom;
  const n = labels.length;
  const xAt = (i: number) => MARGIN.left + (n > 1 ? (innerW * i) / (n - 1) : innerW / 2);
  const yAt = (v: number) => MARGIN.top + innerH - (v / 100) * innerH;
  const every = Math.max(1, Math.ceil(46 / (innerW / Math.max(1, n - 1))));
  const select = (i: number | null, y = 0) => {
    setIndex(i);
    if (i === null) return plot.setTip(null);
    plot.setTip({
      x: xAt(i),
      y,
      title: tipTitles[i],
      rows: series.map((s) => ({
        color: s.color,
        name: s.name,
        value: pctText(s.values[i]),
      })),
    });
  };
  const ends = series.map((s) => {
    let at = -1;
    s.values.forEach((v, i) => {
      if (v !== null) at = i;
    });
    return at;
  });
  const labelled: number[] = [];
  return (
    <div className="rc-plot" ref={plot.ref} onPointerLeave={() => select(null)}>
      <svg width={w} height={height} role="img" aria-label={series.map((s) => s.name).join(', ')}>
        {[0, 25, 50, 75, 100].map((t) => (
          <g key={t}>
            <line x1={MARGIN.left} x2={w - right} y1={yAt(t)} y2={yAt(t)} className="rc-grid" />
            <text x={MARGIN.left - 6} y={yAt(t) + 4} textAnchor="end" className="rc-axis">
              {t}
            </text>
          </g>
        ))}
        {index !== null && (
          <line x1={xAt(index)} x2={xAt(index)} y1={MARGIN.top} y2={yAt(0)} className="rc-cross" />
        )}
        {series.map((s) => {
          let d = '';
          let pen = false;
          s.values.forEach((v, i) => {
            if (v === null) {
              pen = false;
              return;
            }
            d += `${pen ? 'L' : 'M'}${xAt(i)},${yAt(v)}`;
            pen = true;
          });
          return (
            <path
              key={s.name}
              d={d}
              fill="none"
              stroke={s.color}
              strokeWidth={2}
              strokeLinejoin="round"
              strokeLinecap="round"
            />
          );
        })}
        {series.map((s, k) => {
          const i = ends[k];
          if (i < 0) return null;
          const y = yAt(s.values[i] as number);
          const show = labelled.every((o) => Math.abs(o - y) > 13);
          if (show) labelled.push(y);
          return (
            <g key={s.name}>
              <circle cx={xAt(i)} cy={y} r={4} fill={s.color} stroke="#ffffff" strokeWidth={2} />
              {show && (
                <text x={xAt(i) + 9} y={y + 4} className="rc-value">
                  {pctText(s.values[i])}
                </text>
              )}
            </g>
          );
        })}
        {index !== null &&
          series.map(
            (s) =>
              s.values[index] !== null && (
                <circle
                  key={s.name}
                  cx={xAt(index)}
                  cy={yAt(s.values[index] as number)}
                  r={4}
                  fill={s.color}
                  stroke="#ffffff"
                  strokeWidth={2}
                />
              ),
          )}
        <line x1={MARGIN.left} x2={w - right} y1={yAt(0)} y2={yAt(0)} className="rc-baseline" />
        {labels.map(
          (label, i) =>
            (n - 1 - i) % every === 0 && (
              <text key={i} x={xAt(i)} y={height - 8} textAnchor="middle" className="rc-axis">
                {label}
              </text>
            ),
        )}
        <rect
          x={MARGIN.left}
          y={MARGIN.top}
          width={innerW}
          height={innerH}
          fill="transparent"
          tabIndex={0}
          aria-label={tr(
            lang,
            'Weekly values, use arrow keys',
            'Haftalık değerler, ok tuşlarını kullanın',
          )}
          onPointerMove={(e) => {
            const { x, y } = plot.at(e);
            const i = Math.max(
              0,
              Math.min(n - 1, Math.round(((x - MARGIN.left) / innerW) * (n - 1))),
            );
            select(i, y);
          }}
          onBlur={() => select(null)}
          onKeyDown={(e) => {
            if (e.key !== 'ArrowLeft' && e.key !== 'ArrowRight') return;
            e.preventDefault();
            const next = Math.max(
              0,
              Math.min(n - 1, (index ?? n - 1) + (e.key === 'ArrowRight' ? 1 : -1)),
            );
            select(next, MARGIN.top + innerH / 2);
          }}
        />
      </svg>
      <ChartTip tip={plot.tip} width={w} />
    </div>
  );
}

type MetricKey = 'attendancePct' | 'assessmentPct' | 'curriculumPct';
const METRICS: { id: MetricKey; en: string; tr: string }[] = [
  { id: 'attendancePct', en: 'Attendance %', tr: 'Yoklama %' },
  { id: 'assessmentPct', en: 'Assessments %', tr: 'Değerlendirme %' },
  { id: 'curriculumPct', en: 'Curriculum %', tr: 'Müfredat %' },
];

const reportName = (r: ReportRow, lang: Lang) => (lang === 'tr' ? r.name_tr : r.name_en);

function SortTable({ rows, lang, first }: { rows: ReportRow[]; lang: Lang; first: string }) {
  const [sort, setSort] = useState<{ key: string; dir: 1 | -1 }>({ key: 'name', dir: 1 });
  const cols: {
    key: string;
    label: string;
    get: (r: ReportRow) => number | string | null;
    show: (r: ReportRow) => string;
  }[] = [
    {
      key: 'name',
      label: first,
      get: (r) => reportName(r, lang),
      show: (r) => reportName(r, lang),
    },
    {
      key: 'lessons',
      label: tr(lang, 'Lessons', 'Ders sayısı'),
      get: (r) => r.lessons,
      show: (r) => String(r.lessons),
    },
    {
      key: 'students',
      label: tr(lang, 'Students', 'Öğrenci'),
      get: (r) => r.students,
      show: (r) => String(r.students),
    },
    {
      key: 'attendancePct',
      label: tr(lang, 'Attendance complete %', 'Yoklama %'),
      get: (r) => r.attendancePct,
      show: (r) => pctText(r.attendancePct),
    },
    {
      key: 'attendanceRatePct',
      label: tr(lang, 'Attendance rate %', 'Devam %'),
      get: (r) => r.attendanceRatePct,
      show: (r) => pctText(r.attendanceRatePct),
    },
    {
      key: 'assessmentPct',
      label: tr(lang, 'Assessments %', 'Değerlendirme %'),
      get: (r) => r.assessmentPct,
      show: (r) =>
        r.assessmentPct === null
          ? '—'
          : `${r.assessmentPct}% (${r.assessmentsSubmitted}/${r.assessmentsExpected})`,
    },
    {
      key: 'curriculumPct',
      label: tr(lang, 'Curriculum %', 'Müfredat %'),
      get: (r) => r.curriculumPct,
      show: (r) => pctText(r.curriculumPct),
    },
  ];
  const col = cols.find((c) => c.key === sort.key) || cols[0];
  const sorted = rows.slice().sort((a, b) => {
    const x = col.get(a);
    const y = col.get(b);
    if (x === null || y === null) return x === y ? 0 : x === null ? 1 : -1;
    if (typeof x === 'string') return x.localeCompare(String(y), lang) * sort.dir;
    return ((x as number) - (y as number)) * sort.dir;
  });
  const toggle = (key: string) =>
    setSort((s) =>
      s.key === key ? { key, dir: s.dir === 1 ? -1 : 1 } : { key, dir: key === 'name' ? 1 : -1 },
    );
  if (!rows.length) return null;
  return (
    <>
      <label className="rc-sort-select">
        <span>{tr(lang, 'Sort by', 'Sırala')}</span>
        <select value={sort.key} onChange={(e) => toggle(e.target.value)}>
          {cols.map((c) => (
            <option key={c.key} value={c.key}>
              {c.label}
            </option>
          ))}
        </select>
      </label>
      <div className="table-wrap">
        <table className="data-table rc-sort">
          <thead>
            <tr>
              {cols.map((c) => (
                <th
                  key={c.key}
                  aria-sort={
                    sort.key === c.key ? (sort.dir === 1 ? 'ascending' : 'descending') : 'none'
                  }
                >
                  <button type="button" onClick={() => toggle(c.key)}>
                    {c.label}
                    <span aria-hidden="true">
                      {sort.key === c.key ? (sort.dir === 1 ? ' ▲' : ' ▼') : ''}
                    </span>
                  </button>
                </th>
              ))}
            </tr>
          </thead>
          <tbody>
            {sorted.map((r) => (
              <tr key={r.id}>
                {cols.map((c, i) => (
                  <td key={c.key} data-label={i ? c.label : undefined}>
                    {c.show(r)}
                  </td>
                ))}
              </tr>
            ))}
          </tbody>
        </table>
      </div>
    </>
  );
}

function RankedSection({
  title,
  first,
  rows,
  lang,
}: {
  title: string;
  first: string;
  rows: ReportRow[];
  lang: Lang;
}) {
  const [metric, setMetric] = useState<MetricKey>('attendancePct');
  const m = METRICS.find((x) => x.id === metric)!;
  const metricName = tr(lang, m.en, m.tr);
  const ratio = (r: ReportRow) =>
    metric === 'attendancePct'
      ? {
          name: tr(lang, 'Complete / held lessons', 'Tamamlanan / yapılan ders'),
          value: `${r.completeSessions}/${r.pastSessions}`,
        }
      : metric === 'assessmentPct'
        ? {
            name: tr(lang, 'Submitted / expected', 'Gönderilen / beklenen'),
            value: `${r.assessmentsSubmitted}/${r.assessmentsExpected}`,
          }
        : {
            name: tr(lang, 'Taught / criteria', 'İşlenen / kriter'),
            value: `${r.taught}/${r.criteria}`,
          };
  const items: BarItem[] = rows
    .slice()
    .sort((a, b) => (b[metric] ?? -1) - (a[metric] ?? -1))
    .map((r) => ({
      id: r.id,
      label: reportName(r, lang),
      value: r[metric],
      display: pctText(r[metric]),
      tip: [ratio(r)],
    }));
  return (
    <ChartCard
      lang={lang}
      title={title}
      footer={<SortTable rows={rows} lang={lang} first={first} />}
      table={{
        head: [first, ...METRICS.map((x) => tr(lang, x.en, x.tr))],
        rows: rows.map((r) => [
          reportName(r, lang),
          pctText(r.attendancePct),
          pctText(r.assessmentPct),
          pctText(r.curriculumPct),
        ]),
      }}
      controls={
        <div className="segmented" role="group" aria-label={tr(lang, 'Metric', 'Ölçüt')}>
          {METRICS.map((x) => (
            <button
              key={x.id}
              type="button"
              className={x.id === metric ? 'active' : ''}
              aria-pressed={x.id === metric}
              onClick={() => setMetric(x.id)}
            >
              {tr(lang, x.en, x.tr)}
            </button>
          ))}
        </div>
      }
    >
      <BarChartH items={items} max={100} lang={lang} unit={metricName} />
    </ChartCard>
  );
}

export function ControlPage(props: PageProps) {
  const { data, user, lang, navigate } = props;
  const management = isManagement(user);
  const [tab, setTab] = useState('issues');
  const [periodId, setPeriodId] = useState(currentPeriodId(data));
  const [levelId, setLevelId] = useState('');
  const [groupId, setGroupId] = useState('');
  const [teacherId, setTeacherId] = useState('');
  const [search, setSearch] = useState('');
  const year = data.academic_years.find((y) => y.active);
  const issues = useMemo(() => findIssues(data, user, { periodId }), [data, user, periodId]);
  const lessonById = useMemo(() => new Map(data.classes.map((c) => [c.id, c])), [data.classes]);
  const profileName = (id?: string) =>
    data.profiles.find((p) => p.id === id)?.full_name ||
    tr(lang, 'Teacher not assigned', 'Öğretmen atanmadı');
  const teachers = useMemo(
    () =>
      [...new Set(data.classes.filter((c) => c.teacher_id).map((c) => c.teacher_id as string))]
        .map((id) => ({ id, name: data.profiles.find((p) => p.id === id)?.full_name || '—' }))
        .sort((a, b) => a.name.localeCompare(b.name, lang)),
    [data.classes, data.profiles, lang],
  );
  const groupOptions = [
    ...data.class_groups.map((g) => ({ id: g.id as string, name: label(g, lang) as string })),
    ...data.classes
      .filter((c) => c.active !== false && !data.class_groups.some((g) => g.id === c.group_id))
      .map((c) => ({ id: `lesson:${c.id}`, name: c.name as string })),
  ].sort((a, b) => a.name.localeCompare(b.name, lang));
  const periods = data.periods
    .filter((p) => !year || p.academic_year_id === year.id)
    .slice()
    .sort((a, b) => Number(a.number) - Number(b.number));
  const text = (issue: Issue, field: 'title' | 'detail') =>
    lang === 'tr' ? issue[`${field}_tr`] : issue[`${field}_en`];
  const filtered = issues.filter((issue) => {
    const lesson = issue.classId ? lessonById.get(issue.classId) : undefined;
    if (levelId && (!lesson || classLevelId(lesson, data) !== levelId)) return false;
    if (groupId) {
      const ok =
        lesson &&
        (groupId.startsWith('lesson:')
          ? lesson.id === groupId.slice(7)
          : lesson.group_id === groupId);
      if (!ok) return false;
    }
    if (teacherId && issue.teacherId !== teacherId) return false;
    return (
      !search ||
      `${text(issue, 'title')} ${text(issue, 'detail')}`
        .toLowerCase()
        .includes(search.toLowerCase())
    );
  });
  const teacherRows = useMemo(
    () => (!management ? teacherSummary(data, issues, periodId) : []),
    [data, issues, periodId, management],
  );
  const reportFilters = { periodId, levelId, groupId, teacherId };
  const metrics = useMemo(
    () => (tab === 'reports' && management ? reportMetrics(data, user, reportFilters) : null),
    // eslint-disable-next-line react-hooks/exhaustive-deps
    [data, user, tab, management, periodId, levelId, groupId, teacherId],
  );
  const k = metrics?.kpis as ReportKpis;
  const weekShort = metrics?.weeks.map((w) => weekText(w.start, lang, true)) || [];
  const weekTitles = metrics?.weeks.map((w) => weekText(w.start, lang)) || [];
  const weekSeries: LineSeries[] = metrics
    ? [
        {
          name: tr(lang, 'Attendance completion %', 'Yoklama tamamlanma %'),
          color: SERIES_1,
          values: metrics.weeks.map((w) => w.completionPct),
        },
        {
          name: tr(lang, 'Attendance rate %', 'Devam oranı %'),
          color: SERIES_2,
          values: metrics.weeks.map((w) => w.ratePct),
        },
      ]
    : [];
  const own = teacherRows.find((r) => r.id === user.id);
  const studentRows = useMemo(() => {
    const map = new Map<string, Issue[]>();
    for (const issue of issues)
      for (const id of issue.studentIds || (issue.studentId ? [issue.studentId] : [])) {
        const list = map.get(id) || [];
        list.push(issue);
        map.set(id, list);
      }
    const students = new Map(data.students.map((s) => [s.id, s]));
    return [...map]
      .map(([id, list]) => ({ student: students.get(id), list }))
      .filter((row) => row.student)
      .sort((a, b) => b.list.length - a.list.length);
  }, [issues, data.students]);
  const rowName = (r: SummaryRow) => (lang === 'tr' ? r.name_tr : r.name_en);
  const percent = (value: number | null) => (value === null ? '—' : `${value}%`);
  const summaryHeader = (first: string) => [
    first,
    tr(lang, 'Lessons', 'Ders sayısı'),
    tr(lang, 'Attendance complete %', 'Yoklama tamamlanma %'),
    tr(lang, 'Missing attendance', 'Eksik yoklama'),
    tr(lang, 'Assessments (submitted/expected)', 'Değerlendirme (gönderilen/beklenen)'),
    tr(lang, 'Curriculum %', 'Müfredat %'),
  ];
  const summaryCells = (r: SummaryRow) => [
    r.lessons,
    percent(r.attendancePct),
    r.missingAttendance,
    `${r.assessmentsSubmitted}/${r.assessmentsExpected}`,
    percent(r.curriculumPct),
  ];
  const groupName = (id: IssueGroup) => {
    const g = GROUPS.find((x) => x.id === id)!;
    return tr(lang, g.en, g.tr);
  };
  const exportExcel = () => {
    const exported = reportMetrics(data, user, reportFilters);
    const ek = exported.kpis;
    const blob = writeXlsx([
      {
        name: tr(lang, 'Missing items', 'Eksikler'),
        header: true,
        widths: [26, 60, 70, 24, 12],
        rows: [
          [
            tr(lang, 'Group', 'Grup'),
            tr(lang, 'Title', 'Başlık'),
            tr(lang, 'Detail', 'Ayrıntı'),
            tr(lang, 'Teacher', 'Öğretmen'),
            tr(lang, 'Severity', 'Önem'),
          ],
          ...issues.map((i) => [
            groupName(i.group),
            text(i, 'title'),
            text(i, 'detail'),
            i.teacherId ? profileName(i.teacherId) : '',
            tr(lang, SEVERITY[i.severity][0], SEVERITY[i.severity][1]),
          ]),
        ],
      },
      {
        name: tr(lang, 'Teachers', 'Öğretmenler'),
        header: true,
        widths: [28, 12, 22, 16, 30, 14],
        rows: [
          summaryHeader(tr(lang, 'Teacher', 'Öğretmen')),
          ...teacherSummary(data, issues, periodId).map((r) => [rowName(r), ...summaryCells(r)]),
        ],
      },
      {
        name: tr(lang, 'Lessons', 'Dersler'),
        header: true,
        widths: [32, 12, 22, 16, 30, 14],
        rows: [
          summaryHeader(tr(lang, 'Lesson', 'Ders')),
          ...lessonSummary(data, issues, periodId).map((r) => [rowName(r), ...summaryCells(r)]),
        ],
      },
      {
        name: tr(lang, 'KPIs', 'Göstergeler'),
        header: true,
        widths: [34, 18, 30],
        rows: [
          [tr(lang, 'Indicator', 'Gösterge'), tr(lang, 'Value', 'Değer'), tr(lang, 'Note', 'Not')],
          [
            tr(lang, 'Attendance completion %', 'Yoklama tamamlanma %'),
            pctText(ek.attendanceCompletionPct),
            '',
          ],
          [
            tr(lang, 'Attendance rate %', 'Devam oranı %'),
            pctText(ek.attendanceRatePct),
            tr(
              lang,
              `Late ${pctText(ek.latePct)} · Absent ${pctText(ek.absentPct)}`,
              `Geç ${pctText(ek.latePct)} · Gelmedi ${pctText(ek.absentPct)}`,
            ),
          ],
          [
            tr(lang, 'Assessments submitted %', 'Değerlendirme gönderim %'),
            pctText(ek.assessmentPct),
            `${ek.assessmentsSubmitted}/${ek.assessmentsExpected}`,
          ],
          [tr(lang, 'Curriculum progress %', 'Müfredat ilerleme %'), pctText(ek.curriculumPct), ''],
          [tr(lang, 'Active students', 'Aktif öğrenci'), ek.activeStudents, ''],
          [tr(lang, 'Active lessons', 'Aktif ders'), ek.activeLessons, ''],
          [
            tr(lang, 'Weekly lesson time', 'Haftalık ders saati'),
            minutesText(ek.weeklyMinutes, lang),
            '',
          ],
        ],
      },
      {
        name: tr(lang, 'Weekly trend', 'Haftalık eğilim'),
        header: true,
        widths: [20, 16, 24, 24, 18],
        rows: [
          [
            tr(lang, 'Week starting', 'Hafta başlangıcı'),
            tr(lang, 'Lessons held', 'Yapılan ders'),
            tr(lang, 'Attendance completion %', 'Yoklama tamamlanma %'),
            tr(lang, 'Attendance rate %', 'Devam oranı %'),
            tr(lang, 'Attendance rows', 'Yoklama kaydı'),
          ],
          ...exported.weeks.map((w) => [
            w.start,
            w.held,
            pctText(w.completionPct),
            pctText(w.ratePct),
            w.attendanceRows,
          ]),
        ],
      },
      {
        name: tr(lang, 'By student', 'Öğrenci bazında'),
        header: true,
        widths: [28, 90],
        rows: [
          [tr(lang, 'Student', 'Öğrenci'), tr(lang, 'Missing items', 'Eksikler')],
          ...studentRows.map((r) => [
            fullName(r.student),
            r.list.map((i) => text(i, 'title')).join('; '),
          ]),
        ],
      },
    ]);
    downloadBlob(blob, `kontrol-${new Date().toISOString().slice(0, 10)}.xlsx`);
  };
  const periodSelect = (
    <SelectField
      label={tr(lang, 'Reporting period', 'Karne dönemi')}
      value={periodId}
      onChange={(e) => setPeriodId(e.target.value)}
    >
      {periods.map((p) => (
        <option key={p.id} value={p.id}>
          {label(p, lang)}
        </option>
      ))}
    </SelectField>
  );
  const filterRow = (withSearch: boolean) => (
    <div className="toolbar toolbar-filters control-filters">
      {periodSelect}
      <SelectField
        label={tr(lang, 'Level', 'Seviye')}
        value={levelId}
        onChange={(e) => setLevelId(e.target.value)}
      >
        <option value="">{tr(lang, 'All levels', 'Tüm seviyeler')}</option>
        {data.levels.map((l) => (
          <option key={l.id} value={l.id}>
            {label(l, lang)}
          </option>
        ))}
      </SelectField>
      <SelectField
        label={tr(lang, 'Class', 'Sınıf')}
        value={groupId}
        onChange={(e) => setGroupId(e.target.value)}
      >
        <option value="">{tr(lang, 'All classes', 'Tüm sınıflar')}</option>
        {groupOptions.map((g) => (
          <option key={g.id} value={g.id}>
            {g.name}
          </option>
        ))}
      </SelectField>
      {management && (
        <SelectField
          label={tr(lang, 'Teacher', 'Öğretmen')}
          value={teacherId}
          onChange={(e) => setTeacherId(e.target.value)}
        >
          <option value="">{tr(lang, 'All teachers', 'Tüm öğretmenler')}</option>
          {teachers.map((t) => (
            <option key={t.id} value={t.id}>
              {t.name}
            </option>
          ))}
        </SelectField>
      )}
      {withSearch && (
        <SearchField
          label={tr(lang, 'Search', 'Ara')}
          value={search}
          onChange={(e) => setSearch(e.target.value)}
        />
      )}
    </div>
  );
  const nothing = (
    <EmptyState title={tr(lang, 'Great! Nothing is missing.', 'Harika! Eksik bulunamadı.')} />
  );
  return (
    <>
      <PageHeader
        title={tr(lang, 'Checks and reports', 'Kontrol ve raporlar')}
        description={tr(
          lang,
          'See what is missing and what needs doing in one place.',
          'Eksikleri ve yapılması gerekenleri tek yerde görün.',
        )}
      >
        {management && (
          <Button variant="secondary" onClick={exportExcel}>
            <Download size={16} />
            {tr(lang, 'Export to Excel', "Excel'e aktar")}
          </Button>
        )}
      </PageHeader>
      {management && (
        <Tabs
          items={[
            { id: 'issues', label: tr(lang, 'Missing items', 'Eksikler') },
            { id: 'reports', label: tr(lang, 'Reports', 'Raporlar') },
          ]}
          value={tab}
          onChange={setTab}
          label={tr(lang, 'Checks and reports', 'Kontrol ve raporlar')}
        />
      )}
      {tab === 'issues' && (
        <>
          <div className="stat-grid">
            {GROUPS.filter((g) => management || g.id !== 'student').map((g) => (
              <StatCard
                key={g.id}
                title={tr(lang, g.en, g.tr)}
                value={filtered.filter((i) => i.group === g.id).length}
              />
            ))}
          </div>
          {!management && own && (
            <section className="card padded control-own">
              <h2>{tr(lang, 'My summary', 'Özetim')}</h2>
              <div className="stat-grid">
                <StatCard title={tr(lang, 'Lessons', 'Ders sayısı')} value={own.lessons} />
                <StatCard
                  title={tr(lang, 'Attendance complete %', 'Yoklama tamamlanma %')}
                  value={percent(own.attendancePct)}
                />
                <StatCard
                  title={tr(lang, 'Assessments', 'Değerlendirme')}
                  value={`${own.assessmentsSubmitted}/${own.assessmentsExpected}`}
                />
                <StatCard
                  title={tr(lang, 'Curriculum %', 'Müfredat %')}
                  value={percent(own.curriculumPct)}
                />
              </div>
            </section>
          )}
          {filterRow(true)}
          {!filtered.length && nothing}
          {GROUPS.map((g) => {
            const rows = filtered.filter((i) => i.group === g.id);
            if (!rows.length) return null;
            return (
              <section className="card padded control-group" key={g.id}>
                <div className="section-heading">
                  <h2>{tr(lang, g.en, g.tr)}</h2>
                  <Badge tone="neutral">{rows.length}</Badge>
                </div>
                {rows.map((issue) => {
                  const severity = tr(
                    lang,
                    SEVERITY[issue.severity][0],
                    SEVERITY[issue.severity][1],
                  );
                  return (
                    <div className="task-row control-row" key={issue.id}>
                      <span
                        className={`control-dot control-dot-${issue.severity}`}
                        title={severity}
                        role="img"
                        aria-label={severity}
                      />
                      <div>
                        <strong>{text(issue, 'title')}</strong>
                        <small>
                          {text(issue, 'detail')}
                          {issue.group !== 'student' && ` · ${profileName(issue.teacherId)}`}
                        </small>
                      </div>
                      <Button
                        variant="secondary"
                        onClick={() => navigate?.(issue.target.view, issue.target.context)}
                      >
                        {tr(lang, 'Resolve', 'Çöz')}
                      </Button>
                    </div>
                  );
                })}
              </section>
            );
          })}
        </>
      )}
      {tab === 'reports' && management && metrics && (
        <>
          {filterRow(false)}
          <div className="rc-kpis">
            <StatTile
              label={tr(lang, 'Attendance completion', 'Yoklama tamamlanma')}
              value={pctText(k.attendanceCompletionPct)}
              sub={tr(lang, 'Past lessons fully recorded', 'Geçmiş derslerde tam yoklama')}
            />
            <StatTile
              label={tr(lang, 'Attendance rate', 'Devam oranı')}
              value={pctText(k.attendanceRatePct)}
              sub={tr(
                lang,
                `Late: ${pctText(k.latePct)} · Absent: ${pctText(k.absentPct)}`,
                `Geç: ${pctText(k.latePct)} · Gelmedi: ${pctText(k.absentPct)}`,
              )}
            />
            <StatTile
              label={tr(lang, 'Assessments submitted', 'Değerlendirme gönderim')}
              value={pctText(k.assessmentPct)}
              sub={`${k.assessmentsSubmitted}/${k.assessmentsExpected}`}
            />
            <StatTile
              label={tr(lang, 'Curriculum progress', 'Müfredat ilerleme')}
              value={pctText(k.curriculumPct)}
              sub={tr(lang, 'Taught criteria', 'İşlenen kriterler')}
            />
            <StatTile
              label={tr(lang, 'Active students', 'Aktif öğrenci')}
              value={k.activeStudents}
            />
            <StatTile label={tr(lang, 'Active lessons', 'Aktif ders')} value={k.activeLessons} />
            <StatTile
              label={tr(lang, 'Weekly lesson time', 'Haftalık ders saati')}
              value={minutesText(k.weeklyMinutes, lang)}
            />
          </div>
          <div className="rc-grid-2">
            <ChartCard
              lang={lang}
              title={tr(lang, 'Lessons held per week', 'Haftalık yapılan ders')}
              description={tr(lang, 'Last 12 weeks', 'Son 12 hafta')}
              table={{
                head: [tr(lang, 'Week', 'Hafta'), tr(lang, 'Lessons held', 'Yapılan ders')],
                rows: metrics.weeks.map((w) => [weekText(w.start, lang), w.held]),
              }}
            >
              <ColumnChart
                labels={weekShort}
                tipTitles={weekTitles}
                values={metrics.weeks.map((w) => w.held)}
                unit={tr(lang, 'Lessons held', 'Yapılan ders')}
                lang={lang}
              />
            </ChartCard>
            <ChartCard
              lang={lang}
              title={tr(lang, 'Attendance trend', 'Yoklama eğilimi')}
              description={tr(lang, 'Percent per week', 'Haftalık yüzde')}
              legend={weekSeries.map(({ name, color }) => ({ name, color }))}
              table={{
                head: [tr(lang, 'Week', 'Hafta'), ...weekSeries.map((s) => s.name)],
                rows: metrics.weeks.map((w, i) => [
                  weekText(w.start, lang),
                  ...weekSeries.map((s) => pctText(s.values[i])),
                ]),
              }}
            >
              <LineChart
                labels={weekShort}
                tipTitles={weekTitles}
                series={weekSeries}
                lang={lang}
              />
            </ChartCard>
          </div>
          <RankedSection
            title={tr(lang, 'Teacher comparison', 'Öğretmen karşılaştırma')}
            first={tr(lang, 'Teacher', 'Öğretmen')}
            rows={metrics.teachers}
            lang={lang}
          />
          <RankedSection
            title={tr(lang, 'Lesson comparison', 'Ders karşılaştırma')}
            first={tr(lang, 'Lesson', 'Ders')}
            rows={metrics.lessons}
            lang={lang}
          />
          <div className="rc-grid-3">
            {[
              {
                title: tr(lang, 'Students by level', 'Seviyeye göre öğrenci'),
                rows: metrics.levels,
                value: (r: ReportRow) => r.students,
                unit: tr(lang, 'Active students', 'Aktif öğrenci'),
                max: Math.max(1, ...metrics.levels.map((r) => r.students)),
                pct: false,
              },
              {
                title: tr(lang, 'Students by class', 'Sınıfa göre öğrenci'),
                rows: metrics.groups,
                value: (r: ReportRow) => r.students,
                unit: tr(lang, 'Active students', 'Aktif öğrenci'),
                max: Math.max(1, ...metrics.groups.map((r) => r.students)),
                pct: false,
              },
              {
                title: tr(lang, 'Attendance rate by level', 'Seviyeye göre devam oranı'),
                rows: metrics.levels,
                value: (r: ReportRow) => r.attendanceRatePct,
                unit: tr(lang, 'Attendance rate', 'Devam oranı'),
                max: 100,
                pct: true,
              },
            ].map((c) => {
              const sorted = c.rows.slice().sort((a, b) => (c.value(b) ?? -1) - (c.value(a) ?? -1));
              return (
                <ChartCard
                  key={c.title}
                  lang={lang}
                  title={c.title}
                  table={{
                    head: [tr(lang, 'Name', 'Ad'), c.unit],
                    rows: sorted.map((r) => [
                      reportName(r, lang),
                      c.pct ? pctText(c.value(r)) : (c.value(r) ?? '—'),
                    ]),
                  }}
                >
                  <BarChartH
                    lang={lang}
                    max={c.max}
                    unit={c.unit}
                    items={sorted.map((r) => ({
                      id: r.id,
                      label: reportName(r, lang),
                      value: c.value(r),
                      display: c.pct ? pctText(c.value(r)) : String(c.value(r) ?? '—'),
                      tip: [{ name: tr(lang, 'Lessons', 'Ders sayısı'), value: String(r.lessons) }],
                    }))}
                  />
                </ChartCard>
              );
            })}
          </div>
        </>
      )}
    </>
  );
}
