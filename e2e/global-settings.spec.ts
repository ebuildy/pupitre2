import { defaultSettings } from '@pupitre/shared'
import { ADMIN_PASSWORD, GITLAB_PORT, IDP_PORT, LDAP_HTTP_PORT, LDAP_PORT, OPA_PORT } from './env.ts'
import { apiClient, expect, fakeIdpUser, login, signIn, ssoLogin, test, uid } from './fixtures.ts'

const opa = `http://localhost:${OPA_PORT}`
const labRepo = 'https://git.example.com/pupitre/pupitre-git.git'

async function fake(url: string, data: unknown) {
  const res = await fetch(url, { method: 'POST', body: JSON.stringify(data) })
  if (!res.ok) throw new Error(`${url}: ${res.status}`)
}
/** Spec 091: the verdict of e2e/fake-opa.mjs for a project, and what it was asked to evaluate. */
const opaAnswer = (project: string, result: { allow: boolean; violations: string[] }) => fake(`${opa}/__fake/answers`, { project, result })
type OpaCall = { engine: 'server' | 'cli'; policy: string; input: Record<string, any> }
const opaCalls = async (project: string): Promise<OpaCall[]> => (await (await fetch(`${opa}/__fake/calls?project=${encodeURIComponent(project)}`)).json()) as OpaCall[]

// Runs in the `global-settings` project: alone, after every other test, one test at a time (see playwright.config.ts).

test.describe('platform settings (specs 021, 022, 024, 035, 179)', () => {
  test.afterEach(async ({ adminRequest }) => {
    // The OIDC provider of the e2e run is configured by OIDC_* at startup (spec 029): keep it.
    const { oidc_enabled: _, oidc_name: _n, oidc_provider_url: _u, oidc_client_id: _c, oidc_client_secret: _s, ...defaults } = defaultSettings()
    const res = await adminRequest.put('/api/admin/settings', { data: defaults })
    expect(res.ok()).toBeTruthy()
  })

  test('closing registration hides the link, shows the closed card and refuses sign-up', async ({ page }) => {
    await signIn(page, { email: 'admin', password: ADMIN_PASSWORD })
    await page.goto('/admin/settings')
    await expect(page.getByRole('heading', { name: 'Paramètres' })).toBeVisible()
    const save = page.getByRole('button', { name: 'Enregistrer' }).first()
    await expect(save).toBeDisabled()
    await page.getByRole('switch', { name: 'Inscriptions ouvertes' }).click()
    await save.click()
    await expect(page.getByText('Paramètres enregistrés')).toBeVisible()
    await expect(save).toBeDisabled()

    const visitor = await page.context().browser()!.newPage()
    await visitor.goto('/login')
    await expect(visitor.getByRole('button', { name: 'Se connecter', exact: true })).toBeVisible()
    await expect(visitor.getByRole('link', { name: 'Créer un compte' })).toHaveCount(0)
    await visitor.goto('/register')
    await expect(visitor.getByText('Inscriptions fermées')).toBeVisible()
    await expect(visitor.getByLabel("Nom d'utilisateur")).toHaveCount(0)
    await visitor.close()

    const api = await apiClient()
    const res = await api.post('/api/auth/sign-up/email', {
      data: { name: `x_${uid()}`, username: `x_${uid()}`, email: `x-${uid()}@example.test`, password: 'Password123!' },
    })
    expect(res.status()).toBe(403)
    expect((await res.json()).message).toBe('New user registration is currently disabled.')
    await api.dispose()
  })

  test('the e-mail domain whitelist restricts registration', async ({ page, adminRequest }) => {
    await adminRequest.put('/api/admin/settings', { data: { registration_email_whitelist: ['allowed.test'] } })
    const name = `wl_${uid()}`
    await page.goto('/register')
    await page.getByLabel("Nom d'utilisateur").fill(name)
    await page.getByLabel('Email').fill(`${name}@other.test`)
    await page.getByLabel('Mot de passe', { exact: true }).fill('Password123!')
    await page.getByLabel('Confirmer le mot de passe').fill('Password123!')
    await page.getByRole('button', { name: 'Créer un compte' }).click()
    await expect(page.getByRole('alert')).toHaveText("L'inscription est réservée à certains domaines d'e-mail.")

    await page.getByLabel('Email').fill(`${name}@ALLOWED.test`)
    await page.getByRole('button', { name: 'Créer un compte' }).click()
    await expect(page).toHaveURL(/\/courses$/)
  })

  test('the password policy is shown as a checklist and enforced by the API', async ({ page, adminRequest }) => {
    await adminRequest.put('/api/admin/settings', {
      data: { password_min_length: 12, password_require_uppercase: true, password_require_number: true },
    })
    await page.goto('/register')
    const rules = page.getByTestId('password-rules')
    await expect(rules.getByRole('listitem')).toHaveText(['Au moins 12 caractères', 'Au moins une majuscule', 'Au moins un chiffre'])
    await page.getByLabel('Mot de passe', { exact: true }).fill('abcdefghijkL')
    await expect(rules.getByRole('listitem').nth(0)).toContainText('✓')
    await expect(rules.getByRole('listitem').nth(1)).toContainText('✓')
    await expect(rules.getByRole('listitem').nth(2)).not.toContainText('✓')

    const api = await apiClient()
    const res = await api.post('/api/auth/sign-up/email', {
      data: { name: `p_${uid()}`, username: `p_${uid()}`, email: `p-${uid()}@example.test`, password: 'abcdefghijkL' },
    })
    expect(res.status()).toBe(400)
    expect((await res.json()).message).toBe('Password must contain at least one number')
    await api.dispose()
  })

  test('the policy also applies to password changes', async ({ page, adminRequest, createUser }) => {
    const user = await createUser()
    await adminRequest.put('/api/admin/settings', { data: { password_min_length: 20 } })
    await signIn(page, user)
    const res = await page.request.post('/api/auth/change-password', {
      data: { currentPassword: user.password, newPassword: 'Short123!' },
    })
    expect(res.status()).toBe(400)
    expect((await res.json()).message).toBe('Password must be at least 20 characters')
  })

  test('username changes can be disabled', async ({ page, adminRequest, createUser }) => {
    await adminRequest.put('/api/admin/settings', { data: { profile_allow_username_change: false } })
    await signIn(page, await createUser())
    await page.goto('/profile')
    await page.getByRole('button', { name: 'Modifier', exact: true }).click()
    await expect(page.getByLabel("Nom d'utilisateur")).toBeDisabled()
    await expect(page.getByText("Le changement de nom d'utilisateur est désactivé par l'administrateur.")).toBeVisible()
    // Other fields still save.
    await page.getByLabel('Bio').fill('bio')
    await page.getByRole('button', { name: 'Enregistrer' }).click()
    await expect(page.getByText('Profil mis à jour')).toBeVisible()

    const res = await page.request.patch('/api/me', { data: { username: `nope_${uid()}` } })
    expect(res.status()).toBe(403)
    expect((await res.json()).error).toBe('Username changes are not allowed.')
  })

  test('with local login disabled, learners are refused and admins sign in from the folded form', async ({
    page,
    adminRequest,
    createUser,
  }) => {
    const user = await createUser()
    await adminRequest.put('/api/admin/settings', { data: { sso_local_login_enabled: false } })

    await page.goto('/login')
    await expect(page.getByText('La connexion par mot de passe est désactivée.', { exact: false })).toBeVisible()
    await expect(page.getByRole('link', { name: 'Créer un compte' })).toHaveCount(0)
    await page.getByText('Connexion administrateur').click()
    await login(page, user.email, user.password)
    await expect(page.getByText('La connexion par mot de passe est désactivée', { exact: true })).toBeVisible()

    await login(page, 'admin', ADMIN_PASSWORD)
    await expect(page).toHaveURL(/\/admin\/?$/)
  })

  test('settings changes are recorded with their date', async ({ adminRequest }) => {
    await adminRequest.put('/api/admin/settings', { data: { registration_enabled: true } })
    const body = await (await adminRequest.get('/api/admin/settings')).json()
    expect(body.changes.registration_enabled.updatedAt).toBeTruthy()

    const unknown = await adminRequest.put('/api/admin/settings', { data: { nope: true } })
    expect(unknown.status()).toBe(400)
    const empty = await adminRequest.put('/api/admin/settings', { data: {} })
    expect(empty.status()).toBe(400)
  })

  test('OIDC admin groups are authoritative; the client secret is never shown (specs 033, 179)', async ({ page, adminRequest }) => {
    const settings = (await (await adminRequest.get('/api/admin/settings')).json()).settings
    expect(settings.oidc_client_secret).toBe('********')
    // Sending the placeholder back keeps the stored secret: sign-in still works.
    await adminRequest.put('/api/admin/settings', { data: { oidc_client_secret: '********', oidc_group_admins: ['idp-admins'] } })
    const id = uid()
    await fakeIdpUser(id, { sub: `sub-${id}`, email: `boss-${id}@example.test`, name: `Boss ${id}`, groups: ['idp-admins'] })
    await ssoLogin(page, 'oidc', id)
    await expect(page).toHaveURL(/\/admin\/?$/)
    expect((await (await page.request.get('/api/me')).json()).role).toBe('admin')

    // Leaving the admin group demotes at next sign-in.
    await fakeIdpUser(id, { sub: `sub-${id}`, email: `boss-${id}@example.test`, name: `Boss ${id}`, groups: [] })
    await page.context().clearCookies()
    await ssoLogin(page, 'oidc', id)
    await expect(page).toHaveURL(/\/courses$/)
    expect((await (await page.request.get('/api/me')).json()).role).toBe('student')
  })

  test('LDAP sign-in from its tab, with groups; wrong passwords are refused (spec 030)', async ({ page, adminRequest }) => {
    await adminRequest.put('/api/admin/settings', {
      data: {
        ldap_enabled: true,
        ldap_server_url: `ldap://localhost:${LDAP_PORT}`,
        ldap_bind_dn: 'cn=reader,dc=pupitre,dc=test',
        ldap_bind_password: 'reader-secret',
        ldap_user_base_dn: 'ou=people,dc=pupitre,dc=test',
        ldap_user_filter: '(|(uid=%s)(mail=%s))',
        ldap_group_base_dn: 'ou=groups,dc=pupitre,dc=test',
        ldap_group_filter: '(member=%s)',
      },
    })
    const id = uid()
    const group = `ldap-${id}`
    await fetch(`http://localhost:${LDAP_HTTP_PORT}/__fake/people`, {
      method: 'POST',
      body: JSON.stringify({ uid: `jdoe${id}`, mail: `jdoe-${id}@example.test`, cn: `Jane Doe ${id}`, password: 'ldap-pass', groups: [group] }),
    })
    await page.goto('/login')
    await page.getByRole('tab', { name: 'LDAP' }).click()
    const form = page.getByRole('form', { name: 'LDAP' })
    await form.getByLabel('identifiant LDAP').fill(`jdoe${id}`)
    await form.getByLabel('Mot de passe').fill('wrong')
    await form.getByRole('button', { name: 'Se connecter' }).click()
    await expect(page.getByRole('alert')).toHaveText('Identifiants LDAP invalides')
    await form.getByLabel('Mot de passe').fill('ldap-pass')
    await form.getByRole('button', { name: 'Se connecter' }).click()
    await expect(page).toHaveURL(/\/courses$/)
    const me = await (await page.request.get('/api/me')).json()
    expect(me).toMatchObject({ email: `jdoe-${id}@example.test`, name: `Jane Doe ${id}`, hasPassword: false })
    const groups = (await (await page.request.get('/api/my/groups')).json()).groups
    expect(groups.map((g: { name: string }) => g.name)).toEqual([group])

    // The bind password is never shown back.
    expect((await (await adminRequest.get('/api/admin/settings')).json()).settings.ldap_bind_password).toBe('********')
    const disabled = await adminRequest.put('/api/admin/settings', { data: { ldap_enabled: false } })
    expect(disabled.ok()).toBeTruthy()
    const res = await page.request.post('/api/sso/ldap/login', { data: { identifier: `jdoe${id}`, password: 'ldap-pass' } })
    expect(res.status()).toBe(400)
  })

  test('lab policy checks with an OPA server, from the check.yaml of the lab (spec 091)', async ({ page, createCourse, createUser, setModules }) => {
    await signIn(page, { email: 'admin', password: ADMIN_PASSWORD })
    await page.goto('/admin/settings')
    await page.getByLabel('Moteur de politiques').selectOption({ label: 'Serveur OPA (API REST)' })
    await page.getByLabel('URL du serveur OPA').fill(opa)
    await page.getByRole('button', { name: 'Enregistrer' }).first().click()
    await expect(page.getByText('Paramètres enregistrés')).toBeVisible()

    const course = await createCourse()
    await setModules(course.id, [
      { slug: 'mr', name: 'Lab MR', type: 'lab', lab: { provider: 'gitlab' }, content: { kind: 'source', repo: labRepo, ref: 'main', path: 'labs/merge-request/lab.md' } },
    ])
    const learner = await createUser()
    const project = `e-learning/${learner.username}`
    await fake(`http://localhost:${GITLAB_PORT}/__fake/projects`, {
      path: project,
      branches: ['feature/lab'],
      mergeRequests: [
        { title: 'Lab', source_branch: 'feature/lab', commits: ['feat: lab'], pipeline: 'failed' },
        { title: 'Old', source_branch: 'old', state: 'merged' },
      ],
      fileContents: { main: { 'lab.py': 'def main():\n    pass\n' } },
    })
    await opaAnswer(project, { allow: false, violations: ['Le pipeline de la merge request doit réussir'] })

    await page.context().clearCookies()
    await signIn(page, learner)
    await page.request.post(`/api/enrollments/${course.slug}`)
    await page.goto(`/courses/${course.slug}/lessons/mr`)
    const step = page.getByTestId('lab-step-0')
    await expect(step).toContainText('Vérification du lab')
    await step.getByRole('button', { name: 'Vérifier cette étape' }).click()
    await expect(step).toContainText('Le pipeline de la merge request doit réussir')

    // The policy comes from the lab's repository, under its own package; the input is the learner's GitLab project.
    const call = (await opaCalls(project))[0]!
    expect(call.engine).toBe('server')
    expect(call.policy).toMatch(/^package pupitre\.labs\.p[0-9a-f]+$/m)
    expect(call.policy).toContain('violations contains "Le pipeline de la merge request doit réussir"')
    expect(call.input).toEqual({
      project: { id: expect.any(String), name: learner.username, pathWithNamespace: project, defaultBranch: 'main' },
      mergedMrCount: 1,
      openMrs: [{ iid: 1, title: 'Lab', sourceBranch: 'feature/lab', pipelineStatus: 'failed', commits: [{ message: 'feat: lab' }] }],
      files: { 'lab.py': 'def main():\n    pass\n' },
    })

    await opaAnswer(project, { allow: true, violations: [] })
    await step.getByRole('button', { name: 'Vérifier cette étape' }).click()
    await expect(page).toHaveURL(new RegExp(`/courses/${course.slug}$`))
    await expect(page.getByTestId('module-mr')).toContainText('✓ Vu')
  })

  test('lab policy checks with the opa binary; engine and policy errors (spec 091)', async ({ adminRequest, createCourse, createUser, setModules }) => {
    const settings = (data: Record<string, unknown>) => adminRequest.put('/api/admin/settings', { data })
    expect((await settings({ lab_policy_engine: 'cli' })).ok()).toBeTruthy()
    const course = await createCourse()
    const params = { project: 'e-learning/{{username}}', files: ['lab.py'], policy: 'check.rego' }
    await setModules(course.id, [
      {
        slug: 'mr',
        name: 'Lab MR',
        type: 'lab',
        lab: {
          provider: 'gitlab',
          steps: [
            { title: 'Politique', checkType: 'opa_policy', checkParams: params },
            { title: 'Hors du dépôt', checkType: 'opa_policy', checkParams: { ...params, policy: '../../../etc/passwd' } },
          ],
        },
        content: { kind: 'source', repo: labRepo, ref: 'main', path: 'labs/merge-request/lab.md' },
      },
    ])
    const user = await createUser()
    const project = `e-learning/${user.username}`
    await fake(`http://localhost:${GITLAB_PORT}/__fake/projects`, { path: project, fileContents: { main: { 'lab.py': 'def main(): ...' } } })
    await opaAnswer(project, { allow: false, violations: ['Ouvrez une merge request vers la branche par défaut'] })
    const learner = await apiClient()
    await learner.post('/api/auth/sign-in/email', { data: { email: user.email, password: user.password } })
    await learner.post(`/api/enrollments/${course.slug}`)
    const check = (i: number) => learner.post(`/api/courses/${course.slug}/modules/mr/steps/${i}/check`)

    // The binary gets the policy as written (package checker.lab) and capabilities without network builtins.
    expect(await (await check(0)).json()).toMatchObject({ allow: false, violations: ['Ouvrez une merge request vers la branche par défaut'] })
    const call = (await opaCalls(project))[0]!
    expect(call.engine).toBe('cli')
    expect(call.policy).toMatch(/^package checker\.lab$/m)
    expect(call.input.files).toEqual({ 'lab.py': 'def main(): ...' })

    const outside = await check(1)
    expect(outside.status()).toBe(502)
    expect((await outside.json()).error).toBe('Invalid policy path')

    await settings({ lab_policy_engine: 'server', opa_url: 'http://localhost:9' })
    const unreachable = await check(0)
    expect(unreachable.status()).toBe(502)
    expect((await unreachable.json()).error).toMatch(/^OPA server unreachable/)

    await settings({ lab_policy_engine: 'none' })
    expect(await (await check(0)).json()).toMatchObject({ allow: false, violations: ['Moteur de politiques non configuré'] })
    // Engine problems are not recorded as the learner's attempts.
    const { checks } = await (await adminRequest.get(`/api/admin/lab-checks?course=${course.id}`)).json()
    expect(checks).toHaveLength(2)
    await learner.dispose()
  })
})

/**
 * The SSO demo against a real Keycloak (docker/keycloak, `pnpm dev:sso`). Opt-in: start it with
 * `docker compose -f docker/keycloak/compose.yaml up -d --wait`, then
 * `KEYCLOAK_URL=http://localhost:8180 pnpm test:e2e --project global-settings --no-deps -g Keycloak`.
 */
const keycloak = process.env.KEYCLOAK_URL
const KEYCLOAK_MAPPINGS = [
  { groupName: 'pupitre-managers', platformRole: 'manager' },
  { groupName: 'pupitre-admins', platformRole: 'admin' },
]

test.describe('Keycloak SSO demo (specs 027, 134)', () => {
  test.skip(!keycloak, 'needs the Keycloak of docker/keycloak and KEYCLOAK_URL')

  test.beforeEach(async ({ adminRequest }) => {
    // The realm has no `groups` scope: its client mapper puts the groups in every token.
    const settings = {
      oidc_name: 'Keycloak',
      oidc_provider_url: `${keycloak}/realms/pupitre`,
      oidc_client_id: 'pupitre',
      oidc_client_secret: 'pupitre-demo-secret',
      oidc_scopes: 'openid email profile',
    }
    expect((await adminRequest.put('/api/admin/settings', { data: settings })).ok()).toBeTruthy()
    for (const mapping of KEYCLOAK_MAPPINGS) expect((await adminRequest.post('/api/admin/idp-mappings', { data: mapping })).ok()).toBeTruthy()
  })

  test.afterEach(async ({ adminRequest }) => {
    // Back to the e2e run's provider (playwright.config.ts, OIDC_*).
    const fakeIdp = {
      oidc_name: 'Fake IdP',
      oidc_provider_url: `http://localhost:${IDP_PORT}/.well-known/openid-configuration`,
      oidc_client_id: 'pupitre',
      oidc_client_secret: 'e2e-secret',
      oidc_scopes: defaultSettings().oidc_scopes,
    }
    expect((await adminRequest.put('/api/admin/settings', { data: fakeIdp })).ok()).toBeTruthy()
    const { mappings } = (await (await adminRequest.get('/api/admin/idp-mappings')).json()) as { mappings: { id: string; groupName: string }[] }
    for (const m of mappings.filter((m) => KEYCLOAK_MAPPINGS.some((k) => k.groupName === m.groupName))) {
      await adminRequest.delete(`/api/admin/idp-mappings/${m.id}`)
    }
  })

  const accounts = [
    { username: 'etudiant', password: 'Student@1234', name: 'Élise Keycloak', role: 'student', landing: /\/courses$/ },
    { username: 'manager', password: 'Manager@1234', name: 'Marc Keycloak', role: 'manager', landing: /\/courses$/ },
    { username: 'admin', password: 'Admin@1234', name: 'Ada Keycloak', role: 'admin', landing: /\/admin\/?$/ },
  ]
  for (const account of accounts) {
    test(`the demo account ${account.username} signs in through Keycloak as ${account.role}`, async ({ page }) => {
      await page.goto('/login')
      await page.getByRole('link', { name: 'Continuer avec Keycloak' }).click()
      // Keycloak's own login page.
      await page.locator('#username').fill(account.username)
      await page.locator('#password').fill(account.password)
      await page.locator('#kc-login').click()
      await expect(page).toHaveURL(account.landing)
      const me = await (await page.request.get('/api/me')).json()
      expect(me).toMatchObject({ role: account.role, name: account.name, email: `${account.username}@keycloak.pupitre.local` })
    })
  }

  test('a wrong Keycloak password does not sign in', async ({ page }) => {
    await page.goto('/login')
    await page.getByRole('link', { name: 'Continuer avec Keycloak' }).click()
    await page.locator('#username').fill('etudiant')
    await page.locator('#password').fill('wrong-password')
    await page.locator('#kc-login').click()
    await expect(page.getByText('Invalid username or password.')).toBeVisible()
    expect(page.url()).toContain('/realms/pupitre/')
  })
})
