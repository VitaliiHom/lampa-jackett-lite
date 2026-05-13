import { load } from 'cheerio';

const DEFAULT_RUTRACKER_BASE_URL = 'https://rutracker.net/forum';

export type RutrackerParsedResult = {
  title: string;
  detailsUrl: string;
  downloadId?: string;
  downloadUrl?: string;
  size?: number;
  seeders?: number;
  peers?: number;
  publishedAt?: Date;
};

export type RutrackerHtmlDiagnostics = {
  pageTitle: string;
  looksLikeLoginPage: boolean;
  resultCandidatesCount: number;
  topicLinksCount: number;
  parserStrategy: string;
};

const months: Record<string, string> = {
  'янв': '01',
  'фев': '02',
  'мар': '03',
  'апр': '04',
  'май': '05',
  'мая': '05',
  'июн': '06',
  'июл': '07',
  'авг': '08',
  'сен': '09',
  'окт': '10',
  'ноя': '11',
  'дек': '12'
};

function absoluteRutrackerUrl(value: string, baseUrl: string): string {
  return new URL(value, `${baseUrl}/`).toString();
}

function parseInteger(value: string): number | undefined {
  const normalized = value.replace(/[^\d]/g, '');
  return normalized ? Number(normalized) : undefined;
}

export function parseRutrackerSize(value: string): number | undefined {
  const match = value.trim().replace(',', '.').match(/([\d.]+)\s*(B|KB|MB|GB|TB|КБ|МБ|ГБ|ТБ)/i);
  if (!match) {
    return undefined;
  }

  const amount = Number(match[1]);
  if (!Number.isFinite(amount)) {
    return undefined;
  }

  const unit = match[2].toUpperCase();
  const multipliers: Record<string, number> = {
    B: 1,
    KB: 1024,
    MB: 1024 ** 2,
    GB: 1024 ** 3,
    TB: 1024 ** 4,
    'КБ': 1024,
    'МБ': 1024 ** 2,
    'ГБ': 1024 ** 3,
    'ТБ': 1024 ** 4
  };

  return Math.round(amount * multipliers[unit]);
}

function parseRutrackerDate(value: string): Date | undefined {
  const normalized = value.trim().toLowerCase();
  const match = normalized.match(/(\d{1,2})-([а-яё]{3})-(\d{2,4})/i);
  if (!match) {
    return undefined;
  }

  const day = match[1].padStart(2, '0');
  const month = months[match[2]];
  const year = match[3].length === 2 ? `20${match[3]}` : match[3];
  if (!month) {
    return undefined;
  }

  return new Date(`${year}-${month}-${day}T00:00:00.000Z`);
}

function parseTopicId(value?: string): string | undefined {
  if (!value) {
    return undefined;
  }

  const match = value.match(/[?&]t=(\d+)/);
  return match?.[1];
}

export function parseRutrackerSearchHtml(html: string, baseUrl = DEFAULT_RUTRACKER_BASE_URL): RutrackerParsedResult[] {
  const $ = load(html);
  const results: RutrackerParsedResult[] = [];
  const rows = $('#tor-tbl tr').length > 0 ? $('#tor-tbl tr') : $('tr');

  rows.each((_, row) => {
    const $row = $(row);
    const titleLink = $row.find('a.tLink[data-topic_id], a[href*="viewtopic.php?t="]').first();
    const title = titleLink.text().replace(/\s+/g, ' ').trim();
    const href = titleLink.attr('href');
    const topicId = titleLink.attr('data-topic_id') ?? parseTopicId(href);
    const downloadHref = $row.find('a[href*="dl.php?t="]').first().attr('href');

    if (!title || !href || !topicId || !downloadHref) {
      return;
    }

    const cells = $row.find('td').toArray().map((cell) => $(cell).text().replace(/\s+/g, ' ').trim());

    results.push({
      title,
      detailsUrl: absoluteRutrackerUrl(href, baseUrl),
      downloadId: topicId,
      downloadUrl: absoluteRutrackerUrl(downloadHref, baseUrl),
      size: parseRutrackerSize(cells[5] ?? ''),
      seeders: parseInteger(cells[6] ?? ''),
      peers: parseInteger(cells[7] ?? ''),
      publishedAt: parseRutrackerDate(cells[9] ?? '')
    });
  });

  return results;
}

export function inspectRutrackerSearchHtml(html: string): RutrackerHtmlDiagnostics {
  const $ = load(html);
  const pageTitle = $('title').first().text().replace(/\s+/g, ' ').trim();
  const rows = $('#tor-tbl tr').length > 0 ? $('#tor-tbl tr') : $('tr');
  const topicLinksCount = rows.find('a.tLink[data-topic_id], a[href*="viewtopic.php?t="]').length;
  const passwordInputsCount = $('input[type="password"]').length;
  const loginFormsCount = $('form[action*="login.php"]').length;
  const normalizedTitle = pageTitle.toLowerCase();

  return {
    pageTitle,
    looksLikeLoginPage: passwordInputsCount > 0 || loginFormsCount > 0 || normalizedTitle.includes('вход'),
    resultCandidatesCount: rows.filter((_, row) => $(row).find('a[href*="dl.php?t="]').length > 0).length,
    topicLinksCount,
    parserStrategy: 'rutracker.tr.a.tLink-data-topic-id.v1'
  };
}
