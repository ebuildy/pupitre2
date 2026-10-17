import { useTranslation } from '@pupitre/i18n'
import {
  type AdminPath,
  type AdminUserSearchResult,
  COURSE_STATUSES,
  DIFFICULTIES,
  PATH_KINDS,
  type PathUpdateInput,
  SKILL_SLUG_PATTERN,
  SLUG_PATTERN,
} from '@pupitre/shared'
import { ErrorState, isNotFound, LoadingState, PageHeader, sortByTitle, toast, unwrap } from '@pupitre/ui'
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
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from '@pupitre/ui/components/ui/card'
import { Input } from '@pupitre/ui/components/ui/input'
import { Label } from '@pupitre/ui/components/ui/label'
import { NativeSelect, NativeSelectOption } from '@pupitre/ui/components/ui/native-select'
import { Table, TableBody, TableCell, TableHead, TableHeader, TableRow } from '@pupitre/ui/components/ui/table'
import { Textarea } from '@pupitre/ui/components/ui/textarea'
import { useMutation, useQuery, useQueryClient } from '@tanstack/react-query'
import { ArrowDownIcon, ArrowUpIcon, XIcon } from 'lucide-react'
import { type FormEvent, useState } from 'react'
import { Link, useNavigate, useParams } from 'react-router'
import { UserPicker, userLabel } from '../../components/UserPicker.tsx'
import { adminApi } from '../../lib/api.ts'

function useSavePath(id: string) {
  const queryClient = useQueryClient()
  const { t } = useTranslation('admin')
  return useMutation({
    mutationFn: (input: PathUpdateInput) => unwrap(adminApi.paths[':id'].$patch({ param: { id }, json: input })),
    onSuccess: async (saved) => {
      queryClient.setQueryData(['admin-path', id], saved)
      toast.success(t('paths.saved'))
      await queryClient.invalidateQueries({ queryKey: ['admin-paths'] })
      await queryClient.invalidateQueries({ queryKey: ['admin-path-enrollments', id] })
    },
  })
}

/** Specs 126, 127: settings, ordered members, enrollments. */
export function PathDetail() {
  const { id = '' } = useParams()
  const { t } = useTranslation(['admin', 'common'])
  const navigate = useNavigate()
  const queryClient = useQueryClient()
  const [deleting, setDeleting] = useState(false)
  const path = useQuery({ queryKey: ['admin-path', id], queryFn: () => unwrap(adminApi.paths[':id'].$get({ param: { id } })) })
  const remove = useMutation({
    mutationFn: () => unwrap(adminApi.paths[':id'].$delete({ param: { id } })),
    onSuccess: async () => {
      toast.success(t('paths.deleted'))
      await queryClient.invalidateQueries({ queryKey: ['admin-paths'] })
      navigate('/paths', { replace: true })
    },
    onError: (err) => toast.error(err.message),
  })

  return (
    <div className="flex flex-col gap-6">
      <Link to="/paths" className="text-sm text-muted-foreground hover:text-foreground">
        {t('paths.back')}
      </Link>
      {path.isPending ? (
        <LoadingState label={t('paths.loading')} />
      ) : path.isError ? (
        <ErrorState message={isNotFound(path.error) ? t('paths.notFound') : path.error.message} />
      ) : (
        <>
          <PageHeader
            title={path.data.title}
            description={path.data.slug}
            actions={
              <Button variant="outline" className="text-destructive" onClick={() => setDeleting(true)}>
                {t('paths.delete')}
              </Button>
            }
          />
          <SettingsCard key={`settings-${path.data.updatedAt}`} path={path.data} />
          <MembersCard key={`members-${path.data.updatedAt}`} path={path.data} />
          <EnrollmentsCard path={path.data} />
          <AlertDialog open={deleting} onOpenChange={setDeleting}>
            <AlertDialogContent>
              <AlertDialogHeader>
                <AlertDialogTitle>{t('paths.confirmDeleteTitle', { title: path.data.title })}</AlertDialogTitle>
                <AlertDialogDescription>{t('paths.confirmDeleteBody')}</AlertDialogDescription>
              </AlertDialogHeader>
              <AlertDialogFooter>
                <AlertDialogCancel>{t('common:cancel')}</AlertDialogCancel>
                <AlertDialogAction
                  variant="destructive"
                  onClick={(e) => {
                    e.preventDefault()
                    remove.mutate()
                  }}
                >
                  {t('paths.delete')}
                </AlertDialogAction>
              </AlertDialogFooter>
            </AlertDialogContent>
          </AlertDialog>
        </>
      )}
    </div>
  )
}

function SettingsCard({ path }: { path: AdminPath }) {
  const { t } = useTranslation(['admin', 'common'])
  const save = useSavePath(path.id)
  const [invalid, setInvalid] = useState<'titleRequired' | 'slugInvalid' | null>(null)
  const [kind, setKind] = useState(path.kind)

  function submit(e: FormEvent<HTMLFormElement>) {
    e.preventDefault()
    const form = new FormData(e.currentTarget)
    const title = String(form.get('title') ?? '').trim()
    const slug = String(form.get('slug') ?? '').trim()
    if (!title) return setInvalid('titleRequired')
    if (!SLUG_PATTERN.test(slug)) return setInvalid('slugInvalid')
    setInvalid(null)
    save.mutate({
      title,
      slug,
      description: String(form.get('description') ?? ''),
      kind,
      level: (String(form.get('level')) || null) as PathUpdateInput['level'],
      status: String(form.get('status')) as PathUpdateInput['status'],
    })
  }

  return (
    <Card>
      <CardContent>
        <form onSubmit={submit} noValidate className="grid max-w-2xl gap-4 sm:grid-cols-2">
          {(invalid || save.error) && (
            <Alert variant="destructive" className="sm:col-span-2">
              <AlertDescription>{invalid ? t(`paths.form.${invalid}`) : save.error?.message}</AlertDescription>
            </Alert>
          )}
          <div className="flex flex-col gap-1.5">
            <Label htmlFor="path-title">{t('paths.form.title')}</Label>
            <Input id="path-title" name="title" defaultValue={path.title} />
          </div>
          <div className="flex flex-col gap-1.5">
            <Label htmlFor="path-slug">{t('paths.form.slug')}</Label>
            <Input id="path-slug" name="slug" defaultValue={path.slug} />
          </div>
          <div className="flex flex-col gap-1.5 sm:col-span-2">
            <Label htmlFor="path-description">{t('paths.form.description')}</Label>
            <Textarea id="path-description" name="description" defaultValue={path.description ?? ''} />
          </div>
          <div className="flex flex-col gap-1.5">
            <Label htmlFor="path-kind">{t('paths.form.kind')}</Label>
            <NativeSelect id="path-kind" value={kind} onChange={(e) => setKind(e.target.value as AdminPath['kind'])}>
              {PATH_KINDS.map((k) => (
                <NativeSelectOption key={k} value={k}>
                  {t(`common:pathKinds.${k}`)}
                </NativeSelectOption>
              ))}
            </NativeSelect>
            {kind !== path.kind && path.items.length > 0 && (
              <p className="text-xs text-destructive">{t('paths.members.kindChange')}</p>
            )}
          </div>
          <div className="flex flex-col gap-1.5">
            <Label htmlFor="path-level">{t('paths.form.level')}</Label>
            <NativeSelect id="path-level" name="level" defaultValue={path.level ?? ''}>
              <NativeSelectOption value="">{t('paths.form.noLevel')}</NativeSelectOption>
              {DIFFICULTIES.map((d) => (
                <NativeSelectOption key={d} value={d}>
                  {t(`common:difficulty.${d}`)}
                </NativeSelectOption>
              ))}
            </NativeSelect>
          </div>
          <div className="flex flex-col gap-1.5">
            <Label htmlFor="path-status">{t('paths.form.status')}</Label>
            <NativeSelect id="path-status" name="status" defaultValue={path.status}>
              {COURSE_STATUSES.map((s) => (
                <NativeSelectOption key={s} value={s}>
                  {t(`common:status.${s}`)}
                </NativeSelectOption>
              ))}
            </NativeSelect>
          </div>
          <div className="sm:col-span-2">
            <Button type="submit" disabled={save.isPending}>
              {save.isPending ? t('common:saving') : t('common:save')}
            </Button>
          </div>
        </form>
      </CardContent>
    </Card>
  )
}

type Member = { key: string; title: string }

function MembersCard({ path }: { path: AdminPath }) {
  const { t } = useTranslation(['admin', 'common'])
  const save = useSavePath(path.id)
  // Course ids or skill slugs, in order.
  const [members, setMembers] = useState<Member[]>(
    path.items.map((i) => ({ key: i.kind === 'course' ? i.id : i.slug, title: i.title })),
  )
  const [skillInput, setSkillInput] = useState('')
  const courses = useQuery({
    queryKey: ['admin-courses', ''],
    queryFn: () => unwrap(adminApi.courses.$get({ query: {} })),
    enabled: path.kind === 'course',
  })
  const skills = useQuery({ queryKey: ['admin-skills'], queryFn: () => unwrap(adminApi.skills.$get()), enabled: path.kind === 'skill' })

  const keys = new Set(members.map((m) => m.key))
  const candidates = sortByTitle((courses.data?.courses ?? []).filter((c) => !keys.has(c.id)))
  const dirty = JSON.stringify(members.map((m) => m.key)) !== JSON.stringify(path.items.map((i) => (i.kind === 'course' ? i.id : i.slug)))

  function move(index: number, delta: number) {
    setMembers((list) => {
      const next = [...list]
      const [item] = next.splice(index, 1)
      next.splice(index + delta, 0, item!)
      return next
    })
  }

  function addSkill() {
    const slug = skillInput.trim().toLowerCase().replace(/\s+/g, '-')
    if (!SKILL_SLUG_PATTERN.test(slug) || keys.has(slug)) return
    const known = skills.data?.skills.find((s) => s.slug === slug)
    setMembers((list) => [...list, { key: slug, title: known?.label ?? slug }])
    setSkillInput('')
  }

  return (
    <Card>
      <CardHeader>
        <CardTitle>
          <h2>{t('paths.members.title')}</h2>
        </CardTitle>
        {path.kind === 'course' && <CardDescription>{t('paths.members.courseHelp')}</CardDescription>}
      </CardHeader>
      <CardContent className="flex flex-col gap-3">
        {members.length === 0 ? (
          <p className="text-muted-foreground">{t('paths.members.empty')}</p>
        ) : (
          <ol className="flex flex-col divide-y rounded-lg border" aria-label={t('paths.members.title')}>
            {members.map((m, i) => (
              <li key={m.key} className="flex items-center gap-2 px-3 py-2">
                <span className="w-6 text-sm text-muted-foreground">{i + 1}.</span>
                <span className="flex-1">{m.title}</span>
                <Button variant="ghost" size="icon" disabled={i === 0} onClick={() => move(i, -1)} aria-label={t('paths.members.moveUp', { title: m.title })}>
                  <ArrowUpIcon />
                </Button>
                <Button
                  variant="ghost"
                  size="icon"
                  disabled={i === members.length - 1}
                  onClick={() => move(i, 1)}
                  aria-label={t('paths.members.moveDown', { title: m.title })}
                >
                  <ArrowDownIcon />
                </Button>
                <Button
                  variant="ghost"
                  size="icon"
                  onClick={() => setMembers((list) => list.filter((x) => x.key !== m.key))}
                  aria-label={t('paths.members.remove', { title: m.title })}
                >
                  <XIcon />
                </Button>
              </li>
            ))}
          </ol>
        )}
        {path.kind === 'course' ? (
          <NativeSelect
            aria-label={t('paths.members.addCourse')}
            value=""
            onChange={(e) => {
              const c = candidates.find((x) => x.id === e.target.value)
              if (c) setMembers((list) => [...list, { key: c.id, title: c.title }])
            }}
            className="max-w-md"
          >
            <NativeSelectOption value="">{t('paths.members.addCourse')}</NativeSelectOption>
            {candidates.map((c) => (
              <NativeSelectOption key={c.id} value={c.id}>
                {c.title} ({c.slug})
              </NativeSelectOption>
            ))}
          </NativeSelect>
        ) : (
          <div className="flex max-w-md gap-2">
            <Input
              list="known-skills"
              value={skillInput}
              placeholder={t('paths.members.addSkill')}
              aria-label={t('paths.members.addSkill')}
              onChange={(e) => setSkillInput(e.target.value)}
              onKeyDown={(e) => {
                if (e.key === 'Enter') {
                  e.preventDefault()
                  addSkill()
                }
              }}
            />
            <datalist id="known-skills">
              {skills.data?.skills.map((s) => <option key={s.slug} value={s.slug} label={s.label} />)}
            </datalist>
            <Button type="button" variant="outline" onClick={addSkill}>
              {t('paths.members.addSkillButton')}
            </Button>
          </div>
        )}
        <div>
          <Button disabled={!dirty || save.isPending} onClick={() => save.mutate({ items: members.map((m) => m.key) })}>
            {save.isPending ? t('common:saving') : t('common:save')}
          </Button>
        </div>
      </CardContent>
    </Card>
  )
}

function EnrollmentsCard({ path }: { path: AdminPath }) {
  const { t, i18n } = useTranslation(['admin', 'common'])
  const queryClient = useQueryClient()
  const [picked, setPicked] = useState<AdminUserSearchResult | null>(null)
  const enrollments = useQuery({
    queryKey: ['admin-path-enrollments', path.id],
    queryFn: () => unwrap(adminApi.paths[':id'].enrollments.$get({ param: { id: path.id } })),
  })
  const refresh = async () => {
    await queryClient.invalidateQueries({ queryKey: ['admin-path-enrollments', path.id] })
    await queryClient.invalidateQueries({ queryKey: ['admin-paths'] })
    await queryClient.invalidateQueries({ queryKey: ['admin-path', path.id] })
  }
  const enroll = useMutation({
    mutationFn: (userId: string) => unwrap(adminApi.paths[':id'].enrollments.$post({ param: { id: path.id }, json: { userId } })),
    onSuccess: async () => {
      toast.success(t('paths.enrolled'))
      setPicked(null)
      await refresh()
    },
    onError: (err) => toast.error(err.message),
  })
  const unenroll = useMutation({
    mutationFn: (userId: string) =>
      unwrap(adminApi.paths[':id'].enrollments[':userId'].$delete({ param: { id: path.id, userId } })),
    onSuccess: async () => {
      toast.success(t('paths.unenrolled'))
      await refresh()
    },
    onError: (err) => toast.error(err.message),
  })
  const count = enrollments.data?.users.length ?? 0

  return (
    <Card>
      <CardHeader>
        <CardTitle>
          <h2>{t('paths.enrollmentsTitle', { count })}</h2>
        </CardTitle>
      </CardHeader>
      <CardContent className="flex flex-col gap-4">
        <form
          className="flex flex-wrap items-end gap-2"
          onSubmit={(e) => {
            e.preventDefault()
            if (picked) enroll.mutate(picked.id)
          }}
        >
          <UserPicker value={picked} onChange={setPicked} />
          <Button type="submit" className="h-10" disabled={!picked || enroll.isPending}>
            {t('paths.enroll')}
          </Button>
        </form>
        {enrollments.isPending ? (
          <LoadingState label={t('paths.loading')} rows={1} />
        ) : enrollments.isError ? (
          <ErrorState message={enrollments.error.message} />
        ) : enrollments.data.users.length === 0 ? (
          <p className="text-muted-foreground">{t('paths.enrollmentsEmpty')}</p>
        ) : (
          <Table>
            <TableHeader>
              <TableRow>
                <TableHead>{t('paths.columns.user')}</TableHead>
                <TableHead>{t('paths.columns.progress')}</TableHead>
                <TableHead>{t('paths.columns.enrolledAt')}</TableHead>
                <TableHead />
              </TableRow>
            </TableHeader>
            <TableBody>
              {enrollments.data.users.map((u) => (
                <TableRow key={u.userId} data-testid={`path-enrollment-${u.username ?? u.userId}`}>
                  <TableCell>
                    <div className="font-medium">{userLabel(u)}</div>
                    <div className="text-xs text-muted-foreground">{u.email}</div>
                  </TableCell>
                  <TableCell>
                    <div className="font-medium">
                      {u.completed}/{u.total}
                    </div>
                    <div className="flex flex-wrap gap-1">
                      {u.items.map((item) => (
                        <Badge key={item.slug} variant={item.status === 'completed' ? 'success' : item.status === 'available' ? 'info' : 'muted'}>
                          {item.title}
                        </Badge>
                      ))}
                    </div>
                  </TableCell>
                  <TableCell>{new Intl.DateTimeFormat(i18n.language, { dateStyle: 'medium' }).format(new Date(u.enrolledAt))}</TableCell>
                  <TableCell className="text-right">
                    <Button
                      variant="outline"
                      size="sm"
                      className="text-destructive"
                      disabled={unenroll.isPending}
                      onClick={() => unenroll.mutate(u.userId)}
                      aria-label={`${t('paths.unenroll')} ${userLabel(u)}`}
                    >
                      {t('paths.unenroll')}
                    </Button>
                  </TableCell>
                </TableRow>
              ))}
            </TableBody>
          </Table>
        )}
      </CardContent>
    </Card>
  )
}
