import { mkdir, readFile, writeFile } from 'node:fs/promises';
import { dirname, join } from 'node:path';
import { fileURLToPath } from 'node:url';
import iconv from 'iconv-lite';
import { fetch, ProxyAgent, type Dispatcher } from 'undici';
import { config, isRutrackerConfigured } from '../../config.js';
import type { TorrentResult } from '../../mockProvider.js';
import { inspectRutrackerSearchHtml, parseRutrackerSearchHtml } from './parser.js';

const RUTRACKER_PROVIDER_ID = 'rutracker';
const RUTRACKER_PROVIDER_NAME = 'RuTracker';
const BROWSER_USER_AGENT =
  'Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/124.0 Safari/537.36';
const PROJECT_ROOT = fileURLToPath(new URL('../../../..', import.meta.url));
const SESSION_CACHE_FILE = join(PROJECT_ROOT, '.tmp', 'rutracker-session.json');

export type RutrackerProviderDebug = {
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

type RutrackerFetchResult = {
  html: string;
  debug: RutrackerProviderDebug;
};

type RutrackerSession = {
  cookie: string;
  userAgent: string;
  createdAt?: number;
};

type FlareSolverrResponse = {
  status?: string;
  message?: string;
  solution?: {
    status?: number;
    userAgent?: string;
    cookies?: Array<{
      name?: string;
      value?: string;
    }>;
  };
};

let cachedSession: RutrackerSession | undefined;
let sessionPromise: Promise<RutrackerSession> | undefined;
const proxyDispatcher: Dispatcher | undefined = config.rutrackerProxyUrl
  ? new ProxyAgent(config.rutrackerProxyUrl)
  : undefined;

async function readCachedSession(): Promise<RutrackerSession | undefined> {
  try {
    const session = JSON.parse(await readFile(SESSION_CACHE_FILE, 'utf8')) as RutrackerSession;
    if (!session.cookie || !session.userAgent) {
      return undefined;
    }
    return session;
  } catch {
    return undefined;
  }
}

async function writeCachedSession(session: RutrackerSession): Promise<void> {
  await mkdir(dirname(SESSION_CACHE_FILE), { recursive: true });
  await writeFile(
    SESSION_CACHE_FILE,
    JSON.stringify({
      ...session,
      createdAt: Date.now()
    }),
    {
      encoding: 'utf8',
      mode: 0o600
    }
  );
}

export class RutrackerSearchError extends Error {
  constructor(
    message: string,
    public readonly debug: RutrackerProviderDebug
  ) {
    super(message);
    this.name = 'RutrackerSearchError';
  }
}

function decodeHtml(buffer: ArrayBuffer): string {
  return iconv.decode(Buffer.from(buffer), 'win1251');
}

export function buildRutrackerSearchUrl(query: string): string {
  const url = new URL('tracker.php', `${config.rutrackerBaseUrl}/`);
  url.searchParams.set('nm', query);
  return url.toString();
}

export function buildRutrackerDownloadUrl(id: string): string {
  const url = new URL('dl.php', `${config.rutrackerBaseUrl}/`);
  url.searchParams.set('t', id);
  return url.toString();
}

function buildProxiedDownloadUrl(id: string): string {
  const url = new URL(`/download/rutracker/${encodeURIComponent(id)}.torrent`, config.publicBaseUrl);
  if (config.apiKey) {
    url.searchParams.set('apikey', config.apiKey);
  }

  return url.toString();
}

async function saveDebugHtml(html: string): Promise<void> {
  const filePath = join(PROJECT_ROOT, '.debug', 'rutracker-search.html');
  await mkdir(dirname(filePath), { recursive: true });
  await writeFile(filePath, html, 'utf8');
}

async function solveCloudflare(): Promise<RutrackerSession> {
  if (!config.flaresolverrUrl || !config.rutrackerProxyUrl) {
    return {
      cookie: '',
      userAgent: BROWSER_USER_AGENT
    };
  }

  const response = await fetch(new URL('/v1', config.flaresolverrUrl), {
    method: 'POST',
    headers: {
      'content-type': 'application/json'
    },
    body: JSON.stringify({
      cmd: 'request.get',
      url: buildRutrackerSearchUrl(''),
      maxTimeout: 100_000,
      proxy: {
        url: config.rutrackerProxyUrl
      }
    })
  });
  const result = (await response.json()) as FlareSolverrResponse;
  if (!response.ok || result.status !== 'ok' || !result.solution?.userAgent) {
    throw new RutrackerSearchError(`FlareSolverr failed: ${result.message ?? `HTTP ${response.status}`}`, {
      searchUrl: buildRutrackerSearchUrl(''),
      statusCode: result.solution?.status ?? response.status,
      parserStrategy: 'rutracker.flaresolverr-warp.v1'
    });
  }

  return {
    cookie: (result.solution.cookies ?? [])
      .filter((cookie) => cookie.name && cookie.value)
      .map((cookie) => `${cookie.name}=${cookie.value}`)
      .join('; '),
    userAgent: result.solution.userAgent
  };
}

async function createRutrackerSession(): Promise<RutrackerSession> {
  if (!isRutrackerConfigured()) {
    throw new RutrackerSearchError('RUTRACKER_USERNAME or RUTRACKER_PASSWORD is not configured', {
      searchUrl: buildRutrackerSearchUrl(''),
      parserStrategy: 'rutracker.tr.a.tLink-data-topic-id.v1'
    });
  }

  const cloudflare = await solveCloudflare();
  const response = await fetch(new URL('login.php', `${config.rutrackerBaseUrl}/`), {
    method: 'POST',
    redirect: 'manual',
    body: new URLSearchParams({
      login_username: config.rutrackerUsername ?? '',
      login_password: config.rutrackerPassword ?? '',
      login: 'Вход'
    }),
    headers: {
      'content-type': 'application/x-www-form-urlencoded',
      cookie: cloudflare.cookie,
      'user-agent': cloudflare.userAgent
    },
    ...(proxyDispatcher ? { dispatcher: proxyDispatcher } : {})
  });
  const setCookie = response.headers.getSetCookie?.() ?? [];
  const loginCookie = setCookie.map((line) => line.split(';')[0]).filter(Boolean).join('; ');

  if (!loginCookie) {
    throw new RutrackerSearchError(`RuTracker login failed with HTTP ${response.status}`, {
      searchUrl: buildRutrackerSearchUrl(''),
      statusCode: response.status,
      parserStrategy: 'rutracker.tr.a.tLink-data-topic-id.v1'
    });
  }

  return {
    cookie: [cloudflare.cookie, loginCookie].filter(Boolean).join('; '),
    userAgent: cloudflare.userAgent,
    createdAt: Date.now()
  };
}

async function getRutrackerSession(): Promise<RutrackerSession> {
  if (cachedSession) {
    return cachedSession;
  }

  sessionPromise ??= (async () => {
    const stored = await readCachedSession();
    if (stored) {
      return stored;
    }

    const created = await createRutrackerSession();
    await writeCachedSession(created);
    return created;
  })();
  try {
    cachedSession = await sessionPromise;
    return cachedSession;
  } finally {
    sessionPromise = undefined;
  }
}

export async function getRutrackerCookie(): Promise<string> {
  return (await getRutrackerSession()).cookie;
}

export async function fetchRutrackerAuthenticated(
  url: string | URL,
  init: {
    headers?: Record<string, string>;
  } = {}
) {
  const session = await getRutrackerSession();
  return fetch(url, {
    ...init,
    headers: {
      ...init.headers,
      cookie: session.cookie,
      'user-agent': session.userAgent
    },
    ...(proxyDispatcher ? { dispatcher: proxyDispatcher } : {})
  });
}

async function fetchRutrackerSearchHtml(query: string): Promise<RutrackerFetchResult> {
  const searchUrl = buildRutrackerSearchUrl(query);
  const response = await fetchRutrackerAuthenticated(searchUrl, {
    headers: {
      accept: 'text/html,application/xhtml+xml'
    }
  });
  const contentType = response.headers.get('content-type') ?? undefined;
  const html = decodeHtml(await response.arrayBuffer());
  const diagnostics = inspectRutrackerSearchHtml(html);
  const debug: RutrackerProviderDebug = {
    searchUrl,
    statusCode: response.status,
    contentType,
    htmlLength: html.length,
    ...diagnostics
  };

  if (config.rutrackerDebugSaveHtml) {
    await saveDebugHtml(html);
  }

  if (!response.ok) {
    throw new RutrackerSearchError(`RuTracker search failed with HTTP ${response.status}`, debug);
  }

  if (debug.looksLikeLoginPage) {
    cachedSession = undefined;
    throw new RutrackerSearchError('RuTracker returned a login page or credentials are not authenticated', debug);
  }

  return {
    html,
    debug
  };
}

function normalizeResults(html: string): TorrentResult[] {
  return parseRutrackerSearchHtml(html, config.rutrackerBaseUrl).map((result) => ({
    providerId: RUTRACKER_PROVIDER_ID,
    providerName: RUTRACKER_PROVIDER_NAME,
    title: result.title,
    guid: `${RUTRACKER_PROVIDER_ID}:${result.detailsUrl}`,
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

export async function searchRutracker(query: string): Promise<TorrentResult[]> {
  const { html } = await fetchRutrackerSearchHtml(query);
  return normalizeResults(html);
}

export async function debugSearchRutracker(query: string): Promise<{
  results: TorrentResult[];
  debug: RutrackerProviderDebug;
}> {
  const { html, debug } = await fetchRutrackerSearchHtml(query);
  return {
    results: normalizeResults(html),
    debug
  };
}
