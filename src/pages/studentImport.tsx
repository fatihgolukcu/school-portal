import { useMemo, useRef, useState } from 'react';
import { Download, FileSpreadsheet, Upload } from 'lucide-react';
import type { PageProps, RecordRow } from '../types';
import { Badge, Button, Modal, ageFrom, dobFromAge, errorText, label, tr } from '../ui';
import { classesForStudent } from '../rosterRules';
import { countryOptions, toCountryCode } from '../countries';
import { columnName, downloadBlob, excelSerialToDate, readSpreadsheet, writeXlsx } from '../xlsx';

type Key =
  | 'first_name'
  | 'dob_or_age'
  | 'language'
  | 'class_level'
  | 'package'
  | 'specialist_teacher'
  | 'contact_teacher'
  | 'country'
  | 'parent_name'
  | 'parent_phone'
  | 'parent_email'
  | 'notes';

const COLUMNS: {
  key: Key;
  en: string;
  tr: string;
  width: number;
  required?: boolean;
  /** Older template headers that still map to this column. */
  aliases?: string[];
}[] = [
  {
    key: 'first_name',
    en: 'Name and surname',
    tr: 'Ad Soyad',
    width: 24,
    required: true,
    aliases: ['First name', 'Ad'],
  },
  {
    key: 'dob_or_age',
    en: 'Birth date (DD.MM.YYYY) or age',
    tr: 'Doğum tarihi (GG.AA.YYYY) veya yaş',
    width: 20,
    required: true,
  },
  {
    key: 'language',
    en: 'Course language (TR/EN)',
    tr: 'Ders dili (TR/EN)',
    width: 12,
    required: true,
  },
  { key: 'class_level', en: 'Class level', tr: 'Ana sınıf', width: 16 },
  { key: 'package', en: 'Package', tr: 'Paket', width: 18 },
  { key: 'specialist_teacher', en: 'Specialist teacher', tr: 'Uzmanlık hocası', width: 18 },
  { key: 'contact_teacher', en: 'Contact teacher', tr: 'Kontak hoca', width: 18 },
  { key: 'country', en: 'Country', tr: 'Ülke', width: 14 },

  { key: 'parent_name', en: 'Parent name', tr: 'Veli adı', width: 20 },
  { key: 'parent_phone', en: 'Parent phone', tr: 'Veli telefonu', width: 18 },
  { key: 'parent_email', en: 'Parent email', tr: 'Veli e-postası', width: 24 },
  { key: 'notes', en: 'Notes', tr: 'Not ve veli yorumu', width: 32 },
];
const EXAMPLE_NAME = 'Örnek / Example';

const fold = (value: string) =>
  value
    .trim()
    .toLocaleLowerCase('tr')
    .normalize('NFD')
    .replace(/[̀-ͯ]/g, '')
    .replace(/ı/g, 'i')
    .replace(/[’'`]/g, '')
    .replace(/\s+/g, ' ');
const digits = (value?: string | null) => String(value || '').replace(/\D/g, '');

interface ParsedRow {
  line: number;
  raw: Record<Key, string>;
  payload: Record<string, any>;
  classIds: string[];
  status: 'ok' | 'warning' | 'error';
  messages: string[];
  selected: boolean;
  result?: 'imported' | 'failed';
}

export function StudentImport({ props, onClose }: { props: PageProps; onClose: () => void }) {
  const { data, lang, api, user, refresh, notify } = props;
  const admin = user.roles.includes('administrator');
  const [rows, setRows] = useState<ParsedRow[]>([]);
  const [fileName, setFileName] = useState('');
  const [readError, setReadError] = useState('');
  const [busy, setBusy] = useState(false);
  const [progress, setProgress] = useState(0);
  const [done, setDone] = useState(false);
  const fileInput = useRef<HTMLInputElement>(null);

  const levels = data.levels.filter((level) => level.kind === 'class' && level.active !== false);
  const teachers = data.profiles.filter(
    (profile) =>
      profile.active !== false &&
      (profile.roles || []).some((role: string) =>
        ['teacher', 'academic_manager', 'guidance'].includes(role),
      ),
  );
  const packages = data.packages.filter((item) => item.active !== false);
  const years = data.academic_years;
  // Every imported student is registered in the active academic year.
  const activeYearId = (years.find((year) => year.active) || years[0])?.id || null;
  const header = (column: (typeof COLUMNS)[number]) =>
    `${lang === 'tr' ? column.tr : column.en}${column.required ? ' *' : ''}`;

  // ---------------------------------------------------------------- template
  function downloadTemplate() {
    const listColumns: [Key, string[]][] = [
      ['language', ['TR', 'EN']],
      ['class_level', levels.map((level) => label(level, lang))],
      ['package', packages.map((item) => label(item, lang))],
      ['specialist_teacher', teachers.map((profile) => profile.full_name)],
      ['contact_teacher', teachers.map((profile) => profile.full_name)],

      [
        'country',
        [...countryOptions(lang).common, ...countryOptions(lang).all].map((item) => item.name),
      ],
    ];
    const listRows: (string | null)[][] = [listColumns.map(([key]) => key)];
    const longest = Math.max(...listColumns.map(([, values]) => values.length));
    for (let i = 0; i < longest; i++)
      listRows.push(listColumns.map(([, values]) => values[i] ?? null));
    const lists: Record<number, string> = {};
    listColumns.forEach(([key, values], i) => {
      if (!values.length) return;
      const col = columnName(i);
      lists[COLUMNS.findIndex((column) => column.key === key)] =
        `Lists!$${col}$2:$${col}$${values.length + 1}`;
    });
    const example: Record<Key, string | number> = {
      first_name: EXAMPLE_NAME,
      dob_or_age: 10,
      language: 'TR',
      class_level: levels[0] ? label(levels[0], lang) : '',
      package: packages[0] ? label(packages[0], lang) : '',
      specialist_teacher: teachers[0]?.full_name || '',
      contact_teacher: teachers[0]?.full_name || '',
      country: tr(lang, 'Poland', 'Polonya'),

      parent_name: tr(lang, 'Parent name', 'Veli adı'),
      parent_phone: '+48 000 000 000',
      parent_email: '',
      notes: tr(
        lang,
        'This example row is ignored. Replace it with real students.',
        'Bu örnek satır dikkate alınmaz. Gerçek öğrencilerle değiştirin.',
      ),
    };
    const help = [
      [tr(lang, 'How to fill in the student template', 'Öğrenci şablonu nasıl doldurulur')],
      [''],
      [
        tr(
          lang,
          '• One student per row. Columns marked * are required.',
          '• Her satıra bir öğrenci. * işaretli sütunlar zorunludur.',
        ),
      ],
      [
        tr(
          lang,
          '• Birth date as DD.MM.YYYY, or only the age (e.g. 10). An age is saved as 01.01 of the birth year.',
          '• Doğum tarihi GG.AA.YYYY olarak ya da yalnızca yaş (ör. 10). Yaş, doğum yılının 01.01 tarihi olarak kaydedilir.',
        ),
      ],
      [tr(lang, '• Course language: TR or EN.', '• Ders dili: TR veya EN.')],
      [
        tr(
          lang,
          '• Parent name, phone and email are optional.',
          '• Veli adı, telefonu ve e-postası isteğe bağlıdır.',
        ),
      ],
      [
        tr(
          lang,
          '• Fees and scholarships are not entered here; the payments team sets them on the Payments page.',
          '• Ücret ve burs burada girilmez; ödemeleri takip eden kişi Ödemeler sayfasından belirler.',
        ),
      ],
      [
        tr(
          lang,
          '• Full-package students are placed in the subject classes for their language and level; everyone joins the Specialist class of their Specialist teacher.',
          '• Tam paket öğrencileri dil ve seviyelerine uygun ders sınıflarına yerleştirilir; herkes Uzmanlık hocasının Uzmanlık sınıfına katılır.',
        ),
      ],
      [
        tr(
          lang,
          '• Use the dropdowns for level, package, teachers and country. Students are registered in the active academic year.',
          '• Seviye, paket, hoca ve ülke için açılır listeleri kullanın. Öğrenciler aktif akademik yıla kaydedilir.',
        ),
      ],
      [tr(lang, '• The grey example row is ignored.', '• Gri örnek satır dikkate alınmaz.')],
    ];
    const blob = writeXlsx([
      {
        name: tr(lang, 'Students', 'Öğrenciler'),
        header: true,
        rows: [COLUMNS.map(header), COLUMNS.map((column) => example[column.key])],
        widths: COLUMNS.map((column) => column.width),
        mutedRows: [2],
        lists,
        listRows: 1000,
      },
      { name: tr(lang, 'Help', 'Yardım'), rows: help, widths: [120] },
      { name: 'Lists', rows: listRows, hidden: true },
    ]);
    downloadBlob(
      blob,
      tr(lang, 'school-portal-student-template.xlsx', 'school-portal-ogrenci-sablonu.xlsx'),
    );
  }

  // ---------------------------------------------------------------- parsing
  const existing = data.students;
  function findBy<T extends RecordRow>(list: T[], value: string, fields: string[]) {
    const wanted = fold(value);
    if (!wanted) return undefined;
    return list.find((item) =>
      fields.some((field) => item[field] && fold(String(item[field])) === wanted),
    );
  }
  function parseDob(value: string): { dob?: string; estimated?: boolean; error?: string } {
    const text = value.trim();
    if (!text)
      return {
        error: tr(lang, 'Birth date or age is required.', 'Doğum tarihi veya yaş zorunludur.'),
      };
    if (/^\d{1,2}$/.test(text)) {
      const age = Number(text);
      if (age < 2 || age > 25) return { error: tr(lang, 'Age must be 2–25.', 'Yaş 2–25 olmalı.') };
      return { dob: dobFromAge(age), estimated: true };
    }
    let iso = '';
    if (/^\d{4,6}(\.0+)?$/.test(text)) iso = excelSerialToDate(Number(text));
    const dotted = text.match(/^(\d{1,2})[./-](\d{1,2})[./-](\d{4})$/);
    if (dotted) iso = `${dotted[3]}-${dotted[2].padStart(2, '0')}-${dotted[1].padStart(2, '0')}`;
    if (/^\d{4}-\d{2}-\d{2}/.test(text)) iso = text.slice(0, 10);
    const date = new Date(`${iso}T12:00:00Z`);
    if (!iso || Number.isNaN(date.getTime()) || date.toISOString().slice(0, 10) !== iso)
      return {
        error: tr(lang, `Unreadable birth date "${text}".`, `Doğum tarihi okunamadı: "${text}".`),
      };
    if (iso > new Date().toISOString().slice(0, 10))
      return { error: tr(lang, 'Birth date is in the future.', 'Doğum tarihi gelecekte.') };
    return { dob: iso, estimated: false };
  }

  function parseRows(table: string[][]): ParsedRow[] {
    const [headRow, ...body] = table;
    // Columns are matched by header text (either language) and fall back to template order.
    const index = COLUMNS.map((column, i) => {
      const found = (headRow || []).findIndex((cell) =>
        [column.en, column.tr, ...(column.aliases || [])].some(
          (name) => fold(cell || '').replace(/\s*\*$/, '') === fold(name),
        ),
      );
      return found >= 0 ? found : i;
    });
    // Templates made before October 2026 had a separate Surname column; it is joined to the name.
    const surnameColumn = (headRow || []).findIndex((cell) =>
      ['surname', 'soyad'].includes(fold(cell || '').replace(/\s*\*$/, '')),
    );
    const seen = new Map<string, number>();
    const parsed: ParsedRow[] = [];
    body.forEach((cells, i) => {
      const raw = Object.fromEntries(
        COLUMNS.map((column, c) => [column.key, String(cells?.[index[c]] ?? '').trim()]),
      ) as Record<Key, string>;
      if (surnameColumn >= 0)
        raw.first_name = [raw.first_name, String(cells?.[surnameColumn] ?? '').trim()]
          .filter(Boolean)
          .join(' ');
      raw.first_name = raw.first_name.replace(/\s+/g, ' ');
      if (!Object.values(raw).some(Boolean) || raw.first_name === EXAMPLE_NAME) return;
      const errors: string[] = [];
      const warnings: string[] = [];
      if (!raw.first_name)
        errors.push(tr(lang, 'Name and surname is required.', 'Ad Soyad zorunludur.'));
      const birth = parseDob(raw.dob_or_age);
      if (birth.error) errors.push(birth.error);
      const languageCode =
        fold(raw.language).startsWith('en') || fold(raw.language).startsWith('ing')
          ? 'en'
          : fold(raw.language).startsWith('tr')
            ? 'tr'
            : '';
      if (!languageCode)
        errors.push(tr(lang, 'Course language must be TR or EN.', 'Ders dili TR veya EN olmalı.'));
      const level = raw.class_level
        ? findBy(levels, raw.class_level, ['code', 'name_en', 'name_tr'])
        : undefined;
      if (raw.class_level && !level)
        errors.push(
          tr(
            lang,
            `Unknown class level "${raw.class_level}".`,
            `Bilinmeyen seviye: "${raw.class_level}".`,
          ),
        );
      const pack = raw.package
        ? findBy(packages, raw.package, ['code', 'name_en', 'name_tr'])
        : undefined;
      if (raw.package && !pack)
        errors.push(
          tr(lang, `Unknown package "${raw.package}".`, `Bilinmeyen paket: "${raw.package}".`),
        );
      const specialistTeacher = raw.specialist_teacher
        ? findBy(teachers, raw.specialist_teacher, ['full_name', 'email'])
        : undefined;
      if (raw.specialist_teacher && !specialistTeacher)
        errors.push(
          tr(
            lang,
            `Unknown Specialist teacher "${raw.specialist_teacher}".`,
            `Bilinmeyen Uzmanlık hocası: "${raw.specialist_teacher}".`,
          ),
        );
      const contact = raw.contact_teacher
        ? findBy(teachers, raw.contact_teacher, ['full_name', 'email'])
        : undefined;
      if (raw.contact_teacher && !contact)
        errors.push(
          tr(
            lang,
            `Unknown contact teacher "${raw.contact_teacher}".`,
            `Bilinmeyen kontak hoca: "${raw.contact_teacher}".`,
          ),
        );
      if (raw.parent_email && !/^[^@\s]+@[^@\s]+\.[^@\s]+$/.test(raw.parent_email))
        errors.push(tr(lang, 'Parent email is not valid.', 'Veli e-postası geçersiz.'));
      const country = toCountryCode(raw.country);
      if (raw.country && !/^[A-Z]{2}$/.test(country))
        warnings.push(
          tr(
            lang,
            `Country "${raw.country}" is not in the list; it is saved as typed.`,
            `"${raw.country}" ülke listesinde yok; yazıldığı gibi kaydedilir.`,
          ),
        );

      if (pack?.code === 'full' && !level)
        warnings.push(
          tr(
            lang,
            'Full package without class level: Specialist class only.',
            'Seviyesiz tam paket: yalnızca Uzmanlık sınıfı.',
          ),
        );

      // Duplicates: same full name and birth year, and the same phone when both have one.
      const year = birth.dob?.slice(0, 4);
      const fullName = (student: RecordRow) =>
        [student.first_name, student.last_name].filter(Boolean).join(' ');
      const twin = existing.find(
        (student) =>
          fold(fullName(student)) === fold(raw.first_name) &&
          String(student.dob || '').slice(0, 4) === year &&
          (!digits(raw.parent_phone) ||
            !digits(student.parent_phone) ||
            digits(student.parent_phone) === digits(raw.parent_phone)),
      );
      if (twin)
        errors.push(
          tr(
            lang,
            `Already registered (${twin.student_number || twin.first_name}).`,
            `Zaten kayıtlı (${twin.student_number || twin.first_name}).`,
          ),
        );
      const key = `${fold(raw.first_name)}|${year}|${digits(raw.parent_phone)}`;
      if (seen.has(key))
        errors.push(
          tr(
            lang,
            `Same student as line ${seen.get(key)}.`,
            `${seen.get(key)}. satırla aynı öğrenci.`,
          ),
        );
      else seen.set(key, i + 2);

      const plan = languageCode
        ? classesForStudent(
            {
              language: languageCode,
              class_level_id: level?.id,
              package_code: pack?.code,
              specialist_teacher_id: specialistTeacher?.id,
            },
            data,
          )
        : { classIds: [], missing: [] };
      if (plan.missing.length)
        warnings.push(
          tr(lang, 'No class yet for: ', 'Henüz sınıfı yok: ') +
            plan.missing.map((subject) => label(subject, lang)).join(', '),
        );
      parsed.push({
        line: i + 2,
        raw,
        classIds: plan.classIds,
        status: errors.length ? 'error' : warnings.length ? 'warning' : 'ok',
        messages: [...errors, ...warnings],
        selected: !errors.length,
        payload: {
          first_name: raw.first_name,
          last_name: null,
          dob: birth.dob,
          dob_estimated: birth.estimated,
          language: languageCode,
          class_level_id: level?.id || null,
          package_id: pack?.id || null,
          contact_teacher_id: contact?.id || null,
          country: country || null,
          registration_year_id: activeYearId,
          parent_name: raw.parent_name || null,
          parent_phone: raw.parent_phone || null,
          parent_email: raw.parent_email || null,
          staff_notes: raw.notes || null,
          registered_at: new Date().toISOString(),
        },
      });
    });
    return parsed;
  }

  async function loadFile(file: File) {
    setReadError('');
    setDone(false);
    setRows([]);
    setFileName(file.name);
    try {
      const table = await readSpreadsheet(file);
      const parsed = parseRows(table);
      if (!parsed.length)
        setReadError(
          tr(
            lang,
            'No student rows were found in this file.',
            'Bu dosyada öğrenci satırı bulunamadı.',
          ),
        );
      setRows(parsed);
    } catch (error) {
      const code = errorText(error);
      setReadError(
        code === 'old-xls'
          ? tr(
              lang,
              'Old .xls files are not supported. In Excel choose Save As → Excel Workbook (.xlsx).',
              'Eski .xls dosyaları desteklenmez. Excel’de Farklı Kaydet → Excel Çalışma Kitabı (.xlsx) seçin.',
            )
          : tr(
              lang,
              'This file could not be read. Use the template as .xlsx or .csv.',
              'Dosya okunamadı. Şablonu .xlsx veya .csv olarak kullanın.',
            ),
      );
    }
  }

  // ---------------------------------------------------------------- import
  const chosen = rows.filter(
    (row) => row.selected && row.status !== 'error' && row.result !== 'imported',
  );
  async function runImport() {
    if (busy || !chosen.length) return;
    setBusy(true);
    setProgress(0);
    let imported = 0;
    let enrolled = 0;
    const next = [...rows];
    const today = new Date().toISOString().slice(0, 10);
    for (const [n, row] of chosen.entries()) {
      const at = next.indexOf(row);
      try {
        const student = await api.rpc('register_student', { p_payload: row.payload });
        for (const classId of row.classIds) {
          await api.save('enrollments', {
            student_id: student.id,
            class_id: classId,
            started_on: today,
          });
          enrolled++;
        }
        next[at] = { ...row, result: 'imported' };
        imported++;
      } catch (error) {
        next[at] = {
          ...row,
          result: 'failed',
          messages: [...row.messages, errorText(error, lang)],
        };
      }
      setProgress(Math.round(((n + 1) / chosen.length) * 100));
      setRows([...next]);
    }
    await refresh().catch(() => undefined);
    setBusy(false);
    setDone(true);
    notify(
      tr(
        lang,
        `${imported} students imported, ${enrolled} class places assigned.`,
        `${imported} öğrenci aktarıldı, ${enrolled} sınıf ataması yapıldı.`,
      ),
      imported ? 'success' : 'error',
    );
  }

  function downloadProblems() {
    const problems = rows.filter((row) => row.status === 'error' || row.result === 'failed');
    const blob = writeXlsx([
      {
        name: tr(lang, 'To fix', 'Düzeltilecek'),
        header: true,
        widths: [...COLUMNS.map((column) => column.width), 60],
        rows: [
          [...COLUMNS.map(header), tr(lang, 'Problem', 'Sorun')],
          ...problems.map((row) => [
            ...COLUMNS.map((column) => row.raw[column.key]),
            row.messages.join(' '),
          ]),
        ],
      },
    ]);
    downloadBlob(blob, tr(lang, 'students-to-fix.xlsx', 'duzeltilecek-ogrenciler.xlsx'));
  }

  const counts = useMemo(
    () => ({
      ok: rows.filter((row) => row.status === 'ok').length,
      warning: rows.filter((row) => row.status === 'warning').length,
      error: rows.filter((row) => row.status === 'error').length,
      imported: rows.filter((row) => row.result === 'imported').length,
      failed: rows.filter((row) => row.result === 'failed').length,
    }),
    [rows],
  );

  return (
    <Modal
      title={tr(lang, 'Bulk import students', 'Toplu öğrenci yükleme')}
      onClose={() => !busy && onClose()}
      lang={lang}
      wide
      bare
    >
      <div className="modal-body stack import-body">
        <ol className="import-steps">
          <li>
            <div>
              <strong>{tr(lang, 'Download the Excel template', 'Excel şablonunu indirin')}</strong>
              <p className="muted">
                {tr(
                  lang,
                  'It includes dropdowns for levels, packages and teachers, plus a help sheet.',
                  'Seviye, paket ve hocalar için açılır listeler ile bir yardım sayfası içerir.',
                )}
              </p>
            </div>
            <Button variant="secondary" onClick={downloadTemplate}>
              <Download size={16} />
              {tr(lang, 'Download template', 'Şablonu indir')}
            </Button>
          </li>
          <li>
            <div>
              <strong>{tr(lang, 'Fill it in and upload it', 'Doldurup yükleyin')}</strong>
              <p className="muted">
                {tr(lang, 'Excel (.xlsx) or CSV.', 'Excel (.xlsx) veya CSV.')}
              </p>
            </div>
            <input
              ref={fileInput}
              type="file"
              accept=".xlsx,.csv,application/vnd.openxmlformats-officedocument.spreadsheetml.sheet,text/csv"
              hidden
              onChange={(event) => {
                const file = event.target.files?.[0];
                if (file) void loadFile(file);
                event.target.value = '';
              }}
            />
            <Button variant="secondary" disabled={busy} onClick={() => fileInput.current?.click()}>
              <Upload size={16} />
              {fileName
                ? tr(lang, 'Choose another file', 'Başka dosya seç')
                : tr(lang, 'Choose file', 'Dosya seç')}
            </Button>
          </li>
        </ol>
        {readError && (
          <div className="form-error" role="alert">
            {readError}
          </div>
        )}
        {rows.length > 0 && (
          <>
            <div className="import-summary" aria-live="polite">
              <FileSpreadsheet size={18} aria-hidden="true" />
              <strong>{fileName}</strong>
              <Badge tone="green">
                {counts.ok} {tr(lang, 'ready', 'hazır')}
              </Badge>
              {counts.warning > 0 && (
                <Badge tone="orange">
                  {counts.warning} {tr(lang, 'with notes', 'notlu')}
                </Badge>
              )}
              {counts.error > 0 && (
                <Badge tone="red">
                  {counts.error} {tr(lang, 'skipped', 'atlanacak')}
                </Badge>
              )}
              {done && (
                <span>
                  {tr(lang, `${counts.imported} imported`, `${counts.imported} aktarıldı`)}
                  {counts.failed
                    ? tr(lang, `, ${counts.failed} failed`, `, ${counts.failed} başarısız`)
                    : ''}
                </span>
              )}
            </div>
            {busy && (
              <div
                className="import-progress"
                role="progressbar"
                aria-valuenow={progress}
                aria-valuemin={0}
                aria-valuemax={100}
              >
                <span style={{ width: `${progress}%` }} />
              </div>
            )}
            <div className="table-wrap import-table">
              <table className="data-table">
                <thead>
                  <tr>
                    <th scope="col">
                      <span className="sr-only">{tr(lang, 'Import', 'Aktar')}</span>
                    </th>
                    <th scope="col">{tr(lang, 'Line', 'Satır')}</th>
                    <th scope="col">{tr(lang, 'Student', 'Öğrenci')}</th>
                    <th scope="col">{tr(lang, 'Birth / age', 'Doğum / yaş')}</th>
                    <th scope="col">{tr(lang, 'Language', 'Dil')}</th>
                    <th scope="col">{tr(lang, 'Classes', 'Sınıflar')}</th>
                    <th scope="col">{tr(lang, 'Check', 'Kontrol')}</th>
                  </tr>
                </thead>
                <tbody>
                  {rows.map((row, i) => (
                    <tr key={row.line} className={`import-${row.result || row.status}`}>
                      <td>
                        <input
                          type="checkbox"
                          aria-label={`${tr(lang, 'Import line', 'Satırı aktar')} ${row.line}`}
                          checked={row.selected && row.status !== 'error'}
                          disabled={row.status === 'error' || busy || row.result === 'imported'}
                          onChange={(event) =>
                            setRows(
                              rows.map((item, n) =>
                                n === i ? { ...item, selected: event.target.checked } : item,
                              ),
                            )
                          }
                        />
                      </td>
                      <td>{row.line}</td>
                      <td>
                        <strong>{row.raw.first_name || '—'}</strong>
                        <small>{row.raw.parent_name || row.raw.parent_phone}</small>
                      </td>
                      <td>
                        {row.payload.dob
                          ? row.payload.dob_estimated
                            ? tr(
                                lang,
                                `age ${ageFrom(row.payload.dob)} (estimated)`,
                                `${ageFrom(row.payload.dob)} yaş (tahmini)`,
                              )
                            : row.payload.dob.split('-').reverse().join('.')
                          : row.raw.dob_or_age || '—'}
                      </td>
                      <td>{row.payload.language?.toUpperCase() || '—'}</td>
                      <td>{row.classIds.length}</td>
                      <td>
                        {row.result === 'imported' ? (
                          <Badge tone="green">{tr(lang, 'Imported', 'Aktarıldı')}</Badge>
                        ) : row.result === 'failed' ? (
                          <Badge tone="red">{tr(lang, 'Failed', 'Başarısız')}</Badge>
                        ) : (
                          <Badge
                            tone={
                              row.status === 'ok'
                                ? 'green'
                                : row.status === 'warning'
                                  ? 'orange'
                                  : 'red'
                            }
                          >
                            {row.status === 'ok'
                              ? tr(lang, 'Ready', 'Hazır')
                              : row.status === 'warning'
                                ? tr(lang, 'Check', 'Kontrol')
                                : tr(lang, 'Skip', 'Atla')}
                          </Badge>
                        )}
                        {row.messages.length > 0 && (
                          <small className="import-messages">{row.messages.join(' ')}</small>
                        )}
                      </td>
                    </tr>
                  ))}
                </tbody>
              </table>
            </div>
          </>
        )}
      </div>
      <div className="modal-actions">
        {(counts.error > 0 || counts.failed > 0) && (
          <Button variant="ghost" onClick={downloadProblems} disabled={busy}>
            <Download size={16} />
            {tr(lang, 'Download rows to fix', 'Düzeltilecek satırları indir')}
          </Button>
        )}
        <Button variant="secondary" onClick={onClose} disabled={busy}>
          {done ? tr(lang, 'Close', 'Kapat') : tr(lang, 'Cancel', 'Vazgeç')}
        </Button>
        <Button onClick={runImport} disabled={busy || !chosen.length} aria-busy={busy}>
          {busy
            ? tr(lang, `Importing… ${progress}%`, `Aktarılıyor… %${progress}`)
            : tr(lang, `Import ${chosen.length} students`, `${chosen.length} öğrenciyi aktar`)}
        </Button>
      </div>
    </Modal>
  );
}
