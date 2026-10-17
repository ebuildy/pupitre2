import { z } from 'zod'

/** Spec 182: what can be exported. Labels are translated in the UI (`exports.categories.<id>`, `exports.fields.<id>`…). */
export type ExportFilterType = 'date' | 'text' | 'select'

export type ExportCategory = {
  id: string
  fields: string[]
  defaultFields: string[]
  filters: { id: string; type: ExportFilterType; options?: string[] }[]
}

export const exportRequestSchema = z.object({
  category: z.string({ error: 'Catégorie requise' }).min(1, 'Catégorie requise'),
  fields: z.array(z.string()).min(1, 'Select at least one field').max(50),
  filters: z.record(z.string(), z.string()).default({}),
  /** Column titles of the CSV, in the order of `fields` (translated by the UI); default: the field ids. */
  headers: z.array(z.string().max(200)).optional(),
})
export type ExportRequest = z.input<typeof exportRequestSchema>

export type ExportPreview = { fields: string[]; rows: (string | number | null)[][]; total: number }
