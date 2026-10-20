import type { HealthResponse } from '@pupitre/shared'
import { Hono } from 'hono'
import { sqlite } from './db/index.ts'
import { renderMetrics } from './lib/metrics.ts'

/**
 * Spec 006: Kubernetes probes and Prometheus metrics, served on their own port (`PROBES_PORT`) so they are never part
 * of the web API: the ingress and the web app's proxy only reach `PORT`. The liveness probe never touches the
 * database; readiness checks it.
 */
export const probes = new Hono()
  .get('/health', (c) => c.json<HealthResponse>({ status: 'ok' }))
  .get('/ready', (c) => {
    try {
      sqlite.prepare('SELECT 1').get()
      return c.json({ status: 'ok' })
    } catch {
      return c.json({ status: 'unavailable' }, 503)
    }
  })
  .get('/metrics', (c) => c.body(renderMetrics(), 200, { 'Content-Type': 'text/plain; version=0.0.4; charset=utf-8' }))
  .notFound((c) => c.json({ error: 'Not found' }, 404))
