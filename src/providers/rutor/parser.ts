import { load } from 'cheerio';

const DEFAULT_RUTOR_BASE_URL = 'https://rutor.info';
const DEFAULT_RUTOR_DOWNLOAD_BASE_URL = 'https://d.rutor.info';

export type RutorParsedResult = {
  title: string;
  detailsUrl: string;
  downloadId?: string;
  downloadUrl?: string;
  magnetUrl?: string;
  size?: number;
  seeders?: number;
  peers?: number;
  publishedAt?: Date;
};

export type RutorHtmlDiagnostics = {
  pageTitle: string;
  looksLikeBlockedPage: boolean;
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

function absoluteRutorUrl(value: string, baseUrl: string): string {
  return new URL(value, baseUrl).toString();
}

function absoluteRutorDownloadUrl(value: string): string {
  return new URL(value, DEFAULT_RUTOR_DOWNLOAD_BASE_URL).toString();
}

function parseDownloadId(value?: string): string | undefined {
  if (!value) {
    return undefined;
  }

  const match = value.match(/\/(?:download|torrent)\/(\d+)/);
  return match?.[1];
}

function parseInteger(value: string): number | undefined {
  const normalized = value.replace(/[^\d]/g, '');
  return normalized ? Number(normalized) : undefined;
}

export function parseRutorSize(value: string): number | undefined {
  const match = value.replace(/\u00a0/g, ' ').trim().replace(',', '.').match(/([\d.]+)\s*(B|KB|MB|GB|TB|КБ|МБ|ГБ|ТБ)/i);
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

function parseRutorDate(value: string): Date | undefined {
  const normalized = value.replace(/\u00a0/g, ' ').trim().toLowerCase();
  const match = normalized.match(/(\d{1,2})\s+([а-яё]{3})\s+(\d{2,4})/i);
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

export function parseRutorSearchHtml(html: string, baseUrl = DEFAULT_RUTOR_BASE_URL): RutorParsedResult[] {
  const $ = load(html);
  const results: RutorParsedResult[] = [];

  $('#index table tr.gai, #index table tr.tum').each((_, row) => {
    const $row = $(row);
    const titleLink = $row.find('a[href^="/torrent/"]').first();
    const title = titleLink.text().replace(/\s+/g, ' ').trim();
    const href = titleLink.attr('href');
    const downloadHref = $row.find('a.downgif[href*="/download/"], a[href*="/download/"]').first().attr('href');
    const magnetUrl = $row.find('a[href^="magnet:"]').first().attr('href');
    const downloadId = parseDownloadId(downloadHref) ?? parseDownloadId(href);

    if (!title || !href) {
      return;
    }

    const cells = $row.find('td').toArray().map((cell) => $(cell).text().replace(/\s+/g, ' ').trim());

    results.push({
      title,
      detailsUrl: absoluteRutorUrl(href, baseUrl),
      downloadId,
      downloadUrl: downloadHref ? absoluteRutorDownloadUrl(downloadHref) : undefined,
      magnetUrl,
      size: parseRutorSize(cells[cells.length - 2] ?? ''),
      seeders: parseInteger($row.find('.green').first().text()),
      peers: parseInteger($row.find('.red').first().text()),
      publishedAt: parseRutorDate(cells[0] ?? '')
    });
  });

  return results;
}

export function inspectRutorSearchHtml(html: string): RutorHtmlDiagnostics {
  const $ = load(html);
  const pageTitle = $('title').first().text().replace(/\s+/g, ' ').trim();
  const normalizedText = $('body').text().replace(/\s+/g, ' ').trim().toLowerCase();
  const rows = $('#index table tr.gai, #index table tr.tum');
  const topicLinksCount = rows.find('a[href^="/torrent/"]').length;

  return {
    pageTitle,
    looksLikeBlockedPage:
      normalizedText.includes('доступ заблокирован') ||
      normalizedText.includes('access denied') ||
      normalizedText.includes('forbidden'),
    resultCandidatesCount: rows.filter((_, row) => $(row).find('a[href*="/download/"]').length > 0).length,
    topicLinksCount,
    parserStrategy: 'rutor.index-table.tr-gai-tum.v1'
  };
}
