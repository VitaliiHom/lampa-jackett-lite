import 'dotenv/config';

export const config = {
  port: Number(process.env.PORT ?? 9118),
  publicBaseUrl: process.env.PUBLIC_BASE_URL ?? `http://localhost:${process.env.PORT ?? 9118}`,
  apiKey: process.env.API_KEY ?? 'test',
  tolokaBaseUrl: process.env.TOLOKA_BASE_URL ?? 'https://toloka.to',
  tolokaCookie: process.env.TOLOKA_COOKIE,
  tolokaUsername: process.env.TOLOKA_USERNAME,
  tolokaPassword: process.env.TOLOKA_PASSWORD,
  tolokaDebugSaveHtml: process.env.TOLOKA_DEBUG_SAVE_HTML === 'true',
  rutrackerBaseUrl: process.env.RUTRACKER_BASE_URL ?? 'https://rutracker.net/forum',
  rutrackerUsername: process.env.RUTRACKER_USERNAME,
  rutrackerPassword: process.env.RUTRACKER_PASSWORD,
  rutrackerProxyUrl: process.env.RUTRACKER_PROXY_URL,
  flaresolverrUrl: process.env.FLARESOLVERR_URL,
  flaresolverrProxyUrl: process.env.FLARESOLVERR_PROXY_URL ?? process.env.RUTRACKER_PROXY_URL,
  rutrackerDebugSaveHtml: process.env.RUTRACKER_DEBUG_SAVE_HTML === 'true',
  rutorBaseUrl: process.env.RUTOR_BASE_URL ?? 'https://rutor.info',
  rutorDebugSaveHtml: process.env.RUTOR_DEBUG_SAVE_HTML === 'true'
};

export function isTolokaConfigured(): boolean {
  return Boolean(
    config.tolokaCookie?.trim() ||
      (config.tolokaUsername?.trim() && config.tolokaPassword?.trim())
  );
}

export function isRutrackerConfigured(): boolean {
  return Boolean(config.rutrackerUsername?.trim() && config.rutrackerPassword?.trim());
}
