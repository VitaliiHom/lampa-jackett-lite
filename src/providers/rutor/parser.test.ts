import { readFileSync } from 'node:fs';
import { describe, expect, it } from 'vitest';
import { inspectRutorSearchHtml, parseRutorSearchHtml, parseRutorSize } from './parser.js';

const fixture = readFileSync(new URL('./fixtures/search.html', import.meta.url), 'utf8');

describe('Rutor parser', () => {
  it('parses search result rows from Rutor HTML', () => {
    const results = parseRutorSearchHtml(fixture);

    expect(results).toHaveLength(2);
    expect(results[0]).toMatchObject({
      title: 'µTorrent Pack v1.2.3.99 (2008-2024) PC | RePack',
      detailsUrl: 'https://rutor.info/torrent/593955/utorrent-pack',
      downloadId: '593955',
      downloadUrl: 'https://d.rutor.info/download/593955',
      magnetUrl: 'magnet:?xt=urn:btih:972fc523354247bab0498041810322067f6b2a3b&dn=rutor.info',
      seeders: 14,
      peers: 0
    });
    expect(results[0]?.size).toBe(21_349_007);
    expect(results[0]?.publishedAt?.toISOString()).toBe('2025-12-01T00:00:00.000Z');

    expect(results[1]).toMatchObject({
      title: 'Водоворот лжи / Le torrent (2022) BDRip-AVC',
      downloadId: '933671',
      seeders: 0,
      peers: 1
    });
  });

  it('parses sizes and diagnostics', () => {
    expect(parseRutorSize('1.5 GB')).toBe(1_610_612_736);
    expect(parseRutorSize('775 МБ')).toBe(812_646_400);
    expect(inspectRutorSearchHtml(fixture)).toMatchObject({
      looksLikeBlockedPage: false,
      resultCandidatesCount: 2,
      topicLinksCount: 2
    });
  });
});
