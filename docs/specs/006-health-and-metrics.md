# 006 — Health checks and metrics

| Field | Value |
| --- | --- |
| Area | Operations |
| Actors | Kubernetes probes, Prometheus |

Probes and metrics are served by a second HTTP server of the API process, on `PROBES_PORT` (default `9464`, bound to
`PROBES_HOST`, default `0.0.0.0` so the kubelet and Prometheus reach the pod). They are not part of the web API: the
API port (`PORT`) answers 404 on them, the web app does not proxy them, and they are not in the OpenAPI document
([005](005-http-conventions.md)). Deployments route only `PORT` through the ingress; `PROBES_PORT` stays inside the
cluster (set `PROBES_HOST=127.0.0.1` to keep it on the machine).

- `GET /health` → `{status: "ok"}` without touching the database (liveness).
- `GET /ready` → `{status: "ok"}` after a `SELECT 1`, 503 `{status: "unavailable"}` otherwise (readiness).
- `GET /metrics` → Prometheus text format:
  `http_requests_total{method, route, status}` (counter of web API requests, by matched route pattern),
  `http_request_duration_seconds` (histogram), `pupitre_active_users_total`, `pupitre_active_courses_total`,
  `pupitre_enrollments_total` (gauges read at scrape time), `process_resident_memory_bytes`, `process_uptime_seconds`.
- Any other path on the probes port: 404 `{error: "Not found"}`.

## Differences from the original

- Probes and metrics have their own port instead of sharing the API's; `/health` is no longer proxied by the web app.
- Gauges are computed at scrape time instead of being incremented by events; a readiness probe is added.
- No client library (prom-client pulls an optional OpenTelemetry peer that changes better-auth's type resolution).

## Source

`apps/api/src/probes.ts`, `apps/api/src/index.ts`, `apps/api/src/lib/metrics.ts`, `e2e/admin-reports.spec.ts`.
