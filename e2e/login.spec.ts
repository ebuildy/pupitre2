import { ADMIN_PASSWORD } from './env.ts'
import { expect, login, test } from './fixtures.ts'

test.describe('login (spec 023)', () => {
  test('a student logs in with their e-mail and lands on the catalogue', async ({ page, createUser }) => {
    const user = await createUser()
    await page.goto('/login')
    await login(page, user.email, user.password)

    await expect(page).toHaveURL(/\/courses$/)
    await expect(page.getByTestId('current-user')).toHaveText(user.username)
    await expect(page.getByRole('link', { name: '⚙ Admin' })).toHaveCount(0)
  })

  test('a student logs in with their username', async ({ page, createUser }) => {
    const user = await createUser()
    await page.goto('/login')
    await login(page, user.username, user.password)

    await expect(page).toHaveURL(/\/courses$/)
    await expect(page.getByTestId('current-user')).toHaveText(user.username)
  })

  test('the bootstrapped admin logs in and lands on /admin (spec 016)', async ({ page }) => {
    await page.goto('/login')
    await login(page, 'admin', ADMIN_PASSWORD)

    await expect(page).toHaveURL(/\/admin$/)
    await expect(page.getByRole('heading', { name: 'Tableau de bord' })).toBeVisible()
  })

  test('empty fields show a validation message', async ({ page }) => {
    await page.goto('/login')
    await page.getByRole('button', { name: 'Se connecter', exact: true }).click()
    await expect(page.getByRole('alert')).toHaveText('Veuillez remplir tous les champs')
  })

  test('wrong password, unknown account and deactivated account get the same error', async ({
    page,
    createUser,
  }) => {
    const user = await createUser()
    const inactive = await createUser({ isActive: false })
    await page.goto('/login')

    for (const [identifier, password] of [
      [user.email, 'wrong-password'],
      ['nobody@example.test', 'Password123!'],
      [inactive.email, inactive.password],
      [inactive.username, inactive.password],
    ] as const) {
      await login(page, identifier, password)
      await expect(page.getByRole('alert')).toHaveText('Identifiant ou mot de passe incorrect')
      await expect(page).toHaveURL(/\/login$/)
    }
  })

  test('an already signed-in user visiting /login is sent to their landing page', async ({ page, createUser }) => {
    const user = await createUser()
    await page.goto('/login')
    await login(page, user.email, user.password)
    await expect(page).toHaveURL(/\/courses$/)

    await page.goto('/login')
    await expect(page).toHaveURL(/\/courses$/)
  })
})

test.describe('login page sections (spec 023)', () => {
  test('SSO, e-mail sign-in and registration are accordion sections, one open at a time', async ({ page }) => {
    await page.goto('/login')
    const sso = page.getByRole('button', { name: 'Connexion SSO' })
    const email = page.getByRole('button', { name: 'Se connecter avec un e-mail' })
    const register = page.getByRole('button', { name: 'Créer un compte avec un e-mail' })
    // E-mail sign-in is open by default; the trigger lists the providers.
    await expect(email).toHaveAttribute('aria-expanded', 'true')
    await expect(sso).toHaveAttribute('aria-expanded', 'false')
    await expect(sso).toContainText('Fake IdP · Corp · GitHub')
    await expect(page.getByLabel('Identifiant ou e-mail')).toBeVisible()
    await expect(page.getByTestId('sso-providers')).toHaveCount(0)

    await sso.click()
    await expect(page.getByRole('link', { name: 'Continuer avec Fake IdP' })).toBeVisible()
    await expect(page.getByLabel('Identifiant ou e-mail')).toHaveCount(0)

    await register.click()
    await expect(page.getByLabel("Nom d'utilisateur")).toBeVisible()
    await expect(page.getByTestId('sso-providers')).toHaveCount(0)

    // Closing the open section leaves them all folded.
    await register.click()
    await expect(page.getByLabel("Nom d'utilisateur")).toHaveCount(0)
    for (const trigger of [sso, email, register]) await expect(trigger).toHaveAttribute('aria-expanded', 'false')
  })

  test('/register opens the registration section; an SSO error opens the SSO one', async ({ page }) => {
    await page.goto('/register')
    await expect(page.getByRole('button', { name: 'Créer un compte avec un e-mail' })).toHaveAttribute('aria-expanded', 'true')
    await expect(page.getByText('Créez votre compte pour commencer')).toBeVisible()

    await page.goto('/login?sso_error=access_denied')
    await expect(page.getByRole('alert')).toHaveText('Accès refusé — vous avez annulé la connexion.')
    await expect(page.getByRole('button', { name: 'Connexion SSO' })).toHaveAttribute('aria-expanded', 'true')
    await expect(page.getByTestId('sso-providers')).toBeVisible()
  })

  test('a demo account signs in whichever section is open (spec 015)', async ({ page }) => {
    await page.goto('/login')
    await page.getByRole('button', { name: 'Connexion SSO' }).click()
    await page.getByRole('button', { name: 'Se connecter en tant que admin' }).click()
    await expect(page).toHaveURL(/\/admin\/?$/)
  })
})

test.describe('redirects and guards (specs 001, 025)', () => {
  test('a protected page sends a visitor to login, then back after login', async ({ page, createUser }) => {
    const user = await createUser()
    await page.goto('/my-courses?tab=done')

    await expect(page).toHaveURL(/\/login\?redirect=%2Fmy-courses%3Ftab%3Ddone$/)
    await login(page, user.email, user.password)
    await expect(page).toHaveURL(/\/my-courses\?tab=done$/)
    await expect(page.getByRole('heading', { name: 'Mes cours' })).toBeVisible()
  })

  test('an external redirect target is ignored', async ({ page, createUser }) => {
    const user = await createUser()
    // Browsers drop tabs and newlines and read "\\" as "/"; dot segments can rebuild "//" (security audit F2).
    for (const target of ['//evil.example', '/\\evil.example', 'https://evil.example', '/\t/evil.example', '/\n/evil.example', '/..//evil.example']) {
      await page.context().clearCookies()
      await page.goto(`/login?redirect=${encodeURIComponent(target)}`)
      await login(page, user.email, user.password)
      await expect(page).toHaveURL(/localhost:\d+\/courses$/)
    }
  })

  test('a student opening /admin sees "Accès refusé"', async ({ page, createUser }) => {
    const user = await createUser()
    await page.goto('/login?redirect=%2Fadmin')
    await login(page, user.email, user.password)

    await expect(page).toHaveURL(/\/admin$/)
    await expect(page.getByRole('heading', { name: 'Accès refusé' })).toBeVisible()
    await page.getByRole('link', { name: 'Retour au catalogue' }).click()
    await expect(page).toHaveURL(/\/courses$/)
  })

  test('/ redirects to the catalogue', async ({ page }) => {
    await page.goto('/')
    await expect(page).toHaveURL(/\/courses$/)
  })
})

test.describe('logout (spec 026)', () => {
  test('logging out returns to /login and ends the session', async ({ page, createUser }) => {
    const user = await createUser()
    await page.goto('/login')
    await login(page, user.email, user.password)
    await expect(page.getByTestId('current-user')).toBeVisible()

    await page.getByRole('button', { name: 'Déconnexion' }).click()
    await expect(page).toHaveURL(/\/login$/)

    await page.goto('/my-courses')
    await expect(page).toHaveURL(/\/login\?redirect=/)
    expect((await page.request.get('/api/me')).status()).toBe(401)
  })
})

test.describe('API guards', () => {
  test('/api/me requires a session and returns the current user (spec 034)', async ({ page, createUser }) => {
    expect((await page.request.get('/api/me')).status()).toBe(401)

    const user = await createUser({ role: 'manager' })
    await page.goto('/login')
    await login(page, user.email, user.password)
    await expect(page).toHaveURL(/\/courses$/)

    const res = await page.request.get('/api/me')
    expect(res.status()).toBe(200)
    expect(await res.json()).toMatchObject({
      username: user.username,
      email: user.email,
      role: 'manager',
      isActive: true,
    })
  })

  test('role and isActive cannot be set at sign-up', async ({ request }) => {
    const email = `sneaky-${Date.now()}@example.test`
    const res = await request.post('/api/auth/sign-up/email', {
      data: { name: 'sneaky', email, password: 'Password123!', role: 'admin', isActive: false },
    })
    // better-auth either rejects the unknown fields or ignores them; it must never grant them.
    if (res.ok()) {
      const me = await request.get('/api/me')
      expect(await me.json()).toMatchObject({ role: 'student', isActive: true })
    } else {
      expect(res.status()).toBe(400)
    }
  })
})
