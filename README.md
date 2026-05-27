# lampa-jackett-lite

Minimal Node.js + TypeScript service with Jackett-compatible endpoints for Lampa.

Providers:

- Toloka
- RuTracker
- Rutor
- Mock, only when explicitly requested

## Endpoints

- `GET /health`
- `GET /`
- `GET /debug/search?q=avatar&providers=toloka,rutracker,rutor&debug=1`
- `GET /api/v2.0/indexers/status:healthy/results?Query=avatar`
- `GET /api/v2.0/indexers/all/results/torznab/api?t=caps`
- `GET /api/v2.0/indexers/all/results/torznab/api?t=search&q=avatar`
- `GET /download/toloka/:id.torrent`
- `GET /download/rutracker/:id.torrent`
- `GET /download/rutor/:id.torrent`

## Requirements

- Node.js 20 or newer
- npm

## Install

```bash
npm install
```

## Development

```bash
npm run dev
```

By default the server listens on `0.0.0.0:9118`.

You can override it:

```bash
HOST=127.0.0.1 PORT=9120 npm run dev
```

## curl examples

```bash
curl http://127.0.0.1:9118/health
curl http://127.0.0.1:9118/
curl -G http://127.0.0.1:9118/debug/search --data-urlencode 'q=аватар' --data-urlencode 'providers=toloka,rutracker,rutor' --data-urlencode 'debug=1'
curl -G http://127.0.0.1:9118/api/v2.0/indexers/status:healthy/results --data-urlencode 'apikey=test' --data-urlencode 'Query=аватар'
curl 'http://127.0.0.1:9118/api/v2.0/indexers/all/results/torznab/api?t=caps'
curl -G http://127.0.0.1:9118/api/v2.0/indexers/all/results/torznab/api --data-urlencode 't=search' --data-urlencode 'q=аватар'
```

## Build

```bash
npm run build
```

## Start compiled server

```bash
npm start
```

## Test

```bash
npm test
```

## Lampa / Jackett-compatible base URL

Use this URL shape:

```text
http://<server-host>:9118/api/v2.0/indexers/all/results/torznab/api
```

Lampa may also call the Jackett JSON results endpoint:

```text
http://<server-host>:9118/api/v2.0/indexers/status:healthy/results
```

## Autostart

The service can be started by `scripts/run-service.sh`. On this server it is also installed in the current user's crontab with `@reboot`, guarded by `flock`:

```bash
@reboot /usr/bin/flock -n /tmp/lampa-jackett-lite.lock /home/home/projects/lampa-jackett-lite/scripts/run-service.sh >> /home/home/projects/lampa-jackett-lite/logs/service.log 2>&1
```

Logs are written to `logs/service.log`.
