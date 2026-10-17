import { z } from 'zod'

/** Spec 180: a reusable rendering component used in markdown as `|||name … |||`. */
export const PATTERN_NAME_PATTERN = /^[a-z0-9][a-z0-9_-]*$/

export const patternInputSchema = z.object({
  name: z.string().trim().regex(PATTERN_NAME_PATTERN, 'Invalid pattern name').max(64),
  label: z.string().trim().min(1, 'Label is required').max(100),
  description: z.string().trim().max(500).nullable().optional(),
  /** What the content means (shown to authors). */
  parameter: z.string().trim().max(200).nullable().optional(),
  /** HTML with a `{{content}}` placeholder. */
  html: z.string().min(1, 'HTML is required').max(20_000),
  css: z.string().max(20_000).nullable().optional(),
  /** null = global; else the course the pattern is limited to. */
  courseId: z.string().min(1).nullable().optional(),
})
export type PatternInput = z.input<typeof patternInputSchema>

export type MarkdownPattern = {
  id: string
  name: string
  label: string
  description: string | null
  parameter: string | null
  html: string
  css: string | null
  course: { id: string; slug: string; title: string } | null
  /** `config`: seeded from the configuration file (spec 181). */
  origin: 'admin' | 'config'
  updatedAt: string
}

export const patternPreviewSchema = z.object({
  markdown: z.string().max(100_000),
  pattern: z.object({ name: z.string(), html: z.string(), css: z.string().nullable().optional() }).optional(),
})
