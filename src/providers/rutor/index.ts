import { mkdir, writeFile } from 'node:fs/promises';
import { dirname, join } from 'node:path';
import { fileURLToPath } from 'node:url';
import { fetch } from 'undici';
import { config } from '../../config.js';
import type { TorrentResult } from '../../mockProvider.js';
import { inspectRutorSearchHtml, parseRutorSearchHtml } from './parser.js';

const RUTOR_PROVIDER_ID = 'rutor';
const RUTOR_PROVIDER_NAME = 'Rutor';
const BROWSER_USER_AGENT =
  'Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/124.0 Safari/537.36';
const PROJECT_ROOT = fileURLToPath(new URL('../../../..', import.meta.url));

export type RutorProviderDebug = {
  searchUrl: string;
  statusCode?: number;
  contentType?: string;
  htmlLength?: number;
  pageTitle?: string;
  looksLikeBlockedPage?: boolean;
  resultCandidatesCount?: number;
  topicLinksCount?: number;
  parserStrategy?: string;
};

type RutorFetchResult = {
  html: string;
  debug: RutorProviderDebug;
};

export class RutorSearchError extends Error {
  constructor(
    message: string,
    public readonly debug: RutorProviderDebug
  ) {
    super(message);
    this.name = 'RutorSearchError';
  }
}

export function buildRutorSearchUrl(query: string): string {
  const normalizedQuery = query.trim() || ' ';
  return new URL(`/search/0/0/000/0/${encodeURIComponent(normalizedQuery)}`, config.rutorBaseUrl).toString();
}

export function buildRutorDownloadUrl(id: string): string {
  return new URL(`/download/${encodeURIComponent(id)}`, 'https://d.rutor.info').toString();
}

function buildProxiedDownloadUrl(id: string): string {
  const url = new URL(`/download/rutor/${encodeURIComponent(id)}.torrent`, config.publicBaseUrl);
  if (config.apiKey) {
    url.searchParams.set('apikey', config.apiKey);
  }

  return url.toString();
}

async function saveDebugHtml(html: string): Promise<void> {
  const filePath = join(PROJECT_ROOT, '.debug', 'rutor-search.html');
  await mkdir(dirname(filePath), { recursive: true });
  await writeFile(filePath, html, 'utf8');
}

async function fetchRutorSearchHtml(query: string): Promise<RutorFetchResult> {
  const searchUrl = buildRutorSearchUrl(query);
  const response = await fetch(searchUrl, {
    headers: {
      accept: 'text/html,application/xhtml+xml',
      'user-agent': BROWSER_USER_AGENT
    }
  });
  const contentType = response.headers.get('content-type') ?? undefined;
  const html = await response.text();
  const diagnostics = inspectRutorSearchHtml(html);
  const debug: RutorProviderDebug = {
    searchUrl,
    statusCode: response.status,
    contentType,
    htmlLength: html.length,
    ...diagnostics
  };

  if (config.rutorDebugSaveHtml) {
    await saveDebugHtml(html);
  }

  if (!response.ok) {
    throw new RutorSearchError(`Rutor search failed with HTTP ${response.status}`, debug);
  }

  if (debug.looksLikeBlockedPage) {
    throw new RutorSearchError('Rutor returned a blocked or forbidden page', debug);
  }

  return {
    html,
    debug
  };
}

function normalizeResults(html: string): TorrentResult[] {
  return parseRutorSearchHtml(html, config.rutorBaseUrl).map((result) => ({
    providerId: RUTOR_PROVIDER_ID,
    providerName: RUTOR_PROVIDER_NAME,
    title: result.title,
    guid: `${RUTOR_PROVIDER_ID}:${result.detailsUrl}`,
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

export async function searchRutor(query: string): Promise<TorrentResult[]> {
  const { html } = await fetchRutorSearchHtml(query);
  return normalizeResults(html);
}

export async function debugSearchRutor(query: string): Promise<{
  results: TorrentResult[];
  debug: RutorProviderDebug;
}> {
  const { html, debug } = await fetchRutorSearchHtml(query);
  return {
    results: normalizeResults(html),
    debug
  };
}
