import { useEffect, useMemo, useState, type ReactNode } from 'react';
import type { PageProps } from '../types';
import { Markdown, headingId, parseGuide, type GuideDoc } from '../guide/markdown';
import { EmptyState, PageHeader, SearchField, tr } from '../ui';

// The guide pages are the same Markdown files as docs/kilavuz, bundled at build time, so a
// documentation change is a portal change. README and the template are for maintainers only.
const sources = import.meta.glob<string>('../../docs/kilavuz/*.md', {
  query: '?raw',
  import: 'default',
  eager: true,
});
const imageFiles = import.meta.glob<string>('../../docs/kilavuz/img/*.{webp,png,jpg}', {
  query: '?url',
  import: 'default',
  eager: true,
});
const images = Object.fromEntries(
  Object.entries(imageFiles).map(([path, url]) => [path.split('/').pop()!, url]),
);
const docs: GuideDoc[] = Object.entries(sources)
  .map(([path, raw]) => [path.split('/').pop()!.replace(/\.md$/, ''), raw] as const)
  .filter(([slug]) => /^\d/.test(slug))
  .sort(([a], [b]) => a.localeCompare(b))
  .map(([slug, raw]) => parseGuide(slug, raw));

/** The guide page that explains a portal screen, for "help on this page" links. */
export const guidePageFor: Record<string, string> = {
  overview: '13-genel-bakis-ve-ders-alani',
  lesson: '13-genel-bakis-ve-ders-alani',
  settings: '01-okul-ayarlari',
  configuration: '02-sorular-ve-kurallar',
  people: '03-ekip-ve-kullanicilar',
  students: '04-ogrenciler-ve-veliler',
  classes: '05-siniflar-ve-dersler',
  attendance: '06-yoklama',
  curriculum: '07-mufredat',
  assessments: '08-degerlendirmeler',
  reports: '09-karneler',
  guidance: '10-rehberlik',
  finance: '11-odemeler',
  materials: '12-ders-materyalleri',
  control: '15-kontrol-ve-raporlar',
};

export function GuidePage({ lang, user, context, navigate }: PageProps) {
  const visible = useMemo(
    () =>
      docs.filter(
        (doc) => !doc.roles.length || doc.roles.some((r) => (user.roles as string[]).includes(r)),
      ),
    [user.roles],
  );
  // Parents start on their own page, teachers on their daily screen, management on page one.
  const parentOnly = user.roles.every((role) => role === 'parent');
  const management = user.roles.some(
    (role) => role === 'administrator' || role === 'academic_manager',
  );
  const start = parentOnly ? '14' : management ? '' : '13';
  const fallback = (start && visible.find((d) => d.slug.startsWith(start))) || visible[0];
  const requested = context?.action?.split('#') || [];
  const current = visible.find((doc) => doc.slug === requested[0]) || fallback;
  const anchor = requested[1];
  const [search, setSearch] = useState('');
  const term = search.trim().toLowerCase();
  const listed = term
    ? visible.filter((doc) => doc.title.toLowerCase().includes(term) || doc.text.includes(term))
    : visible;
  const open = (slug: string, target?: string) =>
    navigate?.('guide', { action: target ? `${slug}#${target}` : slug });

  useEffect(() => {
    const element = anchor ? document.getElementById(headingId(anchor.replace(/-/g, ' '))) : null;
    if (element) element.scrollIntoView({ block: 'start' });
    else window.scrollTo({ top: 0 });
  }, [current?.slug, anchor]);

  const link = (href: string, children: ReactNode, key: string) => {
    if (/^https?:/.test(href))
      return (
        <a key={key} href={href} target="_blank" rel="noreferrer">
          {children}
        </a>
      );
    const page = /^(?:\.\/)?([^/#]+)\.md(?:#(.+))?$/.exec(href);
    const anchorOnly = /^#(.+)$/.exec(href);
    const target = page ? visible.find((doc) => doc.slug === page[1]) : current;
    if ((page && target) || anchorOnly)
      return (
        <button
          key={key}
          type="button"
          className="guide-link"
          onClick={() => open(target!.slug, page ? page[2] : anchorOnly![1])}
        >
          {children}
        </button>
      );
    // Technical documents and pages for other roles are not linked inside the portal.
    return <span key={key}>{children}</span>;
  };

  return (
    <>
      <PageHeader
        eyebrow={tr(lang, 'How do I…?', 'Nasıl yaparım?')}
        title={tr(lang, 'User guide', 'Kullanım kılavuzu')}
        description={tr(
          lang,
          'Step-by-step help for your role, with pictures of each screen.',
          'Rolünüze göre adım adım yardım; her ekranın resmiyle.',
        )}
      />
      {lang === 'en' && (
        <div className="notice" role="note">
          The guide is written in Turkish, matching the Turkish screen and button names.
        </div>
      )}
      {!current ? (
        <EmptyState title={tr(lang, 'No guide pages for your role', 'Rolünüz için sayfa yok')} />
      ) : (
        <div className="guide-layout">
          <nav className="card guide-nav" aria-label={tr(lang, 'Guide pages', 'Kılavuz sayfaları')}>
            <SearchField
              placeholder={tr(lang, 'Search the guide…', 'Kılavuzda ara…')}
              value={search}
              onChange={(event) => setSearch(event.target.value)}
              label={tr(lang, 'Search the guide', 'Kılavuzda ara')}
            />
            <select
              className="guide-select"
              value={current.slug}
              onChange={(event) => open(event.target.value)}
              aria-label={tr(lang, 'Guide page', 'Kılavuz sayfası')}
            >
              {listed.map((doc) => (
                <option key={doc.slug} value={doc.slug}>
                  {doc.title}
                </option>
              ))}
            </select>
            <ul className="guide-pages">
              {listed.map((doc) => (
                <li key={doc.slug}>
                  <button
                    type="button"
                    className={doc.slug === current.slug ? 'active' : ''}
                    aria-current={doc.slug === current.slug ? 'page' : undefined}
                    onClick={() => open(doc.slug)}
                  >
                    {doc.title}
                  </button>
                </li>
              ))}
              {!listed.length && (
                <li className="muted">{tr(lang, 'Nothing found', 'Sonuç bulunamadı')}</li>
              )}
            </ul>
          </nav>
          <article className="card padded guide-article">
            <h2 data-page-title>{current.title}</h2>
            <Markdown source={current.body} images={images} link={link} />
          </article>
        </div>
      )}
    </>
  );
}
