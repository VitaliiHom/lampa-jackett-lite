import { load } from 'cheerio';

const DEFAULT_TOLOKA_BASE_URL = 'https://toloka.to';

export type TolokaParsedResult = {
  title: string;
  detailsUrl: string;
  downloadId?: string;
  downloadUrl?: string;
  size?: number;
  seeders?: number;
  peers?: number;
  publishedAt?: Date;
};

export type TolokaHtmlDiagnostics = {
  pageTitle: string;
  looksLikeLoginPage: boolean;
  looksLikeGuestPage: boolean;
  resultCandidatesCount: number;
  topicLinksCount: number;
  parserStrategy: string;
};

function absoluteTolokaUrl(value: string, baseUrl: string): string {
  return new URL(value, baseUrl).toString();
}

function parseDownloadId(value: string | undefined): string | undefined {
  if (!value) {
    return undefined;
  }

  const url = new URL(value, DEFAULT_TOLOKA_BASE_URL);
  return url.searchParams.get('id') ?? undefined;
}

function parseInteger(value: string): number | undefined {
  const normalized = value.replace(/[^\d]/g, '');
  if (!normalized) {
    return undefined;
  }

  return Number(normalized);
}

export function parseTolokaSize(value: string): number | undefined {
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

function parseTolokaDate(value: string): Date | undefined {
  const normalized = value.trim();
  const isoLike = normalized.match(/(\d{4})-(\d{2})-(\d{2})\s+(\d{2}):(\d{2})/);
  if (isoLike) {
    return new Date(`${isoLike[1]}-${isoLike[2]}-${isoLike[3]}T${isoLike[4]}:${isoLike[5]}:00.000Z`);
  }

  const dotted = normalized.match(/(\d{2})\.(\d{2})\.(\d{2,4})\s+(\d{2}):(\d{2})/);
  if (dotted) {
    const year = dotted[3].length === 2 ? `20${dotted[3]}` : dotted[3];
    return new Date(`${year}-${dotted[2]}-${dotted[1]}T${dotted[4]}:${dotted[5]}:00.000Z`);
  }

  return undefined;
}

export function parseTolokaSearchHtml(html: string, baseUrl = DEFAULT_TOLOKA_BASE_URL): TolokaParsedResult[] {
  const $ = load(html);
  const results: TolokaParsedResult[] = [];

  $('table.forumline tr').each((_, row) => {
    const $row = $(row);
    const titleLink = $row.find('.topictitle a, a.topictitle').first();
    const title = titleLink.text().replace(/\s+/g, ' ').trim();
    const href = titleLink.attr('href');
    const downloadHref = $row.find('a[href*="download.php"]').first().attr('href');
    const downloadId = parseDownloadId(downloadHref);

    if (!title || !href) {
      return;
    }

    const cells = $row.find('td').toArray().map((cell) => $(cell).text().replace(/\s+/g, ' ').trim());

    results.push({
      title,
      detailsUrl: absoluteTolokaUrl(href, baseUrl),
      downloadId,
      downloadUrl: downloadHref ? absoluteTolokaUrl(downloadHref, baseUrl) : undefined,
      size: parseTolokaSize(cells[6] ?? ''),
      seeders: parseInteger(cells[9] ?? ''),
      peers: parseInteger(cells[10] ?? ''),
      publishedAt: parseTolokaDate(cells[12] ?? '')
    });
  });

  return results;
}

export function inspectTolokaSearchHtml(html: string): TolokaHtmlDiagnostics {
  const $ = load(html);
  const pageTitle = $('title').first().text().replace(/\s+/g, ' ').trim();
  const loginFormCount = $('form[action*="login"], form[action*="login.php"]').length;
  const passwordInputsCount = $('input[type="password"]').length;
  const topicLinksCount = $('.topictitle a, a.topictitle').length;
  const normalizedTitle = pageTitle.toLowerCase();
  const bodyText = $('body').text().replace(/\s+/g, ' ').trim();
  const looksLikeGuestPage =
    /(?:^|\s)Вхід(?:\s|$)/.test(bodyText) &&
    /Зареєструватися/.test(bodyText) &&
    !/(?:^|\s)(?:Вийти|Профіль)(?:\s|$)/.test(bodyText);

  return {
    pageTitle,
    looksLikeLoginPage:
      loginFormCount > 0 ||
      passwordInputsCount > 0 ||
      normalizedTitle === 'вхід' ||
      normalizedTitle === 'login' ||
      looksLikeGuestPage,
    looksLikeGuestPage,
    resultCandidatesCount: $('table.forumline tr:has(.topictitle a), table.forumline tr:has(a.topictitle)').length,
    topicLinksCount,
    parserStrategy: 'toloka.forumline.tr.a.topictitle.v1'
  };
}
