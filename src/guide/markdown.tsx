import type { ReactNode } from 'react';

/**
 * A small Markdown renderer for the user guide in docs/kilavuz. It builds React elements
 * (never raw HTML) and supports only what the guide uses: headings, paragraphs, block
 * quotes, nested lists, tables, code fences, rules, bold, italic, inline code, links and
 * images. HTML comments are hidden; `<!-- roller: a, b -->` lists the roles a page is for.
 */

export type GuideDoc = {
  slug: string;
  title: string;
  roles: string[];
  body: string;
  /** Plain text used for search. */
  text: string;
};

export type LinkRenderer = (href: string, children: ReactNode, key: string) => ReactNode;

export const headingId = (text: string) =>
  'guide-' +
  plain(text)
    .toLowerCase()
    .replace(/[^\p{L}\p{N}\s-]/gu, '')
    .trim()
    .replace(/\s+/g, '-');

/** Markdown syntax removed, for titles, search and heading ids. */
export const plain = (text: string) =>
  text
    .replace(/!\[([^\]]*)\]\([^)]*\)/g, '$1')
    .replace(/\[([^\]]+)\]\([^)]*\)/g, '$1')
    .replace(/[*`]/g, '');

export function parseGuide(slug: string, raw: string): GuideDoc {
  const roles = /<!--\s*roller:\s*([^>]*?)\s*-->/.exec(raw)?.[1] || '';
  const body = raw.replace(/\r\n/g, '\n').replace(/<!--[\s\S]*?-->\n?/g, '');
  const heading = /^#\s+(.+)$/m.exec(body)?.[1] || slug;
  return {
    slug,
    title: plain(heading).replace(/^\d+\s*·\s*/, ''),
    roles: roles
      .split(',')
      .map((role) => role.trim())
      .filter(Boolean),
    body,
    text: plain(body).toLowerCase(),
  };
}

type Item = { text: string[]; children: ListBlock[] };
type ListBlock = { ordered: boolean; start: number; items: Item[] };

const listLine = /^(\s*)([-*]|\d+\.)\s+(.*)$/;

export function Markdown({
  source,
  images,
  link,
  skipTitle = true,
}: {
  source: string;
  images: Record<string, string>;
  link: LinkRenderer;
  skipTitle?: boolean;
}) {
  const lines = source.split('\n');
  const blocks: ReactNode[] = [];
  let paragraph: string[] = [];
  let index = 0;
  let titleSkipped = !skipTitle;
  const key = () => `b${blocks.length}`;

  const inline = (text: string, prefix = 'i'): ReactNode[] => {
    const out: ReactNode[] = [];
    const pattern =
      /(`[^`]+`)|(!\[[^\]]*\]\([^)]+\))|(\[[^\]]+\]\([^)]+\))|(\*\*.+?\*\*)|(\*[^*\s][^*]*?\*)/;
    let rest = text;
    let n = 0;
    while (rest) {
      const match = pattern.exec(rest);
      if (!match) {
        out.push(rest);
        break;
      }
      if (match.index) out.push(rest.slice(0, match.index));
      const token = match[0];
      const k = `${prefix}${n++}`;
      if (match[1]) out.push(<code key={k}>{token.slice(1, -1)}</code>);
      else if (match[2]) {
        const [, alt, src] = /!\[([^\]]*)\]\(([^)]+)\)/.exec(token)!;
        out.push(image(alt, src, k));
      } else if (match[3]) {
        const [, label, href] = /\[([^\]]+)\]\(([^)]+)\)/.exec(token)!;
        out.push(link(href, inline(label, `${k}-`), k));
      } else if (match[4]) out.push(<strong key={k}>{inline(token.slice(2, -2), `${k}-`)}</strong>);
      else out.push(<em key={k}>{inline(token.slice(1, -1), `${k}-`)}</em>);
      rest = rest.slice(match.index + token.length);
    }
    return out;
  };

  const image = (alt: string, src: string, k: string) => {
    const url = images[src.replace(/^\.?\/?img\//, '')];
    return url ? (
      <figure className="guide-figure" key={k}>
        <img src={url} alt={alt} loading="lazy" />
        {alt && <figcaption>{alt}</figcaption>}
      </figure>
    ) : (
      // Pages stay readable before their screenshots exist.
      <span className="guide-missing-image" key={k}>
        {alt}
      </span>
    );
  };

  const flush = () => {
    if (!paragraph.length) return;
    const text = paragraph.join(' ');
    const only = /^!\[([^\]]*)\]\(([^)]+)\)$/.exec(text.trim());
    blocks.push(only ? image(only[1], only[2], key()) : <p key={key()}>{inline(text)}</p>);
    paragraph = [];
  };

  const renderList = (list: ListBlock, k: string): ReactNode => {
    const items = list.items.map((item, i) => (
      <li key={i}>
        {inline(item.text.join(' '), `${k}-${i}-`)}
        {item.children.map((child, c) => renderList(child, `${k}-${i}-${c}`))}
      </li>
    ));
    // `start` keeps step numbers when a picture sits between two steps.
    return list.ordered ? (
      <ol key={k} start={list.start}>
        {items}
      </ol>
    ) : (
      <ul key={k}>{items}</ul>
    );
  };

  while (index < lines.length) {
    const line = lines[index];
    if (!line.trim()) {
      flush();
      index++;
      continue;
    }
    if (line.startsWith('```')) {
      flush();
      const code: string[] = [];
      index++;
      while (index < lines.length && !lines[index].startsWith('```')) code.push(lines[index++]);
      index++;
      blocks.push(
        <pre key={key()}>
          <code>{code.join('\n')}</code>
        </pre>,
      );
      continue;
    }
    const heading = /^(#{1,4})\s+(.+)$/.exec(line);
    if (heading) {
      flush();
      index++;
      if (heading[1].length === 1 && !titleSkipped) {
        titleSkipped = true;
        continue;
      }
      const level = Math.min(heading[1].length + 1, 5);
      const Tag = `h${level}` as 'h2';
      blocks.push(
        <Tag key={key()} id={headingId(heading[2])}>
          {inline(heading[2])}
        </Tag>,
      );
      continue;
    }
    if (/^-{3,}\s*$/.test(line)) {
      flush();
      blocks.push(<hr key={key()} />);
      index++;
      continue;
    }
    if (line.startsWith('>')) {
      flush();
      const quote: string[] = [];
      while (index < lines.length && lines[index].startsWith('>'))
        quote.push(lines[index++].replace(/^>\s?/, ''));
      blocks.push(
        <blockquote key={key()}>
          <Markdown source={quote.join('\n')} images={images} link={link} skipTitle={false} />
        </blockquote>,
      );
      continue;
    }
    if (line.trim().startsWith('|') && /^\s*\|?[\s:|-]+\|[\s:|-]*$/.test(lines[index + 1] || '')) {
      flush();
      const cells = (row: string) =>
        row
          .trim()
          .replace(/^\|/, '')
          .replace(/\|$/, '')
          .split('|')
          .map((cell) => cell.trim());
      const head = cells(line);
      index += 2;
      const rows: string[][] = [];
      while (index < lines.length && lines[index].trim().startsWith('|'))
        rows.push(cells(lines[index++]));
      const k = key();
      blocks.push(
        <div className="guide-table" key={k}>
          <table>
            <thead>
              <tr>
                {head.map((cell, c) => (
                  <th key={c}>{inline(cell, `${k}h${c}-`)}</th>
                ))}
              </tr>
            </thead>
            <tbody>
              {rows.map((row, r) => (
                <tr key={r}>
                  {row.map((cell, c) => (
                    <td key={c}>{inline(cell, `${k}r${r}c${c}-`)}</td>
                  ))}
                </tr>
              ))}
            </tbody>
          </table>
        </div>,
      );
      continue;
    }
    if (listLine.test(line)) {
      flush();
      // Build nested lists from indentation (children are indented under their item).
      const marker = listLine.exec(line)![2];
      const root: ListBlock = {
        ordered: /\d/.test(marker),
        start: parseInt(marker) || 1,
        items: [],
      };
      const stack: { indent: number; list: ListBlock }[] = [{ indent: 0, list: root }];
      while (index < lines.length && lines[index].trim()) {
        const current = lines[index];
        const match = listLine.exec(current);
        if (match) {
          const indent = match[1].length;
          while (stack.length > 1 && indent < stack[stack.length - 1].indent) stack.pop();
          let top = stack[stack.length - 1];
          if (indent > top.indent && top.list.items.length) {
            const child: ListBlock = {
              ordered: /\d/.test(match[2]),
              start: parseInt(match[2]) || 1,
              items: [],
            };
            top.list.items[top.list.items.length - 1].children.push(child);
            stack.push({ indent, list: child });
            top = stack[stack.length - 1];
          }
          top.list.items.push({ text: [match[3]], children: [] });
        } else {
          // A continuation line belongs to the last item.
          const top = stack[stack.length - 1].list;
          top.items[top.items.length - 1]?.text.push(current.trim());
        }
        index++;
      }
      blocks.push(renderList(root, key()));
      continue;
    }
    paragraph.push(line.trim());
    index++;
  }
  flush();
  return <>{blocks}</>;
}
