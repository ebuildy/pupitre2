import { sql } from 'drizzle-orm'
import { createMiddleware } from 'hono/factory'
import { db } from '../db/index.ts'

/**
 * Spec 006: Prometheus metrics in the text exposition format. Names are stable (dashboards depend on them). Kept
 * dependency-free: a counter and a histogram by route pattern, and business gauges read from the database at scrape.
 */
const BUCKETS = [0.005, 0.01, 0.025, 0.05, 0.1, 0.25, 0.5, 1, 2.5, 5]
const requests = new Map<string, number>()
const durations = new Map<string, { buckets: number[]; sum: number; count: number }>()

const labels = (obj: Record<string, string>) =>
  `{${Object.entries(obj)
    .map(([k, v]) => `${k}="${v.replace(/\\/g, '\\\\').replace(/"/g, '\\"')}"`)
    .join(',')}}`

/** Counts requests by matched route pattern (not the raw path: bounded label values). */
export const metricsMiddleware = createMiddleware(async (c, next) => {
  const start = performance.now()
  await next()
  const route = c.req.routePath || 'unmatched'
  const seconds = (performance.now() - start) / 1000
  const key = labels({ method: c.req.method, route, status: String(c.res.status) })
  requests.set(key, (requests.get(key) ?? 0) + 1)
  const dkey = JSON.stringify([c.req.method, route])
  const d = durations.get(dkey) ?? { buckets: BUCKETS.map(() => 0), sum: 0, count: 0 }
  BUCKETS.forEach((b, i) => {
    if (seconds <= b) d.buckets[i]!++
  })
  d.sum += seconds
  d.count++
  durations.set(dkey, d)
})

const count = (query: ReturnType<typeof sql>) => Number(db.get<{ n: number }>(query)?.n ?? 0)

export function renderMetrics() {
  const out: string[] = []
  out.push('# HELP http_requests_total HTTP requests', '# TYPE http_requests_total counter')
  for (const [key, n] of requests) out.push(`http_requests_total${key} ${n}`)
  out.push('# HELP http_request_duration_seconds HTTP request duration', '# TYPE http_request_duration_seconds histogram')
  for (const [dkey, d] of durations) {
    const [method, route] = JSON.parse(dkey) as [string, string]
    BUCKETS.forEach((b, i) => out.push(`http_request_duration_seconds_bucket${labels({ method, route, le: String(b) })} ${d.buckets[i]}`))
    out.push(`http_request_duration_seconds_bucket${labels({ method, route, le: '+Inf' })} ${d.count}`)
    out.push(`http_request_duration_seconds_sum${labels({ method, route })} ${d.sum}`)
    out.push(`http_request_duration_seconds_count${labels({ method, route })} ${d.count}`)
  }
  const gauges: [string, string, number][] = [
    ['pupitre_active_users_total', 'Active accounts', count(sql`SELECT count(*) AS n FROM user WHERE is_active = 1`)],
    ['pupitre_active_courses_total', 'Published courses', count(sql`SELECT count(*) AS n FROM course WHERE status = 'published'`)],
    [
      'pupitre_enrollments_total',
      'Enrollments (user, course)',
      count(sql`SELECT count(*) AS n FROM (SELECT DISTINCT user_id, course_id FROM enrollment_grant)`),
    ],
  ]
  for (const [name, help, value] of gauges) out.push(`# HELP ${name} ${help}`, `# TYPE ${name} gauge`, `${name} ${value}`)
  const mem = process.memoryUsage()
  out.push('# TYPE process_resident_memory_bytes gauge', `process_resident_memory_bytes ${mem.rss}`)
  out.push('# TYPE process_uptime_seconds gauge', `process_uptime_seconds ${process.uptime()}`)
  return `${out.join('\n')}\n`
}
