import { useTranslation } from '@pupitre/i18n'
import { IMPORT_MODES, type ImportMode, type MarkdownImportInput, type MarkdownSplit } from '@pupitre/shared'
import { sortByTitle, toast, unwrap } from '@pupitre/ui'
import { Alert, AlertDescription, AlertTitle } from '@pupitre/ui/components/ui/alert'
import { Badge } from '@pupitre/ui/components/ui/badge'
import { Button } from '@pupitre/ui/components/ui/button'
import {
  Dialog,
  DialogContent,
  DialogDescription,
  DialogFooter,
  DialogHeader,
  DialogTitle,
} from '@pupitre/ui/components/ui/dialog'
import { Input } from '@pupitre/ui/components/ui/input'
import { Label } from '@pupitre/ui/components/ui/label'
import { NativeSelect, NativeSelectOption } from '@pupitre/ui/components/ui/native-select'
import { Textarea } from '@pupitre/ui/components/ui/textarea'
import { useMutation, useQuery, useQueryClient } from '@tanstack/react-query'
import { TriangleAlertIcon } from 'lucide-react'
import { useState } from 'react'
import { useNavigate } from 'react-router'
import { adminApi } from '../../lib/api.ts'

const SPLITS = ['auto', 'none', 'h1', 'h2', 'h3'] as const

const PLACEHOLDER = `---
title: Introduction à Linux
difficulty: beginner
split: h2
---

## Qu'est-ce que Linux ?

Linux est un **noyau**.

## Quiz

<!--pupitre
type: quiz
questions:
  - {id: q1, type: boolean, question: "Linux est un noyau ?", correctAnswer: true}
-->`

/** Specs 174, 175: "Importer depuis du markdown" with a dry-run preview. */
export function ImportDialog({ open, onOpenChange }: { open: boolean; onOpenChange: (open: boolean) => void }) {
  const { t } = useTranslation(['admin', 'common'])
  const queryClient = useQueryClient()
  const navigate = useNavigate()
  const [mode, setMode] = useState<ImportMode>('create')
  const [slug, setSlug] = useState('')
  const [target, setTarget] = useState('')
  const [split, setSplit] = useState<(typeof SPLITS)[number]>('auto')
  const [markdown, setMarkdown] = useState('')
  const courses = useQuery({ queryKey: ['admin-courses', ''], queryFn: () => unwrap(adminApi.courses.$get({ query: {} })), enabled: open })

  const input = (): MarkdownImportInput => ({
    markdown,
    mode,
    slug: mode === 'create' ? slug.trim() || undefined : target,
    split: split === 'auto' ? undefined : (split as MarkdownSplit),
  })
  const preview = useMutation({ mutationFn: () => unwrap(adminApi.courses.import.preview.$post({ json: input() })) })
  const run = useMutation({
    mutationFn: () => unwrap(adminApi.courses.import.$post({ json: input() })),
    onSuccess: async (result) => {
      toast.success(t('authoring.import.done', { count: result.moduleCount }))
      await queryClient.invalidateQueries({ queryKey: ['admin-courses'] })
      await queryClient.invalidateQueries({ queryKey: ['admin-modules', result.id] })
      await queryClient.invalidateQueries({ queryKey: ['admin-course', result.id] })
      if (result.warnings.length === 0) {
        onOpenChange(false)
        navigate(`/courses/${result.id}`)
      }
    },
  })
  const error = run.error ?? preview.error
  const warnings = run.data?.warnings ?? preview.data?.warnings ?? []
  const size = new TextEncoder().encode(markdown).length

  return (
    <Dialog
      open={open}
      onOpenChange={(o) => {
        onOpenChange(o)
        if (!o) {
          preview.reset()
          run.reset()
        }
      }}
    >
      <DialogContent className="max-h-[92vh] overflow-y-auto sm:max-w-3xl">
        <DialogHeader>
          <DialogTitle>{t('authoring.import.title')}</DialogTitle>
          <DialogDescription className="sr-only">{t('authoring.import.title')}</DialogDescription>
        </DialogHeader>
        <div className="grid gap-4 sm:grid-cols-3">
          <div className="flex flex-col gap-1.5">
            <Label htmlFor="import-mode">{t('authoring.import.destination')}</Label>
            <NativeSelect id="import-mode" value={mode} onChange={(e) => setMode(e.target.value as ImportMode)}>
              {IMPORT_MODES.map((m) => (
                <NativeSelectOption key={m} value={m}>
                  {t(`authoring.import.modes.${m}`)}
                </NativeSelectOption>
              ))}
            </NativeSelect>
          </div>
          {mode === 'create' ? (
            <div className="flex flex-col gap-1.5">
              <Label htmlFor="import-slug">{t('authoring.import.slug')}</Label>
              <Input id="import-slug" value={slug} onChange={(e) => setSlug(e.target.value)} placeholder={t('authoring.import.slugPlaceholder')} />
            </div>
          ) : (
            <div className="flex flex-col gap-1.5">
              <Label htmlFor="import-target">{t('authoring.import.target')}</Label>
              <NativeSelect id="import-target" value={target} onChange={(e) => setTarget(e.target.value)}>
                <NativeSelectOption value="">{t('authoring.import.chooseTarget')}</NativeSelectOption>
                {sortByTitle(courses.data?.courses ?? []).map((c) => (
                  <NativeSelectOption key={c.id} value={c.slug}>
                    {c.title}
                  </NativeSelectOption>
                ))}
              </NativeSelect>
            </div>
          )}
          <div className="flex flex-col gap-1.5">
            <Label htmlFor="import-split">{t('authoring.import.split')}</Label>
            <NativeSelect id="import-split" value={split} onChange={(e) => setSplit(e.target.value as (typeof SPLITS)[number])}>
              {SPLITS.map((s) => (
                <NativeSelectOption key={s} value={s}>
                  {t(`authoring.import.splits.${s}`)}
                </NativeSelectOption>
              ))}
            </NativeSelect>
          </div>
        </div>
        <div className="flex flex-col gap-1.5">
          <div className="flex items-center justify-between gap-2">
            <Label htmlFor="import-document">{t('authoring.import.document')}</Label>
            <span className="flex items-center gap-3 text-sm">
              <span className="text-muted-foreground">{t('authoring.import.size', { size })}</span>
              <label className="cursor-pointer text-primary hover:underline">
                {t('authoring.import.file')}
                <input
                  type="file"
                  accept=".md,.markdown,.txt"
                  className="sr-only"
                  onChange={async (e) => {
                    const file = e.target.files?.[0]
                    if (file) setMarkdown(await file.text())
                  }}
                />
              </label>
            </span>
          </div>
          <Textarea
            id="import-document"
            value={markdown}
            onChange={(e) => setMarkdown(e.target.value)}
            placeholder={PLACEHOLDER}
            className="min-h-64 font-mono text-xs"
          />
        </div>
        {error && (
          <Alert variant="destructive">
            <AlertDescription>{error.message}</AlertDescription>
          </Alert>
        )}
        {preview.data && !run.data && (
          <section className="flex flex-col gap-2 rounded-lg border p-3" data-testid="import-preview">
            <h3 className="font-semibold">{t('authoring.import.previewTitle', { slug: preview.data.slug })}</h3>
            <p className="text-sm text-muted-foreground">{preview.data.course.title}</p>
            <ol className="flex flex-col gap-1 text-sm">
              {preview.data.modules.map((m) => (
                <li key={m.slug} className="flex flex-wrap items-center gap-2">
                  <Badge variant="outline">{m.type}</Badge>
                  <span className="font-medium">{m.name}</span>
                  <span className="text-xs text-muted-foreground">
                    {m.source ?? t('authoring.import.bytes', { size: m.bytes })}
                  </span>
                  {m.existing && <Badge variant="muted">{t('authoring.import.existing')}</Badge>}
                </li>
              ))}
            </ol>
          </section>
        )}
        {warnings.length > 0 && (
          <Alert variant="warning">
            <TriangleAlertIcon />
            <AlertTitle>{t('authoring.import.warnings')}</AlertTitle>
            <AlertDescription>
              <ul className="list-disc pl-4">
                {warnings.map((w) => (
                  <li key={w}>{w}</li>
                ))}
              </ul>
            </AlertDescription>
          </Alert>
        )}
        <DialogFooter>
          <Button variant="outline" disabled={!markdown || preview.isPending} onClick={() => preview.mutate()}>
            {t('authoring.import.preview')}
          </Button>
          <Button disabled={!markdown || run.isPending} onClick={() => run.mutate()}>
            {t('authoring.import.submit')}
          </Button>
        </DialogFooter>
      </DialogContent>
    </Dialog>
  )
}
