import { describe, expect, it } from 'vitest';
import { buildCapsXml, buildSearchRssXml } from '../src/xml.js';

describe('Torznab XML generation', () => {
  it('builds capabilities XML with search support and categories', () => {
    const xml = buildCapsXml();

    expect(xml).toContain('<?xml version="1.0" encoding="UTF-8"?>');
    expect(xml).toContain('<caps>');
    expect(xml).toContain('<search available="yes" supportedParams="q" />');
    expect(xml).toContain('<category id="2000" name="Movies" />');
    expect(xml).toContain('<category id="5000" name="TV" />');
  });

  it('builds RSS XML with escaped torrent data and torznab attributes', () => {
    const xml = buildSearchRssXml(
      [
        {
          providerId: 'mock',
          providerName: 'Mock Provider',
          title: 'Movie & Show <Test>',
          guid: 'mock:test',
          detailsUrl: 'https://example.test/details/movie',
          commentsUrl: 'https://example.test/details/movie/comments',
          downloadUrl: 'https://example.test/download/movie.torrent',
          magnetUrl: 'magnet:?xt=urn:btih:abc&dn=Movie',
          pubDate: new Date('2026-05-01T12:00:00.000Z'),
          size: 123,
          seeders: 10,
          peers: 2,
          category: '2000'
        }
      ],
      'Movie & Show'
    );

    expect(xml).toContain('<rss version="2.0" xmlns:torznab="http://torznab.com/schemas/2015/feed">');
    expect(xml).toContain('<title>Movie &amp; Show &lt;Test&gt;</title>');
    expect(xml).toContain('<link>https://example.test/download/movie.torrent</link>');
    expect(xml).toContain('<comments>https://example.test/details/movie/comments</comments>');
    expect(xml).toContain('<enclosure url="https://example.test/download/movie.torrent" length="123" type="application/x-bittorrent" />');
    expect(xml).toContain('<torznab:attr name="seeders" value="10" />');
    expect(xml).toContain('<torznab:attr name="peers" value="2" />');
    expect(xml).toContain('<torznab:attr name="size" value="123" />');
    expect(xml).toContain('<torznab:attr name="category" value="2000" />');
    expect(xml).toContain('<torznab:attr name="magneturl" value="magnet:?xt=urn:btih:abc&amp;dn=Movie" />');
    expect(xml).toContain('<jackettindexer id="mock">Mock Provider</jackettindexer>');
  });

  it('falls back to details URL when download and magnet URLs are missing', () => {
    const xml = buildSearchRssXml([
      {
        providerId: 'mock',
        providerName: 'Mock Provider',
        title: 'Details only result',
        guid: 'mock:details-only',
        detailsUrl: 'https://example.test/details/only',
        pubDate: new Date('2026-05-03T09:15:00.000Z'),
        size: 456,
        seeders: 1,
        peers: 0,
        category: '5000'
      }
    ]);

    expect(xml).toContain('<link>https://example.test/details/only</link>');
    expect(xml).toContain('<comments>https://example.test/details/only</comments>');
    expect(xml).not.toContain('<enclosure ');
    expect(xml).not.toContain('name="magneturl"');
  });
});
