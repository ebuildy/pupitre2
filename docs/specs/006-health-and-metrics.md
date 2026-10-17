# 006 — Health checks and metrics

| Field | Value |
| --- | --- |
| Area | Operations |
| Actors | Kubernetes probes, Prometheus |

- `GET /health` → `{status: "ok"}` without touching the database (liveness; also proxied by the web app).
- `GET /ready` → `{status: "ok"}` after a `SELECT 1`, 503 `{status: "unavailable"}` otherwise (readiness).
- `GET /metrics` → Prometheus text format, on the API port (scraped inside the cluster, not proxied):
  `http_requests_total{method, route, status}` (counter, by matched route pattern), `http_request_duration_seconds`
  (histogram), `pupitre_active_users_total`, `pupitre_active_courses_total`, `pupitre_enrollments_total` (gauges read at
  scrape time), `process_resident_memory_bytes`, `process_uptime_seconds`.

## Differences from the original

- Gauges are computed at scrape time instead of being incremented by events; a readiness probe is added.
- No client library (prom-client pulls an optional OpenTelemetry peer that changes better-auth's type resolution).

## Source

`apps/api/src/app.ts`, `apps/api/src/lib/metrics.ts`, `e2e/admin-reports.spec.ts`.
