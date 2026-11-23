import type { Lang } from './types';

/** Countries most of our families live in; listed first in pickers. */
export const COMMON_COUNTRIES = ['PL', 'TR', 'GB', 'DE', 'NL', 'BE', 'AT', 'FR', 'IE'];

/** ISO 3166-1 alpha-2 codes. Names come from the browser in the reader's language. */
export const COUNTRY_CODES = (
  'AD AE AF AG AI AL AM AO AQ AR AS AT AU AW AX AZ BA BB BD BE BF BG BH BI BJ BL BM BN BO BQ BR BS ' +
  'BT BV BW BY BZ CA CC CD CF CG CH CI CK CL CM CN CO CR CU CV CW CX CY CZ DE DJ DK DM DO DZ EC EE ' +
  'EG EH ER ES ET FI FJ FK FM FO FR GA GB GD GE GF GG GH GI GL GM GN GP GQ GR GS GT GU GW GY HK HM ' +
  'HN HR HT HU ID IE IL IM IN IO IQ IR IS IT JE JM JO JP KE KG KH KI KM KN KP KR KW KY KZ LA LB LC ' +
  'LI LK LR LS LT LU LV LY MA MC MD ME MF MG MH MK ML MM MN MO MP MQ MR MS MT MU MV MW MX MY MZ NA ' +
  'NC NE NF NG NI NL NO NP NR NU NZ OM PA PE PF PG PH PK PL PM PN PR PS PT PW PY QA RE RO RS RU RW ' +
  'SA SB SC SD SE SG SH SI SJ SK SL SM SN SO SR SS ST SV SX SY SZ TC TD TF TG TH TJ TK TL TM TN TO ' +
  'TR TT TV TW TZ UA UG UM US UY UZ VA VC VE VG VI VN VU WF WS XK YE YT ZA ZM ZW'
).split(' ');

const displayNames: Partial<Record<Lang, Intl.DisplayNames | null>> = {};
function names(lang: Lang) {
  if (!(lang in displayNames)) {
    try {
      displayNames[lang] = new Intl.DisplayNames([lang === 'tr' ? 'tr' : 'en'], { type: 'region' });
    } catch {
      displayNames[lang] = null;
    }
  }
  return displayNames[lang];
}

const isCode = (value: string) => /^[A-Z]{2}$/.test(value);

/** A stored country (ISO code, or legacy free text) shown in the reader's language. */
export function countryName(value: string | null | undefined, lang: Lang) {
  if (!value) return '';
  if (!isCode(value)) return value;
  try {
    return names(lang)?.of(value) || value;
  } catch {
    return value;
  }
}

/** Countries sorted by localised name, with the common ones first. */
export function countryOptions(lang: Lang) {
  const collator = new Intl.Collator(lang === 'tr' ? 'tr' : 'en');
  const all = COUNTRY_CODES.map((code) => ({ code, name: countryName(code, lang) })).sort((a, b) =>
    collator.compare(a.name, b.name),
  );
  return {
    common: COMMON_COUNTRIES.map((code) => ({ code, name: countryName(code, lang) })),
    all,
  };
}

const fold = (value: string) =>
  value.toLocaleLowerCase('tr').normalize('NFD').replace(/[̀-ͯ]/g, '').replace(/ı/g, 'i').trim();
const aliases: Record<string, string> = {
  uk: 'GB',
  england: 'GB',
  ingiltere: 'GB',
  'great britain': 'GB',
  usa: 'US',
  abd: 'US',
  amerika: 'US',
  holland: 'NL',
  turkiye: 'TR',
  turkey: 'TR',
  polska: 'PL',
  deutschland: 'DE',
};
let lookup: Map<string, string> | null = null;

/** Turns a code or an English/Turkish country name into an ISO code; unknown text is kept. */
export function toCountryCode(value: string | null | undefined) {
  const text = String(value || '').trim();
  if (!text) return '';
  if (isCode(text.toUpperCase()) && COUNTRY_CODES.includes(text.toUpperCase()))
    return text.toUpperCase();
  if (!lookup) {
    lookup = new Map(Object.entries(aliases));
    for (const code of COUNTRY_CODES)
      for (const lang of ['en', 'tr'] as Lang[]) lookup.set(fold(countryName(code, lang)), code);
  }
  return lookup.get(fold(text)) || text;
}
