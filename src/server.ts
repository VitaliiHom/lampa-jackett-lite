import cors from '@fastify/cors';
import Fastify from 'fastify';
import { config } from './config.js';
import { toJackettJsonResult, validDateOrNow, type JackettJsonIndexer } from './jackettJson.js';
import type { TorrentResult } from './mockProvider.js';
import { searchMockTorrents } from './mockProvider.js';
import {
  buildRutrackerDownloadUrl,
  buildRutrackerSearchUrl,
  debugSearchRutracker,
  fetchRutrackerAuthenticated,
  RutrackerSearchError,
  searchRutracker,
  type RutrackerProviderDebug
} from './providers/rutracker/index.js';
import {
  buildRutorDownloadUrl,
  buildRutorSearchUrl,
  debugSearchRutor,
  RutorSearchError,
  searchRutor,
  type RutorProviderDebug
} from './providers/rutor/index.js';
import {
  buildSearchUrl,
  buildTolokaDownloadUrl,
  debugSearchToloka,
  searchToloka,
  TolokaSearchError,
  type TolokaProviderDebug
} from './providers/toloka/index.js';
import { buildCapsXml, buildSearchRssXml } from './xml.js';
import { fetch } from 'undici';

type ProviderId = 'mock' | 'toloka' | 'rutracker' | 'rutor';
type ProviderSearchers = Record<ProviderId, (query: string) => Promise<TorrentResult[]> | TorrentResult[]>;

const defaultProviders: ProviderId[] = ['toloka', 'rutracker', 'rutor'];
const providerNames: Record<ProviderId, string> = {
  mock: 'Mock Provider',
  toloka: 'Toloka',
  rutracker: 'RuTracker',
  rutor: 'Rutor'
};

type ProviderSearchResult = {
  providers: ProviderId[];
  results: TorrentResult[];
  errors: Array<{
    provider: ProviderId;
    message: string;
  }>;
  providerDebug?: {
    toloka?: TolokaProviderDebug;
    rutracker?: RutrackerProviderDebug;
    rutor?: RutorProviderDebug;
  };
};

type ProviderSearchTaskResult = {
  provider: ProviderId;
  results: TorrentResult[];
  debug?: TolokaProviderDebug | RutrackerProviderDebug | RutorProviderDebug;
};

function parseProviders(value?: string): ProviderId[] {
  if (!value) {
    return defaultProviders;
  }

  const providers = value
    .split(',')
    .map((provider) => provider.trim().toLowerCase())
    .filter(
      (provider): provider is ProviderId =>
        provider === 'mock' || provider === 'toloka' || provider === 'rutracker' || provider === 'rutor'
    );

  return providers.length > 0 ? providers : defaultProviders;
}

function resolveProviders(filter: string, providersParam?: string): ProviderId[] {
  if (filter === 'toloka' || filter === 'mock' || filter === 'rutracker' || filter === 'rutor') {
    return [filter];
  }

  if (providersParam) {
    return parseProviders(providersParam);
  }

  return defaultProviders;
}

function firstQueryValue(value: unknown): string | undefined {
  if (Array.isArray(value)) {
    return firstQueryValue(value[0]);
  }

  if (typeof value === 'string' && value.trim()) {
    return value;
  }

  return undefined;
}

function queryValues(value: unknown): string[] {
  if (Array.isArray(value)) {
    return value.flatMap(queryValues);
  }

  if (typeof value === 'string') {
    return [value];
  }

  return [];
}

function pickLampaSearchQuery(query: Record<string, unknown>): string {
  return (
    firstQueryValue(query.Query) ??
    firstQueryValue(query.query) ??
    firstQueryValue(query.q) ??
    firstQueryValue(query.title) ??
    firstQueryValue(query.title_original) ??
    ''
  );
}

function extractCategories(query: Record<string, unknown>): string[] {
  return [...queryValues(query['Category[]']), ...queryValues(query.Category)];
}

function isTruthyQueryValue(value?: string): boolean {
  if (!value) {
    return false;
  }

  const normalized = value.trim().toLowerCase();
  return normalized === '1' || normalized === 'true' || normalized === 'yes';
}

function resolveResultCategory(query: Record<string, unknown>, categories: string[]): string | undefined {
  const requestedCategory = categories.find((category) => {
    const parsed = Number(category);
    return Number.isFinite(parsed) && parsed > 0;
  });
  if (requestedCategory) {
    return requestedCategory;
  }

  if (isTruthyQueryValue(firstQueryValue(query.is_serial))) {
    return '5000';
  }

  return undefined;
}

function sanitizeMessage(error: unknown): string {
  if (error instanceof Error) {
    return error.message;
  }

  return 'Unknown provider error';
}

function sanitizeQuery(query: Record<string, unknown>): Record<string, unknown> {
  return Object.fromEntries(
    Object.entries(query).map(([key, value]) => {
      if (key.toLowerCase() === 'apikey') {
        return [key, value ? '***' : value];
      }

      return [key, value];
    })
  );
}

function sanitizeUrl(rawUrl: string): string {
  const url = new URL(rawUrl, 'http://localhost');
  if (url.searchParams.has('apikey')) {
    url.searchParams.set('apikey', '***');
  }

  return `${url.pathname}${url.search}`;
}

function toDebugResult(result: TorrentResult) {
  return {
    providerId: result.providerId,
    providerName: result.providerName,
    title: result.title,
    guid: result.guid,
    detailsUrl: result.detailsUrl,
    commentsUrl: result.commentsUrl,
    downloadUrl: result.downloadUrl,
    downloadId: result.downloadId,
    originalDownloadUrl: result.originalDownloadUrl,
    proxiedDownloadUrl: result.proxiedDownloadUrl,
    publishDate: validDateOrNow(result.pubDate).toISOString(),
    size: result.size,
    seeders: result.seeders,
    peers: result.peers,
    category: result.category
  };
}

async function searchProviders(
  providers: ProviderId[],
  query: string,
  log: ReturnType<ReturnType<typeof Fastify>['log']['child']>,
  providerSearchers: ProviderSearchers,
  options: {
    debug?: boolean;
  } = {}
): Promise<ProviderSearchResult> {
  const searches = providers.map(async (provider): Promise<ProviderSearchTaskResult> => {
    if (options.debug && provider === 'toloka') {
      const toloka = await debugSearchToloka(query);
      return {
        provider,
        results: toloka.results,
        debug: toloka.debug
      };
    }

    if (options.debug && provider === 'rutracker') {
      const rutracker = await debugSearchRutracker(query);
      return {
        provider,
        results: rutracker.results,
        debug: rutracker.debug
      };
    }

    if (options.debug && provider === 'rutor') {
      const rutor = await debugSearchRutor(query);
      return {
        provider,
        results: rutor.results,
        debug: rutor.debug
      };
    }

    if (provider === 'toloka') {
      return {
        provider,
        results: await providerSearchers.toloka(query)
      };
    }

    if (provider === 'rutracker') {
      return {
        provider,
        results: await providerSearchers.rutracker(query)
      };
    }

    if (provider === 'rutor') {
      return {
        provider,
        results: await providerSearchers.rutor(query)
      };
    }

    return {
      provider,
      results: await providerSearchers.mock(query)
    };
  });

  const settledResults = await Promise.allSettled(searches);
  const results: TorrentResult[] = [];
  const errors: ProviderSearchResult['errors'] = [];
  const providerDebug: ProviderSearchResult['providerDebug'] = {};

  await Promise.all(
    settledResults.map(async (settledResult, index) => {
    const provider = providers[index];
    if (settledResult.status === 'fulfilled') {
      results.push(...settledResult.value.results);
      if (settledResult.value.debug && settledResult.value.provider === 'toloka') {
        providerDebug.toloka = settledResult.value.debug;
      }
      if (settledResult.value.debug && settledResult.value.provider === 'rutracker') {
        providerDebug.rutracker = settledResult.value.debug;
      }
      if (settledResult.value.debug && settledResult.value.provider === 'rutor') {
        providerDebug.rutor = settledResult.value.debug;
      }
      return;
    }

    const message = sanitizeMessage(settledResult.reason);
    errors.push({
      provider,
      message
    });
    log.error(
      {
        err: settledResult.reason,
        provider
      },
      'provider search failed'
    );

      if (options.debug && provider === 'toloka' && settledResult.reason instanceof TolokaSearchError) {
        providerDebug.toloka = settledResult.reason.debug;
      } else if (options.debug && provider === 'toloka') {
        providerDebug.toloka = {
          searchUrl: buildSearchUrl(query),
          parserStrategy: 'toloka.forumline.tr.a.topictitle.v1'
        };
      } else if (options.debug && provider === 'rutracker' && settledResult.reason instanceof RutrackerSearchError) {
        providerDebug.rutracker = settledResult.reason.debug;
      } else if (options.debug && provider === 'rutracker') {
        providerDebug.rutracker = {
          searchUrl: buildRutrackerSearchUrl(query),
          parserStrategy: 'rutracker.tr.a.tLink-data-topic-id.v1'
        };
      } else if (options.debug && provider === 'rutor' && settledResult.reason instanceof RutorSearchError) {
        providerDebug.rutor = settledResult.reason.debug;
      } else if (options.debug && provider === 'rutor') {
        providerDebug.rutor = {
          searchUrl: buildRutorSearchUrl(query),
          parserStrategy: 'rutor.index-table.tr-gai-tum.v1'
        };
      }
    })
  );

  return {
    providers,
    results,
    errors,
    providerDebug: Object.keys(providerDebug).length > 0 ? providerDebug : undefined
  };
}

function buildIndexers(providers: ProviderId[], search: ProviderSearchResult): JackettJsonIndexer[] {
  return providers.map((provider) => {
    const error = search.errors.find((providerError) => providerError.provider === provider);
    const count = search.results.filter((result) => result.providerId === provider).length;

    return {
      ID: provider,
      Name: providerNames[provider],
      Status: error ? 3 : 2,
      Results: count,
      Error: error?.message ?? null
    };
  });
}

export async function buildServer(options: { providerSearchers?: Partial<ProviderSearchers> } = {}) {
  const providerSearchers: ProviderSearchers = {
    mock: searchMockTorrents,
    toloka: searchToloka,
    rutracker: searchRutracker,
    rutor: searchRutor,
    ...options.providerSearchers
  };

  const app = Fastify({
    disableRequestLogging: true,
    logger: true
  });

  await app.register(cors, {
    origin: true,
    methods: ['GET', 'OPTIONS']
  });

  app.addHook('onResponse', async (request, reply) => {
    request.log.info(
      {
        method: request.method,
        url: sanitizeUrl(request.url),
        query: sanitizeQuery(request.query as Record<string, unknown>),
        userAgent: request.headers['user-agent'],
        statusCode: reply.statusCode,
        responseTime: reply.elapsedTime
      },
      'request completed'
    );
  });

  app.get('/', async () => {
    return {
      name: 'lampa-jackett-lite',
      status: 'ok'
    };
  });

  app.get('/health', async () => {
    return {
      status: 'ok'
    };
  });

  app.get('/debug/search', async (request) => {
    const query = request.query as {
      q?: string;
      providers?: string;
      debug?: string;
    };
    const providers = parseProviders(query.providers);
    const debug = query.debug === '1';
    const search = await searchProviders(providers, query.q ?? '', request.log, providerSearchers, { debug });

    return {
      query: query.q ?? '',
      providers: search.providers,
      results: search.results.map(toDebugResult),
      errors: search.errors,
      ...(debug && search.providerDebug ? { providerDebug: search.providerDebug } : {})
    };
  });

  app.get('/download/toloka/:id.torrent', async (request, reply) => {
    const params = request.params as {
      id: string;
    };
    const query = request.query as {
      apikey?: string;
    };

    if (config.apiKey && query.apikey !== config.apiKey) {
      reply.code(401);
      return {
        error: 'Invalid API key'
      };
    }

    if (!config.tolokaCookie?.trim()) {
      reply.code(500);
      return {
        error: 'TOLOKA_COOKIE is not configured'
      };
    }

    const response = await fetch(buildTolokaDownloadUrl(params.id), {
      headers: {
        accept: 'application/x-bittorrent,application/octet-stream,*/*',
        cookie: config.tolokaCookie,
        'user-agent':
          'Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/124.0 Safari/537.36'
      }
    });
    const contentType = response.headers.get('content-type') ?? '';
    const buffer = Buffer.from(await response.arrayBuffer());
    const looksLikeHtml =
      contentType.toLowerCase().includes('text/html') ||
      buffer.subarray(0, 256).toString('utf8').toLowerCase().includes('<html');

    if (!response.ok || looksLikeHtml) {
      request.log.error(
        {
          provider: 'toloka',
          statusCode: response.status,
          contentType,
          downloadId: params.id
        },
        'Toloka torrent proxy failed'
      );
      reply.code(502);
      return {
        error: 'Toloka returned HTML/login page or torrent download failed'
      };
    }

    reply
      .header('content-type', 'application/x-bittorrent')
      .header('content-disposition', `attachment; filename="toloka-${params.id}.torrent"`)
      .header('cache-control', 'no-store');

    return buffer;
  });

  app.get('/download/rutracker/:id.torrent', async (request, reply) => {
    const params = request.params as {
      id: string;
    };
    const query = request.query as {
      apikey?: string;
    };

    if (config.apiKey && query.apikey !== config.apiKey) {
      reply.code(401);
      return {
        error: 'Invalid API key'
      };
    }

    const response = await fetchRutrackerAuthenticated(buildRutrackerDownloadUrl(params.id), {
      headers: {
        accept: 'application/x-bittorrent,application/octet-stream,*/*'
      }
    });
    const contentType = response.headers.get('content-type') ?? '';
    const buffer = Buffer.from(await response.arrayBuffer());
    const looksLikeHtml =
      contentType.toLowerCase().includes('text/html') ||
      buffer.subarray(0, 256).toString('utf8').toLowerCase().includes('<html');

    if (!response.ok || looksLikeHtml) {
      request.log.error(
        {
          provider: 'rutracker',
          statusCode: response.status,
          contentType,
          downloadId: params.id
        },
        'RuTracker torrent proxy failed'
      );
      reply.code(502);
      return {
        error: 'RuTracker returned HTML/login page or torrent download failed'
      };
    }

    reply
      .header('content-type', 'application/x-bittorrent')
      .header('content-disposition', `attachment; filename="rutracker-${params.id}.torrent"`)
      .header('cache-control', 'no-store');

    return buffer;
  });

  app.get('/download/rutor/:id.torrent', async (request, reply) => {
    const params = request.params as {
      id: string;
    };
    const query = request.query as {
      apikey?: string;
    };

    if (config.apiKey && query.apikey !== config.apiKey) {
      reply.code(401);
      return {
        error: 'Invalid API key'
      };
    }

    const response = await fetch(buildRutorDownloadUrl(params.id), {
      headers: {
        accept: 'application/x-bittorrent,application/octet-stream,*/*',
        'user-agent':
          'Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/124.0 Safari/537.36'
      }
    });
    const contentType = response.headers.get('content-type') ?? '';
    const buffer = Buffer.from(await response.arrayBuffer());
    const looksLikeHtml =
      contentType.toLowerCase().includes('text/html') ||
      buffer.subarray(0, 256).toString('utf8').toLowerCase().includes('<html');

    if (!response.ok || looksLikeHtml) {
      request.log.error(
        {
          provider: 'rutor',
          statusCode: response.status,
          contentType,
          downloadId: params.id
        },
        'Rutor torrent proxy failed'
      );
      reply.code(502);
      return {
        error: 'Rutor returned HTML page or torrent download failed'
      };
    }

    reply
      .header('content-type', 'application/x-bittorrent')
      .header('content-disposition', `attachment; filename="rutor-${params.id}.torrent"`)
      .header('cache-control', 'no-store');

    return buffer;
  });

  app.get('/api/v2.0/indexers/all/results/torznab/api', async (request, reply) => {
    const query = request.query as {
      t?: string;
      q?: string;
      apikey?: string;
      providers?: string;
    };

    reply.header('content-type', 'application/xml; charset=utf-8');

    if (query.apikey && query.apikey !== config.apiKey) {
      reply.code(401);
      return buildSearchRssXml([], query.q);
    }

    if (query.t === 'caps') {
      return buildCapsXml();
    }

    if (query.t === 'search' || query.t === 'movie' || query.t === 'tvsearch') {
      if (!query.q) {
        return buildSearchRssXml([], query.q);
      }

      const providers = parseProviders(query.providers);
      const search = await searchProviders(providers, query.q, request.log, providerSearchers);

      return buildSearchRssXml(search.results, query.q);
    }

    reply.code(400);
    return buildSearchRssXml([]);
  });

  app.get('/api/v2.0/indexers/:filter/results', async (request, reply) => {
    const params = request.params as {
      filter: string;
    };
    const query = request.query as Record<string, unknown>;
    const searchQuery = pickLampaSearchQuery(query);
    const providers = resolveProviders(params.filter, firstQueryValue(query.providers));
    const categories = extractCategories(query);
    const resultCategory = resolveResultCategory(query, categories);

    reply.header('content-type', 'application/json; charset=utf-8');

    if (firstQueryValue(query.apikey) && firstQueryValue(query.apikey) !== config.apiKey) {
      request.log.warn({ filter: params.filter }, 'Jackett JSON endpoint received invalid apikey');
    }

    if (!searchQuery) {
      request.log.info(
        {
          filter: params.filter,
          searchQuery,
          title: firstQueryValue(query.title),
          title_original: firstQueryValue(query.title_original),
          year: firstQueryValue(query.year),
          is_serial: firstQueryValue(query.is_serial),
          categories,
          resultsCount: 0
        },
        'Jackett JSON results endpoint used'
      );

      return {
        Results: [],
        Indexers: buildIndexers(providers, {
          providers,
          results: [],
          errors: []
        })
      };
    }

    const search = await searchProviders(providers, searchQuery, request.log, providerSearchers);
    request.log.info(
      {
        filter: params.filter,
        searchQuery,
        title: firstQueryValue(query.title),
        title_original: firstQueryValue(query.title_original),
        year: firstQueryValue(query.year),
        is_serial: firstQueryValue(query.is_serial),
        categories,
        resultsCount: search.results.length
      },
      'Jackett JSON results endpoint used'
    );

    return {
      Results: search.results.map((result) => toJackettJsonResult(result, { category: resultCategory })),
      Indexers: buildIndexers(providers, search)
    };
  });

  return app;
}
