import { z } from 'zod'
import { COURSE_STATUSES, COURSE_VISIBILITIES, DIFFICULTIES, SLUG_PATTERN } from './courses.ts'
import { moduleInputSchema } from './content.ts'
import { badgeSchema } from './gamification.ts'

/**
 * Spec 169: a course as a portable document — metadata with references by slug (category, prerequisite courses) and
 * its ordered modules. `GET` gives back what `PUT` takes (round trip), and the markdown format (173) uses the same keys.
 */
export const courseSpecSchema = z.object({
  title: z.string().trim().min(1, 'Title is required').max(200),
  description: z.string().nullable().optional(),
  /** Category slug. */
  category: z.string().nullable().optional(),
  difficulty: z.enum(DIFFICULTIES).nullable().optional(),
  visibility: z.enum(COURSE_VISIBILITIES).optional(),
  status: z.enum(COURSE_STATUSES).optional(),
  xpRequired: z.number().int().min(0).optional(),
  completionXp: z.number().int().min(0).optional(),
  inPerson: z.boolean().optional(),
  badge: badgeSchema.nullable().optional(),
  prerequisites: z
    .array(
      z.object({
        /** Course slug. */
        course: z.string().min(1),
        minScore: z.number().int().min(0).nullable().optional(),
        modules: z.array(z.string()).optional(),
      }),
    )
    .optional(),
  modules: z.array(moduleInputSchema).max(500).default([]),
})
export type CourseSpec = z.input<typeof courseSpecSchema>

export const courseDefinitionSchema = z.object({
  slug: z.string().trim().regex(SLUG_PATTERN, 'Invalid slug').max(100),
  spec: courseSpecSchema,
})
export type CourseDefinition = z.input<typeof courseDefinitionSchema>

/** Spec 173: `none` = the whole document is one module. */
export const MARKDOWN_SPLITS = ['none', 'h1', 'h2', 'h3', 'h4', 'h5', 'h6'] as const
export type MarkdownSplit = (typeof MARKDOWN_SPLITS)[number]
export const IMPORT_MODES = ['create', 'replace', 'append'] as const
export type ImportMode = (typeof IMPORT_MODES)[number]

/** `POST /api/admin/courses/import[/preview]` (specs 174, 175). */
export const markdownImportSchema = z.object({
  markdown: z.string().min(1, 'markdown is required').max(10_000_000),
  slug: z.string().trim().optional(),
  split: z.enum(MARKDOWN_SPLITS).optional(),
  mode: z.enum(IMPORT_MODES).default('create'),
})
export type MarkdownImportInput = z.input<typeof markdownImportSchema>

export type MarkdownImportPreview = {
  slug: string
  mode: ImportMode
  course: Omit<CourseSpec, 'modules'>
  modules: { name: string; slug: string; type: string; bytes: number; hidden: boolean; source: string | null; existing: boolean }[]
  warnings: string[]
}

export type MarkdownImportResult = { slug: string; id: string; mode: ImportMode; moduleCount: number; warnings: string[] }
