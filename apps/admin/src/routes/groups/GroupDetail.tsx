import { useTranslation } from '@pupitre/i18n'
import { type AdminUserSearchResult, MEMBERSHIP_ROLES, type MembershipRole } from '@pupitre/shared'
import { ErrorState, isNotFound, LoadingState, PageHeader, sortByTitle, toast, unwrap, UserAvatar } from '@pupitre/ui'
import { Alert, AlertDescription } from '@pupitre/ui/components/ui/alert'
import { Badge } from '@pupitre/ui/components/ui/badge'
import { Button } from '@pupitre/ui/components/ui/button'
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from '@pupitre/ui/components/ui/card'
import { Checkbox } from '@pupitre/ui/components/ui/checkbox'
import { Input } from '@pupitre/ui/components/ui/input'
import { Label } from '@pupitre/ui/components/ui/label'
import { NativeSelect, NativeSelectOption } from '@pupitre/ui/components/ui/native-select'
import { Textarea } from '@pupitre/ui/components/ui/textarea'
import { useMutation, useQuery, useQueryClient } from '@tanstack/react-query'
import { type FormEvent, useState } from 'react'
import { Link, useParams } from 'react-router'
import { UserPicker, userLabel } from '../../components/UserPicker.tsx'
import { adminApi } from '../../lib/api.ts'

/** Specs 131–133, 135: rename / describe / move, members (with managers), courses of the group. */
export function GroupDetail() {
  const { id = '' } = useParams()
  const { t } = useTranslation(['admin', 'common'])
  const group = useQuery({
    queryKey: ['admin-group', id],
    queryFn: () => unwrap(adminApi.groups[':id'].$get({ param: { id } })),
  })

  return (
    <div className="flex flex-col gap-6">
      <Link to="/groups" className="text-sm text-muted-foreground hover:text-foreground">
        {t('groups.back')}
      </Link>
      {group.isPending ? (
        <LoadingState label={t('groups.loading')} />
      ) : group.isError ? (
        <ErrorState message={isNotFound(group.error) ? t('groups.notFound') : group.error.message} />
      ) : (
        <>
          <PageHeader
            title={
              <span className="flex flex-wrap items-center gap-2">
                {group.data.group.name}
                {group.data.group.isDefault && <Badge variant="muted">{t('groups.defaultBadge')}</Badge>}
              </span>
            }
            description={
              group.data.group.isDefault
                ? t('groups.defaultHelp')
                : group.data.ancestors.length > 0
                  ? [...group.data.ancestors.map((a) => a.name), group.data.group.name].join(' › ')
                  : undefined
            }
          />
          {!group.data.group.isDefault && group.data.group.origin === 'local' && (
            <SettingsCard group={group.data.group} />
          )}
          <MembersCard groupId={id} isDefault={group.data.group.isDefault} />
          <CoursesCard groupId={id} />
        </>
      )}
    </div>
  )
}

function SettingsCard({ group }: { group: { id: string; name: string; description: string | null; parentId: string | null } }) {
  const { t } = useTranslation(['admin', 'common'])
  const queryClient = useQueryClient()
  const groups = useQuery({ queryKey: ['admin-groups'], queryFn: () => unwrap(adminApi.groups.$get()) })
  const save = useMutation({
    mutationFn: (input: { name: string; description: string | null; parentId: string | null }) =>
      unwrap(adminApi.groups[':id'].$patch({ param: { id: group.id }, json: input })),
    onSuccess: async () => {
      toast.success(t('groups.saved'))
      await queryClient.invalidateQueries({ queryKey: ['admin-group', group.id] })
      await queryClient.invalidateQueries({ queryKey: ['admin-groups'] })
    },
  })

  function submit(e: FormEvent<HTMLFormElement>) {
    e.preventDefault()
    const form = new FormData(e.currentTarget)
    save.mutate({
      name: String(form.get('name') ?? '').trim(),
      description: String(form.get('description') ?? '').trim() || null,
      parentId: String(form.get('parentId') ?? '') || null,
    })
  }

  // A group cannot move under itself or its subgroups (the API checks it too).
  const descendants = new Set<string>([group.id])
  for (const g of groups.data?.groups ?? []) if (g.parentId && descendants.has(g.parentId)) descendants.add(g.id)
  const parents = (groups.data?.groups ?? []).filter((g) => !descendants.has(g.id) && !g.isDefault)

  return (
    <Card>
      <CardHeader>
        <CardTitle>
          <h2>{t('groups.settingsTitle')}</h2>
        </CardTitle>
      </CardHeader>
      <CardContent>
        <form onSubmit={submit} className="flex max-w-xl flex-col gap-4">
          {save.error && (
            <Alert variant="destructive">
              <AlertDescription>{save.error.message}</AlertDescription>
            </Alert>
          )}
          <div className="flex flex-col gap-1.5">
            <Label htmlFor="group-name">{t('groups.name')}</Label>
            <Input id="group-name" name="name" defaultValue={group.name} required />
          </div>
          <div className="flex flex-col gap-1.5">
            <Label htmlFor="group-description">{t('groups.description')}</Label>
            <Textarea id="group-description" name="description" defaultValue={group.description ?? ''} />
          </div>
          <div className="flex flex-col gap-1.5">
            <Label htmlFor="group-parent">{t('groups.parent')}</Label>
            {groups.data && (
              <NativeSelect id="group-parent" name="parentId" defaultValue={group.parentId ?? ''}>
                <NativeSelectOption value="">{t('groups.noParent')}</NativeSelectOption>
                {parents.map((g) => (
                  <NativeSelectOption key={g.id} value={g.id}>
                    {'  '.repeat(g.depth)}
                    {g.name}
                  </NativeSelectOption>
                ))}
              </NativeSelect>
            )}
          </div>
          <div>
            <Button type="submit" disabled={save.isPending}>
              {save.isPending ? t('common:saving') : t('common:save')}
            </Button>
          </div>
        </form>
      </CardContent>
    </Card>
  )
}

function MembersCard({ groupId, isDefault }: { groupId: string; isDefault: boolean }) {
  const { t } = useTranslation(['admin', 'common'])
  const queryClient = useQueryClient()
  const [recursive, setRecursive] = useState(false)
  const [picked, setPicked] = useState<AdminUserSearchResult | null>(null)
  const [role, setRole] = useState<MembershipRole>('member')
  const [mustSelect, setMustSelect] = useState(false)

  const members = useQuery({
    queryKey: ['admin-group-members', groupId, recursive],
    queryFn: () =>
      unwrap(
        adminApi.groups[':id'].members.$get({ param: { id: groupId }, query: { recursive: recursive ? 'true' : undefined } }),
      ),
  })

  const refresh = async () => {
    await queryClient.invalidateQueries({ queryKey: ['admin-group-members', groupId] })
    await queryClient.invalidateQueries({ queryKey: ['admin-groups'] })
    await queryClient.invalidateQueries({ queryKey: ['admin-group', groupId] })
  }

  const add = useMutation({
    mutationFn: (input: { userId: string; role: MembershipRole }) =>
      unwrap(adminApi.groups[':id'].members.$post({ param: { id: groupId }, json: input })),
    onSuccess: async () => {
      toast.success(t('groups.memberAdded'))
      setPicked(null)
      await refresh()
    },
    onError: (err) => toast.error(err.message),
  })
  const remove = useMutation({
    mutationFn: (userId: string) =>
      unwrap(adminApi.groups[':id'].members[':userId'].$delete({ param: { id: groupId, userId } })),
    onSuccess: async () => {
      toast.success(t('groups.memberRemoved'))
      await refresh()
    },
    onError: (err) => toast.error(err.message),
  })

  const count = members.data?.total ?? 0
  return (
    <Card>
      <CardHeader>
        <CardTitle>
          <h2>{t('groups.membersTitle', { count })}</h2>
        </CardTitle>
      </CardHeader>
      <CardContent className="flex flex-col gap-4">
        {!isDefault && (
          <form
            className="flex flex-wrap items-end gap-2"
            onSubmit={(e) => {
              e.preventDefault()
              if (!picked) return setMustSelect(true)
              add.mutate({ userId: picked.id, role })
            }}
          >
            <UserPicker
              value={picked}
              label={t('groups.addMember')}
              onChange={(u) => {
                setPicked(u)
                setMustSelect(false)
              }}
            />
            <NativeSelect
              aria-label={t('groups.memberRole')}
              value={role}
              onChange={(e) => setRole(e.target.value as MembershipRole)}
              className="h-10"
            >
              {MEMBERSHIP_ROLES.map((r) => (
                <NativeSelectOption key={r} value={r}>
                  {t(`common:membershipRoles.${r}`)}
                </NativeSelectOption>
              ))}
            </NativeSelect>
            <Button type="submit" className="h-10" disabled={add.isPending}>
              {t('common:add')}
            </Button>
          </form>
        )}
        {mustSelect && (
          <p role="alert" className="text-sm text-destructive">
            {t('userPicker.selectUser')}
          </p>
        )}
        <div className="flex items-center gap-2">
          <Checkbox id="recursive" checked={recursive} onCheckedChange={(v) => setRecursive(v === true)} />
          <Label htmlFor="recursive">{t('groups.recursive')}</Label>
        </div>
        {members.isPending ? (
          <LoadingState label={t('groups.loading')} rows={2} />
        ) : members.isError ? (
          <ErrorState message={members.error.message} />
        ) : members.data.members.length === 0 ? (
          <p className="text-muted-foreground">{t('groups.membersEmpty')}</p>
        ) : (
          <ul className="flex flex-col divide-y" aria-label={t('groups.membersTitle', { count })}>
            {members.data.members.map((m) => {
              const direct = m.groupId === groupId
              return (
                <li key={`${m.groupId}-${m.userId}`} className="flex flex-wrap items-center gap-3 py-2">
                  <UserAvatar image={m.image} name={userLabel(m)} />
                  <div className="flex min-w-0 flex-1 flex-col">
                    <Link to={`/users/${m.userId}`} className="truncate font-medium hover:underline">
                      {userLabel(m)}
                    </Link>
                    <span className="truncate text-xs text-muted-foreground">
                      {m.email}
                      {!direct && ` · ${t('groups.inSubgroup', { name: m.groupName })}`}
                    </span>
                  </div>
                  {m.role === 'manager' && <Badge variant="info">{t('common:membershipRoles.manager')}</Badge>}
                  {direct && !isDefault && (
                    <>
                      <Button
                        variant="ghost"
                        size="sm"
                        disabled={add.isPending}
                        onClick={() => add.mutate({ userId: m.userId, role: m.role === 'manager' ? 'member' : 'manager' })}
                      >
                        {m.role === 'manager' ? t('groups.makeMember') : t('groups.makeManager')}
                      </Button>
                      <Button
                        variant="outline"
                        size="sm"
                        className="text-destructive"
                        disabled={remove.isPending}
                        onClick={() => remove.mutate(m.userId)}
                        aria-label={`${t('common:remove')} ${userLabel(m)}`}
                      >
                        {t('common:remove')}
                      </Button>
                    </>
                  )}
                </li>
              )
            })}
          </ul>
        )}
      </CardContent>
    </Card>
  )
}

function CoursesCard({ groupId }: { groupId: string }) {
  const { t } = useTranslation(['admin', 'common'])
  const queryClient = useQueryClient()
  const courses = useQuery({
    queryKey: ['admin-group-courses', groupId],
    queryFn: () => unwrap(adminApi.groups[':id'].courses.$get({ param: { id: groupId } })),
  })
  const allCourses = useQuery({ queryKey: ['admin-courses', ''], queryFn: () => unwrap(adminApi.courses.$get({ query: {} })) })

  const refresh = async () => {
    await queryClient.invalidateQueries({ queryKey: ['admin-group-courses', groupId] })
    await queryClient.invalidateQueries({ queryKey: ['admin-groups'] })
    await queryClient.invalidateQueries({ queryKey: ['admin-courses'] })
  }
  const add = useMutation({
    mutationFn: (courseId: string) =>
      unwrap(adminApi.groups[':id'].courses.$post({ param: { id: groupId }, json: { courseId } })),
    onSuccess: async ({ enrolled }) => {
      toast.success(t('groups.courseAdded', { count: enrolled }))
      await refresh()
    },
    onError: (err) => toast.error(err.message),
  })
  const remove = useMutation({
    mutationFn: (courseId: string) =>
      unwrap(adminApi.groups[':id'].courses[':courseId'].$delete({ param: { id: groupId, courseId } })),
    onSuccess: async () => {
      toast.success(t('groups.courseRemoved'))
      await refresh()
    },
    onError: (err) => toast.error(err.message),
  })

  const enrolledIds = new Set(courses.data?.courses.map((c) => c.courseId))
  const candidates = sortByTitle((allCourses.data?.courses ?? []).filter((c) => !enrolledIds.has(c.id)))
  const count = courses.data?.courses.length ?? 0

  return (
    <Card>
      <CardHeader>
        <CardTitle>
          <h2>{t('groups.coursesTitle', { count })}</h2>
        </CardTitle>
        <CardDescription>{t('groups.coursesHelp')}</CardDescription>
      </CardHeader>
      <CardContent className="flex flex-col gap-3">
        <NativeSelect
          aria-label={t('groups.addCourse')}
          value=""
          disabled={add.isPending}
          onChange={(e) => e.target.value && add.mutate(e.target.value)}
          className="max-w-md"
        >
          <NativeSelectOption value="">{t('groups.addCourse')}</NativeSelectOption>
          {candidates.map((c) => (
            <NativeSelectOption key={c.id} value={c.id}>
              {c.title}
            </NativeSelectOption>
          ))}
        </NativeSelect>
        {courses.isPending ? (
          <LoadingState label={t('groups.loading')} rows={1} />
        ) : courses.isError ? (
          <ErrorState message={courses.error.message} />
        ) : courses.data.courses.length === 0 ? (
          <p className="text-muted-foreground">{t('groups.coursesEmpty')}</p>
        ) : (
          <ul className="flex flex-col divide-y">
            {courses.data.courses.map((c) => (
              <li key={c.courseId} className="flex items-center justify-between gap-2 py-2">
                <Link to={`/courses/${c.courseId}`} className="font-medium hover:underline">
                  {c.title}
                </Link>
                <Button
                  variant="outline"
                  size="sm"
                  className="text-destructive"
                  disabled={remove.isPending}
                  onClick={() => remove.mutate(c.courseId)}
                  aria-label={`${t('common:remove')} ${c.title}`}
                >
                  {t('common:remove')}
                </Button>
              </li>
            ))}
          </ul>
        )}
      </CardContent>
    </Card>
  )
}
