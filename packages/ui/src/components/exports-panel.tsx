import { useTranslation } from '@pupitre/i18n'
import type { ExportCategory, ExportPreview, ExportRequest } from '@pupitre/shared'
import { ApiRequestError } from '../api.ts'
import { Badge } from '@pupitre/ui/components/ui/badge'
import { Button } from '@pupitre/ui/components/ui/button'
import { Card, CardContent, CardHeader, CardTitle } from '@pupitre/ui/components/ui/card'
import { Input } from '@pupitre/ui/components/ui/input'
import { Label } from '@pupitre/ui/components/ui/label'
import { NativeSelect, NativeSelectOption } from '@pupitre/ui/components/ui/native-select'
import { Table, TableBody, TableCell, TableHead, TableHeader, TableRow } from '@pupitre/ui/components/ui/table'
import { cn } from '@pupitre/ui/lib/utils'
import { useEffect, useState } from 'react'
import { toast } from 'sonner'

async function post(url: string, body: ExportRequest) {
  const res = await fetch(url, { method: 'POST', headers: { 'Content-Type': 'application/json' }, body: JSON.stringify(body) })
  if (!res.ok) {
    const data = (await res.json().catch(() => null)) as { error?: string } | null
    throw new ApiRequestError(res.status, data?.error ?? `HTTP ${res.status}`)
  }
  return res
}

/**
 * Spec 182: category → fields → filters → preview → download. `basePath` is `/api/admin/exports` (admins) or
 * `/api/manager/exports` (managers: their members only).
 */
export function ExportsPanel({ basePath }: { basePath: string }) {
  const { t } = useTranslation()
  const [categories, setCategories] = useState<ExportCategory[] | null>(null)
  const [categoryId, setCategoryId] = useState<string | null>(null)
  const [fields, setFields] = useState<string[]>([])
  const [filters, setFilters] = useState<Record<string, string>>({})
  const [preview, setPreview] = useState<ExportPreview | null>(null)
  const [pending, setPending] = useState(false)

  useEffect(() => {
    fetch(`${basePath}/categories`)
      .then((r) => r.json())
      .then((d: { categories: ExportCategory[] }) => setCategories(d.categories))
      .catch(() => setCategories([]))
  }, [basePath])

  const category = categories?.find((c) => c.id === categoryId) ?? null
  const fieldLabel = (f: string) => t(`exports.fieldNames.${f}` as 'exports.fieldNames.username')
  const request = (): ExportRequest => ({ category: categoryId ?? '', fields, filters, headers: fields.map(fieldLabel) })

  function choose(c: ExportCategory) {
    setCategoryId(c.id)
    setFields(c.defaultFields)
    setFilters({})
    setPreview(null)
  }

  async function runPreview() {
    setPending(true)
    try {
      setPreview((await (await post(`${basePath}/preview`, request())).json()) as ExportPreview)
    } catch (err) {
      toast.error((err as Error).message)
    } finally {
      setPending(false)
    }
  }

  async function download() {
    setPending(true)
    try {
      const res = await post(`${basePath}/download`, request())
      const blob = await res.blob()
      const name = /filename="([^"]+)"/.exec(res.headers.get('Content-Disposition') ?? '')?.[1] ?? 'export.csv'
      const url = URL.createObjectURL(blob)
      const a = document.createElement('a')
      a.href = url
      a.download = name
      a.click()
      URL.revokeObjectURL(url)
      toast.success(t('exports.downloaded'))
    } catch (err) {
      toast.error((err as Error).message)
    } finally {
      setPending(false)
    }
  }

  return (
    <div className="flex flex-col gap-6">
      <section className="flex flex-col gap-2">
        <h2 className="text-lg font-semibold">1. {t('exports.category')}</h2>
        <div className="grid gap-2 sm:grid-cols-2 lg:grid-cols-4" role="radiogroup" aria-label={t('exports.category')}>
          {categories?.map((c) => (
            <button
              key={c.id}
              type="button"
              role="radio"
              aria-checked={c.id === categoryId}
              onClick={() => choose(c)}
              className={cn(
                'rounded-xl border bg-card p-4 text-left font-medium shadow-xs transition-colors hover:bg-muted',
                c.id === categoryId && 'border-primary bg-secondary',
              )}
            >
              {t(`exports.categories.${c.id}` as 'exports.categories.users')}
            </button>
          ))}
        </div>
      </section>

      {category && (
        <>
          <Card>
            <CardHeader className="flex flex-row flex-wrap items-center justify-between gap-2">
              <CardTitle>
                <h2>2. {t('exports.fields')}</h2>
              </CardTitle>
              <div className="flex gap-2">
                <Button variant="ghost" size="sm" onClick={() => setFields(category.fields)}>
                  {t('exports.selectAll')}
                </Button>
                <Button variant="ghost" size="sm" onClick={() => setFields(category.defaultFields)}>
                  {t('exports.reset')}
                </Button>
              </div>
            </CardHeader>
            <CardContent className="flex flex-wrap gap-x-5 gap-y-2" role="group" aria-label={t('exports.fields')}>
              {category.fields.map((f) => (
                <label key={f} className="flex items-center gap-1.5 text-sm">
                  <input
                    type="checkbox"
                    className="accent-primary"
                    checked={fields.includes(f)}
                    onChange={(e) => setFields((list) => (e.target.checked ? category.fields.filter((x) => x === f || list.includes(x)) : list.filter((x) => x !== f)))}
                  />
                  {fieldLabel(f)}
                </label>
              ))}
            </CardContent>
          </Card>

          {category.filters.length > 0 && (
            <Card>
              <CardHeader>
                <CardTitle>
                  <h2>3. {t('exports.filters')}</h2>
                </CardTitle>
              </CardHeader>
              <CardContent className="grid gap-4 sm:grid-cols-2 lg:grid-cols-3">
                {category.filters.map((f) => {
                  const id = `export-filter-${f.id}`
                  const label = t(`exports.filterNames.${f.id}` as 'exports.filterNames.role')
                  return (
                    <div key={f.id} className="flex flex-col gap-1.5">
                      <Label htmlFor={id}>{label}</Label>
                      {f.type === 'select' ? (
                        <NativeSelect id={id} value={filters[f.id] ?? ''} onChange={(e) => setFilters((v) => ({ ...v, [f.id]: e.target.value }))}>
                          <NativeSelectOption value="">{t('exports.any')}</NativeSelectOption>
                          {f.options?.map((o) => (
                            <NativeSelectOption key={o} value={o}>
                              {t(`exports.options.${o}` as 'exports.options.yes')}
                            </NativeSelectOption>
                          ))}
                        </NativeSelect>
                      ) : (
                        <Input
                          id={id}
                          type={f.type === 'date' ? 'date' : 'text'}
                          value={filters[f.id] ?? ''}
                          onChange={(e) => setFilters((v) => ({ ...v, [f.id]: e.target.value }))}
                        />
                      )}
                    </div>
                  )
                })}
              </CardContent>
            </Card>
          )}

          <div className="flex flex-wrap gap-2">
            <Button variant="outline" disabled={pending || fields.length === 0} onClick={runPreview}>
              {t('exports.preview')}
            </Button>
            <Button disabled={pending || fields.length === 0} onClick={download}>
              {t('exports.download')}
            </Button>
          </div>

          {preview && (
            <section className="flex flex-col gap-2" data-testid="export-preview">
              <Badge variant="muted" className="self-start">
                {t('exports.previewTotal', { count: preview.total })}
              </Badge>
              {preview.rows.length === 0 ? (
                <p className="text-muted-foreground">{t('exports.empty')}</p>
              ) : (
                <Card className="overflow-x-auto py-0">
                  <Table>
                    <TableHeader>
                      <TableRow>
                        {preview.fields.map((f) => (
                          <TableHead key={f}>{fieldLabel(f)}</TableHead>
                        ))}
                      </TableRow>
                    </TableHeader>
                    <TableBody>
                      {preview.rows.map((row, i) => (
                        <TableRow key={i}>
                          {row.map((cell, j) => (
                            <TableCell key={j}>{cell ?? ''}</TableCell>
                          ))}
                        </TableRow>
                      ))}
                    </TableBody>
                  </Table>
                </Card>
              )}
            </section>
          )}
        </>
      )}
    </div>
  )
}
