import { mkdir, writeFile } from 'node:fs/promises';
import { dirname, join } from 'node:path';
import { fileURLToPath } from 'node:url';
import { fetch } from 'undici';
import { config, isTolokaConfigured } from '../../config.js';
import type { TorrentResult } from '../../mockProvider.js';
import { inspectTolokaSearchHtml, parseTolokaSearchHtml } from './parser.js';

const TOLOKA_PROVIDER_ID = 'toloka';
const TOLOKA_PROVIDER_NAME = 'Toloka';
const BROWSER_USER_AGENT =
  'Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/124.0 Safari/537.36';
const PROJECT_ROOT = fileURLToPath(new URL('../../../..', import.meta.url));
let cachedCookie = config.tolokaCookie?.trim();

export type TolokaProviderDebug = {
  searchUrl: string;
  statusCode?: number;
  contentType?: string;
  htmlLength?: number;
  pageTitle?: string;
  looksLikeLoginPage?: boolean;
  resultCandidatesCount?: number;
  topicLinksCount?: number;
  parserStrategy?: string;
};

type TolokaFetchResult = {
  html: string;
  debug: TolokaProviderDebug;
};

export class TolokaSearchError extends Error {
  constructor(
    message: string,
    public readonly debug: TolokaProviderDebug
  ) {
    super(message);
    this.name = 'TolokaSearchError';
  }
}

function mergeCookies(lines: string[]): string {
  const cookies = new Map<string, string>();
  for (const line of lines) {
    const pair = line.split(';')[0];
    const separator = pair.indexOf('=');
    if (separator > 0) {
      cookies.set(pair.slice(0, separator), pair.slice(separator + 1));
    }
  }
  return [...cookies].map(([name, value]) => `${name}=${value}`).join('; ');
}

async function loginToloka(): Promise<string> {
  if (!config.tolokaUsername?.trim() || !config.tolokaPassword?.trim()) {
    throw new TolokaSearchError('Toloka session expired and credentials are not configured', {
      searchUrl: buildSearchUrl(''),
      parserStrategy: 'toloka.login.v1'
    });
  }

  const response = await fetch(new URL('/login.php', config.tolokaBaseUrl), {
    method: 'POST',
    redirect: 'manual',
    headers: {
      'content-type': 'application/x-www-form-urlencoded',
      'user-agent': BROWSER_USER_AGENT
    },
    body: new URLSearchParams({
      username: config.tolokaUsername,
      password: config.tolokaPassword,
      autologin: 'on',
      ssl: 'on',
      redirect: 'tracker.php',
      login: 'Вхід'
    })
  });
  const cookie = mergeCookies(response.headers.getSetCookie?.() ?? []);
  if (!cookie) {
    throw new TolokaSearchError(`Toloka login failed with HTTP ${response.status}`, {
      searchUrl: buildSearchUrl(''),
      statusCode: response.status,
      parserStrategy: 'toloka.login.v1'
    });
  }

  cachedCookie = cookie;
  return cookie;
}

export async function getTolokaCookie(): Promise<string> {
  return cachedCookie || loginToloka();
}

export function buildSearchUrl(query: string): string {
  const url = new URL('/tracker.php', config.tolokaBaseUrl);
  url.searchParams.set('nm', query);
  return url.toString();
}

export function buildTolokaDownloadUrl(id: string): string {
  const url = new URL('/download.php', config.tolokaBaseUrl);
  url.searchParams.set('id', id);
  return url.toString();
}

function buildProxiedDownloadUrl(id: string): string {
  const url = new URL(`/download/toloka/${encodeURIComponent(id)}.torrent`, config.publicBaseUrl);
  if (config.apiKey) {
    url.searchParams.set('apikey', config.apiKey);
  }

  return url.toString();
}

async function saveDebugHtml(html: string): Promise<void> {
  const filePath = join(PROJECT_ROOT, '.debug', 'toloka-search.html');
  await mkdir(dirname(filePath), { recursive: true });
  await writeFile(filePath, html, 'utf8');
}

async function fetchTolokaSearchHtml(query: string, retryLogin = true): Promise<TolokaFetchResult> {
  const searchUrl = buildSearchUrl(query);

  if (!isTolokaConfigured()) {
    throw new TolokaSearchError('TOLOKA_COOKIE is not configured', {
      searchUrl,
      parserStrategy: 'toloka.forumline.tr.a.topictitle.v1'
    });
  }

  const cookie = cachedCookie || (await loginToloka());
  const response = await fetch(searchUrl, {
    headers: {
      accept: 'text/html,application/xhtml+xml',
      cookie,
      'user-agent': BROWSER_USER_AGENT
    }
  });
  const contentType = response.headers.get('content-type') ?? undefined;
  const html = await response.text();
  const diagnostics = inspectTolokaSearchHtml(html);
  const debug: TolokaProviderDebug = {
    searchUrl,
    statusCode: response.status,
    contentType,
    htmlLength: html.length,
    ...diagnostics
  };

  if (config.tolokaDebugSaveHtml) {
    await saveDebugHtml(html);
  }

  if (!response.ok) {
    throw new TolokaSearchError(`Toloka search failed with HTTP ${response.status}`, debug);
  }

  if (debug.looksLikeLoginPage) {
    if (retryLogin && config.tolokaUsername && config.tolokaPassword) {
      cachedCookie = undefined;
      await loginToloka();
      return fetchTolokaSearchHtml(query, false);
    }
    throw new TolokaSearchError('Toloka returned a login page or cookie is not authenticated', debug);
  }

  return {
    html,
    debug
  };
}

export async function searchToloka(query: string): Promise<TorrentResult[]> {
  const { html } = await fetchTolokaSearchHtml(query);
  return parseTolokaSearchHtml(html, config.tolokaBaseUrl).map((result) => ({
    providerId: TOLOKA_PROVIDER_ID,
    providerName: TOLOKA_PROVIDER_NAME,
    title: result.title,
    guid: `${TOLOKA_PROVIDER_ID}:${result.detailsUrl}`,
    detailsUrl: result.detailsUrl,
    commentsUrl: result.detailsUrl,
    downloadUrl: result.downloadId ? buildProxiedDownloadUrl(result.downloadId) : result.downloadUrl,
    downloadId: result.downloadId,
    originalDownloadUrl: result.downloadUrl,
    proxiedDownloadUrl: result.downloadId ? buildProxiedDownloadUrl(result.downloadId) : undefined,
    pubDate: result.publishedAt,
    size: result.size,
    seeders: result.seeders,
    peers: result.peers,
    category: '2000'
  }));
}

export async function debugSearchToloka(query: string): Promise<{
  results: TorrentResult[];
  debug: TolokaProviderDebug;
}> {
  const { html, debug } = await fetchTolokaSearchHtml(query);
  const results = parseTolokaSearchHtml(html, config.tolokaBaseUrl).map((result) => ({
    providerId: TOLOKA_PROVIDER_ID,
    providerName: TOLOKA_PROVIDER_NAME,
    title: result.title,
    guid: `${TOLOKA_PROVIDER_ID}:${result.detailsUrl}`,
    detailsUrl: result.detailsUrl,
    commentsUrl: result.detailsUrl,
    downloadUrl: result.downloadId ? buildProxiedDownloadUrl(result.downloadId) : result.downloadUrl,
    downloadId: result.downloadId,
    originalDownloadUrl: result.downloadUrl,
    proxiedDownloadUrl: result.downloadId ? buildProxiedDownloadUrl(result.downloadId) : undefined,
    pubDate: result.publishedAt,
    size: result.size,
    seeders: result.seeders,
    peers: result.peers,
    category: '2000'
  }));

  return {
    results,
    debug
  };
}
