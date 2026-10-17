import {
  ATTENDANCES,
  type Role,
  type SessionListResponse,
  type SessionParticipant,
  type SessionView,
  sessionInputSchema,
  sessionUpdateSchema,
} from '@pupitre/shared'
import { and, asc, eq, gte, inArray, lt, or, sql } from 'drizzle-orm'
import { Hono } from 'hono'
import { HTTPException } from 'hono/http-exception'
import { z } from 'zod'
import type { Session } from '../auth.ts'
import { db } from '../db/index.ts'
import { course, courseSession, enrollmentGrant, sessionBooking, user } from '../db/schema/index.ts'
import { validate } from '../lib/validate.ts'
import { type AppEnv, requireAuth } from '../middleware/session.ts'
import { audit } from '../services/audit.ts'
import { canSelfEnroll, canView, grant } from '../services/courses.ts'
import { managedGroupIds } from '../services/groups.ts'

/** Spec 151: trainers (admins and managers) create sessions and take attendance. */
function isTrainer(u: Session['user'] | null) {
  if (!u) return false
  return u.role === 'admin' || u.role === 'manager' || managedGroupIds(u.id).length > 0
}

function requireTrainer(u: Session['user']) {
  if (!isTrainer(u)) throw new HTTPException(403, { message: 'Manager or admin access required' })
}

function requireSession(id: string) {
  const found = db
    .select({ session: courseSession, course })
    .from(courseSession)
    .innerJoin(course, eq(course.id, courseSession.courseId))
    .where(eq(courseSession.id, id))
    .get()
  if (!found) throw new HTTPException(404, { message: 'Session not found' })
  return found
}

function inPersonCourse(id: string) {
  const found = db.select().from(course).where(eq(course.id, id)).get()
  if (!found) throw new HTTPException(404, { message: 'Course not found' })
  if (!found.inPerson) throw new HTTPException(400, { message: 'Sessions are for in-person courses' })
  return found
}

const toDate = (iso: string | null | undefined) => (iso ? new Date(iso) : iso === null ? null : undefined)

const listQuery = z.object({
  from: z.iso.datetime({ offset: true }).optional(),
  to: z.iso.datetime({ offset: true }).optional(),
  courseSlug: z.string().optional(),
})

/** Specs 150–155, under /api/sessions. */
export const sessionRoutes = new Hono<AppEnv>()
  // Spec 154: sessions of in-person courses the viewer may see, with booking counts and the viewer's bookings.
  .get('/', validate('query', listQuery), (c) => {
    const me = c.get('user')
    const { from, to, courseSlug } = c.req.valid('query')
    const trainer = isTrainer(me)
    const enrolled = me
      ? db.selectDistinct({ id: enrollmentGrant.courseId }).from(enrollmentGrant).where(eq(enrollmentGrant.userId, me.id)).all().map((r) => r.id)
      : []
    const visible = trainer
      ? sql`${course.status} != 'draft'`
      : or(
          and(eq(course.status, 'published'), eq(course.visibility, 'public')),
          enrolled.length ? and(inArray(course.id, enrolled), sql`${course.status} != 'draft'`) : undefined,
        )
    const rows = db
      .select({
        session: courseSession,
        course: { id: course.id, slug: course.slug, title: course.title },
        bookedCount: sql<number>`(SELECT count(*) FROM session_booking b WHERE b.session_id = ${courseSession.id})`,
        booked: me
          ? sql<number>`EXISTS (SELECT 1 FROM session_booking b WHERE b.session_id = ${courseSession.id} AND b.user_id = ${me.id})`
          : sql<number>`0`,
      })
      .from(courseSession)
      .innerJoin(course, eq(course.id, courseSession.courseId))
      .where(
        and(
          eq(course.inPerson, true),
          visible,
          from ? gte(courseSession.startsAt, new Date(from)) : undefined,
          to ? lt(courseSession.startsAt, new Date(to)) : undefined,
          courseSlug ? eq(course.slug, courseSlug) : undefined,
        ),
      )
      .orderBy(asc(courseSession.startsAt))
      .all()
    const now = Date.now()
    const sessions: SessionView[] = rows.map((r) => ({
      id: r.session.id,
      course: r.course,
      title: r.session.title,
      startsAt: r.session.startsAt.toISOString(),
      endsAt: r.session.endsAt?.toISOString() ?? null,
      location: r.session.location,
      capacity: r.session.capacity || null,
      bookedCount: r.bookedCount,
      booked: !!r.booked,
      past: r.session.startsAt.getTime() < now,
    }))
    return c.json<SessionListResponse>({ sessions, canManage: trainer })
  })
  .use(requireAuth)
  /** In-person courses a trainer can schedule (spec 151 "Cours" select). */
  .get('/courses', (c) => {
    requireTrainer(c.get('user')!)
    const courses = db
      .select({ id: course.id, slug: course.slug, title: course.title })
      .from(course)
      .where(and(eq(course.inPerson, true), sql`${course.status} != 'archived'`))
      .orderBy(asc(course.title))
      .all()
    return c.json({ courses })
  })
  .post('/', validate('json', sessionInputSchema), (c) => {
    const me = c.get('user')!
    requireTrainer(me)
    const input = c.req.valid('json')
    inPersonCourse(input.courseId)
    const created = db
      .insert(courseSession)
      .values({
        ...input,
        startsAt: new Date(input.startsAt),
        endsAt: toDate(input.endsAt) ?? null,
        capacity: input.capacity || null,
        createdBy: me.id,
      })
      .returning()
      .get()!
    audit(me, 'session.create', { type: 'session', id: created.id, label: created.title })
    return c.json({ id: created.id }, 201)
  })
  .patch('/:id', validate('json', sessionUpdateSchema), (c) => {
    const me = c.get('user')!
    requireTrainer(me)
    const { session } = requireSession(c.req.param('id'))
    const input = c.req.valid('json')
    db.update(courseSession)
      .set({
        ...input,
        startsAt: input.startsAt ? new Date(input.startsAt) : undefined,
        endsAt: toDate(input.endsAt),
        capacity: input.capacity === undefined ? undefined : input.capacity || null,
      })
      .where(eq(courseSession.id, session.id))
      .run()
    return c.json({ id: session.id })
  })
  // Bookings go with the session (spec 191).
  .delete('/:id', (c) => {
    const me = c.get('user')!
    requireTrainer(me)
    const { session } = requireSession(c.req.param('id'))
    db.delete(courseSession).where(eq(courseSession.id, session.id)).run()
    audit(me, 'session.delete', { type: 'session', id: session.id, label: session.title })
    return c.json({ message: 'Session deleted' })
  })

  // Spec 152: book a seat. Only upcoming sessions of courses the learner can access; a public course is joined on
  // the way. The capacity check and the insert run in one transaction (no overbooking).
  .post('/:id/booking', (c) => {
    const me = c.get('user')!
    const { session, course: target } = requireSession(c.req.param('id'))
    const enrolled = !!db
      .select({ id: enrollmentGrant.id })
      .from(enrollmentGrant)
      .where(and(eq(enrollmentGrant.userId, me.id), eq(enrollmentGrant.courseId, target.id)))
      .get()
    if (!canView(target, me.role as Role, enrolled)) throw new HTTPException(404, { message: 'Session not found' })
    if (!enrolled && !canSelfEnroll(target)) throw new HTTPException(403, { message: 'Enroll in the course to book a session' })
    if (session.startsAt.getTime() < Date.now()) throw new HTTPException(400, { message: 'This session has already started' })
    const result = db.transaction((tx) => {
      const existing = tx
        .select({ userId: sessionBooking.userId })
        .from(sessionBooking)
        .where(and(eq(sessionBooking.sessionId, session.id), eq(sessionBooking.userId, me.id)))
        .get()
      if (existing) return 'ok'
      if (session.capacity) {
        const taken = tx.select({ n: sql<number>`count(*)` }).from(sessionBooking).where(eq(sessionBooking.sessionId, session.id)).get()!.n
        if (taken >= session.capacity) return 'full'
      }
      tx.insert(sessionBooking).values({ sessionId: session.id, userId: me.id }).run()
      return 'ok'
    })
    if (result === 'full') throw new HTTPException(409, { message: 'Session is full' })
    if (!enrolled) grant(me.id, target.id, 'self', me.id)
    return c.json({ message: 'Booked' })
  })
  .delete('/:id/booking', (c) => {
    const me = c.get('user')!
    const { session } = requireSession(c.req.param('id'))
    db.delete(sessionBooking).where(and(eq(sessionBooking.sessionId, session.id), eq(sessionBooking.userId, me.id))).run()
    return c.json({ message: 'Booking cancelled' })
  })

  // Spec 155: presence sheet.
  .get('/:id/participants', (c) => {
    requireTrainer(c.get('user')!)
    const { session, course: target } = requireSession(c.req.param('id'))
    const participants: SessionParticipant[] = db
      .select({
        userId: user.id,
        username: user.username,
        name: user.name,
        email: user.email,
        bookedAt: sessionBooking.bookedAt,
        attendance: sessionBooking.attendance,
      })
      .from(sessionBooking)
      .innerJoin(user, eq(user.id, sessionBooking.userId))
      .where(eq(sessionBooking.sessionId, session.id))
      .orderBy(asc(user.name))
      .all()
      .map((p) => ({ ...p, bookedAt: p.bookedAt.toISOString() }))
    return c.json({
      session: {
        id: session.id,
        title: session.title,
        startsAt: session.startsAt.toISOString(),
        location: session.location,
        capacity: session.capacity,
        course: { slug: target.slug, title: target.title },
      },
      participants,
    })
  })
  .patch(
    '/:id/participants/:userId',
    validate('json', z.object({ attendance: z.enum(ATTENDANCES) })),
    (c) => {
      const me = c.get('user')!
      requireTrainer(me)
      const { session } = requireSession(c.req.param('id'))
      const updated = db
        .update(sessionBooking)
        .set({ attendance: c.req.valid('json').attendance, markedBy: me.id, markedAt: new Date() })
        .where(and(eq(sessionBooking.sessionId, session.id), eq(sessionBooking.userId, c.req.param('userId'))))
        .run()
      if (updated.changes === 0) throw new HTTPException(404, { message: 'Booking not found' })
      return c.json({ ok: true })
    },
  )
