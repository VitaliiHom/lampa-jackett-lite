export type TorrentResult = {
  providerId: string;
  providerName: string;
  title: string;
  guid: string;
  detailsUrl: string;
  commentsUrl?: string;
  downloadUrl?: string;
  downloadId?: string;
  originalDownloadUrl?: string;
  proxiedDownloadUrl?: string;
  magnetUrl?: string;
  pubDate?: Date;
  size?: number;
  seeders?: number;
  peers?: number;
  category: string;
};

const mockResults: TorrentResult[] = [
  {
    providerId: 'mock',
    providerName: 'Mock Provider',
    title: 'Ubuntu 24.04.2 Desktop amd64 ISO',
    guid: 'mock:ubuntu:24.04.2:desktop:amd64',
    detailsUrl: 'https://example.test/mock/ubuntu-24-04-2-desktop-amd64',
    commentsUrl: 'https://example.test/mock/ubuntu-24-04-2-desktop-amd64/comments',
    downloadUrl: 'https://example.test/download/ubuntu-24-04-2-desktop-amd64.torrent',
    magnetUrl: 'magnet:?xt=urn:btih:1111111111111111111111111111111111111111&dn=Ubuntu+24.04.2+Desktop+amd64+ISO',
    pubDate: new Date('2026-05-01T12:00:00.000Z'),
    size: 6_268_723_200,
    seeders: 1842,
    peers: 219,
    category: '2000'
  },
  {
    providerId: 'mock',
    providerName: 'Mock Provider',
    title: 'Big Buck Bunny 2008 1080p BluRay x264',
    guid: 'mock:big-buck-bunny:2008:1080p',
    detailsUrl: 'https://example.test/mock/big-buck-bunny-2008-1080p',
    commentsUrl: 'https://example.test/mock/big-buck-bunny-2008-1080p/comments',
    magnetUrl: 'magnet:?xt=urn:btih:2222222222222222222222222222222222222222&dn=Big+Buck+Bunny+2008+1080p',
    pubDate: new Date('2026-05-02T18:30:00.000Z'),
    size: 1_879_048_192,
    seeders: 376,
    peers: 42,
    category: '2000'
  },
  {
    providerId: 'mock',
    providerName: 'Mock Provider',
    title: 'Mock Linux Tutorial S01E01 720p WEB',
    guid: 'mock:linux-tutorial:s01e01:720p',
    detailsUrl: 'https://example.test/mock/linux-tutorial-s01e01-720p',
    pubDate: new Date('2026-05-03T09:15:00.000Z'),
    size: 812_646_400,
    seeders: 91,
    peers: 12,
    category: '5000'
  }
];

export function searchMockTorrents(query?: string): TorrentResult[] {
  if (!query) {
    return mockResults;
  }

  const normalizedQuery = query.toLowerCase();
  return mockResults.filter((result) => result.title.toLowerCase().includes(normalizedQuery));
}
