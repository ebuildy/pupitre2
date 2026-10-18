import { useTranslation } from '@pupitre/i18n'
import type { SettingKey, Settings as SettingValues, SettingsUpdateInput } from '@pupitre/shared'
import { ErrorState, LoadingState, PageHeader, toast, unwrap } from '@pupitre/ui'
import { Button } from '@pupitre/ui/components/ui/button'
import { Card, CardContent, CardHeader, CardTitle } from '@pupitre/ui/components/ui/card'
import { Input } from '@pupitre/ui/components/ui/input'
import { Label } from '@pupitre/ui/components/ui/label'
import { Switch } from '@pupitre/ui/components/ui/switch'
import { useMutation, useQuery, useQueryClient } from '@tanstack/react-query'
import { type ReactNode, useEffect, useState } from 'react'
import { adminApi } from '../lib/api.ts'

/** The form keeps the whitelist and the minimum length as typed text; they are parsed on save. */
type Draft = Omit<SettingValues, 'registration_email_whitelist' | 'password_min_length'> & {
  registration_email_whitelist: string
  password_min_length: string
}

function toDraft(s: SettingValues): Draft {
  return {
    ...s,
    registration_email_whitelist: s.registration_email_whitelist.join(', '),
    password_min_length: String(s.password_min_length),
  }
}

function fromDraft(d: Draft): SettingValues {
  return {
    ...d,
    registration_email_whitelist: d.registration_email_whitelist
      .split(',')
      .map((v) => v.trim().toLowerCase())
      .filter(Boolean),
    password_min_length: Number(d.password_min_length),
  }
}

/** Only the keys whose value changed. */
function diff(before: SettingValues, after: SettingValues): SettingsUpdateInput {
  const changed: Record<string, unknown> = {}
  for (const key of Object.keys(after) as SettingKey[]) {
    if (JSON.stringify(before[key]) !== JSON.stringify(after[key])) changed[key] = after[key]
  }
  return changed as SettingsUpdateInput
}

/** Spec 179: "Paramètres", one card per section; "Enregistrer" is enabled once something changed. */
export function Settings() {
  const { t } = useTranslation(['admin', 'common'])
  const queryClient = useQueryClient()
  const { data, isPending, isError, error } = useQuery({
    queryKey: ['settings'],
    queryFn: () => unwrap(adminApi.settings.$get()),
  })
  const [draft, setDraft] = useState<Draft | null>(null)
  useEffect(() => {
    if (data) setDraft(toDraft(data.settings))
  }, [data])

  const save = useMutation({
    mutationFn: (input: SettingsUpdateInput) => unwrap(adminApi.settings.$put({ json: input })),
    onSuccess: (result) => {
      queryClient.setQueryData(['settings'], result)
      toast.success(t('settings.saved'))
    },
    onError: (err) => toast.error(err.message),
  })

  if (isPending || !draft) return isError ? <ErrorState message={error.message} /> : <LoadingState label={t('settings.loading')} />
  if (isError) return <ErrorState message={error.message} />

  const minLength = Number(draft.password_min_length)
  const minLengthInvalid = !Number.isInteger(minLength) || minLength < 1 || minLength > 128
  const changes = minLengthInvalid ? {} : diff(data.settings, fromDraft(draft))
  const dirty = Object.keys(changes).length > 0

  function set<K extends keyof Draft>(key: K, value: Draft[K]) {
    setDraft((d) => (d ? { ...d, [key]: value } : d))
  }

  const toggle = (key: keyof Draft & SettingKey, label: string, help?: string) => (
    <SettingRow id={key} label={label} help={help} lastChange={data.changes[key]?.updatedAt}>
      <Switch id={key} checked={draft[key] as boolean} onCheckedChange={(v) => set(key, v as never)} />
    </SettingRow>
  )

  const saveButton = (
    <Button disabled={!dirty || save.isPending} onClick={() => save.mutate(changes)}>
      {save.isPending ? t('common:saving') : t('common:save')}
    </Button>
  )

  return (
    <div className="flex flex-col gap-6">
      <PageHeader title={t('settings.title')} actions={saveButton} />

      <Section title={t('settings.sections.registration')}>
        {toggle('registration_enabled', t('settings.registrationEnabled'), t('settings.registrationEnabledHelp'))}
        <SettingRow
          id="registration_email_whitelist"
          label={t('settings.whitelist')}
          help={t('settings.whitelistHelp')}
          lastChange={data.changes.registration_email_whitelist?.updatedAt}
          stacked
        >
          <Input
            id="registration_email_whitelist"
            value={draft.registration_email_whitelist}
            placeholder="company.com, partner.org"
            onChange={(e) => set('registration_email_whitelist', e.target.value)}
          />
        </SettingRow>
      </Section>

      <Section title={t('settings.sections.password')}>
        <SettingRow id="password_min_length" label={t('settings.minLength')} lastChange={data.changes.password_min_length?.updatedAt}>
          <div className="flex flex-col items-end gap-1">
            <Input
              id="password_min_length"
              type="number"
              min={1}
              max={128}
              className="w-24"
              value={draft.password_min_length}
              aria-invalid={minLengthInvalid || undefined}
              onChange={(e) => set('password_min_length', e.target.value)}
            />
            {minLengthInvalid && <p className="text-sm text-destructive">{t('settings.minLengthInvalid')}</p>}
          </div>
        </SettingRow>
        {toggle('password_require_uppercase', t('settings.requireUppercase'))}
        {toggle('password_require_number', t('settings.requireNumber'))}
      </Section>

      <Section title={t('settings.sections.profiles')}>
        {toggle('profile_allow_username_change', t('settings.allowUsernameChange'))}
      </Section>

      <Section title={t('settings.sections.auth')}>
        {toggle('sso_local_login_enabled', t('settings.localLogin'), t('settings.localLoginHelp'))}
        <SettingRow id="gitlab_url" label={t('settings.gitlabUrl')} help={t('settings.gitlabUrlHelp')} lastChange={data.changes.gitlab_url?.updatedAt} stacked>
          <Input id="gitlab_url" value={draft.gitlab_url} placeholder="https://gitlab.example.com" onChange={(e) => set('gitlab_url', e.target.value)} />
        </SettingRow>
      </Section>

      <div className="flex justify-end">{saveButton}</div>
    </div>
  )
}

function Section({ title, children }: { title: string; children: ReactNode }) {
  return (
    <Card>
      <CardHeader>
        <CardTitle>
          <h2>{title}</h2>
        </CardTitle>
      </CardHeader>
      <CardContent className="flex flex-col divide-y">{children}</CardContent>
    </Card>
  )
}

function SettingRow({
  id,
  label,
  help,
  lastChange,
  stacked,
  children,
}: {
  id: string
  label: string
  help?: string
  lastChange?: string
  stacked?: boolean
  children: ReactNode
}) {
  const { t } = useTranslation('admin')
  return (
    <div className={stacked ? 'flex flex-col gap-2 py-3' : 'flex flex-wrap items-center justify-between gap-4 py-3'}>
      <div className="flex min-w-0 flex-col gap-0.5">
        <Label htmlFor={id}>{label}</Label>
        {help && <p className="text-sm text-muted-foreground">{help}</p>}
        {lastChange && <p className="text-xs text-muted-foreground">{t('settings.lastChange', { date: new Date(lastChange) })}</p>}
      </div>
      {children}
    </div>
  )
}
