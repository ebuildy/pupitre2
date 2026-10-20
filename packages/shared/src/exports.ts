import { z } from 'zod'

/** Spec 182: what can be exported. Labels are translated in the UI (`exports.categories.<id>`, `exports.fields.<id>`…). */
export const EXPORT_FILTER_TYPES = ['date', 'text', 'select'] as const
export type ExportFilterType = (typeof EXPORT_FILTER_TYPES)[number]

export const exportCategorySchema = z
  .object({
    id: z.string(),
    fields: z.array(z.string()),
    defaultFields: z.array(z.string()),
    filters: z.array(z.object({ id: z.string(), type: z.enum(EXPORT_FILTER_TYPES), options: z.array(z.string()).optional() })),
  })
  .meta({ id: 'ExportCategory' })
export type ExportCategory = z.infer<typeof exportCategorySchema>

export const exportRequestSchema = z.object({
  category: z.string({ error: 'Catégorie requise' }).min(1, 'Catégorie requise'),
  fields: z.array(z.string()).min(1, 'Select at least one field').max(50),
  filters: z.record(z.string(), z.string()).default({}),
  /** Column titles of the CSV, in the order of `fields` (translated by the UI); default: the field ids. */
  headers: z.array(z.string().max(200)).optional(),
})
export type ExportRequest = z.input<typeof exportRequestSchema>

export const exportPreviewSchema = z
  .object({
    fields: z.array(z.string()),
    rows: z.array(z.array(z.union([z.string(), z.number(), z.null()]))),
    total: z.number(),
  })
  .meta({ id: 'ExportPreview' })
export type ExportPreview = z.infer<typeof exportPreviewSchema>
