import { afterEach, describe, expect, it } from 'vitest';
import { buildServer } from '../src/server.js';
import type { TorrentResult } from '../src/mockProvider.js';

const tolokaResults: TorrentResult[] = [
  {
    providerId: 'toloka',
    providerName: 'Toloka',
    title: 'Avatar 2009 1080p',
    guid: 'toloka:https://toloka.to/t1',
    detailsUrl: 'https://toloka.to/t1',
    downloadUrl: 'http://localhost:9118/download/toloka/1.torrent?apikey=test',
    downloadId: '1',
    originalDownloadUrl: 'https://toloka.to/download.php?id=1',
    proxiedDownloadUrl: 'http://localhost:9118/download/toloka/1.torrent?apikey=test',
    pubDate: new Date('2026-05-01T12:00:00.000Z'),
    size: 123456789,
    seeders: 10,
    peers: 12,
    category: '2000'
  }
];

const mockResults: TorrentResult[] = [
  {
    providerId: 'mock',
    providerName: 'Mock Provider',
    title: 'Mock Avatar',
    guid: 'mock:avatar',
    detailsUrl: 'https://example.test/mock/avatar',
    pubDate: new Date('2026-05-02T12:00:00.000Z'),
    size: 100,
    seeders: 1,
    peers: 2,
    category: '2000'
  }
];

const rutrackerResults: TorrentResult[] = [
  {
    providerId: 'rutracker',
    providerName: 'RuTracker',
    title: 'RuTracker Avatar',
    guid: 'rutracker:https://rutracker.net/forum/viewtopic.php?t=1',
    detailsUrl: 'https://rutracker.net/forum/viewtopic.php?t=1',
    downloadUrl: 'http://localhost:9118/download/rutracker/1.torrent?apikey=test',
    downloadId: '1',
    originalDownloadUrl: 'https://rutracker.net/forum/dl.php?t=1',
    proxiedDownloadUrl: 'http://localhost:9118/download/rutracker/1.torrent?apikey=test',
    pubDate: new Date('2026-05-03T12:00:00.000Z'),
    size: 200,
    seeders: 3,
    peers: 4,
    category: '2000'
  }
];

const rutorResults: TorrentResult[] = [
  {
    providerId: 'rutor',
    providerName: 'Rutor',
    title: 'Rutor Avatar',
    guid: 'rutor:https://rutor.info/torrent/2/avatar',
    detailsUrl: 'https://rutor.info/torrent/2/avatar',
    downloadUrl: 'http://localhost:9118/download/rutor/2.torrent?apikey=test',
    downloadId: '2',
    originalDownloadUrl: 'https://d.rutor.info/download/2',
    proxiedDownloadUrl: 'http://localhost:9118/download/rutor/2.torrent?apikey=test',
    magnetUrl: 'magnet:?xt=urn:btih:2222222222222222222222222222222222222222&dn=rutor.info',
    pubDate: new Date('2026-05-04T12:00:00.000Z'),
    size: 300,
    seeders: 5,
    peers: 6,
    category: '2000'
  }
];

describe('server routes', () => {
  const apps: Awaited<ReturnType<typeof buildServer>>[] = [];

  afterEach(async () => {
    await Promise.all(apps.map((app) => app.close()));
    apps.length = 0;
  });

  async function appWithProviders() {
    const app = await buildServer({
      providerSearchers: {
        toloka: () => tolokaResults,
        rutracker: () => rutrackerResults,
        rutor: () => rutorResults,
        mock: () => mockResults
      }
    });
    apps.push(app);
    return app;
  }

  it('returns Jackett-compatible JSON results for status:healthy with Query', async () => {
    const app = await appWithProviders();
    const response = await app.inject('/api/v2.0/indexers/status:healthy/results?apikey=test&Query=avatar');
    const body = JSON.parse(response.body);

    expect(response.statusCode).toBe(200);
    expect(body.Results).toHaveLength(3);
    expect(body.Results[0]).toMatchObject({
      Tracker: 'Toloka',
      TrackerId: 'toloka',
      Title: 'Avatar 2009 1080p',
      Link: 'http://localhost:9118/download/toloka/1.torrent?apikey=test',
      Details: 'https://toloka.to/t1',
      Comments: 'https://toloka.to/t1',
      PublishDate: '2026-05-01T12:00:00.000Z',
      Seeders: 10,
      Peers: 12,
      MagnetUri: null
    });
    expect(body.Indexers).toEqual([
      {
        ID: 'toloka',
        Name: 'Toloka',
        Status: 2,
        Results: 1,
        Error: null
      },
      {
        ID: 'rutracker',
        Name: 'RuTracker',
        Status: 2,
        Results: 1,
        Error: null
      },
      {
        ID: 'rutor',
        Name: 'Rutor',
        Status: 2,
        Results: 1,
        Error: null
      }
    ]);
  });

  it('returns empty JSON results when no search query is provided', async () => {
    const app = await appWithProviders();
    const response = await app.inject('/api/v2.0/indexers/status:healthy/results?apikey=test');
    const body = JSON.parse(response.body);

    expect(response.statusCode).toBe(200);
    expect(body.Results).toEqual([]);
    expect(body.Indexers[0]).toMatchObject({
      ID: 'toloka',
      Results: 0
    });
  });

  it('falls back to a current publish date instead of Unix epoch', async () => {
    const app = await buildServer({
      providerSearchers: {
        toloka: () => [
          {
            providerId: 'toloka',
            providerName: 'Toloka',
            title: 'No Date',
            guid: 'toloka:no-date',
            detailsUrl: 'https://toloka.to/t2',
            size: 1,
            seeders: 1,
            peers: 1,
            category: '2000'
          }
        ],
        rutracker: () => [],
        rutor: () => [],
        mock: () => []
      }
    });
    apps.push(app);

    const response = await app.inject('/api/v2.0/indexers/status:healthy/results?apikey=test&Query=no-date');
    const body = JSON.parse(response.body);

    expect(response.statusCode).toBe(200);
    expect(body.Results[0].PublishDate).not.toBe('1970-01-01T00:00:00.000Z');
  });

  it('marks Lampa serial JSON searches as TV category', async () => {
    const app = await appWithProviders();
    const response = await app.inject(
      '/api/v2.0/indexers/rutracker/results?apikey=test&Query=avatar&is_serial=true'
    );
    const body = JSON.parse(response.body);

    expect(response.statusCode).toBe(200);
    expect(body.Results[0]).toMatchObject({
      TrackerId: 'rutracker',
      Category: [5000]
    });
  });

  it('preserves requested Lampa TV category on JSON results', async () => {
    const app = await appWithProviders();
    const response = await app.inject(
      '/api/v2.0/indexers/rutracker/results?apikey=test&Query=avatar&Category[]=5030'
    );
    const body = JSON.parse(response.body);

    expect(response.statusCode).toBe(200);
    expect(body.Results[0]).toMatchObject({
      TrackerId: 'rutracker',
      Category: [5030]
    });
  });

  it('prefers an explicit movie category over an incorrect is_serial flag', async () => {
    const app = await appWithProviders();
    const response = await app.inject(
      '/api/v2.0/indexers/rutracker/results?apikey=test&Query=avatar&is_serial=1&Category[]=2000'
    );
    const body = JSON.parse(response.body);

    expect(response.statusCode).toBe(200);
    expect(body.Results[0]).toMatchObject({
      TrackerId: 'rutracker',
      Category: [2000]
    });
  });

  it('uses Toloka provider when filter is toloka', async () => {
    const app = await appWithProviders();
    const response = await app.inject('/api/v2.0/indexers/toloka/results?apikey=test&Query=avatar&providers=mock');
    const body = JSON.parse(response.body);

    expect(response.statusCode).toBe(200);
    expect(body.Results[0].TrackerId).toBe('toloka');
    expect(body.Indexers[0].ID).toBe('toloka');
  });

  it('uses Rutor provider when filter is rutor', async () => {
    const app = await appWithProviders();
    const response = await app.inject('/api/v2.0/indexers/rutor/results?apikey=test&Query=avatar&providers=mock');
    const body = JSON.parse(response.body);

    expect(response.statusCode).toBe(200);
    expect(body.Results[0]).toMatchObject({
      TrackerId: 'rutor',
      Link: 'http://localhost:9118/download/rutor/2.torrent?apikey=test',
      MagnetUri: 'magnet:?xt=urn:btih:2222222222222222222222222222222222222222&dn=rutor.info'
    });
    expect(body.Indexers[0].ID).toBe('rutor');
  });

  it('keeps Torznab endpoint working', async () => {
    const app = await appWithProviders();
    const response = await app.inject(
      '/api/v2.0/indexers/all/results/torznab/api?t=search&q=avatar&apikey=test&providers=mock'
    );

    expect(response.statusCode).toBe(200);
    expect(response.headers['content-type']).toContain('application/xml');
    expect(response.body).toContain('<rss version="2.0" xmlns:torznab="http://torznab.com/schemas/2015/feed">');
  });
});
