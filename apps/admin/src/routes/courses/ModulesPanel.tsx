import { useTranslation } from '@pupitre/i18n'
import { type AdminModule, GITLAB_CHECK_TYPES, LAB_PROVIDERS, POLICY_CHECK_TYPE, type LabProvider, type LabStep, type ModuleInput } from '@pupitre/shared'
import { ErrorState, LoadingState, toast, unwrap } from '@pupitre/ui'
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
import { ArrowDownIcon, ArrowUpIcon, GripVerticalIcon, Trash2Icon } from 'lucide-react'
import { type FormEvent, useState } from 'react'
import { MediaField } from '../../components/MediaField.tsx'
import { adminApi } from '../../lib/api.ts'

type Editable = Omit<AdminModule, 'id'>

const toInput = (m: Editable): ModuleInput => ({
  slug: m.slug,
  name: m.name,
  type: m.type as ModuleInput['type'],
  hidden: m.hidden,
  inline: m.inline,
  prerequisites: m.prerequisites,
  skills: m.skills,
  content: m.content,
  lab: m.type === 'lab' ? m.lab : null,
})

/** "Qu'est-ce que Linux ?" → "qu-est-ce-que-linux" (module slugs; spec 185). */
function slugify(text: string) {
  return text
    .normalize('NFD')
    .replace(/\p{M}/gu, '')
    .toLowerCase()
    .replace(/[^a-z0-9]+/g, '-')
    .replace(/^-+|-+$/g, '')
}

/** Specs 171, 172: the course's modules — add, edit, delete, reorder (buttons or drag and drop). */
export function ModulesPanel({ courseId }: { courseId: string }) {
  const { t } = useTranslation(['admin', 'common'])
  const queryClient = useQueryClient()
  const [editing, setEditing] = useState<{ index: number | null } | null>(null)
  const [deleting, setDeleting] = useState<number | null>(null)
  const [dragged, setDragged] = useState<number | null>(null)
  const query = useQuery({
    queryKey: ['admin-modules', courseId],
    queryFn: () => unwrap(adminApi.courses[':id'].modules.$get({ param: { id: courseId } })),
  })
  const save = useMutation({
    mutationFn: (modules: Editable[]) =>
      unwrap(adminApi.courses[':id'].modules.$put({ param: { id: courseId }, json: { modules: modules.map(toInput) } })),
    onSuccess: (data) => queryClient.setQueryData(['admin-modules', courseId], data),
  })
  const modules = query.data?.modules ?? []

  function persist(next: Editable[], message: string, onDone?: () => void) {
    save.mutate(next, {
      onSuccess: () => {
        toast.success(message)
        onDone?.()
      },
      onError: (err) => {
        toast.error(err.message)
        void queryClient.invalidateQueries({ queryKey: ['admin-modules', courseId] })
      },
    })
  }

  function move(from: number, to: number) {
    if (to < 0 || to >= modules.length || from === to) return
    const next = [...modules]
    const [item] = next.splice(from, 1)
    next.splice(to, 0, item!)
    queryClient.setQueryData(['admin-modules', courseId], { modules: next })
    save.mutate(next, {
      onSuccess: () => toast.success(t('authoring.modules.reordered')),
      onError: () => {
        toast.error(t('authoring.modules.reorderError'))
        void queryClient.invalidateQueries({ queryKey: ['admin-modules', courseId] })
      },
    })
  }

  return (
    <section className="flex max-w-3xl flex-col gap-3 border-t pt-6">
      <div className="flex flex-wrap items-center justify-between gap-2">
        <h2 className="text-xl font-semibold tracking-tight">{t('authoring.modules.title', { count: modules.length })}</h2>
        <Button size="sm" onClick={() => setEditing({ index: null })}>
          {t('authoring.modules.add')}
        </Button>
      </div>
      {query.isPending ? (
        <LoadingState label={t('courses.loading')} rows={2} />
      ) : query.isError ? (
        <ErrorState message={query.error.message} />
      ) : modules.length === 0 ? (
        <p className="text-muted-foreground">{t('authoring.modules.empty')}</p>
      ) : (
        <ol className="flex flex-col divide-y rounded-lg border" aria-label={t('authoring.modules.title', { count: modules.length })}>
          {modules.map((m, i) => (
            <li
              key={m.id}
              draggable
              onDragStart={() => setDragged(i)}
              onDragOver={(e) => e.preventDefault()}
              onDrop={() => {
                if (dragged !== null) move(dragged, i)
                setDragged(null)
              }}
              className="flex flex-wrap items-center gap-2 bg-card px-3 py-2"
              data-testid={`module-row-${m.slug}`}
            >
              <GripVerticalIcon className="size-4 cursor-grab text-muted-foreground" aria-label={t('authoring.modules.dragHandle', { name: m.name })} />
              <span className="w-6 text-sm text-muted-foreground">{i + 1}.</span>
              <span className="flex min-w-0 flex-1 flex-col">
                <span className="flex flex-wrap items-center gap-1.5 font-medium">
                  {m.name}
                  <Badge variant="outline">{m.type}</Badge>
                  {m.hidden && <Badge variant="muted">{t('authoring.modules.hiddenBadge')}</Badge>}
                  {m.inline && <Badge variant="info">{t('authoring.modules.inlineBadge')}</Badge>}
                </span>
                <span className="truncate text-xs text-muted-foreground">
                  {m.content.kind === 'source'
                    ? `${m.content.path} · ${m.content.repo} @ ${m.content.ref}`
                    : m.content.kind === 'media'
                      ? m.content.url
                      : m.slug}
                </span>
              </span>
              {m.content.kind === 'source' && (
                <Button
                  variant="ghost"
                  size="icon"
                  aria-label={t('authoring.cache.module', { name: m.name })}
                  title={t('authoring.cache.module', { name: m.name })}
                  onClick={async () => {
                    try {
                      await unwrap(adminApi.courses[':id'].modules[':slug'].cache.clear.$post({ param: { id: courseId, slug: m.slug } }))
                      toast.success(t('authoring.cache.moduleDone'))
                    } catch (err) {
                      toast.error((err as Error).message)
                    }
                  }}
                >
                  <Trash2Icon />
                </Button>
              )}
              <Button variant="ghost" size="icon" disabled={i === 0 || save.isPending} onClick={() => move(i, i - 1)} aria-label={t('authoring.modules.moveUp', { name: m.name })}>
                <ArrowUpIcon />
              </Button>
              <Button
                variant="ghost"
                size="icon"
                disabled={i === modules.length - 1 || save.isPending}
                onClick={() => move(i, i + 1)}
                aria-label={t('authoring.modules.moveDown', { name: m.name })}
              >
                <ArrowDownIcon />
              </Button>
              <Button variant="outline" size="sm" onClick={() => setEditing({ index: i })} aria-label={`${t('authoring.modules.edit')} ${m.name}`}>
                {t('authoring.modules.edit')}
              </Button>
              <Button variant="outline" size="sm" className="text-destructive" onClick={() => setDeleting(i)} aria-label={`${t('authoring.modules.delete')} ${m.name}`}>
                {t('authoring.modules.delete')}
              </Button>
            </li>
          ))}
        </ol>
      )}

      {editing && (
        <ModuleDialog
          module={editing.index === null ? null : modules[editing.index]!}
          others={modules.filter((_, i) => i !== editing.index)}
          pending={save.isPending}
          error={save.error?.message}
          onClose={() => {
            setEditing(null)
            save.reset()
          }}
          onSave={(m) => {
            const next = editing.index === null ? [...modules, m] : modules.map((x, i) => (i === editing.index ? m : x))
            persist(next, editing.index === null ? t('authoring.modules.added') : t('authoring.modules.saved'), () => setEditing(null))
          }}
        />
      )}

      <AlertDialog open={deleting !== null} onOpenChange={(open) => !open && setDeleting(null)}>
        <AlertDialogContent>
          <AlertDialogHeader>
            <AlertDialogTitle>{deleting !== null && t('authoring.modules.confirmDelete', { name: modules[deleting]?.name ?? '' })}</AlertDialogTitle>
            <AlertDialogDescription>{t('authoring.modules.confirmDeleteBody')}</AlertDialogDescription>
          </AlertDialogHeader>
          <AlertDialogFooter>
            <AlertDialogCancel>{t('common:cancel')}</AlertDialogCancel>
            <AlertDialogAction
              variant="destructive"
              onClick={(e) => {
                e.preventDefault()
                if (deleting === null) return
                const name = modules[deleting]!.name
                const removedSlug = modules[deleting]!.slug
                const next = modules
                  .filter((_, i) => i !== deleting)
                  .map((m) => ({ ...m, prerequisites: m.prerequisites.filter((p) => p !== removedSlug) }))
                persist(next, t('authoring.modules.deleted', { name }), () => setDeleting(null))
              }}
            >
              {t('authoring.modules.delete')}
            </AlertDialogAction>
          </AlertDialogFooter>
        </AlertDialogContent>
      </AlertDialog>
    </section>
  )
}

function ModuleDialog({
  module,
  others,
  pending,
  error,
  onClose,
  onSave,
}: {
  module: Editable | null
  others: Editable[]
  pending: boolean
  error?: string
  onClose: () => void
  onSave: (m: Editable) => void
}) {
  const { t } = useTranslation(['admin', 'common'])
  const [type, setType] = useState<ModuleInput['type']>((module?.type as ModuleInput['type']) ?? 'text')
  const media = type === 'video' || type === 'image'
  const [kind, setKind] = useState<'inline' | 'source'>(module?.content.kind === 'source' ? 'source' : 'inline')
  const [mediaUrl, setMediaUrl] = useState(module?.content.kind === 'media' ? module.content.url : '')
  const [labProvider, setLabProvider] = useState<LabProvider>(module?.lab?.provider ?? 'gitlab')
  const [labUrl, setLabUrl] = useState(module?.lab?.labUrl ?? '')
  const [steps, setSteps] = useState(
    (module?.lab?.steps ?? []).map((st) => ({ title: st.title, checkType: st.checkType, params: JSON.stringify(st.checkParams, null, 2) })),
  )
  const [paramsInvalid, setParamsInvalid] = useState(false)
  const [body, setBody] = useState(module?.content.kind === 'inline' ? module.content.body : '')
  const [invalid, setInvalid] = useState(false)

  function submit(e: FormEvent<HTMLFormElement>) {
    e.preventDefault()
    const form = new FormData(e.currentTarget)
    const name = String(form.get('name') ?? '').trim()
    if (!name) return setInvalid(true)
    setInvalid(false)
    let labSteps: LabStep[] = []
    if (type === 'lab') {
      try {
        labSteps = steps.map((st) => {
          const params = st.params.trim() ? JSON.parse(st.params) : {}
          if (typeof params !== 'object' || params === null || Array.isArray(params)) throw new Error('not an object')
          return { title: st.title.trim(), checkType: st.checkType.trim(), checkParams: params as Record<string, unknown> }
        })
      } catch {
        return setParamsInvalid(true)
      }
    }
    setParamsInvalid(false)
    const slug = String(form.get('slug') ?? '').trim() || slugify(name) || 'module'
    onSave({
      slug,
      name,
      type: type as Editable['type'],
      hidden: form.get('hidden') === 'on',
      inline: type === 'quiz' && form.get('inline') === 'on',
      skills: String(form.get('skills') ?? '')
        .split(',')
        .map((s) => s.trim().toLowerCase().replace(/\s+/g, '-'))
        .filter(Boolean),
      prerequisites: form.getAll('prerequisites').map(String),
      lab: type === 'lab' ? { provider: labProvider, labUrl: labUrl.trim() || null, steps: labSteps } : null,
      // Writing a body clears the git fields and the other way round (spec 171).
      content: media
        ? { kind: 'media', url: mediaUrl.trim(), replicate: form.get('replicate') === 'on' }
        : kind === 'inline'
          ? { kind: 'inline', body }
          : {
              kind: 'source',
              repo: String(form.get('repo') ?? '').trim(),
              ref: String(form.get('ref') ?? '').trim() || 'main',
              path: String(form.get('path') ?? '').trim(),
            },
    })
  }

  return (
    <Dialog open onOpenChange={(open) => !open && onClose()}>
      <DialogContent className="max-h-[90vh] overflow-y-auto sm:max-w-2xl">
        <form onSubmit={submit} noValidate className="flex flex-col gap-4">
          <DialogHeader>
            <DialogTitle>{module ? t('authoring.modules.editTitle') : t('authoring.modules.newTitle')}</DialogTitle>
            <DialogDescription className="sr-only">{t('authoring.modules.newTitle')}</DialogDescription>
          </DialogHeader>
          {(invalid || error) && (
            <Alert variant="destructive">
              <AlertDescription>{invalid ? t('authoring.modules.nameRequired') : error}</AlertDescription>
            </Alert>
          )}
          <div className="grid gap-4 sm:grid-cols-2">
            <div className="flex flex-col gap-1.5">
              <Label htmlFor="module-name">{t('authoring.modules.name')}</Label>
              <Input id="module-name" name="name" defaultValue={module?.name} />
            </div>
            <div className="flex flex-col gap-1.5">
              <Label htmlFor="module-slug">{t('authoring.modules.slug')}</Label>
              <Input id="module-slug" name="slug" defaultValue={module?.slug} />
              <span className="text-xs text-muted-foreground">{t('authoring.modules.slugHelp')}</span>
            </div>
            <div className="flex flex-col gap-1.5">
              <Label htmlFor="module-type">{t('authoring.modules.type')}</Label>
              <NativeSelect id="module-type" value={type} onChange={(e) => setType(e.target.value as ModuleInput['type'])}>
                {(['text', 'quiz', 'video', 'image', 'lab'] as const).map((ty) => (
                  <NativeSelectOption key={ty} value={ty}>
                    {t(`authoring.modules.types.${ty}`)}
                  </NativeSelectOption>
                ))}
              </NativeSelect>
            </div>
            {!media && (
            <div className="flex flex-col gap-1.5">
              <Label htmlFor="module-source">{t('authoring.modules.source')}</Label>
              <NativeSelect id="module-source" value={kind} onChange={(e) => setKind(e.target.value as 'inline' | 'source')}>
                <NativeSelectOption value="inline">{t('authoring.modules.sources.inline')}</NativeSelectOption>
                <NativeSelectOption value="source">{t('authoring.modules.sources.source')}</NativeSelectOption>
              </NativeSelect>
            </div>
            )}
          </div>
          {media ? (
            <div className="flex flex-col gap-2">
              <Label htmlFor="module-media">{t('authoring.modules.mediaUrl')}</Label>
              <MediaField id="module-media" value={mediaUrl} onChange={setMediaUrl} accept={type === 'video' ? 'video/*' : 'image/*'} />
              <span className="text-xs text-muted-foreground">{t('authoring.modules.mediaHelp')}</span>
              <label className="flex items-start gap-2 text-sm">
                <input
                  type="checkbox"
                  name="replicate"
                  defaultChecked={module?.content.kind === 'media' && module.content.replicate}
                  className="mt-0.5 accent-primary"
                />
                <span className="flex flex-col">
                  {t('authoring.modules.replicate')}
                  <span className="text-xs text-muted-foreground">{t('authoring.modules.replicateHelp')}</span>
                </span>
              </label>
            </div>
          ) : kind === 'inline' ? (
            <div className="flex flex-col gap-1.5">
              <div className="flex items-center justify-between gap-2">
                <Label htmlFor="module-body">{type === 'quiz' ? t('authoring.modules.quizBody') : t('authoring.modules.body')}</Label>
                <label className="cursor-pointer text-sm text-primary hover:underline">
                  {t('authoring.modules.loadFile')}
                  <input
                    type="file"
                    accept=".md,.markdown,.txt,.yaml,.yml"
                    className="sr-only"
                    onChange={async (e) => {
                      const file = e.target.files?.[0]
                      if (file) setBody(await file.text())
                    }}
                  />
                </label>
              </div>
              <Textarea id="module-body" value={body} onChange={(e) => setBody(e.target.value)} className="min-h-56 font-mono text-sm" />
            </div>
          ) : (
            <div className="grid gap-4 sm:grid-cols-3">
              <div className="flex flex-col gap-1.5 sm:col-span-3">
                <Label htmlFor="module-repo">{t('authoring.modules.repo')}</Label>
                <Input id="module-repo" name="repo" defaultValue={module?.content.kind === 'source' ? module.content.repo : ''} placeholder="https://git.example.com/group/repo.git" />
              </div>
              <div className="flex flex-col gap-1.5">
                <Label htmlFor="module-ref">{t('authoring.modules.ref')}</Label>
                <Input id="module-ref" name="ref" defaultValue={module?.content.kind === 'source' ? module.content.ref : 'main'} />
              </div>
              <div className="flex flex-col gap-1.5 sm:col-span-2">
                <Label htmlFor="module-path">{t('authoring.modules.path')}</Label>
                <Input id="module-path" name="path" defaultValue={module?.content.kind === 'source' ? module.content.path : ''} placeholder="01-intro.md" />
              </div>
            </div>
          )}
          {type === 'lab' && (
            <fieldset className="flex flex-col gap-3 rounded-lg border p-3">
              <legend className="px-1 text-sm font-medium">{t('authoring.modules.labTitle')}</legend>
              <div className="grid gap-3 sm:grid-cols-2">
                <div className="flex flex-col gap-1.5">
                  <Label htmlFor="lab-provider">{t('authoring.modules.provider')}</Label>
                  <NativeSelect id="lab-provider" value={labProvider} onChange={(e) => setLabProvider(e.target.value as LabProvider)}>
                    {LAB_PROVIDERS.map((p) => (
                      <NativeSelectOption key={p} value={p}>
                        {t(`authoring.modules.providers.${p}`)}
                      </NativeSelectOption>
                    ))}
                  </NativeSelect>
                </div>
                <div className="flex flex-col gap-1.5">
                  <Label htmlFor="lab-url">{t('authoring.modules.labUrl')}</Label>
                  <Input id="lab-url" value={labUrl} onChange={(e) => setLabUrl(e.target.value)} placeholder="https://gitlab.example.com/e-learning/{{username}}" />
                  <span className="text-xs text-muted-foreground">{t('authoring.modules.labUrlHelp', { username: '{{username}}', interpolation: { skipOnVariables: true } })}</span>
                </div>
              </div>
              <h4 className="text-sm font-medium">{t('authoring.modules.steps')}</h4>
              <p className="text-xs text-muted-foreground">{t('authoring.modules.stepsHelp')}</p>
              {paramsInvalid && <p className="text-sm text-destructive">{t('authoring.modules.checkParamsInvalid')}</p>}
              {steps.map((st, i) => (
                <div key={i} className="flex flex-col gap-2 rounded-md border p-2" data-testid={`step-editor-${i}`}>
                  <div className="flex flex-wrap items-end gap-2">
                    <label className="flex min-w-48 flex-1 flex-col gap-1 text-sm">
                      {t('authoring.modules.stepTitle')}
                      <Input value={st.title} onChange={(e) => setSteps((l) => l.map((x, j) => (j === i ? { ...x, title: e.target.value } : x)))} />
                    </label>
                    <label className="flex min-w-48 flex-col gap-1 text-sm">
                      {t('authoring.modules.checkType')}
                      <Input
                        list="gitlab-check-types"
                        value={st.checkType}
                        onChange={(e) => setSteps((l) => l.map((x, j) => (j === i ? { ...x, checkType: e.target.value } : x)))}
                      />
                    </label>
                    <Button
                      type="button"
                      variant="ghost"
                      size="icon"
                      aria-label={t('authoring.modules.removeStep', { n: i + 1 })}
                      onClick={() => setSteps((l) => l.filter((_, j) => j !== i))}
                    >
                      <Trash2Icon />
                    </Button>
                  </div>
                  <label className="flex flex-col gap-1 text-sm">
                    {t('authoring.modules.checkParams')}
                    <Textarea
                      value={st.params}
                      onChange={(e) => setSteps((l) => l.map((x, j) => (j === i ? { ...x, params: e.target.value } : x)))}
                      className="min-h-16 font-mono text-xs"
                      placeholder='{"project": "e-learning/{{username}}", "pattern": "^feature/"}'
                    />
                  </label>
                </div>
              ))}
              <datalist id="gitlab-check-types">
                {GITLAB_CHECK_TYPES.map((c) => (
                  <option key={c} value={c} />
                ))}
                <option value={POLICY_CHECK_TYPE} />
              </datalist>
              <Button
                type="button"
                variant="outline"
                size="sm"
                className="self-start"
                onClick={() => setSteps((l) => [...l, { title: '', checkType: labProvider === 'gitlab' ? 'gitlab_branch' : '', params: '{}' }])}
              >
                {t('authoring.modules.addStep')}
              </Button>
            </fieldset>
          )}
          <div className="flex flex-col gap-1.5">
            <Label htmlFor="module-skills">{t('authoring.modules.skills')}</Label>
            <Input id="module-skills" name="skills" defaultValue={module?.skills.join(', ')} />
            <span className="text-xs text-muted-foreground">{t('authoring.modules.skillsHelp')}</span>
          </div>
          {others.length > 0 && (
            <fieldset className="flex flex-col gap-1.5">
              <legend className="mb-1 text-sm font-medium">{t('authoring.modules.prerequisites')}</legend>
              <div className="flex flex-wrap gap-x-4 gap-y-1">
                {others.map((o) => (
                  <label key={o.slug} className="flex items-center gap-1.5 text-sm">
                    <input type="checkbox" name="prerequisites" value={o.slug} defaultChecked={module?.prerequisites.includes(o.slug)} className="accent-primary" />
                    {o.name}
                  </label>
                ))}
              </div>
            </fieldset>
          )}
          <div className="flex flex-wrap gap-6">
            <label className="flex items-start gap-2 text-sm">
              <input type="checkbox" name="hidden" defaultChecked={module?.hidden} className="mt-0.5 accent-primary" />
              <span className="flex flex-col">
                {t('authoring.modules.hidden')}
                <span className="text-xs text-muted-foreground">{t('authoring.modules.hiddenHelp')}</span>
              </span>
            </label>
            {type === 'quiz' && (
              <label className="flex items-start gap-2 text-sm">
                <input type="checkbox" name="inline" defaultChecked={module?.inline} className="mt-0.5 accent-primary" />
                <span className="flex flex-col">
                  {t('authoring.modules.inline')}
                  <span className="text-xs text-muted-foreground">{t('authoring.modules.inlineHelp')}</span>
                </span>
              </label>
            )}
          </div>
          <DialogFooter>
            <Button type="button" variant="outline" onClick={onClose}>
              {t('common:cancel')}
            </Button>
            <Button type="submit" disabled={pending}>
              {module ? t('authoring.modules.save') : t('authoring.modules.addButton')}
            </Button>
          </DialogFooter>
        </form>
      </DialogContent>
    </Dialog>
  )
}
