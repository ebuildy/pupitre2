import { useTranslation } from '@pupitre/i18n'
import type { MarkdownPattern, PatternInput } from '@pupitre/shared'
import { EmptyState, ErrorState, LoadingState, PageHeader, sortByTitle, toast, unwrap, useDebouncedValue } from '@pupitre/ui'
import { Alert, AlertDescription } from '@pupitre/ui/components/ui/alert'
import {
  AlertDialog,
  AlertDialogAction,
  AlertDialogCancel,
  AlertDialogContent,
  AlertDialogDescription,
  AlertDialogFooter,
  AlertDialogHeader,
  AlertDialogTitle,
} from '@pupitre/ui/components/ui/alert-dialog'
import { Badge } from '@pupitre/ui/components/ui/badge'
import { Button } from '@pupitre/ui/components/ui/button'
import { Card } from '@pupitre/ui/components/ui/card'
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
import { Table, TableBody, TableCell, TableHead, TableHeader, TableRow } from '@pupitre/ui/components/ui/table'
import { Textarea } from '@pupitre/ui/components/ui/textarea'
import { useMutation, useQuery, useQueryClient } from '@tanstack/react-query'
import { useState } from 'react'
import { adminApi } from '../lib/api.ts'

/** Spec 180: markdown patterns — list, create / edit with a live preview, delete. */
export function Patterns() {
  const { t } = useTranslation(['admin', 'common'])
  const queryClient = useQueryClient()
  const [editing, setEditing] = useState<MarkdownPattern | 'new' | null>(null)
  const [deleting, setDeleting] = useState<MarkdownPattern | null>(null)
  const { data, isPending, isError, error } = useQuery({ queryKey: ['admin-patterns'], queryFn: () => unwrap(adminApi.patterns.$get()) })
  const remove = useMutation({
    mutationFn: (id: string) => unwrap(adminApi.patterns[':id'].$delete({ param: { id } })),
    onSuccess: async () => {
      toast.success(t('patterns.deleted'))
      await queryClient.invalidateQueries({ queryKey: ['admin-patterns'] })
    },
    onError: (err) => toast.error(err.message),
    onSettled: () => setDeleting(null),
  })

  return (
    <div className="flex flex-col gap-6">
      <PageHeader
        title={t('patterns.title')}
        description={t('patterns.help')}
        actions={<Button onClick={() => setEditing('new')}>{t('patterns.new')}</Button>}
      />
      {isPending ? (
        <LoadingState label={t('patterns.loading')} />
      ) : isError ? (
        <ErrorState message={error.message} />
      ) : data.patterns.length === 0 ? (
        <EmptyState icon="🧩" title={t('patterns.empty')} />
      ) : (
        <Card className="py-0">
          <Table>
            <TableHeader>
              <TableRow>
                <TableHead>{t('patterns.columns.name')}</TableHead>
                <TableHead>{t('patterns.columns.label')}</TableHead>
                <TableHead>{t('patterns.columns.scope')}</TableHead>
                <TableHead>{t('patterns.columns.usage')}</TableHead>
                <TableHead />
              </TableRow>
            </TableHeader>
            <TableBody>
              {data.patterns.map((p) => (
                <TableRow key={p.id} data-testid={`pattern-${p.name}`}>
                  <TableCell className="font-mono">
                    {p.name}
                    {p.origin === 'config' && (
                      <Badge variant="muted" className="ml-2">
                        {t('patterns.fromConfig')}
                      </Badge>
                    )}
                  </TableCell>
                  <TableCell>{p.label}</TableCell>
                  <TableCell>{p.course?.title ?? t('patterns.global')}</TableCell>
                  <TableCell className="font-mono text-xs">{`|||${p.name} …|||`}</TableCell>
                  <TableCell className="text-right">
                    <div className="flex justify-end gap-2">
                      <Button variant="outline" size="sm" onClick={() => setEditing(p)} aria-label={`${t('common:edit')} ${p.name}`}>
                        {t('common:edit')}
                      </Button>
                      <Button variant="outline" size="sm" className="text-destructive" onClick={() => setDeleting(p)} aria-label={`${t('common:delete')} ${p.name}`}>
                        {t('common:delete')}
                      </Button>
                    </div>
                  </TableCell>
                </TableRow>
              ))}
            </TableBody>
          </Table>
        </Card>
      )}
      {editing && <PatternDialog pattern={editing === 'new' ? null : editing} onClose={() => setEditing(null)} />}
      <AlertDialog open={!!deleting} onOpenChange={(open) => !open && setDeleting(null)}>
        <AlertDialogContent>
          <AlertDialogHeader>
            <AlertDialogTitle>{t('patterns.confirmDelete', { name: deleting?.name ?? '' })}</AlertDialogTitle>
            <AlertDialogDescription>{t('patterns.confirmDeleteBody')}</AlertDialogDescription>
          </AlertDialogHeader>
          <AlertDialogFooter>
            <AlertDialogCancel>{t('common:cancel')}</AlertDialogCancel>
            <AlertDialogAction
              variant="destructive"
              onClick={(e) => {
                e.preventDefault()
                if (deleting) remove.mutate(deleting.id)
              }}
            >
              {t('common:delete')}
            </AlertDialogAction>
          </AlertDialogFooter>
        </AlertDialogContent>
      </AlertDialog>
    </div>
  )
}

function PatternDialog({ pattern, onClose }: { pattern: MarkdownPattern | null; onClose: () => void }) {
  const { t } = useTranslation(['admin', 'common'])
  const queryClient = useQueryClient()
  const [values, setValues] = useState<PatternInput>({
    name: pattern?.name ?? '',
    label: pattern?.label ?? '',
    description: pattern?.description ?? '',
    parameter: pattern?.parameter ?? '',
    html: pattern?.html ?? '<span class="md-pat-NAME">{{content}}</span>',
    css: pattern?.css ?? '',
    courseId: pattern?.course?.id ?? null,
  })
  const [sample, setSample] = useState(`Texte avec |||${pattern?.name ?? 'nom'} un exemple|||.`)
  const courses = useQuery({ queryKey: ['admin-courses', ''], queryFn: () => unwrap(adminApi.courses.$get({ query: {} })) })
  const debounced = useDebouncedValue(JSON.stringify({ values, sample }), 300)
  const preview = useQuery({
    queryKey: ['admin-pattern-preview', debounced],
    queryFn: () =>
      unwrap(
        adminApi.patterns.preview.$post({
          json: { markdown: sample, pattern: values.name ? { name: values.name, html: values.html, css: values.css ?? null } : undefined },
        }),
      ),
  })
  const save = useMutation({
    mutationFn: () =>
      pattern
        ? unwrap(adminApi.patterns[':id'].$put({ param: { id: pattern.id }, json: values }))
        : unwrap(adminApi.patterns.$post({ json: values })),
    onSuccess: async () => {
      toast.success(pattern ? t('patterns.saved') : t('patterns.created'))
      await queryClient.invalidateQueries({ queryKey: ['admin-patterns'] })
      onClose()
    },
  })
  const set = (key: keyof PatternInput) => (e: { target: { value: string } }) => setValues((v) => ({ ...v, [key]: e.target.value }))

  return (
    <Dialog open onOpenChange={(open) => !open && onClose()}>
      <DialogContent className="max-h-[92vh] overflow-y-auto sm:max-w-4xl">
        <DialogHeader>
          <DialogTitle>{pattern ? t('patterns.editTitle') : t('patterns.newTitle')}</DialogTitle>
          <DialogDescription>{t('patterns.help')}</DialogDescription>
        </DialogHeader>
        {save.error && (
          <Alert variant="destructive">
            <AlertDescription>{save.error.message}</AlertDescription>
          </Alert>
        )}
        <div className="grid gap-6 md:grid-cols-2">
          <div className="flex flex-col gap-3">
            <div className="grid grid-cols-2 gap-3">
              <div className="flex flex-col gap-1.5">
                <Label htmlFor="pattern-name">{t('patterns.name')}</Label>
                <Input id="pattern-name" value={values.name} onChange={set('name')} placeholder="blink" className="font-mono" />
              </div>
              <div className="flex flex-col gap-1.5">
                <Label htmlFor="pattern-label">{t('patterns.label')}</Label>
                <Input id="pattern-label" value={values.label} onChange={set('label')} placeholder="Clignotant" />
              </div>
            </div>
            <div className="flex flex-col gap-1.5">
              <Label htmlFor="pattern-parameter">{t('patterns.parameter')}</Label>
              <Input id="pattern-parameter" value={values.parameter ?? ''} onChange={set('parameter')} placeholder={t('patterns.parameterPlaceholder')} />
            </div>
            <div className="flex flex-col gap-1.5">
              <Label htmlFor="pattern-scope">{t('patterns.scope')}</Label>
              <NativeSelect id="pattern-scope" value={values.courseId ?? ''} onChange={(e) => setValues((v) => ({ ...v, courseId: e.target.value || null }))}>
                <NativeSelectOption value="">{t('patterns.global')}</NativeSelectOption>
                {sortByTitle(courses.data?.courses ?? []).map((c) => (
                  <NativeSelectOption key={c.id} value={c.id}>
                    {c.title}
                  </NativeSelectOption>
                ))}
              </NativeSelect>
            </div>
            <div className="flex flex-col gap-1.5">
              <Label htmlFor="pattern-html">{t('patterns.html')}</Label>
              <Textarea id="pattern-html" value={values.html} onChange={set('html')} className="min-h-24 font-mono text-xs" />
              <span className="text-xs text-muted-foreground">{t('patterns.htmlHelp')}</span>
            </div>
            <div className="flex flex-col gap-1.5">
              <Label htmlFor="pattern-css">{t('patterns.css')}</Label>
              <Textarea id="pattern-css" value={values.css ?? ''} onChange={set('css')} className="min-h-24 font-mono text-xs" />
            </div>
          </div>
          <div className="flex flex-col gap-3">
            <div className="flex flex-col gap-1.5">
              <Label htmlFor="pattern-sample">{t('patterns.sample')}</Label>
              <Textarea id="pattern-sample" value={sample} onChange={(e) => setSample(e.target.value)} className="min-h-24 font-mono text-xs" />
            </div>
            <h3 className="text-sm font-semibold">{t('patterns.preview')}</h3>
            {preview.data?.styles && <style>{preview.data.styles}</style>}
            <div
              className="content prose max-w-none rounded-lg border p-3 dark:prose-invert"
              data-testid="pattern-preview"
              dangerouslySetInnerHTML={{ __html: preview.data?.html ?? '' }}
            />
          </div>
        </div>
        <DialogFooter>
          <Button variant="outline" onClick={onClose}>
            {t('common:cancel')}
          </Button>
          <Button disabled={save.isPending} onClick={() => save.mutate()}>
            {pattern ? t('common:save') : t('patterns.create')}
          </Button>
        </DialogFooter>
      </DialogContent>
    </Dialog>
  )
}
