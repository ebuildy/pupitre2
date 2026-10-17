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
export type SessionView = {
  id: string
  course: { id: string; slug: string; title: string }
  title: string
  startsAt: string
  endsAt: string | null
  location: string | null
  /** null = unlimited. */
  capacity: number | null
  bookedCount: number
  /** The viewer booked a seat. */
  booked: boolean
  past: boolean
}

/** `GET /api/sessions` (spec 154). */
export type SessionListResponse = {
  sessions: SessionView[]
  /** The viewer can create, edit and delete sessions and take attendance (admins and managers). */
  canManage: boolean
}

/** Spec 155: presence sheet. */
export type SessionParticipant = {
  userId: string
  username: string | null
  name: string
  email: string
  bookedAt: string
  attendance: Attendance
}
