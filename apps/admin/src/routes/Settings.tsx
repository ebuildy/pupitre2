import { useTranslation } from '@pupitre/i18n'
import { POLICY_ENGINES, type PolicyEngineKind, type SettingKey, type Settings as SettingValues, type SettingsUpdateInput } from '@pupitre/shared'
import { ErrorState, LoadingState, PageHeader, toast, unwrap } from '@pupitre/ui'
import { Button } from '@pupitre/ui/components/ui/button'
import { Card, CardContent, CardHeader, CardTitle } from '@pupitre/ui/components/ui/card'
import { Input } from '@pupitre/ui/components/ui/input'
import { Label } from '@pupitre/ui/components/ui/label'
import { NativeSelect, NativeSelectOption } from '@pupitre/ui/components/ui/native-select'
import { Switch } from '@pupitre/ui/components/ui/switch'
import { useMutation, useQuery, useQueryClient } from '@tanstack/react-query'
import { type ReactNode, useState } from 'react'
import { adminApi } from '../lib/api.ts'

/** The form keeps the whitelist and the minimum length as typed text; they are parsed on save. */
type Draft = Omit<SettingValues, 'registration_email_whitelist' | 'password_min_length' | 'oidc_group_admins'> & {
  registration_email_whitelist: string
  password_min_length: string
  oidc_group_admins: string
}

const splitList = (v: string) =>
  v
    .split(',')
    .map((x) => x.trim())
    .filter(Boolean)

function toDraft(s: SettingValues): Draft {
  return {
    ...s,
    registration_email_whitelist: s.registration_email_whitelist.join(', '),
    password_min_length: String(s.password_min_length),
    oidc_group_admins: s.oidc_group_admins.join(', '),
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
    oidc_group_admins: splitList(d.oidc_group_admins),
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
  // The form restarts from the server's settings whenever they change (loaded, or saved).
  const [draft, setDraft] = useState<Draft | null>(null)
  const [loaded, setLoaded] = useState(data)
  if (data !== loaded) {
    setLoaded(data)
    if (data) setDraft(toDraft(data.settings))
  }

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

      <Section title={t('settings.sections.policy')}>
        <SettingRow id="lab_policy_engine" label={t('settings.policyEngine')} help={t('settings.policyEngineHelp')} lastChange={data.changes.lab_policy_engine?.updatedAt} stacked>
          <NativeSelect id="lab_policy_engine" value={draft.lab_policy_engine} onChange={(e) => set('lab_policy_engine', e.target.value as PolicyEngineKind)}>
            {POLICY_ENGINES.map((k) => (
              <NativeSelectOption key={k} value={k}>
                {t(`settings.policyEngines.${k}`)}
              </NativeSelectOption>
            ))}
          </NativeSelect>
        </SettingRow>
        {draft.lab_policy_engine === 'server' && (
          <SettingRow id="opa_url" label={t('settings.opaUrl')} help={t('settings.opaUrlHelp')} lastChange={data.changes.opa_url?.updatedAt} stacked>
            <Input id="opa_url" value={draft.opa_url} placeholder="http://opa:8181" onChange={(e) => set('opa_url', e.target.value)} />
          </SettingRow>
        )}
      </Section>

      <Section title={t('settings.sections.oidc')}>
        {toggle('oidc_enabled', t('settings.oidcEnabled'), t('settings.oidcCallback', { url: `${window.location.origin}/api/sso/oidc/callback` }))}
        <SettingRow id="oidc_name" label={t('settings.oidcName')} help={t('settings.oidcNameHelp')} lastChange={data.changes.oidc_name?.updatedAt} stacked>
          <Input id="oidc_name" type="text" value={draft.oidc_name} onChange={(e) => set('oidc_name', e.target.value)} />
        </SettingRow>
        <SettingRow id="oidc_provider_url" label={t('settings.oidcProviderUrl')} help={t('settings.oidcProviderUrlHelp')} lastChange={data.changes.oidc_provider_url?.updatedAt} stacked>
          <Input id="oidc_provider_url" type="text" value={draft.oidc_provider_url} onChange={(e) => set('oidc_provider_url', e.target.value)} />
        </SettingRow>
        <SettingRow id="oidc_client_id" label={t('settings.oidcClientId')} lastChange={data.changes.oidc_client_id?.updatedAt} stacked>
          <Input id="oidc_client_id" type="text" value={draft.oidc_client_id} onChange={(e) => set('oidc_client_id', e.target.value)} />
        </SettingRow>
        <SettingRow id="oidc_client_secret" label={t('settings.oidcClientSecret')} help={t('settings.oidcClientSecretHelp')} lastChange={data.changes.oidc_client_secret?.updatedAt} stacked>
          <Input id="oidc_client_secret" type="password" value={draft.oidc_client_secret} onChange={(e) => set('oidc_client_secret', e.target.value)} />
        </SettingRow>
        <SettingRow id="oidc_scopes" label={t('settings.oidcScopes')} lastChange={data.changes.oidc_scopes?.updatedAt} stacked>
          <Input id="oidc_scopes" type="text" value={draft.oidc_scopes} onChange={(e) => set('oidc_scopes', e.target.value)} />
        </SettingRow>
        <SettingRow id="oidc_group_claim" label={t('settings.oidcGroupClaim')} lastChange={data.changes.oidc_group_claim?.updatedAt} stacked>
          <Input id="oidc_group_claim" type="text" value={draft.oidc_group_claim} onChange={(e) => set('oidc_group_claim', e.target.value)} />
        </SettingRow>
        <SettingRow id="oidc_group_admins" label={t('settings.oidcGroupAdmins')} help={t('settings.oidcGroupAdminsHelp')} lastChange={data.changes.oidc_group_admins?.updatedAt} stacked>
          <Input id="oidc_group_admins" type="text" value={draft.oidc_group_admins} onChange={(e) => set('oidc_group_admins', e.target.value)} />
        </SettingRow>
        <SettingRow id="oidc_issuer_url" label={t('settings.oidcIssuerUrl')} lastChange={data.changes.oidc_issuer_url?.updatedAt} stacked>
          <Input id="oidc_issuer_url" type="text" value={draft.oidc_issuer_url} onChange={(e) => set('oidc_issuer_url', e.target.value)} />
        </SettingRow>
        <SettingRow id="oidc_redirect_base" label={t('settings.oidcRedirectBase')} lastChange={data.changes.oidc_redirect_base?.updatedAt} stacked>
          <Input id="oidc_redirect_base" type="text" value={draft.oidc_redirect_base} onChange={(e) => set('oidc_redirect_base', e.target.value)} />
        </SettingRow>
        <SettingRow id="oidc_browser_base_url" label={t('settings.oidcBrowserBaseUrl')} lastChange={data.changes.oidc_browser_base_url?.updatedAt} stacked>
          <Input id="oidc_browser_base_url" type="text" value={draft.oidc_browser_base_url} onChange={(e) => set('oidc_browser_base_url', e.target.value)} />
        </SettingRow>
      </Section>

      <Section title={t('settings.sections.ldap')}>
        {toggle('ldap_enabled', t('settings.ldapEnabled'))}
        <SettingRow id="ldap_server_url" label={t('settings.ldapServerUrl')} help={t('settings.ldapServerUrlHelp')} lastChange={data.changes.ldap_server_url?.updatedAt} stacked>
          <Input id="ldap_server_url" type="text" value={draft.ldap_server_url} onChange={(e) => set('ldap_server_url', e.target.value)} />
        </SettingRow>
        <SettingRow id="ldap_bind_dn" label={t('settings.ldapBindDn')} lastChange={data.changes.ldap_bind_dn?.updatedAt} stacked>
          <Input id="ldap_bind_dn" type="text" value={draft.ldap_bind_dn} onChange={(e) => set('ldap_bind_dn', e.target.value)} />
        </SettingRow>
        <SettingRow id="ldap_bind_password" label={t('settings.ldapBindPassword')} help={t('settings.oidcClientSecretHelp')} lastChange={data.changes.ldap_bind_password?.updatedAt} stacked>
          <Input id="ldap_bind_password" type="password" value={draft.ldap_bind_password} onChange={(e) => set('ldap_bind_password', e.target.value)} />
        </SettingRow>
        <SettingRow id="ldap_user_base_dn" label={t('settings.ldapUserBaseDn')} lastChange={data.changes.ldap_user_base_dn?.updatedAt} stacked>
          <Input id="ldap_user_base_dn" type="text" value={draft.ldap_user_base_dn} onChange={(e) => set('ldap_user_base_dn', e.target.value)} />
        </SettingRow>
        <SettingRow id="ldap_user_filter" label={t('settings.ldapUserFilter')} help={t('settings.ldapUserFilterHelp')} lastChange={data.changes.ldap_user_filter?.updatedAt} stacked>
          <Input id="ldap_user_filter" type="text" value={draft.ldap_user_filter} onChange={(e) => set('ldap_user_filter', e.target.value)} />
        </SettingRow>
        <SettingRow id="ldap_group_base_dn" label={t('settings.ldapGroupBaseDn')} lastChange={data.changes.ldap_group_base_dn?.updatedAt} stacked>
          <Input id="ldap_group_base_dn" type="text" value={draft.ldap_group_base_dn} onChange={(e) => set('ldap_group_base_dn', e.target.value)} />
        </SettingRow>
        <SettingRow id="ldap_group_filter" label={t('settings.ldapGroupFilter')} help={t('settings.ldapGroupFilterHelp')} lastChange={data.changes.ldap_group_filter?.updatedAt} stacked>
          <Input id="ldap_group_filter" type="text" value={draft.ldap_group_filter} onChange={(e) => set('ldap_group_filter', e.target.value)} />
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
