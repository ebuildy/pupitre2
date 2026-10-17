import type { ExportCategory, ExportPreview, ExportRequest } from '@pupitre/shared'
import { type SQL, sql } from 'drizzle-orm'
import { HTTPException } from 'hono/http-exception'
import { db } from '../db/index.ts'
import { exportRecord } from '../db/schema/index.ts'

type Filter =
  | { id: string; type: 'date'; column: string; bound: 'from' | 'to' }
  | { id: string; type: 'text'; column: string }
  | { id: string; type: 'select'; options: string[]; where: (value: string) => SQL }

type Definition = {
  id: string
  /** FROM … JOINs; must expose the user as `u`. */
  from: string
  fields: Record<string, string>
  defaultFields: string[]
  filters: Filter[]
  orderBy: string
}

const iso = (column: string) => `strftime('%Y-%m-%dT%H:%M:%SZ', ${column} / 1000, 'unixepoch')`
const yesNo = (column: string) => `CASE WHEN ${column} THEN 'yes' ELSE 'no' END`
const userFields = { username: 'coalesce(u.username, u.name)', name: 'u.name', email: 'u.email' }
const dates = (prefix: string, column: string): Filter[] => [
  { id: `${prefix}From`, type: 'date', column, bound: 'from' },
  { id: `${prefix}To`, type: 'date', column, bound: 'to' },
]

/** Spec 182: the categories, their fields (SQL expressions) and filters. */
const DEFINITIONS: Definition[] = [
  {
    id: 'users',
    from: 'user u',
    fields: {
      ...userFields,
      role: 'u.role',
      active: yesNo('u.is_active'),
      createdAt: iso('u.created_at'),
      xp: '(SELECT coalesce(sum(x.amount), 0) FROM xp_event x WHERE x.user_id = u.id)',
      enrolledCourses: '(SELECT count(DISTINCT g.course_id) FROM enrollment_grant g WHERE g.user_id = u.id)',
      completedCourses: '(SELECT count(*) FROM course_completion cc WHERE cc.user_id = u.id)',
    },
    defaultFields: ['username', 'email', 'role', 'active', 'createdAt'],
    filters: [
      ...dates('created', 'u.created_at'),
      { id: 'role', type: 'select', options: ['student', 'manager', 'admin'], where: (v) => sql`u.role = ${v}` },
      { id: 'status', type: 'select', options: ['active', 'inactive'], where: (v) => sql`u.is_active = ${v === 'active' ? 1 : 0}` },
    ],
    orderBy: 'u.name',
  },
  {
    id: 'enrollments',
    from: 'enrollment_grant g JOIN user u ON u.id = g.user_id JOIN course c ON c.id = g.course_id',
    fields: {
      ...userFields,
      courseSlug: 'c.slug',
      courseTitle: 'c.title',
      source: 'g.source',
      enrolledAt: iso('g.created_at'),
      completedAt: `(SELECT ${iso('cc.completed_at')} FROM course_completion cc WHERE cc.user_id = u.id AND cc.course_id = c.id)`,
    },
    defaultFields: ['username', 'email', 'courseTitle', 'source', 'enrolledAt', 'completedAt'],
    filters: [
      ...dates('enrolled', 'g.created_at'),
      { id: 'course', type: 'text', column: 'c.slug' },
      { id: 'source', type: 'select', options: ['self', 'auto', 'admin', 'manager', 'group', 'path'], where: (v) => sql`g.source = ${v}` },
    ],
    orderBy: 'c.title, u.name',
  },
  {
    id: 'moduleProgress',
    from: 'module_progress p JOIN user u ON u.id = p.user_id JOIN module m ON m.id = p.module_id JOIN course c ON c.id = m.course_id',
    fields: {
      ...userFields,
      courseSlug: 'c.slug',
      courseTitle: 'c.title',
      moduleSlug: 'm.slug',
      moduleName: 'm.name',
      moduleType: 'm.type',
      viewedAt: iso('p.viewed_at'),
      bestScore: 'p.best_score',
      maxScore: 'p.max_score',
      attempts: 'p.attempts',
      passedAt: iso('p.passed_at'),
      lastActivityAt: iso('p.last_activity_at'),
    },
    defaultFields: ['username', 'courseTitle', 'moduleName', 'moduleType', 'viewedAt', 'bestScore', 'passedAt'],
    filters: [
      { id: 'course', type: 'text', column: 'c.slug' },
      ...dates('activity', 'p.last_activity_at'),
      {
        id: 'passed',
        type: 'select',
        options: ['yes', 'no'],
        where: (v) => (v === 'yes' ? sql`p.passed_at IS NOT NULL` : sql`p.passed_at IS NULL`),
      },
    ],
    orderBy: 'c.title, u.name, m.position',
  },
  {
    id: 'quizSubmissions',
    from: 'quiz_submission s JOIN user u ON u.id = s.user_id JOIN module m ON m.id = s.module_id JOIN course c ON c.id = m.course_id',
    fields: {
      ...userFields,
      courseSlug: 'c.slug',
      courseTitle: 'c.title',
      moduleName: 'm.name',
      score: 's.score',
      maxScore: 's.max_score',
      passed: yesNo('s.passed'),
      submittedAt: iso('s.submitted_at'),
    },
    defaultFields: ['username', 'courseTitle', 'moduleName', 'score', 'maxScore', 'passed', 'submittedAt'],
    filters: [
      { id: 'course', type: 'text', column: 'c.slug' },
      ...dates('submitted', 's.submitted_at'),
      { id: 'passed', type: 'select', options: ['yes', 'no'], where: (v) => sql`s.passed = ${v === 'yes' ? 1 : 0}` },
    ],
    orderBy: 's.submitted_at DESC',
  },
  {
    id: 'pathEnrollments',
    from: 'path_enrollment e JOIN user u ON u.id = e.user_id JOIN learning_path p ON p.id = e.path_id',
    fields: { ...userFields, pathSlug: 'p.slug', pathTitle: 'p.title', enrolledAt: iso('e.created_at') },
    defaultFields: ['username', 'email', 'pathTitle', 'enrolledAt'],
    filters: [...dates('enrolled', 'e.created_at'), { id: 'path', type: 'text', column: 'p.slug' }],
    orderBy: 'p.title, u.name',
  },
  {
    id: 'xpEvents',
    from: 'xp_event x JOIN user u ON u.id = x.user_id',
    fields: { ...userFields, source: 'x.source', amount: 'x.amount', label: 'x.label', earnedAt: iso('x.created_at') },
    defaultFields: ['username', 'source', 'amount', 'label', 'earnedAt'],
    filters: [
      ...dates('earned', 'x.created_at'),
      { id: 'source', type: 'select', options: ['lesson', 'quiz', 'course', 'admin'], where: (v) => sql`x.source = ${v}` },
    ],
    orderBy: 'x.created_at DESC',
  },
  {
    id: 'badges',
    from: 'badge_award b JOIN user u ON u.id = b.user_id',
    fields: { ...userFields, badge: 'b.name', icon: 'b.icon', courseTitle: 'b.course_title', awardedAt: iso('b.awarded_at') },
    defaultFields: ['username', 'badge', 'courseTitle', 'awardedAt'],
    filters: dates('awarded', 'b.awarded_at'),
    orderBy: 'b.awarded_at DESC',
  },
  {
    id: 'sessionBookings',
    from:
      'session_booking b JOIN user u ON u.id = b.user_id JOIN course_session s ON s.id = b.session_id JOIN course c ON c.id = s.course_id',
    fields: {
      ...userFields,
      courseTitle: 'c.title',
      session: 's.title',
      startsAt: iso('s.starts_at'),
      location: 's.location',
      bookedAt: iso('b.booked_at'),
      attendance: 'b.attendance',
    },
    defaultFields: ['username', 'courseTitle', 'session', 'startsAt', 'attendance'],
    filters: [
      ...dates('starts', 's.starts_at'),
      { id: 'attendance', type: 'select', options: ['unknown', 'present', 'absent'], where: (v) => sql`b.attendance = ${v}` },
    ],
    orderBy: 's.starts_at, u.name',
  },
]

export const EXPORT_CATEGORIES: ExportCategory[] = DEFINITIONS.map((d) => ({
  id: d.id,
  fields: Object.keys(d.fields),
  defaultFields: d.defaultFields,
  filters: d.filters.map((f) => ({ id: f.id, type: f.type, ...(f.type === 'select' ? { options: f.options } : {}) })),
}))

/** `scope`: user ids a manager may export (spec 182 gap fixed: manager exports are limited to their members). */
function build(input: ExportRequest, scope: string[] | null) {
  const def = DEFINITIONS.find((d) => d.id === input.category)
  if (!def) throw new HTTPException(400, { message: 'Catégorie requise' })
  const unknown = input.fields.find((f) => !(f in def.fields))
  if (unknown) throw new HTTPException(400, { message: `Unknown field: ${unknown}` })
  const where: SQL[] = []
  for (const f of def.filters) {
    const value = input.filters?.[f.id]?.trim()
    if (!value) continue
    if (f.type === 'date') {
      const time = Date.parse(f.bound === 'to' ? `${value}T23:59:59.999Z` : `${value}T00:00:00Z`)
      if (Number.isNaN(time)) throw new HTTPException(400, { message: `Invalid date: ${f.id}` })
      where.push(sql`${sql.raw(f.column)} ${sql.raw(f.bound === 'from' ? '>=' : '<=')} ${time}`)
    } else if (f.type === 'text') {
      where.push(sql`${sql.raw(f.column)} = ${value}`)
    } else {
      if (!f.options.includes(value)) throw new HTTPException(400, { message: `Invalid value for ${f.id}` })
      where.push(f.where(value))
    }
  }
  if (scope) where.push(scope.length ? sql`u.id IN (${sql.join(scope.map((id) => sql`${id}`), sql`, `)})` : sql`0`)
  const whereSql = where.length ? sql` WHERE ${sql.join(where, sql` AND `)}` : sql``
  const columns = sql.raw(input.fields.map((f, i) => `${def.fields[f]} AS c${i}`).join(', '))
  return {
    rows: sql`SELECT ${columns} FROM ${sql.raw(def.from)}${whereSql} ORDER BY ${sql.raw(def.orderBy)}`,
    count: sql`SELECT count(*) AS n FROM ${sql.raw(def.from)}${whereSql}`,
  }
}

function toRow(r: Record<string, unknown>, n: number) {
  return Array.from({ length: n }, (_, i) => (r[`c${i}`] ?? null) as string | number | null)
}

export function previewExport(input: ExportRequest, scope: string[] | null): ExportPreview {
  const q = build(input, scope)
  const rows = db.all<Record<string, unknown>>(sql`${q.rows} LIMIT 10`)
  const total = db.get<{ n: number }>(q.count)?.n ?? 0
  return { fields: input.fields, rows: rows.map((r) => toRow(r, input.fields.length)), total }
}

function csvCell(value: unknown) {
  if (value === null || value === undefined) return ''
  const s = String(value)
  return /[";\n\r]/.test(s) ? `"${s.replace(/"/g, '""')}"` : s
}

/** Spec 182: UTF-8 BOM, `;` separator, header row; every download is recorded (spec 191 "ExportRecord"). */
export function exportCsv(input: ExportRequest, scope: string[] | null, actor: { id: string; email: string }) {
  const q = build(input, scope)
  const headers = input.headers?.length === input.fields.length ? input.headers : input.fields
  const lines = [headers.map(csvCell).join(';')]
  let count = 0
  for (const r of db.all<Record<string, unknown>>(q.rows)) {
    lines.push(toRow(r, input.fields.length).map(csvCell).join(';'))
    count++
  }
  db.insert(exportRecord)
    .values({ userId: actor.id, userEmail: actor.email, category: input.category, fields: input.fields, filters: input.filters ?? {}, rowCount: count })
    .run()
  return { csv: `﻿${lines.join('\r\n')}\r\n`, filename: `${input.category}-export-${new Date().toISOString().slice(0, 10)}.csv` }
}
