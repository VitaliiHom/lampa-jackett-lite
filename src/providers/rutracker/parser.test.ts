import { readFileSync } from 'node:fs';
import { describe, expect, it } from 'vitest';
import { inspectRutrackerSearchHtml, parseRutrackerSearchHtml, parseRutrackerSize } from './parser.js';

const fixture = readFileSync(new URL('./fixtures/search.html', import.meta.url), 'utf8');

describe('RuTracker parser', () => {
  it('parses search result rows', () => {
    const results = parseRutrackerSearchHtml(fixture);

    expect(results).toHaveLength(1);
    expect(results[0]).toMatchObject({
      title: 'Аватар: Пламя и Пепел / Avatar: Fire and Ash (2025) WEB-DL 2160p',
      detailsUrl: 'https://rutracker.net/forum/viewtopic.php?t=6838754',
      downloadId: '6838754',
      downloadUrl: 'https://rutracker.net/forum/dl.php?t=6838754',
      seeders: 676,
      peers: 101
    });
    expect(results[0]?.size).toBe(44_270_375_404);
    expect(results[0]?.publishedAt?.toISOString()).toBe('2026-04-17T00:00:00.000Z');
  });

  it('parses sizes and diagnostics', () => {
    expect(parseRutrackerSize('1.5 GB')).toBe(1_610_612_736);
    expect(inspectRutrackerSearchHtml(fixture)).toMatchObject({
      looksLikeLoginPage: false,
      resultCandidatesCount: 1,
      topicLinksCount: 1
    });
  });
});
