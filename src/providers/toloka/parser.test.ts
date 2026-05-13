import { readFileSync } from 'node:fs';
import { describe, expect, it } from 'vitest';
import { parseTolokaSearchHtml, parseTolokaSize } from './parser.js';

const fixture = readFileSync(new URL('./fixtures/search.html', import.meta.url), 'utf8');

describe('Toloka parser', () => {
  it('parses search result rows from Toloka tracker HTML', () => {
    const results = parseTolokaSearchHtml(fixture);

    expect(results).toHaveLength(2);
    expect(results[0]).toMatchObject({
      title: 'Ubuntu 24.04.2 Desktop amd64 ISO [Ukr/Eng]',
      detailsUrl: 'https://toloka.to/t123456',
      downloadId: '123456',
      downloadUrl: 'https://toloka.to/download.php?id=123456',
      seeders: 138,
      peers: 12
    });
    expect(results[0]?.size).toBe(6_270_652_252);
    expect(results[0]?.publishedAt?.toISOString()).toBe('2026-05-10T14:22:00.000Z');

    expect(results[1]).toMatchObject({
      title: 'Linux для людей S01E01 720p WEB-DL',
      detailsUrl: 'https://toloka.to/t654321',
      seeders: 22,
      peers: 5
    });
  });

  it('parses Ukrainian and English size units', () => {
    expect(parseTolokaSize('775 MB')).toBe(812_646_400);
    expect(parseTolokaSize('1,5 ГБ')).toBe(1_610_612_736);
  });
});
