import type { TorrentResult } from './mockProvider.js';

export type JackettJsonResult = {
  Tracker: string;
  TrackerId: string;
  Category: number[];
  Title: string;
  Guid: string;
  Link: string;
  Details: string;
  Comments: string;
  PublishDate: string;
  Size: number;
  Files: number;
  Grabs: number;
  Description: string;
  RageID: null;
  TVDBId: null;
  Imdb: null;
  TMDb: null;
  Seeders: number;
  Peers: number;
  MagnetUri: string | null;
  MinimumRatio: number;
  MinimumSeedTime: number;
  DownloadVolumeFactor: number;
  UploadVolumeFactor: number;
  Gain: number;
};

export type JackettJsonIndexer = {
  ID: string;
  Name: string;
  Status: number;
  Results: number;
  Error: string | null;
};

function parseCategory(category: string): number {
  const parsed = Number(category);
  return Number.isFinite(parsed) ? parsed : 0;
}

export function validDateOrNow(value?: Date): Date {
  if (value && Number.isFinite(value.getTime()) && value.getTime() > 0) {
    return value;
  }

  return new Date();
}

export function toJackettJsonResult(result: TorrentResult): JackettJsonResult {
  const link = result.proxiedDownloadUrl ?? result.downloadUrl ?? result.detailsUrl;
  const comments = result.detailsUrl;

  return {
    Tracker: result.providerName,
    TrackerId: result.providerId,
    Category: [parseCategory(result.category)],
    Title: result.title,
    Guid: result.guid || `${result.providerId}:${result.detailsUrl || result.title}`,
    Link: link,
    Details: result.detailsUrl,
    Comments: comments,
    PublishDate: validDateOrNow(result.pubDate).toISOString(),
    Size: result.size ?? 0,
    Files: 1,
    Grabs: 0,
    Description: result.title,
    RageID: null,
    TVDBId: null,
    Imdb: null,
    TMDb: null,
    Seeders: result.seeders ?? 0,
    Peers: result.peers ?? 0,
    MagnetUri: result.magnetUrl ?? null,
    MinimumRatio: 1,
    MinimumSeedTime: 0,
    DownloadVolumeFactor: 0,
    UploadVolumeFactor: 1,
    Gain: 0
  };
}
