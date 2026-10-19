import { expect, fakeIdpUser, randomIp, signIn, ssoLogin, test, uid } from './fixtures.ts'

function person(groups: string[] = []) {
  const id = uid()
  return { hint: id, user: { sub: `sub-${id}`, email: `sso-${id}@example.test`, name: `Sso Person ${id}`, groups } }
}

test.describe('SSO sign-in (specs 027–032, 134)', () => {
  test('the login page offers the configured providers', async ({ page }) => {
    await page.goto('/login?redirect=%2Fmy-xp')
    await page.getByRole('button', { name: 'Connexion SSO' }).click()
    const sso = page.getByTestId('sso-providers')
    await expect(sso.getByRole('link', { name: 'Continuer avec Fake IdP' })).toHaveAttribute('href', '/api/sso/oidc/authorize?redirect=%2Fmy-xp')
    await expect(sso.getByRole('link', { name: 'Continuer avec Corp' })).toBeVisible()
    await expect(sso.getByRole('link', { name: 'Continuer avec GitHub' })).toBeVisible()
  })

  test('a new user signs in with OIDC; groups follow the identity provider at each sign-in', async ({ page, adminRequest }) => {
    const first = `idp-a-${uid()}`
    const second = `idp-b-${uid()}`
    const { hint, user } = person([first])
    await fakeIdpUser(hint, user)
    await ssoLogin(page, 'oidc', hint, '/my-groups')
    // The former page redirects to the profile section.
    await expect(page).toHaveURL(/\/profile\?tab=groups$/)
    await expect(page.getByTestId(`my-group-${first}`)).toBeVisible()
    const me = await (await page.request.get('/api/me')).json()
    expect(me).toMatchObject({ email: user.email, name: user.name, role: 'student', hasPassword: false })

    // Same identity next time: same account; the groups are replaced.
    await fakeIdpUser(hint, { ...user, groups: [second] })
    await page.context().clearCookies()
    await ssoLogin(page, 'oidc', hint, '/my-groups')
    await expect(page.getByTestId(`my-group-${second}`)).toBeVisible()
    await expect(page.getByTestId(`my-group-${first}`)).toHaveCount(0)
    expect((await (await page.request.get('/api/me')).json()).id).toBe(me.id)

    const groups = (await (await adminRequest.get('/api/admin/groups')).json()).groups
    expect(groups.find((g: { name: string }) => g.name === first)).toMatchObject({ origin: 'oidc' })

    // SSO-only accounts have no password to change.
    await page.goto('/profile')
    await page.getByRole('button', { name: '🔒 Sécurité' }).click()
    await expect(page.getByText("Votre compte est géré par votre fournisseur d'identité.", { exact: false })).toBeVisible()
  })

  test('group mappings give a platform role and a group role (spec 134)', async ({ page, adminRequest }) => {
    const groupName = `managers-${uid()}`
    expect((await adminRequest.post('/api/admin/idp-mappings', { data: { groupName, platformRole: 'manager', membershipRole: 'manager' } })).ok()).toBeTruthy()
    const { hint, user } = person([groupName])
    await fakeIdpUser(hint, user)
    await ssoLogin(page, 'oidc', hint)
    await expect(page).toHaveURL(/\/courses$/)
    expect((await (await page.request.get('/api/me')).json()).role).toBe('manager')
    await expect(page.getByRole('link', { name: 'Mon espace' }).first()).toBeVisible()
    const scope = await (await page.request.get('/api/manager/scope')).json()
    expect(scope.groups.map((g: { name: string }) => g.name)).toContain(groupName)
  })

  test('groups and mappings with accented names match at every sign-in', async ({ page, adminRequest, createGroup }) => {
    // SQLite's lower() leaves `É` alone: an existing "Équipe …" group must still be found, not created again.
    const groupName = `Équipe Été ${uid()}`
    const group = await createGroup({ name: groupName })
    expect((await adminRequest.post('/api/admin/idp-mappings', { data: { groupName, platformRole: 'manager' } })).ok()).toBeTruthy()
    // Saving the same name again updates the mapping instead of failing on the unique name.
    expect((await adminRequest.post('/api/admin/idp-mappings', { data: { groupName, platformRole: 'manager', membershipRole: 'manager' } })).ok()).toBeTruthy()
    const { hint, user } = person([groupName])
    await fakeIdpUser(hint, user)
    for (let i = 0; i < 2; i++) {
      await page.context().clearCookies()
      await ssoLogin(page, 'oidc', hint)
      await expect(page).toHaveURL(/\/courses$/)
    }
    expect((await (await page.request.get('/api/me')).json()).role).toBe('manager')
    const scope = await (await page.request.get('/api/manager/scope')).json()
    expect(scope.groups.map((g: { id: string }) => g.id)).toContain(group.id)
  })

  test('the SSO demo buttons sign in through the provider in one click (dev only)', async ({ page }) => {
    // The demo accounts of apps/app/src/lib/demo-accounts.ts; the fake IdP checks the password grant.
    await fakeIdpUser('etudiant', { sub: 'demo-etudiant', email: 'etudiant-demo@example.test', name: 'Élise Keycloak', password: 'Student@1234' })
    await page.goto('/login')
    await page.getByRole('button', { name: 'Connexion SSO' }).click()
    const demo = page.getByRole('region', { name: 'Comptes de démonstration Fake IdP' })
    await expect(demo.getByRole('button')).toHaveCount(3)

    // Unknown at the identity provider: refused.
    await demo.getByRole('button', { name: 'Se connecter en tant que Marc Keycloak' }).click()
    await expect(page.getByRole('alert')).toHaveText('Identifiant ou mot de passe incorrect')

    await demo.getByRole('button', { name: 'Se connecter en tant que Élise Keycloak' }).click()
    await expect(page).toHaveURL(/\/courses$/)
    expect(await (await page.request.get('/api/me')).json()).toMatchObject({ email: 'etudiant-demo@example.test', hasPassword: false })

    // Only OIDC providers: GitHub has no password grant.
    const github = await page.request.post('/api/sso/github/demo-login', { data: { username: 'etudiant', password: 'Student@1234' } })
    expect(github.status()).toBe(404)
  })

  test('deploy-time providers: another OIDC issuer and GitHub (spec 027)', async ({ page, browser }) => {
    const corp = person()
    await fakeIdpUser(corp.hint, corp.user)
    await ssoLogin(page, 'corp', corp.hint)
    await expect(page).toHaveURL(/\/courses$/)
    expect((await (await page.request.get('/api/me')).json()).email).toBe(corp.user.email)

    const gh = person()
    await fakeIdpUser(gh.hint, { ...gh.user, sub: String(Date.now()), bio: 'Je code.', picture: 'https://example.test/me.png' })
    const other = await browser.newPage({ extraHTTPHeaders: { 'x-forwarded-for': randomIp() } })
    await ssoLogin(other, 'github', gh.hint)
    await expect(other).toHaveURL(/\/courses$/)
    expect(await (await other.request.get('/api/me')).json()).toMatchObject({ email: gh.user.email, bio: 'Je code.', image: 'https://example.test/me.png' })
    await other.close()
  })

  test('refusals: an existing local account, a cancelled sign-in, a deactivated account, a forged callback', async ({
    page,
    adminRequest,
    createUser,
  }) => {
    const local = await createUser()
    const taken = person()
    await fakeIdpUser(taken.hint, { ...taken.user, email: local.email })
    await ssoLogin(page, 'oidc', taken.hint)
    await expect(page).toHaveURL(/sso_error=conflict/)
    await expect(page.getByRole('alert')).toHaveText('Un compte existe déjà avec cette adresse e-mail et une autre méthode de connexion.')

    const cancelled = person()
    await fakeIdpUser(cancelled.hint, { ...cancelled.user, error: 'access_denied' })
    await ssoLogin(page, 'oidc', cancelled.hint)
    await expect(page.getByRole('alert')).toHaveText('Accès refusé — vous avez annulé la connexion.')

    await page.goto('/api/sso/oidc/callback?code=x&state=forged')
    await expect(page.getByRole('alert')).toHaveText('La demande de connexion a expiré. Veuillez réessayer.')

    const deactivated = person()
    await fakeIdpUser(deactivated.hint, deactivated.user)
    await ssoLogin(page, 'oidc', deactivated.hint)
    const me = await (await page.request.get('/api/me')).json()
    await adminRequest.patch(`/api/admin/users/${me.id}`, { data: { isActive: false } })
    await page.context().clearCookies()
    await ssoLogin(page, 'oidc', deactivated.hint)
    await expect(page.getByRole('alert')).toHaveText('Ce compte est désactivé.')
  })

  test('an SSO sign-in ignores a redirect that would leave the site (security audit F2)', async ({ page }) => {
    const { hint, user } = person()
    await fakeIdpUser(hint, user)
    await ssoLogin(page, 'oidc', hint, '/\t/evil.example')
    await expect(page).toHaveURL(/^http:\/\/localhost:\d+\/courses$/)
    await page.context().clearCookies()
    await ssoLogin(page, 'oidc', hint, '/my-courses?tab=done')
    await expect(page).toHaveURL(/\/my-courses\?tab=done$/)
  })

  test('a local sign-in still works next to SSO', async ({ page, createUser }) => {
    const user = await createUser()
    await signIn(page, user)
    await expect(page.getByTestId('current-user')).toHaveText(user.username)
  })
})
