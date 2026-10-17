import { authClient, PasswordChecklist, usePublicSettings, useSession } from '@pupitre/auth-ui'
import { useTranslation } from '@pupitre/i18n'
import { isImageUrl, type MeResponse, passwordChecks, type ProfileUpdateInput } from '@pupitre/shared'
import { ApiRequestError, ErrorState, LoadingState, PageHeader, toast, unwrap, UserAvatar } from '@pupitre/ui'
import { Alert, AlertDescription } from '@pupitre/ui/components/ui/alert'
import { Badge } from '@pupitre/ui/components/ui/badge'
import { Button } from '@pupitre/ui/components/ui/button'
import { Card, CardContent, CardHeader, CardTitle } from '@pupitre/ui/components/ui/card'
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
import { Tabs, TabsContent, TabsList, TabsTrigger } from '@pupitre/ui/components/ui/tabs'
import { Textarea } from '@pupitre/ui/components/ui/textarea'
import { useMutation, useQuery, useQueryClient } from '@tanstack/react-query'
import { InfoIcon } from 'lucide-react'
import { type FormEvent, useState } from 'react'
import { Link } from 'react-router'
import { api } from '../lib/api.ts'

/** Saves profile fields, then refreshes the cached `me` and the session (the top bar shows username and avatar). */
function useUpdateProfile() {
  const queryClient = useQueryClient()
  const { refetch } = useSession()
  return useMutation({
    mutationFn: (input: ProfileUpdateInput) => unwrap(api.api.me.$patch({ json: input })),
    onSuccess: (me) => {
      queryClient.setQueryData(['me'], me)
      refetch()
    },
  })
}

/** Specs 035, 036: profile header with avatar, "Compte" and "Sécurité" tabs. */
export function Profile() {
  const { t } = useTranslation(['app', 'common'])
  const { data: me, isPending, isError, error } = useQuery({
    queryKey: ['me'],
    queryFn: () => unwrap(api.api.me.$get()),
  })
  const [avatarOpen, setAvatarOpen] = useState(false)

  if (isPending) return <LoadingState label={t('profile.loading')} />
  if (isError) return <ErrorState message={error.message} />

  const displayName = me.username ?? me.name
  return (
    <div className="flex flex-col gap-6">
      <PageHeader title={t('profile.title')} />

      <Card>
        <CardContent className="flex flex-wrap items-center gap-5">
          <div className="flex flex-col items-center gap-1">
            <UserAvatar image={me.image} name={displayName} className="size-20 text-3xl" />
            <Button variant="ghost" size="sm" onClick={() => setAvatarOpen(true)} aria-label={t('profile.avatar.menuLabel')}>
              {t('profile.avatar.edit')}
            </Button>
          </div>
          <div className="flex min-w-0 flex-1 flex-col gap-1">
            <div className="flex flex-wrap items-center gap-2">
              <h2 className="truncate text-2xl font-bold" data-testid="profile-username">
                {displayName}
              </h2>
              {me.role !== 'student' && (
                <Badge variant={me.role === 'admin' ? 'destructive' : 'info'}>{t(`common:roles.${me.role}`)}</Badge>
              )}
            </div>
            <p className="text-muted-foreground">{me.email}</p>
            <Link to={`/users/${me.id}`} className="text-sm font-medium text-primary hover:underline">
              {t('profile.viewPublic')}
            </Link>
          </div>
        </CardContent>
      </Card>

      <AvatarDialog me={me} open={avatarOpen} onOpenChange={setAvatarOpen} />

      <Tabs defaultValue="account">
        <TabsList>
          <TabsTrigger value="account">{t('profile.tabs.account')}</TabsTrigger>
          <TabsTrigger value="security">{t('profile.tabs.security')}</TabsTrigger>
        </TabsList>
        <TabsContent value="account">
          <AccountCard me={me} />
        </TabsContent>
        <TabsContent value="security">
          <SecurityCard hasPassword={me.hasPassword} />
        </TabsContent>
      </Tabs>
    </div>
  )
}

function AvatarDialog({ me, open, onOpenChange }: { me: MeResponse; open: boolean; onOpenChange: (open: boolean) => void }) {
  const { t } = useTranslation('app')
  const update = useUpdateProfile()
  const [url, setUrl] = useState(me.image && isImageUrl(me.image) ? me.image : '')
  const [invalid, setInvalid] = useState(false)

  function save(image: string) {
    update.mutate(
      { image },
      {
        onSuccess: () => {
          toast.success(t('profile.avatar.updated'))
          onOpenChange(false)
        },
        onError: (err) => toast.error(err.message),
      },
    )
  }

  function onSubmit(e: FormEvent) {
    e.preventDefault()
    const value = url.trim()
    if (value && !isImageUrl(value)) return setInvalid(true)
    setInvalid(false)
    save(value)
  }

  return (
    <Dialog open={open} onOpenChange={onOpenChange}>
      <DialogContent>
        <DialogHeader>
          <DialogTitle>{t('profile.avatar.menuLabel')}</DialogTitle>
          <DialogDescription className="sr-only">{t('profile.avatar.url')}</DialogDescription>
        </DialogHeader>
        <form onSubmit={onSubmit} className="flex flex-col gap-2">
          <Label htmlFor="avatar-url">{t('profile.avatar.url')}</Label>
          <div className="flex gap-2">
            <Input
              id="avatar-url"
              value={url}
              placeholder={t('profile.avatar.urlPlaceholder')}
              aria-invalid={invalid || undefined}
              onChange={(e) => setUrl(e.target.value)}
            />
            <Button type="submit" disabled={update.isPending}>
              {t('profile.avatar.ok')}
            </Button>
          </div>
          {invalid && <p className="text-sm text-destructive">{t('profile.avatar.urlInvalid')}</p>}
        </form>
        {me.image && (
          <DialogFooter>
            <Button variant="outline" onClick={() => save('')} disabled={update.isPending}>
              {t('profile.avatar.remove')}
            </Button>
          </DialogFooter>
        )}
      </DialogContent>
    </Dialog>
  )
}

function AccountCard({ me }: { me: MeResponse }) {
  const { t } = useTranslation(['app', 'common'])
  const settings = usePublicSettings()
  const update = useUpdateProfile()
  const [editing, setEditing] = useState(false)
  const [error, setError] = useState<string | null>(null)
  const canChangeUsername = settings?.profile_allow_username_change ?? false

  function onSubmit(e: FormEvent<HTMLFormElement>) {
    e.preventDefault()
    const form = new FormData(e.currentTarget)
    const input: ProfileUpdateInput = {
      name: String(form.get('name') ?? ''),
      bio: String(form.get('bio') ?? ''),
    }
    if (canChangeUsername) input.username = String(form.get('username') ?? '')
    setError(null)
    update.mutate(input, {
      onSuccess: () => {
        toast.success(t('profile.saved'))
        setEditing(false)
      },
      onError: (err) =>
        setError(err instanceof ApiRequestError && err.status === 409 ? t('profile.usernameTaken') : err.message),
    })
  }

  const rows = [
    { label: t('profile.username'), value: me.username },
    { label: t('profile.name'), value: me.name },
    { label: t('profile.email'), value: me.email },
    { label: t('profile.bio'), value: me.bio },
  ]

  return (
    <Card>
      <CardHeader className="flex flex-row items-center justify-between">
        <CardTitle>{t('profile.accountTitle')}</CardTitle>
        {!editing && (
          <Button variant="outline" size="sm" onClick={() => setEditing(true)}>
            {t('common:edit')}
          </Button>
        )}
      </CardHeader>
      <CardContent>
        {editing ? (
          <form onSubmit={onSubmit} className="flex flex-col gap-4">
            {error && (
              <Alert variant="destructive">
                <AlertDescription>{error}</AlertDescription>
              </Alert>
            )}
            <div className="flex flex-col gap-1.5">
              <Label htmlFor="profile-username">{t('profile.username')}</Label>
              <Input
                id="profile-username"
                name="username"
                defaultValue={me.username ?? ''}
                disabled={!canChangeUsername}
                aria-describedby={canChangeUsername ? undefined : 'username-locked'}
              />
              {!canChangeUsername && (
                <p id="username-locked" className="text-sm text-muted-foreground">
                  {t('profile.usernameLocked')}
                </p>
              )}
            </div>
            <div className="flex flex-col gap-1.5">
              <Label htmlFor="profile-name">{t('profile.name')}</Label>
              <Input id="profile-name" name="name" defaultValue={me.name} required />
            </div>
            <div className="flex flex-col gap-1.5">
              <Label htmlFor="profile-bio">{t('profile.bio')}</Label>
              <Textarea id="profile-bio" name="bio" defaultValue={me.bio ?? ''} placeholder={t('profile.bioPlaceholder')} />
            </div>
            <div className="flex gap-2">
              <Button type="submit" disabled={update.isPending}>
                {update.isPending ? t('common:saving') : t('common:save')}
              </Button>
              <Button type="button" variant="outline" onClick={() => setEditing(false)}>
                {t('common:cancel')}
              </Button>
            </div>
          </form>
        ) : (
          <dl className="grid gap-3 sm:grid-cols-[12rem_1fr]">
            {rows.map(({ label, value }) => (
              <div key={label} className="contents">
                <dt className="text-sm text-muted-foreground">{label}</dt>
                <dd className="whitespace-pre-line">{value || t('profile.empty')}</dd>
              </div>
            ))}
          </dl>
        )}
      </CardContent>
    </Card>
  )
}

function SecurityCard({ hasPassword }: { hasPassword: boolean }) {
  const { t } = useTranslation(['app', 'auth', 'common'])
  const settings = usePublicSettings()
  const [open, setOpen] = useState(false)
  const [password, setPassword] = useState('')
  const [confirm, setConfirm] = useState('')
  const [error, setError] = useState<string | null>(null)
  const [pending, setPending] = useState(false)

  const mismatch = confirm.length > 0 && password !== confirm

  async function onSubmit(e: FormEvent<HTMLFormElement>) {
    e.preventDefault()
    const form = new FormData(e.currentTarget)
    const currentPassword = String(form.get('current') ?? '')
    if (!currentPassword || !password || password !== confirm) return
    if (settings && passwordChecks(password, settings).some((c) => !c.ok)) return setError(t('auth:register.errors.policy'))
    setError(null)
    setPending(true)
    const { error } = await authClient.changePassword({ currentPassword, newPassword: password })
    setPending(false)
    if (error) {
      if (error.code === 'INVALID_PASSWORD') return setError(t('profile.security.wrongCurrent'))
      if (error.status === 429) return setError(t('auth:login.errors.tooManyRequests'))
      return setError(error.message ?? t('auth:register.errors.generic'))
    }
    toast.success(t('profile.security.changed'))
    setOpen(false)
    setPassword('')
    setConfirm('')
  }

  return (
    <Card>
      <CardHeader>
        <CardTitle>{t('profile.security.title')}</CardTitle>
      </CardHeader>
      <CardContent className="flex flex-col gap-4">
        {!hasPassword ? (
          <Alert>
            <InfoIcon />
            <AlertDescription>{t('profile.security.sso')}</AlertDescription>
          </Alert>
        ) : !open ? (
          <div className="flex flex-col items-start gap-3">
            <p className="text-sm text-muted-foreground">
              {t('profile.security.hint', { count: settings?.password_min_length ?? 8 })}
            </p>
            <Button variant="outline" onClick={() => setOpen(true)}>
              {t('profile.security.change')}
            </Button>
          </div>
        ) : (
          <form onSubmit={onSubmit} className="flex max-w-md flex-col gap-4">
            {error && (
              <Alert variant="destructive">
                <AlertDescription>{error}</AlertDescription>
              </Alert>
            )}
            <div className="flex flex-col gap-1.5">
              <Label htmlFor="password-current">{t('profile.security.current')}</Label>
              <Input id="password-current" name="current" type="password" autoComplete="current-password" required />
            </div>
            <div className="flex flex-col gap-1.5">
              <Label htmlFor="password-new">{t('profile.security.new')}</Label>
              <Input
                id="password-new"
                type="password"
                autoComplete="new-password"
                value={password}
                onChange={(e) => setPassword(e.target.value)}
                required
              />
              {settings && <PasswordChecklist password={password} policy={settings} />}
            </div>
            <div className="flex flex-col gap-1.5">
              <Label htmlFor="password-confirm">{t('profile.security.confirm')}</Label>
              <Input
                id="password-confirm"
                type="password"
                autoComplete="new-password"
                value={confirm}
                aria-invalid={mismatch || undefined}
                onChange={(e) => setConfirm(e.target.value)}
                required
              />
              {mismatch && <p className="text-sm text-destructive">{t('profile.security.mismatch')}</p>}
            </div>
            <div className="flex gap-2">
              <Button type="submit" disabled={pending}>
                {pending ? t('profile.security.submitting') : t('profile.security.submit')}
              </Button>
              <Button type="button" variant="outline" onClick={() => setOpen(false)}>
                {t('common:cancel')}
              </Button>
            </div>
          </form>
        )}
      </CardContent>
    </Card>
  )
}
