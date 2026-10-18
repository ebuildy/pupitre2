import { defaultSettings } from '@pupitre/shared'
import { ADMIN_PASSWORD, LDAP_HTTP_PORT, LDAP_PORT } from './env.ts'
import { apiClient, expect, fakeIdpUser, login, signIn, ssoLogin, test, uid } from './fixtures.ts'

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
})
