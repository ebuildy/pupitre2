import { z } from 'zod'

/** Spec 191: usernames are 3–64 characters; the username plugin also limits them to letters, digits, `_` and `.`. */
export const USERNAME_MIN = 3
export const USERNAME_MAX = 64
export const USERNAME_PATTERN = /^[a-zA-Z0-9_.]+$/

/** An avatar is an image URL (`http(s)://`) or an emoji (spec 035). */
export function isImageUrl(value: string) {
  return /^https?:\/\//i.test(value)
}

/** `PATCH /api/me` (spec 035). Empty strings clear `bio` / `image`. */
export const profileUpdateSchema = z
  .object({
    username: z
      .string()
      .trim()
      .min(USERNAME_MIN, `Username must be at least ${USERNAME_MIN} characters`)
      .max(USERNAME_MAX)
      .regex(USERNAME_PATTERN, 'Username may only contain letters, digits, "_" and "."'),
    name: z.string().trim().min(1).max(100),
    bio: z.string().trim().max(1000),
    image: z
      .string()
      .trim()
      .max(2048)
      .refine((v) => v === '' || isImageUrl(v) || [...v].length <= 8, 'Avatar must be an image URL or an emoji'),
  })
  .partial()
export type ProfileUpdateInput = z.input<typeof profileUpdateSchema>

/** `GET /api/users/:id` (spec 037): what anyone can see of a user. No e-mail. */
export type PublicUserProfile = {
  id: string
  username: string
  name: string
  image: string | null
  bio: string | null
  xp: number
  completedCourses: number
  memberSince: string
}
