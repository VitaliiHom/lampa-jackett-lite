import type { TorrentResult } from './mockProvider.js';
import { validDateOrNow } from './jackettJson.js';

function escapeXml(value: string): string {
  return value
    .replaceAll('&', '&amp;')
    .replaceAll('<', '&lt;')
    .replaceAll('>', '&gt;')
    .replaceAll('"', '&quot;')
    .replaceAll("'", '&apos;');
}

export function buildCapsXml(): string {
  return `<?xml version="1.0" encoding="UTF-8"?>
<caps>
  <server title="lampa-jackett-lite" version="0.1.0" />
  <limits max="100" default="100" />
  <searching>
    <search available="yes" supportedParams="q" />
  </searching>
  <categories>
    <category id="2000" name="Movies" />
    <category id="5000" name="TV" />
  </categories>
</caps>`;
}

export function buildSearchRssXml(results: TorrentResult[], query?: string): string {
  const title = query ? `Search results for ${query}` : 'Search results';
  const items = results
    .map((result) => {
      const commentsUrl = result.commentsUrl ?? result.detailsUrl;
      const downloadUrl = result.proxiedDownloadUrl ?? result.downloadUrl;
      const itemUrl = downloadUrl ?? result.detailsUrl;
      const pubDate = validDateOrNow(result.pubDate);
      const size = result.size ?? 0;
      const seeders = result.seeders ?? 0;
      const peers = result.peers ?? 0;
      const sizeElement = result.size === undefined ? '' : `\n      <size>${size}</size>`;
      const enclosureElement = downloadUrl
        ? `\n      <enclosure url="${escapeXml(downloadUrl)}" length="${size}" type="application/x-bittorrent" />`
        : '';
      const magnetAttr = result.magnetUrl
        ? `\n      <torznab:attr name="magneturl" value="${escapeXml(result.magnetUrl)}" />`
        : '';

      return `    <item>
      <title>${escapeXml(result.title)}</title>
      <guid isPermaLink="false">${escapeXml(result.guid)}</guid>
      <link>${escapeXml(itemUrl)}</link>
      <comments>${escapeXml(commentsUrl)}</comments>
      <pubDate>${pubDate.toUTCString()}</pubDate>
      <category>${escapeXml(result.category)}</category>${sizeElement}${enclosureElement}
      <torznab:attr name="seeders" value="${seeders}" />
      <torznab:attr name="peers" value="${peers}" />
      <torznab:attr name="size" value="${size}" />
      <torznab:attr name="category" value="${escapeXml(result.category)}" />${magnetAttr}
      <torznab:attr name="downloadvolumefactor" value="0" />
      <torznab:attr name="uploadvolumefactor" value="1" />
      <jackettindexer id="${escapeXml(result.providerId)}">${escapeXml(result.providerName)}</jackettindexer>
    </item>`;
    })
    .join('\n');

  return `<?xml version="1.0" encoding="UTF-8"?>
<rss version="2.0" xmlns:torznab="http://torznab.com/schemas/2015/feed">
  <channel>
    <title>${escapeXml(title)}</title>
    <description>Mock Torznab feed from lampa-jackett-lite</description>
    <link>http://localhost:9118/</link>
${items}
  </channel>
</rss>`;
}
