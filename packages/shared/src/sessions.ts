import { z } from 'zod'

/** Spec 155 / 191 "Booking.attendance". */
export const ATTENDANCES = ['unknown', 'present', 'absent'] as const
export type Attendance = (typeof ATTENDANCES)[number]

/** Spec 151: create / edit a session of an in-person course. `capacity` null or 0 = unlimited. */
export const sessionInputSchema = z.object({
  courseId: z.string().min(1, 'Course is required'),
  title: z.string().trim().min(1, 'Title is required').max(200),
  startsAt: z.iso.datetime({ offset: true }),
  endsAt: z.iso.datetime({ offset: true }).nullable().optional(),
  location: z
    .string()
    .trim()
    .max(200)
    .transform((v) => v || null)
    .nullable()
    .optional(),
  capacity: z.number().int().min(0).max(10_000).nullable().optional(),
})
export type SessionInput = z.input<typeof sessionInputSchema>
export const sessionUpdateSchema = sessionInputSchema.omit({ courseId: true }).partial()
export type SessionUpdateInput = z.input<typeof sessionUpdateSchema>

/** A session as listed in the agenda and on the course page. */
export const sessionViewSchema = z
  .object({
    id: z.string(),
    course: z.object({ id: z.string(), slug: z.string(), title: z.string() }),
    title: z.string(),
    startsAt: z.string(),
    endsAt: z.string().nullable(),
    location: z.string().nullable(),
    /** null = unlimited. */
    capacity: z.number().nullable(),
    bookedCount: z.number(),
    /** The viewer booked a seat. */
    booked: z.boolean(),
    past: z.boolean(),
  })
  .meta({ id: 'Session' })
export type SessionView = z.infer<typeof sessionViewSchema>

/** `GET /api/sessions` (spec 154). */
export const sessionListResponseSchema = z
  .object({
    sessions: z.array(sessionViewSchema),
    /** The viewer can create, edit and delete sessions and take attendance (admins and managers). */
    canManage: z.boolean(),
  })
  .meta({ id: 'SessionList' })
export type SessionListResponse = z.infer<typeof sessionListResponseSchema>

/** Spec 155: presence sheet. */
export const sessionParticipantSchema = z
  .object({
    userId: z.string(),
    username: z.string().nullable(),
    name: z.string(),
    email: z.string(),
    bookedAt: z.string(),
    attendance: z.enum(ATTENDANCES),
  })
  .meta({ id: 'SessionParticipant' })
export type SessionParticipant = z.infer<typeof sessionParticipantSchema>
