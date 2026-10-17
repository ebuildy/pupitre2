import { useTranslation } from '@pupitre/i18n'
import { PATH_KINDS, type PathKind, SLUG_PATTERN } from '@pupitre/shared'
import { EmptyState, ErrorState, LoadingState, PageHeader, StatusBadge, unwrap, useDebouncedValue } from '@pupitre/ui'
import { Alert, AlertDescription } from '@pupitre/ui/components/ui/alert'
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
import { keepPreviousData, useMutation, useQuery, useQueryClient } from '@tanstack/react-query'
import { type FormEvent, useState } from 'react'
import { Link, useNavigate } from 'react-router'
import { adminApi } from '../../lib/api.ts'

/** Spec 126: paths, search, "+ Nouveau parcours" (then the path page for members and enrollments). */
export function PathList() {
  const { t } = useTranslation(['admin', 'common'])
  const [search, setSearch] = useState('')
  const [creating, setCreating] = useState(false)
  const q = useDebouncedValue(search.trim(), 250)
  const { data, isPending, isError, error } = useQuery({
    queryKey: ['admin-paths', q],
    queryFn: () => unwrap(adminApi.paths.$get({ query: { search: q || undefined } })),
    placeholderData: keepPreviousData,
  })

  return (
    <div className="flex flex-col gap-6">
      <PageHeader
        title={t('paths.title')}
        description={data ? t('paths.count', { count: data.paths.length }) : undefined}
        actions={<Button onClick={() => setCreating(true)}>{t('paths.new')}</Button>}
      />
      <Input
        type="search"
        value={search}
        onChange={(e) => setSearch(e.target.value)}
        placeholder={t('paths.searchPlaceholder')}
        aria-label={t('paths.searchLabel')}
        className="h-10 max-w-sm"
      />
      {isPending ? (
        <LoadingState label={t('paths.loading')} />
      ) : isError ? (
        <ErrorState message={error.message} />
      ) : data.paths.length === 0 ? (
        <EmptyState icon="🗺️" title={t('paths.empty')} />
      ) : (
        <Card className="py-0">
          <Table>
            <TableHeader>
              <TableRow>
                <TableHead>{t('paths.form.title')}</TableHead>
                <TableHead>{t('paths.form.kind')}</TableHead>
                <TableHead>{t('paths.form.status')}</TableHead>
                <TableHead className="text-right">{t('paths.columns.user')}</TableHead>
              </TableRow>
            </TableHeader>
            <TableBody>
              {data.paths.map((p) => (
                <TableRow key={p.id}>
                  <TableCell>
                    <Link to={`/paths/${p.id}`} className="font-medium hover:underline">
                      {p.title}
                    </Link>
                    <div className="text-xs text-muted-foreground">
                      {p.slug} · {t('paths.items', { count: p.items.length })}
                    </div>
                  </TableCell>
                  <TableCell>
                    <Badge variant="outline">{t(`common:pathKinds.${p.kind}`)}</Badge>
                    {p.level && <span className="ml-2 text-sm">{t(`common:difficulty.${p.level}`)}</span>}
                  </TableCell>
                  <TableCell>
                    <StatusBadge status={p.status} />
                  </TableCell>
                  <TableCell className="text-right">{t('paths.enrollments', { count: p.enrollmentCount })}</TableCell>
                </TableRow>
              ))}
            </TableBody>
          </Table>
        </Card>
      )}
      <NewPathDialog open={creating} onOpenChange={setCreating} />
    </div>
  )
}

function NewPathDialog({ open, onOpenChange }: { open: boolean; onOpenChange: (open: boolean) => void }) {
  const { t } = useTranslation(['admin', 'common'])
  const queryClient = useQueryClient()
  const navigate = useNavigate()
  const [invalid, setInvalid] = useState<'titleRequired' | 'slugInvalid' | null>(null)
  const create = useMutation({
    mutationFn: (input: { slug: string; title: string; kind: PathKind }) => unwrap(adminApi.paths.$post({ json: input })),
    onSuccess: async (created) => {
      await queryClient.invalidateQueries({ queryKey: ['admin-paths'] })
      navigate(`/paths/${created.id}`)
    },
  })
  function submit(e: FormEvent<HTMLFormElement>) {
    e.preventDefault()
    const form = new FormData(e.currentTarget)
    const title = String(form.get('title') ?? '').trim()
    const slug = String(form.get('slug') ?? '').trim()
    if (!title) return setInvalid('titleRequired')
    if (!SLUG_PATTERN.test(slug)) return setInvalid('slugInvalid')
    setInvalid(null)
    create.mutate({ title, slug, kind: String(form.get('kind')) as PathKind })
  }
  return (
    <Dialog open={open} onOpenChange={onOpenChange}>
      <DialogContent>
        <form onSubmit={submit} noValidate className="flex flex-col gap-4">
          <DialogHeader>
            <DialogTitle>{t('paths.form.newTitle')}</DialogTitle>
            <DialogDescription className="sr-only">{t('paths.form.newTitle')}</DialogDescription>
          </DialogHeader>
          {(invalid || create.error) && (
            <Alert variant="destructive">
              <AlertDescription>{invalid ? t(`paths.form.${invalid}`) : create.error?.message}</AlertDescription>
            </Alert>
          )}
          <div className="flex flex-col gap-1.5">
            <Label htmlFor="path-title">{t('paths.form.title')}</Label>
            <Input id="path-title" name="title" />
          </div>
          <div className="flex flex-col gap-1.5">
            <Label htmlFor="path-slug">{t('paths.form.slug')}</Label>
            <Input id="path-slug" name="slug" placeholder="devops-path" />
          </div>
          <div className="flex flex-col gap-1.5">
            <Label htmlFor="path-kind">{t('paths.form.kind')}</Label>
            <NativeSelect id="path-kind" name="kind" defaultValue="course">
              {PATH_KINDS.map((k) => (
                <NativeSelectOption key={k} value={k}>
                  {t(`common:pathKinds.${k}`)}
                </NativeSelectOption>
              ))}
            </NativeSelect>
          </div>
          <DialogFooter>
            <Button type="button" variant="outline" onClick={() => onOpenChange(false)}>
              {t('common:cancel')}
            </Button>
            <Button type="submit" disabled={create.isPending}>
              {t('paths.form.create')}
            </Button>
          </DialogFooter>
        </form>
      </DialogContent>
    </Dialog>
  )
}
